import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminPresentationGetRoute } from "../get.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file Unit-tier branch coverage for `GET .../presentation` (`registerAdminPresentationGetRoute`).
 * Same bare-app + stubbed-principal + real-in-memory-repo pattern as
 * `admin/seo/__tests__/put-entry.test.ts` — the happy path (an existing workspace, a real seeded
 * active theme) is already exercised end-to-end by `packet-one-routes.test.ts` and
 * `SPEC-006 REQ-05`'s own presentation test; this file targets exactly the branches those leave
 * uncovered: the workspace-mismatch 404, both catch-block outcomes, and the "active theme id no
 * longer among the discovered themes" fallback.
 */

const WORKSPACE_ID = "workspace-local";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/presentation`;

function buildApp(depsOverrides: Partial<ContentRouteDeps> = {}): express.Express {
  const base = createRouteDeps();
  const deps: ContentRouteDeps = {
    ...base,
    tracker: createNoopTracker({}),
    userRepo: base.userRepo,
    workspaceId: base.workspaceId,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: base.clock,
    idGen: base.idGen,
    postRepo: base.postRepo,
    pluginBeforeSaveHook: base.pluginBeforeSaveHook,
    pagesHtmlStore: base.pagesHtmlStore,
    changeSets: base.changeSets,
    outbox: base.outbox,
    bus: base.bus,
    revertRegistry: base.revertRegistry,
    presentationRepo: base.presentationRepo,
    themes: base.themes,
    themesDir: base.themesDir,
    entryRepo: base.entryRepo,
    mediaRepo: base.mediaRepo,
    transformDefinitionRepo: base.transformDefinitionRepo,
    menuRepo: base.menuRepo,
    removePost: base.removePost,
    forgetRemovedPost: base.forgetRemovedPost,
    packageThemesDir: base.packageThemesDir,
    mediaContentTypeStore: base.mediaContentTypeStore,
    contentTypeRepo: base.contentTypeRepo,
    widgetBindingRepo: base.widgetBindingRepo,
    settingsRepo: base.settingsRepo,
    siteTitlePreservationStore: base.siteTitlePreservationStore,
    workspaceRepo: base.workspaceRepo,
    siteDisplayName: base.siteDisplayName,
    slugChangeCapture: base.slugChangeCapture,
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminPresentationGetRoute(app, deps);
  return app;
}

async function get(t: import("node:test").TestContext, app: express.Express, path = PATH) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("presentation get: mismatched workspaceId 404s", async (t) => {
  const app = buildApp();
  const { status, json } = await get(t, app, "/api/admin/v1/workspaces/not-real/presentation");
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "workspace was not found" });
});

test("presentation get: no presentation_settings row for the workspace surfaces PresentationSettingsNotFoundError as a 404", async (t) => {
  const app = buildApp({ presentationRepo: new InMemoryPresentationSettingsRepo({}, { initialRows: [] }) });
  const { status, json } = await get(t, app);
  assert.equal(status, 404);
  assert.deepEqual(json, {
    error: `presentation settings for workspace '${WORKSPACE_ID}' were not found`,
  });
});

test("presentation get: an active theme id no longer among the discovered themes still 200s, with empty template/page lists", async (t) => {
  const app = buildApp({
    presentationRepo: new InMemoryPresentationSettingsRepo({}, { initialRows: [
      { workspaceId: WORKSPACE_ID, activeThemeId: "totally-not-a-real-theme", updatedAt: "2026-08-20T00:00:00.000Z" },
    ] }),
  });
  const { status, json } = await get(t, app);
  assert.equal(status, 200, JSON.stringify(json));
  const body = json as {
    settings: { activeThemeId: string };
    activeThemeTemplates: string[];
    activeThemeStaticPageIds: string[];
  };
  assert.equal(body.settings.activeThemeId, "totally-not-a-real-theme");
  assert.deepEqual(body.activeThemeTemplates, []);
  assert.deepEqual(body.activeThemeStaticPageIds, []);
});

test("presentation get: an unexpected repo failure 500s", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    presentationRepo: {
      ...base.presentationRepo,
      findByWorkspaceId: async () => {
        throw new Error("boom");
      },
    },
  });
  const { status, json } = await get(t, app);
  assert.equal(status, 500);
  assert.deepEqual(json, { error: "internal error" });
});

test("presentation get: workspaceId param can never actually be undefined through this app's real composition (a matched `:param` segment is always a populated string) -- its `?? \"\"` fallback is reached by calling the real handler directly, the same type-bypass technique put-entry.test.ts's own equivalent test uses", async (t) => {
  const app = buildApp();
  const handler = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/presentation");

  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: undefined } } as unknown as Parameters<typeof handler>[0];
  await handler(req, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("presentation get: a stored retired theme id (`basic`, renamed `tovu-theme`) reports the renamed theme as active", async (t) => {
  const base = createRouteDeps();
  const fixture = base.themes.find((theme) => theme.manifest.id === "tovu-theme");
  assert.ok(fixture);
  const app = buildApp({
    themes: [{ ...fixture, manifest: { ...fixture.manifest, templates: ["article.html", "landing.html"] }, pages: { home: "Home fixture", about: "About fixture" } }],
    presentationRepo: new InMemoryPresentationSettingsRepo({}, { initialRows: [
      { workspaceId: WORKSPACE_ID, activeThemeId: "basic", updatedAt: "2026-09-26T00:00:00.000Z" },
    ] }),
  });
  const { status, json } = await get(t, app);
  assert.equal(status, 200, JSON.stringify(json));
  const body = json as { settings: { activeThemeId: string }; activeThemeTemplates: string[]; activeThemeStaticPageIds: string[] };
  assert.equal(body.settings.activeThemeId, "tovu-theme");
  assert.deepEqual(body.activeThemeTemplates, ["article.html", "landing.html"]);
  assert.deepEqual(body.activeThemeStaticPageIds, ["home", "about"]);
});

test("presentation get: every available theme carries its theme.json display name", async (t) => {
  const app = buildApp();
  const { status, json } = await get(t, app);
  assert.equal(status, 200, JSON.stringify(json));
  const body = json as { availableThemes: Array<{ id: string; name: string }> };
  const tovu = body.availableThemes.find((theme) => theme.id === "tovu-theme");
  assert.equal(tovu?.name, "Tovu Theme");
});

test("D-22: presentation advertises the actual PNG and null for an absent preview", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "tovu-preview-response-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = createRouteDeps().themes.find((theme) => theme.manifest.id === "tovu-starter");
  assert.ok(fixture);
  const pngDir = join(root, "png");
  mkdirSync(join(pngDir, "screenshots"), { recursive: true });
  writeFileSync(join(pngDir, "screenshots", "index.png"), "fixture");
  const app = buildApp({ themes: [
    { ...fixture, dir: pngDir },
    { ...fixture, dir: join(root, "absent"), manifest: { ...fixture.manifest, id: "no-preview" } },
  ] });
  const { status, json } = await get(t, app);
  assert.equal(status, 200);
  const body = json as { availableThemes: Array<{ id: string; previewImageUrl: string | null }> };
  assert.equal(body.availableThemes.find((theme) => theme.id === "tovu-starter")?.previewImageUrl, "/theme-assets/tovu-starter/screenshots/index.png");
  assert.equal(body.availableThemes.find((theme) => theme.id === "no-preview")?.previewImageUrl, null);
});


