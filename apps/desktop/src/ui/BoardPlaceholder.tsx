const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

/**
 * The printed board without pieces (board "Part · board placeholder"): Newsprint preset, ink dark
 * squares, hatched paper light squares, coordinates in the corners. Pure drawing, no chess logic.
 */
export function BoardPlaceholder({
  label = "Empty board",
  coordinates = true,
}: {
  label?: string;
  coordinates?: boolean;
}) {
  return (
    <div role="img" aria-label={label} className="grid aspect-square w-full grid-cols-8 border border-ink">
      {Array.from({ length: 64 }, (_, i) => {
        const rank = 8 - Math.floor(i / 8);
        const file = i % 8;
        const light = (rank + file) % 2 === 1;
        return (
          <div key={i} className={`relative ${light ? "board-light" : "board-dark"}`}>
            {coordinates && file === 0 ? (
              <span className="numeric absolute top-0.5 left-1 text-[length:var(--text-xs)] leading-none font-medium">
                {rank}
              </span>
            ) : null}
            {coordinates && rank === 1 ? (
              <span className="numeric absolute right-1 bottom-0.5 text-[length:var(--text-xs)] leading-none font-medium">
                {FILES[file]}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
