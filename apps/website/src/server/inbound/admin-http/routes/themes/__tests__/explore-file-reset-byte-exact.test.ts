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
import { registerAdminThemeDetailRoute, registerAdminThemeFileResetRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file The per-file reset route restores the catalog original's exact bytes, whatever they are:
 * bytes that are not valid UTF-8, and files larger than the 1 MB text-read limit. A file that
 * already matches its original is not rewritten at all. Every byte check uses `Buffer.equals`.
 */

const WORKSPACE_ID = "ws-file-reset-byte-exact";
const THEME_ID = "bytes";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${THEME_ID}`;
const MANIFEST = JSON.stringify({ id: THEME_ID, name: "Bytes", version: "1.0.0", tier: "static", engine: 1 });

/** A real PNG signature, then bytes that are not valid UTF-8: `FF` and `FE` never occur in UTF-8,
 *  and `80` is a lone continuation byte. */
const BINARY_ORIGINAL = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x80]);
const BINARY_EDITED = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);

/** 200 KB past the 1 MB text-read limit (`MAX_THEME_FILE_BYTES`), with every byte value present. */
const LARGE_SIZE = 1_000_000 + 200_000;
const LARGE_ORIGINAL = Buffer.from(Array.from({ length: LARGE_SIZE }, (_, i) => (i * 31) & 0xff));
const LARGE_EDITED = Buffer.alloc(LARGE_SIZE, 0x61);

const INDEX_HTML = "<html><body>x</body></html>";

type ResetBody = { scope?: string; path?: string; wasModified?: boolean; bytes?: number; content?: string | null };

function write(dir: string, relativePath: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(path.join(dir, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(dir, relativePath), content);
}

/** `bytes` has a catalog original. `pages/index.html` is identical on both sides; `assets/logo.png`
 *  and `assets/big.bin` differ from their originals. */
function makeThemesRoot(): { themesDir: string; live: string } {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-reset-byte-exact-"));
  const live = path.join(themesDir, "static", THEME_ID);
  const original = path.join(themesDir, THEME_CATALOG_DIR, "static", THEME_ID);
  for (const dir of [live, original]) {
    write(dir, "theme.json", MANIFEST);
    write(dir, "tokens.json", "{}");
    write(dir, "pages/index.html", INDEX_HTML);
  }
  write(original, "assets/logo.png", BINARY_ORIGINAL);
  write(live, "assets/logo.png", BINARY_EDITED);
  write(original, "assets/big.bin", LARGE_ORIGINAL);
  write(live, "assets/big.bin", LARGE_EDITED);
  return { themesDir, live };
}

async function startApp(t: test.TestContext): Promise<{ baseUrl: string; live: string }> {
  const { themesDir, live } = makeThemesRoot();
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
  registerAdminThemeFileResetRoute(app, deps);
  return { baseUrl: await startTestServer(app, t), live };
}

async function postReset(baseUrl: string, relativePath: string): Promise<{ status: number; body: ResetBody }> {
  const res = await fetch(`${baseUrl}${BASE}/file/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: relativePath }),
  });
  return { status: res.status, body: (await res.json()) as ResetBody };
}

async function modifiedFlag(baseUrl: string, relativePath: string): Promise<boolean | null | undefined> {
  const res = await fetch(`${baseUrl}${BASE}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { files: Array<{ path: string; modified: boolean | null }> };
  return body.files.find((f) => f.path === relativePath)?.modified;
}

function assertSameBytes(actual: Buffer, expected: Buffer): void {
  assert.ok(
    actual.equals(expected),
    `expected ${expected.length} original bytes, got ${actual.length} bytes; first 16 expected ${expected.subarray(0, 16).toString("hex")}, got ${actual.subarray(0, 16).toString("hex")}`
  );
}

test("reset restores a binary original's exact bytes, including bytes that are not valid UTF-8, and the file then lists as unmodified", async (t) => {
  const { baseUrl, live } = await startApp(t);

  const { status, body } = await postReset(baseUrl, "assets/logo.png");

  assert.equal(status, 200, JSON.stringify(body));
  assertSameBytes(fs.readFileSync(path.join(live, "assets", "logo.png")), BINARY_ORIGINAL);
  assert.equal(body.wasModified, true);
  assert.equal(body.bytes, BINARY_ORIGINAL.length);
  assert.equal(await modifiedFlag(baseUrl, "assets/logo.png"), false);
});

test("reset of a file over the 1 MB text-read limit succeeds, restores its exact bytes, and returns content: null", async (t) => {
  const { baseUrl, live } = await startApp(t);

  const { status, body } = await postReset(baseUrl, "assets/big.bin");

  assert.equal(status, 200, JSON.stringify(body));
  assertSameBytes(fs.readFileSync(path.join(live, "assets", "big.bin")), LARGE_ORIGINAL);
  assert.equal(body.wasModified, true);
  assert.equal(body.bytes, LARGE_SIZE);
  assert.equal(body.content, null, "a file past the text-read limit has no text content to return");
  assert.equal(await modifiedFlag(baseUrl, "assets/big.bin"), false);
});

test("reset of a file already byte-identical to its original writes nothing: same inode, same mtime, wasModified: false", async (t) => {
  const { baseUrl, live } = await startApp(t);
  const target = path.join(live, "pages", "index.html");
  // An mtime well in the past, so a rewrite in the same millisecond as the stat below still shows.
  const past = new Date("2020-01-01T00:00:00Z");
  fs.utimesSync(target, past, past);
  const before = fs.statSync(target);

  const { status, body } = await postReset(baseUrl, "pages/index.html");

  assert.equal(status, 200, JSON.stringify(body));
  const after = fs.statSync(target);
  assert.equal(after.ino, before.ino, "a write renames a temp file over the target, which changes the inode");
  assert.equal(after.mtimeMs, before.mtimeMs, "an unmodified file must not be rewritten");
  assert.deepEqual(body, { scope: "file", path: "pages/index.html", wasModified: false, bytes: 0, content: INDEX_HTML });
});