test("presentation get: kind filters templates without changing catalog order or shared defaults", async (t) => {
  const fixture = createRouteDeps().themes.find((theme) => theme.manifest.id === "tovu-starter");
  assert.ok(fixture);
  const app = buildApp({
    themes: [{ ...fixture, manifest: { ...fixture.manifest,
      templates: ["page.html", "shared.html", "post.html"],
      templateFor: { "page.html": ["page"], "post.html": ["post"] },
    } }],
    presentationRepo: new InMemoryPresentationSettingsRepo({}, { initialRows: [
      { workspaceId: WORKSPACE_ID, activeThemeId: "tovu-starter", updatedAt: "2026-10-10T00:00:00.000Z" },
    ] }),
  });
  for (const [query, expected] of [
    ["?kind=post", ["shared.html", "post.html"]],
    ["?kind=page", ["page.html", "shared.html"]],
    ["", ["page.html", "shared.html", "post.html"]],
  ] as const) {
    const { status, json } = await get(t, app, `${PATH}${query}`);
    assert.equal(status, 200);
    assert.deepEqual((json as { activeThemeTemplates: string[] }).activeThemeTemplates, expected);
  }
});

test("presentation get: invalid content kind is rejected", async (t) => {
  const { status } = await get(t, buildApp(), `${PATH}?kind=product`);
  assert.equal(status, 400);
});

