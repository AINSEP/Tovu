/**
 * @file The Google Workspace sign-in hooks (the `lib/auth.mjs` module `tovu-connections.json`
 * names): which scopes a sign-in requests, who signed in, and how a grant is revoked at Google.
 *
 * Exists because the host's OAuth engine is provider-neutral: Google's endpoints live in
 * `tovu-connections.json`, and everything Google-specific the engine must call back into lives
 * here. The engine handles state, PKCE, the code exchange, refresh and token storage.
 *
 * Revocation honesty: `revoke` resolves only when Google answered 200, or answered `invalid_token`
 * (the token is already revoked: a retry after a lost answer resends a token Google already
 * revoked, and the host's engine requires that to count as success). Both clients request offline
 * access, so the engine hands over the refresh token, whose `invalid_token` means the grant is gone;
 * only a credential stored without a refresh token could see it for a merely expired access token.
 * Anything else throws, so the host shows "Disconnected locally; Google revocation pending", keeps
 * the disabled sealed credential for a retry, and the person can remove access at
 * {@link GOOGLE_ACCOUNT_ACCESS_PAGE}.
 */
import { readAccount } from './drive-files.mjs';
import { createGoogleClient } from './http.mjs';
import { scopesFor } from './product-state.mjs';

export const GOOGLE_REVOCATION_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
/** Where a person removes Tovu's access themselves ("Third-party apps & services"). */
export const GOOGLE_ACCOUNT_ACCESS_PAGE = 'https://myaccount.google.com/connections';

const REVOCATION_PENDING = 'Google did not confirm the revocation. Disconnected locally; Google revocation pending. Retry, or remove access at https://myaccount.google.com/connections.';

/**
 * Asks Google to revoke the grant behind `token` (the refresh token when there is one, which ends
 * the whole grant). Throws unless Google confirmed, or said the token is already revoked.
 * @complexity O(1): one request.
 */
async function revokeAtGoogle(http, token) {
  let response;
  try {
    response = await http.fetch({ url: GOOGLE_REVOCATION_ENDPOINT }, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString(),
    });
  } catch (cause) {
    throw new Error(REVOCATION_PENDING, { cause });
  }
  if (response.status !== 200 && !(await alreadyRevoked(response))) throw new Error(REVOCATION_PENDING);
}

/** Google's "this token is already revoked" answer (400 `invalid_token`); an unreadable body is not it. */
async function alreadyRevoked(response) {
  if (response.status !== 400) return false;
  const body = await response.json().catch(() => null);
  return body?.error === 'invalid_token';
}

/**
 * The hooks the host's API-connection service calls (`ApiConnectionHooks`).
 * @param {{ http: { fetch(target: { url: string }, init?: RequestInit): Promise<Response> } }} required
 *   The host's guarded HTTP capability (the same one tools get).
 * @complexity O(1) to build; each hook is at most one request.
 */
export function createHooks(required, _optional = {}) {
  const { http } = required;
  return {
    async resolveScopes({ scopeSetIds }) { return scopesFor({ productIds: scopeSetIds }); },
    async readAccount({ accessToken }) {
      // A freshly issued token, not a stored connection yet: the client asks for no budget.
      const client = createGoogleClient({ http, connections: { getAccessToken: async () => accessToken } });
      return readAccount({ client, connectionRef: 'sign-in' });
    },
    async revoke({ token }) { await revokeAtGoogle(http, token); },
  };
}

export default { createHooks };
