import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes, THEME_CATALOG_DIR } from "#src/features/theme/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import {
  registerAdminThemeDetailRoute,
  registerAdminThemeFileCopyRoute,
  registerAdminThemeFileRenameRoute,
} from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file The Explore file listing's per-file `modified` flag: whether the live file's bytes differ
 * from its catalog original. `modified` is `null` exactly when `resettable` is false (no catalog
 * copy of that file to compare against), so a client never has to guess what an absent answer means.
 */

const WORKSPACE_ID = "ws-detail-modified";
const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

type FileEntry = { path: string; resettable: boolean; modified: boolean | null };

const MANIFEST = (id: string) => JSON.stringify({ id, name: id, version: "1.0.0", tier: "static", engine: 1 });

function write(dir: string, relativePath: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(dir, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(dir, relativePath), content, "utf8");
}

/**
 * `moddy` has a catalog original. Against it, the live copy has:
 * - `pages/index.html`, `theme.json`, `tokens.json`: byte-identical.
 * - `css/styles.css`: same length, different bytes.
 * - `pages/about.html`: longer than the original.
 * - `pages/crlf.html`: CRLF where the original has LF.
 * - `pages/mine.html`: no catalog counterpart at all.
 *
 * `bare` has no catalog directory.
 */
function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-detail-modified-"));
  const live = path.join(root, "static", "moddy");
  const original = path.join(root, THEME_CATALOG_DIR, "static", "moddy");
  for (const dir of [live, original]) {
    write(dir, "theme.json", MANIFEST("moddy"));
    write(dir, "tokens.json", "{}");
    write(dir, "pages/index.html", "<html><body>x</body></html>");
  }
  write(live, "css/styles.css", "body{color:red}");
  write(original, "css/styles.css", "body{color:tan}");
  write(live, "pages/about.html", "<html><body>about, edited</body></html>");
  write(original, "pages/about.html", "<html><body>about</body></html>");
  write(live, "pages/crlf.html", "<p>a</p>\r\n<p>b</p>\r\n");
  write(original, "pages/crlf.html", "<p>a</p>\n<p>b</p>\n");
  write(live, "pages/mine.html", "<html><body>mine</body></html>");
  // Catalog-only: gone from the live copy, so a rename onto this name lands on a real original.
  write(original, "pages/gone.html", "<html><body>gone</body></html>");

  const bare = path.join(root, "static", "bare");
  write(bare, "theme.json", MANIFEST("bare"));
  write(bare, "tokens.json", "{}");
  write(bare, "pages/index.html", "<html><body>x</body></html>");
  return root;
}

async function startApp(t: test.TestContext, themesDir: string = makeThemesRoot()): Promise<string> {
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "site" }),
    themesDir,
    postRepo: new InMemoryPostRepo(),
  } as unknown as ContentRouteDeps;
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminThemeDetailRoute(app, deps);
  registerAdminThemeFileCopyRoute(app, deps);
  registerAdminThemeFileRenameRoute(app, deps);
  return startTestServer(app, t);
}

