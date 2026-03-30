# 4chess

> Minimal chess engine utilities: compact `Board` state and pseudo-legal move generator.

Features
- Engine-friendly `Board` with 0-63 indexing, fast piece lists, and cloning.
- Pseudo-legal move generation with compact 32-bit move encoding.
- Intentionally minimal and GC-conscious data structures (Int8Array / Int32Array).

Files
- [board.js](board.js#L1): `Board` class, piece constants, utilities, and a Unicode `toString()` for debugging.
- [moveGen.js](moveGen.js#L1): Move encoding, `MoveList`, and `generateMoves()` with pawn, knight, sliding, and king generators.

Quick usage

1. Ensure Node is set to use ES modules (add `"type": "module"` to `package.json` or run with an ESM loader).

2. Example script:

```js
import { Board } from './board.js';
import { MoveList, generateMoves } from './moveGen.js';

const board = new Board();
board.setup();

const state = {
  turn: 'white',
  castling: { K: true, Q: true, k: true, q: true },
  epSquare: null,
};

const list = new MoveList();
generateMoves(board, state, list);
console.log(board.toString());
console.log('Moves generated:', list.count);
for (let i = 0; i < list.count; i++) console.log(list.moves[i]);
```

Notes & next steps
- `generateMoves()` produces pseudo-legal moves (does not filter moves that leave the king in check). Add a legality filter (using attack maps) to get fully legal moves.
- `Board.toFEN()` is a placeholder; implement FEN import/export if you need interoperability with other tools.

Contributions
- Small, well-scoped changes welcome: tests, FEN support, perft harness, and legality filtering are natural next tasks.

License
- Unlicensed — add a `LICENSE` file if you intend to open-source this project.
