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
 * @file The Explore screen's ⋮ menu (Copy/Rename), read-only-group enforcement (now covering RENAME
 * too, not just PUT — a `script`/`other` file's read-only content lock exists so nobody breaks the
 * page from this screen, and a silent rename would reopen that same hole through a different door),
 * and the file-list regrouping that added `other` and narrowed `assets` to media extensions
 * (2026-08-11).
 *
 * Runs against a throwaway themes root (`fs.mkdtempSync`), never `src/themes/` — these routes write
 * real files, and a dev server may be serving off that checkout.
 *
 * `reloadTheme` is checked the same way `theme-file-save-route.integration.test.ts` checks it for
 * PUT: not just "did the write reach disk" but "does the NEXT read/render reflect it without a
 * restart" — copy and rename are new write paths onto the same boot-time-snapshot hazard.
 */

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-fileops-"));
  const dir = path.join(root, "static", "scratch");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "js"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "scratch", name: "Scratch", version: "1.0.0", tier: "static", engine: 1 }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(dir, "pages", "index.html"),
    `<!doctype html><html><body><p>home</p></body></html>`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dir, "pages", "about.html"),
    `<!doctype html><html><body><p>ABOUT-ORIGINAL</p></body></html>`,
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "js", "main.js"), "console.log('main');", "utf8");
  fs.writeFileSync(path.join(dir, "css", "styles.css"), "body { color: red; }", "utf8");
  fs.writeFileSync(path.join(dir, "NOTICE.md"), "# notice", "utf8");
  fs.writeFileSync(path.join(dir, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return root;
}

function testDeps(themesRoot: string): RouteDeps {
  return {
    ...createRouteDeps(),
    themesDir: themesRoot,
    themes: discoverAllBuiltInThemes({ dir: themesRoot, source: "built-in" }),
  };
}

const themeUrl = (baseUrl: string, workspaceId: string, themeId: string): string =>
  `${baseUrl}/api/admin/v1/workspaces/${workspaceId}/themes/${themeId}`;
const fileUrl = (baseUrl: string, workspaceId: string, themeId: string): string =>
  `${themeUrl(baseUrl, workspaceId, themeId)}/file`;
const copyUrl = (baseUrl: string, workspaceId: string, themeId: string): string =>
  `${fileUrl(baseUrl, workspaceId, themeId)}/copy`;
const renameUrl = (baseUrl: string, workspaceId: string, themeId: string): string =>
  `${fileUrl(baseUrl, workspaceId, themeId)}/rename`;
const previewUrl = (baseUrl: string, themeId: string, pageId: string): string =>
  `${baseUrl}/theme-explore/${themeId}/${pageId}`;

interface FileEntry {
  path: string;
  group: string;
  readable: boolean;
  editable: boolean;
  resettable: boolean;
}

async function getDetail(baseUrl: string, workspaceId: string, themeId: string, cookie: string) {
  const res = await fetch(themeUrl(baseUrl, workspaceId, themeId), { headers: { cookie } });
  return (await res.json()) as { pages: string[]; files: FileEntry[] };
}

test("copy duplicates a file under an auto-suffixed name, and it is visible without a restart", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(copyUrl(baseUrl, deps.workspaceId, "scratch"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/about.html" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as FileEntry & { copiedFrom: string };
  assert.equal(body.path, "pages/about-1.html");
  assert.equal(body.group, "page");
  assert.equal(body.editable, true);
  // A fresh copy has no catalog original under this new name to reset back to.
  assert.equal(body.resettable, false);

  // On disk, byte-identical to the source.
  const onDisk = fs.readFileSync(path.join(themesRoot, "static", "scratch", "pages", "about-1.html"), "utf8");
  assert.match(onDisk, /ABOUT-ORIGINAL/);

  // Reflected in the theme's `pages` map (populated by `reloadTheme`, not held from boot) without a
  // restart — the same invariant `theme-file-save-route.integration.test.ts` pins for PUT.
  const detail = await getDetail(baseUrl, deps.workspaceId, "scratch", cookie);
  assert.ok(detail.pages.includes("about-1"), `expected 'about-1' in pages, got ${JSON.stringify(detail.pages)}`);
  assert.ok(detail.files.some((f) => f.path === "pages/about-1.html"));

  const preview = await (await fetch(previewUrl(baseUrl, "scratch", "about-1"))).text();
  assert.match(preview, /ABOUT-ORIGINAL/);
});

test("copying the same source twice increments the suffix instead of colliding", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const copyOnce = () =>
    fetch(copyUrl(baseUrl, deps.workspaceId, "scratch"), {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ path: "pages/about.html" }),
    });

  const first = (await (await copyOnce()).json()) as { path: string };
  const second = (await (await copyOnce()).json()) as { path: string };
  assert.equal(first.path, "pages/about-1.html");
  assert.equal(second.path, "pages/about-2.html");
});

