import logo from "../assets/logo.png";
import { useEdition } from "../app/edition";

/** Nameplate in the nav: the logo bitmap, the edition line and a double rule. On the rail, the logo alone. */
export function Logo() {
  const edition = useEdition();
  return (
    <div className="rule-double pb-4 max-[1279px]:pb-3">
      <img src={logo} alt="Royal Gambit" className="mx-auto block w-40 max-[1279px]:w-14" draggable={false} />
      <p className="label mt-2 text-center text-ink-2 max-[1279px]:hidden">
        Ultimate · {edition === "day" ? "Day" : "Night"} Edition
      </p>
    </div>
  );
}
