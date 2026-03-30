import { Pieces, Board } from './board.js';
import { KNIGHT_TARGETS, ROOK_DIRS, BISHOP_DIRS, KING_TARGETS } from './moveGen.js';

/**
 * Checks if a square is attacked by any piece of the given color.
 * Useful for king safety, castling rules, and move legality.
 *
 * @param {Board} board
 * @param {number} sq — Target square index (0-63)
 * @param {'white'|'black'} attackerColor
 * @returns {boolean}
 */
export function isSquareAttacked(board, sq, attackerColor) {
  const isWhiteAttacker = attackerColor === 'white';
  const sqF = sq & 7;

  // 1. KNIGHTS
  const knight = isWhiteAttacker ? Pieces.WHITE_KNIGHT : Pieces.BLACK_KNIGHT;
  for (const from of KNIGHT_TARGETS[sq]) {
    if (board.getByIndex(from) === knight) return true;
  }

  // 2. KINGS (Kings cannot move into each other's field)
  const king = isWhiteAttacker ? Pieces.WHITE_KING : Pieces.BLACK_KING;
  for (const from of KING_TARGETS[sq]) {
    if (board.getByIndex(from) === king) return true;
  }

  // 3. PAWNS
  // A square is attacked by a White pawn if there is a White pawn
  // at the squares that White pawns attack FROM (relative to 'sq').
  // White pawns at (sq-7) or (sq-9) attack 'sq'.
  const pawn = isWhiteAttacker ? Pieces.WHITE_PAWN : Pieces.BLACK_PAWN;
  const pawnSources = isWhiteAttacker ? [sq - 7, sq - 9] : [sq + 7, sq + 9];
  for (const fromIdx of pawnSources) {
    if (fromIdx >= 0 && fromIdx < 64 && Math.abs((fromIdx & 7) - sqF) === 1) {
      if (board.getByIndex(fromIdx) === pawn) return true;
    }
  }

  // 4. SLIDING PIECES (Rook, Bishop, Queen)
  const r = isWhiteAttacker ? Pieces.WHITE_ROOK : Pieces.BLACK_ROOK;
  const b = isWhiteAttacker ? Pieces.WHITE_BISHOP : Pieces.BLACK_BISHOP;
  const q = isWhiteAttacker ? Pieces.WHITE_QUEEN : Pieces.BLACK_QUEEN;

  // Rook/Queen rays
  if (isRayAttacked(board, sq, ROOK_DIRS, r, q)) return true;
  // Bishop/Queen rays
  if (isRayAttacked(board, sq, BISHOP_DIRS, b, q)) return true;

  return false;
}

/**
 * Helper: Radiate from a square along directions to see if an attacker is hit.
 * @private
 */
function isRayAttacked(board, startSq, dirs, p1, p2) {
  for (const dir of dirs) {
    let sq = startSq;
    while (true) {
      const prevF = sq & 7;
      sq += dir;
      if (sq < 0 || sq >= 64) break;

      // Wrap-around protection
      const curF = sq & 7;
      if (Math.abs(dir) === 1 && Math.abs(prevF - curF) !== 1) break;
      if ((dir === 9 || dir === -7) && curF < prevF) break;
      if ((dir === 7 || dir === -9) && curF > prevF) break;

      const piece = board.getByIndex(sq);
      if (piece !== Pieces.EMPTY) {
        if (piece === p1 || piece === p2) return true;
        break; // ray blocked by another piece
      }
    }
  }
  return false;
}
