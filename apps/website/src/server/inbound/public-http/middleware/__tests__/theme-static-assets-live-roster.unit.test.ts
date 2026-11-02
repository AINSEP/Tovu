import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { dispatchHttpRequest } from "#src/server/__tests__/helpers/in-process-http";
import { loadTheme, type DiscoveredTheme } from "#src/features/theme/index";

test("View Template reads the replacement theme roster after a refresh without restarting the app", async t => {
  const themesDir = mkdtempSync(path.join(tmpdir(), "live-theme-roster-"));
  t.after(() => rmSync(themesDir, { recursive: true, force: true }));
  const dir = path.join(themesDir, "static/live");
  mkdirSync(path.join(dir, "pages"), { recursive: true });
  writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "live", name: "Live", version: "1.0.0", tier: "static" }));
  writeFileSync(path.join(dir, "tokens.json"), "{}");
  writeFileSync(path.join(dir, "pages/index.html"), '<main data-embed-config=\'{"type":"content"}\'></main>');
  const loaded = loadTheme({ themeDir: dir, id: "live", source: "site" });
  const theme = (body: string): DiscoveredTheme => ({ ...loaded, inheritedTemplateSources: { "pages/blank.html": body } });
  const deps = createRouteDeps();
  deps.themesDir = themesDir;
  deps.themes = [theme("before refresh")];
  const work: Promise<void>[] = [];
  const app = createApp(deps, { onBootWork: promise => work.push(promise) });
  t.after(async () => { await Promise.allSettled(work); });
  for (const prefix of ["/theme-assets/live", "/theme-preview-assets/rev/live"]) {
    const response = await dispatchHttpRequest({ app, method: "GET", url: `${prefix}/pages/blank.html` });
    assert.equal(response.body, "before refresh");
  }
  deps.themes = [theme("after refresh")];
  for (const prefix of ["/theme-assets/live", "/theme-preview-assets/rev/live"]) {
    const response = await dispatchHttpRequest({ app, method: "GET", url: `${prefix}/pages/blank.html` });
    assert.equal(response.status, 200);
    assert.equal(response.body, "after refresh", "a replaced roster must replace inherited template bytes too");
  }
  deps.themes = [];
  const removed = await dispatchHttpRequest({ app, method: "GET", url: "/theme-assets/live/pages/blank.html" });
  assert.equal(removed.status, 404, "withdrawn inherited templates must stop being served");
});
