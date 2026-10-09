/** Spec/ADR: ADS-memory/.local-artifacts/theme-preview-refresh/design.md */
import assert from "node:assert/strict";
import test from "node:test";
import { createThemePreviewMiddleware, freshThemePreviewHtml } from "../theme-preview-refresh.js";

test("preview assets get a unique directory, preserving relative imports and existing queries", () => {
  const html =
    '<link href="/theme-assets/test/css/theme.css?mode=dark"><script src="/theme-assets/test/js/main.js"></script>';
  assert.equal(
    freshThemePreviewHtml({ html, revision: "revision-1" }),
    '<link href="/theme-preview-assets/revision-1/test/css/theme.css?mode=dark"><script src="/theme-preview-assets/revision-1/test/js/main.js"></script>',
  );
});

test("authenticated preview refreshes registry before rendering and overrides public cache headers", async () => {
  const order: string[] = [];
  const headers: Record<string, string> = {};
  let sent = "";
  const res = {
    set: (k: string, v: string) => {
      headers[k] = v;
      return res;
    },
    send: (html: string) => {
      sent = html;
      return res;
    },
  };
  const handler = createThemePreviewMiddleware({
    authenticate: (_req, _res, next) => {
      order.push("authenticate");
      next();
    },
    syncThemes: () => order.push("refresh"),
  });
  await handler({ query: { __tovu_preview: "revision-1" } } as never, res as never, () => {
    order.push("render");
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.send('<script src="/theme-assets/test/js/main.js"></script>');
  });
  assert.deepEqual(order, ["authenticate", "refresh", "render"]);
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(sent, '<script src="/theme-preview-assets/revision-1/test/js/main.js"></script>');
});

test("normal visitor does not authenticate, rewrite assets, or change caching (the roster sync still runs)", async () => {
  const headers: Record<string, string> = {};
  let sent = "";
  const res = {
    set: (k: string, v: string) => {
      headers[k] = v;
      return res;
    },
    send: (html: string) => {
      sent = html;
      return res;
    },
  };
  let syncs = 0;
  const handler = createThemePreviewMiddleware({
    authenticate: () => assert.fail("public auth"),
    syncThemes: () => { syncs++; },
  });
  handler({ query: {} } as never, res as never, () => {
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.send("/theme-assets/test/css/theme.css");
  });
  assert.equal(sent, "/theme-assets/test/css/theme.css");
  assert.equal(headers["Cache-Control"], "public, max-age=60, stale-while-revalidate=300");
  assert.equal(syncs, 1);
});

test("denied preview never refreshes themes or renders", () => {
  const handler = createThemePreviewMiddleware({
    authenticate: () => {},
    syncThemes: () => assert.fail("unauthenticated reload"),
  });
  handler({ query: { __tovu_preview: "revision-1" } } as never, {} as never, () =>
    assert.fail("unauthenticated render"),
  );
});

test("preview asset handler disables storage and validators while normal asset options remain unchanged", async (t) => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { registerThemeStaticAssets } = await import("../theme-static-assets.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fresh-assets-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "test"));
  const routes: unknown[] = [];
  let handler: Function = () => {};
  const app = {
    use: (route: unknown, _security: unknown, next: Function) => {
      routes.push(route);
      handler = next;
    },
  };
  const options: unknown[] = [];
  registerThemeStaticAssets(app as never, {
    themeRoots: [root],
    serveStatic: (_dir, opts) => {
      options.push(opts);
      return (_req, res) => res.send("fresh stylesheet");
    },
  });
  assert.deepEqual(routes, [["/theme-assets/:themeId", "/theme-preview-assets/:revision/:themeId"]]);
  const headers: Record<string, string> = {};
  let sent = "";
  const res = {
    set: (k: string, v: string) => {
      headers[k] = v;
      return res;
    },
    send: (body: string) => {
      sent = body;
      return res;
    },
  };
  handler({ params: { themeId: "test", revision: "revision-1" } }, res, () =>
    assert.fail("unexpected fallthrough"),
  );
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(sent, "fresh stylesheet");
  handler({ params: { themeId: "test" } }, res, () => assert.fail("unexpected fallthrough"));
  assert.deepEqual(options, [{ cacheControl: false, etag: false, lastModified: false }, {}]);
});

