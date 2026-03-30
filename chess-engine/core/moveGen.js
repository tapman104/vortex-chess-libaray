/**
 * moveGen.js — Pseudo-legal move generation
 *
 * Move encoding (Int32):
 *   bits  0- 5 : from square (0-63)
 *   bits  6-11 : to square   (0-63)
 *   bits 12-15 : flag        (0-15, see FLAGS)
 *   bits 16-18 : promo piece (0-7, only valid when FLAG has PROMO bit set)
 *
 * Pseudo-legal: moves are generated without checking if they leave the king
 * in check. Legality filtering is done in legality.js using attackMap.js.
 */

import { Pieces, Board } from './board.js';

// ═══════════════════════════════════════════════════════════════════
// MOVE ENCODING
// ═══════════════════════════════════════════════════════════════════

export const FLAGS = Object.freeze({
  QUIET:         0,   // 0000 — normal move
  DOUBLE_PUSH:   1,   // 0001 — pawn double push
  CASTLE_K:      2,   // 0010 — kingside castle
  CASTLE_Q:      3,   // 0011 — queenside castle
  CAPTURE:       4,   // 0100 — standard capture
  EP_CAPTURE:    5,   // 0101 — en passant capture
  // 6,7 reserved
  PROMO:         8,   // 1000 — promotion (quiet)
  PROMO_CAPTURE: 12,  // 1100 — promotion + capture
});

// Promo piece codes (3 bits, stored at bits 16-18)
// Use Pieces type values directly (1-6), 0 = not a promo
export const PROMO = Object.freeze({
  KNIGHT: Pieces.WHITE_KNIGHT, // 2
  BISHOP: Pieces.WHITE_BISHOP, // 3
  ROOK:   Pieces.WHITE_ROOK,   // 4
  QUEEN:  Pieces.WHITE_QUEEN,  // 5
});

/** Encode a move into a 32-bit integer */
export function encodeMove(from, to, flag = FLAGS.QUIET, promo = 0) {
  return (from & 0x3F) | ((to & 0x3F) << 6) | ((flag & 0xF) << 12) | ((promo & 0x7) << 16);
}

/** Decode helpers — inline these in hot paths */
export function moveFrom(m)  { return m & 0x3F; }
export function moveTo(m)    { return (m >>> 6) & 0x3F; }
export function moveFlag(m)  { return (m >>> 12) & 0xF; }
export function movePromo(m) { return (m >>> 16) & 0x7; }

export function isCapture(m)  { return (moveFlag(m) & FLAGS.CAPTURE) !== 0; }
export function isPromo(m)    { return (moveFlag(m) & FLAGS.PROMO) !== 0; }
export function isCastle(m)   { const f = moveFlag(m); return f === FLAGS.CASTLE_K || f === FLAGS.CASTLE_Q; }
export function isEP(m)       { return moveFlag(m) === FLAGS.EP_CAPTURE; }


// ═══════════════════════════════════════════════════════════════════
// MOVE LIST
// ═══════════════════════════════════════════════════════════════════

const MOVE_LIST_CAPACITY = 256; // max pseudo-legal moves in any position

/**
 * Reusable move list backed by a pre-allocated Int32Array.
 * Avoids GC pressure in search. Reset with .clear() each node.
 */
export class MoveList {
  constructor(capacity = MOVE_LIST_CAPACITY) {
    this.moves = new Int32Array(capacity);
    this.count = 0;
  }

  push(move) {
    this.moves[this.count++] = move;
  }

  clear() {
    this.count = 0;
  }

  /** Iterate: for (let i = 0; i < list.count; i++) list.moves[i] */
  [Symbol.iterator]() {
    let i = 0;
    return {
      next: () => i < this.count
        ? { value: this.moves[i++], done: false }
        : { done: true },
    };
  }
}


// ═══════════════════════════════════════════════════════════════════
// DIRECTION TABLES
// ═══════════════════════════════════════════════════════════════════

