import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

/** Board themes: the presets of design/newsprint/board-customization.png (Newspaper first), then the extra palettes Amine asked for. */
export const BOARD_THEMES = [
  "newspaper",
  "newsprint",
  "tournament",
  "green",
  "ocean",
  "wood",
  "walnut",
  "champion",
  "freestyle",
  "arcade",
  "sakura",
  "contrast",
] as const;
export type BoardTheme = (typeof BOARD_THEMES)[number];

/** Piece sets: react-chessboard's own, then the freely licensed sets in src/assets/pieces. */
export const PIECE_SETS = [
  "classic",
  "chessnut",
  "fantasy",
  "spatial",
  "celtic",
  "rhosgfx",
  "staunton-wood",
  "staunton-basic",
] as const;
export type PieceSet = (typeof PIECE_SETS)[number];

/** How deep the engine searches on the Analysis page (half-moves). */
export const ENGINE_DEPTHS = [12, 16, 20, 24, 28] as const;
export type EngineDepth = (typeof ENGINE_DEPTHS)[number];

/** How fast a piece glides from square to square (Board & pieces); fast by default, as on chess sites. */
export const PIECE_SPEEDS = ["fast", "normal", "slow", "off"] as const;
export type PieceSpeed = (typeof PIECE_SPEEDS)[number];
/**
 * Colours that fill a square, as on chess sites (Amine, 2026-11-27): the picked piece and the last
 * move take `highlight`, squares marked with the right button take `markColour`. Theme is the board
 * theme's own highlight (--board-highlight: teal on Arcade, yellow on Green…); Ink is the print look,
 * the theme's own mark. Values: --board-highlight and --board-hl-<colour> in tokens.css.
 */
export const HIGHLIGHT_COLOURS = ["theme", "yellow", "green", "blue", "orange", "red", "ink"] as const;
export type HighlightColour = (typeof HIGHLIGHT_COLOURS)[number];
export const HIGHLIGHT_NAMES: Record<HighlightColour, string> = {
  theme: "Theme",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  orange: "Orange",
  red: "Red",
  ink: "Ink",
};
const highlightOf = (value: string | undefined, fallback: HighlightColour): HighlightColour =>
  HIGHLIGHT_COLOURS.find((c) => c === value) ?? fallback;

/** The glide of each speed, in milliseconds. */
export const GLIDE_MS: Record<PieceSpeed, number> = { fast: 120, normal: 200, slow: 300, off: 0 };

/** What the board shows besides the pieces (Board & pieces, "Display"). */
export type BoardDisplay = {
  coordinates: boolean;
  lastMove: boolean;
  legalMoves: boolean;
  arrows: boolean;
};

export type EditionSetting = "system" | "day" | "night";

type SettingsState = {
  /** False until the local store answered; the defaults show meanwhile. */
  loaded: boolean;
  boardTheme: BoardTheme;
  pieces: PieceSet;
  display: BoardDisplay;
  edition: EditionSetting;
  engineDepth: EngineDepth;
  sounds: boolean;
  pieceSpeed: PieceSpeed;
  highlight: HighlightColour;
  markColour: HighlightColour;
};

export const DEFAULTS: Omit<SettingsState, "loaded"> = {
  boardTheme: "newspaper",
  pieces: "classic",
  display: { coordinates: true, lastMove: true, legalMoves: true, arrows: true },
  edition: "system",
  engineDepth: 20,
  sounds: true,
  pieceSpeed: "fast",
  highlight: "theme",
  markColour: "red",
};

export const useSettings = create<SettingsState>(() => ({ loaded: false, ...DEFAULTS }));

const DISPLAY_KEYS: Record<keyof BoardDisplay, string> = {
  coordinates: "board_coordinates",
  lastMove: "board_last_move",
  legalMoves: "board_legal_moves",
  arrows: "board_arrows",
};

