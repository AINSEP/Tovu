import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { describeSiteBinding, type SiteBinding } from "#src/platform/site-dir/index";

import { buildRegistrations as buildSitesListRegistrations } from "../list-tool.js";
import { buildSitesRegistrations } from "../tool-registrations.js";
import type { SitesToolDeps } from "../deps.js";

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
function setupTrees(t: { after: (fn: () => void) => void }): { served: string; wrong: string; binding: SiteBinding } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-sites-tool-binding-")));
  const served = path.join(root, "served");
  const wrong = path.join(root, "wrong");
  writeSite(path.join(served, "sites", "alpha"), "alpha");
  writeSite(path.join(served, "sites", "beta"), "beta");
  writeSite(path.join(wrong, "sites", "gamma"), "gamma");
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

function duplicateDeps(binding: SiteBinding, calls: Array<{ sourceDir: string; targetDir: string }>): SitesToolDeps {
  return {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "test" }),
    isSiteSwitcherEnabled: () => true,
    siteBinding: binding,
    duplicateSite: async (required) => {
      calls.push({ sourceDir: required.sourceDir, targetDir: required.targetDir });
      return { siteId: "dup-id", dir: required.targetDir };
    },
  };
}

test("sites_duplicate_site: the source is found and the copy is made under the served tree's sites/", async (t) => {
  const { served, binding } = setupTrees(t);
  const calls: Array<{ sourceDir: string; targetDir: string }> = [];
  const handler = handlerFor(buildSitesRegistrations(duplicateDeps(binding, calls)), "sites_duplicate_site");

  const result = await handler(ctxFor({ sourceName: "beta", targetName: "beta-copy" }));

  assert.deepEqual(calls, [{ sourceDir: path.join(served, "sites", "beta"), targetDir: path.join(served, "sites", "beta-copy") }]);
  assert.equal((result as { dir: string }).dir, path.join(served, "sites", "beta-copy"));
});

test("sites_duplicate_site: a source that exists only under the cwd's sites/ is refused, and nothing is copied", async (t) => {
  const { binding } = setupTrees(t);
  const calls: Array<{ sourceDir: string; targetDir: string }> = [];
  const handler = handlerFor(buildSitesRegistrations(duplicateDeps(binding, calls)), "sites_duplicate_site");

  await assert.rejects(
    () => handler(ctxFor({ sourceName: "gamma", targetName: "gamma-copy" })),
    (err: unknown) => err instanceof Error && err.name === "ToolInputError" && err.message.includes("does not name a real site"),
  );
  assert.deepEqual(calls, []);
});

test("sites_list: sites[] comes from the served tree, not the cwd's", async (t) => {
  const { served, binding } = setupTrees(t);
  const handler = handlerFor(
    buildSitesListRegistrations({
      workspaceId: WORKSPACE_ID,
      authorize: async () => ({ allowed: true, reason: "test" }),
      siteBinding: binding,
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
