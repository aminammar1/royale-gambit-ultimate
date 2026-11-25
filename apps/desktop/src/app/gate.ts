import type { useSession } from "../api/auth/session";
import type { useProfile } from "../db/profile";

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
