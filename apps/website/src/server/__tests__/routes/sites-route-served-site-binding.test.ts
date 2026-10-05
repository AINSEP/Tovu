import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { describeSiteBinding, type SiteBinding } from "#src/platform/site-dir/index";
import { registerAdminSitesRoutes, type AdminSitesDeps } from "../../inbound/admin-http/routes/system/sites.js";
import { createCapturingResponse, extractRouteHandler } from "../helpers/http-test-server.js";

/**
 * @file The Sites routes act on the site this server SERVES (`deps.siteBinding`, resolved once by
 * the composition root), never on whatever `process.cwd()` happens to be when a request lands.
 *
 * The todo this pins (development/todos.md, "The sites route and `sites_duplicate_site` re-derive
 * the site binding from `process.cwd()`"): List/Create/Activate read `<cwd>/sites` and `<cwd>/.env`
 * even though the binding names a different tree. Every test here therefore puts the process in a
 * DIFFERENT directory that has its own real `sites/` and `.env` — running from the served tree's
 * root would hide the bug, because the cwd fallback lands on the right folder by coincidence
 * (memory: daemon_inherits_cwd_not_site_dir).
 *
 * `listSites`/`persistActiveSite`/`readPersistedActiveSite` are the REAL `site-dir` functions over
 * real temp folders. Only `createSite` is a spy: the real one runs `initSite` (database + template
 * seed), and what this file proves is which base directory the route hands it.
 */

const WORKSPACE_ID = "ws-served-binding";
const SITES = "/api/admin/v1/workspaces/:workspaceId/system/sites";

function writeSite(dir: string, displayName: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: displayName }));
  fs.writeFileSync(
    path.join(dir, ".site-meta.json"),
    JSON.stringify({
      siteId: `${displayName}-id`,
      templateId: "test-template",
      templateVersion: "1",
      schemaTag: "test",
      schemaVersion: 0,
      createdAt: "2026-10-04T00:00:00.000Z",
    }),
  );
}

interface Trees {
  /** The tree the server is bound to: `<served>/sites/{alpha,beta}`, `<served>/.env`. */
  served: string;
  /** Where the process is standing: `<wrong>/sites/gamma`, `<wrong>/.env`. */
  wrong: string;
  binding: SiteBinding;
}

/** Builds both trees, binds to `<served>/sites/alpha` the way the composition root does at boot,
 *  then moves the process into the OTHER tree. */
function setupTrees(t: { after: (fn: () => void) => void }): Trees {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-sites-binding-")));
  const served = path.join(root, "served");
  const wrong = path.join(root, "wrong");
  writeSite(path.join(served, "sites", "alpha"), "alpha");
  writeSite(path.join(served, "sites", "beta"), "beta");
  writeSite(path.join(wrong, "sites", "gamma"), "gamma");
  fs.writeFileSync(path.join(served, ".env"), "TOVU_SITE=beta\n");
  fs.writeFileSync(path.join(wrong, ".env"), "TOVU_SITE=gamma\n");

  const binding = describeSiteBinding({ cwd: served, env: { TOVU_SITE: "alpha" } });
  assert.equal(binding.switcherCompatible, true, "precondition: a switcher-chosen boot");

  const previousCwd = process.cwd();
  process.chdir(wrong);
  t.after(() => {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { served, wrong, binding };
}

function routeDeps(binding: SiteBinding, overrides: Partial<AdminSitesDeps> = {}): AdminSitesDeps {
  return {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "test" }),
    siteBinding: binding,
    isSiteSwitcherEnabled: () => true,
    ...overrides,
  } as AdminSitesDeps;
}

async function invoke(deps: AdminSitesDeps, method: "get" | "post", route: string, req: { params?: Record<string, string>; body?: unknown } = {}) {
  const app = express();
  registerAdminSitesRoutes(app, deps);
  const handler = extractRouteHandler(app, method, route);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "owner" };
  await handler({ params: { workspaceId: WORKSPACE_ID, ...req.params }, body: req.body ?? {} }, res);
  return capture;
}

