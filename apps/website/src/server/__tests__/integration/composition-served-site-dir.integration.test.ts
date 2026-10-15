import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before, describe } from "node:test";

import { computeBlobStorageKey } from "@jini-ai/cms/media";

import { createSiteRouteDeps } from "../../runtime/composition/deps.js";
import { loadMailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import { installFirstPartyPublishContentTypes } from "../../runtime/composition/publish-content-manifest.js";
import { getExportRunSnapshot, startExportRun } from "#src/features/deployments/index";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { redirects, workspaces } from "#src/platform/db/schema.sqlite";
import type { SiteBinding } from "#src/platform/site-dir/index";

/**
 * @file `createSiteRouteDeps` roots every `<site>/...` path it defaults at the site it was BOOTED
 * with (`siteBinding.dir`), not at `siteDir()` — the `TOVU_SITE_DIR` env var, or
 * `<cwd>/sites/<name>`.
 *
 * Only `tovu serve` pins `TOVU_SITE_DIR`. Every other composition (`tovu export <dir>`, a
 * programmatic `createSiteRouteDeps` with an explicit binding) used to send an admin-triggered
 * export, a publish, a source-control export, site-plugin discovery, the default uploads and themes
 * roots, and the stock-seed lookup to whatever site the working directory named. Same bug class as
 * ec52a277d (the Sites routes read `process.cwd()`).
 *
 * Each test composes site A with an explicit binding while this process's env/cwd name a different
 * site (`TOVU_SITE_DIR` unset, cwd the repo root -> `<repo>/sites/tovu-com`), then asserts the
 * path lands under A. The binding is the injected port; no test changes `process.cwd()`. The two
 * stock-seed tests set `TOVU_STOCK_CONTENT_SEED_DIR`, the only way to point the seed root at a
 * fixture, and restore it.
 */

/** Settles every readiness promise the composition started, so no boot step is still writing the
 *  site directory when the test deletes it. */
async function settleBoot(deps: object | undefined): Promise<void> {
  if (deps === undefined) return;
  await Promise.allSettled(Object.entries(deps).filter(([key, value]) => key.endsWith("Ready") && value instanceof Promise).map(([, value]) => value));
}

function bindingFor(dir: string): SiteBinding {
  return { dir, name: path.basename(dir), dirOverridden: true, switcherCompatible: false };
}

/** A minimal site-installed plugin at `<pluginsRoot>/<id>/1.0.0/`, the layout `discoverPlugins` scans. */
function plantSitePlugin(pluginsRoot: string, id: string): void {
  const pluginRoot = path.join(pluginsRoot, id, "1.0.0");
  fs.mkdirSync(path.join(pluginRoot, "server"), { recursive: true });
  const entryPath = path.join(pluginRoot, "server", "index.mjs");
  fs.writeFileSync(entryPath, "export default {};\n", "utf8");
  const entryHash = `sha256-${createHash("sha256").update(fs.readFileSync(entryPath)).digest("hex")}`;
  const manifest = {
    id,
    name: "Served Site Probe",
    version: "1.0.0",
    sdkRange: "^0.1.0 || ^0.2.0",
    engine: 1,
    tier: "tier-3",
    capabilities: [],
    hooks: [],
    fields: [],
    integrity: { "server/index.mjs": entryHash },
  };
  fs.writeFileSync(path.join(pluginRoot, "tovu.plugin.json"), JSON.stringify(manifest), "utf8");
}

/** Runs `fn` with `TOVU_STOCK_CONTENT_SEED_DIR` set to `stockRoot`, then restores it. */
async function withStockSeedRoot<T>(stockRoot: string, fn: () => Promise<T>): Promise<T> {
  const original = process.env.TOVU_STOCK_CONTENT_SEED_DIR;
  process.env.TOVU_STOCK_CONTENT_SEED_DIR = stockRoot;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.TOVU_STOCK_CONTENT_SEED_DIR;
    else process.env.TOVU_STOCK_CONTENT_SEED_DIR = original;
  }
}

