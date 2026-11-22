/** Tovu's local browser adapter; the server owns production/launcher/peer admission. */
import { readInitialSession } from "@jini-ai/user-management/session-bootstrap";
import { ApiError } from "./admin-http/request";
export interface LocalOwnerSessionPort<T> {
  signInLocalOwner: (required: Record<string, never>, optional?: Record<string, never>) => Promise<unknown>;
  me: () => Promise<T>;
}

/** Avoid sending local-bootstrap requests from deployed browser origins. @complexity O(1). */
export function isLocalOwnerSignInHost({ hostname }: { hostname: string }, _optional = {}): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** Preserve a valid session; bootstrap only an unauthenticated local browser on initial load.
 * The session hook retains this read across effect replays and never invokes it on later 401s.
 * A refused bootstrap preserves the original 401 so the hook settles on ordinary login.
 * @complexity O(1) time/space: at most one bootstrap and two identity reads.
 */
export function readInitialAdminSession<T>(
  required: { hostname: string; port: LocalOwnerSessionPort<T> },
  optional: { onLocalSignIn?: () => void } = {},
): Promise<T> {
  const { hostname, port } = required;
  return readInitialSession<T>({
    me: () => port.me(), bootstrap: () => port.signInLocalOwner({}), admit: () => isLocalOwnerSignInHost({ hostname }),
    isUnauthenticated: ({ error }) => error instanceof ApiError && error.status === 401 && error.code === "UNAUTHENTICATED",
  }, {
    // Settings readers may already have received a pre-cookie 401, just as on password login.
    ...(optional.onLocalSignIn ? { onBootstrapped: optional.onLocalSignIn } : {}),
  });
}
