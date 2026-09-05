import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  copyThemeFile,
  deleteThemeFile,
  isGeneratedThemePath,
  isRecognizedThemeRoot,
  isSourceDirGeneratedConflict,
  listThemeFiles,
  MAX_THEME_FILE_BYTES,
  readThemeFile,
  resolveThemeFilePath,
  ThemePathError,
  writeThemeFile,
} from "../theme-files.js";

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

test("readThemeFile raises ThemePathError (never a raw ELOOP) for a CIRCULAR symlink (a -> b -> a) as the target itself", () => {
  // `resolveThemeFilePath`'s own containment check does not resolve THIS case: its walk-up to find an
  // existing ancestor stops at the theme folder itself, because a self-referential symlink never
  // "exists" by `existsSync`'s own ELOOP-swallowing definition — so it never realpaths the cycle and
  // never throws. The bare `statSync(target, {throwIfNoEntry:false})` that used to run right after it
  // does follow the link, and `throwIfNoEntry:false` only suppresses ENOENT, not ELOOP — so the raw
  // filesystem error escaped this function's own documented "throws only ThemePathError" contract.
  const { root, themeDir } = makeThemesRoot();
  const a = path.join(themeDir, "a");
  const b = path.join(themeDir, "b");
  fs.symlinkSync(b, a);
  fs.symlinkSync(a, b);

  try {
    assert.throws(() => readThemeFile({ themeDir, themesRoot: root, relativePath: "a" }), ThemePathError);
  } finally {
    fs.unlinkSync(a);
    fs.unlinkSync(b);
  }
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

test("listThemeFiles returns cleanly (never throws ELOOP) when the theme folder contains a CIRCULAR symlink (a -> b -> a)", () => {
  // `statSync` (not `lstatSync`) follows a symlink to build the entry's stat, and a symlink cycle
  // makes it throw `ELOOP` — straight out of this function's own "throws only ThemePathError"
  // contract (its own JSDoc). A theme installed from a fixture/package that preserves a circular
  // symlink (Node's `cpSync` default is `dereference: false`, i.e. it preserves symlinks as-is) hits
  // this on the very next listing — an agent-tool call or the Explore admin route, both real callers
  // of `listThemeFiles` (`tool-registrations.ts`, `server/inbound/admin-http/routes/themes/explore.ts`).
  const { root, themeDir } = makeThemesRoot();
  const a = path.join(themeDir, "a");
  const b = path.join(themeDir, "b");
  fs.symlinkSync(b, a);
  fs.symlinkSync(a, b);

  try {
    const files = listThemeFiles({ themeDir, themesRoot: root });
    assert.deepEqual(files, ["templates/home.json", "theme.json"]);
    assert.equal(files.some((f) => f === "a" || f === "b"), false, "a circular symlink must be neither descended nor reported as a file");
  } finally {
    fs.unlinkSync(a);
    fs.unlinkSync(b);
  }
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

test("writeThemeFile replaces an existing target via rename rather than truncating it in place, and leaves no temp file behind", () => {
  // `theme.json` is the one file `loadTheme()` must parse whole, so a plain truncate-in-place
  // write (`writeFileSync(target, …, "w")`) is a live corruption risk: a crash or a concurrent
  // reader mid-write can observe an empty or partial file, breaking the WHOLE theme rather than
  // one field. A write-to-temp-then-rename replaces the directory entry atomically instead — any
  // reader that already has `target` open by descriptor keeps reading the old, complete inode,
  // and any reader opening `target` by path afterward sees either the fully-old or fully-new
  // content, never a partial write. That is verifiable without a flaky timing/concurrency test:
  // renaming a new file over `target` gives `target`'s path a NEW inode; truncating in place
  // keeps the SAME inode. So the inode identity across the write is a deterministic proxy for
  // "was this replaced by rename" vs. "was this truncated in place".
  const { root, themeDir } = makeThemesRoot();
  const targetPath = path.join(themeDir, "theme.json");
  const inoBefore = fs.statSync(targetPath).ino;

  writeThemeFile({ themeDir, themesRoot: root, relativePath: "theme.json", content: '{"id":"plain"}' });

  const inoAfter = fs.statSync(targetPath).ino;
  assert.notEqual(
    inoAfter,
    inoBefore,
    "expected writeThemeFile to replace the target via rename (new inode), not truncate it in place (same inode)"
  );

  const leftovers = fs.readdirSync(themeDir).filter((name) => name !== "theme.json" && name !== "templates");
  assert.deepEqual(leftovers, [], `expected no temp file left behind in the theme folder, found: ${leftovers.join(", ")}`);
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

/**
 * `GENERATED_THEME_ROOT_FILES` (Milestone 5, 2026-08-18) — the single-file sibling of
 * `GENERATED_THEME_DIRS`: `index.html`, `static-portability-index.ts`'s generated portability
 * snapshot. Same exact-segment matching discipline as the directory case above, pinned separately
 * since it is a NEW branch in `isGeneratedThemePath`, not a data-only addition to the existing one.
 */
test("the generated root file itself is matched", () => {
  assert.equal(isGeneratedThemePath("index.html"), true);
});

test("a similarly-named sibling file is NOT matched", () => {
  assert.equal(isGeneratedThemePath("index-notes.html"), false);
});

test("the authored source page the generated root file is derived from is NOT matched", () => {
  assert.equal(isGeneratedThemePath("render/pages/index.html"), false);
});

/**
 * {@link isSourceDirGeneratedConflict} — the install-time sibling of {@link isGeneratedThemePath}
 * (2026-08-17): `loadTheme`'s cross-field gate uses this to refuse a `build.sourceDir` that names,
 * nests inside, or is an ancestor of a {@link GENERATED_THEME_DIRS} entry, before any write route is
 * ever reached. See its own doc for why the three shapes below are the ones that matter.
 */
test("sourceDir naming a generated directory exactly is a conflict", () => {
  assert.equal(isSourceDirGeneratedConflict("preview"), true);
});

test("sourceDir nested inside a generated directory is a conflict", () => {
  assert.equal(isSourceDirGeneratedConflict("preview/src"), true);
});

test("sourceDir naming the theme root ('.') is a conflict — it would contain every generated directory", () => {
  assert.equal(isSourceDirGeneratedConflict("."), true);
});

test("sourceDir merely PREFIXED with a generated dir's name is NOT a conflict", () => {
  assert.equal(isSourceDirGeneratedConflict("preview-notes"), false);
});

test("an ordinary sourceDir unrelated to any generated directory is NOT a conflict", () => {
  assert.equal(isSourceDirGeneratedConflict("src"), false);
});

test("a backslash-separated (Windows-shaped) sourceDir is normalized before matching", () => {
  assert.equal(isSourceDirGeneratedConflict("preview\\src"), true);
});

/**
 * `copyThemeFile` never silently overwrites an existing destination — the invariant behind both
 * `resolveCopyOrRenameTargets`' own `existsSync(dest)` pre-check AND `copyFileSync`'s
 * `COPYFILE_EXCL` flag inside `copyThemeFile` itself. Negatively verified as a PAIR, not just
 * asserted from the doc comments: with only the `existsSync` pre-check removed, `COPYFILE_EXCL`
 * alone still catches this (an `EEXIST` from the OS); with only `COPYFILE_EXCL` removed, the
 * pre-check alone still catches it. The two are genuine defense-in-depth for different scenarios —
 * the pre-check is what protects ordinary sequential calls (this test's own shape); `COPYFILE_EXCL`
 * is the narrower backstop for a TRUE OS-level race the pre-check's own check-then-act shape cannot
 * close (two separate PROCESSES, or a future async refactor with a real `await` between the check
 * and the write) — a scenario this single-process, fully-synchronous test cannot itself force open,
 * so it is not separately exercised here; see `theme-files.ts`'s own `COPYFILE_EXCL` comment.
 *
 * Deliberately exercised here at the `copyThemeFile` level with an explicit, IDENTICAL `destPath` on
 * both calls, not via two concurrent HTTP requests through the copy ROUTE (which is what an earlier
 * version of this coverage tried). That route computes its own auto-suffixed `destPath` via a fully
 * synchronous `listThemeFiles` → `nextAvailableFileName` → `copyThemeFile` chain with no `await`
 * inside it, and Node's run-to-completion semantics mean one request's ENTIRE chain finishes before a
 * second request's continuation ever runs — so two requests hitting that route can never actually
 * observe each other mid-computation and land on the same computed name; each just gets a correctly
 * bumped `-1`, `-2`, … suffix in turn (see
 * `theme-file-copy-rename-route.integration.test.ts`'s own "two concurrent copies" test and its
 * comment for that confirmed, deterministic behavior). This test instead pins the lower-level
 * INVARIANT `copyThemeFile` itself guarantees whenever two callers DO land on the same destination —
 * true regardless of how they got there — by forcing exactly that with an explicit shared `destPath`.
 */
test("copyThemeFile refuses to silently overwrite an existing destination", () => {
  const { root, themeDir } = makeThemesRoot();
  const first = copyThemeFile({ themeDir, themesRoot: root, sourcePath: "theme.json", destPath: "theme-copy.json" });
  assert.equal(fs.readFileSync(first, "utf8"), "{}");

  // A second copy onto the SAME destination, now that the source has since changed — if this
  // silently "succeeded" by overwriting, the destination would pick up "poisoned" below instead of
  // staying exactly what the first, legitimate copy wrote.
  fs.writeFileSync(path.join(themeDir, "theme.json"), "poisoned", "utf8");
  assert.throws(
    () => copyThemeFile({ themeDir, themesRoot: root, sourcePath: "theme.json", destPath: "theme-copy.json" }),
    /already exists/
  );

  assert.equal(fs.readFileSync(first, "utf8"), "{}", "the first copy's bytes must survive the refused second copy untouched");
});

// ---------------------------------------------------------------------------
// deleteThemeFile — the third mutation `theme-files.ts` exposes over an existing file (alongside
// copy/rename), added 2026-08-29 for the Explore screen's per-file ⋮ menu Delete item. Eligibility
// (required files, generated trees, `IDENTITY_LOCKED_GROUPS`) is decided one layer up, in
// `explore.ts`'s `validateFileIdentityChange` — this function only enforces containment, same as
// every other write here.
// ---------------------------------------------------------------------------

test("deleteThemeFile removes an existing file from disk", () => {
  const { root, themeDir } = makeThemesRoot();
  const target = path.join(themeDir, "templates", "home.json");
  assert.equal(fs.existsSync(target), true, "sanity: the fixture file exists before deleting it");

  deleteThemeFile({ themeDir, themesRoot: root, relativePath: "templates/home.json" });

  assert.equal(fs.existsSync(target), false);
});

test("deleting a file that does not exist is refused, not a silent no-op", () => {
  const { root, themeDir } = makeThemesRoot();
  assert.throws(
    () => deleteThemeFile({ themeDir, themesRoot: root, relativePath: "templates/nope.json" }),
    /does not exist/
  );
});

test("deleting a directory through this path is refused, not attempted", () => {
  const { root, themeDir } = makeThemesRoot();
  assert.throws(
    () => deleteThemeFile({ themeDir, themesRoot: root, relativePath: "templates" }),
    /not a regular file/
  );
  assert.equal(fs.existsSync(path.join(themeDir, "templates")), true, "the refused delete must leave the directory in place");
});

test("deleteThemeFile reuses resolveThemeFilePath's containment — a traversal escape is refused the same way every other write here is", () => {
  const { root, themeDir } = makeThemesRoot();
  assert.throws(
    () => deleteThemeFile({ themeDir, themesRoot: root, relativePath: "../../../../etc/passwd" }),
    /resolves outside the theme folder/
  );
});

// ---------------------------------------------------------------------------
// Circular-symlink ELOOP conversion — the same class of bug `readThemeFile` was fixed for
// (statOrThemePathError, see its own doc), swept across the file's other bare `statSync` call sites.
// ---------------------------------------------------------------------------

test("writeThemeFile raises ThemePathError (never a raw ELOOP) for a CIRCULAR symlink (a -> b -> a) as the write target", () => {
  // Mirrors readThemeFile's own circular-symlink test: `resolveThemeFilePath` returns `target`
  // without throwing (its ancestor walk never reaches a self-referential symlink — see that
  // function's own doc), so `writeThemeFile`'s first post-resolve `statSync` call is what must
  // convert the ELOOP.
  const { root, themeDir } = makeThemesRoot();
  const a = path.join(themeDir, "a");
  const b = path.join(themeDir, "b");
  fs.symlinkSync(b, a);
  fs.symlinkSync(a, b);

  try {
    assert.throws(
      () => writeThemeFile({ themeDir, themesRoot: root, relativePath: "a", content: "x" }),
      ThemePathError
    );
  } finally {
    fs.unlinkSync(a);
    fs.unlinkSync(b);
  }
});

test("deleteThemeFile raises ThemePathError (never a raw ELOOP) for a CIRCULAR symlink (a -> b -> a) as the delete target", () => {
  const { root, themeDir } = makeThemesRoot();
  const a = path.join(themeDir, "a");
  const b = path.join(themeDir, "b");
  fs.symlinkSync(b, a);
  fs.symlinkSync(a, b);

  try {
    assert.throws(() => deleteThemeFile({ themeDir, themesRoot: root, relativePath: "a" }), ThemePathError);
  } finally {
    fs.unlinkSync(a);
    fs.unlinkSync(b);
  }
});

test("copyThemeFile raises ThemePathError (never a raw ELOOP) for a CIRCULAR symlink (a -> b -> a) as the copy SOURCE", () => {
  // Exercises resolveCopyOrRenameTargets' source-side statSync (shared by copyThemeFile and
  // renameThemeFile) rather than duplicating the same case again for renameThemeFile — both call
  // through the identical shared helper.
  const { root, themeDir } = makeThemesRoot();
  const a = path.join(themeDir, "a");
  const b = path.join(themeDir, "b");
  fs.symlinkSync(b, a);
  fs.symlinkSync(a, b);

  try {
    assert.throws(
      () => copyThemeFile({ themeDir, themesRoot: root, sourcePath: "a", destPath: "a-copy" }),
      ThemePathError
    );
  } finally {
    fs.unlinkSync(a);
    fs.unlinkSync(b);
  }
});
