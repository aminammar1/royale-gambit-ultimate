import type { Champion } from "../app/champions";

/**
 * A champion's grey photo in a 1px ink frame; the initials stand in until a photo exists.
 * `framed={false}` drops the frame, for a frame that stays put while the photos inside it turn.
 */
export function Portrait({
  champion,
  className = "",
  framed = true,
}: {
  champion: Champion;
  className?: string;
  framed?: boolean;
}) {
  return (
    <div className={`overflow-hidden bg-paper-2 ${framed ? "border border-ink" : ""} ${className}`}>
      {champion.portrait ? (
        <img
          src={champion.portrait}
          alt=""
          draggable={false}
          className="size-full object-cover grayscale [[data-edition=night]_&]:brightness-90"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-full items-center justify-center font-masthead text-[length:var(--text-xl)] font-bold text-ink-2"
        >
          {champion.name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)}
        </span>
      )}
    </div>
  );
}
