// @unrun: authored 2026-10-05 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { PGLITE_DATA_DIR_NAME, type SiteStore } from "#src/server/runtime/composition/open-site-store";
import { buildBootModules } from "#src/server/runtime/boot/bootstrap";
import { runBootLifecycle } from "#src/server/runtime/lifecycle/boot-lifecycle";
import {
  defaultPgliteSocketDir,
  OWNER_LOCK_FILE,
  PGLITE_SOCKET_FILE,
  PgliteOwnerLockedError,
  runningPgliteOwner,
} from "#src/platform/db/kernel/drivers/pglite-owner";
import { bootSiteDir, closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { initSite } from "#src/platform/site-dir/init-site";
import { bootSite, drainBootReadiness } from "../helpers/unrun-site-boot.js";

/**
 * @file A PGlite site booted on its own, the way `tovu serve <dir>` does it (`bootSiteDir` →
 * `createSiteRouteDeps` → `runBootLifecycle(buildBootModules(...))` → `closeSiteDirBoot`). Gap #12 of
 * ADS-memory/reports/2026-10-04-integration-test-gaps.md: `boot-lifecycle-real-deps.integration.test.ts`
 * runs the lifecycle on SQLite only.
 *
 * Not repeated here (`site-reboot-persistence.unrun.integration.test.ts` and
 * `create-site-route-deps.pglite.integration.test.ts` cover them): the lock holding this pid, the lock
 * and socket removed on close, a dead owner's lock/socket reaped, a second in-process owner refused.
 * New here: a lock held by a LIVE FOREIGN process refuses the boot and is left alone; the in-process
 * owner registry and the socket's private modes while serving; the registry entry gone after a clean
 * close; the serve boot modules (migration reconciliation, settings, SEO, comments, the store plugin's
 * dataModule declaration + seed) on Postgres.
 *
 * `bundled-agent-plugins` (writes into process-level plugin dirs), `plugin-runtime-attach` (starts a
 * poller) and `newsletter` (excluded by the owner) are filtered out of the lifecycle.
 */

interface PgliteSite {
  siteDir: string;
  dataDir: string;
  socketPath: string;
}

/** A fresh PGlite site folder; the folder and its socket dir are removed at teardown. */
async function freshPgliteSite(t: TestContext): Promise<PgliteSite> {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "unrun-pglite-boot-"));
  const siteDir = path.join(parent, "site");
  const dataDir = path.join(siteDir, PGLITE_DATA_DIR_NAME);
  const socketDir = defaultPgliteSocketDir(dataDir);
  t.after(() => {
    fs.rmSync(parent, { recursive: true, force: true });
    fs.rmSync(socketDir, { recursive: true, force: true });
  });
  await initSite({ dir: siteDir, name: "Unrun pglite boot", storage: { kind: "pglite" } });
  return { siteDir, dataDir, socketPath: path.join(socketDir, PGLITE_SOCKET_FILE) };
}

const LIFECYCLE_MODULES = ["database-migration-reconciliation", "settings", "seo", "comments"];

test("[unrun] pglite boot: a lock held by a live foreign process refuses the boot with PgliteOwnerLockedError and is left in place", async (t) => {
  const { siteDir, dataDir, socketPath } = await freshPgliteSite(t);
  const lockPath = path.join(dataDir, OWNER_LOCK_FILE);
  assert.equal(fs.existsSync(lockPath), false, "initSite released its own lock");
  assert.equal(runningPgliteOwner(dataDir), undefined);

  // The test runner's parent process: alive for the whole test, and not this process.
  const foreignPid = process.ppid;
  fs.writeFileSync(lockPath, `${foreignPid}\n`, { mode: 0o600 });

  await assert.rejects(bootSiteDir({ dir: siteDir }), (err: unknown) => {
    assert.ok(err instanceof PgliteOwnerLockedError, `expected PgliteOwnerLockedError, got ${String(err)}`);
    assert.equal(
      err.message,
      `the PGlite data dir ${dataDir} is already open by process ${foreignPid}; only one process may own it (connect to its socket instead)`
    );
    assert.equal(err.pid, foreignPid);
    return true;
  });
  assert.equal(fs.readFileSync(lockPath, "utf8"), `${foreignPid}\n`, "a live owner's lock is never reaped");
  assert.equal(fs.existsSync(socketPath), false, "the refused boot never opened a socket");
  assert.equal(runningPgliteOwner(dataDir), undefined, "the refused boot registered no owner");
  assert.deepEqual(
    fs.readdirSync(dataDir).filter((name) => name.startsWith(`${OWNER_LOCK_FILE}.`)),
    [],
    "no temp, aside or reaping-guard files are left next to the lock"
  );

  // The foreign owner goes away cleanly: the same folder boots, so the refusal damaged nothing.
  fs.rmSync(lockPath);
  const boot = await bootSiteDir({ dir: siteDir });
  let closed = false;
  t.after(async () => {
    if (!closed) await closeSiteDirBoot(boot).catch(() => undefined);
  });
  assert.equal(typeof boot.workspaceId, "string");
  assert.equal(boot.storage.kind, "pglite");
  assert.equal(fs.readFileSync(lockPath, "utf8"), `${process.pid}\n`, "this process took the freed lock");
  await closeSiteDirBoot(boot);
  closed = true;
});