async function listing(baseUrl: string, themeId: string): Promise<Map<string, { resettable: boolean; modified: boolean | null }>> {
  const res = await fetch(`${baseUrl}${BASE(themeId)}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { files: FileEntry[] };
  return new Map(body.files.map((f) => [f.path, { resettable: f.resettable, modified: f.modified }]));
}

test("detail listing: byte-identical files are resettable but not modified", async (t) => {
  const files = await listing(await startApp(t), "moddy");
  assert.deepEqual(files.get("pages/index.html"), { resettable: true, modified: false });
  assert.deepEqual(files.get("theme.json"), { resettable: true, modified: false });
  assert.deepEqual(files.get("tokens.json"), { resettable: true, modified: false });
});

test("detail listing: same-size different bytes, a longer file, and CRLF-vs-LF are all modified", async (t) => {
  const files = await listing(await startApp(t), "moddy");
  assert.deepEqual(files.get("css/styles.css"), { resettable: true, modified: true });
  assert.deepEqual(files.get("pages/about.html"), { resettable: true, modified: true });
  assert.deepEqual(files.get("pages/crlf.html"), { resettable: true, modified: true });
});

test("detail listing: a file with no catalog counterpart is not resettable, and modified is null", async (t) => {
  const files = await listing(await startApp(t), "moddy");
  assert.deepEqual(files.get("pages/mine.html"), { resettable: false, modified: null });
});

test("detail listing: a theme with no catalog directory reports every file resettable: false, modified: null", async (t) => {
  const files = await listing(await startApp(t), "bare");
  assert.ok(files.size > 0);
  for (const [filePath, entry] of files) {
    assert.deepEqual(entry, { resettable: false, modified: null }, filePath);
  }
});

test("detail listing: modified reflects the disk at request time, not a boot-time snapshot", async (t) => {
  const themesDir = makeThemesRoot();
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "site" }),
    themesDir,
    postRepo: new InMemoryPostRepo(),
  } as unknown as ContentRouteDeps;
  const app = express();
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminThemeDetailRoute(app, deps);
  const baseUrl = await startTestServer(app, t);

  fs.writeFileSync(path.join(themesDir, "static", "moddy", "pages", "index.html"), "<html><body>y</body></html>", "utf8");
  const files = await listing(baseUrl, "moddy");
  assert.deepEqual(files.get("pages/index.html"), { resettable: true, modified: true });
});

test("detail listing: a same-size file that cannot be read is resettable: false, modified: null, and the listing still returns 200", async (t) => {
  if (process.getuid?.() === 0) {
    t.skip("running as root: chmod 000 does not deny root a read, so EACCES cannot be forced here");
    return;
  }
  const themesDir = makeThemesRoot();
  // Discovery reads the live stylesheet, so permissions change only after the app has started.
  const baseUrl = await startApp(t, themesDir);
  // Same length as its original, so the comparison has to open the unreadable LIVE file.
  const unreadableLive = path.join(themesDir, "static", "moddy", "css", "styles.css");
  // Byte-identical to its live copy, so the comparison has to open the unreadable ORIGINAL.
  const unreadableOriginal = path.join(themesDir, THEME_CATALOG_DIR, "static", "moddy", "pages", "index.html");
  fs.chmodSync(unreadableLive, 0o000);
  fs.chmodSync(unreadableOriginal, 0o000);
  t.after(() => {
    fs.chmodSync(unreadableLive, 0o644);
    fs.chmodSync(unreadableOriginal, 0o644);
  });

  const files = await listing(baseUrl, "moddy");

  assert.deepEqual(files.get("css/styles.css"), { resettable: false, modified: null });
  assert.deepEqual(files.get("pages/index.html"), { resettable: false, modified: null });
  assert.deepEqual(files.get("tokens.json"), { resettable: true, modified: false }, "a readable file is unaffected");
});

test("copy response: the new copy has no catalog counterpart, so resettable: false, modified: null", async (t) => {
  const baseUrl = await startApp(t);
  const res = await fetch(`${baseUrl}${BASE("moddy")}/file/copy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "css/styles.css" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as FileEntry;
  assert.deepEqual({ path: body.path, resettable: body.resettable, modified: body.modified }, {
    path: "css/styles-1.css",
    resettable: false,
    modified: null,
  });
});

test("rename response: renaming onto a catalog file name compares against that catalog file", async (t) => {
  const baseUrl = await startApp(t);
  // `pages/mine.html` has no original of its own, but the catalog has a `pages/gone.html` with
  // different bytes, so the renamed file is resettable and modified.
  const res = await fetch(`${baseUrl}${BASE("moddy")}/file/rename`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/mine.html", name: "gone.html" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as FileEntry;
  assert.deepEqual({ path: body.path, resettable: body.resettable, modified: body.modified }, {
    path: "pages/gone.html",
    resettable: true,
    modified: true,
  });
});
