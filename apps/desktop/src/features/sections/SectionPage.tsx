import { Link } from "react-router";
import { editionDate } from "../../app/editionDate";
import { useEdition } from "../../app/edition";
import type { Section } from "../../app/sections";
import { BoardPlaceholder } from "../../ui/BoardPlaceholder";
import { Kicker } from "../../ui/Kicker";
import { Masthead } from "../../ui/Masthead";

/** A section whose page is not built yet: the masthead and a printed notice of when it opens. */
export function SectionPage({ section }: { section: Section }) {
  const edition = useEdition();
  const opens = section.opensIn;
  return (
    <>
      <Masthead
        kicker={section.kicker}
        title={section.title}
        dateline={[
          `${edition} edition`,
          editionDate(new Date()),
          "In preparation",
          opens ? `Goes to press in ${opens.milestone}` : "",
        ]}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] py-8">
        <section className="pr-8">
          <Kicker>Notice to readers</Kicker>
          <p className="mt-5 font-masthead text-[length:var(--text-2xl)] leading-snug font-bold">
            This page is being set in type.
          </p>
          <p className="mt-3 font-body text-[length:var(--text-lg)] text-ink-2">{opens?.what}</p>
          <p className="mt-6">
            <Link to="/" className="label border-b border-ink pb-0.5 text-ink">
              Back to the front page →
            </Link>
          </p>
        </section>
        <section className="border-l border-rule pl-8">
          {section.board ? (
            <div className="mx-auto max-w-[36rem]">
              <BoardPlaceholder label={`${section.title}: board placeholder`} />
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center border border-dashed border-ink-2">
              <span className="label text-ink-2">Reserved for {section.title.toLowerCase()}</span>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
