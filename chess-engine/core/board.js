/**
 * Piece constants — Frozen to prevent mutation
 * Positive = White, Negative = Black
 */
export const Pieces = Object.freeze({
  EMPTY: 0,
  WHITE_PAWN: 1,
  WHITE_KNIGHT: 2,
  WHITE_BISHOP: 3,
  WHITE_ROOK: 4,
  WHITE_QUEEN: 5,
  WHITE_KING: 6,
  BLACK_PAWN: -1,
  BLACK_KNIGHT: -2,
  BLACK_BISHOP: -3,
  BLACK_ROOK: -4,
  BLACK_QUEEN: -5,
  BLACK_KING: -6,
});

const SYMBOLS = Object.freeze({
  [Pieces.WHITE_PAWN]: '♙', [Pieces.WHITE_KNIGHT]: '♘', [Pieces.WHITE_BISHOP]: '♗',
  [Pieces.WHITE_ROOK]: '♖', [Pieces.WHITE_QUEEN]: '♕', [Pieces.WHITE_KING]: '♔',
  [Pieces.BLACK_PAWN]: '♟', [Pieces.BLACK_KNIGHT]: '♞', [Pieces.BLACK_BISHOP]: '♝',
  [Pieces.BLACK_ROOK]: '♜', [Pieces.BLACK_QUEEN]: '♛', [Pieces.BLACK_KING]: '♚',
  [Pieces.EMPTY]: '·',
});

/**
 * Board — Engine-grade state container
 *
 * Design:
 *   Internal: Always 0-63 indices (Int8Array) — fast for move gen
 *   External: Optional algebraic notation API — convenience for UIs/FEN
 *   Zero tolerance: Invalid inputs throw immediately (fail fast)
 *
 * pieceList: Two Sets (white/black) of occupied indices.
 *   Avoids full-board scans in move gen. Keep in sync via setByIndex/removeByIndex.
 */
export class Board {
  constructor() {
    // 64-square array (a1=0, h8=63)
    // Int8Array: 8-bit signed, fast clone, cache-friendly
    this.squares = new Int8Array(64);

    // Piece lists — avoid O(64) scans in move gen
    this.pieceList = {
      white: new Set(), // indices of all white pieces
      black: new Set(), // indices of all black pieces
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ENGINE LAYER — Use these in hot paths (move gen, search)
  // All methods assume valid indices (0-63). Performance critical.
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get piece by index (0-63). No validation — fast.
   * @param {number} idx — Must be 0-63
   */
  getByIndex(idx) {
    return this.squares[idx];
  }

  /**
   * Set piece by index. Keeps pieceList in sync.
   * @param {number} idx — Must be 0-63
   * @param {number} piece
   */
  setByIndex(idx, piece) {
    // Remove from whichever list currently owns this square
    const prev = this.squares[idx];
    if (prev > 0) this.pieceList.white.delete(idx);
    else if (prev < 0) this.pieceList.black.delete(idx);

    this.squares[idx] = piece;

    // Add to new owner's list
    if (piece > 0) this.pieceList.white.add(idx);
    else if (piece < 0) this.pieceList.black.add(idx);
  }

  /**
   * Remove piece by index. Keeps pieceList in sync.
   */
  removeByIndex(idx) {
    this.setByIndex(idx, Pieces.EMPTY);
  }

  /**
   * Fast helper to get the color of the piece at a given index.
   * @returns {'white'|'black'|null}
   */
  getColorAt(idx) {
    const p = this.squares[idx];
    return p === 0 ? null : (p > 0 ? 'white' : 'black');
  }

  /**
   * Fast helper to check if a square is occupied.
   */
  hasPiece(idx) {
    return this.squares[idx] !== Pieces.EMPTY;
  }

  /**
   * Fast helper to check if a square contains an enemy piece.
   */
  isEnemy(idx, color) {
    const p = this.squares[idx];
    if (p === Pieces.EMPTY) return false;
    return color === 'white' ? p < 0 : p > 0;
  }

  /**
   * Iterate all pieces for a given color.
   * Prefer this over scanning squares[] in move gen.
   * @param {'white'|'black'} color
   * @returns {Set<number>}
   */
  getPieces(color) {
    return this.pieceList[color];
  }

  // ═══════════════════════════════════════════════════════════════════
  // API LAYER — Input validation, algebraic notation, safety
  // Use for UI, FEN parsing, user input — slower but safe
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get piece at square (algebraic 'e4' or index).
   * Validates input, throws on invalid.
   */
  get(sq) {
    const idx = this._toIndex(sq);
    this._assertOnBoard(idx, sq);
    return this.squares[idx];
  }

  /**
   * Set piece at square (algebraic or index). Keeps pieceList in sync.
   */
  set(sq, piece) {
    const idx = this._toIndex(sq);
    this._assertOnBoard(idx, sq);
    this.setByIndex(idx, piece); // route through setByIndex to sync pieceList
  }

  /**
   * Remove piece from square.
   */
  remove(sq) {
    this.set(sq, Pieces.EMPTY);
  }

  // ═══════════════════════════════════════════════════════════════════
  // VALIDATION & CONVERSION
  // ═══════════════════════════════════════════════════════════════════

  /** @private */
  _toIndex(sq) {
    if (typeof sq === 'number') return sq;
    if (typeof sq === 'string') return Board.algebraicToIndex(sq);
    throw new Error(`Square must be string (algebraic) or number (index), got ${typeof sq}`);
  }

  /** @private */
  _assertOnBoard(idx, originalInput) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= 64) {
      throw new Error(`Square out of bounds: ${originalInput} (resolved to ${idx})`);
    }
  }

