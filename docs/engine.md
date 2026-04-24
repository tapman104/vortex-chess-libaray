# Engine Integration Guide

Vortex provides an asynchronous engine adapter framework for analyzing positions and finding best moves.

## Architecture

The core `Chess` class remains purely synchronous and rules-focused. Engine logic is handled by external `EngineAdapter` implementations that communicate with engine backends (like Stockfish via Web Workers).

## Basic Usage (Stockfish)

To use Stockfish, you need a Stockfish WASM worker script.

```javascript
import { Chess, StockfishAdapter } from 'vortex-chess';

const game = new Chess();
const engine = new StockfishAdapter({
  workerPath: './stockfish-nnue-16.js'
});

// 1. Connect to the engine
await engine.connect();

// 2. Request the best move
const result = await engine.getBestMove(game, { depth: 15 });

console.log(`Best move: ${result.bestMove}`);
console.log(`Evaluation: ${result.evaluation / 100} pawns`);

// 3. Disconnect when done
await engine.disconnect();
```

## Error Handling

### Unsupported Variants
Stockfish only supports standard chess. If you try to use it with a 4-player variant, it will throw an `UnsupportedVariantError`.

```javascript
import { UnsupportedVariantError } from 'vortex-chess';

try {
  await engine.getBestMove(fourPlayerGame);
} catch (e) {
  if (e instanceof UnsupportedVariantError) {
    console.error("This engine doesn't support 4-player chess!");
  }
}
```

## Advanced Options

`getBestMove` accepts several search constraints:

- `depth`: Maximum search depth in half-moves.
- `movetime`: Maximum time to search in milliseconds.
- `nodes`: Maximum number of nodes to search.

## Best Practices

1. **Lifecycle Management**: Always call `engine.disconnect()` when the engine is no longer needed to terminate the Web Worker and free memory.
2. **FEN Snapshots**: The adapter automatically takes a FEN snapshot of the game state when `getBestMove` is called. This ensures that even if the `Chess` instance is mutated during the asynchronous search, the engine analyzes the position as it was at the moment of the call.
3. **One Request at a Time**: `StockfishAdapter` enforces a single-request policy. If you call `getBestMove` while a search is already in progress, it will throw an error.
