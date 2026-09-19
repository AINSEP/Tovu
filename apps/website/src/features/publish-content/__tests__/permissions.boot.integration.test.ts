import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createSqliteIdentityRouteDeps } from "#src/features/identity/wiring";
// Side-effect import: registers the Task 9 grants under test. Reached directly rather than via the
// `publish-content` server module (which would drag in every route's Express wiring just for
// this), mirroring `wiring.test.ts`'s side-effect import of the Pages permission module.
import "#src/features/publish-content/permissions";

/**
 * @file Task 9 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.2/§4 task 9.
 *
 * ## Why this runs against a COPY of the real `sites/tovu-com/content.db`, not a fresh or simulated one
 *
 * `publish_content.read`/`publish_content.apply` are granted directly to the built-in `admin`
 * role (`permissions.ts`), not fanned out from an existing anchor permission, so — unlike
 * `pages.edit_html` — there is no "pre-anchor vintage" this repo's real database could be missing.
 * What matters instead is the much more literal question the plan's Task 9 acceptance row asks:
 * does booting identity wiring against THIS repo's actual, already-deployed `content.db` — with
 * whatever real rows, real policies, and real prior migrations it already carries — actually add
 * both grants to its real `admin-builtin-policy`. A fresh or hand-built fixture would only prove the
 * mechanism works in principle; it would not catch a real file with, say, an unexpected extra
 * `admin-builtin-policy` row, a differently-cased policy name, or any other real-world drift a
 * synthetic fixture can't reproduce.
 *
 * The real file is only ever READ (via `fs.copyFileSync`) into a throwaway temp directory. Nothing
 * in this file opens `sites/tovu-com/content.db` itself for writing, or at all.
 */

/** Walked up from this test's own directory rather than guessed, same discipline as
 *  `chat-orphan-check.integration.test.ts`'s `DEPS_PATH` — a miscounted `..` fails loudly with an
 *  ENOENT instead of silently testing the wrong file. */
const REAL_CONTENT_DB_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../sites/tovu-com/content.db"
);

/** The workspace slug/id this repo's real `content.db` seeds itself under (`workspaces.slug =
 *  'local-tovu'`, `workspaces.id = 'workspace-local'`) — verified directly against the file with
 *  `sqlite3 sites/tovu-com/content.db "select id, slug from workspaces"` while writing this test. */
const REAL_WORKSPACE_ID = "workspace-local";

const PUBLISH_CONTENT_READ = "publish_content.read";
const PUBLISH_CONTENT_APPLY = "publish_content.apply";

const fixedClock = { nowIso: () => "2026-09-18T00:00:00.000Z" };

function counterIdGen(prefix: string) {
  let n = 0;
  return { newId: () => `${prefix}-${++n}` };
}

/**
 * Copy the real content.db (plus its WAL/SHM sidecars, if present, so the copy reflects the same
 * committed state a fresh `better-sqlite3` connection to the original would see) into a fresh temp
 * directory. The original is opened nowhere in this file — only ever as the SOURCE of a
 * `copyFileSync`.
 */
function copyRealContentDbToTempDir(): { readonly dir: string; readonly dbPath: string } {
  assert.ok(
    fs.existsSync(REAL_CONTENT_DB_PATH),
    `expected the real content.db at ${REAL_CONTENT_DB_PATH} — this test needs an already-seeded ` +
      "workspace to certify against; adjust REAL_CONTENT_DB_PATH if the fixture moved"
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-content-perm-boot-test-"));
  const dbPath = path.join(dir, "content.db");
  fs.copyFileSync(REAL_CONTENT_DB_PATH, dbPath);
  for (const sidecar of ["-wal", "-shm"]) {
    const source = `${REAL_CONTENT_DB_PATH}${sidecar}`;
    if (fs.existsSync(source)) fs.copyFileSync(source, `${dbPath}${sidecar}`);
  }
  return { dir, dbPath };
}

/** Boot identity wiring (seed + both boot-time grant/migration reconciliation steps) against a
 *  fresh copy of the real content.db, and wait for it to settle. */
async function bootAgainstRealContentDbCopy(dbPath: string, idPrefix: string) {
  const db = openContentDb(dbPath);
  const deps = createSqliteIdentityRouteDeps({
    db,
    workspaceId: REAL_WORKSPACE_ID,
    clock: fixedClock,
    idGen: counterIdGen(idPrefix),
  });
  await deps.identityReady;
  return deps;
}

async function permissionsOfBuiltinPolicy(
  deps: Awaited<ReturnType<typeof bootAgainstRealContentDbCopy>>,
  policyName: string
): Promise<string[]> {
  const policy = await deps.policyRepo.findByName({ workspaceId: REAL_WORKSPACE_ID, name: policyName });
  assert.ok(policy, `the real content.db must already have a '${policyName}' row`);
  const grants = await deps.policyPermissionRepo.listByPolicyId({
    workspaceId: REAL_WORKSPACE_ID,
    policyId: policy.id,
  });
  return grants.map((row) => row.permission);
}

test("booting against a COPY of the real, already-seeded content.db grants publish_content.read and publish_content.apply to admin", async () => {
  const { dir, dbPath } = copyRealContentDbToTempDir();
  try {
    const deps = await bootAgainstRealContentDbCopy(dbPath, "boot");

    const adminPermissions = await permissionsOfBuiltinPolicy(deps, "admin-builtin-policy");

    assert.ok(
      adminPermissions.includes(PUBLISH_CONTENT_READ),
      "admin must hold publish_content.read after boot reconciles the real content.db"
    );
    assert.ok(
      adminPermissions.includes(PUBLISH_CONTENT_APPLY),
      "admin must hold publish_content.apply after boot reconciles the real content.db"
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("editor and viewer do NOT gain publish_content.read or publish_content.apply", async () => {
  const { dir, dbPath } = copyRealContentDbToTempDir();
  try {
    const deps = await bootAgainstRealContentDbCopy(dbPath, "boot");

    for (const policyName of ["editor-builtin-policy", "viewer-builtin-policy"]) {
      const permissions = await permissionsOfBuiltinPolicy(deps, policyName);
      assert.ok(
        !permissions.includes(PUBLISH_CONTENT_READ),
        `${policyName} must NOT gain publish_content.read`
      );
      assert.ok(
        !permissions.includes(PUBLISH_CONTENT_APPLY),
        `${policyName} must NOT gain publish_content.apply`
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("re-running boot against the same already-migrated copy is idempotent — no duplicate grant rows", async () => {
  const { dir, dbPath } = copyRealContentDbToTempDir();
  try {
    await bootAgainstRealContentDbCopy(dbPath, "first");

    // "Restart": a brand-new content.db handle + a brand-new createSqliteIdentityRouteDeps call
    // over the SAME, already-migrated file — same technique as `wiring.test.ts`'s own
    // simulated-restart test.
    const second = await bootAgainstRealContentDbCopy(dbPath, "second");

    const adminPermissions = await permissionsOfBuiltinPolicy(second, "admin-builtin-policy");
    const readCount = adminPermissions.filter((permission) => permission === PUBLISH_CONTENT_READ).length;
    const applyCount = adminPermissions.filter((permission) => permission === PUBLISH_CONTENT_APPLY).length;

    assert.equal(readCount, 1, "re-running boot must not duplicate the publish_content.read row");
    assert.equal(applyCount, 1, "re-running boot must not duplicate the publish_content.apply row");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