/** Reads the stored rows over the defaults; a value this version does not know is ignored. */
export function fromRows(rows: Record<string, string>): Omit<SettingsState, "loaded"> {
  const theme = rows.board_theme as BoardTheme | undefined;
  const pieces = rows.board_pieces as PieceSet | undefined;
  const edition = rows.edition as EditionSetting | undefined;
  const depth = Number(rows.engine_depth) as EngineDepth;
  const speed = rows.piece_speed as PieceSpeed | undefined;
  const display = { ...DEFAULTS.display };
  for (const [name, key] of Object.entries(DISPLAY_KEYS) as [keyof BoardDisplay, string][]) {
    if (rows[key] === "on" || rows[key] === "off") display[name] = rows[key] === "on";
  }
  return {
    boardTheme: theme && BOARD_THEMES.includes(theme) ? theme : DEFAULTS.boardTheme,
    pieces: pieces && PIECE_SETS.includes(pieces) ? pieces : DEFAULTS.pieces,
    display,
    edition: edition === "day" || edition === "night" || edition === "system" ? edition : DEFAULTS.edition,
    engineDepth: ENGINE_DEPTHS.includes(depth) ? depth : DEFAULTS.engineDepth,
    sounds: rows.board_sounds === "on" ? true : rows.board_sounds === "off" ? false : DEFAULTS.sounds,
    pieceSpeed: speed && PIECE_SPEEDS.includes(speed) ? speed : DEFAULTS.pieceSpeed,
    highlight: highlightOf(rows.board_highlight, DEFAULTS.highlight),
    markColour: highlightOf(rows.board_mark_colour, DEFAULTS.markColour),
  };
}

/** Local first: a change shows at once and is written to SQLite behind it. */
async function save(key: string, value: string): Promise<void> {
  try {
    await invoke("settings_set", { key, value });
  } catch (error) {
    // Only the next start would show the old value; the choice still applies now.
    console.warn("settings were not saved", key, error);
  }
}

export const settingsDb = {
  load: async () => {
    try {
      const rows = await invoke<Record<string, string>>("settings_get");
      useSettings.setState({ loaded: true, ...fromRows(rows) });
    } catch {
      useSettings.setState({ loaded: true });
    }
  },
  setBoardTheme: (theme: BoardTheme) => {
    useSettings.setState({ boardTheme: theme });
    void save("board_theme", theme);
  },
  setPieces: (set: PieceSet) => {
    useSettings.setState({ pieces: set });
    void save("board_pieces", set);
  },
  setDisplay: (name: keyof BoardDisplay, on: boolean) => {
    useSettings.setState((s) => ({ display: { ...s.display, [name]: on } }));
    void save(DISPLAY_KEYS[name], on ? "on" : "off");
  },
  setEngineDepth: (depth: EngineDepth) => {
    useSettings.setState({ engineDepth: depth });
    void save("engine_depth", String(depth));
  },
  setSounds: (on: boolean) => {
    useSettings.setState({ sounds: on });
    void save("board_sounds", on ? "on" : "off");
  },
  setPieceSpeed: (speed: PieceSpeed) => {
    useSettings.setState({ pieceSpeed: speed });
    void save("piece_speed", speed);
  },
  setHighlight: (colour: HighlightColour) => {
    useSettings.setState({ highlight: colour });
    void save("board_highlight", colour);
  },
  setMarkColour: (colour: HighlightColour) => {
    useSettings.setState({ markColour: colour });
    void save("board_mark_colour", colour);
  },
  setEdition: (edition: EditionSetting) => {
    useSettings.setState({ edition });
    void save("edition", edition);
  },
  /** Back to the defaults, saved (Board & pieces, "Reset"). */
  resetBoard: () => {
    settingsDb.setBoardTheme(DEFAULTS.boardTheme);
    settingsDb.setPieces(DEFAULTS.pieces);
    settingsDb.setPieceSpeed(DEFAULTS.pieceSpeed);
    settingsDb.setHighlight(DEFAULTS.highlight);
    settingsDb.setMarkColour(DEFAULTS.markColour);
    for (const name of Object.keys(DISPLAY_KEYS) as (keyof BoardDisplay)[])
      settingsDb.setDisplay(name, DEFAULTS.display[name]);
  },
};
