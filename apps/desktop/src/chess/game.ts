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
  /** PGN headers kept from an imported game (Event, White, Black...). Result is worked out again. */
  headers: Readonly<Record<string, string>>;
  /** PGN comments, by the position they follow. Side lines are not kept. */
  comments: Readonly<Record<string, string>>;
};

export const newGame = (startFen = START_FEN): Game => ({ startFen, plies: [], headers: {}, comments: {} });

type Normal = { ok: true; fen: string } | { ok: false; error: string };

/**
 * A start position as the engine will see it, through chess.js: one space between fields,
 * castling rights only where king and rook still stand (chess.js would otherwise let a king
 * castle with no rook, and the server would refuse the move), and refused when the side not to
 * move is in check, which no game can reach.
 */
export function normalizeStart(raw: string): Normal {
  const fen = raw.trim().split(/\s+/).join(" ");
  const check = validateFen(fen);
  if (!check.ok) return { ok: false, error: check.error ?? "That FEN is not a legal position." };
  const chess = new Chess(fen);
  for (const color of ["w", "b"] as const) chess.setCastlingRights(color, chess.getCastlingRights(color));
  const f = chess.fen().split(" ");
  try {
    if (new Chess([f[0], f[1] === "w" ? "b" : "w", f[2], "-", f[4], f[5]].join(" ")).inCheck()) {
      return { ok: false, error: "The side not to move is in check: no game reaches that position." };
    }
  } catch {
    // The position with the other side to move does not load: nothing to check.
  }
  return { ok: true, fen: chess.fen() };
}

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

/** Where the piece on `from` can go in `fen` (none when it is not that side's turn). */
export function legalTargets(fen: string, from: string): { square: string; capture: boolean }[] {
  const chess = new Chess(fen);
  const seen = new Map<string, boolean>();
  for (const m of chess.moves({ square: from as never, verbose: true })) {
    // chess.js counts en passant apart from captures; on the board it is one.
    seen.set(m.to, (seen.get(m.to) ?? false) || m.isCapture() || m.isEnPassant());
  }
  return [...seen].map(([square, capture]) => ({ square, capture }));
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
    const start = normalizeStart(input);
    return start.ok ? { ok: true, game: newGame(start.fen) } : start;
  }
  const chess = new Chess();
  try {
    chess.loadPgn(input);
  } catch {
    return { ok: false, error: "That is neither a FEN nor a PGN this board can read." };
  }
  const headers = chess.getHeaders();
  const history = chess.history({ verbose: true });
  // Where chess.js really started (a FEN tag counts with or without SetUp), not what the
  // headers seem to say; then the moves again from the cleaned start.
  const start = normalizeStart(history[0]?.before ?? chess.fen());
  if (!start.ok) return start;
  const replay = new Chess(start.fen);
  const plies: Ply[] = [];
  try {
    for (const m of history) plies.push(toPly(replay.move(m.san)));
  } catch {
    return { ok: false, error: "The moves do not fit the starting position." };
  }
  const comments = Object.fromEntries(chess.getComments().map((c) => [c.fen, c.comment]));
  return { ok: true, game: { startFen: start.fen, plies, headers, comments } };
}

/** The game as PGN, its headers kept. */
export function toPgn(game: Game): string {
  const chess = new Chess(game.startFen);
  for (const [key, value] of Object.entries(game.headers)) chess.setHeader(key, value);
  if (game.startFen !== START_FEN) {
    chess.setHeader("SetUp", "1");
    chess.setHeader("FEN", game.startFen);
  }
  if (game.comments[game.startFen]) chess.setComment(game.comments[game.startFen]);
  for (const p of game.plies) {
    chess.move(p.san);
    if (game.comments[p.fen]) chess.setComment(game.comments[p.fen]);
  }
  // The result is the board's, not the header's: a crossed-out game is no longer won.
  const result = chess.isCheckmate() ? (chess.turn() === "w" ? "0-1" : "1-0") : chess.isDraw() ? "1/2-1/2" : "*";
  chess.setHeader("Result", result);
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

/** A SAN line split into moves, each with the number printed before it, when one is: the parts
 *  of "19… Nxe4 20. Qd2 Nf6" are ("19…", Nxe4), ("20.", Qd2), (none, Nf6). */
export function numberedMoves(fen: string, sans: readonly string[]): { number?: string; san: string }[] {
  const [, side, , , , fullText] = fen.split(" ");
  let full = Number(fullText);
  let white = side === "w";
  return sans.map((san, i) => {
    const number = white ? `${full}.` : i === 0 ? `${full}…` : undefined;
    if (!white) full += 1;
    white = !white;
    return { number, san };
  });
}

/** The side to move in `fen`. */
export const sideToMove = (fen: string): "w" | "b" => (fen.split(" ")[1] === "b" ? "b" : "w");

/** How the game stands in `fen` when nobody can move: decided by chess.js, never by the engine. */
export function outcome(fen: string): "checkmate" | "stalemate" | undefined {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return "checkmate";
  if (chess.isStalemate()) return "stalemate";
  return undefined;
}

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
