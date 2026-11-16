import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { checkTheme, findUnconstrainedElements, type ThemeStylesheets } from "../check-theme-replaced-elements.js";

/**
 * @file Two things, matching `check-embed-marker-drift.test.ts`'s split between parser unit tests
 * and a real-file regression test:
 *
 *  1. `findUnconstrainedElements` parser-shape tests — the comma-split-selector, `@media`-nesting,
 *     and scoped-descendant-selector cases this file's own header calls out as the exact false-pass
 *     shapes a naive substring match would have let through (built directly from real CSS found in
 *     `fuel`'s and `portfolite`'s shipped stylesheets, not invented edge cases).
 *
 *  2. A REAL regression test against the shipped `content/themes/static/tovu-theme/css/theme.css` —
 *     the file this task's fix landed in — proving `checkTheme` reports it clean today, and that it
 *     genuinely goes RED if the fix's own rule is removed (verified by hand: temporarily deleting
 *     `img, video, iframe { max-width: 100%; }` from that file and re-running this exact test failed
 *     with `missing: ["video", "iframe"]` before the line was restored — see this task's handoff for
 *     the pasted before/after run output; this test's job is to keep failing that way forever, not
 *     to re-prove it once by hand).
 */

test("bare comma-split selector list constrains every listed element (basic's own fix shape)", () => {
  const css = `img, video, iframe { max-width: 100%; }`;
  assert.deepEqual(findUnconstrainedElements(css), []);
});

test("each element can be constrained by its own separate rule", () => {
  const css = `
    img { max-width: 100%; }
    video { max-width: 100%; }
    iframe { max-width: 100%; }
  `;
  assert.deepEqual(findUnconstrainedElements(css), []);
});

test("img constrained, video and iframe left with no rule at all — the exact shape all 6 broken themes ship", () => {
  const css = `img { max-width: 100%; display: block; }`;
  assert.deepEqual(findUnconstrainedElements(css), ["video", "iframe"]);
});

test("a rule inside @media does NOT count — only protects the narrow viewport, not the case that shipped the bug", () => {
  const css = `
    img { max-width: 100%; }
    @media (max-width: 640px) {
      video, iframe { max-width: 100%; }
    }
  `;
  assert.deepEqual(findUnconstrainedElements(css), ["video", "iframe"]);
});

test("a scoped descendant selector does NOT count as a general rule (fuel's/portfolite's real youtube-embed CSS)", () => {
  // Real rule from src/themes/static/fuel/css/theme.css and portfolite's — protects an iframe only
  // inside .youtube-embed, not every iframe the theme might render elsewhere.
  const css = `.post-detail-body .youtube-embed iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }`;
  assert.deepEqual(findUnconstrainedElements(css), ["img", "video", "iframe"]);
});

test("a quoted declaration value containing a literal brace cannot desync brace counting", () => {
  const css = `
    .icon::before { content: "{"; }
    img, video, iframe { max-width: 100%; }
  `;
  assert.deepEqual(findUnconstrainedElements(css), []);
});

test("no CSS at all reports every replaced element as unconstrained", () => {
  const theme: ThemeStylesheets = { themeId: "empty-fixture", themeDir: "/nonexistent", cssFiles: [] };
  const finding = checkTheme(theme);
  assert.ok(finding);
  assert.deepEqual(finding.missing, ["img", "video", "iframe"]);
});

test("REGRESSION: the shipped tovu-theme stylesheet passes the replaced-element declaration check", () => {
  const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
  const cssPath = path.join(REPO_ROOT, "content", "themes", "static", "tovu-theme", "css", "theme.css");
  assert.ok(fs.existsSync(cssPath), `expected ${cssPath} to exist`);

  const theme: ThemeStylesheets = { themeId: "tovu-theme", themeDir: path.dirname(path.dirname(cssPath)), cssFiles: [cssPath] };
  const finding = checkTheme(theme);

  assert.equal(
    finding,
    null,
    `expected tovu-theme's theme.css to declare img/video/iframe constraints, got: ${JSON.stringify(finding)}`,
  );
});

