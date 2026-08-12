import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import {
  registerAdminThemeFileCopyRoute,
  registerAdminThemeFileRenameRoute,
  registerAdminThemeFileResetRoute,
  registerAdminThemeFilePutRoute,
} from "../explore";
import type { ContentRouteDeps } from "../../content/deps";

/**
 * @file ADR-020 §5, the "editor-read-only" half of the built-theme lifecycle split, verified through
 * the real Express routes a human editor session actually calls — `resolveThemeFileWriteScope` and
 * `restoreBuiltThemeGeneratedTree` are proven as pure units in `src/features/theme/__tests__/`; this
 * file proves they're actually WIRED into PUT/reset/copy/rename, not just available to be wired.
 *
 * Uses `startTestServer` (real HTTP, real Express routing) but skips the full cookie-login flow
 * `bootAuthenticated` performs — `getAuthedPrincipal` only ever reads `res.locals.principal`, so a
 * trivial test-only middleware stands in for `requireAdminSession` without weakening what's under
 * test (every route here still calls the real `authorizeThemeAccess` → `deps.authorize()` path).
 */

const WORKSPACE_ID = "ws-explore-gate";
const SENTINEL = '<link rel="stylesheet" href="../css/styles.css" />';

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-explore-gate-"));

  // A compiled/built theme, with a catalog original for restore to draw from.
  for (const base of [path.join(root, "static", "compiled"), path.join(root, "__original-themes__", "static", "compiled")]) {
    fs.mkdirSync(path.join(base, "pages"), { recursive: true });
    fs.mkdirSync(path.join(base, "css"), { recursive: true });
    fs.mkdirSync(path.join(base, "src"), { recursive: true });
  }

  const pageHtml = `<!doctype html><html><head>${SENTINEL}</head><body>Compiled</body></html>`;
  const cssContent = "body{margin:0}";
  const manifest = JSON.stringify({
    id: "compiled",
    name: "Compiled",
    version: "1.0.0",
    tier: "static",
    engine: 1,
    author: "Aurora Themes Co.",
    build: {
      source: "compiled",
      sourceDir: "src",
      artifactHashes: { "pages/index.html": sha256(pageHtml), "css/styles.css": sha256(cssContent) },
    },
  });

  // Live copy: page + css SHIPPED-shape, plus one live-only stray generated file to prove restore
  // removes it too. Catalog copy: the pristine originals restore pulls from.
  fs.writeFileSync(path.join(root, "static", "compiled", "pages", "index.html"), pageHtml, "utf8");
  fs.writeFileSync(path.join(root, "static", "compiled", "css", "styles.css"), cssContent, "utf8");
  fs.writeFileSync(path.join(root, "static", "compiled", "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(root, "static", "compiled", "src", "Header.tsx"), "live source", "utf8");
  fs.writeFileSync(path.join(root, "static", "compiled", "theme.json"), manifest, "utf8");

  fs.writeFileSync(path.join(root, "__original-themes__", "static", "compiled", "pages", "index.html"), pageHtml, "utf8");
  fs.writeFileSync(path.join(root, "__original-themes__", "static", "compiled", "css", "styles.css"), cssContent, "utf8");
  fs.writeFileSync(path.join(root, "__original-themes__", "static", "compiled", "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(root, "__original-themes__", "static", "compiled", "src", "Header.tsx"), "catalog source", "utf8");
  fs.writeFileSync(path.join(root, "__original-themes__", "static", "compiled", "theme.json"), manifest, "utf8");

  // An ordinary authored theme, to prove nothing here regresses the common case.
  const authored = path.join(root, "static", "authored");
  fs.mkdirSync(path.join(authored, "pages"), { recursive: true });
  fs.mkdirSync(path.join(authored, "css"), { recursive: true });
  fs.writeFileSync(path.join(authored, "pages", "index.html"), `<html><head>${SENTINEL}</head><body>x</body></html>`, "utf8");
  fs.writeFileSync(path.join(authored, "css", "styles.css"), "body{}", "utf8");
  fs.writeFileSync(path.join(authored, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(authored, "theme.json"),
    JSON.stringify({ id: "authored", name: "Authored", version: "1.0.0", tier: "static", engine: 1 })
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
  // Stand-in for `requireAdminSession` — see file header.
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminThemeFilePutRoute(app, deps);
  registerAdminThemeFileResetRoute(app, deps);
  registerAdminThemeFileCopyRoute(app, deps);
  registerAdminThemeFileRenameRoute(app, deps);
  return app;
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

test("PUT into a built theme's generated tree is refused with GENERATED_READONLY, disk untouched", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const target = path.join(themesDir, "static", "compiled", "css", "styles.css");
  const before = fs.readFileSync(target, "utf8");

  const response = await fetch(`${baseUrl}${BASE("compiled")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "css/styles.css", content: "HACKED" }),
  });

  assert.equal(response.status, 403);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "GENERATED_READONLY");
  assert.equal(fs.readFileSync(target, "utf8"), before);
});

test("PUT into a built theme's sourceDir or theme.json still works", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}${BASE("compiled")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "src/Header.tsx", content: "edited via explore" }),
  });

  assert.equal(response.status, 200);
  assert.equal(
    fs.readFileSync(path.join(themesDir, "static", "compiled", "src", "Header.tsx"), "utf8"),
    "edited via explore"
  );
});

test("PUT of a NON-framework extension into sourceDir is still refused — the bypass is a bounded allowlist, not 'anything in sourceDir'", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  // build.sourceDir is statically served (theme-static-assets.ts mounts express.static on the WHOLE
  // theme folder), so an arbitrary-extension write here would be a publicly fetchable file, not just
  // an internal one -- this must stay refused exactly like it is everywhere else in a theme.
  const response = await fetch(`${baseUrl}${BASE("compiled")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "src/shell.php", content: "<?php system($_GET['c']); ?>" }),
  });

  assert.equal(response.status, 403);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "READ_ONLY_FILE");
  assert.equal(fs.existsSync(path.join(themesDir, "static", "compiled", "src", "shell.php")), false);
});

test("PUT of attacker-controlled markup as .html/.svg/.js into sourceDir is refused, even though those extensions ARE writable elsewhere in a theme", async (t) => {
  // Regression: this exact request (a real HTTP PUT, no rename involved) returned 200 before
  // SOURCE_DIR_WRITABLE_EXTENSIONS existed -- .html/.svg/.js are all in TEXT_READABLE_EXTENSIONS, and
  // the first version of isCompiledSourceFile accepted anything in that broader set. build.sourceDir
  // is statically served (theme-static-assets.ts), so this was a same-origin XSS payload reachable
  // with one HTTP call, not a theoretical gap.
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  for (const name of ["thing.html", "thing.svg", "thing.js"]) {
    const filePath = `src/${name}`;
    const response = await fetch(`${baseUrl}${BASE("compiled")}/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: filePath, content: "<script>alert(document.domain)</script>" }),
    });

    assert.equal(response.status, 403, `${filePath} must be refused`);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "READ_ONLY_FILE");
    assert.equal(fs.existsSync(path.join(themesDir, "static", "compiled", "src", name)), false);
  }
});

test("PUT of .css/.json/.md/.txt into sourceDir still works — the narrowed allowlist isn't overly strict", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  for (const [name, content] of [
    ["module.css", ".foo { color: red; }"],
    ["package.json", "{}"],
    ["README.md", "# hi"],
    ["notes.txt", "hi"],
  ] as const) {
    const response = await fetch(`${baseUrl}${BASE("compiled")}/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: `src/${name}`, content }),
    });
    assert.equal(response.status, 200, `src/${name} should be writable`);
    assert.equal(fs.readFileSync(path.join(themesDir, "static", "compiled", "src", name), "utf8"), content);
  }
});

