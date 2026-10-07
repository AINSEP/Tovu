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
    refreshThemes: () => order.push("refresh"),
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

test("normal visitor does not authenticate, reload themes, rewrite assets, or change caching", async () => {
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
    authenticate: () => assert.fail("public auth"),
    refreshThemes: () => assert.fail("public reload"),
  });
  handler({ query: {} } as never, res as never, () => {
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.send("/theme-assets/test/css/theme.css");
  });
  assert.equal(sent, "/theme-assets/test/css/theme.css");
  assert.equal(headers["Cache-Control"], "public, max-age=60, stale-while-revalidate=300");
});

test("denied preview never refreshes themes or renders", () => {
  const handler = createThemePreviewMiddleware({
    authenticate: () => {},
    refreshThemes: () => assert.fail("unauthenticated reload"),
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
