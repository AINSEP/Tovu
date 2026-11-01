import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { loadTheme } from "#src/features/theme/index";
import { dispatchHttpRequest, dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { registerThemeStaticAssets } from "#src/server/inbound/public-http/middleware/theme-static-assets";
import { registerAdminThemeDetailRoute, registerAdminThemeFileGetRoute, registerAdminThemeFilePutRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

// Class guard: effective templates must be inspectable through both source-view entry points,
// for either supported layout, without publishing unrelated package files or writing stock bytes.
for (const apiVersion of [undefined, 2] as const) {
  test(`View Template and Explore resolve inherited source read-only (layout ${apiVersion ?? 1})`, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "inherited-template-source-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const themesDir = path.join(root, "site");
    const site = path.join(themesDir, "static/future");
    const stock = path.join(root, "package/__original-themes__/static/future");
    const pagesDir = apiVersion === 2 ? "render/pages" : "pages";
    const html = `<html><body><main data-embed-config='{"type":"content"}'></main></body></html>`;
    const inheritedPath = `${pagesDir}/future-layout.html`;
    for (const dir of [site, stock]) {
      fs.mkdirSync(path.join(dir, pagesDir), { recursive: true });
      fs.writeFileSync(path.join(dir, "tokens.json"), "{}");
      fs.writeFileSync(path.join(dir, `${pagesDir}/index.html`), html);
      fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "future", tier: "static", apiVersion,
        templates: dir === stock ? ["future-layout.html"] : [] }));
    }
    fs.writeFileSync(path.join(stock, inheritedPath), html + "bundled template");
    fs.writeFileSync(path.join(stock, `${pagesDir}/unlisted.html`), html + "not a template");
    const themes = [loadTheme({ themeDir: site, id: "future", source: "site" }, { packageThemesDir: path.join(root, "package") })];
    assert.equal(themes[0].status, "valid", themes[0].errors.join("; "));
    assert.match(themes[0].pages["future-layout"], /bundled template/);
    const app = express();
    app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
    const deps = { workspaceId: "ws", themesDir, themes, authorize: async () => ({ allowed: true }),
      postRepo: { list: async () => [] } } as unknown as ContentRouteDeps;
    registerThemeStaticAssets(app, { themeRoots: [path.join(themesDir, "static")], themes });
    registerAdminThemeDetailRoute(app, deps);
    registerAdminThemeFileGetRoute(app, deps);
    registerAdminThemeFilePutRoute(app, deps);
    const base = "/api/admin/v1/workspaces/ws/themes/future";
    const assetUrl = `/theme-assets/future/${inheritedPath}`;
    for (const prefix of ["/theme-assets/future", "/theme-preview-assets/rev/future"]) {
      const source = await dispatchHttpRequest({ app, method: "GET", url: `${prefix}/${inheritedPath}` });
      assert.equal(source.status, 200, "View Template must show the effective template, even without a site file");
      assert.equal(source.body, html + "bundled template");
      assert.match(String(source.headers["content-security-policy"]), /sandbox/);
      assert.equal(source.headers["x-content-type-options"], "nosniff");
      const head = await dispatchHttpRequest({ app, method: "HEAD", url: `${prefix}/${inheritedPath}` });
      assert.equal(head.status, 200);
      assert.equal(head.body, "");
    }
    const detail = await dispatchJsonRequest(app, "GET", base);
    const entry = (detail.body as { files: Array<Record<string, unknown>> }).files.find(f => f.path === inheritedPath);
    assert.deepEqual(entry, { path: inheritedPath, group: "page", readable: true, editable: false,
      resettable: false, modified: null, published: null, collidingContent: null, inherited: true });
    const source = await dispatchJsonRequest(app, "GET", `${base}/file?path=${encodeURIComponent(inheritedPath)}`);
    assert.equal(source.status, 200);
    assert.equal((source.body as { content: string }).content, html + "bundled template");
    const write = await dispatchJsonRequest(app, "PUT", `${base}/file`, { path: inheritedPath, content: "changed" });
    assert.equal(write.status, 403);
    assert.equal(fs.existsSync(path.join(site, inheritedPath)), false);
    assert.equal(fs.readFileSync(path.join(stock, inheritedPath), "utf8"), html + "bundled template");
    for (const relative of [`${pagesDir}/unlisted.html`, "__proto__", "constructor"]) {
      const response = await dispatchHttpRequest({ app, method: "GET", url: `/theme-assets/future/${relative}` });
      assert.equal(response.status, 404, "inheritance must expose only the loader's own declared templates");
    }
    for (const relative of ["theme.json/../future-layout.html", `${pagesDir}/%2e%2e/theme.json`, `${pagesDir}/%ZZ.html`]) {
      const response = await dispatchHttpRequest({ app, method: "GET", url: `/theme-assets/future/${relative}` });
      assert.notEqual(response.body, html + "bundled template", relative);
    }
    // A local override, after the normal loader refresh, wins in both rendering and source views.
    fs.writeFileSync(path.join(site, inheritedPath), html + "local override");
    themes[0] = loadTheme({ themeDir: site, id: "future", source: "site" }, { packageThemesDir: path.join(root, "package") });
    assert.match(themes[0].pages["future-layout"], /local override/);
    const local = await dispatchHttpRequest({ app, method: "GET", url: assetUrl });
    assert.equal(local.body, html + "local override");
    const localSource = await dispatchJsonRequest(app, "GET", `${base}/file?path=${encodeURIComponent(inheritedPath)}`);
    assert.equal((localSource.body as { content: string }).content, html + "local override");
  });
}
