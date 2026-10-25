import { describeCredentialByLabel, resolveCustomCredentialByLabel,
  type CustomCredentialResolveDeps } from "../custom-credentials/store.js";
import type { OAuthClient } from "@jini-ai/oauth";
import { MemberLoginError, type LoginProvider } from "./types.js";

/** Card label and exact token URL come from the pinned preset, never a browser or assistant input.
 * @returns False without opening the vault when the matching card is absent/incomplete.
 * @complexity O(c) credential metadata rows, one existing vault-owner read.
 */
export async function hasLoginCredentials(required: {
  deps: CustomCredentialResolveDeps; workspaceId: string; provider: LoginProvider;
}, _options = {}): Promise<boolean> {
  const saved = await describeCredentialByLabel(required.deps, { workspaceId: required.workspaceId, label: required.provider.credentialLabel });
  return Boolean(saved?.username?.trim() && saved.baseUrl === required.provider.tokenEndpoint);
}

/** Open only the provider's own API card. Username = client ID; sealed token = client secret.
 * @throws LOGIN_UNAVAILABLE for absent/misbound credentials and vault failures, with no raw cause.
 * @complexity O(c) metadata selection plus one selected credential-envelope open.
 */
export async function resolveLoginCredentials(required: {
  deps: CustomCredentialResolveDeps; workspaceId: string; provider: LoginProvider;
}, _options = {}): Promise<OAuthClient> {
  try {
    const saved = await resolveCustomCredentialByLabel(required.deps, { workspaceId: required.workspaceId, label: required.provider.credentialLabel });
    if (!saved?.connection.username?.trim() || !saved.connection.token || saved.baseUrl !== required.provider.tokenEndpoint) {
      throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
    }
    return { clientId: saved.connection.username, clientSecret: saved.connection.token, authMethod: required.provider.clientAuthentication };
  } catch {
    throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
  }
}
