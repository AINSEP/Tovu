import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes, isStandaloneThemePage } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemePagePublishRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file `registerAdminThemePagePublishRoute` (2026-08-30, off-by-default retroactively since the same
 * day) — the real replacement for the `_unpublished/` folder convention an agent invented ad hoc
 * because no publish control existed.
 *
 * The one test every other test here exists in service of: `THE CRITICAL GUARANTEE` below proves the
 * very first toggle on a theme that has never recorded a decision publishes ONLY the toggled page —
 * it does not resurrect any other page, because nothing else was live to begin with.
 */

const WORKSPACE_ID = "ws-page-publish";

function makeThemeDir(manifestExtra: Record<string, unknown> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-page-publish-"));
  const dir = path.join(root, "static", "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>home</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "pages", "404.html"), "<html><body>missing</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "pages", "about.html"), "<html><body>about</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "pages", "pricing.html"), "<html><body>pricing</body></html>", "utf8");
  fs.writeFileSync(
    path.join(dir, "pages", "page-shell.html"),
    '<div data-embed-config=\'{"type":"content"}\'></div>',
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({
      id: "plain",
      name: "Plain",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: ["page-shell.html"],
      ...manifestExtra,
    }),
    "utf8"
  );
  return root;
}

function buildTestApp(themesDir: string): { app: express.Express; deps: ContentRouteDeps } {
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
  } as unknown as ContentRouteDeps;
  const app = express();
  app.use(express.json());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminThemePagePublishRoute(app, deps);
  return { app, deps };
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

