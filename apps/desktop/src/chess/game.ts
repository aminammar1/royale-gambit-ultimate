// The game model for boards that analyse: a start position and the moves played from it. All
// rules come from chess.js (ADR-03); this file never decides what is legal. No React, no Tauri.
import { Chess, validateFen } from "chess.js";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** One half-move, as played. */
export type Ply = {
  san: string;
  /** UCI, as the engine speaks: e2e4, e7e8q, e1g1. */
  uci: string;
  from: string;
  to: string;
  /** The position after the move. */
  fen: string;
};

/** A line of play: where it starts and what was played. Immutable; every change returns a new one. */
export type Game = {
  startFen: string;
  plies: readonly Ply[];
  /** PGN headers kept from an imported game (Event, White, Black...). */
  headers: Readonly<Record<string, string>>;
};

export const newGame = (startFen = START_FEN): Game => ({ startFen, plies: [], headers: {} });

const toPly = (m: { san: string; lan: string; from: string; to: string; after: string }): Ply => ({
  san: m.san,
  uci: m.lan,
  from: m.from,
  to: m.to,
  fen: m.after,
});

/** The position after `cursor` plies (0 is the start). */
export function fenAt(game: Game, cursor: number): string {
  if (cursor <= 0) return game.startFen;
  return game.plies[Math.min(cursor, game.plies.length) - 1].fen;
}

/** The UCI moves from the start up to `cursor`: what the engine needs to know the history. */
export const ucisUpTo = (game: Game, cursor: number): string[] =>
  game.plies.slice(0, Math.max(0, cursor)).map((p) => p.uci);

/**
 * Plays a move in the position at `cursor`. Anything after the cursor is replaced, as on a
 * score sheet where you cross out and continue. Returns undefined when the move is illegal.
 */
export function play(game: Game, cursor: number, from: string, to: string, promotion?: string): Game | undefined {
  const chess = new Chess(fenAt(game, cursor));
  try {
    const m = chess.move({ from, to, promotion });
    return { ...game, plies: [...game.plies.slice(0, cursor), toPly(m)] };
  } catch {
    return undefined;
  }
}

/** True when moving from `from` to `to` in `fen` is a pawn reaching the last rank. */
export function isPromotion(fen: string, from: string, to: string): boolean {
  const chess = new Chess(fen);
  return chess.moves({ square: from as never, verbose: true }).some((m) => m.to === to && m.promotion !== undefined);
}

export type LoadResult = { ok: true; game: Game } | { ok: false; error: string };

/** Reads what a player pasted: a FEN, or a PGN (with or without headers). */
export function load(text: string): LoadResult {
  const input = text.trim();
  if (input === "") return { ok: false, error: "Paste a FEN or a PGN first." };
  if (/^[1-8pnbrqkPNBRQK/]+\s+[wb]\s/.test(input)) {
    const check = validateFen(input);
    if (!check.ok) return { ok: false, error: check.error ?? "That FEN is not a legal position." };
    return { ok: true, game: newGame(input) };
  }
  const chess = new Chess();
  try {
    chess.loadPgn(input);
  } catch {
    return { ok: false, error: "That is neither a FEN nor a PGN this board can read." };
  }
  const headers = chess.getHeaders();
  const startFen = headers.FEN && headers.SetUp === "1" ? headers.FEN : START_FEN;
  const plies = chess.history({ verbose: true }).map(toPly);
  return { ok: true, game: { startFen, plies, headers } };
}

/** The game as PGN, its headers kept. */
export function toPgn(game: Game): string {
  const chess = new Chess(game.startFen);
  for (const [key, value] of Object.entries(game.headers)) chess.setHeader(key, value);
  if (game.startFen !== START_FEN) {
    chess.setHeader("SetUp", "1");
    chess.setHeader("FEN", game.startFen);
  }
  for (const p of game.plies) chess.move(p.san);
  return chess.pgn();
}

/**
 * Turns an engine line (UCI moves from `fen`) into SAN, stopping at the first move that is not
 * legal: a line is only as good as its first bad move.
 */
export function pvToSan(fen: string, pv: readonly string[]): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv) {
    try {
      const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}

/** "20." for White to move, "19…" for Black: the number printed before a move in `fen`. */
export function moveNumberLabel(fen: string): string {
  const [, side, , , , full] = fen.split(" ");
  return side === "w" ? `${full}.` : `${full}…`;
}

/** A SAN line printed with move numbers: "20. Nxe4 Rxe4 21. Bxe4" or "19… Nxe4 20. Qd2". */
export function numberedLine(fen: string, sans: readonly string[]): string {
  const [, side, , , , fullText] = fen.split(" ");
  let full = Number(fullText);
  let white = side === "w";
  const parts: string[] = [];
  sans.forEach((san, i) => {
    if (white) parts.push(`${full}. ${san}`);
    else parts.push(i === 0 ? `${full}… ${san}` : san);
    if (!white) full += 1;
    white = !white;
  });
  return parts.join(" ");
}

/** The side to move in `fen`. */
export const sideToMove = (fen: string): "w" | "b" => (fen.split(" ")[1] === "b" ? "b" : "w");

/** Whether the side to move in `fen` is in check. */
export const inCheck = (fen: string): boolean => new Chess(fen).inCheck();

/** The square of the king of `side` in `fen`, for the check mark. */
export function kingSquare(fen: string, side: "w" | "b"): string | undefined {
  const chess = new Chess(fen);
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.type === "k" && sq.color === side) return sq.square;
    }
  }
  return undefined;
}
