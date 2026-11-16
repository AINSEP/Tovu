import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { runExportCommand, type RunExportCommandOptional } from "../../commands/export.js";

type Boot = Awaited<ReturnType<NonNullable<RunExportCommandOptional["bootSiteDir"]>>>;
type Deps = Awaited<ReturnType<NonNullable<RunExportCommandOptional["createSiteRouteDeps"]>>>;
import type { SiteStore } from "../../../server/runtime/composition/open-site-store.js";

for (const work of ["none", "legacy", "app", "both"] as const) {
  test(`export waits for ${work} boot work before closing`, async t => {
    t.mock.method(process.stdout, "write", () => true);
    const order: string[] = [];
    let release: () => void = () => {};
    const pending = new Promise<void>(resolve => { release = resolve; });
    const boot = { workspaceId: "ws" } as Boot;
    const store = {} as SiteStore;
    const deps = { workspaceId: "ws", exportOutputRootDir: "/tmp/export",
      ...(work === "legacy" || work === "both" ? { legacyPublishCredentialsReady: pending } : {}),
      ...(work === "app" || work === "both" ? { siteAppBootWork: new Set([pending]) } : {}),
    } as Deps;
    const effects: RunExportCommandOptional = {
      registerPluginSdkResolver: () => { order.push("resolver"); },
      bootSiteDir: async () => { order.push("boot"); return boot; },
      createSiteRouteDeps: async ({ overrides }) => { overrides?.onStoreOpened?.({ store: store }); return deps; },
      reconcileInterruptedMigrationOnBoot: async () => ({ blocked: false }),
      exportSite: async input => {
        assert.equal(input.outputDir, "/tmp/export"); assert.equal(input.clean, false);
        order.push("export");
        return { outputDir: input.outputDir, routes: { succeeded: [], failed: [] }, assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] };
      },
      closeSiteDirBoot: async (actualBoot, actualStore) => {
        assert.equal(actualBoot, boot); assert.equal(actualStore, store); order.push("close");
      },
    };
    const run = runExportCommand({ dir: "/tmp/site" }, effects);
    await new Promise<void>(resolve => setImmediate(resolve));
    if (work !== "none") assert.deepEqual(order, ["resolver", "boot", "export"]);
    release(); await run;
    assert.deepEqual(order, ["resolver", "boot", "export", "close"]);
  });
}
test("export closes the boot and partially composed store when composition fails", async () => {
  const failure = new Error("composition failed");
  const boot = { workspaceId: "ws" } as Boot, store = {} as SiteStore;
  let closed = false;
  await assert.rejects(runExportCommand({ dir: "/tmp/site" }, {
    registerPluginSdkResolver: () => {}, bootSiteDir: async () => boot,
    createSiteRouteDeps: async ({ overrides }) => { overrides?.onStoreOpened?.({ store: store }); throw failure; },
    closeSiteDirBoot: async (actualBoot, actualStore) => { assert.equal(actualBoot, boot); assert.equal(actualStore, store); closed = true; },
  }), error => error === failure);
  assert.equal(closed, true);
});

test("export composes against the site's own content database with the booted store and site paths", async t => {
  // The composition must receive this site's dbPath and the boot's overrides; a dropped argument
  // would silently compose against the default database instead of the site being exported.
  t.mock.method(process.stdout, "write", () => true);
  const boot = { workspaceId: "ws", db: { marker: "db" }, store: { marker: "store" } } as unknown as Boot;
  const seen: { dbPath?: string; overrides?: Record<string, unknown> } = {};
  const failure = new Error("stop after composition");
  await assert.rejects(runExportCommand({ dir: "/tmp/site" }, {
    registerPluginSdkResolver: () => {}, bootSiteDir: async () => boot,
    createSiteRouteDeps: async ({ dbPath, overrides }) => { Object.assign(seen, { dbPath, overrides }); throw failure; },
    closeSiteDirBoot: async () => {},
  }), error => error === failure);
  assert.match(String(seen.dbPath), /^\/tmp\/site\//);
  assert.equal(seen.overrides?.db, (boot as unknown as { db: unknown }).db);
  assert.equal(seen.overrides?.store, (boot as unknown as { store: unknown }).store);
  assert.equal(seen.overrides?.workspaceId, "ws");
  assert.equal(seen.overrides?.themesDir, "/tmp/site/themes");
});