// "Reload once per durable change" moved to `syncThemeRoster`'s own suite
// (`features/theme/__tests__/theme-roster-sync.test.ts`): the middleware now only decides WHEN to
// sync (every non-asset request), and the roster sync decides WHETHER anything changed.

test("authenticated preview CSS versions absolute local fonts, images and imports only", async (t) => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { registerThemeStaticAssets } = await import("../theme-static-assets.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-css-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "test", "css"), { recursive: true });
  const css = '@font-face{src:url("/theme-assets/test/fonts/a.woff2?v=2#x")} .hero{background:url(/theme-assets/test/a.png)} @import "/theme-assets/test/css/import.css"; .relative{background:url(../a.png)} .external{background:url(https://cdn.test/theme-assets/test/a.png)}';
  fs.writeFileSync(path.join(root, "test", "css", "main.css"), css);
  let staticHandler: Function = () => {};
  const authenticated = new Set<string>();
  registerThemeStaticAssets({ use: (_route: unknown, _security: unknown, handler: Function) => { staticHandler = handler; } } as never, {
    themeRoots: [root], serveStatic: () => (_req, res) => res.send(css),
    isAuthenticatedPreviewRevision: ({ revision }) => authenticated.has(revision),
  });
  const previewHandler = createThemePreviewMiddleware({
    authenticate: (req, _res, next) => { assert.equal(req.path, "/about", "anonymous subresource requests must remain public"); next(); },
    syncThemes: () => {}, rememberRevision: ({ revision }) => { authenticated.add(revision); },
  });
  const headers: Record<string, string> = {};
  let sent = "";
  const res = { locals: {}, set: (k: string, v: string) => { headers[k] = v; return res; }, type: () => res, send: (body: string) => { sent = body; return res; } };
  const req = { query: {}, path: "/theme-preview-assets/rev-1/test/css/main.css", url: "/css/main.css", params: { revision: "rev-1", themeId: "test" }, method: "GET" };
  staticHandler(req, res, () => assert.fail("CSS missing"));
  assert.equal(sent, css, "unrecognized preview namespace must not change CSS bytes");
  const htmlRes = { locals: {}, set: () => htmlRes, send: () => htmlRes };
  previewHandler({ query: { __tovu_preview: "rev-1" }, path: "/about" } as never, htmlRes as never, () => {});
  previewHandler(req as never, res as never, () => staticHandler(req, res, () => assert.fail("CSS missing")));
  assert.equal(sent, css.replaceAll('"/theme-assets/', '"/theme-preview-assets/rev-1/').replaceAll('url(/theme-assets/', 'url(/theme-preview-assets/rev-1/'));
  assert.equal(headers["Cache-Control"], "no-store");
  const publicRes = { ...res, locals: {}, send: (body: string) => { sent = body; return publicRes; } };
  staticHandler({ ...req, params: { themeId: "test" } }, publicRes, () => assert.fail("public CSS missing"));
  assert.equal(sent, css);
});

/** A minimal valid declarative theme folder (same fixture shape as `theme-trash.test.ts`). */
function writeDeclarativeTheme(fs: typeof import("node:fs"), dir: string, id: string): void {
  fs.mkdirSync(`${dir}/templates`, { recursive: true });
  fs.writeFileSync(`${dir}/theme.json`, JSON.stringify({ id, name: id, version: "1.0.0", tier: "declarative", engine: 1 }));
  fs.writeFileSync(`${dir}/tokens.json`, '{"--ink":"#000"}');
  fs.writeFileSync(`${dir}/styles.css`, "body{margin:0}");
  fs.writeFileSync(`${dir}/templates/home.json`, '{"type":"doc","content":[]}');
  fs.writeFileSync(`${dir}/templates/entry.json`, '{"type":"doc","content":[]}');
}

