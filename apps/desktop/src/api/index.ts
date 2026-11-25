import { create } from "zustand";
import { auth, renewAccessToken, useSession } from "./auth/session";
import { createApiClient } from "./client";
import type { components } from "./generated/auth-profile";

export type Identity = components["schemas"]["Identity"];

let gatewayUrl: Promise<string> | undefined;

/** The app's one client for gateway calls that carry only an access token. */
export const api = createApiClient({
  baseUrl: () => (gatewayUrl ??= auth.gatewayUrl()),
  accessToken: () => useSession.getState().account?.accessToken,
  refresh: renewAccessToken,
});

/** The ways into the signed-in account, oldest first (contract: listMyIdentities). */
export const listIdentities = () => api.get<Identity[]>("/v1/auth/identities");

/** Whether the gateway answered at start-up: the splash's last line and the sign-in page's notice. */
export const useServer = create<{ status: "checking" | "reachable" | "unreachable" }>(() => ({ status: "checking" }));

export async function checkServer(): Promise<void> {
  useServer.setState({ status: "checking" });
  useServer.setState({ status: (await api.reachable()) ? "reachable" : "unreachable" });
}
