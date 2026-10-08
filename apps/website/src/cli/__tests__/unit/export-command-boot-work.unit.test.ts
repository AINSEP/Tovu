import assert from "node:assert/strict";
import test from "node:test";
import { runExportCommand, type RunExportCommandOptional } from "../../commands/export.js";
import type { BootSiteDirResult } from "#src/platform/site-dir/boot-site-dir";
import type { SiteStore } from "#src/server/runtime/composition/open-site-store";

type ExportRouteDeps = Awaited<ReturnType<NonNullable<RunExportCommandOptional["createSiteRouteDeps"]>>>;

/**
 * @file `tovu export`'s cleanup waits for the boot passes still reading the store before closing it:
 * the composition's legacy publish-credential tail and the BYOK pass the crawl's `createSiteApp()`
 * started (`RouteDeps.siteAppBootWork`). Its `finally` used to close at once, so an export refused
 * for a non-empty output directory, or a short successful one, closed the store beneath them.
 */

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  return { promise: new Promise<void>((res) => (resolve = res)), resolve };
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

test("export: a failed export closes the store only after the legacy tail and createSiteApp's BYOK pass settle", async () => {
  const legacyWork = deferred();
  const byokWork = deferred();
  const order: string[] = [];
  const bootResult = { workspaceId: "ws", config: {}, db: {} };
  const composedStore = { fixture: "composed" };
  const routeDeps = {
    workspaceId: "ws",
    exportOutputRootDir: "/tmp/tovu-export-boot-work-fixture",
    legacyPublishCredentialsReady: legacyWork.promise.then(() => void order.push("legacy-settled")),
    siteAppBootWork: new Set<Promise<void>>(),
  };
  const effects: RunExportCommandOptional = {
    bootSiteDir: async () => bootResult as unknown as BootSiteDirResult,
    closeSiteDirBoot: async (boot: unknown, store: unknown) => {
      assert.equal(boot, bootResult);
      assert.equal(store, composedStore);
      order.push("close");
    },
    createSiteRouteDeps: async (_dbPath, options) => {
      options?.onStoreOpened?.(composedStore as unknown as SiteStore);
      return routeDeps as unknown as ExportRouteDeps;
    },
    registerPluginSdkResolver: () => {},
    reconcileInterruptedMigrationOnBoot: async () => ({ blocked: false }),
    exportSite: async () => {
      // The crawl's createSiteApp() starts its BYOK pass, then the export is refused.
      routeDeps.siteAppBootWork.add(byokWork.promise.then(() => void order.push("byok-settled")));
      throw new Error("output directory is not empty");
    },
  };

  const run = runExportCommand({ dir: "/tmp/tovu-export-boot-work-fixture" }, effects);
  await tick();
  assert.deepEqual(order, [], "the store must not close while boot work still reads it");
  legacyWork.resolve();
  await tick();
  assert.deepEqual(order, ["legacy-settled"], "the BYOK pass must also settle before closing");
  byokWork.resolve();
  await assert.rejects(run, /^Error: output directory is not empty$/);
  assert.deepEqual(order.slice(-1), ["close"]);
  assert.deepEqual(new Set(order.slice(0, 2)), new Set(["legacy-settled", "byok-settled"]));
});