/** One composition of site A, shared by the path assertions below (each boot seeds ~19MB of themes). */
describe("a site composed with an explicit binding, while env/cwd name another site", () => {
  const siteA = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-served-site-a-"));
  const probePluginId = "served-site-probe";
  let deps: Awaited<ReturnType<typeof createSiteRouteDeps>> | undefined;

  const layoutEnv = ["TOVU_AGENT_PLUGINS_DIR", "TOVU_SKILLS_DIR"] as const;
  const originalLayoutEnv = new Map(layoutEnv.map(name => [name, process.env[name]]));

  before(async () => {
    for (const name of layoutEnv) delete process.env[name];
    plantSitePlugin(path.join(siteA, "plugins"), probePluginId);
    // No uploadsDir/themesDir overrides: their defaults are under test too.
    deps = await createSiteRouteDeps(path.join(siteA, "content.db"), { siteBinding: bindingFor(siteA) });
  });

  after(async () => {
    await settleBoot(deps);
    fs.rmSync(siteA, { recursive: true, force: true });
    for (const name of layoutEnv) {
      const previous = originalLayoutEnv.get(name);
      if (previous === undefined) delete process.env[name]; else process.env[name] = previous;
    }
  });

  test("exportOutputRootDir is the served site's out/export, and a triggered export writes there", async () => {
    // Asserted BEFORE triggering: on the old code the root is `<repo>/sites/tovu-com/out/export`,
    // and a `clean: true` export there would wipe the checkout's own export folder.
    assert.equal(deps!.exportOutputRootDir, path.join(siteA, "out", "export"));

    startExportRun({ routeDeps: deps!, runExportSite: deps!.runExportSite, clean: true });
    for (let waited = 0; getExportRunSnapshot().status === "running" && waited < 120_000; waited += 100) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const snapshot = getExportRunSnapshot();
    assert.equal(snapshot.status, "completed", `export did not complete: ${JSON.stringify(snapshot)}`);
    assert.equal(snapshot.outputDir, path.join(siteA, "out", "export"));
    assert.ok(fs.existsSync(path.join(siteA, "out", "export", "index.html")), "the export's home page must land under the served site");
  });

  test("publishOutputRootDir is the served site's out/publish", () => {
    assert.equal(deps!.publishOutputRootDir, path.join(siteA, "out", "publish"));
  });

  test("sourceControlExportRootDir is the served site's out/source-control-export", () => {
    assert.equal(deps!.sourceControlExportRootDir, path.join(siteA, "out", "source-control-export"));
  });

  test("the default themes root is the served site's themes/, seeded on first boot", () => {
    assert.equal(deps!.themesDir, path.join(siteA, "themes"));
    assert.ok(fs.readdirSync(path.join(siteA, "themes")).length > 0, "the stock themes must be seeded into the served site");
  });

  test("the default uploads root is the served site's uploads/ (site backup reads the same folder)", () => {
    assert.equal(deps!.siteBackupSources?.siteDir, siteA);
    const expected = process.env.TOVU_MEDIA_BLOB_STORE === "s3" ? null : path.join(siteA, "uploads");
    assert.equal(deps!.siteBackupSources?.mediaUploadsDir, expected);
  });

  test("agent-plugin and skill layouts are boot-bound and backups share the same layouts", () => {
    assert.equal(deps!.agentPluginLayout.root, path.join(siteA, "agent-plugins"));
    assert.equal(deps!.skillLayout.root, path.join(siteA, "skills"));
    assert.equal(deps!.siteBackupSources?.agentPlugins, deps!.agentPluginLayout);
    assert.equal(deps!.siteBackupSources?.skillsDir, deps!.skillLayout.root);
    const previous = process.env.TOVU_SITE_DIR;
    try {
      process.env.TOVU_SITE_DIR = path.join(siteA, "another-site");
      assert.equal(deps!.agentPluginLayout.forWorkspace(deps!.workspaceId).root, path.join(siteA, "agent-plugins", "ws", deps!.workspaceId));
      assert.equal(deps!.skillLayout.forWorkspace(deps!.workspaceId).root, path.join(siteA, "skills", "ws", deps!.workspaceId));
    } finally {
      if (previous === undefined) delete process.env.TOVU_SITE_DIR; else process.env.TOVU_SITE_DIR = previous;
    }
  });

  test("installed contribution registries keep the booted site after env drift and retain their trust gates", async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-bound-contributions-"));
    // ccca921e7 retires deploy before seeding; use a current seeded-enabled plugin id
    // so this fixture reaches the digest and activation gates it proves.
    const pluginRoot = path.join(sourceRoot, "github");
    fs.mkdirSync(pluginRoot);
    const files = {
      "plugin.json": JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "github", version: "1.0.0" }),
      "tovu-source-control.json": JSON.stringify({ schemaVersion: 1, providers: [{ id: "bound-git", label: "Bound Git", apiOrigin: "https://git.fixture.test", module: "fixture.mjs" }] }),
      "tovu-deploy-targets.json": JSON.stringify({ schemaVersion: 1, targets: [{ id: "bound-target", label: "Bound Target", module: "fixture.mjs", config: [] }] }),
      "tovu-deploy-ops.json": JSON.stringify({ schemaVersion: 1, platforms: [{ id: "bound-ops", label: "Bound Ops", module: "fixture.mjs", hosts: ["api.fixture.test"] }] }),
      "tovu-mail-adapters.json": JSON.stringify({ schemaVersion: 1, adapters: [{ id: "bound-mail", label: "Bound Mail", module: "fixture.mjs", credentialLabel: "Fixture Mail Key" }] }),
      "tovu-credential-schemes.json": JSON.stringify({ schemaVersion: 1, schemes: [{ id: "bound-scheme", prefix: "FixtureV1", scheme: "FixtureV1" }] }),
      "fixture.mjs": "export default { create() { return {}; }, validateConfig() { return null; }, async status() {}, async logs() {} };",
    };
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(pluginRoot, name), content);
    const envNames = ["TOVU_SITE_DIR", "TOVU_AGENT_PLUGINS_DIR", "TOVU_SKILLS_DIR"] as const;
    const previous = new Map(envNames.map(name => [name, process.env[name]]));
    const lifecycle = deps!.agentPluginLifecycle;
    const workspaceId = deps!.workspaceId;
    const loadMail = () => loadMailAdapterRegistry({ workspaceId }, { loadContributions: lifecycle.loadPluginContributions });
    try {
      await lifecycle.seedBundledAgentPlugins({ layout: deps!.agentPluginLayout, workspaceId, sourceRoot });
      for (const name of envNames) process.env[name] = path.join(sourceRoot, "other-site");
      const providers = await deps!.loadSourceControlProviders(workspaceId);
      assert.deepEqual(providers.refusals, []);
      assert.equal(providers.get("bound-git")?.pluginId, "github");
      assert.ok(providers.get("bound-git")!.module);
      assert.equal((await deps!.loadDeployTargets(workspaceId)).get("bound-target")?.pluginId, "github");
      assert.equal((await deps!.loadDeployOps({ workspaceId })).get("bound-ops")?.pluginId, "github");
      assert.deepEqual((await loadMail()).list().map(adapter => adapter.descriptor.id), ["bound-mail"]);
      assert.deepEqual((await deps!.loadAuthSchemes({ workspaceId })).map(rule => rule.id), ["bound-scheme"]);
      assert.equal(fs.existsSync(path.join(sourceRoot, "other-site")), false);

      await lifecycle.setAgentPluginActivation({ workspaceRoot: path.join(siteA, "agent-plugins", "ws", workspaceId), pluginId: "github", enabled: false, actor: "test" });
      const disabled = await deps!.loadSourceControlProviders(workspaceId);
      assert.deepEqual(disabled.list(), []);
      assert.equal(disabled.switchedOff?.get("bound-git"), "github");
      assert.deepEqual((await deps!.loadDeployTargets(workspaceId)).list(), []);
      assert.deepEqual((await deps!.loadDeployOps({ workspaceId })).list(), []);
      assert.deepEqual((await loadMail()).list(), []);
      // Data-only credential schemes keep digest trust but deliberately skip activation.
      assert.deepEqual((await deps!.loadAuthSchemes({ workspaceId })).map(rule => rule.id), ["bound-scheme"]);
    } finally {
      for (const name of envNames) {
        const value = previous.get(name);
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
      fs.rmSync(sourceRoot, { recursive: true, force: true });
    }
  });

  test("site-installed plugins are discovered under the served site's plugins/", async () => {
    const discovered = await deps!.discoverPlugins();
    assert.ok(
      discovered.some((record) => record.id === probePluginId),
      `the plugin planted under ${siteA}/plugins must be discovered; got ${JSON.stringify(discovered.map((record) => record.id))}`
    );
  });
});

