import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { describeSiteBinding } from "#src/platform/site-dir/index";
import {
  assertOverridesPairedOrAbsent, pluginFailureThresholdOverride, resolveSiteBindingOverride, resolveThemesDirOverride, resolveWorkspaceIdOverride,
} from "../overrides.js";

/** @file The composition root's override readers: each supplied override wins, and each absent one falls back to the site's own value. */

type Overrides = NonNullable<Parameters<typeof assertOverridesPairedOrAbsent>[0]>;
type Kernel = Parameters<typeof resolveWorkspaceIdOverride>[0];
const PAIRING = /overrides\.db \(or overrides\.store\) and overrides\.workspaceId must be supplied together or not at all/;

test("a supplied database or store must come with a workspace id, and a workspace id with a database or store", () => {
  const db = {} as Overrides["db"];
  const store = {} as Overrides["store"];
  assert.throws(() => assertOverridesPairedOrAbsent({ db }), PAIRING);
  assert.throws(() => assertOverridesPairedOrAbsent({ store }), PAIRING);
  assert.throws(() => assertOverridesPairedOrAbsent({ workspaceId: "ws-1" }), PAIRING);
  for (const paired of [undefined, {}, { db, workspaceId: "ws-1" }, { store, workspaceId: "ws-1" }]) assert.doesNotThrow(() => assertOverridesPairedOrAbsent(paired));
});

test("the plugin failure threshold is passed on only when overridden, including an override of zero", () => {
  assert.deepEqual(pluginFailureThresholdOverride(undefined), {});
  assert.deepEqual(pluginFailureThresholdOverride({}), {});
  assert.deepEqual(pluginFailureThresholdOverride({ pluginFailureThreshold: 0 }), { failureThreshold: 0 });
});

test("the themes dir is the override when given, else the site's own themes folder", t => {
  const previous = process.env.TOVU_THEMES_DIR;
  delete process.env.TOVU_THEMES_DIR;
  t.after(() => { if (previous !== undefined) process.env.TOVU_THEMES_DIR = previous; });
  const binding = { dir: "/sites/alpha", name: "alpha" } as Parameters<typeof resolveThemesDirOverride>[0];
  assert.equal(resolveThemesDirOverride(binding, { themesDir: "/custom/themes" }), "/custom/themes");
  assert.equal(resolveThemesDirOverride(binding), path.join("/sites/alpha", "themes"));
});

test("the site binding is the override when given, else the database's own site folder", () => {
  const siteBinding = { dir: "/sites/given", name: "given" } as Overrides["siteBinding"];
  assert.equal(resolveSiteBindingOverride({ siteBinding }, { dbPath: "/sites/other/content.db" }), siteBinding);
  const forDb = resolveSiteBindingOverride({}, { dbPath: "/elsewhere/sites/beta/content.db" });
  assert.deepEqual([forDb.dir, forDb.name], ["/elsewhere/sites/beta", "beta"]);
});

test("without a file database path the site binding is the process's own site", () => {
  const own = describeSiteBinding();
  assert.deepEqual(resolveSiteBindingOverride({}, { dbPath: ":memory:" }), own);
  assert.deepEqual(resolveSiteBindingOverride(undefined), own);
});

test("the workspace id is the override when given, else the requested workspace, else the database's only workspace", async () => {
  const rows = [{ id: "ws-a", name: "A", slug: "a", created_at: "2026-01-01", version: 1 }, { id: "ws-b", name: "B", slug: "b", created_at: "2026-01-02", version: 1 }];
  const kernel = (list: typeof rows) => ({ run: async () => list }) as unknown as Kernel;
  assert.equal(await resolveWorkspaceIdOverride(kernel(rows), { workspaceId: "ws-given" }), "ws-given");
  assert.equal(await resolveWorkspaceIdOverride(kernel(rows), { requestedWorkspaceId: "ws-b" }), "ws-b");
  assert.equal(await resolveWorkspaceIdOverride(kernel([rows[1]])), "ws-b");
  await assert.rejects(resolveWorkspaceIdOverride(kernel(rows), { requestedWorkspaceId: "ws-z" }), /no workspace with id "ws-z"/);
});
