import { nowIso } from "@jini-ai/core/primitives";
/**
 * n07: admin-equivalent tool contracts, permission refusals, risk metadata and durable outcomes.
 * Uses isolated filesystem fixtures and in-memory ports; no live services or listening ports.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isReadOnlyTool, type ToolRegistration } from "@jini-ai/core";
import { ForbiddenError } from "@jini-ai/cms/core";
import { InMemoryPublishContentPeerRepo, saveConnectedDestination } from "../../publish-content/peers.js";
import { discoverAllBuiltInThemes, isStandaloneThemePage } from "../../theme/index.js";

const ws = "n07-workspace";
const clock = { nowMs: () => Date.parse("2026-10-01T00:00:00Z") };
const idGen = { newId: () => "connected-peer" };
const modules = {
  identity_policy_list_permissions: () => import("../../identity/permission-list-tool.js"),
  sites_list: () => import("../../sites/list-tool.js"),
  publish_content_disconnect: () => import("../../publish-content/disconnect-tool.js"),
  theme_set_page_published: async () => ({ buildRegistrations: (await import("../../theme/index.js")).buildThemePagePublishedRegistrations }),
};
const permissions = {
  identity_policy_list_permissions: "role.manage", sites_list: "system.read",
  publish_content_disconnect: "publish_content.apply", theme_set_page_published: "theme.set",
};
const entities = {
  identity_policy_list_permissions: undefined, sites_list: "site-registry",
  publish_content_disconnect: undefined, theme_set_page_published: "presentation",
};
type Id = keyof typeof modules;
async function registration(id: Id, deps: Record<string, unknown>) {
  const mod = await modules[id]();
  const registrations = mod.buildRegistrations(deps as never);
  const found = registrations.find((r: ToolRegistration) => r.descriptor.id === id);
  assert.ok(found, `${id} must be wired`);
  return found;
}
function call(r: ToolRegistration, input: unknown = {}) {
  return r.handler({ executionId: "n07-exec", principal: { id: "operator" }, run: { id: "n07-run" }, input, signal: new AbortController().signal });
}
function auth(allow = true) {
  const checks: unknown[] = [];
  return { checks, deps: { workspaceId: ws, authorize: async (request: unknown) => {
    checks.push(request);
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  } } };
}
for (const id of Object.keys(modules) as Id[]) {
  test(`${id}: risk/readOnly matches the actual service effects`, async () => {
    const r = await registration(id, auth().deps);
    assert.equal(isReadOnlyTool({ descriptor: r.descriptor }), !["publish_content_disconnect", "theme_set_page_published"].includes(id));
    assert.equal(r.descriptor.id, id);
    assert.equal(r.descriptor.requiresConfirmation ?? false, false);
  });
  test(`${id}: denied permission prevents every service call`, async () => {
    const a = auth(false);
    const r = await registration(id, a.deps);
    await assert.rejects(call(r, { policyId: "policy", themeId: "plain", page: "about", published: true }), error => {
      assert.ok(error instanceof ForbiddenError);
      assert.equal(error.message, `principal 'operator' is not authorized for '${permissions[id]}' (insufficient_permission)`);
      return true;
    });
    assert.equal(a.checks.length, 1);
    assert.deepEqual(a.checks[0], {
      principalId: "operator", permission: permissions[id], workspaceId: ws,
      ...(entities[id] === undefined ? {} : { entityType: entities[id] }),
    });
  });
}

test("policy permissions: scoped read, empty result and not-found refusal", async () => {
  const a = auth();
  const requests: unknown[] = [];
  let exists = true;
  let rows = [{ id: "grant", policyId: "policy", permission: "content.read", resourceType: "post", constraintJson: '{"status":"published"}' }];
  const r = await registration("identity_policy_list_permissions", { ...a.deps,
    policyRepo: { findById: async (q: unknown) => { requests.push(q); return exists ? { id: "policy" } : null; } },
    policyPermissionRepo: { listByPolicyId: async (q: unknown) => { requests.push(q); return rows; } },
  });
  assert.deepEqual(await call(r, { policyId: "policy" }), { policyPermissions: rows });
  assert.deepEqual(requests, [{ workspaceId: ws, id: "policy" }, { workspaceId: ws, policyId: "policy" }]);
  rows = [];
  assert.deepEqual(await call(r, { policyId: "policy" }), { policyPermissions: [] });
  exists = false;
  await assert.rejects(call(r, { policyId: "policy" }), { name: "ToolInputError", message: "policy 'policy' was not found. Use content_read.identity_policy to find a policy id." });
  await assert.rejects(call(r, { policyId: "" }), { name: "ToolInputError", message: "policyId must be a non-empty string." });
});

test("sites list: reports served site even when unregistered and switching is disabled", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "n07-sites-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const binding = { dir, name: "served", dirOverridden: true, switcherCompatible: false };
  // An install-dir binding has no switcher `.env`: the cwd's `.env` belongs to another tree, so it is
  // never read (development/todos.md, sites route/duplicate re-deriving from `process.cwd()`).
  const r = await registration("sites_list", { ...auth().deps, siteBinding: binding, listSites: () => [], isSiteSwitcherEnabled: () => false, readPersistedActiveSite: () => assert.fail("no .env to read for an install-dir boot") });
  const result = await call(r) as any;
  assert.deepEqual(Object.keys(result).sort(), ["currentSite", "persistedSiteName", "sites", "switchingEnabled"]);
  assert.deepEqual(result.currentSite, { ...binding, listed: false });
  assert.equal(result.persistedSiteName, null);
  assert.equal(result.switchingEnabled, false);
  assert.equal(result.sites.length, 1);
  assert.deepEqual({ name: result.sites[0].name, active: result.sites[0].active, registration: result.sites[0].registration }, { name: "served", active: true, registration: "unregistered" });
});

test("sites list: registered active site and pending choice stay distinct", async () => {
  const binding = { dir: "/registered", name: "served", dirOverridden: false, switcherCompatible: true };
  const site = { name: "served", dir: "/registered", displayName: "Served", createdAt: nowIso({ clock }), active: true };
  const r = await registration("sites_list", { ...auth().deps, siteBinding: binding, listSites: () => [site], isSiteSwitcherEnabled: () => true, readPersistedActiveSite: () => "queued" });
  assert.deepEqual(await call(r), { switchingEnabled: true, sites: [{ ...site, registration: "registered" }], currentSite: { ...binding, listed: true }, persistedSiteName: "queued" });
});


test("disconnect: removes connected destination, reverses grant, and is idempotent", async () => {
  const repo = new InMemoryPublishContentPeerRepo();
  await saveConnectedDestination({ repo, clock, idGen }, { workspaceId: ws, label: "Live", baseUrl: "https://live.example", remoteWorkspaceId: "remote" });
  let reversals = 0;
  const r = await registration("publish_content_disconnect", { ...auth().deps, clock, idGen, publishContentPeerRepo: repo,
    siteAssistantSecretKeyring: { derive: async () => new Uint8Array(32).fill(1) },
    publishTrustProvisioning: { disconnect: async () => { reversals++; return { ok: true, changed: reversals === 1, target: { nextStep: "Deploy again." } }; } },
    findPublishCandidate: async () => null,
  });
  assert.deepEqual(await call(r), { connected: false, site: null, candidateUrl: "https://live.example", message: "This computer no longer publishes to Live.", nextStep: "Deploy again." });
  assert.deepEqual(await repo.listByWorkspace({ workspaceId: ws }), []);
  assert.deepEqual(await call(r), { connected: false, site: null, candidateUrl: null, message: "This computer was not publishing anywhere.", nextStep: null });
  assert.equal(reversals, 2);
});

test("disconnect: failed grant reversal restores peer and exposes an actionable refusal", async () => {
  const repo = new InMemoryPublishContentPeerRepo();
  await saveConnectedDestination({ repo, clock, idGen }, { workspaceId: ws, label: "Live", baseUrl: "https://live.example", remoteWorkspaceId: "remote" });
  const r = await registration("publish_content_disconnect", { ...auth().deps, clock, idGen, publishContentPeerRepo: repo,
    siteAssistantSecretKeyring: { derive: async () => new Uint8Array(32).fill(1) },
    publishTrustProvisioning: { disconnect: async () => ({ ok: false, reason: "read-only disk" }) },
  });
  await assert.rejects(call(r), { name: "ToolInputError", message: "Publishing settings could not be saved. Check that this project's files can be written, then disconnect again." });
  const rows = await repo.listByWorkspace({ workspaceId: ws });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].baseUrl, "https://live.example");
});

function themeFixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "n07-theme-"));
  const dir = path.join(root, "static", "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  for (const page of ["index", "404", "about", "pricing", "page-shell"]) fs.writeFileSync(path.join(dir, "pages", `${page}.html`), "<html><body>page</body></html>");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}");
  const manifest = { id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1, templates: ["page-shell.html"] };
  const manifestPath = path.join(dir, "theme.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const themes = discoverAllBuiltInThemes({ dir: root, source: "site" });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { themes, themesDir: root, manifest, manifestPath };
}
test("page publish: first toggle only publishes selected page, refreshes runtime and preserves fresh edits", async (t) => {
  const f = themeFixture(t);
  const r = await registration("theme_set_page_published", { ...auth().deps, ...f });
  assert.deepEqual(await call(r, { themeId: "plain", page: "about", published: true }), { page: "about", published: true, publishedPages: ["about"] });
  assert.equal(isStandaloneThemePage(f.themes[0], "about"), true);
  assert.equal(isStandaloneThemePage(f.themes[0], "pricing"), false);
  fs.writeFileSync(f.manifestPath, JSON.stringify({ ...f.manifest, name: "Fresh name", publishedPages: ["pricing"] }));
  assert.deepEqual(await call(r, { themeId: "plain", page: "about", published: true }), { page: "about", published: true, publishedPages: ["about", "pricing"] });
  assert.equal(JSON.parse(fs.readFileSync(f.manifestPath, "utf8")).name, "Fresh name");
  assert.deepEqual(await call(r, { themeId: "plain", page: "about", published: false }), { page: "about", published: false, publishedPages: ["pricing"] });
  assert.equal(isStandaloneThemePage(f.themes[0], "about"), false);
});
test("page publish: wrong types, missing themes, non-static tiers, shells and traversal refuse before writing", async (t) => {
  const f = themeFixture(t);
  const r = await registration("theme_set_page_published", { ...auth().deps, ...f });
  await assert.rejects(call(r, { themeId: "", page: "about", published: true }), { name: "ToolInputError", message: "themeId must be a non-empty string." });
  await assert.rejects(call(r, { themeId: "plain", page: "", published: true }), { name: "ToolInputError", message: "page must be a non-empty string." });
  await assert.rejects(call(r, { themeId: "plain", page: "about", published: "true" }), { name: "ToolInputError", message: "published must be a boolean." });
  await assert.rejects(call(r, { themeId: "missing", page: "about", published: true }), { name: "ToolInputError", message: "theme 'missing' was not found. Use content_read.theme to find a theme id." });
  for (const page of ["index", "404", "page-shell", "missing", "../outside"]) {
    await assert.rejects(call(r, { themeId: "plain", page, published: true }), { name: "ToolInputError", message: `'${page}' is not one of this theme's own standalone pages — it does not exist, or is index/404/a declared template shell` });
  }
  f.themes[0].manifest.tier = "liquid" as any;
  await assert.rejects(call(r, { themeId: "plain", page: "about", published: true }), { name: "ToolInputError", message: "theme 'plain' is tier 'liquid' — publish state only applies to static-tier themes" });
  assert.deepEqual(JSON.parse(fs.readFileSync(f.manifestPath, "utf8")), f.manifest);
});
