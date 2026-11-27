import type { BoardDisplay, BoardTheme, PieceSet } from "../../db/settings";

/** The square-colour presets as the Board & pieces board names them, with their two colours. */
export const BOARD_THEME_NAMES: Record<BoardTheme, string> = {
  newspaper: "Newspaper",
  newsprint: "Newsprint",
  tournament: "Tournament Hall",
  green: "Green",
  ocean: "Blue Ocean",
  wood: "Classic Wood",
  walnut: "Walnut",
  champion: "Champion",
  freestyle: "Freestyle",
  arcade: "Arcade",
  sakura: "Sakura",
  contrast: "High Contrast",
};

/** Printed under each name, as on the board (the values live in tokens.css). */
export const BOARD_THEME_COLOURS: Record<BoardTheme, string> = {
  newspaper: "#E9E1CC · #1B1A17",
  newsprint: "#E8E2D4 · #9C9483",
  tournament: "#E4DDC6 · #7E8566",
  green: "#EEEED2 · #769656",
  ocean: "#DEE6EC · #6F8FAB",
  wood: "#E2C9A1 · #A77B52",
  walnut: "#DDB88C · #7A5136",
  champion: "#F4EBD0 · #B0894C",
  freestyle: "#E9E6DF · #3E5C76",
  arcade: "#B9F3E4 · #9A7FD1",
  sakura: "#FDE8EC · #E5A3B4",
  contrast: "#FFFFFF · #4F4F4F",
};

/** The display switches, with the board's wording. */
export const DISPLAY_ROWS: { name: keyof BoardDisplay; label: string; note: string }[] = [
  { name: "coordinates", label: "Coordinates", note: "Files and ranks on the edge squares" },
  { name: "lastMove", label: "Last-move highlight", note: "A tint on both squares of the last move" },
  { name: "legalMoves", label: "Legal-move hints", note: "Dots on the squares a piece can reach" },
  { name: "arrows", label: "Engine arrows", note: "The engine's best moves on the board" },
];

/** Piece sets by name, with their author (credits in src/assets/pieces/CREDITS.md). */
export const PIECE_SET_NAMES: Record<PieceSet, { name: string; by: string }> = {
  classic: { name: "Classic", by: "react-chessboard · MIT" },
  chessnut: { name: "Chessnut", by: "Alexis Luengas · Apache 2.0" },
  fantasy: { name: "Fantasy", by: "Maurizio Monge · MIT" },
  spatial: { name: "Spatial", by: "Maurizio Monge · MIT" },
  celtic: { name: "Celtic", by: "Maurizio Monge · MIT" },
  rhosgfx: { name: "Pixel", by: "RhosGFX · CC0" },
  "staunton-wood": { name: "3D Wood", by: "James Clarke · MIT" },
  "staunton-basic": { name: "3D Classic", by: "James Clarke · MIT" },
};
