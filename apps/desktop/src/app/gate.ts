import type { useSession } from "../api/auth/session";
import type { Card, useProfile } from "../db/profile";

type ProfileStatus = ReturnType<typeof useProfile.getState>["status"];
type SessionStatus = ReturnType<typeof useSession.getState>["status"];

/**
 * Where the app must go before it shows `pathname`, or undefined to stay.
 *
 * A machine without a card (and that never chose to go without one) opens on the sign-in page;
 * someone who signs in there goes on to register the card. Once the machine has a card, or chose
 * to go without, the app opens straight on the front page and sign-in stays one click away.
 */
export function gate(profile: ProfileStatus, session: SessionStatus, pathname: string): string | undefined {
  if (profile === "loading" || session === "loading") return undefined;
  const signedIn = session === "signedIn" || session === "offline";

  if (profile === "new") {
    if (signedIn) return pathname.startsWith("/welcome") ? undefined : "/welcome";
    return pathname === "/sign-in" || pathname.startsWith("/welcome") ? undefined : "/sign-in";
  }
  return pathname === "/welcome" ? "/" : undefined;
}

/** The card as the player at the keyboard may see it: an owned card only to its owner. */
export function visibleCard<C extends Pick<Card, "ownerId">>(card: C | undefined, userId: string | undefined) {
  if (!card) return undefined;
  return !card.ownerId || card.ownerId === userId ? card : undefined;
}

/**
 * Where the Start button leads. Like the gate, but it also sends a signed-out owner to sign in,
 * once per launch: after that, "Back to the front page" must be free to stay a guest.
 */
export function startPage(
  profile: Exclude<ProfileStatus, "loading">,
  session: Exclude<SessionStatus, "loading">,
  ownerId: string | null | undefined,
): string {
  const signedIn = session === "signedIn" || session === "offline";
  if (profile === "new") return signedIn ? "/welcome" : "/sign-in";
  if (ownerId && !signedIn) return "/sign-in";
  return "/";
}
