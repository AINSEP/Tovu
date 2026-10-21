import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { resolveActiveThemeId } from "#src/features/presentation/index";
import { createSettingsPrincipalLookup, type SetValueRequired } from "#src/features/settings/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { exportSite } from "#src/features/site-export/site-exporter";
import { buildPreviewExportManifest } from "#src/features/site-export/theme-preview-manifest";
import { buildPreviewSwitcherRegistrations } from "../preview-switcher-tools.js";
import { readPreviewSwitcher } from "../preview-switcher.js";
import type { DiscoveredTheme } from "../theme.js";

/** Owner dispatch 2026-10-20: the actual composed settings writer, HTTP renderer and exporter. */
async function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "tovu-preview-switcher-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  deps.themesDir = join(root, "themes");
  const themes: DiscoveredTheme[] = ["preview-one", "preview-two"].map(id => {
    const dir = join(deps.themesDir, "static", id);
    mkdirSync(join(dir, "css"), { recursive: true });
    // The shared seed owns "/" and "/about" as content pages: a static theme renders them only when it
    // declares them as templates and gives the content a slot, so each fixture theme does both.
    const html = `<!doctype html><html><head><title>${id}</title><link rel="stylesheet" href="../css/theme.css" /></head><body><header style="position:fixed;top:0">Header</header><h1>${id}</h1><a href="/about">About</a><a href="/welcome">Post</a><div data-embed-config='{"type":"content"}'></div></body></html>`;
    writeFileSync(join(dir, "css/theme.css"), `body{color:${id === "preview-one" ? "red" : "blue"}}`);
    return { manifest: { id, name: id, version: "1.0.0", tier: "static", engine: 1, apiVersion: 2, templates: ["index", "about"] }, dir,
      tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
      pages: { index: html, about: html }, partials: {}, css: "", source: "site", status: "valid", errors: [] };
  });
  deps.themes.splice(0, deps.themes.length, ...themes);
  const presentation = await deps.presentationRepo.findByWorkspaceId({ workspaceId: deps.workspaceId });
  assert.ok(presentation);
  await deps.presentationRepo.save({ ...presentation, activeThemeId: "preview-one" });
  const principals = createSettingsPrincipalLookup({ repo: deps.principalRepo });
  const authorize: SetValueRequired["deps"]["authorize"] = async ({ permission }) => ({ allowed: permission === "theme.set" || permission === "theme.read", reason: "fixture" });
  const writeDeps = { repo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen, principals, authorize };
  const config = { enabled: true, position: "top", themes: [{ themeId: "preview-one", label: "One" }, { themeId: "preview-two", label: "Two" }] };
  const input = { namespace: "core.theme", key: "previewSwitcher", scope: "workspace" as const, workspaceId: deps.workspaceId, callerPrincipalId: "owner", value: config };
  const save = (overrides: Partial<SetValueRequired["input"]> = {}) => deps.set({ deps: writeDeps, input: { ...input, ...overrides } });
  return { deps, config, save, writeDeps, input, root, principals, authorize };
}