test("renaming a compiled theme's sourceDir file to a DIFFERENT extension is refused (would launder vetted bytes into an unvetted extension)", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}${BASE("compiled")}/file/rename`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "src/Header.tsx", name: "Header.html" }),
  });

  assert.equal(response.status, 400);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "EXTENSION_CHANGE_NOT_ALLOWED");
  assert.equal(fs.existsSync(path.join(themesDir, "static", "compiled", "src", "Header.html")), false);
  assert.equal(fs.existsSync(path.join(themesDir, "static", "compiled", "src", "Header.tsx")), true);
});

test("renaming ANY theme's file to a different extension is refused, not just a compiled theme's sourceDir (the same rule applies uniformly)", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}${BASE("authored")}/file/rename`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "css/styles.css", name: "styles.html" }),
  });

  assert.equal(response.status, 400);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "EXTENSION_CHANGE_NOT_ALLOWED");
});

test("reset on a built theme's generated file restores the WHOLE generated tree atomically, reporting every restored path", async (t) => {
  const themesDir = makeThemesRoot();
  // Corrupt the live css AND leave a stray live-only generated file, to prove a single reset call
  // fixes both, not just the one path named in the request.
  fs.writeFileSync(path.join(themesDir, "static", "compiled", "css", "styles.css"), "CORRUPTED", "utf8");
  fs.mkdirSync(path.join(themesDir, "static", "compiled", "js"), { recursive: true });
  fs.writeFileSync(path.join(themesDir, "static", "compiled", "js", "stray.js"), "should vanish", "utf8");

  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}${BASE("compiled")}/file/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "css/styles.css" }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { scope: string; restoredFiles: string[] };
  assert.equal(body.scope, "release");
  // tokens.json is neither literally "theme.json" nor under sourceDir, so it counts as generated
  // too (resolveThemeFileWriteScope has no special case for it) -- restored along with the others.
  assert.deepEqual(body.restoredFiles.sort(), ["css/styles.css", "pages/index.html", "tokens.json"]);

  assert.equal(fs.readFileSync(path.join(themesDir, "static", "compiled", "css", "styles.css"), "utf8"), "body{margin:0}");
  assert.equal(fs.existsSync(path.join(themesDir, "static", "compiled", "js", "stray.js")), false);
  // Source and theme.json survive a generated-tree restore untouched.
  assert.equal(fs.readFileSync(path.join(themesDir, "static", "compiled", "src", "Header.tsx"), "utf8"), "live source");
});

