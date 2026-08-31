import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes, THEME_CATALOG_DIR } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import {
  registerAdminThemeDetailRoute,
  registerAdminThemeFileGetRoute,
  registerAdminThemeFilePutRoute,
  registerAdminThemeFileResetRoute,
} from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";
import { InMemoryPostRepo } from "#src/features/post/index";

/**
 * @file FIX VERIFICATION (2026-08-12 follow-up to the owner-reported `.liquid` preview bug): `.liquid`
 * moved from a client-side `readable` override (`use-theme-explore.hooks.ts`'s now-removed
 * `mapDetailFiles` patch) into the server's own `TEXT_READABLE_EXTENSIONS` (`explore.ts`), so the
 * theme-detail listing route is now the single source of truth every consumer agrees with — not just
 * `ThemeExplore.tsx`.
 *
 * This file exists because a READABILITY change to the same allowlist `isThemeFileWritable` also
 * reads from is exactly the kind of change this subsystem has gotten wrong before at a different
 * entry point (narrowed one side of a check, the other side still admitted it — see
 * `explore-svg-xss.test.ts`'s own header for that history). Team-lead's ask: don't accept "the
 * extension set is only read by `isTextReadable`, and `isThemeFileWritable`'s OTHER two conditions
 * (`CONTENT_EDIT_LOCKED_GROUPS`, renamed from `READ_ONLY_GROUPS` 2026-08-29, and `isGeneratedThemePath`)
 * still gate it" as a read of the code — hand-construct a
 * real PUT and a real reset against a `.liquid` path through the actual Express routes and observe
 * what happens. This is that empirical check, not a restatement of the reasoning.
 *
 * Uses a `templated`-tier fixture theme (mirroring `fashion-modern`/`storefront`'s real on-disk
 * shape: `templates/home.liquid` + `templates/entry.liquid`, no `pages/` directory at all) with a
 * catalog original present, so the reset path has something real to restore from rather than
 * short-circuiting on `NO_ORIGINAL` before reaching any writability question.
 */

const WORKSPACE_ID = "ws-liquid-readable";
const ORIGINAL_HOME = "Fashion Modern — home template (catalog original).";
const ORIGINAL_ENTRY = "Fashion Modern — entry template (catalog original).";

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-liquid-readable-"));
  const manifest = JSON.stringify({
    id: "fashion-fixture",
    name: "Fashion Fixture",
    version: "1.0.0",
    tier: "templated",
    engine: 1,
  });

  // Live copy — the theme Explore actually edits.
  const live = path.join(root, "templated", "fashion-fixture");
  fs.mkdirSync(path.join(live, "templates"), { recursive: true });
  fs.writeFileSync(path.join(live, "theme.json"), manifest, "utf8");
  fs.writeFileSync(path.join(live, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(live, "templates", "home.liquid"), ORIGINAL_HOME, "utf8");
  fs.writeFileSync(path.join(live, "templates", "entry.liquid"), ORIGINAL_ENTRY, "utf8");

  // Catalog original — same content, so the reset path (below) has a real byte-identical target.
  const catalog = path.join(root, THEME_CATALOG_DIR, "templated", "fashion-fixture");
  fs.mkdirSync(path.join(catalog, "templates"), { recursive: true });
  fs.writeFileSync(path.join(catalog, "theme.json"), manifest, "utf8");
  fs.writeFileSync(path.join(catalog, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(catalog, "templates", "home.liquid"), ORIGINAL_HOME, "utf8");
  fs.writeFileSync(path.join(catalog, "templates", "entry.liquid"), ORIGINAL_ENTRY, "utf8");

  return root;
}

function buildTestApp(themesDir: string): express.Express {
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
    // The detail route now does one `postRepo.list()` per request (slug-collision signal) — an
    // empty in-memory repo, matching this fixture's lack of any posts to collide with.
    postRepo: new InMemoryPostRepo(),
  } as unknown as ContentRouteDeps;

  const app = express();
  app.use(express.json());
  // Stand-in for `requireAdminSession`, same convention as this directory's sibling test files —
  // `getAuthedPrincipal` only ever reads `res.locals.principal`.
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminThemeDetailRoute(app, deps);
  registerAdminThemeFileGetRoute(app, deps);
  registerAdminThemeFilePutRoute(app, deps);
  registerAdminThemeFileResetRoute(app, deps);
  return app;
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

test("detail route now reports a .liquid template as readable — the server, not a client override, is the source of truth", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const detail = (await (await fetch(`${baseUrl}${BASE("fashion-fixture")}`)).json()) as {
    files: { path: string; group: string; readable: boolean; editable: boolean }[];
  };
  const home = detail.files.find((f) => f.path === "templates/home.liquid");
  assert.ok(home, "templates/home.liquid must appear in the listing");
  assert.equal(home!.group, "other", "fileGroup has no templates/ case, so this stays 'other' — unchanged by this fix");
  assert.equal(home!.readable, true, "readable must now come from the server, not a client-side override");
  assert.equal(home!.editable, false, "readability changed; writability must not have");
});

