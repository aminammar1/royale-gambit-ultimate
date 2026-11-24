/** Bottom of the nav: the player's card in brief. Shows the guest until registration (M7). */
export function PlayerSlot() {
  return (
    <div className="flex items-center gap-3 border-t border-rule pt-3 max-[1279px]:justify-center">
      <span
        aria-hidden
        className="numeric flex h-8 w-12 items-center justify-center border border-ink-2 text-[length:var(--text-xs)] text-ink-2"
      >
        —
      </span>
      <div className="max-[1279px]:hidden">
        <p className="font-masthead text-[length:var(--text-lg)] leading-tight font-bold">Guest</p>
        <p className="numeric text-[length:var(--text-xs)] text-ink-2">Unregistered</p>
      </div>
    </div>
  );
}
