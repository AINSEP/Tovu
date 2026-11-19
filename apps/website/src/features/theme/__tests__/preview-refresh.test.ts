import { isReservedThemePreviewPath } from "../preview-policy.js";
import { buildConfirmedThemesRegistrations } from '../../../assistant/__tests__/fixtures/confirmed-registrations.js';
/** Spec/ADR: ADS-memory/.local-artifacts/theme-preview-refresh/design.md */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readThemePreviewRefresh,
  validatePreviewPath,
} from "@jini-ai/cms/themes/preview/refresh";

test("preview paths are local public paths, with exact actionable refusals", () => {
  assert.equal(validatePreviewPath({ path: "/articles/example?tab=1#body", isReservedPath: isReservedThemePreviewPath }), "/articles/example?tab=1#body");
  for (const path of [
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/api/admin",
    "/API",
    "/AdMiN/settings",
    "/%61dmin",
    "/foo/../admin",
  ]) {
    assert.throws(() => validatePreviewPath({ path, isReservedPath: isReservedThemePreviewPath }), {
      message: "path must be a site-relative public URL starting with /",
    });
  }
});

test("preview_reload is registered by category, authorizes before signaling, and accepts optional path", async (t) => {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-tool-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  const calls: unknown[] = [];
  const deps = {
    themesDir,
    themes: [],
    workspaceId: "ws",
    authorize: async (input: unknown) => {
      calls.push(input);
      return { allowed: true };
    },
  };
  const registration = buildConfirmedThemesRegistrations(deps as never).find(
    (r) => r.descriptor.id === "preview_reload",
  );
  assert.ok(registration);
  const result = await registration.handler({
    input: { path: "/create-a-theme" },
    principal: { id: "owner" },
  } as never);
  assert.equal(calls.length, 1);
  assert.deepEqual(result, { reloaded: true, ...readThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath }) });
  deps.authorize = async () => ({ allowed: false }) as never;
  const before = readThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath });
  await assert.rejects(() => registration.handler({ input: {}, principal: { id: "owner" } } as never));
  assert.deepEqual(readThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath }), before);
});

test("admin and assistant save chokepoints both signal, rejected writes do not", async (t) => {
  const { discoverAllBuiltInThemes } = await import("../theme-discovery.js");
  const { reloadTheme } = await import("../../../server/inbound/admin-http/routes/themes/explore.js");
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "save-refresh-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  const dir = path.join(themesDir, "plain");
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "declarative", engine: 1 }),
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}");
  fs.writeFileSync(path.join(dir, "templates/home.json"), '{"type":"doc","content":[]}');
  const deps = {
    themesDir,
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }),
    workspaceId: "ws",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    resolveActiveThemeId: async () => "",
  };
  assert.equal(readThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath }), null);
  reloadTheme({ deps: deps as never, themeId: "plain" });
  const first = readThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath });
  assert.ok(first);
  const writer = buildConfirmedThemesRegistrations(deps).find((r) => r.descriptor.id === "theme_write_file");
  assert.ok(writer);
  await writer.handler({
    input: { themeId: "plain", path: "tokens.json", content: '{"--ink":"#fff"}' },
    principal: { id: "owner" },
    executionId: 'save', run: { id: 'run' }, signal: new AbortController().signal,
  } as never);
  const second = readThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath });
  assert.ok(second);
  assert.notEqual(first.revision, second.revision);
  await assert.rejects(() =>
    writer.handler({
      input: { themeId: "plain", path: "../escape", content: "bad" },
      principal: { id: "owner" },
      executionId: 'invalid-save', run: { id: 'run' }, signal: new AbortController().signal,
    } as never),
  );
  assert.deepEqual(readThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath }), second);
});

test("theme settings publish also signals previews", async (t) => {
  const { setThemePagePublished } = await import("../page-publication.js");
  const { loadTheme } = await import("../theme.js");
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-refresh-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  const dir = path.join(themesDir, "static", "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({
      id: "plain",
      name: "Plain",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      publishedPages: [],
    }),
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}");
  fs.writeFileSync(path.join(dir, "pages/index.html"), "<html></html>");
  fs.writeFileSync(path.join(dir, "pages/about.html"), "<html></html>");
  const deps = { themesDir, themes: [loadTheme({ themeDir: dir, id: "plain", source: "built-in" })] };
  assert.equal(readThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath }), null);
  await setThemePagePublished(deps, { themeId: "plain", page: "about", published: true });
  assert.ok(readThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath }));
});

test("both active-theme settings writers signal a new preview revision", async (t) => {
  const { InMemoryPresentationSettingsRepo } = await import("../../presentation/index.js");
  const { createFakeClock } = await import("../../../__tests__/support/fake-clock.js");
  const { buildSetActiveThemeRegistrations } = await import("../set-active-theme-tool.js");
  const { registerAdminPresentationPatchRoute } = await import(
    "../../../server/inbound/admin-http/routes/presentation/patch-active-theme.js"
  );
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "active-refresh-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  const deps = {
    themesDir,
    themes: [],
    workspaceId: "ws",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: createFakeClock({ startIso: "2026-10-06T00:00:00.000Z" }),
    presentationRepo: new InMemoryPresentationSettingsRepo(
      {},
      { initialRows: [{ workspaceId: "ws", activeThemeId: "none", updatedAt: "2026-10-05T00:00:00.000Z" }] },
    ),
  };
  const registration = buildSetActiveThemeRegistrations(deps)[0];
  assert.equal(readThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath }), null);
  assert.deepEqual(
    await registration.handler({ input: { themeId: "none" }, principal: { id: "owner" } } as never),
    { previousThemeId: "none", activeThemeId: "none" },
  );
  const first = readThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath });
  assert.ok(first);
  let patch: (...args: any[]) => Promise<void> = async (..._args: any[]) => {
    throw new Error("missing handler");
  };
  registerAdminPresentationPatchRoute(
    { app: {
      patch: (route: string, handler: typeof patch) => {
        assert.equal(route, "/api/admin/v1/workspaces/:workspaceId/presentation");
        patch = handler;
      },
    } as never, deps: deps as never },
  );
  let body: any;
  const response = {
    locals: { principal: { id: "owner" } },
    json: (value: unknown) => {
      body = value;
    },
    status: () => response,
  };
  await patch({ params: { workspaceId: "ws" }, body: { activeThemeId: "none" } }, response);
  assert.deepEqual(body.settings, {
    workspaceId: "ws",
    activeThemeId: "none",
    updatedAt: "2026-10-05T00:00:00.000Z",
  });
  assert.notEqual(readThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath })?.revision, first.revision);
});

test("preview path refusals: control characters, undecodable escapes and URL-normalised admin paths", () => {
  for (const path of ["/has space", "/tab\there", "/%E0%A4%A", "/./admin", "/./api", "/%61pi", "/x/%2e%2e/api"]) {
    assert.throws(() => validatePreviewPath({ path, isReservedPath: isReservedThemePreviewPath }), {
      message: "path must be a site-relative public URL starting with /",
    }, path);
  }
  assert.equal(validatePreviewPath({ path: "/administrator", isReservedPath: isReservedThemePreviewPath }), "/administrator", "only the exact admin/api segment is reserved");
});