test("GET file returns the .liquid template's real source, matching what the listing now advertises as readable", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(
    `${baseUrl}${BASE("fashion-fixture")}/file?path=${encodeURIComponent("templates/home.liquid")}`
  );
  const body = (await res.json()) as { content: string };
  assert.equal(res.status, 200);
  assert.equal(body.content, ORIGINAL_HOME);
});

test("EMPIRICAL: PUT to a .liquid path is still refused (403 READ_ONLY_FILE) after the readability change, disk untouched", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const onDisk = path.join(themesDir, "templated", "fashion-fixture", "templates", "home.liquid");

  const put = await fetch(`${baseUrl}${BASE("fashion-fixture")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "templates/home.liquid", content: "{% comment %}attacker-authored{% endcomment %}" }),
  });
  const body = (await put.json()) as { code?: string };

  assert.equal(put.status, 403, `expected PUT to be refused, got ${put.status}: ${JSON.stringify(body)}`);
  assert.equal(body.code, "READ_ONLY_FILE");
  assert.equal(fs.readFileSync(onDisk, "utf8"), ORIGINAL_HOME, "disk must be untouched by the refused PUT");
});

/**
 * Reset is a NARROWER operation than PUT and is not gated by `isThemeFileWritable` at all — by
 * design (`registerAdminThemeFileResetRoute`'s own doc comment: a read-only-to-EDIT file can still
 * be restored, because reset only ever writes back the pristine catalog original, never
 * operator-authored content). So the correct empirical outcome here is that reset SUCCEEDS — this
 * test exists to prove that is still true (not accidentally newly blocked) and, more importantly,
 * that what lands on disk is the catalog's byte-for-byte original, never anything from the request
 * body — reset takes no `content` field at all, so there is no injection surface to close.
 */
test("EMPIRICAL: reset on a .liquid path succeeds and restores the catalog original verbatim — by design, not a write-gate bypass", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const onDisk = path.join(themesDir, "templated", "fashion-fixture", "templates", "entry.liquid");

  // Mutate the live file directly (bypassing Explore) so reset has something real to overwrite.
  fs.writeFileSync(onDisk, "DIRECTLY-EDITED-ON-DISK", "utf8");

  const reset = await fetch(`${baseUrl}${BASE("fashion-fixture")}/file/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "templates/entry.liquid" }),
  });
  const body = (await reset.json()) as { scope?: string; content?: string };

  assert.equal(reset.status, 200, `expected reset to succeed, got ${reset.status}: ${JSON.stringify(body)}`);
  assert.equal(body.scope, "file");
  assert.equal(body.content, ORIGINAL_ENTRY);
  assert.equal(fs.readFileSync(onDisk, "utf8"), ORIGINAL_ENTRY, "disk must now hold the catalog original, not the direct edit");
});