async function toggle(baseUrl: string, themeId: string, page: string, published: boolean) {
  return fetch(`${baseUrl}${BASE(themeId)}/page/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page, published }),
  });
}

function readManifest(themesDir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(themesDir, "static", "plain", "theme.json"), "utf8"));
}

test("THE CRITICAL GUARANTEE: a theme's first-ever toggle publishes ONLY the toggled page — nothing else is resurrected", async (t) => {
  const themesDir = makeThemeDir();
  const { app, deps } = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const themeBefore = deps.themes.find((th) => th.manifest.id === "plain")!;
  assert.equal(themeBefore.manifest.publishedPages, undefined, "no recorded decision yet");
  // Off by default: nothing is live yet, even though these pages exist as candidates.
  assert.equal(isStandaloneThemePage(themeBefore, "about"), false);
  assert.equal(isStandaloneThemePage(themeBefore, "pricing"), false);

  const res = await toggle(baseUrl, "plain", "pricing", true);
  const body = (await res.json()) as { page: string; published: boolean; publishedPages: string[] };
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.published, true);
  // No backfill: only the page actually toggled is recorded.
  assert.deepEqual(body.publishedPages, ["pricing"]);

  const themeAfter = deps.themes.find((th) => th.manifest.id === "plain")!;
  assert.equal(isStandaloneThemePage(themeAfter, "pricing"), true, "the toggled page is now on");
  assert.equal(isStandaloneThemePage(themeAfter, "about"), false, "an untouched page stays off — no resurrection");
  // index/404/the template shell were never live pages and stay that way regardless.
  assert.equal(isStandaloneThemePage(themeAfter, "index"), false);
  assert.equal(isStandaloneThemePage(themeAfter, "404"), false);
  assert.equal(isStandaloneThemePage(themeAfter, "page-shell"), false);
});

test("a second toggle on an already-opted-in theme is a plain add/remove, no re-backfill", async (t) => {
  const themesDir = makeThemeDir({ publishedPages: ["about", "pricing"] });
  const { app, deps } = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await toggle(baseUrl, "plain", "pricing", false);
  const body = (await res.json()) as { publishedPages: string[] };
  assert.equal(res.status, 200);
  assert.deepEqual(body.publishedPages, ["about"]);

  const theme = deps.themes.find((th) => th.manifest.id === "plain")!;
  assert.equal(isStandaloneThemePage(theme, "about"), true);
  assert.equal(isStandaloneThemePage(theme, "pricing"), false);
});

test("publishing a page that was off adds it back", async (t) => {
  const themesDir = makeThemeDir({ publishedPages: ["about"] });
  const { app, deps } = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await toggle(baseUrl, "plain", "pricing", true);
  const body = (await res.json()) as { publishedPages: string[] };
  assert.equal(res.status, 200);
  assert.deepEqual(body.publishedPages, ["about", "pricing"]);

  const theme = deps.themes.find((th) => th.manifest.id === "plain")!;
  assert.equal(isStandaloneThemePage(theme, "pricing"), true);
});

test("theme.json on disk actually gains publishedPages, every other field untouched", async (t) => {
  const themesDir = makeThemeDir({ description: "kept as-is" });
  const { app } = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  // Unpublishing "pricing" is a no-op on content (it was already off by default, no recorded
  // decision existed) — no backfill means the array starts empty, not seeded with "about".
  await toggle(baseUrl, "plain", "pricing", false);

  const raw = readManifest(themesDir);
  assert.deepEqual(raw.publishedPages, []);
  assert.equal(raw.description, "kept as-is");
  assert.equal(raw.id, "plain");
  assert.deepEqual(raw.templates, ["page-shell.html"]);
});

for (const nonPublishable of ["index", "404", "page-shell", "does-not-exist"]) {
  test(`toggling '${nonPublishable}' 404s PAGE_NOT_PUBLISHABLE`, async (t) => {
    const themesDir = makeThemeDir();
    const { app } = buildTestApp(themesDir);
    const baseUrl = await startTestServer(app, t);

    const res = await toggle(baseUrl, "plain", nonPublishable, false);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "PAGE_NOT_PUBLISHABLE");
  });
}

test("a non-static-tier theme 400s NOT_STATIC_TIER", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-page-publish-declarative-"));
  const dir = path.join(root, "declarative", "plain");
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "templates", "home.json"), JSON.stringify({ type: "doc" }), "utf8");
  fs.writeFileSync(path.join(dir, "templates", "entry.json"), JSON.stringify({ type: "doc" }), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "declarative", engine: 1 })
  );
  const { app } = buildTestApp(root);
  const baseUrl = await startTestServer(app, t);

  const res = await toggle(baseUrl, "plain", "about", false);
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "NOT_STATIC_TIER");
});

test("a non-boolean published field 400s INVALID_BODY", async (t) => {
  const themesDir = makeThemeDir();
  const { app } = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/page/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page: "about", published: "yes" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "INVALID_BODY");
});

test("an unknown theme id 404s the same way every other route on this resource does", async (t) => {
  const themesDir = makeThemeDir();
  const { app } = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await toggle(baseUrl, "nope", "about", false);
  assert.equal(res.status, 404);
});

test("a concurrent writer's fresh theme.json is never clobbered by this server's stale in-memory snapshot", async (t) => {
  // Reproduces the real failure: the agent daemon is a SEPARATE OS process. It writes theme.json
  // through its own `writeThemeFile` call and never touches THIS process's `deps.themes` array — so
  // this server's `theme.manifest.publishedPages` stays exactly what it was at last boot/reload, even
  // after the daemon's write lands on disk.
  const themesDir = makeThemeDir({ publishedPages: ["about", "pricing"] });
  const { app, deps } = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const themeBefore = deps.themes.find((th) => th.manifest.id === "plain")!;
  assert.deepEqual(themeBefore.manifest.publishedPages, ["about", "pricing"], "this process's stale snapshot");

  // The daemon (a different process, own in-memory state) unpublishes "about" by writing theme.json
  // directly — bypassing this server's `deps.themes` entirely, exactly as a second OS process would.
  const manifestPath = path.join(themesDir, "static", "plain", "theme.json");
  const daemonWrite = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  daemonWrite.publishedPages = ["pricing"];
  fs.writeFileSync(manifestPath, JSON.stringify(daemonWrite, null, 2), "utf8");

  // An operator now toggles "pricing" off through THIS (stale) server process.
  const res = await toggle(baseUrl, "plain", "pricing", false);
  const body = (await res.json()) as { publishedPages: string[] };
  assert.equal(res.status, 200, JSON.stringify(body));
  // Correct result: base was the daemon's fresh ["pricing"], minus "pricing" toggled off -> [].
  // A version derived from this process's stale in-memory ["about","pricing"] would wrongly
  // resurrect "about" — a page the daemon had just unpublished.
  assert.deepEqual(body.publishedPages, [], "the daemon's unpublish of 'about' must survive this toggle");

  const onDisk = readManifest(themesDir);
  assert.deepEqual(onDisk.publishedPages, [], "disk must not revert the daemon's concurrent edit");
});
