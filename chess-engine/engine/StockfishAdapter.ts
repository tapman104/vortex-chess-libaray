import { Chess } from '../api/chess.js';
import { 
  EngineAdapter, 
  BestMoveOptions, 
  AnalysisResult, 
  UnsupportedVariantError 
} from './EngineAdapter.js';

export interface StockfishConfig {
  /** Path to the Stockfish Worker script. */
  workerPath?: string;
  /** Existing Worker instance to use. */
  worker?: Worker;
}

/**
 * Adapter for the Stockfish chess engine running in a Web Worker.
 */
export class StockfishAdapter implements EngineAdapter {
  private _worker: Worker | null = null;
  private _config: StockfishConfig;
  private _isReady = false;
  private _pendingPromise: { 
    resolve: (val: AnalysisResult) => void; 
    reject: (err: any) => void;
  } | null = null;

  constructor(config: StockfishConfig = {}) {
    this._config = config;
  }

  /**
   * Initializes the Stockfish worker and sends the 'uci' command.
   * Resolves when 'uciok' is received.
   */
  async connect(): Promise<void> {
    if (this._worker) return;

    if (this._config.worker) {
      this._worker = this._config.worker;
    } else if (this._config.workerPath) {
      this._worker = new Worker(this._config.workerPath);
    } else {
      throw new Error('StockfishAdapter: No worker or workerPath provided.');
    }

    return new Promise((resolve, reject) => {
      const initHandler = (e: MessageEvent) => {
        const msg = e.data;
        if (typeof msg !== 'string') return;
        
        if (msg === 'uciok') {
          this._isReady = true;
          this._worker?.removeEventListener('message', initHandler);
          resolve();
        }
      };

      const timeout = setTimeout(() => {
        this._worker?.removeEventListener('message', initHandler);
        reject(new Error('Stockfish initialization timed out (5s)'));
      }, 5000);

      this._worker!.addEventListener('message', initHandler);
      this._worker!.postMessage('uci');
    });
  }

  /**
   * Terminates the worker and resets state.
   */
  async disconnect(): Promise<void> {
    this._worker?.terminate();
    this._worker = null;
    this._isReady = false;
    if (this._pendingPromise) {
      this._pendingPromise.reject(new Error('Engine disconnected during search.'));
      this._pendingPromise = null;
    }
  }

  /**
   * Search for the best move in the current game position.
   */
  async getBestMove(game: Chess, options: BestMoveOptions = {}): Promise<AnalysisResult> {
    if (game.variant() !== 'standard@v1') {
      throw new UnsupportedVariantError(game.variant());
    }

    if (!this._worker || !this._isReady) {
      throw new Error('Stockfish not connected. Call connect() first.');
    }

    if (this._pendingPromise) {
      throw new Error('Another search is already in progress.');
    }

    const fen = game.fen();
    this._worker.postMessage(`position fen ${fen}`);

    let goCmd = 'go';
    if (options.depth) goCmd += ` depth ${options.depth}`;
    if (options.movetime) goCmd += ` movetime ${options.movetime}`;
    if (options.nodes) goCmd += ` nodes ${options.nodes}`;
    if (goCmd === 'go') goCmd += ' depth 15'; // default depth

    return new Promise((resolve, reject) => {
      this._pendingPromise = { resolve, reject };
      let lastDepth = 0;
      let lastEval = 0;

      const handler = (e: MessageEvent) => {
        const msg = e.data;
        if (typeof msg !== 'string') return;

        // Parse info messages for evaluation and depth
        if (msg.startsWith('info')) {
          const depthMatch = msg.match(/depth (\d+)/);
          const cpMatch = msg.match(/score cp (-?\d+)/);
          const mateMatch = msg.match(/score mate (-?\d+)/);
          
          if (depthMatch) lastDepth = parseInt(depthMatch[1]);
          if (cpMatch) lastEval = parseInt(cpMatch[1]);
          if (mateMatch) {
            const mateIn = parseInt(mateMatch[1]);
            lastEval = mateIn > 0 ? 100000 - mateIn : -100000 - mateIn;
          }
          return;
        }

        // Parse bestmove result
        if (msg.startsWith('bestmove')) {
          const parts = msg.split(' ');
          const bestmoveUci = parts[1];
          const ponderUci = parts[3];

          this._pendingPromise = null;
          this._worker?.removeEventListener('message', handler);

          try {
            const result: AnalysisResult = {
              bestMove: this._uciToSan(game, bestmoveUci),
              depth: lastDepth,
              evaluation: lastEval,
            };

            if (ponderUci && ponderUci !== '(none)') {
              // To get Ponder SAN, we need to apply the best move first
              const clone = game.clone();
              try {
                clone.move(result.bestMove);
                result.ponder = this._uciToSan(clone, ponderUci);
              } catch {
                result.ponder = ponderUci; // Fallback to UCI
              }
            }

            resolve(result);
          } catch (err) {
            reject(err);
          }
        }
      };

      this._worker!.addEventListener('message', handler);
      this._worker!.postMessage(goCmd);
    });
  }

  /**
   * Converts a UCI move string (e.g. "e2e4") to SAN using a game instance.
   */
  private _uciToSan(game: Chess, uci: string): string {
    if (!uci || uci === '(none)') return '';
    
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.length > 4 ? uci[4] : undefined;

    // We look for a match in the legal moves list
    const moves = game.moves({ verbose: true }) as any[];
    const match = moves.find(m => 
      m.from === from && 
      m.to === to && 
      (!promo || m.promotion === (promo === 'q' ? 'q' : promo)) // UCI promo is usually lowercase
    );
    
    if (match) return match.san;
    
    // If no match found (e.g. invalid move returned by engine?), return original UCI
    return uci;
  }
}
