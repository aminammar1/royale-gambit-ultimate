import "flag-icons/css/flag-icons.min.css";

/**
 * A country's flag (flag-icons, 4:3 SVGs loaded on demand). Size it with the font size:
 * the flag is 1.33em wide and 1em tall. Decorative: the name is always printed beside it.
 */
export function Flag({ code, className = "" }: { code: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`fi fi-${code.toLowerCase()} shrink-0 outline outline-1 -outline-offset-1 outline-ink/15 ${className}`}
    />
  );
}
