import { defaultPieces, type PieceRenderObject } from "react-chessboard";
import type { PieceSet } from "../../db/settings";

// The bundled sets, by file: src/assets/pieces/<set>/<colour><piece>.svg or .png (credits there).
const files = import.meta.glob<string>("../../assets/pieces/*/*.{svg,png}", { eager: true, import: "default" });
const fileOf = (set: string, name: string) =>
  files[`../../assets/pieces/${set}/${name}.svg`] ?? files[`../../assets/pieces/${set}/${name}.png`];

/** The 3D renders (a raised view, taller than wide). */
const tall = (set: PieceSet) => set.startsWith("staunton-");

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
      const src = fileOf(set, name);
      // The 3D renders are taller than wide (a raised view): fit them whole, standing on the
      // bottom of their square, so the back rank is never cut by the board's edge.
      const style: React.CSSProperties = tall(set)
        ? {
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "center 85%",
            transform: "scale(1.08)",
          }
        : { width: "100%", height: "100%" };
      return [
        name,
        (props?: { svgStyle?: React.CSSProperties }) => (
          <img src={src} alt="" draggable={false} style={{ ...style, ...props?.svgStyle }} />
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
  return fileOf(set, name);
}
