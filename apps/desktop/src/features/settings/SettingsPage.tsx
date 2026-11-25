import { editionDate } from "../../app/editionDate";
import { type EditionChoice, useEdition, useEditionStore } from "../../app/edition";
import { useSession } from "../../api/auth/session";
import { AccountsPanel } from "../account/AccountsPanel";
import { sessionLine } from "../account/cards";
import { useIdentities } from "../account/identities";
import { Masthead } from "../../ui/Masthead";

function EditionCard({ value, label }: { value: "day" | "night"; label: string }) {
  const choice = useEditionStore((s) => s.choice);
  const setChoice = useEditionStore((s) => s.setChoice);
  const current = useEdition();
  const selected = current === value;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => setChoice(value)}
      className={`flex-1 p-3 text-left ${selected ? "border-2 border-ink" : "border border-rule hover:border-ink-2"}`}
    >
      {/* The preview is drawn in the edition it shows, whatever is printed now. */}
      <div data-edition={value} className="border border-rule bg-paper p-4">
        <p className="font-masthead text-[length:var(--text-3xl)] leading-none font-black text-ink">Aa</p>
        <div className="mt-3 border-t-[3px] border-double border-ink" />
        <div className="mt-3 h-2 w-3/4 bg-rule" />
        <div className="mt-2 h-2 w-1/2 bg-rule" />
      </div>
      <span className="label mt-3 flex items-center justify-between text-ink">
        {label}
        {selected ? <span aria-hidden>✓{choice === "system" ? " · system" : ""}</span> : null}
      </span>
    </button>
  );
}

/** Settings. The edition switch is live from M0; accounts and links from P2; board and sounds arrive in M2. */
export function SettingsPage() {
  const edition = useEdition();
  const choice = useEditionStore((s) => s.choice);
  const setChoice = useEditionStore((s) => s.setChoice);
  const status = useSession((s) => s.status);
  const identities = useIdentities((s) => s.list);
  return (
    <>
      <Masthead
        kicker="Settings"
        title="Settings"
        dateline={[
          `${edition} edition`,
          editionDate(new Date()),
          "Saved on this machine",
          sessionLine(status, identities),
        ]}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] py-8">
        <section className="pr-8">
          <h2 className="border-b border-ink pb-3 font-masthead text-[length:var(--text-2xl)] font-bold">Edition</h2>
          <div className="mt-5 flex gap-4">
            <EditionCard value="day" label="Day edition" />
            <EditionCard value="night" label="Night edition" />
          </div>
          <p className="mt-4 font-body text-[length:var(--text-lg)] text-ink-2">
            Night is its own warm palette, not an inverted Day. The change applies to every page at once.
          </p>
          <dl className="mt-6 border-t border-ink">
            <div className="flex items-center justify-between border-b border-rule py-3">
              <dt className="label text-ink">Follow the system</dt>
              <dd>
                <button
                  type="button"
                  role="switch"
                  aria-checked={choice === "system"}
                  onClick={() => setChoice(choice === "system" ? edition : ("system" satisfies EditionChoice))}
                  className="label border border-ink-2 px-3 py-1 text-ink hover:border-ink"
                >
                  {choice === "system" ? "On" : "Off"}
                </button>
              </dd>
            </div>
            <div className="flex items-center justify-between border-b border-rule py-3">
              <dt className="label text-ink">Board &amp; pieces</dt>
              <dd className="font-body text-ink-2">Newsprint · from M2</dd>
            </div>
          </dl>
        </section>
        <AccountsPanel />
      </div>
    </>
  );
}
