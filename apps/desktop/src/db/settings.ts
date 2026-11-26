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
export const PIECE_SETS = ["classic", "chessnut", "fantasy", "spatial", "celtic", "rhosgfx"] as const;
export type PieceSet = (typeof PIECE_SETS)[number];

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
};

export const DEFAULTS: Omit<SettingsState, "loaded"> = {
  boardTheme: "newspaper",
  pieces: "classic",
  display: { coordinates: true, lastMove: true, legalMoves: true, arrows: true },
  edition: "system",
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
  const display = { ...DEFAULTS.display };
  for (const [name, key] of Object.entries(DISPLAY_KEYS) as [keyof BoardDisplay, string][]) {
    if (rows[key] === "on" || rows[key] === "off") display[name] = rows[key] === "on";
  }
  return {
    boardTheme: theme && BOARD_THEMES.includes(theme) ? theme : DEFAULTS.boardTheme,
    pieces: pieces && PIECE_SETS.includes(pieces) ? pieces : DEFAULTS.pieces,
    display,
    edition: edition === "day" || edition === "night" || edition === "system" ? edition : DEFAULTS.edition,
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
  setEdition: (edition: EditionSetting) => {
    useSettings.setState({ edition });
    void save("edition", edition);
  },
  /** Back to the defaults, saved (Board & pieces, "Reset"). */
  resetBoard: () => {
    settingsDb.setBoardTheme(DEFAULTS.boardTheme);
    settingsDb.setPieces(DEFAULTS.pieces);
    for (const name of Object.keys(DISPLAY_KEYS) as (keyof BoardDisplay)[])
      settingsDb.setDisplay(name, DEFAULTS.display[name]);
  },
};
