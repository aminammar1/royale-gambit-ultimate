import type { BoardDisplay, BoardTheme } from "../../db/settings";

/** The square-colour presets as the Board & pieces board names them, with their two colours. */
export const BOARD_THEME_NAMES: Record<BoardTheme, string> = {
  newspaper: "Newspaper",
  newsprint: "Newsprint",
  tournament: "Tournament Hall",
  wood: "Classic Wood",
  contrast: "High Contrast",
};

/** Printed under each name, as on the board (the values live in tokens.css). */
export const BOARD_THEME_COLOURS: Record<BoardTheme, string> = {
  newspaper: "#E9E1CC · #1B1A17",
  newsprint: "#E8E2D4 · #9C9483",
  tournament: "#E4DDC6 · #7E8566",
  wood: "#E2C9A1 · #A77B52",
  contrast: "#FFFFFF · #4F4F4F",
};

/** The display switches, with the board's wording. */
export const DISPLAY_ROWS: { name: keyof BoardDisplay; label: string; note: string }[] = [
  { name: "coordinates", label: "Coordinates", note: "Files and ranks on the edge squares" },
  { name: "lastMove", label: "Last-move highlight", note: "A tint on both squares of the last move" },
  { name: "legalMoves", label: "Legal-move hints", note: "Dots on the squares a piece can reach" },
  { name: "arrows", label: "Arrows", note: "The engine's best moves on the board" },
];