  /**
   * Public validation — accepts both forms.
   */
  isOnBoard(sq) {
    if (typeof sq === 'number') return Number.isInteger(sq) && sq >= 0 && sq < 64;
    if (typeof sq === 'string') return /^[a-h][1-8]$/.test(sq);
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // BOARD STATE OPS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Deep clone — essential for move simulation/search.
   * pieceLists are reconstructed from squares to stay in sync.
   */
  clone() {
    const copy = new Board();
    copy.squares = new Int8Array(this.squares);
    // Rebuild pieceLists from the cloned squares
    for (let i = 0; i < 64; i++) {
      const p = copy.squares[i];
      if (p > 0) copy.pieceList.white.add(i);
      else if (p < 0) copy.pieceList.black.add(i);
    }
    return copy;
  }

  clear() {
    this.squares.fill(Pieces.EMPTY);
    this.pieceList.white.clear();
    this.pieceList.black.clear();
  }

  /**
   * Standard starting position.
   */
  setup() {
    this.clear();

    // Pawns: White rank 2 (indices 8-15), Black rank 7 (indices 48-55)
    for (let file = 0; file < 8; file++) {
      this.squares[file + 8]  = Pieces.WHITE_PAWN;
      this.squares[file + 48] = Pieces.BLACK_PAWN;
      this.pieceList.white.add(file + 8);
      this.pieceList.black.add(file + 48);
    }

    const whiteBack = [
      Pieces.WHITE_ROOK, Pieces.WHITE_KNIGHT, Pieces.WHITE_BISHOP, Pieces.WHITE_QUEEN,
      Pieces.WHITE_KING, Pieces.WHITE_BISHOP, Pieces.WHITE_KNIGHT, Pieces.WHITE_ROOK,
    ];
    const blackBack = [
      Pieces.BLACK_ROOK, Pieces.BLACK_KNIGHT, Pieces.BLACK_BISHOP, Pieces.BLACK_QUEEN,
      Pieces.BLACK_KING, Pieces.BLACK_BISHOP, Pieces.BLACK_KNIGHT, Pieces.BLACK_ROOK,
    ];

    for (let file = 0; file < 8; file++) {
      this.squares[file]      = whiteBack[file];
      this.squares[file + 56] = blackBack[file];
      this.pieceList.white.add(file);
      this.pieceList.black.add(file + 56);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STATIC UTILITIES — Geometry & Piece analysis
  // ═══════════════════════════════════════════════════════════════════

  /** File (0-7) from index. */
  static file(idx) { return idx & 7; }

  /** Rank (0-7) from index. */
  static rank(idx) { return idx >> 3; }

  /**
   * Convert algebraic to index with strict validation.
   * 'a1' -> 0, 'h8' -> 63
   * @throws {Error} On invalid format
   */
  static algebraicToIndex(alg) {
    if (typeof alg !== 'string' || alg.length !== 2) {
      throw new Error(`Invalid algebraic square format: ${alg}`);
    }
    const file = alg.charCodeAt(0) - 97; // 'a' = 97
    const rank  = alg.charCodeAt(1) - 49; // '1' = 49
    if (file < 0 || file > 7 || rank < 0 || rank > 7) {
      throw new Error(`Invalid algebraic square: ${alg}`);
    }
    return file + (rank << 3);
  }

  /**
   * Convert index to algebraic.
   * 0 -> 'a1', 63 -> 'h8'
   */
  static indexToAlgebraic(idx) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= 64) {
      throw new Error(`Invalid index for algebraic conversion: ${idx}`);
    }
    return String.fromCharCode(97 + (idx & 7)) + ((idx >> 3) + 1);
  }

  /**
   * Get color of piece.
   * @returns {'white'|'black'|null} null if empty
   */
  static color(piece) {
    if (piece === Pieces.EMPTY) return null;
    return piece > 0 ? 'white' : 'black';
  }

  /**
   * Get piece type (absolute value).
   * @returns {number} 1-6 (PAWN-KING), 0 if empty
   */
  static type(piece) {
    return piece === 0 ? 0 : Math.abs(piece);
  }

  /**
   * Check if piece belongs to side.
   */
  static isColor(piece, color) {
    if (piece === Pieces.EMPTY) return false;
    if (color === 'white') return piece > 0;
    if (color === 'black') return piece < 0;
    return false;
  }

  /**
   * Chebyshev distance between two indices.
   * = max(|Δfile|, |Δrank|)
   * Use this for king range checks, attack map radius, etc.
   */
  static distance(idx1, idx2) {
    if (!Number.isInteger(idx1) || !Number.isInteger(idx2)) {
      throw new Error('distance() requires integer indices');
    }
    const df = Math.abs((idx1 & 7)  - (idx2 & 7));
    const dr = Math.abs((idx1 >> 3) - (idx2 >> 3));
    return Math.max(df, dr);
  }

  /**
   * Manhattan distance between two indices.
   * = |Δfile| + |Δrank|
   * Useful for heuristics; NOT for king/attack range (use distance()).
   */
  static manhattanDistance(idx1, idx2) {
    if (!Number.isInteger(idx1) || !Number.isInteger(idx2)) {
      throw new Error('manhattanDistance() requires integer indices');
    }
    return Math.abs((idx1 & 7) - (idx2 & 7)) + Math.abs((idx1 >> 3) - (idx2 >> 3));
  }

  // ═══════════════════════════════════════════════════════════════════
  // DEBUGGING
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Unicode board visualization.
   */
  toString() {
    const rows = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = `${rank + 1} │`;
      for (let file = 0; file < 8; file++) {
        row += ` ${SYMBOLS[this.squares[file + (rank << 3)]]}`;
      }
      rows.push(row);
    }
    return [
      '    a b c d e f g h',
      '  ┌────────────────',
      ...rows,
      '  └────────────────',
    ].join('\n');
  }

  /**
   * FEN generation (placeholder for later).
   */
  toFEN() {
    throw new Error('FEN export not implemented yet');
  }
}