// ---- in-process main() and discovery (the CLI subprocess cannot credit coverage) ----
import os from "node:os";
import { discoverThemeStylesheets, main as themeMain } from "../check-theme-replaced-elements.js";

const GOOD_CSS = "img, video, iframe { max-width: 100%; }\n";

function withThemes<T>(themes: Record<string, Record<string, string>>, run: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "themes-"));
  try {
    for (const [id, files] of Object.entries(themes)) {
      fs.mkdirSync(path.join(dir, id), { recursive: true });
      for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, id, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, id, rel), text);
      }
    }
    fs.writeFileSync(path.join(dir, "stray-file.txt"), "not a theme");
    return run(dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function runThemeMain(scanDir: string) {
  const out: string[] = []; const err: string[] = []; const exits: number[] = [];
  const spies = { log: console.log, error: console.error };
  console.log = (...a: unknown[]) => { out.push(a.join(" ")); };
  console.error = (...a: unknown[]) => { err.push(a.join(" ")); };
  try { themeMain({ scanDir, exit: c => { exits.push(c); } }); } finally { Object.assign(console, spies); }
  return { out, err, exits };
}

test("discoverThemeStylesheets lists theme dirs sorted, collects nested css sorted, and ignores files", () => {
  withThemes({ zeta: { "a.css": "", "sub/b.css": "", "readme.md": "" }, alpha: {} }, dir => {
    const found = discoverThemeStylesheets(dir);
    assert.deepEqual(found.map(t => t.themeId), ["alpha", "zeta"]);
    assert.deepEqual(found[0].cssFiles, []);
    assert.deepEqual(found[1].cssFiles, [path.join(dir, "zeta", "a.css"), path.join(dir, "zeta", "sub", "b.css")]);
  });
  assert.deepEqual(discoverThemeStylesheets(path.join(os.tmpdir(), "no-such-theme-dir-xyz")), []);
});

test("main reports OK when every theme constrains img, video and iframe", () => {
  withThemes({ one: { "t.css": GOOD_CSS }, two: { "css/t.css": GOOD_CSS } }, dir => {
    const res = runThemeMain(dir);
    assert.deepEqual(res.exits, []);
    assert.deepEqual(res.err, []);
    assert.equal(res.out.length, 1);
    assert.match(res.out[0], /^check:theme-replaced-elements — OK: 2 theme\(s\) scanned under .*; every theme constrains img, video, and iframe\.$/);
  });
});

test("main lists each failing theme with its css files (or none) and exits 1", () => {
  withThemes({ ok: { "t.css": GOOD_CSS }, partial: { "p.css": "img { max-width: 100%; }\n" }, empty: {} }, dir => {
    const res = runThemeMain(dir);
    assert.deepEqual(res.exits, [1]);
    assert.deepEqual(res.out, []);
    assert.match(res.err[0], /^check:theme-replaced-elements — 2 of 3 theme\(s\) under .* have unconstrained replaced element\(s\):$/);
    assert.equal(res.err[1], "  - empty [(no .css file found)]: missing unconditional max-width:100% for img, video, iframe");
    assert.match(res.err[2], /^  - partial \[.*p\.css\]: missing unconditional max-width:100% for video, iframe$/);
    assert.equal(res.err.length, 3);
  });
});

test("main defaults scan the real content/themes/static directory and exit code mirrors the findings", () => {
  const out: string[] = []; const err: string[] = []; const exits: number[] = [];
  const spies = { log: console.log, error: console.error };
  console.log = (...a: unknown[]) => { out.push(a.join(" ")); };
  console.error = (...a: unknown[]) => { err.push(a.join(" ")); };
  try { themeMain({ exit: c => { exits.push(c); } }); } finally { Object.assign(console, spies); }
  if (exits.length === 0) assert.match(out[0], /^check:theme-replaced-elements — OK: /);
  else { assert.deepEqual(exits, [1]); assert.match(err[0], /unconstrained replaced element\(s\):$/); }
});
