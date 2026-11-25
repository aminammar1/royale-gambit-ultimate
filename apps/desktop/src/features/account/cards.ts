import type { Identity } from "../../api";
import { shortDate } from "../../app/editionDate";

export type CardAction = "link" | "unlink" | "none" | "notYet";

export type CredentialCard = {
  no: number;
  provider: "lichess" | "email" | "chesscom";
  title: string;
  linked: boolean;
  detail: string;
  action: CardAction;
};

/** "12 Nov 2026", in the player's own time zone. */
export const since = (iso: string) => shortDate(new Date(iso));

const find = (identities: Identity[] | undefined, provider: Identity["provider"]) =>
  identities?.find((i) => i.provider === provider);

const linkedAs = (identity: Identity) => `Linked as ${identity.label} · since ${since(identity.linked_at)}`;

/** The Settings credential cards, in the board's order. */
export function credentialCards(identities: Identity[] | undefined): CredentialCard[] {
  const lichess = find(identities, "lichess");
  const email = find(identities, "email");
  return [
    {
      no: 1,
      provider: "lichess",
      title: "Lichess",
      linked: Boolean(lichess),
      detail: lichess ? linkedAs(lichess) : "Not linked · sign in with Lichess",
      action: lichess ? "unlink" : "link",
    },
    {
      no: 2,
      provider: "email",
      title: "Email",
      linked: Boolean(email),
      detail: email ? linkedAs(email) : "Not linked · used only to restore your card",
      // There is no unlinking an address: it is the way back in when Lichess is gone.
      action: email ? "none" : "link",
    },
    {
      no: 3,
      provider: "chesscom",
      title: "Chess.com",
      linked: false,
      detail: "Coming in a later edition",
      action: "notYet",
    },
  ];
}

/** The name on the player's card: the Lichess name if there is one, else the address. */
export function playerName(identities: Identity[] | undefined): string | undefined {
  return (find(identities, "lichess") ?? find(identities, "email"))?.label;
}

/** The last cell of the Settings dateline. */
export function sessionLine(status: "loading" | "guest" | "signedIn" | "offline", identities: Identity[] | undefined) {
  if (status === "offline") return "Offline";
  if (status !== "signedIn") return "Guest";
  if (find(identities, "lichess")) return "Signed in · Lichess";
  if (find(identities, "email")) return "Signed in · Email";
  return "Signed in";
}

/** How this account signs in, as the card remembers it: "Lichess · kingside_tal". */
export function signInLabel(identities: Identity[] | undefined): string | undefined {
  const lichess = find(identities, "lichess");
  if (lichess) return `Lichess · ${lichess.label}`;
  const email = find(identities, "email");
  return email ? `Email · ${email.label}` : undefined;
}
