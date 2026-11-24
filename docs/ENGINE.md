# Engine: Stockfish, UCI and review math

Read this when working on the Rust engine manager, the `analysis`, `review` or `bots` services, or the Analysis and Review pages.

## Process lifecycle
Same protocol in two places: the **Rust sidecar** in the desktop app (steps below) and the **Go `analysis` service**, which runs a pool of these processes (one search per process at a time, a worker takes a job from the queue, restart a dead process, reap children on shutdown). Services launch `stockfish` as a plain child process; only the desktop uses the Tauri sidecar API.

### Rust sidecar steps
1. Spawn the sidecar via `tauri_plugin_shell::ShellExt::sidecar("stockfish")` (configured in `bundle.externalBin` as `binaries/stockfish`; files named `stockfish-<target-triple>[.exe]`).
2. Send `uci` → wait for `uciok`. Send `setoption name Threads value <cores-1, min 1>`, `setoption name Hash value 256`, `setoption name MultiPV value 3`, and `setoption name UCI_ShowWDL value true` (optional). Then `isready` → wait for `readyok`.
3. Per game: `ucinewgame` then `isready`/`readyok`.
4. Per request: `position fen <FEN> [moves <uci...>]` then `go depth N` | `go movetime MS` | `go infinite`.
5. To change the position while searching: send `stop`, **wait for `bestmove`** (discard it), then send the new `position`/`go`. Never interleave two searches.
6. On app exit: `quit`, wait about 500 ms, then kill. If the process dies unexpectedly, emit `engine://error`, restart once, then surface the error.

## Parsing `info` lines
Example: `info depth 22 seldepth 30 multipv 2 score cp -35 wdl 310 520 170 nodes 1234567 nps 1500000 pv e7e5 g1f3 b8c6`
- Tokens come in key/value pairs, except `pv`, which consumes the rest of the line. `score` is followed by `cp N` or `mate N`, optionally followed by `lowerbound`/`upperbound` (skip bound lines for display).
- Ignore `info string ...` and info lines without `pv`.
- **Perspective:** UCI scores are from the **side to move**. Normalize to White: if black to move, `cp = -cp`, `mate = -mate`, and reverse the `wdl` order.
- Mate: `mate 3` means the side to move mates in 3. Display as `#3` / `#−3` from White's view.
- Throttle: emit at most about 10 events/s per multipv line; always emit the final line at each new depth.

## Converting PV to SAN
PV moves are UCI (`e2e4`, `e7e8q`). Convert to SAN in the client by replaying them on a chess.js copy of the position, and in Python services with python-chess. Never in Rust or Go.

## Win probability (Lichess-style)
`win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)`, with cp from the **mover's** perspective, clamped to ±1000. Mate counts as cp ±1000 (or win% 100/0).

## Move classification (by win% the mover lost)
`loss = win%_before(mover) - win%_after(mover)`
- `loss >= 30` → blunder `??`; `>= 20` → mistake `?`; `>= 10` → inaccuracy `?!`.
- Don't flag moves in already-decided positions (both before and after > 90% or < 10%) unless the result flips.
- **Before M5:** compare these thresholds with lila's (`Advice.scala`, which I believe uses winning chances on a −1..1 scale, so about half of these percentage-point values). If they differ, either match lila or name the method in the result, like `harmonic-v1` below.
- Missed mate: there was a mate for the mover before the move and none after → at least a mistake.

## Accuracy
Per move: `acc = 103.1668 * exp(-0.04354 * loss) - 3.1669`, clamped to [0, 100].
Per side: Lichess combines a volatility-weighted mean with a harmonic mean. For the first version, use the harmonic mean of per-move accuracies and record `method: "harmonic-v1"` with the result. Check against the lila source (`AccuracyPercent.scala`, `WinPercent.scala`) before claiming parity.

## Bots (`bots` service)
`setoption name UCI_LimitStrength value true` + `setoption name UCI_Elo value <1320..3190>` (check the range on the actual binary via `uci` option output), or `Skill Level 0..20`. Use `go movetime` with small times and some randomness for low levels. The `bots` service sends these options to `analysis`; it does not run Stockfish itself.

## Tests to keep
Golden review files live in `contracts/fixtures/review/` and are the source of truth for `review`. Parsing fixtures for cp, mate, bounds, multipv, wdl and a missing pv; perspective flips for white and black to move; win%/accuracy fixtures; queue test (stop → bestmove → new search); integration test with the real binary from the start position.
