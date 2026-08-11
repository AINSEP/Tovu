import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "../../app";
import { bootAuthenticated } from "../helpers/http-test-server";
import type { RouteDeps } from "../../routes/types";

/**
 * @file The Explore screen's save → preview loop.
 *
 * Certifies the bug this route was shipped with (2026-08-11, caught by the owner): saving a theme
 * file wrote to disk and nothing else, so the preview kept rendering the OLD markup and the only
 * honest reading was "saving is broken". `DiscoveredTheme.pages` holds file CONTENTS, `readFileSync`-ed
 * once at discovery and then held in `deps.themes` for the process's life — and the preview renders
 * out of that map, not off disk.
 *
 * The assertion that matters is therefore NOT "the write happened" (`writeThemeFile` was always
 * fine) but "the rendered preview reflects it". Both are checked, in that order, so a regression
 * reports which half broke rather than just going red.
 *
 * Runs against a throwaway themes root (`fs.mkdtempSync`), never the real `src/themes/` — a dev
 * server may be serving off that checkout and this route writes real files.
 */

const MARKER_BEFORE = "ORIGINAL-BODY-TEXT";
const MARKER_AFTER = "EDITED-BODY-TEXT";

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-save-"));
  const dir = path.join(root, "static", "scratch");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "scratch", name: "Scratch", version: "1.0.0", tier: "static", engine: 1 }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(dir, "pages", "index.html"),
    `<!doctype html><html><body><p>${MARKER_BEFORE}</p></body></html>`,
    "utf8"
  );
  return root;
}

function testDeps(themesRoot: string): RouteDeps {
  return {
    ...createRouteDeps(),
    themesDir: themesRoot,
    themes: discoverAllBuiltInThemes({ dir: themesRoot, source: "built-in" }),
  };
}

const fileUrl = (baseUrl: string, workspaceId: string, themeId: string): string =>
  `${baseUrl}/api/admin/v1/workspaces/${workspaceId}/themes/${themeId}/file`;
const previewUrl = (baseUrl: string, themeId: string, pageId: string): string =>
  `${baseUrl}/theme-explore/${themeId}/${pageId}`;

test("saving a theme file is visible in the very next preview render, not just on disk", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const before = await (await fetch(previewUrl(baseUrl, "scratch", "index"))).text();
  assert.ok(before.includes(MARKER_BEFORE), "precondition: the preview renders the original markup");

  const saved = await fetch(fileUrl(baseUrl, deps.workspaceId, "scratch"), {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      path: "pages/index.html",
      content: `<!doctype html><html><body><p>${MARKER_AFTER}</p></body></html>`,
    }),
  });
  assert.equal(saved.status, 200);

  // Disk first, so a failure here says "the write broke" rather than "the refresh broke".
  const onDisk = fs.readFileSync(path.join(themesRoot, "static", "scratch", "pages", "index.html"), "utf8");
  assert.ok(onDisk.includes(MARKER_AFTER), "the write must reach disk");

  // The one that actually regressed. No restart, no explicit rescan call from the client — the save
  // itself has to leave the in-memory theme consistent with disk.
  const after = await (await fetch(previewUrl(baseUrl, "scratch", "index"))).text();
  assert.ok(after.includes(MARKER_AFTER), "the preview must render the SAVED markup");
  assert.ok(!after.includes(MARKER_BEFORE), "the preview must not still render the pre-save markup");
});

test("reading a theme file back after saving returns what was written, not the boot-time copy", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  await fetch(fileUrl(baseUrl, deps.workspaceId, "scratch"), {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/index.html", content: `<p>${MARKER_AFTER}</p>` }),
  });

  const read = await fetch(
    `${fileUrl(baseUrl, deps.workspaceId, "scratch")}?path=${encodeURIComponent("pages/index.html")}`,
    { headers: { cookie } }
  );
  const body = (await read.json()) as { content: string };
  assert.equal(read.status, 200);
  assert.ok(body.content.includes(MARKER_AFTER));
});
