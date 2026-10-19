import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
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


test("export: dropped references are printed as warnings without failing a completed export", async (t) => {
  const warnings: string[] = [];
  t.mock.method(process.stderr, "write", (chunk: unknown) => { warnings.push(String(chunk)); return true; });
  t.mock.method(process.stdout, "write", () => true);
  const routeDeps = { workspaceId: "ws", exportOutputRootDir: "/tmp/export-warning-fixture" };
  let closed = false;
  await runExportCommand({ dir: "/tmp/export-warning-fixture" }, {
    bootSiteDir: async () => ({ workspaceId: "ws", config: {}, db: {} }) as unknown as BootSiteDirResult,
    closeSiteDirBoot: async () => { closed = true; },
    createSiteRouteDeps: async () => routeDeps as unknown as ExportRouteDeps,
    registerPluginSdkResolver: () => {},
    reconcileInterruptedMigrationOnBoot: async () => ({ blocked: false }),
    exportSite: async () => ({ outputDir: routeDeps.exportOutputRootDir,
      routes: { succeeded: [], failed: [] }, assets: { succeeded: [], failed: [] },
      skippedManifestEntries: [], unreferencedThemeFiles: [],
      droppedReferences: [
        { page: "/", url: "/missing", attribute: "href", reason: "not-exported" },
        { page: "/contact", url: "/api/contact", attribute: "action", reason: "needs-server" },
      ],
    }),
  });
  assert.equal(closed, true);
  assert.deepEqual(warnings, [
    "tovu export: warning: dropped href on /: /missing (not-exported)\n",
    "tovu export: warning: dropped action on /contact: /api/contact (needs-server)\n",
  ]);
});

test("export reports all failures and warnings honestly, honors flags, and closes after an incomplete export", async t => {
  const stdout: string[] = [], stderr: string[] = [];
  t.mock.method(process.stdout, "write", (text: unknown) => { stdout.push(String(text)); return true; });
  t.mock.method(process.stderr, "write", (text: unknown) => { stderr.push(String(text)); return true; });
  const routeDeps = { workspaceId: "ws", exportOutputRootDir: "/tmp/ignored" };
  const calls: unknown[] = [];
  await assert.rejects(runExportCommand({ dir: "/tmp/site", out: "/tmp/chosen", workspaceId: "requested-ws", clean: true, basePath: "/docs" }, {
    registerPluginSdkResolver: () => { calls.push("resolver"); },
    bootSiteDir: async (input, options) => { calls.push({ input, options }); return { workspaceId: "ws" } as BootSiteDirResult; },
    createSiteRouteDeps: async () => routeDeps as ExportRouteDeps,
    reconcileInterruptedMigrationOnBoot: async () => ({ blocked: false }),
    closeSiteDirBoot: async () => { calls.push("closed"); },
    exportSite: async input => {
      assert.equal(input.routeDeps, routeDeps);
      assert.equal(input.outputDir, "/tmp/chosen");
      assert.equal(input.clean, true);
      assert.equal(input.basePath, "/docs");
      return { outputDir: input.outputDir, routes: { succeeded: [{ path: "/", kind: "page", outputFile: "index.html", data: "<html></html>" }], failed: [{ path: "/broken", kind: "render", reason: "template missing" }] },
        assets: { succeeded: [], failed: [{ url: "/lost.png", reason: "not found" }] },
        skippedManifestEntries: [{ reason: "private", detail: "draft route" }], unreferencedThemeFiles: ["unused.css", "unused.js"],
        droppedReferences: [], basePath: "/docs", basePathRewriteWarning: "dynamic URLs require review" } satisfies Awaited<ReturnType<NonNullable<RunExportCommandOptional["exportSite"]>>>;
    },
  }), { name: "ExportIncompleteError", message: /1 failed route/ });
  assert.deepEqual(stdout, ["tovu export: wrote 1/2 routes and 0/1 assets to /tmp/chosen\n", "tovu export: rewrote root-relative links/assets for base path '/docs'\n"]);
  assert.deepEqual(stderr.slice(0, 3), ["tovu export: skipped (private): draft route\n", "tovu export: FAILED route /broken (render): template missing\n", "tovu export: FAILED asset /lost.png: not found\n"]);
  assert.match(stderr[3]!, /2 theme file\(s\) were never referenced/);
  assert.deepEqual(stderr.slice(4), ["  - unused.css\n", "  - unused.js\n", "tovu export: warning: dynamic URLs require review\n"]);
  assert.deepEqual(calls, ["resolver", { input: { dir: "/tmp/site" }, options: { workspaceId: "requested-ws" } }, "closed"]);
});

test("export refuses pending migration recovery before crawling and closes even without composed boot work", async () => {
  let closed = 0;
  await assert.rejects(runExportCommand({ dir: "/tmp/site" }, {
    registerPluginSdkResolver: () => {}, bootSiteDir: async () => ({ workspaceId: "ws" }) as BootSiteDirResult,
    createSiteRouteDeps: async () => ({ workspaceId: "ws", exportOutputRootDir: "/tmp/export" }) as ExportRouteDeps,
    reconcileInterruptedMigrationOnBoot: async () => ({ blocked: true }),
    exportSite: async () => assert.fail("blocked sites must not crawl"), closeSiteDirBoot: async () => { closed++; },
  }), { name: "ExportBlockedPendingRecoveryError", message: /BLOCKED_PENDING_RECOVERY/ });
  assert.equal(closed, 1);
});
