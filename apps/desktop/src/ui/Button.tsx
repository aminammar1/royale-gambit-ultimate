import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const styles: Record<Variant, string> = {
  primary: "bg-ink text-paper border border-ink hover:opacity-90",
  secondary: "bg-transparent text-ink border border-ink-2 hover:border-ink",
  ghost: "bg-transparent text-ink border border-transparent underline-offset-4 hover:underline",
};

/** Buttons from DESIGN.md: ink fill, 1px ink border, or ghost with underline. Labels in Plex Sans. */
export function Button({
  variant = "secondary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`label rounded-[var(--radius)] px-4 py-2.5 text-[length:var(--text-sm)] text-ink transition-colors duration-150 disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