test("workspace setting defaults disabled; generic writes validate installed roster, aliases, scope and theme.set before revisions", async t => {
  const f = await fixture(t);
  assert.equal((await readPreviewSwitcher({ ...f.deps, activeThemeId: "preview-one" })).enabled, false);
  await f.save(); // The authorizer grants theme.set only, not settings.workspace.write.
  const before = await f.deps.settingsRepo.maxRevisionSeq();
  await assert.rejects(f.save({ value: { ...f.config, themes: [f.config.themes[0], { themeId: "absent", label: "No" }] } }), /installed themes/);
  await assert.rejects(f.save({ scope: "user", principalId: "owner" }), /Theme preview requires/);
  await assert.rejects(f.deps.set({ deps: { ...f.writeDeps, authorize: async () => ({ allowed: false, reason: "denied" }) }, input: f.input }), /theme.set/);
  assert.equal(await f.deps.settingsRepo.maxRevisionSeq(), before);
  const definition = await f.deps.settingsRepo.findActiveDefinition({ namespace: "core.theme", key: "previewSwitcher", workspaceId: null });
  assert.ok(definition);
  await f.deps.settingsRepo.saveDefinition({ ...definition, settingId: "preview-alias", namespace: "core.preview-alias", key: "choices", status: "alias", aliasOfNamespace: "core.theme", aliasOfKey: "previewSwitcher" });
  await assert.rejects(f.save({ namespace: "core.preview-alias", key: "choices", value: { ...f.config, themes: [] } }), /Theme preview requires/);
  assert.equal(await f.deps.settingsRepo.maxRevisionSeq(), before);
  f.deps.themes.push({ ...f.deps.themes[0], manifest: { ...f.deps.themes[0].manifest, id: "preview-three", name: "Three" } });
  await f.deps.presentationRepo.save({ ...(await f.deps.presentationRepo.findByWorkspaceId({ workspaceId: f.deps.workspaceId }))!, activeThemeId: "preview-three" });
  const changed = await readPreviewSwitcher({ ...f.deps, activeThemeId: "preview-three" });
  assert.ok(changed.themes.some(theme => theme.themeId === "preview-three"));
  assert.equal(changed.themes.length, 3);
  f.deps.themes.splice(0, 2);
  assert.equal((await readPreviewSwitcher({ ...f.deps, activeThemeId: "preview-three" })).enabled, false);
});

test("assistant get/update use the ledger and active-theme permission; denied and invalid tools never write", async t => {
  const f = await fixture(t);
  const registrations = buildPreviewSwitcherRegistrations({ deps: { ...f.deps, authorize: f.authorize, themesDir: undefined, principalRepo: f.principals } });
  const call = (id: string, input: unknown = {}) => {
    const tool = registrations.find(registration => registration.descriptor.id === id);
    assert.ok(tool);
    return tool.handler({ executionId: "preview-test", principal: { id: "owner" }, run: { id: "run" }, input, signal: new AbortController().signal } as ToolExecutionContext);
  };
  assert.equal((await call("theme_get_preview_switcher") as { enabled: boolean }).enabled, false);
  await call("theme_update_preview_switcher", f.config);
  assert.deepEqual(await call("theme_get_preview_switcher"), f.config);
  const before = await f.deps.settingsRepo.maxRevisionSeq();
  await assert.rejects(call("theme_update_preview_switcher", { ...f.config, themes: [] }), { name: "ToolInputError" });
  await assert.rejects(call("theme_update_preview_switcher", { ...f.config, themes: [f.config.themes[0], { themeId: "absent", label: "No" }] }), { name: "ToolInputError" });
  const denied = buildPreviewSwitcherRegistrations({ deps: { ...f.deps, authorize: async () => ({ allowed: false, reason: "no_grant" }), themesDir: undefined, principalRepo: f.principals } });
  const update = denied.find(registration => registration.descriptor.id === "theme_update_preview_switcher")!;
  await assert.rejects(update.handler({ principal: { id: "owner" }, input: f.config } as ToolExecutionContext), /theme.set/);
  assert.equal(await f.deps.settingsRepo.maxRevisionSeq(), before);
});

