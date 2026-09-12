import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getEffective, ValueValidationFailedError } from "#src/features/settings/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createSqliteRouteDepsForWorkspace } from "#src/server/runtime/composition/deps";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file SPEC-050 REQ-08 (AC-14) in both composition roots. `RouteDeps.set` is the settings write every
 * assistant module takes as an injected dep, and the agent daemon builds its `RouteDeps` from exactly
 * these two factories (`agent-daemon-server.ts`: `createRouteDeps()` under `TOVU_DB=memory`, else
 * `createSqliteRouteDepsForWorkspace`). The admin route binds the same `set` directly, asserted over
 * HTTP in `site-title.integration.test.ts`.
 *
 * `authorize` is an allow-all shim, so a write that reaches the ledger succeeds. A rejection here can
 * only come from the title bounds, never from a missing grant.
 */

const REJECTION = "value for 'core.site.title' must be 1..200 characters after trimming";
const allowAll = async () => ({ allowed: true, reason: "test" });

type SiteTitleWriteDeps = Pick<RouteDeps, "set" | "settingsRepo" | "clock" | "idGen" | "principalRepo" | "workspaceId">;

function writeSiteTitle(deps: SiteTitleWriteDeps, value: string) {
  return deps.set({
    deps: { repo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen, authorize: allowAll, principals: deps.principalRepo },
    input: {
      namespace: "core.site",
      key: "title",
      scope: "workspace",
      workspaceId: deps.workspaceId,
      authWorkspaceId: deps.workspaceId,
      value,
      callerPrincipalId: "owner-principal",
    },
  });
}

async function storedTitle(deps: SiteTitleWriteDeps): Promise<unknown> {
  const resolved = await getEffective(
    { repo: deps.settingsRepo },
    { namespace: "core.site", key: "title", scopeContext: { workspaceId: deps.workspaceId } }
  );
  return resolved?.value;
}

async function assertRootEnforcesTitleBounds(deps: SiteTitleWriteDeps, root: string): Promise<void> {
  const accepted = await writeSiteTitle(deps, "  Roots Title  ");
  assert.equal(accepted.value, "Roots Title", `${root}: the returned value is the trimmed string`);
  assert.equal(await storedTitle(deps), "Roots Title", `${root}: the stored value is the trimmed string`);

  for (const invalid of ["", "   ", "x".repeat(201)]) {
    await assert.rejects(
      () => writeSiteTitle(deps, invalid),
      (err: unknown) => {
        assert.ok(err instanceof ValueValidationFailedError, `${root}: expected ValueValidationFailedError, got ${String(err)}`);
        assert.equal(err.message, REJECTION);
        return true;
      },
      `${root}: length ${invalid.length} must be rejected`
    );
  }
  assert.equal(await storedTitle(deps), "Roots Title", `${root}: a rejected write changes nothing stored`);
}

test("REQ-08: the in-memory root's RouteDeps.set trims a core.site.title write and rejects a blank or over-200-character one", async () => {
  const deps = createRouteDeps();
  await deps.siteTitleReady;

  await assertRootEnforcesTitleBounds(deps, "createRouteDeps");
});

test("REQ-08: the SQLite root the agent daemon builds (createSqliteRouteDepsForWorkspace) enforces the same bounds", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-title-write-"));
  try {
    const deps = createSqliteRouteDepsForWorkspace(undefined, path.join(dir, "content.db"));
    // Same settle as `create-sqlite-route-deps-for-workspace.integration.test.ts`: the boot-time
    // installers must finish before the temp dir is removed.
    await Promise.all([
      deps.identityReady,
      deps.settingsReady,
      deps.seoReady,
      deps.commentsReady,
      deps.commentsSettingsReady,
      deps.executionSettingsReady,
      deps.settingsUiTabsReady,
      deps.analyticsSettingsReady,
      deps.siteTitleReady,
    ]);

    await assertRootEnforcesTitleBounds(deps, "createSqliteRouteDepsForWorkspace");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