test("stock seed: blob hydration and the publish-content seed hash read the SERVED site's seed payload", async () => {
  const siteA = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-served-site-seed-"));
  const stockRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-served-site-stock-"));
  const siteName = path.basename(siteA);
  const workspaceId = `ws-${randomUUID()}`;

  const bytes = new TextEncoder().encode("served-site stock blob");
  const storageKey = computeBlobStorageKey({ workspaceId, sha256: createHash("sha256").update(bytes).digest("hex") });
  const blobPath = path.join(stockRoot, siteName, "uploads", ...storageKey.split("/"));
  fs.mkdirSync(path.dirname(blobPath), { recursive: true });
  fs.writeFileSync(blobPath, bytes);

  const seedDb = openContentDb(path.join(stockRoot, siteName, "content.seed.db"));
  const now = "2026-01-01T00:00:00.000Z";
  seedDb
    .insert(redirects)
    .values({
      id: `redirect-${randomUUID()}`,
      workspaceId,
      matchType: "exact",
      fromPattern: "/served-site-old",
      toTarget: "/served-site-new",
      statusCode: 301,
      status: "active",
      override: 0,
      priority: 0,
      source: "manual",
      createdByPrincipal: "test",
      createdAt: now,
      updatedAt: now,
      version: 1,
    })
    .run();
  seedDb.$client.close();

  const liveDb = openContentDb(":memory:");
  liveDb.insert(workspaces).values({ id: workspaceId, name: "Served", slug: "served", createdAt: now }).run();

  let deps: Awaited<ReturnType<typeof createSiteRouteDeps>> | undefined;
  try {
    deps = await withStockSeedRoot(stockRoot, () =>
      createSiteRouteDeps(path.join(siteA, "content.db"), {
        db: liveDb,
        workspaceId,
        siteBinding: bindingFor(siteA),
        uploadsDir: path.join(siteA, "uploads"),
        themesDir: path.join(siteA, "themes"),
      })
    );
    const hydration = await deps.blobHydrationReady;
    assert.equal(hydration?.status, "seeded", `blob hydration must find stock/${siteName}/uploads, got ${JSON.stringify(hydration)}`);
    assert.equal(await deps.blobStore.exists({ storageKey }), true);

    // The seed path is captured at composition, so this lazy first lookup needs no env.
    // `createApp()` registers the publish-content types at boot (idempotent); this test never builds
    // the app. A redirect's publish-content id is its natural key, `<matchType>:<fromPattern>`.
    installFirstPartyPublishContentTypes();
    const seedHash = await deps.publishContentSeedHash({ entityType: "redirect", entityId: "exact:/served-site-old" });
    assert.equal(typeof seedHash, "string", `the seed hash must come from stock/${siteName}/content.seed.db, got ${String(seedHash)}`);
  } finally {
    await settleBoot(deps);
    fs.rmSync(siteA, { recursive: true, force: true });
    fs.rmSync(stockRoot, { recursive: true, force: true });
  }
});

