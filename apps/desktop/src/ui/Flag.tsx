import "flag-icons/css/flag-icons.min.css";

/**
 * A country's flag (flag-icons, 4:3 SVGs loaded on demand). Size it with the font size:
 * the flag is 1.33em wide and 1em tall. Decorative: the name is always printed beside it.
 */
export function Flag({ code, className = "", fill = false }: { code: string; className?: string; fill?: boolean }) {
  if (fill) {
    // Cover the frame edge to edge instead of the library's contained 4:3 box.
    return (
      <span
        aria-hidden
        className={`fi fi-${code.toLowerCase()} block ${className}`}
        // Inline: flag-icons' own width (1.333em) beats a utility class.
        style={{ width: "100%", height: "100%", backgroundSize: "cover", backgroundPosition: "center" }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`fi fi-${code.toLowerCase()} shrink-0 outline outline-1 -outline-offset-1 outline-ink/15 ${className}`}
    />
  );
}
