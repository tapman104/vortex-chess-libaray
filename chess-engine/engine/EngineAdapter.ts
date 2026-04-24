import { Chess } from '../api/chess.js';

/**
 * Options for a best move request.
 */
export interface BestMoveOptions {
  /** Search depth in half-moves. */
  depth?: number;
  /** Search time in milliseconds. */
  movetime?: number;
  /** Number of nodes to search. */
  nodes?: number;
}

/**
 * Result of an engine search.
 */
export interface AnalysisResult {
  /** The best move found, in SAN format. */
  bestMove: string;
  /** The predicted continuation move (ponder). */
  ponder?: string;
  /** Evaluation in centipawns (positive for white/red, negative for black). */
  evaluation?: number;
  /** Depth reached during search. */
  depth?: number;
}

/**
 * Error thrown when an engine is used with an incompatible chess variant.
 */
export class UnsupportedVariantError extends Error {
  constructor(variant: string) {
    super(`Engine does not support variant: ${variant}`);
    this.name = 'UnsupportedVariantError';
  }
}

/**
 * Base interface for chess engine adapters (e.g., Stockfish).
 */
export interface EngineAdapter {
  /** Initialize the engine (e.g., start Worker, send 'uci'). */
  connect(): Promise<void>;
  /** Shut down the engine and release resources. */
  disconnect(): Promise<void>;
  /** Request the best move for the current position of the given game. */
  getBestMove(game: Chess, options?: BestMoveOptions): Promise<AnalysisResult>;
}
