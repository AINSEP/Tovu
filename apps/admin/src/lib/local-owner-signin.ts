/** Tovu's local browser adapter; the server owns production/launcher/peer admission. */
import { ApiError } from "./api";
export interface LocalOwnerSessionPort<T> {
  signInLocalOwner: (required: Record<string, never>, optional?: Record<string, never>) => Promise<unknown>;
  me: () => Promise<T>;
}

/** Avoid sending local-bootstrap requests from deployed browser origins. @complexity O(1). */
export function isLocalOwnerSignInHost({ hostname }: { hostname: string }, _optional = {}): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** Try the server's guarded bootstrap, then read the ordinary identity/permissions response.
 * Any rejected bootstrap (including every non-2xx API response) returns null, without a retry
 * or identity read, and leaves the normal login flow in charge. Only the initial page read uses it.
 * @complexity O(1): at most two bounded API requests, no raw boot token returned to JavaScript.
 */
export async function tryLocalOwnerSession<T>(
  { hostname, port }: { hostname: string; port: LocalOwnerSessionPort<T> }, _optional = {},
): Promise<T | null> {
  if (!isLocalOwnerSignInHost({ hostname })) return null;
  try {
    await port.signInLocalOwner({});
    return await port.me();
  } catch { return null; }
}

/** Preserve a valid session; bootstrap only an unauthenticated local browser on initial load.
 * The session hook retains this read across effect replays and never invokes it on later 401s.
 * A refused bootstrap preserves the original 401 so the hook settles on ordinary login.
 * @complexity O(1) time/space: at most one bootstrap and two identity reads.
 */
export async function readInitialAdminSession<T>(
  required: { hostname: string; port: LocalOwnerSessionPort<T> },
  { onLocalSignIn }: { onLocalSignIn?: () => void } = {},
): Promise<T> {
  try { return await required.port.me(); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || error.code !== "UNAUTHENTICATED") throw error;
    const session = await tryLocalOwnerSession(required);
    if (session === null) throw error;
    // Settings readers may already have received a pre-cookie 401, just as on password login.
    onLocalSignIn?.();
    return session;
  }
}
