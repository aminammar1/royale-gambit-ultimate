import {
  ChartSpline,
  ChessKnight,
  ChessPawn,
  IdCard,
  Library,
  Newspaper,
  ScanSearch,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

/** Nav sections, each with its icon (docs/DESIGN.md). Later ones: Bots, Learn. */
export type Section = {
  icon: LucideIcon;
  /** Pages with a chess board on them show the board placeholder until they are built. */
  board?: boolean;
  path: string;
  label: string;
  kicker: string;
  title: string;
  /** Milestone that builds the page; undefined once built. */
  opensIn?: { milestone: string; what: string };
};

export const SECTIONS: readonly Section[] = [
  { icon: Newspaper, path: "/", label: "Home", kicker: "Front page", title: "Royale Gambit Ultimate" },
  {
    icon: ChessPawn,
    board: true,
    path: "/play",
    label: "Play",
    kicker: "Play",
    title: "Local game",
    opensIn: { milestone: "M1", what: "Board and local game: two players at one board, clocks, the score sheet." },
  },
  {
    icon: ScanSearch,
    board: true,
    path: "/analyze",
    label: "Analyze",
    kicker: "Analyze",
    title: "Analysis",
  },
  {
    icon: ChartSpline,
    board: true,
    path: "/review",
    label: "Review",
    kicker: "Review",
    title: "Game review",
    opensIn: { milestone: "M5", what: "Accuracy for each side, the eval graph and the moments that mattered." },
  },
  {
    icon: ChessKnight,
    board: true,
    path: "/puzzles",
    label: "Puzzles",
    kicker: "Puzzles",
    title: "Puzzles",
    opensIn: { milestone: "M6", what: "Tactics with hints, your record, and the daily chess column." },
  },
  { icon: Library, path: "/library", label: "Library", kicker: "Library", title: "The archive" },
  { icon: SlidersHorizontal, path: "/settings", label: "Settings", kicker: "Settings", title: "Settings" },
  {
    icon: IdCard,
    path: "/profile",
    label: "Profile",
    kicker: "Profile",
    title: "Player card",
    opensIn: { milestone: "M7", what: "Your federation card, puzzle rating chart and results table." },
  },
];

export function sectionFor(pathname: string): Section {
  return SECTIONS.find((s) => s.path === pathname) ?? SECTIONS[0];
}