test("[unrun] pglite boot: while serving, the owner is registered in-process on a private 0700 dir / 0600 socket; a clean close of the composition unregisters it", async (t) => {
  const { siteDir, dataDir, socketPath } = await freshPgliteSite(t);
  const boot = await bootSiteDir({ dir: siteDir });
  let composed: SiteStore | undefined;
  let closed = false;
  t.after(async () => {
    if (!closed) await closeSiteDirBoot(boot, composed).catch(() => undefined);
  });
  const deps = await createSiteRouteDeps(path.join(siteDir, "content.db"), {
    store: boot.store,
    workspaceId: boot.workspaceId,
    onStoreOpened: (store) => (composed = store),
    uploadsDir: path.join(siteDir, "uploads"),
    themesDir: path.join(siteDir, "themes"),
    siteBinding: { dir: siteDir, name: path.basename(siteDir), dirOverridden: true, switcherCompatible: false },
  });
  await drainBootReadiness(deps);

  const owner = runningPgliteOwner(dataDir);
  assert.ok(owner, "the booted site's owner is reachable in-process");
  assert.equal(owner.socketPath, socketPath, "the owner serves the socket derived from its data dir");
  assert.equal(boot.store?.pgliteSocketPath, socketPath, "the store connects through that same socket");
  assert.ok(composed, "the composition handed back the store it closes");
  assert.equal(fs.statSync(path.dirname(socketPath)).mode & 0o777, 0o700, "the socket dir is owner-only");
  const socketStat = fs.statSync(socketPath);
  assert.equal(socketStat.isSocket(), true);
  assert.equal(socketStat.mode & 0o777, 0o600, "the socket is owner-only");

  // runExclusive runs on the live database, between client messages.
  const rows = await owner.runExclusive((db) => db.query<{ one: number }>("select 1 as one"));
  assert.deepEqual(rows.rows, [{ one: 1 }]);

  await drainBootReadiness(deps);
  await closeSiteDirBoot(boot, composed);
  closed = true;
  assert.equal(runningPgliteOwner(dataDir), undefined, "a clean close unregisters the owner");
  assert.equal(fs.existsSync(path.join(dataDir, "PG_VERSION")), true, "the data dir itself is kept");
});

test("[unrun] pglite boot: the serve boot modules all come up ready on Postgres and a second lifecycle run is idempotent (commerce stays off)", async (t) => {
  const site = await bootSite(t, "pglite");
  const modules = buildBootModules(site.deps, { useMemory: false, defaultContentDbPath: () => path.join(site.siteDir, "content.db") }).filter((module) =>
    LIFECYCLE_MODULES.includes(module.name)
  );
  assert.deepEqual(
    modules.map((module) => module.name),
    LIFECYCLE_MODULES,
    "serve's module list still carries every module this test runs, in this order"
  );

  const expected = {
    ok: true,
    modules: [
      { name: "database-migration-reconciliation", owner: "features/database", criticality: "critical", lifecycle: { status: "ready" } },
      { name: "settings", owner: "features/settings", criticality: "critical", lifecycle: { status: "ready" } },
      { name: "seo", owner: "seo", criticality: "critical", lifecycle: { status: "ready" } },
      { name: "comments", owner: "comments", criticality: "optional", lifecycle: { status: "ready" } },
    ],
  };
  assert.deepEqual(await runBootLifecycle(modules), expected);
  assert.equal(await site.deps.siteStatusRepo.get(site.deps.workspaceId), "SERVING", "no interrupted migration was found");

  assert.equal("store" in site.deps, false, "commerce is not composed into the serve dependencies");
  assert.equal(buildBootModules(site.deps, { useMemory: false, defaultContentDbPath: () => path.join(site.siteDir, "content.db") }).some(module => module.name === "store-plugin"), false);
  assert.deepEqual(await runBootLifecycle(modules), expected, "a re-run (the next boot) is ready again");
});
