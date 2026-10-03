import type { UUID } from "@jini-ai/core/primitives";

import type { KeyringPort, SecretSealerPort } from "#src/features/webhooks/index";
import type { DeviceAuthorizationStore } from "#src/assistant/external-mcp-oauth";
import type { OAuthClock, OAuthRandomBytes, PendingAuthorizationStore } from "#src/platform/oauth/index";
import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { createSqlDeviceAuthorizationStore, createSqlPendingAuthorizationStore } from "../repos/oauth-pending-store.js";
import type { ContentDb } from "./content-db.js";

export { deviceAad } from "../repos/oauth-pending-store.js";

/**
 * @file The cross-process OAuth handshake stores on a site's SQLite `content.db`: the one Kysely
 * query body (`repos/oauth-pending-store.ts`, whose header carries the security posture), built
 * from the content db handle so the composition root's calls stay as they are.
 */

export interface SqlitePendingAuthorizationStoreDeps {
  /** The connection's kernel, or the content db handle it is derived from. */
  readonly db: ContentKernel | ContentDb;
  readonly clock: OAuthClock;
  readonly sealer: Pick<SecretSealerPort, "seal" | "open">;
  readonly keyring: Pick<KeyringPort, "activeKey">;
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  /** Injected only so tests can pin `state`. Defaults to `node:crypto`'s CSPRNG. */
  readonly randomBytesFn?: OAuthRandomBytes;
}

/** {@link createSqlPendingAuthorizationStore} on `deps.db`. */
export function createSqlitePendingAuthorizationStore(deps: SqlitePendingAuthorizationStoreDeps): PendingAuthorizationStore {
  return createSqlPendingAuthorizationStore({ ...deps, kernel: contentKernel(deps.db) });
}

export interface SqliteDeviceAuthorizationStoreDeps {
  /** The connection's kernel, or the content db handle it is derived from. */
  readonly db: ContentKernel | ContentDb;
  readonly workspaceId: UUID;
  readonly clock: OAuthClock;
  readonly sealer: Pick<SecretSealerPort, "seal" | "open">;
  readonly keyring: Pick<KeyringPort, "activeKey">;
}

/** {@link createSqlDeviceAuthorizationStore} on `deps.db`, scoped to one workspace. */
export function createSqliteDeviceAuthorizationStore(deps: SqliteDeviceAuthorizationStoreDeps): DeviceAuthorizationStore {
  return createSqlDeviceAuthorizationStore({ ...deps, kernel: contentKernel(deps.db) });
}