test("stock seed: a first boot with no content.db hydrates it from the SERVED site's content.seed.db", async () => {
  const siteA = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-served-site-hydrate-"));
  const stockRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-served-site-stock-"));
  fs.mkdirSync(path.join(stockRoot, path.basename(siteA)));
  const seedDb = openContentDb(path.join(stockRoot, path.basename(siteA), "content.seed.db"));
  seedDb.insert(workspaces).values({ id: "served-seed-marker", name: "Served Seed Marker", slug: "served-seed-marker", createdAt: "2026-01-01T00:00:00.000Z" }).run();
  seedDb.$client.close();

  let deps: Awaited<ReturnType<typeof createSiteRouteDeps>> | undefined;
  try {
    deps = await withStockSeedRoot(stockRoot, () =>
      createSiteRouteDeps(path.join(siteA, "content.db"), {
        siteBinding: bindingFor(siteA),
        uploadsDir: path.join(siteA, "uploads"),
        themesDir: path.join(siteA, "themes"),
      })
    );
    const found = await deps.workspaceRepo.findById({ id: "served-seed-marker" });
    assert.ok(found, "content.db must be hydrated from the served site's own stock seed");
  } finally {
    await settleBoot(deps);
    fs.rmSync(siteA, { recursive: true, force: true });
    fs.rmSync(stockRoot, { recursive: true, force: true });
  }
});
