import assert from "node:assert/strict";
import test from "node:test";

import {
  bodyRecord,
  bodyStringField,
  fileExtension,
  nextAvailableFileName,
  reloadTheme,
  renameThemeFileIfChanged,
} from "../explore";
import type { ContentRouteDeps } from "../../content/deps";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file Direct-import branch coverage for `explore.ts`'s small, pure (or near-pure) helpers.
 * Every other test file in this directory drives these functions indirectly through a real HTTP
 * request, following this codebase's own established convention -- but each function below has at
 * least one branch outcome that either (a) no real HTTP scenario can reach given the ONE call
 * site's own preceding precondition check (verified by reading that call site, not assumed), or
 * (b) is far more directly and honestly exercised as a plain function call than by constructing an
 * elaborate HTTP fixture just to reach it. `export` was added to each of these (previously
 * module-private) functions specifically to make this file possible -- purely additive, no
 * behavior change.
 */

test("fileExtension: a path with no dot after the last slash has no extension", () => {
  // `nextAvailableFileName`'s doc explicitly cross-references this exact rule (dot must fall AFTER
  // the last slash to count as the file's own extension), and `isSourceDirWritableExtension` is the
  // one real caller -- a sourceDir file like `Makefile` or `LICENSE` has no extension at all.
  assert.equal(fileExtension("Makefile"), "");
  assert.equal(fileExtension("src/LICENSE"), "");
});

test("fileExtension: a dotfile/directory-with-a-dot before the last slash still has no extension", () => {
  assert.equal(fileExtension("v1.0/README"), "");
});

test("fileExtension: a real extension is lowercased and returned with its leading dot", () => {
  assert.equal(fileExtension("pages/about.HTML"), ".html");
  assert.equal(fileExtension("styles.css"), ".css");
});

test("nextAvailableFileName: a desired path with no existing collision is returned unchanged", () => {
  // Unreachable through `registerAdminThemeFileCopyRoute` (its own call site checks
  // `existingPaths.has(sourcePath)` and 404s BEFORE ever calling this, so `desiredPath` is always
  // already a member of `existingPaths` in the one real caller) -- exercised directly here instead,
  // proving the general-purpose "no collision" case this exported utility is documented to support.
  const result = nextAvailableFileName({ desiredPath: "pages/new-page.html", existingPaths: new Set(["pages/about.html"]) });
  assert.equal(result, "pages/new-page.html");
});

test("nextAvailableFileName: a colliding path with an extension gets a numeric suffix before the extension", () => {
  const result = nextAvailableFileName({
    desiredPath: "pages/about.html",
    existingPaths: new Set(["pages/about.html", "pages/about-1.html"]),
  });
  assert.equal(result, "pages/about-2.html");
});

test("nextAvailableFileName: a colliding path with NO extension gets a numeric suffix appended directly (no dangling dot)", () => {
  const result = nextAvailableFileName({ desiredPath: "Makefile", existingPaths: new Set(["Makefile"]) });
  assert.equal(result, "Makefile-1");
});

test("bodyRecord: a nullish body coerces to an empty object", () => {
  // Unreachable through any real route: the app's global `express.json()` (app.ts) always
  // defaults `req.body` to `{}` for any request it processes, so `body` is never actually
  // `undefined`/`null` at the one real call sites (bodyStringField, parseThemeFilePutBody).
  assert.deepEqual(bodyRecord(undefined), {});
  assert.deepEqual(bodyRecord(null), {});
});

test("bodyRecord: a real object body passes through unchanged", () => {
  const body = { path: "pages/index.html", content: "x" };
  assert.deepEqual(bodyRecord(body), body);
});

test("bodyStringField: a missing field defaults to the empty string", () => {
  assert.equal(bodyStringField({}, "path"), "");
  assert.equal(bodyStringField(undefined, "path"), "");
});

test("bodyStringField: a present field is coerced to a string", () => {
  assert.equal(bodyStringField({ path: "pages/index.html" }, "path"), "pages/index.html");
});

test("reloadTheme: a themeId with no matching entry in deps.themes is a silent no-op", () => {
  // Every real call site (PUT/reset/copy/rename routes) passes `theme.manifest.id` straight from a
  // `DiscoveredTheme` `findThemeOrRespond` just found in this SAME `deps.themes` array via the
  // identical `t.manifest.id === id` predicate (`findTheme`, `theme.ts`), with no mutation of
  // `deps.themes` in between -- so `deps.themes.findIndex(...)` inside `reloadTheme` can never
  // actually miss for any of them. Exercised directly here instead, proving the guard itself does
  // exactly what its `if (index < 0) return;` implies: nothing, not a throw.
  const original = { manifest: { id: "existing-theme" } } as ContentRouteDeps["themes"][number];
  const deps = { themes: [original] } as unknown as ContentRouteDeps;

  reloadTheme(deps, "does-not-exist-in-themes-array");

  assert.equal(deps.themes.length, 1);
  assert.equal(deps.themes[0], original, "the unrelated existing entry must be untouched, not replaced");
});

test("renameThemeFileIfChanged: a destPath that resolves generated-readonly 409s -- provably unreachable through the real rename ROUTE (destPath always shares sourcePath's own already-editable directory, per this function's own comment), exercised directly by deliberately passing a destPath in a DIFFERENT directory than the route itself would ever construct", () => {
  // `registerAdminThemeFileRenameRoute` only ever builds `destPath` from `sourcePath`'s own
  // directory (`name` may never contain '/', enforced by `validateRenameTargetName` before this
  // function runs) -- so through that route, `destPath`'s write-scope is always identical to
  // `sourcePath`'s already-`editable` one, and this branch can never fire. This test bypasses that
  // route-level guarantee the same way the params `?? ""` tests bypass Express's routing guarantee:
  // call the function directly with a `destPath` in the theme's generated (non-sourceDir) root,
  // proving the guard's own behavior -- a real 409, not a throw or a silent write -- is correct.
  const theme = {
    manifest: {
      id: "compiled-theme",
      build: { source: "compiled", sourceDir: "src" },
    },
  } as unknown as DiscoveredTheme;
  const deps = {} as unknown as ContentRouteDeps;
  const { res, capture } = createCapturingResponse();

  const changed = renameThemeFileIfChanged(
    deps,
    theme,
    { sourcePath: "src/config.json", destPath: "generated-output.json", name: "generated-output.json" },
    new Set(["src/config.json"]),
    res
  );

  assert.equal(changed, false);
  assert.equal(capture.statusCode, 409);
  assert.deepEqual(capture.jsonBody, {
    error:
      "'generated-output.json' is read-only: this file is generated output of a built theme (theme.json build.source: 'compiled'); it is versioned and restored only as one complete release, never edited or reset file-by-file — edit the source under build.sourceDir and rebuild instead",
    code: "GENERATED_READONLY",
  });
});
