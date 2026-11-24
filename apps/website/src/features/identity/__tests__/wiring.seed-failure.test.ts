import assert from "node:assert/strict";
import test from "node:test";
import { FirstOwnerPasswordRequiredError } from "../first-owner-password.js";
import { createInMemoryIdentityRouteDeps } from "../wiring.js";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";
import { DEFAULT_OWNER_CREDENTIALS } from "../wiring.js";

/** A failed first-boot seed must surface through `identityReady` (what boot awaits) and nowhere else as an unhandled rejection. */
test("a failed owner seed rejects identityReady once and leaves no unhandled rejection from the forked ownerPrincipalId", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  try {
    let n = 0;
    const deps = createInMemoryIdentityRouteDeps({
      ownerCredentials: DEFAULT_OWNER_CREDENTIALS,
      permissionGrants: createAppPermissionGrants({}),
      workspaceId: "workspace-1" as never,
      clock: { nowIso: () => "2026-07-14T00:00:00.000Z", nowMs: () => Date.parse("2026-07-14T00:00:00.000Z") },
      idGen: { next: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` } as never,
      ownerEnv: { TOVU_RUNTIME_MODE: "production" },
    });
    await assert.rejects(deps.identityReady, FirstOwnerPasswordRequiredError);
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, [], "the boot must see ONE readable error, not an unhandled rejection");
    // The fork still reports the failure to anyone who awaits it.
    await assert.rejects(deps.ownerPrincipalId, FirstOwnerPasswordRequiredError);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});