/**
 * Adversarial case found during the 2026-08-11 function-quality self-check on
 * `resolveCopyOrRenameTargets`: its own `existsSync(dest)` pre-check leaves a TOCTOU window between
 * "checked the name is free" and "wrote the file" — two requests issued close enough together (a
 * genuine double-click, or two tabs) can both compute the SAME auto-suffixed destination and both
 * pass that check before either writes. `copyThemeFile` closes this specific window with
 * `copyFileSync`'s `COPYFILE_EXCL` flag; this test proves that closure rather than asserting it by
 * reading the source. `Promise.all` fires both requests without awaiting the first, so both start
 * from the identical pre-copy directory listing.
 */
test("two concurrent copies of the same source do not silently overwrite one another", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const copyOnce = () =>
    fetch(copyUrl(baseUrl, deps.workspaceId, "scratch"), {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ path: "pages/about.html" }),
    });

  const [a, b] = await Promise.all([copyOnce(), copyOnce()]);
  const statuses = [a.status, b.status].sort();
  // Exactly one wins the race for `about-1.html`; the other must fail cleanly (400, containment
  // error) rather than silently landing on the same path a second time or corrupting either file.
  assert.deepEqual(statuses, [200, 400]);

  const winner = a.status === 200 ? a : b;
  const winnerBody = (await winner.json()) as { path: string };
  assert.equal(winnerBody.path, "pages/about-1.html");

  const onDisk = fs.readFileSync(path.join(themesRoot, "static", "scratch", "pages", "about-1.html"), "utf8");
  assert.match(onDisk, /ABOUT-ORIGINAL/, "the winning copy must be intact, not a corrupted partial write");
});

test("copying a script (read-only-to-edit) is allowed — read-only blocks editing, not duplicating", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(copyUrl(baseUrl, deps.workspaceId, "scratch"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "js/main.js" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as FileEntry;
  assert.equal(body.path, "js/main-1.js");
  assert.equal(body.group, "script");
  assert.equal(body.readable, true);
  // The copy is a script too, so it inherits the same read-only-to-edit policy as its source.
  assert.equal(body.editable, false);
});

test("copy of a nonexistent source is rejected with FILE_NOT_FOUND", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(copyUrl(baseUrl, deps.workspaceId, "scratch"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/nope.html" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FILE_NOT_FOUND");
});

test("rename changes a page's path, and the NEW url renders without a restart", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(renameUrl(baseUrl, deps.workspaceId, "scratch"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/about.html", name: "about-us.html" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as FileEntry & { renamedFrom: string };
  assert.equal(body.path, "pages/about-us.html");
  assert.equal(body.renamedFrom, "pages/about.html");

  assert.ok(!fs.existsSync(path.join(themesRoot, "static", "scratch", "pages", "about.html")));
  assert.ok(fs.existsSync(path.join(themesRoot, "static", "scratch", "pages", "about-us.html")));

  const detail = await getDetail(baseUrl, deps.workspaceId, "scratch", cookie);
  assert.ok(detail.pages.includes("about-us"));
  assert.ok(!detail.pages.includes("about"));

  const preview = await (await fetch(previewUrl(baseUrl, "scratch", "about-us"))).text();
  assert.match(preview, /ABOUT-ORIGINAL/);
});

test("rename hard-blocks pages/index.html — loadTheme requires it at this exact path", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(renameUrl(baseUrl, deps.workspaceId, "scratch"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/index.html", name: "home.html" }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "REQUIRED_FILE_LOCKED");
  assert.ok(fs.existsSync(path.join(themesRoot, "static", "scratch", "pages", "index.html")));
});

test("rename hard-blocks theme.json and tokens.json — the same loadTheme-requires-it shape as index.html", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  for (const locked of ["theme.json", "tokens.json"]) {
    const res = await fetch(renameUrl(baseUrl, deps.workspaceId, "scratch"), {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ path: locked, name: "renamed.json" }),
    });
    assert.equal(res.status, 409, `expected 409 for renaming ${locked}`);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "REQUIRED_FILE_LOCKED");
    assert.ok(fs.existsSync(path.join(themesRoot, "static", "scratch", locked)), `${locked} must still exist`);
  }
});