// Offsets for sliding pieces. Wrap-guard is handled by file-delta check.
export const ROOK_DIRS   = [1, -1, 8, -8];
export const BISHOP_DIRS = [9, -9, 7, -7];
export const QUEEN_DIRS  = [1, -1, 8, -8, 9, -9, 7, -7];
const KNIGHT_DELTAS = [
  [2, 1], [2, -1], [-2, 1], [-2, -1],
  [1, 2], [1, -2], [-1, 2], [-1, -2],
];
const KING_DELTAS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// Pre-compute knight/king target tables for O(1) lookup
// Each entry is an array of valid target indices from that square
export const KNIGHT_TARGETS = new Array(64);
export const KING_TARGETS   = new Array(64);

for (let idx = 0; idx < 64; idx++) {
  const f = idx & 7;
  const r = idx >> 3;
  KNIGHT_TARGETS[idx] = [];
  KING_TARGETS[idx]   = [];

  for (const [df, dr] of KNIGHT_DELTAS) {
    const nf = f + df, nr = r + dr;
    if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
      KNIGHT_TARGETS[idx].push(nf + (nr << 3));
    }
  }
  for (const [df, dr] of KING_DELTAS) {
    const nf = f + df, nr = r + dr;
    if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
      KING_TARGETS[idx].push(nf + (nr << 3));
    }
  }
}


// ═══════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate all pseudo-legal moves for the side to move.
 *
 * @param {Board} board
 * @param {object} state — gameState: { turn, castling, epSquare }
 *   castling: { K, Q, k, q } — boolean flags (rights remaining)
 *   epSquare: number|null — target square index for en passant
 * @param {MoveList} list — caller-owned, will be cleared and populated
 */
export function generateMoves(board, state, list) {
  list.clear();

  const color   = state.turn;          // 'white' | 'black'
  const isWhite = color === 'white';

  for (const from of board.getPieces(color)) {
    const piece = board.getByIndex(from);
    const type  = Board.type(piece);

    switch (type) {
      case Pieces.WHITE_PAWN:   genPawnMoves(board, state, from, isWhite, list);   break;
      case Pieces.WHITE_KNIGHT: genKnightMoves(board, from, isWhite, list);        break;
      case Pieces.WHITE_BISHOP: genSlidingMoves(board, from, isWhite, BISHOP_DIRS, list); break;
      case Pieces.WHITE_ROOK:   genSlidingMoves(board, from, isWhite, ROOK_DIRS,   list); break;
      case Pieces.WHITE_QUEEN:  genSlidingMoves(board, from, isWhite, QUEEN_DIRS,  list); break;
      case Pieces.WHITE_KING:   genKingMoves(board, state, from, isWhite, list);   break;
    }
  }
}


// ═══════════════════════════════════════════════════════════════════
// PIECE GENERATORS
// ═══════════════════════════════════════════════════════════════════

/** Pawn moves: pushes, double push, captures, en passant, promotions */
function genPawnMoves(board, state, from, isWhite, list) {
  const rank     = from >> 3;
  const dir      = isWhite ? 8 : -8;
  const startR   = isWhite ? 1 : 6;
  const promoR   = isWhite ? 6 : 1; // rank BEFORE promotion rank
  const color    = isWhite ? 'white' : 'black';

  // Single push
  const one = from + dir;
  if (one >= 0 && one < 64 && !board.hasPiece(one)) {
    if (rank === promoR) {
      pushPromos(from, one, FLAGS.PROMO, list);
    } else {
      list.push(encodeMove(from, one, FLAGS.QUIET));
    }

    // Double push (only if single push square is clear)
    if (rank === startR) {
      const two = from + dir * 2;
      if (!board.hasPiece(two)) {
        list.push(encodeMove(from, two, FLAGS.DOUBLE_PUSH));
      }
    }
  }

  // Captures (diagonal)
  const fromFile = from & 7;
  for (const capDir of (isWhite ? [7, 9] : [-7, -9])) {
    const to     = from + capDir;
    const toFile = to & 7;
    // Wrap guard: file must differ by exactly 1
    if (Math.abs(fromFile - toFile) !== 1) continue;
    if (to < 0 || to >= 64) continue;

    if (board.isEnemy(to, color)) {
      if (rank === promoR) {
        pushPromos(from, to, FLAGS.PROMO_CAPTURE, list);
      } else {
        list.push(encodeMove(from, to, FLAGS.CAPTURE));
      }
    }

    // En passant
    if (state.epSquare !== null && to === state.epSquare) {
      list.push(encodeMove(from, to, FLAGS.EP_CAPTURE));
    }
  }
}

