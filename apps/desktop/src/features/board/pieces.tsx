import { defaultPieces, type PieceRenderObject } from "react-chessboard";
import type { PieceSet } from "../../db/settings";

// The bundled sets, by file: src/assets/pieces/<set>/<colour><piece>.svg (credits there).
const files = import.meta.glob<string>("../../assets/pieces/*/*.svg", { eager: true, import: "default" });

const NAMES = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"] as const;

/**
 * react-chessboard's own pieces with the theme's outline: on Newspaper a paper line around every
 * piece, so a black piece reads on a black square.
 */
const classic: PieceRenderObject = Object.fromEntries(
  Object.entries(defaultPieces).map(([name, render]) => [
    name,
    (props?: Parameters<typeof render>[0]) =>
      render({ ...props, svgStyle: { ...props?.svgStyle, filter: "var(--board-piece-filter)" } }),
  ]),
);

function imageSet(set: Exclude<PieceSet, "classic">): PieceRenderObject {
  return Object.fromEntries(
    NAMES.map((name) => {
      const src = files[`../../assets/pieces/${set}/${name}.svg`];
      return [
        name,
        (props?: { svgStyle?: React.CSSProperties }) => (
          <img src={src} alt="" draggable={false} style={{ width: "100%", height: "100%", ...props?.svgStyle }} />
        ),
      ];
    }),
  );
}

const cache = new Map<PieceSet, PieceRenderObject>([["classic", classic]]);

/** The pieces of `set`, built once. */
export function piecesFor(set: PieceSet): PieceRenderObject {
  let pieces = cache.get(set);
  if (!pieces) {
    pieces = imageSet(set as Exclude<PieceSet, "classic">);
    cache.set(set, pieces);
  }
  return pieces;
}

/** A picture of one piece of `set`, for the Board & pieces list. */
export function pieceImage(set: Exclude<PieceSet, "classic">, name: (typeof NAMES)[number]): string | undefined {
  return files[`../../assets/pieces/${set}/${name}.svg`];
}
