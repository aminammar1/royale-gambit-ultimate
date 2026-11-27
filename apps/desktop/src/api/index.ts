import { create } from "zustand";
import { auth, renewAccessToken, useSession } from "./auth/session";
import { createAnalysisClient } from "./analysis";
import { createApiClient } from "./client";
import { createExplorerApi } from "./explorer";
import { createGamesApi } from "./games";
import type { components } from "./generated/auth-profile";

export type Identity = components["schemas"]["Identity"];

let gatewayUrl: Promise<string> | undefined;

/** The app's one client for gateway calls that carry only an access token. */
export const api = createApiClient({
  baseUrl: () => (gatewayUrl ??= auth.gatewayUrl()),
  accessToken: () => useSession.getState().account?.accessToken,
  refresh: renewAccessToken,
});

export type { Analysis, EngineLine } from "./analysis";

/** The engine on the server, streamed; a guest without an account gets a guest token. */
export const analysis = createAnalysisClient({
  baseUrl: () => (gatewayUrl ??= auth.gatewayUrl()),
  sessionToken: () => useSession.getState().account?.accessToken,
  renewSession: renewAccessToken,
});

/** The ways into the signed-in account, oldest first (contract: listMyIdentities). */
export const listIdentities = () => api.get<Identity[]>("/v1/auth/identities");

/** Whether the gateway answered at start-up: the splash's last line and the sign-in page's notice. */
export const useServer = create<{ status: "checking" | "reachable" | "unreachable" }>(() => ({ status: "checking" }));

export async function checkServer(): Promise<void> {
  useServer.setState({ status: "checking" });
  useServer.setState({ status: (await api.reachable()) ? "reachable" : "unreachable" });
}

export type Profile = components["schemas"]["Profile"];
export type ProfileWrite = components["schemas"]["ProfileWrite"];

/** The signed-in account's card on the server, or undefined when it has none yet (404). */
export async function getMyProfile(): Promise<Profile | undefined> {
  try {
    return await api.get<Profile>("/v1/profile");
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) return undefined;
    throw error;
  }
}

/** Creates or replaces the account's card; the server keeps the newest edit (contract: putMyProfile). */
export const putMyProfile = (write: ProfileWrite) => api.put<Profile>("/v1/profile", write);

export type { Game, GameSummary, ImportJob, PlayerStats, SaveResult, Search, Site } from "./games";

/** The signed-in player's games: the Library's search, imports and the player card. */
export const games = createGamesApi(api);

export type { Explorer, ExplorerDb, ExplorerMove, TopGame } from "./explorer";

/** The opening explorer; a guest reads the masters database too. */
export const explorer = createExplorerApi(analysis.get);
