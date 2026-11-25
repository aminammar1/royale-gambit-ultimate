import { shortDate } from "../app/editionDate";
import { Flag } from "./Flag";

type Props = {
  /** Six digits once registered; a draft card shows dashes. */
  cardNo?: string;
  username?: string;
  country?: { code: string; name: string; alpha3: string };
  issuedAt: Date;
  draft?: boolean;
};

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-rule px-3 py-2.5 not-first:border-l">
      <p className="label text-ink-2">{label}</p>
      <p className="numeric mt-1 text-[length:var(--text-xl)] text-ink">{value}</p>
      <p className="font-body text-[length:var(--text-sm)] text-ink-2">{note}</p>
    </div>
  );
}

/** The federation player card: drafted on the Welcome page, then the player's badge. */
export function PlayerCard({ cardNo, username, country, issuedAt, draft = false }: Props) {
  return (
    <div className="border-[3px] border-double border-ink p-1">
      <div className="border border-ink px-5 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-4 border-b-[3px] border-double border-ink pb-2">
          <span className="label truncate text-ink">Royal Gambit Federation · Player</span>
          <span className="numeric shrink-0 text-ink">No. {cardNo ?? "—"}</span>
        </div>
        <div className="flex items-center gap-5 py-5">
          <div
            aria-hidden
            className="flex h-20 w-24 shrink-0 flex-col items-center justify-center border border-ink-2 bg-paper-2"
          >
            {country ? (
              <Flag code={country.code} className="text-[2rem]" />
            ) : (
              <span className="label text-ink-2">Flag</span>
            )}
            <span className="numeric mt-1 text-[length:var(--text-xs)] text-ink">{country?.alpha3 ?? "—"}</span>
          </div>
          <div className="min-w-0">
            <p className="label text-ink-2">{draft ? "Registration in progress" : "Registered player"}</p>
            <p
              className={`truncate font-masthead text-[length:var(--text-2xl)] leading-tight font-bold italic ${username ? "text-ink" : "text-ink-2"}`}
            >
              {username || "Your name here"}
            </p>
            <p className="font-body text-[length:var(--text-md)] text-ink-2 italic">
              {country?.name ?? "Country not chosen"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 border-y border-ink">
          <Stat label="Rating" value="1500" note="Provisional" />
          <Stat label="Games" value="0" note="None filed yet" />
          <Stat label="Score" value="—" note="After 5 games" />
        </div>
        <div className="label flex justify-between pt-3 text-ink-2">
          <span>Issued {shortDate(issuedAt)}</span>
          <span>Held on this machine</span>
        </div>
      </div>
    </div>
  );
}
