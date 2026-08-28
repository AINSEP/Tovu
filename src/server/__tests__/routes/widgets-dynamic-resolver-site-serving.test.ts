import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { DiscoveredTheme } from "#src/features/theme/index";
import { createMenu } from "#src/features/navigation/index";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { createWidgetsModule } from "../../runtime/composition/modules/widgets.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerSiteRoutes } from "../../routes/site/pages.js";
import type { RouteDeps } from "../../routes/types.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";

/**
 * @file Fable adversarial-review fix (2026-07-21, Finding A): no test anywhere exercised a dynamic,
 * resolver-backed widget type (`menu`/`recent-entries`/`contact-form`) through the real HTTP path —
 * every existing test either substituted a test-double resolver (`resolver-service.integration.test.ts`)
 * or only ever placed the static `text` type (`widgets-site-serving.test.ts`'s W-004 suite). That gap
 * is exactly why a real bug — `wireCoreResolvers` never being called by any composition root — went
 * unnoticed: `CORE_RESOLVERS` was empty in production, so `menu`/`recent-entries`/`contact-form`
 * silently rendered as an empty placeholder on every real page. This proves the fix: a real menu
 * entry, resolved through the real `NavMenuReadModel` adapter, rendered as real HTML.
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

test("Finding A: a `menu` widget renders real resolved menu content on a real GET / request, proving wireCoreResolvers is actually wired", async (t) => {
  const { app, deps } = buildTestApp(fakeThemeWithRegions(["footer"]));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const { menu } = await createMenu({
    deps: { repo: deps.menuRepo, clock: deps.clock, idGen: deps.idGen, outbox: deps.outbox },
    input: {
      workspaceId: WORKSPACE_ID,
      title: "My Footer Menu",
      slug: "footer-menu",
      items: [{ id: "item-1", label: "Home", target: { kind: "url", href: "/" } }],
    },
  });

  const createRes = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "menu", title: "Footer menu widget", config: { menuRef: menu.id } }),
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

  assert.match(html, /widget-menu-title">My Footer Menu</);
  assert.match(html, /<a href="\/">Home<\/a>/);
  assert.doesNotMatch(html, /widget-placeholder/);
});