test("reset on a built theme's sourceDir file still resets that ONE file (existing per-file behavior)", async (t) => {
  const themesDir = makeThemesRoot();
  fs.writeFileSync(path.join(themesDir, "static", "compiled", "src", "Header.tsx"), "edited live", "utf8");

  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}${BASE("compiled")}/file/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "src/Header.tsx" }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { scope: string; path: string; content: string };
  assert.equal(body.scope, "file");
  assert.equal(body.content, "catalog source");
  assert.equal(fs.readFileSync(path.join(themesDir, "static", "compiled", "src", "Header.tsx"), "utf8"), "catalog source");
});

test("reset on an AUTHORED theme's file is unaffected — still scope:file, existing behavior", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  // No catalog original for the authored fixture in this test root -> NO_ORIGINAL, same as before
  // this change existed (proves the authored path didn't get redirected into the release branch).
  const response = await fetch(`${baseUrl}${BASE("authored")}/file/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "tokens.json" }),
  });

  assert.equal(response.status, 409);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "NO_ORIGINAL");
});

test("copy into a built theme's generated tree is refused", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}${BASE("compiled")}/file/copy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "css/styles.css" }),
  });

  assert.equal(response.status, 409);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "GENERATED_READONLY");
  assert.equal(fs.existsSync(path.join(themesDir, "static", "compiled", "css", "styles-1.css")), false);
});

test("copy within a built theme's sourceDir still works", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}${BASE("compiled")}/file/copy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "src/Header.tsx" }),
  });

  assert.equal(response.status, 200);
  assert.equal(fs.existsSync(path.join(themesDir, "static", "compiled", "src", "Header-1.tsx")), true);
});

test("rename inside a built theme's generated tree is refused", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}${BASE("compiled")}/file/rename`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "css/styles.css", name: "renamed.css" }),
  });

  assert.equal(response.status, 409);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "GENERATED_READONLY");
  assert.equal(fs.existsSync(path.join(themesDir, "static", "compiled", "css", "styles.css")), true);
});

test("rename inside a built theme's sourceDir still works", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}${BASE("compiled")}/file/rename`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "src/Header.tsx", name: "Header2.tsx" }),
  });

  assert.equal(response.status, 200);
  assert.equal(fs.existsSync(path.join(themesDir, "static", "compiled", "src", "Header2.tsx")), true);
});

test("renaming a non-framework-extension file already sitting in sourceDir is still refused (same bounded allowlist as PUT)", async (t) => {
  const themesDir = makeThemesRoot();
  // Simulate a file that landed on disk some other way (not through this API, which already refuses
  // to create one) -- the rename route must still refuse it on its own, not merely rely on PUT.
  fs.writeFileSync(path.join(themesDir, "static", "compiled", "src", "shell.sh"), "#!/bin/sh\necho hi", "utf8");

  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}${BASE("compiled")}/file/rename`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "src/shell.sh", name: "renamed.sh" }),
  });

  assert.equal(response.status, 409);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "READ_ONLY_FILE");
});

test("an authored theme's PUT/copy/rename are completely unaffected by any of this", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const put = await fetch(`${baseUrl}${BASE("authored")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "tokens.json", content: '{"--ink":"#111"}' }),
  });
  assert.equal(put.status, 200);

  const copy = await fetch(`${baseUrl}${BASE("authored")}/file/copy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "css/styles.css" }),
  });
  assert.equal(copy.status, 200);
});
