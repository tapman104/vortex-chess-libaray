/**
 * GameState — Tracks non-piece board state
 * turn, castling rights, en passant square, move clocks
 */
export class GameState {
  constructor() {
    this.turn = 'white';
    // Castling rights: K, Q (White), k, q (Black)
    this.castling = { K: true, Q: true, k: true, q: true };
    this.epSquare = null;      // square index for EP capture, or null
    this.halfmoveClock = 0;   // for 50-move rule
    this.fullmoveNumber = 1;  // incremented after black's turn
  }

  /**
   * Flip turn between 'white' and 'black'
   */
  nextTurn() {
    this.turn = this.turn === 'white' ? 'black' : 'white';
    if (this.turn === 'white') {
      this.fullmoveNumber++;
    }
  }

  /**
   * Deep clone for search/simulation
   */
  clone() {
    const copy = new GameState();
    copy.turn = this.turn;
    copy.castling = { ...this.castling };
    copy.epSquare = this.epSquare;
    copy.halfmoveClock = this.halfmoveClock;
    copy.fullmoveNumber = this.fullmoveNumber;
    return copy;
  }
}
