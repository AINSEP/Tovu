import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeFilePutRoute } from "../explore";
import type { ContentRouteDeps } from "../../content/deps";

/**
 * @file Branch coverage for `registerAdminThemeFilePutRoute` not already exercised by
 * `explore-built-theme-gate.test.ts` (the ADR-020 §5 write-scope split) or
 * `explore-liquid-readable.test.ts` (the `.liquid` read-only-group refusal): the `content` type
 * check, `isThemeFileWritable`'s per-GROUP outcomes on an ORDINARY (non-compiled) theme (`asset`
 * writable, `script`/`other` read-only — `config`/`page` are already covered elsewhere via
 * `tokens.json`/`pages/index.html` writes), a compiled theme's `theme.json` PUT (the one case where
 * `isInsideCompiledSourceDir`'s `relativePath !== "theme.json"` condition is FALSE), and the route's
 * own catch-all (a non-`ThemePathError` write failure -> 500).
 */

const WORKSPACE_ID = "ws-file-put-branches";

function makePlainThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-file-put-branches-"));
  const dir = path.join(root, "static", "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "css", "styles.css"), "body{}", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "logo.svg"), "<svg></svg>", "utf8");
  fs.writeFileSync(path.join(dir, "main.js"), "console.log('x')", "utf8");
  fs.writeFileSync(path.join(dir, "notes.md"), "# hi", "utf8");
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 })
  );
  return root;
}

function makeCompiledThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-file-put-compiled-"));
  const dir = path.join(root, "static", "compiled");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "src", "Header.tsx"), "source", "utf8");
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({
      id: "compiled",
      name: "Compiled",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      build: { source: "compiled", sourceDir: "src", artifactHashes: {} },
    }),
    "utf8"
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
  registerAdminThemeFilePutRoute(app, deps);
  return app;
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

test("PUT with a non-string content field 400s INVALID_BODY", async (t) => {
  const themesDir = makePlainThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "notes.md", content: 12345 }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "INVALID_BODY");
});

test("PUT with content missing entirely 400s INVALID_BODY (undefined is not a string)", async (t) => {
  const themesDir = makePlainThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "notes.md" }),
  });
  assert.equal(res.status, 400);
});

test("PUT of an .svg (asset group) on an ordinary theme succeeds -- isThemeFileWritable is true for 'asset'", async (t) => {
  const themesDir = makePlainThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "logo.svg", content: "<svg><circle/></svg>" }),
  });
  assert.equal(res.status, 200);
  assert.equal(fs.readFileSync(path.join(themesDir, "static", "plain", "logo.svg"), "utf8"), "<svg><circle/></svg>");
});

test("PUT of a .js file (script group) on an ordinary theme is refused 403 -- isThemeFileWritable is false via READ_ONLY_GROUPS", async (t) => {
  const themesDir = makePlainThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const target = path.join(themesDir, "static", "plain", "main.js");
  const before = fs.readFileSync(target, "utf8");

  const res = await fetch(`${baseUrl}${BASE("plain")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "main.js", content: "alert(1)" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "READ_ONLY_FILE");
  assert.equal(fs.readFileSync(target, "utf8"), before);
});

test("PUT of a .md file ('other' group) on an ordinary theme is refused 403 -- READ_ONLY_GROUPS covers 'other' too", async (t) => {
  const themesDir = makePlainThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "notes.md", content: "# changed" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "READ_ONLY_FILE");
});

test("PUT of theme.json on a COMPILED theme succeeds via the general isThemeFileWritable path, not the sourceDir extension allowlist", async (t) => {
  // `isInsideCompiledSourceDir` is `build?.source === "compiled" && writeScope.kind === "editable" &&
  // relativePath !== "theme.json"` -- this is the one case that makes the third condition FALSE while
  // the first two are true, routing PUT to the plain `isThemeFileWritable(path)` check instead of
  // `isSourceDirWritableExtension`. `theme.json` is `config` group + `.json` extension, so it passes
  // either way -- this test proves it takes THIS branch, not merely that it succeeds.
  const themesDir = makeCompiledThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("compiled")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: "theme.json",
      content: JSON.stringify({
        id: "compiled",
        name: "Compiled Renamed",
        version: "1.0.0",
        tier: "static",
        engine: 1,
        build: { source: "compiled", sourceDir: "src", artifactHashes: {} },
      }),
    }),
  });
  assert.equal(res.status, 200, `expected theme.json PUT to succeed, got ${res.status}`);
  const onDisk = JSON.parse(fs.readFileSync(path.join(themesDir, "static", "compiled", "theme.json"), "utf8")) as {
    name: string;
  };
  assert.equal(onDisk.name, "Compiled Renamed");
});

test("PUT of a WRITABLE-extension path that still escapes the theme folder via traversal 400s ThemePathError, not 403 -- the group/generated checks pass, but the write itself is refused by containment", async (t) => {
  // Every other refused-PUT test in this suite is refused by the GROUP/generated-path gate before
  // `writeThemeFile` is ever called (an `other`/`script` extension, or a `preview/` path). This one
  // uses a `.css` path (writable group, not generated by any of THIS theme's rules) whose `..`
  // segments still resolve outside the theme folder once normalized -- exercising the route's OWN
  // `catch` -> `sendThemeFileError` -> `ThemePathError` -> 400 branch, which no PUT test reaches yet.
  const themesDir = makePlainThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "css/../../../../etc/evil.css", content: "body{}" }),
  });
  const body = (await res.json()) as { code?: string; error?: string };
  assert.equal(res.status, 400, `expected a traversal write to 400, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.code, "INVALID_THEME_PATH");
});

test("PUT that fails for a reason OTHER than ThemePathError 500s via sendThemeFileError's generic branch", async (t) => {
  // Deny write permission on the TARGET FILE itself (writeFileSync opens an existing file with the
  // "w" flag, which needs write permission on the file, not its parent directory) so
  // `writeThemeFile`'s `writeFileSync` throws a raw EACCES, not a `ThemePathError` -- the one branch
  // of `sendThemeFileError` PUT's regression tests never reach, since every other PUT failure here is
  // a deliberate `ThemePathError`-shaped refusal (400/403), not a 500.
  const themesDir = makePlainThemesRoot();
  const target = path.join(themesDir, "static", "plain", "logo.svg");
  fs.chmodSync(target, 0o444);
  t.after(() => fs.chmodSync(target, 0o644));

  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "logo.svg", content: "<svg><circle/></svg>" }),
  });
  const body = (await res.json()) as { error?: string; code?: string };
  if (process.getuid && process.getuid() === 0) {
    t.skip("running as root: chmod 555 does not deny root a write, so EACCES cannot be forced here");
    return;
  }
  assert.equal(res.status, 500, `expected a permission-denied write to 500, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.error, "internal error");
});
