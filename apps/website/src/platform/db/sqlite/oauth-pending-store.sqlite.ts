import type { UUID, Clock } from "@jini-ai/core/primitives";

import type { KeyringPort, SecretSealerPort } from "#src/features/webhooks/index";
import type { DeviceAuthorizationStore } from "../../../features/external-mcp/contracts.js";
import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { createSqlDeviceAuthorizationStore } from "../repos/oauth-pending-store.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The cross-process device authorization store on a site's SQLite `content.db`: the one Kysely
 * query body (`repos/oauth-pending-store.ts`, whose header carries the security posture), built
 * from the content db handle so the composition root's calls stay as they are.
 */

export interface SqliteDeviceAuthorizationStoreDeps {
  /** The connection's kernel, or the content db handle it is derived from. */
  readonly db: ContentKernel | ContentDb;
  readonly workspaceId: UUID;
  readonly clock: Clock;
  readonly sealer: Pick<SecretSealerPort, "seal" | "open">;
  readonly keyring: Pick<KeyringPort, "activeKey">;
}

/** {@link createSqlDeviceAuthorizationStore} on `deps.db`, scoped to one workspace. */
export function createSqliteDeviceAuthorizationStore(deps: SqliteDeviceAuthorizationStoreDeps, _optional: Record<string, never> = {}): DeviceAuthorizationStore {
  return createSqlDeviceAuthorizationStore({ ...deps, kernel: contentKernel(deps.db) });
}
