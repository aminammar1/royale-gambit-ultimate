// Engine scores as the page prints and draws them. Scores arrive from White's point of view
// (the analysis service turns them once, ENGINE.md); nothing here turns them again.

/** A score from White's view: centipawns, or moves to mate (positive: White mates). */
export type Score = { cp: number } | { mate: number };

const MINUS = "−"; // the true minus sign (DESIGN.md: "−0.80")

/** `+1.24`, `−0.80`, `0.00`, `#5`, `#−3` (DESIGN.md, "Notation & marking"). */
export function formatScore(score: Score): string {
  if ("mate" in score) {
    return score.mate < 0 ? `#${MINUS}${-score.mate}` : `#${score.mate}`;
  }
  const pawns = Math.abs(score.cp) / 100;
  if (score.cp === 0) return "0.00";
  return `${score.cp < 0 ? MINUS : "+"}${pawns.toFixed(2)}`;
}

/**
 * White's winning chances, 0 to 100, for the eval bar: the Lichess-style curve from ENGINE.md,
 * with centipawns clamped to ±1000 and a mate counted as won or lost.
 */
export function whiteWinPercent(score: Score): number {
  if ("mate" in score) return score.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, score.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
