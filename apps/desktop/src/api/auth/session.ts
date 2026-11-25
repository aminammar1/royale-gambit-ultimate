import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { toApiError } from "../problem";

/** What the web layer may know about the signed-in account. The refresh token never comes here. */
export type Account = {
  userId: string;
  role: "guest" | "user";
  accessToken: string;
  /** Unix milliseconds. */
  expiresAt: number;
};

/** The Rust core's answer to every session command. */
export type SessionView = { state: "guest" } | { state: "offline" } | ({ state: "signedIn" } & Account);

type SessionState = {
  /** `loading` until the keychain has been read at start-up. */
  status: "loading" | "guest" | "signedIn" | "offline";
  account?: Account;
};

export const useSession = create<SessionState>(() => ({ status: "loading" }));

function apply(view: SessionView): SessionView {
  if (view.state === "signedIn") {
    const { userId, role, accessToken, expiresAt } = view;
    useSession.setState({ status: "signedIn", account: { userId, role, accessToken, expiresAt } });
  } else {
    useSession.setState({ status: view.state, account: undefined });
  }
  return view;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toApiError(error);
  }
}

const session = async (command: string, args?: Record<string, unknown>) =>
  apply(await call<SessionView>(command, args));

/** The sign-in commands of the Rust core (src-tauri/src/auth/commands.rs). */
export const auth = {
  /** At start-up and when a call is turned away: renews the session from the keychain. */
  restore: () => session("auth_restore"),
  startEmail: (email: string) => call<null>("auth_email_start", { email }),
  /** Signs in, or links the address when someone is already signed in. */
  verifyEmail: (email: string, code: string) => session("auth_email_verify", { email, code }),
  /** Opens lichess.org in the browser and waits for the player to come back. */
  lichess: () => session("auth_lichess"),
  unlinkLichess: () => call<null>("auth_unlink_lichess"),
  signOut: () => session("auth_sign_out"),
  gatewayUrl: () => call<string>("auth_gateway_url"),
};

/** For the fetch client's retry: the new access token, or undefined when the session ended. */
export async function renewAccessToken(): Promise<string | undefined> {
  const view = await auth.restore();
  return view.state === "signedIn" ? view.accessToken : undefined;
}