/** The web server's registered middleware over a real themes folder, driven like Express would. */
async function bootServerRoster(t: import("node:test").TestContext) {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { discoverAllBuiltInThemes } = await import("#src/features/theme/index");
  const { registerThemePreviewRefresh } = await import("../theme-preview-refresh.js");
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-roster-sync-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  writeDeclarativeTheme(fs, path.join(themesDir, "static", "tovu-starter"), "tovu-starter");
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" });
  let middleware: Function = () => assert.fail("middleware not registered");
  const app = { use: (handler: Function) => { middleware = handler; }, post: () => {} };
  registerThemePreviewRefresh({ app: app as never, deps: { themes, themesDir, workspaceId: "ws", authorize: async () => ({ allowed: true }) } as never });
  const request = (requestPath: string, method = "GET") =>
    new Promise<void>((resolve, reject) =>
      middleware({ query: {}, path: requestPath, method }, { locals: {} }, (error?: unknown) => (error ? reject(error) : resolve())),
    );
  return { fs, path, themesDir, themes, request };
}

test("cross-process: a theme another process created resolves on the server's next public request (no fallback)", async (t) => {
  const { resolveActiveTheme, requestThemePreviewRefresh } = await import("#src/features/theme/index");
  const { fs, path, themesDir, themes, request } = await bootServerRoster(t);
  await request("/");

  // The agent daemon's `theme_duplicate`: a new folder on disk plus the marker bump — nothing in
  // THIS process's roster is touched.
  writeDeclarativeTheme(fs, path.join(themesDir, "static", "editorial-rose"), "editorial-rose");
  requestThemePreviewRefresh({ themesDir });

  const warnings: string[] = [];
  t.mock.method(console, "warn", (message: string) => { warnings.push(message); });
  await request("/");
  const resolved = resolveActiveTheme({ themes }, "editorial-rose");
  assert.notEqual(resolved, null);
  assert.equal(typeof resolved === "object" && resolved?.manifest.id, "editorial-rose");
  assert.deepEqual(warnings, [], "the active theme must resolve without a fallback warning");
});

test("cross-process: the admin Themes API sees a new theme without a manual rescan", async (t) => {
  const { validThemeIds } = await import("#src/features/theme/index");
  const { fs, path, themesDir, themes, request } = await bootServerRoster(t);
  await request("/api/admin/v1/workspaces/ws/presentation");

  // An out-of-band folder (a CLI or a copy by hand): no marker bump at all.
  writeDeclarativeTheme(fs, path.join(themesDir, "static", "editorial-rose"), "editorial-rose");

  await request("/api/admin/v1/workspaces/ws/presentation");
  assert.deepEqual(validThemeIds(themes).sort(), ["editorial-rose", "tovu-starter"]);
});

test("cross-process: a theme another process trashed drops out of the server's roster", async (t) => {
  const { requestThemePreviewRefresh } = await import("#src/features/theme/index");
  const { fs, path, themesDir, themes, request } = await bootServerRoster(t);
  await request("/");
  writeDeclarativeTheme(fs, path.join(themesDir, "static", "editorial-rose"), "editorial-rose");
  await request("/");
  assert.ok(themes.some((theme) => theme.manifest.id === "editorial-rose"));

  fs.rmSync(path.join(themesDir, "static", "editorial-rose"), { recursive: true });
  requestThemePreviewRefresh({ themesDir });
  await request("/admin/themes");
  assert.deepEqual(themes.map((theme) => theme.manifest.id), ["tovu-starter"]);
});

test("theme asset requests never touch the roster", async (t) => {
  const { requestThemePreviewRefresh } = await import("#src/features/theme/index");
  const { fs, path, themesDir, themes, request } = await bootServerRoster(t);
  await request("/");
  writeDeclarativeTheme(fs, path.join(themesDir, "static", "editorial-rose"), "editorial-rose");
  requestThemePreviewRefresh({ themesDir });
  await request("/theme-assets/editorial-rose/styles.css");
  assert.deepEqual(themes.map((theme) => theme.manifest.id), ["tovu-starter"]);
});
