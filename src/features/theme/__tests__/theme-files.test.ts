import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isGeneratedThemePath,
  isRecognizedThemeRoot,
  listThemeFiles,
  MAX_THEME_FILE_BYTES,
  readThemeFile,
  resolveThemeFilePath,
  ThemePathError,
  writeThemeFile,
} from "../theme-files";

/**
 * @file Certifies the path containment that the `themes` agent-tool domain's whole safety argument
 * rests on: a broad "read/write any file in ONE theme's folder" capability is only sound while
 * "in one theme's folder" is actually enforced. Every case below is an escape attempt that a naive
 * `resolved.startsWith(themeDir)` check would admit.
 */

/** A themes root laid out exactly like the real one: top-level themes plus engine subfolders. */
function makeThemesRoot(): { root: string; themeDir: string; engineThemeDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-themes-root-"));
  const themeDir = path.join(root, "plain");
  const engineThemeDir = path.join(root, "handlebars", "ledgerish");
  fs.mkdirSync(path.join(themeDir, "templates"), { recursive: true });
  fs.mkdirSync(path.join(engineThemeDir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(themeDir, "theme.json"), "{}", "utf8");
  fs.writeFileSync(path.join(themeDir, "templates", "home.json"), "{}", "utf8");
  return { root, themeDir, engineThemeDir };
}

// ---------------------------------------------------------------------------
// 1. Recognized theme roots — the OUTER containment question.
// ---------------------------------------------------------------------------

test("a direct child of the themes root is a recognized theme root", () => {
  const { root, themeDir } = makeThemesRoot();
  assert.equal(isRecognizedThemeRoot({ themeDir, themesRoot: root }), true);
});

test("a child of a named engine subfolder is a recognized theme root", () => {
  const { root, engineThemeDir } = makeThemesRoot();
  assert.equal(isRecognizedThemeRoot({ themeDir: engineThemeDir, themesRoot: root }), true);
});

test("a folder outside the themes root is NOT a recognized theme root", () => {
  const { root } = makeThemesRoot();
  assert.equal(isRecognizedThemeRoot({ themeDir: "/etc", themesRoot: root }), false);
  assert.equal(isRecognizedThemeRoot({ themeDir: path.join(root, "..", "elsewhere", "x"), themesRoot: root }), false);
});

test("a folder nested too deep under an UNRECOGNIZED subfolder is not a theme root, even inside the themes root", () => {
  const { root } = makeThemesRoot();
  // `themes/templated/x` is fine (templated is a named engine subfolder); `themes/random/x` is not.
  assert.equal(isRecognizedThemeRoot({ themeDir: path.join(root, "templated", "x"), themesRoot: root }), true);
  assert.equal(isRecognizedThemeRoot({ themeDir: path.join(root, "random", "x"), themesRoot: root }), false);
  assert.equal(isRecognizedThemeRoot({ themeDir: path.join(root, "handlebars", "x", "deeper"), themesRoot: root }), false);
});

test("a file operation against a theme folder that is not at a recognized root is refused outright", () => {
  const { root } = makeThemesRoot();
  assert.throws(
    () => resolveThemeFilePath({ themeDir: "/etc", themesRoot: root, relativePath: "passwd" }),
    /not under a recognized theme root/
  );
});

// ---------------------------------------------------------------------------
// 2. Traversal — the INNER containment question.
// ---------------------------------------------------------------------------

test("an ordinary relative path inside the theme folder resolves", () => {
  const { root, themeDir } = makeThemesRoot();
  const resolved = resolveThemeFilePath({ themeDir, themesRoot: root, relativePath: "templates/home.json" });
  assert.equal(resolved, path.join(fs.realpathSync(themeDir), "templates", "home.json"));
});

test("a ../ traversal out of the theme folder is refused", () => {
  const { root, themeDir } = makeThemesRoot();
  for (const attempt of ["../evil.txt", "../../etc/passwd", "templates/../../escaped.txt", "./../../x"]) {
    assert.throws(
      () => resolveThemeFilePath({ themeDir, themesRoot: root, relativePath: attempt }),
      ThemePathError,
      `expected '${attempt}' to be refused`
    );
  }
});

test("the specific ../../themes/evil shape a string-prefix check would admit is refused", () => {
  // Naive containment sometimes compares against the themes ROOT rather than the
  // theme folder, which admits any sibling theme. This must not.
  const { root, themeDir } = makeThemesRoot();
  assert.throws(
    () => resolveThemeFilePath({ themeDir, themesRoot: root, relativePath: "../handlebars/ledgerish/theme.json" }),
    /resolves outside the theme folder/
  );
});

test("a SIBLING folder whose name merely extends the theme folder's is refused (the classic startsWith defect)", () => {
  const { root, themeDir } = makeThemesRoot();
  // `<root>/plain-evil` starts with `<root>/plain` as a string, but is not inside it.
  fs.mkdirSync(path.join(root, "plain-evil"), { recursive: true });
  assert.throws(
    () => resolveThemeFilePath({ themeDir, themesRoot: root, relativePath: "../plain-evil/x.txt" }),
    /resolves outside the theme folder/
  );
});

test("an absolute path is refused even when it points inside the theme folder", () => {
  const { root, themeDir } = makeThemesRoot();
  assert.throws(
    () => resolveThemeFilePath({ themeDir, themesRoot: root, relativePath: path.join(themeDir, "theme.json") }),
    /must be relative to the theme folder/
  );
  assert.throws(
    () => resolveThemeFilePath({ themeDir, themesRoot: root, relativePath: "/etc/passwd" }),
    /must be relative/
  );
});

test("an empty path and a NUL-byte path are refused", () => {
  const { root, themeDir } = makeThemesRoot();
  assert.throws(() => resolveThemeFilePath({ themeDir, themesRoot: root, relativePath: "" }), /path is required/);
  assert.throws(() => resolveThemeFilePath({ themeDir, themesRoot: root, relativePath: "a\0b" }), /NUL byte/);
});

// ---------------------------------------------------------------------------
// 3. Symlink escape — lexically clean, still an escape. The case that makes a
//    purely string-based containment check insufficient no matter how careful.
// ---------------------------------------------------------------------------

test("a symlinked DIRECTORY inside the theme folder cannot be written through", () => {
  const { root, themeDir } = makeThemesRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-outside-"));
  fs.symlinkSync(outside, path.join(themeDir, "escape"));

  // `escape/pwned.txt` is lexically inside the theme folder — every prefix/relative
  // check passes — but realpath lands in `outside`.
  assert.throws(
    () => resolveThemeFilePath({ themeDir, themesRoot: root, relativePath: "escape/pwned.txt" }),
    /through a symbolic link/
  );
  assert.equal(fs.existsSync(path.join(outside, "pwned.txt")), false);
});

test("a symlinked FILE inside the theme folder cannot be read through", () => {
  const { root, themeDir } = makeThemesRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-outside-"));
  fs.writeFileSync(path.join(outside, "secret.txt"), "TOP SECRET", "utf8");
  fs.symlinkSync(path.join(outside, "secret.txt"), path.join(themeDir, "innocent.txt"));

  assert.throws(
    () => readThemeFile({ themeDir, themesRoot: root, relativePath: "innocent.txt" }),
    /through a symbolic link/
  );
});

test("listThemeFiles does not follow or report symlinks out of the theme folder", () => {
  const { root, themeDir } = makeThemesRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-outside-"));
  fs.writeFileSync(path.join(outside, "secret.txt"), "TOP SECRET", "utf8");
  fs.symlinkSync(outside, path.join(themeDir, "escape"));

  const files = listThemeFiles({ themeDir, themesRoot: root });
  assert.deepEqual(files, ["templates/home.json", "theme.json"]);
  assert.equal(files.some((f) => f.includes("secret")), false);
});

// ---------------------------------------------------------------------------
// 4. Ordinary read/write/list behavior.
// ---------------------------------------------------------------------------

test("listThemeFiles returns every regular file as a sorted, forward-slash relative path", () => {
  const { root, themeDir } = makeThemesRoot();
  fs.writeFileSync(path.join(themeDir, "styles.css"), "body{}", "utf8");
  assert.deepEqual(listThemeFiles({ themeDir, themesRoot: root }), ["styles.css", "templates/home.json", "theme.json"]);
});

test("writeThemeFile creates intermediate directories inside the theme folder and readThemeFile reads it back", () => {
  const { root, themeDir } = makeThemesRoot();
  writeThemeFile({ themeDir, themesRoot: root, relativePath: "templates/nested/deep.liquid", content: "{{ x }}" });
  assert.equal(readThemeFile({ themeDir, themesRoot: root, relativePath: "templates/nested/deep.liquid" }), "{{ x }}");
});

test("writeThemeFile overwrites an existing file rather than appending", () => {
  const { root, themeDir } = makeThemesRoot();
  writeThemeFile({ themeDir, themesRoot: root, relativePath: "theme.json", content: '{"id":"plain"}' });
  assert.equal(readThemeFile({ themeDir, themesRoot: root, relativePath: "theme.json" }), '{"id":"plain"}');
});

test("reading a missing file, or a directory, is a clear refusal rather than a crash", () => {
  const { root, themeDir } = makeThemesRoot();
  assert.throws(() => readThemeFile({ themeDir, themesRoot: root, relativePath: "nope.txt" }), /does not exist/);
  assert.throws(() => readThemeFile({ themeDir, themesRoot: root, relativePath: "templates" }), /not a regular file/);
});

test("an oversized write is refused", () => {
  const { root, themeDir } = makeThemesRoot();
  assert.throws(
    () => writeThemeFile({ themeDir, themesRoot: root, relativePath: "big.css", content: "x".repeat(MAX_THEME_FILE_BYTES + 1) }),
    /exceeds the .* per-file limit/
  );
  assert.equal(fs.existsSync(path.join(themeDir, "big.css")), false);
});

/**
 * `isGeneratedThemePath` — the single shared "is this build-preview.mjs output" check `explore.ts`'s
 * file list and `marketplace.ts`'s download-copy filter both delegate to (2026-08-11, replacing two
 * independent copies of this exact predicate). The one edge case worth pinning directly: a sibling
 * merely PREFIXED with the generated dir's own name (`preview-notes/`) must NOT match — only the exact
 * `preview` segment or a path nested under it.
 */
test("the generated directory itself is matched", () => {
  assert.equal(isGeneratedThemePath("preview"), true);
});

test("a file nested inside the generated directory is matched", () => {
  assert.equal(isGeneratedThemePath("preview/dark/js/main.js"), true);
});

test("a sibling directory merely PREFIXED with the generated dir's name is NOT matched", () => {
  assert.equal(isGeneratedThemePath("preview-notes/todo.md"), false);
});

test("a backslash-separated (Windows-shaped) relative path is normalized before matching", () => {
  assert.equal(isGeneratedThemePath("preview\\dark\\index.html"), true);
});

test("an ordinary theme file is NOT matched", () => {
  assert.equal(isGeneratedThemePath("pages/about.html"), false);
});
