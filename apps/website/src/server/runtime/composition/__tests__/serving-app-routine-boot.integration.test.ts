import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";

import { createSiteRouteDeps } from "../deps.js";
import { createServingApp } from "../serving-app.js";
import type { SiteStore } from "../open-site-store.js";
import { bootSiteDir, initSite } from "../site-dir.js";
import { closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { routinesPaths } from "#src/features/routines/routines-paths";
import { drainBootReadiness } from "#src/server/__tests__/helpers/unrun-site-boot";

/**
 * @file The serving app's chat-repair barrier on routines (P3-T2.T), over a real SQLite site: when
 * routines can run, interrupted chat turns are repaired only after this boot's routine host is up
 * and has finished its own boot repair, so chat repair sees a settled routine side. The routine
 * host writes its desktop beacon as the last step before its handle is ready; the test reads the
 * beacon's presence at the moment chat repair asks the real ledger for interrupted turns.
 */

async function bootSqliteSite(t: TestContext) {
  const parent = mkdtempSync(path.join(tmpdir(), "serving-routine-boot-"));
  const siteDir = path.join(parent, "site");
  await initSite({ dir: siteDir, name: "Routine boot site", storage: { kind: "sqlite" } });
  const boot = await bootSiteDir({ dir: siteDir });
  let composed: SiteStore | undefined;
  const contentDbPath = resolveSiteDatabasePaths({ dir: siteDir }).contentDbPath;
  const deps = await createSiteRouteDeps({}, { dbPath: contentDbPath, overrides: {
    db: boot.db, store: boot.store, workspaceId: boot.workspaceId,
    onStoreOpened: ({ store }, _optional = {}) => (composed = store),
    uploadsDir: path.join(siteDir, "uploads"), themesDir: path.join(siteDir, "themes"),
    siteBinding: { dir: siteDir, name: path.basename(siteDir), dirOverridden: true, switcherCompatible: false },
  } });
  await drainBootReadiness(deps);
  t.after(async () => {
    try { await drainBootReadiness(deps).catch(() => undefined); await closeSiteDirBoot(boot, { composed }); }
    finally { rmSync(parent, { recursive: true, force: true }); }
  });
  return { deps, contentDbPath };
}

test("with routines able to run, chat repair asks for interrupted turns only after the routine host finished its boot", { timeout: 60_000 }, async (t) => {
  const { deps, contentDbPath } = await bootSqliteSite(t);
  const beacon = routinesPaths({ contentDbPath }).beacon;
  const beaconAtRepair: boolean[] = [];
  const reconcile = deps.chatRunLedger.reconcileInterrupted.bind(deps.chatRunLedger);
  t.mock.method(deps.chatRunLedger, "reconcileInterrupted", (...args: Parameters<typeof reconcile>) => {
    beaconAtRepair.push(existsSync(beacon));
    return reconcile(...args);
  });
  assert.equal(existsSync(beacon), false, "no routine host has run on this fresh site");

  const serving = createServingApp(deps, { routines: { desktopEligible: true, releaseEnabled: true, runStarter: async () => assert.fail("no routine run is due at boot") } });
  t.after(async () => {
    for (const handle of [serving.outboxDrainer, { stop: () => serving.trashSweeper.stop({}) }, serving.themeWatcher, serving.formPullTrigger, serving.postGoLiveSweep, serving.webhookDeliveryWorker, serving.domainBindingSweeper, serving.siteSearchMaintenance, serving.routines]) {
      await handle.stop();
    }
    await Promise.allSettled(serving.bootWork);
  });
  const handle = await serving.routines.ready;
  assert.equal(handle.availability(), "ready");
  assert.equal(handle.bootInterruption.isLeaseOwner(), true, "this boot owns the routine lease");
  await Promise.all(serving.bootWork);

  assert.deepEqual(beaconAtRepair, [true], "chat repair ran once, after the routine host wrote its beacon");
  assert.equal((JSON.parse(readFileSync(beacon, "utf8")) as { enabled: number }).enabled, 0);
});
