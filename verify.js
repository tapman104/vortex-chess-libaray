import { Board, GameState, getLegalMoves, makeMove, unmakeMove } from './chess-engine/index.js';

const board = new Board();
board.setup();
const state = new GameState();

/**
 * Performance test (Perft) — node counting at a given depth.
 * Verifies move generation + make/unmake correctness.
 */
function perft(depth) {
  if (depth === 0) return 1;
  const moves = getLegalMoves(board, state);
  let nodes = 0;
  for (let i = 0; i < moves.count; i++) {
    const move = moves.moves[i];
    const undo = makeMove(board, state, move);
    nodes += perft(depth - 1);
    unmakeMove(board, state, move, undo);
  }
  return nodes;
}

try {
  console.log('Testing initial position...');
  
  console.time('perft1');
  const d1 = perft(1);
  console.timeEnd('perft1');
  console.log(`Perft depth 1: ${d1} (Expected: 20)`);
  if (d1 !== 20) throw new Error('FAILED perft 1');

  console.time('perft2');
  const d2 = perft(2);
  console.timeEnd('perft2');
  console.log(`Perft depth 2: ${d2} (Expected: 400)`);
  if (d2 !== 400) throw new Error('FAILED perft 2');

  console.time('perft3');
  const d3 = perft(3);
  console.timeEnd('perft3');
  console.log(`Perft depth 3: ${d3} (Expected: 8902)`);
  if (d3 !== 8902) throw new Error('FAILED perft 3');

  console.log('Verification PASSED! Core engine is stable.');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
