import { isolatedCatalogHome } from "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { leaveSavedKeysOut } from "@jini-ai/devops/backup/site/saved-keys";
import { importFixture, OWNER_PASSWORD } from "#src/features/site-backup/__tests__/import.fixture";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { configureSiteImports } from "../site-imports.js";

/**
 * @file `configureSiteImports`: a site that lives in the local sites home gets the importer, wired to
 * that home, to its workspace's setup URL and to the `[site-import]` status log; with no site switcher
 * there is no supervisor, so a finished import reports the new site as stopped. A site outside any
 * sites home (or a production server) gets no importer.
 */

type Required = Parameters<typeof configureSiteImports>[0];

/** Points the sites home at a fresh folder inside the isolated test home, with no switcher or production mode. */
function isolatedSitesHome(t: TestContext): string {
  const saved = { home: process.env.TOVU_SITES_HOME, switcher: process.env.TOVU_ENABLE_SITE_SWITCHER, mode: process.env.TOVU_RUNTIME_MODE, node: process.env.NODE_ENV };
  const sitesHome = fs.mkdtempSync(path.join(isolatedCatalogHome, "sites-home-"));
  process.env.TOVU_SITES_HOME = sitesHome;
  delete process.env.TOVU_ENABLE_SITE_SWITCHER;
  delete process.env.TOVU_RUNTIME_MODE;
  if (process.env.NODE_ENV === "production") delete process.env.NODE_ENV;
  t.after(() => {
    for (const [key, value] of [["TOVU_SITES_HOME", saved.home], ["TOVU_ENABLE_SITE_SWITCHER", saved.switcher], ["TOVU_RUNTIME_MODE", saved.mode], ["NODE_ENV", saved.node]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  return sitesHome;
}

function configure(dir: string, workspaceId: string): Partial<Required["routeDeps"]> {
  const routeDeps: Partial<Required["routeDeps"]> = {};
  configureSiteImports({ resolvedSiteBinding: { dir, name: path.basename(dir), dirOverridden: false }, workspaceId, observability: undefined, tracker: undefined,
    routeDeps, savedKeys: { restore: leaveSavedKeysOut } } as unknown as Required);
  return routeDeps;
}

// Mutations: the setup base drops `encodeURIComponent` (l.33); `report` logs nothing (l.34); `startSite`
// claims a running site without a supervisor (l.31 `: { adminUrl: "http://x", status: "running" }`).
test("a site in the sites home gets an importer that creates the copy there, links its owner setup and logs each status", async t => {
  const h = await importFixture(t);
  const sitesHome = isolatedSitesHome(t);
  const routeDeps = configure(path.join(sitesHome, "current"), "ws imp/1");
  const backend = routeDeps.siteImportBackend;
  assert.notEqual(backend, undefined);
  const info = t.mock.method(console, "info", () => {});
  const pending = await backend!.importBackup({ principalId: "owner", source: await backend!.upload({ principalId: "owner", archive: h.archive }) });
  assert.equal(pending.setupUrl, `/api/admin/v1/workspaces/ws%20imp%2F1/site-imports/${pending.importId}/owner`);
  const ready = await backend!.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  // No displayName was given, so the new site is named after the archive's own site ("Portable").
  assert.deepEqual([ready.state, ready.newSiteName], ["ready", "portable"]);
  assert.match(ready.error ?? "", /start it from Sites/i);
  assert.deepEqual(createSitesWorkspace({}, {}).registry({}).list({}).map(site => site.name), ["portable"]);
  const logged = info.mock.calls.map(call => call.arguments);
  assert.deepEqual(logged.slice(0, 2), [["[site-import]", pending.importId, "verifying"], ["[site-import]", pending.importId, "needs-owner"]]);
  assert.deepEqual(logged.at(-1), ["[site-import]", pending.importId, "ready"]);
});

// Mutation: `if (importBase !== null)` -> `if (true)` (l.26).
test("a site outside the sites home gets no importer", t => {
  isolatedSitesHome(t);
  const outside = fs.mkdtempSync(path.join(isolatedCatalogHome, "elsewhere-"));
  assert.equal("siteImportBackend" in configure(path.join(outside, "current"), "ws-out"), false);
});