test("List: sites[] and persistedSiteName come from the served tree, not the cwd's", async (t) => {
  const { served, binding } = setupTrees(t);
  const capture = await invoke(routeDeps(binding), "get", SITES);

  assert.equal(capture.statusCode, 200);
  const body = capture.jsonBody as { sites: Array<{ name: string; dir: string; active: boolean; registration: string }>; persistedSiteName: string | null; currentSite: { dir: string; listed: boolean } };
  assert.deepEqual(
    body.sites.map((site) => [site.name, site.dir, site.active, site.registration]),
    [
      ["alpha", path.join(served, "sites", "alpha"), true, "registered"],
      ["beta", path.join(served, "sites", "beta"), false, "registered"],
    ],
  );
  assert.equal(body.currentSite.dir, path.join(served, "sites", "alpha"));
  assert.equal(body.currentSite.listed, true);
  assert.equal(body.persistedSiteName, "beta", "the pending choice is read from the served tree's .env");
});

test("Create: the new site is made under the served tree's sites/, not the cwd's", async (t) => {
  const { served, binding } = setupTrees(t);
  const bases: string[] = [];
  const createSite: AdminSitesDeps["createSite"] = async (required, optional) => {
    const base = optional?.cwd ?? process.cwd();
    bases.push(base);
    return { name: required.name, dir: path.join(base, "sites", required.name), siteId: "new-id" };
  };
  const capture = await invoke(routeDeps(binding, { createSite }), "post", SITES, { body: { name: "delta" } });

  assert.equal(capture.statusCode, 201);
  assert.deepEqual(bases, [served]);
  assert.equal((capture.jsonBody as { site: { dir: string } }).site.dir, path.join(served, "sites", "delta"));
});

test("Activate: a served-tree site is found and the choice is written to the served tree's .env", async (t) => {
  const { served, wrong, binding } = setupTrees(t);
  const capture = await invoke(routeDeps(binding), "post", `${SITES}/:name/activate`, { params: { name: "beta" } });

  assert.equal(capture.statusCode, 200);
  assert.equal(fs.readFileSync(path.join(served, ".env"), "utf8"), "TOVU_SITE=beta\n");
  assert.equal(fs.readFileSync(path.join(wrong, ".env"), "utf8"), "TOVU_SITE=gamma\n", "the cwd's .env is never touched");
});

test("Activate: a site that exists only under the cwd's sites/ is a 404, and nothing is written", async (t) => {
  const { served, wrong, binding } = setupTrees(t);
  const capture = await invoke(routeDeps(binding), "post", `${SITES}/:name/activate`, { params: { name: "gamma" } });

  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { code: string }).code, "SITE_NOT_FOUND");
  assert.equal(fs.readFileSync(path.join(served, ".env"), "utf8"), "TOVU_SITE=beta\n");
  assert.equal(fs.readFileSync(path.join(wrong, ".env"), "utf8"), "TOVU_SITE=gamma\n");
});

test("List on an install-dir boot (tovu serve <dir>): only the served site, never the cwd's sites/ or .env", async (t) => {
  const { wrong } = setupTrees(t);
  const installDir = path.join(path.dirname(wrong), "install", "my-site");
  writeSite(installDir, "My Site");
  const binding: SiteBinding = { dir: installDir, name: "my-site", dirOverridden: false, switcherCompatible: false };

  const capture = await invoke(routeDeps(binding), "get", SITES);

  assert.equal(capture.statusCode, 200);
  const body = capture.jsonBody as { sites: Array<{ name: string; dir: string; active: boolean; registration: string }>; persistedSiteName: string | null; currentSite: { listed: boolean } };
  assert.deepEqual(
    body.sites.map((site) => [site.name, site.dir, site.active, site.registration]),
    [["my-site", installDir, true, "registered"]],
  );
  assert.equal(body.currentSite.listed, true, "tovu serve accepted this folder, so it is a registered site");
  assert.equal(body.persistedSiteName, null, "an install-dir boot has no switcher .env to read a pending choice from");
});
