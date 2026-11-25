import { siChessdotcom, siLichess } from "simple-icons";

const MARKS = { lichess: siLichess, chesscom: siChessdotcom } as const;

/**
 * The Lichess or Chess.com mark (Simple Icons, CC0), one colour: it takes the text colour,
 * so it prints in ink like everything else instead of bringing the brands' hues.
 */
export function BrandMark({ brand, size = 18 }: { brand: keyof typeof MARKS; size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className="shrink-0">
      <path d={MARKS[brand].path} />
    </svg>
  );
}
