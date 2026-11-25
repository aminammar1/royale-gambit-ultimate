import type { Champion } from "../app/champions";

/** A champion's grey photo in a 1px ink frame; the initials stand in until a photo exists. */
export function Portrait({ champion, className = "" }: { champion: Champion; className?: string }) {
  return (
    <div className={`overflow-hidden border border-ink bg-paper-2 ${className}`}>
      {champion.portrait ? (
        <img
          src={champion.portrait}
          alt=""
          draggable={false}
          className="size-full object-cover grayscale [[data-edition=night]_&]:brightness-[0.82] [[data-edition=night]_&]:contrast-[0.92]"
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
