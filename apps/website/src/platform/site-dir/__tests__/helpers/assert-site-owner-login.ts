import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { AuthInvalidCredentialsError } from "@jini-ai/user-management";
import { login } from "@jini-ai/user-management/server";
import { DEFAULT_OWNER_CREDENTIALS, createSqliteIdentityRouteDeps } from "#src/features/identity/wiring";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";
import { identityServiceDepsFrom } from "#src/server/inbound/admin-http/routes/users/deps";
import { openSiteStore } from "#src/server/runtime/composition/open-site-store";
import { readTemplate } from "../../read-template.js";
import { readSiteDir } from "../../read-site-dir.js";

/** Reopens the real store and runs the same seed + login services as first serve, without a listener. */
export async function assertSiteOwnerLogin(
  { dir, password, rejectedPassword }: { dir: string; password: string; rejectedPassword?: string },
  _options: Record<string, never> = {},
): Promise<void> {
  const { meta } = readSiteDir({ dir });
  const store = await openSiteStore({ storage: meta.storage ?? { kind: "sqlite" }, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" });
  try {
    const workspaceId = readTemplate({ templateId: "starter" }).seed.workspace.id;
    const clock = { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() };
    const idGen = { newId: () => randomUUID() };
    // Credentials deliberately omitted here: first serve sees the inherited deployment env.
    const identity = createSqliteIdentityRouteDeps({ ownerCredentials: DEFAULT_OWNER_CREDENTIALS, db: store.content, workspaceId, clock, idGen, permissionGrants: createAppPermissionGrants({}) });
    await identity.identityReady;
    const deps = identityServiceDepsFrom({ ...identity, clock, idGen });
    const input = { workspaceId, username: "admin", password };
    const result = await login({ deps, input });
    assert.equal(result.principal.id, await identity.ownerPrincipalId);
    if (rejectedPassword !== undefined) {
      await assert.rejects(login({ deps, input: { ...input, password: rejectedPassword } }), AuthInvalidCredentialsError);
    }
  } finally {
    await store.close();
  }
}
