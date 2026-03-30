// Core Board and Move Generation
export { Pieces, Board } from './core/board.js';
export {
  FLAGS,
  PROMO,
  MoveList,
  generateMoves,
  encodeMove,
  moveFrom,
  moveTo,
  moveFlag,
  movePromo,
  isCapture,
  isPromo,
  isCastle,
  isEP
} from './core/moveGen.js';

// State Management
export { GameState } from './state/gameState.js';

// Move Execution
export { makeMove, unmakeMove } from './core/makeMove.js';

// Attack Detection and Legality
export { isSquareAttacked } from './core/attackMap.js';
export { getLegalMoves, isMoveLegal, findKing, inCheck } from './core/legality.js';

// Hashing
export { computeHash } from './core/zobrist.js';