test("rename hard-blocks script and other read-only-group files — renaming could break a reference the read-only content lock has no way to help fix", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  for (const readOnly of ["js/main.js", "NOTICE.md"]) {
    const res = await fetch(renameUrl(baseUrl, deps.workspaceId, "scratch"), {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ path: readOnly, name: "renamed" }),
    });
    assert.equal(res.status, 409, `expected 409 for renaming ${readOnly}`);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "READ_ONLY_FILE");
    assert.ok(
      fs.existsSync(path.join(themesRoot, "static", "scratch", ...readOnly.split("/"))),
      `${readOnly} must still exist at its original path`
    );
  }
});

test("rename does NOT block an asset (binary, not text-readable, but not a read-only GROUP)", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(renameUrl(baseUrl, deps.workspaceId, "scratch"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "logo.png", name: "brand.png" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as FileEntry & { renamedFrom: string };
  assert.equal(body.path, "brand.png");
  assert.equal(body.group, "asset");
});

test("rename rejects a name that carries a path separator, instead of allowing a move across folders", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(renameUrl(baseUrl, deps.workspaceId, "scratch"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/about.html", name: "../../../etc/passwd" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "INVALID_NAME");
  assert.ok(fs.existsSync(path.join(themesRoot, "static", "scratch", "pages", "about.html")));
});

test("rename collision is refused, and neither file is touched", async (t) => {
  const themesRoot = makeThemesRoot();
  const dir = path.join(themesRoot, "static", "scratch");
  fs.writeFileSync(path.join(dir, "pages", "team.html"), "<p>team</p>", "utf8");
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(renameUrl(baseUrl, deps.workspaceId, "scratch"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/about.html", name: "team.html" }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "NAME_TAKEN");

  assert.match(fs.readFileSync(path.join(dir, "pages", "about.html"), "utf8"), /ABOUT-ORIGINAL/);
  assert.equal(fs.readFileSync(path.join(dir, "pages", "team.html"), "utf8"), "<p>team</p>");
});

test("renaming a file to its current name is a harmless no-op, not a NAME_TAKEN collision", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(renameUrl(baseUrl, deps.workspaceId, "scratch"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/about.html", name: "about.html" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { path: string };
  assert.equal(body.path, "pages/about.html");
});

test("PUT rejects writing a script file with a 4xx and a machine code, and does not touch disk", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(fileUrl(baseUrl, deps.workspaceId, "scratch"), {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "js/main.js", content: "console.log('tampered');" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "READ_ONLY_FILE");

  const onDisk = fs.readFileSync(path.join(themesRoot, "static", "scratch", "js", "main.js"), "utf8");
  assert.equal(onDisk, "console.log('main');");
});

test("PUT rejects writing an 'other'-group file (e.g. a markdown notice) the same way", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(fileUrl(baseUrl, deps.workspaceId, "scratch"), {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "NOTICE.md", content: "tampered" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "READ_ONLY_FILE");
});

test("a script's source is still readable via GET even though it is not writable", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(`${fileUrl(baseUrl, deps.workspaceId, "scratch")}?path=${encodeURIComponent("js/main.js")}`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { content: string };
  assert.match(body.content, /console\.log/);
});

test("file list groups: markdown/manifest files land in 'other', not swept into 'assets'", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const detail = await getDetail(baseUrl, deps.workspaceId, "scratch", cookie);
  const byPath = new Map(detail.files.map((f) => [f.path, f]));

  assert.equal(byPath.get("NOTICE.md")?.group, "other");
  assert.equal(byPath.get("NOTICE.md")?.readable, true);
  assert.equal(byPath.get("NOTICE.md")?.editable, false);

  assert.equal(byPath.get("logo.png")?.group, "asset");
  assert.equal(byPath.get("logo.png")?.readable, false);
  assert.equal(byPath.get("logo.png")?.editable, false);

  assert.equal(byPath.get("js/main.js")?.group, "script");
  assert.equal(byPath.get("js/main.js")?.readable, true);
  assert.equal(byPath.get("js/main.js")?.editable, false);

  assert.equal(byPath.get("css/styles.css")?.group, "style");
  assert.equal(byPath.get("css/styles.css")?.editable, true);

  assert.equal(byPath.get("theme.json")?.group, "config");
  assert.equal(byPath.get("theme.json")?.editable, true);
});
