import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { DiscoveredTheme } from "#src/features/theme/index";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { createWidgetsModule } from "../../runtime/composition/modules/widgets.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerSiteRoutes } from "../../routes/site/pages.js";
import type { RouteDeps } from "../../routes/types.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";

/**
 * @file W-004 end-to-end: a widget bound into a theme-declared region actually renders on a real
 * GET request to the live site, through the real HTTP boundary — not just resolvable in-domain.
 * Mirrors `redirects-site-serving.test.ts`'s own framing ("the single most important test in this
 * feature"): proves `ThemeManifest.regions` -> `resolvePageWidgets` -> `renderSite` -> HTML is
 * actually wired, not merely unit-tested in isolation at each layer.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}`;

function fakeThemeWithRegions(regions: string[]): DiscoveredTheme {
  return {
    manifest: { id: "tovu-official", name: "Widgets Test Theme", version: "1.0.0", tier: "declarative", engine: 1, regions },
    tokens: {},
    templates: {
      home: { type: "doc", content: [{ type: "region", key: "footer" }] },
      entry: { type: "doc", content: [{ type: "slot", name: "content" }] },
    },
    liquidTemplates: {},
    handlebarsTemplates: {},
    dir: "/nonexistent/test-theme",
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  };
}

function buildTestApp(theme: DiscoveredTheme): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  deps.themes = [theme];
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createWidgetsModule(deps).registerRoutes(app);
  registerSiteRoutes(app, deps);
  return { app, deps };
}

test("W-004: a widget bound into a theme-declared region renders on a real GET / request", async (t) => {
  const { app } = buildTestApp(fakeThemeWithRegions(["footer"]));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Footer note", config: { body: "Rendered via W-004" } }),
  });
  assert.equal(createRes.status, 201);
  const { widget } = (await createRes.json()) as { widget: { id: string } };

  const bindRes = await fetch(`${baseUrl}${BASE}/widgets/regions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ regionKey: "footer" }),
  });
  const { area } = (await bindRes.json()) as { area: { version: number } };

  const mutateRes = await fetch(`${baseUrl}${BASE}/widgets/regions/footer`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: area.version, placements: [{ placementId: "p1", widgetEntryId: widget.id, enabled: true }] }),
  });
  assert.equal(mutateRes.status, 200);

  const siteRes = await fetch(`${baseUrl}/`);
  assert.equal(siteRes.status, 200);
  const html = await siteRes.text();
  assert.match(html, /widget-region--footer/);
  assert.match(html, /Rendered via W-004/);
});

test("W-004: a theme with NO declared regions renders the home page with no widget-region markup at all (back-compat — every theme without `regions` in theme.json today)", async (t) => {
  const { app } = buildTestApp(fakeThemeWithRegions([]));
  const { baseUrl } = await bootAuthenticated(app, t);

  const siteRes = await fetch(`${baseUrl}/`);
  assert.equal(siteRes.status, 200);
  const html = await siteRes.text();
  assert.doesNotMatch(html, /widget-region/);
});

test("W-004: a disabled placement (enabled:false) does not render publicly, even though it's still in the region's placement list", async (t) => {
  const { app } = buildTestApp(fakeThemeWithRegions(["footer"]));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Footer note", config: { body: "Should not be visible" } }),
  });
  const { widget } = (await createRes.json()) as { widget: { id: string } };

  const bindRes = await fetch(`${baseUrl}${BASE}/widgets/regions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ regionKey: "footer" }),
  });
  const { area } = (await bindRes.json()) as { area: { version: number } };

  await fetch(`${baseUrl}${BASE}/widgets/regions/footer`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: area.version, placements: [{ placementId: "p1", widgetEntryId: widget.id, enabled: false }] }),
  });

  const siteRes = await fetch(`${baseUrl}/`);
  const html = await siteRes.text();
  assert.doesNotMatch(html, /Should not be visible/);
  assert.doesNotMatch(html, /widget-region--footer/);
});
