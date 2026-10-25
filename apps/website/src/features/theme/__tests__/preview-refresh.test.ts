/** Spec/ADR: ADS-memory/.local-artifacts/theme-preview-refresh/design.md */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readThemePreviewRefresh,
  requestThemePreviewRefresh,
  validatePreviewPath,
} from "../preview-refresh.js";
import { buildThemesRegistrations } from "../tool-registrations.js";

test("refresh marker crosses independent readers and clears navigation after a save", (t) => {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "theme-refresh-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  assert.equal(readThemePreviewRefresh({ themesDir }), null);
  const event = requestThemePreviewRefresh(
    { themesDir },
    { path: "/create-a-theme?lang=en", revision: "revision-1" },
  );
  assert.deepEqual(event, { revision: "revision-1", path: "/create-a-theme?lang=en" });
  assert.deepEqual(readThemePreviewRefresh({ themesDir }), event);
  requestThemePreviewRefresh({ themesDir }, { revision: "revision-2" });
  assert.deepEqual(readThemePreviewRefresh({ themesDir }), { revision: "revision-2" });
});

test("preview paths are local public paths, with exact actionable refusals", () => {
  assert.equal(validatePreviewPath({ path: "/articles/example?tab=1#body" }), "/articles/example?tab=1#body");
  for (const path of [
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/api/admin",
    "/%61dmin",
    "/foo/../admin",
  ]) {
    assert.throws(() => validatePreviewPath({ path }), {
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
  const registration = buildThemesRegistrations(deps as never).find(
    (r) => r.descriptor.id === "preview_reload",
  );
  assert.ok(registration);
  const result = await registration.handler({
    input: { path: "/create-a-theme" },
    principal: { id: "owner" },
  } as never);
  assert.equal(calls.length, 1);
  assert.deepEqual(result, { reloaded: true, ...readThemePreviewRefresh({ themesDir }) });
  deps.authorize = async () => ({ allowed: false }) as never;
  const before = readThemePreviewRefresh({ themesDir });
  await assert.rejects(() => registration.handler({ input: {}, principal: { id: "owner" } } as never));
  assert.deepEqual(readThemePreviewRefresh({ themesDir }), before);
});

test("admin and assistant save chokepoints both signal, rejected writes do not", async (t) => {
  const { discoverAllBuiltInThemes } = await import("../theme.js");
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
  assert.equal(readThemePreviewRefresh({ themesDir }), null);
  reloadTheme(deps as never, "plain");
  const first = readThemePreviewRefresh({ themesDir });
  assert.ok(first);
  const writer = buildThemesRegistrations(deps).find((r) => r.descriptor.id === "theme_write_file");
  assert.ok(writer);
  await writer.handler({
    input: { themeId: "plain", path: "tokens.json", content: '{"--ink":"#fff"}' },
    principal: { id: "owner" },
  } as never);
  const second = readThemePreviewRefresh({ themesDir });
  assert.ok(second);
  assert.notEqual(first.revision, second.revision);
  await assert.rejects(() =>
    writer.handler({
      input: { themeId: "plain", path: "../escape", content: "bad" },
      principal: { id: "owner" },
    } as never),
  );
  assert.deepEqual(readThemePreviewRefresh({ themesDir }), second);
});

test("feed starts silently, deduplicates ticks and delivers optional navigation on new writes", async () => {
  const { createThemePreviewFeed } = await import("../preview-refresh.js");
  let frame = { revision: "initial", path: "/old-tool-path" };
  const emitted: unknown[] = [];
  const feed = createThemePreviewFeed({ read: () => frame, emit: (event) => emitted.push(event) });
  feed();
  feed();
  frame = { revision: "changed", path: "/new-tool-path" };
  feed();
  feed();
  assert.deepEqual(emitted, [{ revision: "changed", path: "/new-tool-path" }]);
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
  assert.equal(readThemePreviewRefresh({ themesDir }), null);
  await setThemePagePublished(deps, { themeId: "plain", page: "about", published: true });
  assert.ok(readThemePreviewRefresh({ themesDir }));
});

test("a tool navigation between connection and first tick is delivered, not treated as historical", async () => {
  const { createThemePreviewFeed } = await import("../preview-refresh.js");
  let frame: import("../preview-refresh.js").ThemePreviewRefresh | null = null;
  const emitted: unknown[] = [];
  const feed = createThemePreviewFeed({ read: () => frame, emit: (next) => emitted.push(next) });
  frame = { revision: "new-tool", path: "/create-a-theme" };
  feed();
  assert.deepEqual(emitted, [{ revision: "new-tool", path: "/create-a-theme" }]);
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
  assert.equal(readThemePreviewRefresh({ themesDir }), null);
  assert.deepEqual(
    await registration.handler({ input: { themeId: "none" }, principal: { id: "owner" } } as never),
    { previousThemeId: "none", activeThemeId: "none" },
  );
  const first = readThemePreviewRefresh({ themesDir });
  assert.ok(first);
  let patch: (...args: any[]) => Promise<void> = async () => {
    throw new Error("missing handler");
  };
  registerAdminPresentationPatchRoute(
    {
      patch: (route: string, handler: typeof patch) => {
        assert.equal(route, "/api/admin/v1/workspaces/:workspaceId/presentation");
        patch = handler;
      },
    } as never,
    deps as never,
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
    updatedAt: "2026-10-06T00:00:00.000Z",
  });
  assert.notEqual(readThemePreviewRefresh({ themesDir })?.revision, first.revision);
});

test("a resumed desktop feed delivers the revision saved during its disconnected interval", async () => {
  const { createThemePreviewFeed } = await import("../preview-refresh.js");
  const emitted: unknown[] = [];
  const frame = { revision: "while-disconnected", path: "/new-path" };
  const tick = createThemePreviewFeed({ read: () => frame, emit: (next) => emitted.push(next) }, { resumeRevision: "last-delivered" });
  tick(); tick();
  assert.deepEqual(emitted, [frame]);
});


test("deskfx M1: a refresh may create themes inside an existing site but never recreate a moved site", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-no-resurrection-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const themesDir = path.join(root, "themes");
  requestThemePreviewRefresh({ themesDir }, { revision: "first" });
  assert.equal(readThemePreviewRefresh({ themesDir })?.revision, "first");
  requestThemePreviewRefresh({ themesDir }, { revision: "second" });
  assert.equal(readThemePreviewRefresh({ themesDir })?.revision, "second");
  const moved = path.join(root, "moved-site");
  assert.throws(() => requestThemePreviewRefresh({ themesDir: path.join(moved, "themes") }), { code: "ENOENT" });
  assert.equal(fs.existsSync(moved), false);
  const file = path.join(root, "file"); fs.writeFileSync(file, "keep");
  assert.throws(() => requestThemePreviewRefresh({ themesDir: file }), { code: "EEXIST" });
  assert.equal(fs.readFileSync(file, "utf8"), "keep");
});

test("preview path refusals: control characters, undecodable escapes and URL-normalised admin paths", () => {
  for (const path of ["/has space", "/tab\there", "/%E0%A4%A", "/./admin", "/x/%2e%2e/api"]) {
    assert.throws(() => validatePreviewPath({ path }), {
      message: "path must be a site-relative public URL starting with /",
    }, path);
  }
  assert.equal(validatePreviewPath({ path: "/administrator" }), "/administrator", "only the exact admin/api segment is reserved");
});

test("a marker with an invalid revision or an unsafe stored path reads as no refresh", (t) => {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "theme-refresh-invalid-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  const marker = path.join(themesDir, ".preview-refresh.json");
  fs.writeFileSync(marker, JSON.stringify({ revision: 42 }));
  assert.equal(readThemePreviewRefresh({ themesDir }), null);
  fs.writeFileSync(marker, JSON.stringify({ revision: "has space" }));
  assert.equal(readThemePreviewRefresh({ themesDir }), null);
  fs.writeFileSync(marker, JSON.stringify({ revision: "ok-1", path: "//evil.example" }));
  assert.equal(readThemePreviewRefresh({ themesDir }), null);
  fs.writeFileSync(marker, JSON.stringify({ revision: "ok-2", path: "/fine" }));
  assert.deepEqual(readThemePreviewRefresh({ themesDir }), { revision: "ok-2", path: "/fine" });
});

test("a feed that starts with no marker stays silent until one appears, and ignores a vanished marker", async () => {
  const { createThemePreviewFeed } = await import("../preview-refresh.js");
  let frame: import("../preview-refresh.js").ThemePreviewRefresh | null = null;
  const emitted: unknown[] = [];
  const tick = createThemePreviewFeed({ read: () => frame, emit: (next) => emitted.push(next) });
  tick();
  assert.deepEqual(emitted, []);
  frame = { revision: "first" };
  tick();
  frame = null;
  tick();
  assert.deepEqual(emitted, [{ revision: "first" }]);
});
