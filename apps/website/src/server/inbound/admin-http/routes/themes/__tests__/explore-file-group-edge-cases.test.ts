import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeDetailRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file Two `fileGroup`/`isTextReadable`/`isAssetExtension`/`fileExtension` shapes no other test in
 * this directory happens to exercise: a file with NO extension at all (every fixture elsewhere always
 * uses a dotted filename), and a root-level `.html` file OUTSIDE `pages/` (every fixture elsewhere
 * either uses `pages/index.html` — group `page` — or a `.css`/`.js`/asset path; the `partial` group,
 * documented as this file's own doc comment's example — "nav.html"/"footer.html" — has never actually
 * been listed by any test in this suite).
 */

const WORKSPACE_ID = "ws-file-group-edge";

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-file-group-edge-"));
  const dir = path.join(root, "static", "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  // No extension at all -- `lastIndexOf(".")` is -1.
  fs.writeFileSync(path.join(dir, "LICENSE"), "MIT", "utf8");
  // Root-level .html, OUTSIDE pages/ -- the `partial` group's own defining example.
  fs.writeFileSync(path.join(dir, "nav.html"), "<nav>menu</nav>", "utf8");
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 })
  );
  return root;
}

function buildTestApp(themesDir: string): express.Express {
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
  registerAdminThemeDetailRoute(app, deps);
  return app;
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

test("a file with NO extension lists as unreadable and group 'other' -- isTextReadable/isAssetExtension's dot===-1 shortcut", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { files: { path: string; group: string; readable: boolean; editable: boolean }[] };
  const license = body.files.find((f) => f.path === "LICENSE");
  assert.ok(license, "LICENSE must appear in the listing");
  assert.equal(license!.group, "other");
  assert.equal(license!.readable, false, "no extension means isTextReadable's dot===-1 branch returns false");
  assert.equal(license!.editable, false);
});

test("a root-level .html file OUTSIDE pages/ groups as 'partial' and is readable+editable", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}`);
  const body = (await res.json()) as { files: { path: string; group: string; readable: boolean; editable: boolean }[] };
  const nav = body.files.find((f) => f.path === "nav.html");
  assert.ok(nav, "nav.html must appear in the listing");
  assert.equal(nav!.group, "partial", "a root-level .html file (not under pages/) is the 'partial' group's own defining example");
  assert.equal(nav!.readable, true);
  assert.equal(nav!.editable, true, "partial is not in READ_ONLY_GROUPS");
});