test("presentation get: builtIn is true only for a theme the package's originals catalog ships", async (t) => {
  const packageRoot = mkdtempSync(join(tmpdir(), "tovu-builtin-themes-"));
  t.after(() => rmSync(packageRoot, { recursive: true, force: true }));
  const fixture = createRouteDeps().themes.find((theme) => theme.manifest.id === "tovu-starter");
  assert.ok(fixture);
  mkdirSync(join(packageRoot, "__original-themes__", fixture.manifest.tier, "tovu-starter"), { recursive: true });
  const app = buildApp({
    packageThemesDir: packageRoot,
    themes: [fixture, { ...fixture, manifest: { ...fixture.manifest, id: "plannie-copy" } }],
  });
  const { status, json } = await get(t, app);
  assert.equal(status, 200);
  const body = json as { availableThemes: Array<{ id: string; builtIn: boolean }> };
  assert.equal(body.availableThemes.find((theme) => theme.id === "tovu-starter")?.builtIn, true);
  assert.equal(body.availableThemes.find((theme) => theme.id === "plannie-copy")?.builtIn, false);
});

test("presentation get: builtIn is false everywhere when no package themes root is configured", async (t) => {
  const { status, json } = await get(t, buildApp({ packageThemesDir: undefined }));
  assert.equal(status, 200);
  const body = json as { availableThemes: Array<{ builtIn: boolean }> };
  assert.ok(body.availableThemes.length > 0);
  assert.ok(body.availableThemes.every((theme) => theme.builtIn === false));
});

test("presentation get: active-theme response uses current metadata and preserves stored settings", async (t) => {
  const fixture = createRouteDeps().themes.find((theme) => theme.manifest.id === "tovu-theme");
  assert.ok(fixture);
  const theme = {
    ...fixture,
    manifest: { ...fixture.manifest, templates: ["page.html", "shared.html", "post.html"],
      templateFor: { "page.html": ["page"], "post.html": ["post"] } as const },
    pages: { home: "Home", about: "About" },
  };
  for (const storedId of ["tovu-theme", "basic", "missing-theme"]) {
    for (const [query, templates] of [
      ["", ["page.html", "shared.html", "post.html"]],
      ["?kind=post", ["shared.html", "post.html"]],
      ["?kind=page", ["page.html", "shared.html"]],
    ] as const) {
      await t.test(`${storedId}${query}`, async (t) => {
        const stored = { workspaceId: WORKSPACE_ID, activeThemeId: storedId, updatedAt: "2026-10-10T00:00:00.000Z" };
        const repo = new InMemoryPresentationSettingsRepo({}, { initialRows: [stored] });
        const { status, json } = await get(t, buildApp({ themes: [theme], presentationRepo: repo }), `${PATH}${query}`);
        assert.equal(status, 200);
        const body = json as {
          settings: typeof stored; activeThemeTemplates: string[]; activeThemeStaticPageIds: string[];
        };
        const found = storedId !== "missing-theme";
        assert.deepEqual(body.settings, { ...stored, activeThemeId: found ? "tovu-theme" : storedId });
        assert.deepEqual(body.activeThemeTemplates, found ? templates : []);
        assert.deepEqual(body.activeThemeStaticPageIds, found ? ["home", "about"] : []);
        assert.deepEqual(await repo.findByWorkspaceId({ workspaceId: WORKSPACE_ID }), stored);
      });
    }
  }
});