/** Push all 4 promotion variants for a pawn move */
function pushPromos(from, to, flag, list) {
  list.push(encodeMove(from, to, flag, PROMO.QUEEN));
  list.push(encodeMove(from, to, flag, PROMO.ROOK));
  list.push(encodeMove(from, to, flag, PROMO.BISHOP));
  list.push(encodeMove(from, to, flag, PROMO.KNIGHT));
}

/** Knight moves */
function genKnightMoves(board, from, isWhite, list) {
  const color = isWhite ? 'white' : 'black';
  for (const to of KNIGHT_TARGETS[from]) {
    if (!board.isColor_fast(to, color)) { // not occupied by own piece
      const flag = board.hasPiece(to) ? FLAGS.CAPTURE : FLAGS.QUIET;
      list.push(encodeMove(from, to, flag));
    }
  }
}

/** Sliding moves (bishop, rook, queen) */
function genSlidingMoves(board, from, isWhite, dirs, list) {
  const color   = isWhite ? 'white' : 'black';
  const fromF   = from & 7;

  for (const dir of dirs) {
    let sq = from;

    while (true) {
      const prevF = sq & 7;
      sq += dir;

      // Off-board
      if (sq < 0 || sq >= 64) break;

      // Wrap guard: horizontal dirs (±1) must not cross file boundary
      const curF = sq & 7;
      if (Math.abs(dir) === 1 && Math.abs(prevF - curF) !== 1) break;
      // Diagonal dirs wrap guard
      if ((dir === 9 || dir === -7) && curF < prevF) break; // crossed a→h boundary
      if ((dir === 7 || dir === -9) && curF > prevF) break; // crossed h→a boundary

      const target = board.getByIndex(sq);
      if (target === Pieces.EMPTY) {
        list.push(encodeMove(from, sq, FLAGS.QUIET));
      } else {
        if (Board.color(target) !== color) {
          list.push(encodeMove(from, sq, FLAGS.CAPTURE));
        }
        break; // blocked regardless
      }
    }
  }
}

/** King moves including castling */
function genKingMoves(board, state, from, isWhite, list) {
  const color = isWhite ? 'white' : 'black';

  // Normal moves
  for (const to of KING_TARGETS[from]) {
    const target = board.getByIndex(to);
    if (target === Pieces.EMPTY) {
      list.push(encodeMove(from, to, FLAGS.QUIET));
    } else if (Board.color(target) !== color) {
      list.push(encodeMove(from, to, FLAGS.CAPTURE));
    }
  }

  // Castling — rights check only; legality.js must verify no check/attacks
  if (isWhite) {
    // Kingside: e1=4, f1=5, g1=6 must be empty
    if (state.castling.K && !board.hasPiece(5) && !board.hasPiece(6)) {
      list.push(encodeMove(from, 6, FLAGS.CASTLE_K));
    }
    // Queenside: e1=4, d1=3, c1=2 must be empty (b1=1 also needs to be empty)
    if (state.castling.Q && !board.hasPiece(3) && !board.hasPiece(2) && !board.hasPiece(1)) {
      list.push(encodeMove(from, 2, FLAGS.CASTLE_Q));
    }
  } else {
    // Kingside: e8=60, f8=61, g8=62 must be empty
    if (state.castling.k && !board.hasPiece(61) && !board.hasPiece(62)) {
      list.push(encodeMove(from, 62, FLAGS.CASTLE_K));
    }
    // Queenside: e8=60, d8=59, c8=58 must be empty (b8=57 also)
    if (state.castling.q && !board.hasPiece(59) && !board.hasPiece(58) && !board.hasPiece(57)) {
      list.push(encodeMove(from, 58, FLAGS.CASTLE_Q));
    }
  }
}


// ═══════════════════════════════════════════════════════════════════
// BOARD EXTENSION — add isColor_fast for hot path use
// ═══════════════════════════════════════════════════════════════════
// Patch Board prototype once (avoids object allocation in hot loop)
// Alternative: inline `board.squares[to] > 0` etc. in each generator.
if (!Board.prototype.isColor_fast) {
  Board.prototype.isColor_fast = function(idx, color) {
    const p = this.squares[idx];
    if (p === 0) return false;
    return color === 'white' ? p > 0 : p < 0;
  };
}
