import assert from "node:assert/strict";
import test from "node:test";

import { resolveThemeFileWriteScope } from "../theme-files.js";

/**
 * @file ADR-020 §5 (2026-08-12) — `resolveThemeFileWriteScope`'s pure policy: an authored theme is
 * always editable per-file (unchanged); a built theme's `theme.json` and its declared `build.sourceDir`
 * stay editable, everything else in its generated tree is read-only. Wired into `theme_write_file`
 * (`tool-registrations.ts`) — the AI-authorability half of the split — see
 * `theme-write-file-built-gate.test.ts` for that integration.
 */

const AUTHORED = {} as { build?: { source: "authored" | "compiled"; sourceDir?: string } };
const COMPILED = { build: { source: "compiled" as const, sourceDir: "src" } };
const COMPILED_NO_SOURCE_DIR = { build: { source: "compiled" as const } };

test("an authored theme (no build field) is always editable, for any path", () => {
  for (const relativePath of ["pages/index.html", "css/styles.css", "theme.json", "src/whatever.tsx"]) {
    assert.deepEqual(resolveThemeFileWriteScope({ manifest: AUTHORED, relativePath }), { kind: "editable" });
  }
});

test("a compiled theme's theme.json is always editable", () => {
  assert.deepEqual(resolveThemeFileWriteScope({ manifest: COMPILED, relativePath: "theme.json" }), {
    kind: "editable",
  });
});

test("a compiled theme's files under its declared sourceDir are editable, at any depth", () => {
  for (const relativePath of ["src/Header.tsx", "src/components/Nav.tsx", "src/deeply/nested/file.tsx"]) {
    assert.deepEqual(resolveThemeFileWriteScope({ manifest: COMPILED, relativePath }), { kind: "editable" });
  }
});

test("a compiled theme's generated output (outside sourceDir) is generated-readonly", () => {
  for (const relativePath of ["pages/index.html", "css/styles.css", "js/main.js"]) {
    const scope = resolveThemeFileWriteScope({ manifest: COMPILED, relativePath });
    assert.equal(scope.kind, "generated-readonly");
    if (scope.kind === "generated-readonly") {
      assert.ok(scope.reason.includes("versioned and restored only as one complete release"));
    }
  }
});

test("sourceDir is matched by exact segment, not by string prefix — a 'src-legacy' sibling is NOT treated as source", () => {
  const scope = resolveThemeFileWriteScope({ manifest: COMPILED, relativePath: "src-legacy/file.tsx" });
  assert.equal(scope.kind, "generated-readonly");
});

test("a backslash-separated path (Windows-style input) normalizes the same as a forward-slash one", () => {
  assert.deepEqual(resolveThemeFileWriteScope({ manifest: COMPILED, relativePath: "src\\Header.tsx" }), {
    kind: "editable",
  });
  const scope = resolveThemeFileWriteScope({ manifest: COMPILED, relativePath: "pages\\index.html" });
  assert.equal(scope.kind, "generated-readonly");
});

test("a compiled theme declaring no sourceDir has no editable region beyond theme.json — fails closed, no guessed convention", () => {
  assert.deepEqual(
    resolveThemeFileWriteScope({ manifest: COMPILED_NO_SOURCE_DIR, relativePath: "theme.json" }),
    { kind: "editable" }
  );
  const scope = resolveThemeFileWriteScope({ manifest: COMPILED_NO_SOURCE_DIR, relativePath: "src/Header.tsx" });
  assert.equal(scope.kind, "generated-readonly");
});
