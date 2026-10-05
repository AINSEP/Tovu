import assert from "node:assert/strict";
import test from "node:test";

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

test("export: a failed export closes the store only after the legacy tail and createSiteApp's BYOK pass settle", async (t) => {
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
  const stubs = new Map<string, Record<string, unknown>>([
    ["../../../platform/site-dir/boot-site-dir.ts", {
      bootSiteDir: async () => bootResult,
      closeSiteDirBoot: async (boot: unknown, store: unknown) => {
        assert.equal(boot, bootResult);
        assert.equal(store, composedStore);
        order.push("close");
      },
    }],
    ["../../../server/runtime/composition/deps.ts", {
      createSiteRouteDeps: async (_dbPath: string, options: { onStoreOpened(store: unknown): void }) => {
        options.onStoreOpened(composedStore);
        return routeDeps;
      },
    }],
    ["../../../server/runtime/boot/plugin-sdk-resolver.ts", { registerPluginSdkResolver: () => {} }],
    ["../../../features/database/boot/reconcile-interrupted-migration.ts", {
      reconcileInterruptedMigrationOnBoot: async () => ({ blocked: false }),
    }],
    ["../../../features/site-export/index.ts", {
      exportSite: async () => {
        // The crawl's createSiteApp() starts its BYOK pass, then the export is refused.
        routeDeps.siteAppBootWork.add(byokWork.promise.then(() => void order.push("byok-settled")));
        throw new Error("output directory is not empty");
      },
    }],
  ]);
  for (const [relative, stub] of stubs) {
    const url = new URL(relative, import.meta.url).href;
    t.mock.module(url, { namedExports: { ...(await import(url)), ...stub } });
  }
  const { runExportCommand } = await import("../../commands/export.js");

  const run = runExportCommand({ dir: "/tmp/tovu-export-boot-work-fixture" });
  await tick();
  assert.deepEqual(order, [], "the store must not close while boot work still reads it");
  legacyWork.resolve();
  byokWork.resolve();
  await assert.rejects(run, /^Error: output directory is not empty$/);
  assert.deepEqual(order.slice(-1), ["close"]);
  assert.deepEqual(new Set(order.slice(0, 2)), new Set(["legacy-settled", "byok-settled"]));
});