test("live server chooses per request; cookie persists, reset clears, canonical and no-store hold; disabled is inert", async t => {
  const f = await fixture(t);
  const url = await startTestServer(createApp(f.deps), t);
  const disabled = await fetch(`${url}/?theme=preview-two`, { headers: { cookie: "tovu_theme_preview=preview-two" } });
  const disabledHtml = await disabled.text();
  assert.match(disabledHtml, /<h1>preview-one<\/h1>/);
  assert.doesNotMatch(disabledHtml, /tovu-theme-preview-host/);
  await f.save();
  const before = await f.deps.settingsRepo.maxRevisionSeq();
  const preview = await fetch(`${url}/?theme=preview-two`);
  const html = await preview.text();
  assert.equal(preview.status, 200);
  assert.match(html, /<h1>preview-two<\/h1>/);
  assert.match(html, /tovu-theme-preview-host/);
  assert.match(html, /rel="canonical" href="http:\/\/localhost:3000\/"/);
  assert.equal(preview.headers.get("cache-control"), "private, no-store");
  const setCookie = preview.headers.get("set-cookie")!;
  assert.match(setCookie, /tovu_theme_preview=preview-two/);
  assert.match(setCookie, /HttpOnly/);
  const cookie = setCookie.split(";")[0];
  const saved = await fetch(`${url}/about`, { headers: { cookie } });
  assert.match(await saved.text(), /<h1>preview-two<\/h1>/);
  assert.equal(saved.headers.get("cache-control"), "private, no-store");
  const normal = await fetch(`${url}/`);
  assert.match(await normal.text(), /<h1>preview-one<\/h1>/);
  const unknown = await fetch(`${url}/?theme=absent`, { headers: { cookie } });
  assert.match(await unknown.text(), /<h1>preview-one<\/h1>/);
  const reset = await fetch(`${url}/?theme=reset`, { headers: { cookie } });
  assert.match(await reset.text(), /<h1>preview-one<\/h1>/);
  assert.match(reset.headers.get("set-cookie")!, /tovu_theme_preview=;/);
  assert.match(reset.headers.get("set-cookie")!, /Expires=Thu, 01 Jan 1970/);
  assert.equal(reset.headers.get("cache-control"), "private, no-store");
  assert.equal(await resolveActiveThemeId(f.deps), "preview-one");
  assert.equal(await f.deps.settingsRepo.maxRevisionSeq(), before);
  const concurrent = await Promise.all(["preview-one", "preview-two"].map(async theme => {
    const response = await fetch(`${url}/?theme=${theme}`);
    assert.match(await response.text(), new RegExp(`<h1>${theme}</h1>`));
  }));
  assert.equal(concurrent.length, 2);
});

test("static manifest and real export include themed pages/assets, noindex, canonical, prefixed navigation and size multiplier", async t => {
  const f = await fixture(t);
  await f.save();
  const { manifest, themeCount } = await buildPreviewExportManifest({ routeDeps: f.deps });
  assert.equal(themeCount, 2);
  assert.ok(manifest.routes.some(route => route.path === "/_themes/preview-two/about"));
  assert.ok(!manifest.routes.some(route => route.path === "/_themes/preview-one/"));
  assert.ok(!manifest.routes.some(route => route.path.startsWith("/_themes/") && ["well-known", "not-found"].includes(route.kind)));
  const outputDir = join(f.root, "export");
  const result = await exportSite({ routeDeps: f.deps, outputDir });
  assert.deepEqual(result.routes.failed, []);
  assert.deepEqual(result.assets.failed, []);
  const variant = readFileSync(join(outputDir, "_themes/preview-two/about/index.html"), "utf8");
  assert.match(variant, /<h1>preview-two<\/h1>/);
  assert.match(variant, /name="robots" content="noindex"/);
  assert.match(variant, /rel="canonical" href="http:\/\/localhost:3000\/about"/);
  assert.match(variant, /href="\/_themes\/preview-two\/about"/);
  assert.match(variant, /href="\/_themes\/preview-two\/welcome"/);
  assert.match(variant, /tovu-theme-preview-host/);
  assert.match(variant, /href="\/theme-assets\/preview-two\/css\/theme.css"/);
  assert.match(readFileSync(join(outputDir, "theme-assets/preview-two/css/theme.css"), "utf8"), /blue/);
  assert.match(readFileSync(join(outputDir, "index.html"), "utf8"), /tovu-theme-preview-host/);
  assert.doesNotMatch(readFileSync(join(outputDir, "sitemap.xml"), "utf8"), /_themes/);
  assert.equal(result.themePreview?.themeCount, 2);
  assert.ok(result.themePreview!.htmlSizeMultiplier > 1);
  assert.ok(result.themePreview!.sizeMultiplier > 1);
  assert.equal(await resolveActiveThemeId(f.deps), "preview-one");
});
