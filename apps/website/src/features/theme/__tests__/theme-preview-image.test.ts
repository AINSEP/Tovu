import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import nodeFs, { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";
import { themeCardPreviewUrl, themeContentVersion, themePreviewImage } from "../theme-preview-image.js";
import { MAX_LISTED_FILES, MAX_WALK_DEPTH } from "../theme-files.js";

test("D-22: thumbnail discovery reports no image, actual PNG, then preferred JPEG", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-theme-preview-"));
  try {
    assert.equal(themePreviewImage({ dir, id: "tovu-starter" }), null);
    mkdirSync(join(dir, "screenshots"));
    writeFileSync(join(dir, "screenshots", "index.png"), "png");
    assert.equal(themePreviewImage({ dir, id: "tovu-starter" }), "/theme-assets/tovu-starter/screenshots/index.png");
    writeFileSync(join(dir, "screenshots", "index.jpg"), "jpg");
    assert.equal(themePreviewImage({ dir, id: "tovu-starter" }), "/theme-assets/tovu-starter/screenshots/index.jpg");
    assert.equal(themePreviewImage({ dir, id: "tovu-starter" }, { assetsServed: false }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a theme's content version is its newest source mtime; screenshots and generated output do not count", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-theme-version-"));
  try {
    mkdirSync(join(dir, "render", "pages"), { recursive: true });
    mkdirSync(join(dir, "screenshots"));
    mkdirSync(join(dir, "preview"));
    writeFileSync(join(dir, "theme.json"), "{}");
    writeFileSync(join(dir, "render", "pages", "index.html"), "<main></main>");
    writeFileSync(join(dir, "screenshots", "index.png"), "png");
    writeFileSync(join(dir, "preview", "index.html"), "built");
    const at = (seconds: number) => new Date(seconds * 1000);
    for (const path of ["", "render", "render/pages", "theme.json", "render/pages/index.html"]) utimesSync(join(dir, path), at(100), at(100));
    utimesSync(join(dir, "screenshots"), at(900), at(900));
    utimesSync(join(dir, "screenshots", "index.png"), at(900), at(900));
    utimesSync(join(dir, "preview"), at(900), at(900));
    utimesSync(join(dir, "preview", "index.html"), at(900), at(900));
    assert.equal(themeContentVersion({ dir }), 100_000);
    // An edit deep in the tree is a new version; so is a deleted file (its folder's mtime moves).
    utimesSync(join(dir, "render", "pages", "index.html"), at(200), at(200));
    assert.equal(themeContentVersion({ dir }), 200_000);
    utimesSync(join(dir, "render"), at(300), at(300));
    assert.equal(themeContentVersion({ dir }), 300_000);
    assert.equal(themeContentVersion({ dir: join(dir, "missing") }), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a static theme's card shows its own capture keyed by content version, never a screenshot copied from its source", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-theme-card-"));
  try {
    // The copy inherited its source's screenshot verbatim: the shipped file is not this theme's look.
    mkdirSync(join(dir, "screenshots"));
    writeFileSync(join(dir, "screenshots", "index.png"), "the source theme's picture");
    const theme = { dir, id: "editorial rose", tier: "static" as const };
    assert.equal(
      themeCardPreviewUrl({ theme, workspaceId: "ws 1" }, { capturesEnabled: true, contentVersion: () => 1234.7 }),
      "/api/admin/v1/workspaces/ws%201/themes/editorial%20rose/preview?v=1234",
    );
    // Without captures (production, install-dir boots) and for other tiers, the shipped screenshot stays.
    assert.equal(themeCardPreviewUrl({ theme, workspaceId: "ws" }), "/theme-assets/editorial%20rose/screenshots/index.png");
    assert.equal(
      themeCardPreviewUrl({ theme: { ...theme, tier: "templated" }, workspaceId: "ws" }, { capturesEnabled: true }),
      "/theme-assets/editorial%20rose/screenshots/index.png",
    );
    assert.equal(themeCardPreviewUrl({ theme: { ...theme, tier: "declarative" }, workspaceId: "ws" }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the content version stops descending at the walk depth limit", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-theme-version-depth-"));
  try {
    // d0 … d(MAX-1): the deepest folder sits at depth MAX_WALK_DEPTH, so its own mtime counts but its
    // children are never read.
    const chain = Array.from({ length: MAX_WALK_DEPTH }, (_, i) => `d${i}`);
    const deepest = join(dir, ...chain);
    mkdirSync(deepest, { recursive: true });
    writeFileSync(join(deepest, "too-deep.html"), "x");
    const at = (seconds: number) => new Date(seconds * 1000);
    utimesSync(join(deepest, "too-deep.html"), at(900), at(900));
    for (let i = chain.length; i >= 0; i -= 1) utimesSync(join(dir, ...chain.slice(0, i)), at(100), at(100));
    assert.equal(themeContentVersion({ dir }), 100_000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the content version stops stat-ing once more than MAX_LISTED_FILES entries were visited", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-theme-version-cap-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (let i = 0; i <= MAX_LISTED_FILES; i += 1) writeFileSync(join(dir, `f${i}.css`), "");
  const statSync = mock.method(nodeFs, "statSync");
  t.after(() => statSync.mock.restore());
  themeContentVersion({ dir });
  // The root, then exactly MAX_LISTED_FILES files: the (MAX_LISTED_FILES + 1)th entry ends the walk.
  assert.equal(statSync.mock.callCount(), 1 + MAX_LISTED_FILES);
});

test("a non-regular entry (a FIFO) does not move the content version", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-theme-version-fifo-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync("mkfifo", [join(dir, "pipe")]);
  const at = (seconds: number) => new Date(seconds * 1000);
  utimesSync(join(dir, "pipe"), at(900), at(900));
  utimesSync(dir, at(100), at(100));
  assert.equal(themeContentVersion({ dir }), 100_000);
});
