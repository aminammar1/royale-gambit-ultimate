/** Nav sections with their permanent letters (docs/DESIGN.md). Later ones: H Library, I Bots, J Learn. */
export type Section = {
  letter: string;
  path: string;
  label: string;
  kicker: string;
  title: string;
  /** Milestone that builds the page; undefined once built. */
  opensIn?: { milestone: string; what: string };
};

export const SECTIONS: readonly Section[] = [
  { letter: "A", path: "/", label: "Home", kicker: "Front page", title: "Royal Gambit Ultimate" },
  {
    letter: "B",
    path: "/play",
    label: "Play",
    kicker: "Play",
    title: "Local game",
    opensIn: { milestone: "M1", what: "Board and local game: two players at one board, clocks, the score sheet." },
  },
  {
    letter: "C",
    path: "/analyze",
    label: "Analyze",
    kicker: "Analysis",
    title: "Analysis board",
    opensIn: {
      milestone: "M3",
      what: "Local Stockfish: eval bar, best move and the top three lines, printed as a table.",
    },
  },
  {
    letter: "D",
    path: "/review",
    label: "Review",
    kicker: "Review",
    title: "Game review",
    opensIn: { milestone: "M5", what: "Accuracy for each side, the eval graph and the moments that mattered." },
  },
  {
    letter: "E",
    path: "/puzzles",
    label: "Puzzles",
    kicker: "Puzzles",
    title: "Puzzles",
    opensIn: { milestone: "M6", what: "Tactics with hints, your record, and the daily chess column." },
  },
  { letter: "F", path: "/settings", label: "Settings", kicker: "Settings", title: "Settings" },
  {
    letter: "G",
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
