import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createSitesWorkspace, type SitesWorkspace } from "../../../platform/site-dir/sites-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { describeSiteBinding, duplicateSite, listSites, type SiteBinding, type ListSitesOptional } from "#src/platform/site-dir/index";

import { buildRegistrations as buildSitesListRegistrations } from "../list-tool.js";
import { buildSitesRegistrations } from "../tool-registrations.js";
import { resolveSitesDeps, type SitesToolDeps } from "../deps.js";

/**
 * @file `sites_duplicate_site` and `sites_list` act on the site this process SERVES
 * (`siteBinding`, handed in by the composition root), never on whatever `process.cwd()` is when
 * the tool runs (development/todos.md, "The sites route and `sites_duplicate_site` re-derive the
 * site binding from `process.cwd()`").
 *
 * The process is moved into a DIFFERENT directory with its own real `sites/` before each call —
 * from the served tree's root the cwd fallback would land on the right folder by coincidence and
 * hide the bug (memory: daemon_inherits_cwd_not_site_dir). `listSites` is the REAL `site-dir`
 * scan; only `duplicateSite` is a spy, because the real one copies a database and what this file
 * proves is which source and target the tool hands it.
 */

const WORKSPACE_ID = "ws-served-binding";

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

/** `<served>/sites/{alpha,beta}` is bound (to alpha); the process stands in `<wrong>` with
 *  `<wrong>/sites/gamma`. */
function setupTrees(t: { after: (fn: () => void) => void }): { served: string; wrong: string; binding: SiteBinding; sitesWorkspace: SitesWorkspace; listFixtureSites: typeof listSites } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-sites-tool-binding-")));
  const served = path.join(root, "served");
  const wrong = path.join(root, "wrong");
  writeSite(path.join(served, "sites", "alpha"), "alpha");
  writeSite(path.join(served, "sites", "beta"), "beta");
  writeSite(path.join(wrong, "sites", "gamma"), "gamma");
  // Checkout roots are explicit discovery inputs; new copies belong in the shared home.
  const sitesWorkspace = createSitesWorkspace({}, { homeDir: root, cwd: served, env: {} });
  const listFixtureSites = (options: ListSitesOptional = {}) => listSites({ ...options, homeDir: root, env: { TOVU_SITE: "alpha", TOVU_SITE_ROOTS: path.join(options.cwd ?? process.cwd(), "sites") } });
  const binding = describeSiteBinding({ cwd: served, homeDir: root, env: { TOVU_SITE: "alpha", TOVU_SITE_ROOTS: path.join(served, "sites") } });
  assert.equal(binding.switcherCompatible, true, "precondition: a switcher-chosen boot");

  const previousCwd = process.cwd();
  process.chdir(wrong);
  t.after(() => {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { served, wrong, binding, sitesWorkspace, listFixtureSites };
}

function ctxFor(input: unknown): ToolExecutionContext {
  return {
    executionId: "exec-sites-binding",
    principal: { id: "owner" } as ToolExecutionContext["principal"],
    run: { id: "run-1" } as ToolExecutionContext["run"],
    input,
    signal: new AbortController().signal,
  };
}

function handlerFor(registrations: ToolRegistration[], id: string): ToolRegistration["handler"] {
  const found = registrations.find((registration) => registration.descriptor.id === id);
  assert.ok(found, `expected a registration for '${id}'`);
  return found.handler;
}

function duplicateDeps(fixture: ReturnType<typeof setupTrees>, calls: Array<{ sourceDir: string; targetDir: string }>): SitesToolDeps {
  return {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "test" }),
    isSiteSwitcherEnabled: () => true,
    createSite: async () => assert.fail("unexpected site creation"),
    siteBinding: fixture.binding,
    sitesWorkspace: fixture.sitesWorkspace,
    listSites: fixture.listFixtureSites,
    duplicateSite: async (required) => {
      calls.push({ sourceDir: required.sourceDir, targetDir: required.targetDir });
      return { siteId: "dup-id", dir: required.targetDir };
    },
  };
}

test("site dependency resolution defaults to the shared site-dir implementations and the served binding's base", async (t) => {
  const fixture = setupTrees(t);
  const resolved = resolveSitesDeps({
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "test" }),
    createSite: async () => assert.fail("unexpected site creation"),
    siteBinding: fixture.binding,
  });

  assert.equal(resolved.listSites, listSites);
  assert.equal(resolved.duplicateSite, duplicateSite);
  assert.equal(resolved.switcherBase, fixture.served);
  assert.equal(resolved.switcherCompatible, true);
});

test("sites_duplicate_site: the source is found and the copy is made under the served tree's sites/", async (t) => {
  const fixture = setupTrees(t);
  const { served } = fixture;
  const calls: Array<{ sourceDir: string; targetDir: string }> = [];
  const handler = handlerFor(buildSitesRegistrations(duplicateDeps(fixture, calls)), "sites_duplicate_site");

  const result = await handler(ctxFor({ sourceName: "beta", targetName: "beta-copy" }));

  // Source discovery remains boot-bound; 1cffdf3cf puts every new copy in the shared home.
  assert.deepEqual(calls, [{ sourceDir: path.join(served, "sites", "beta"), targetDir: path.join(fixture.sitesWorkspace.home({}), "beta-copy") }]);
  assert.equal((result as { dir: string }).dir, path.join(fixture.sitesWorkspace.home({}), "beta-copy"));
});

test("sites_duplicate_site: a source that exists only under the cwd's sites/ is refused, and nothing is copied", async (t) => {
  const fixture = setupTrees(t);
  const calls: Array<{ sourceDir: string; targetDir: string }> = [];
  const handler = handlerFor(buildSitesRegistrations(duplicateDeps(fixture, calls)), "sites_duplicate_site");

  await assert.rejects(
    () => handler(ctxFor({ sourceName: "gamma", targetName: "gamma-copy" })),
    (err: unknown) => err instanceof Error && err.name === "ToolInputError" && err.message.includes("does not name a real site"),
  );
  assert.deepEqual(calls, []);
});

test("sites_list: sites[] comes from the served tree, not the cwd's", async (t) => {
  const fixture = setupTrees(t);
  const { served, binding } = fixture;
  const handler = handlerFor(
    buildSitesListRegistrations({
      workspaceId: WORKSPACE_ID,
      authorize: async () => ({ allowed: true, reason: "test" }),
      siteBinding: binding,
      listSites: fixture.listFixtureSites,
      isSiteSwitcherEnabled: () => true,
      readPersistedActiveSite: () => null,
    }),
    "sites_list",
  );

  const result = (await handler(ctxFor({}))) as { sites: Array<{ name: string; dir: string; active: boolean; registration: string }>; currentSite: { listed: boolean } };

  assert.deepEqual(
    result.sites.map((site) => [site.name, site.dir, site.active, site.registration]),
    [
      ["alpha", path.join(served, "sites", "alpha"), true, "registered"],
      ["beta", path.join(served, "sites", "beta"), false, "registered"],
    ],
  );
  assert.equal(result.currentSite.listed, true);
});
