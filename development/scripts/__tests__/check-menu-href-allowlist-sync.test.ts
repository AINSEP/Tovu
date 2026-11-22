import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

import {
  ACCEPTED_HREFS,
  REJECTED_HREFS,
  buildSharedTable,
  compareCheckers,
  findLocalHrefAllowlists,
  jiniHrefCheckers,
  runMenuHrefAllowlistSync,
  type HrefChecker,
} from "../check-menu-href-allowlist-sync.js";

/**
 * @file Direct coverage for `check-menu-href-allowlist-sync.ts` (the gate on the single href standard,
 * Jini's `isAllowedHref`/`toAllowedHref`, plus the scan that fails when a local `safeHref` comes back)
 * and a live regression assertion against the real, current Jini build and this checkout's source.
 *
 * See that script's own file header for the full "what this catches and why" writeup. This file
 * additionally proves the gate mechanism ITSELF can fail: the synthetic-mismatch and local-copy tests
 * below, and the CLI exit-code tests.
 */

function withTempRoot<T>(body: (root: string) => T): T {
  const root = mkdtempSync(path.join(tmpdir(), "href-gate-"));
  try {
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeSource({ root, relative, text }: { root: string; relative: string; text: string }): void {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

// ---------------------------------------------------------------------------
// compareCheckers
// ---------------------------------------------------------------------------

test("compareCheckers: no mismatches when every checker agrees with the expected outcome", () => {
  const alwaysAccept: HrefChecker = () => true;
  const table = [{ href: "/x", expectedAccept: true }];
  assert.deepEqual(compareCheckers({ a: alwaysAccept, b: alwaysAccept }, table), []);
});

/**
 * Synthetic-mismatch proof: the permanent, always-runnable proof that the comparator flags a divergent
 * implementation by name, without needing a real mutation of Jini's source plus a rebuild.
 */
test("compareCheckers: SYNTHETIC MISMATCH — a deliberately-wrong checker is caught and named by the comparator", () => {
  const correct: HrefChecker = (href) => href.startsWith("/");
  const buggy: HrefChecker = (href) => href.startsWith("/") || href.startsWith("javascript:"); // the exact regression class this gate exists to catch
  const table = [
    { href: "/ok", expectedAccept: true },
    { href: "javascript:alert(1)", expectedAccept: false },
  ];

  const mismatches = compareCheckers({ correct, buggy }, table);

  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]!.href, "javascript:alert(1)");
  assert.equal(mismatches[0]!.expectedAccept, false);
  assert.deepEqual(mismatches[0]!.results, { correct: false, buggy: true });
});

test("buildSharedTable: every REJECTED_HREFS row is expectedAccept:false and every ACCEPTED_HREFS row is expectedAccept:true", () => {
  const table = buildSharedTable();
  // Independent literals pin the bypass classes the CLI must continue exercising.
  for (const href of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)",
    "\u0001javascript:alert(1)", "\u0000javascript:alert(1)", "java\tscript:alert(1)",
    "java\nscript:alert(1)", "java\rscript:alert(1)", "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)", "//evil.example", "/\\evil.example", "/\t/evil.example",
    "//safehref.invalid/x", "//tovu-safehref.invalid/x", "//tovu-safehref.invalid:443/x", "//tovu-safehref.invalid:80/x"]) {
    assert.ok(REJECTED_HREFS.includes(href), `missing dangerous href class: ${JSON.stringify(href)}`);
  }
  assert.equal(table.length, REJECTED_HREFS.length + ACCEPTED_HREFS.length);
  for (const href of REJECTED_HREFS) {
    assert.ok(table.some((row) => row.href === href && row.expectedAccept === false));
  }
  for (const href of ACCEPTED_HREFS) {
    assert.ok(table.some((row) => row.href === href && row.expectedAccept === true));
  }
});

// ---------------------------------------------------------------------------
// The real Jini entry points
// ---------------------------------------------------------------------------

test("jiniHrefCheckers: both entry points of the standard are exercised, by name", () => {
  const checkers = jiniHrefCheckers();
  assert.deepEqual(Object.keys(checkers).sort(), ["jini:isAllowedHref", "jini:toAllowedHref"]);
  for (const checker of Object.values(checkers)) {
    assert.equal(checker("/quickstart"), true);
    assert.equal(checker("javascript:alert(1)"), false);
    assert.equal(checker("//tovu-safehref.invalid/x"), false);
  }
});

// ---------------------------------------------------------------------------
// findLocalHrefAllowlists
// ---------------------------------------------------------------------------

test("findLocalHrefAllowlists: finds a function, const, let and var declaration of safeHref with its line", () => {
  withTempRoot((root) => {
    writeSource({ root, relative: "apps/website/src/a.ts", text: "const x = 1;\nexport function safeHref(v: string) { return v; }\n" });
    writeSource({ root, relative: "apps/admin/src/b.tsx", text: "const safeHref = (v: string) => v;\n" });
    writeSource({ root, relative: "packages/p/src/c.ts", text: "let safeHref: (v: string) => string;\n" });
    writeSource({ root, relative: "packages/p/src/d.ts", text: "var safeHref = null;\n" });
    const found = findLocalHrefAllowlists({ root }).map((copy) => `${copy.file}:${copy.line}`).sort();
    assert.deepEqual(found, [
      path.join("apps/admin/src/b.tsx") + ":1",
      path.join("apps/website/src/a.ts") + ":2",
      path.join("packages/p/src/c.ts") + ":1",
      path.join("packages/p/src/d.ts") + ":1",
    ]);
  });
});

test("findLocalHrefAllowlists: an import, a mention, a test file, node_modules and a missing tree are not copies", () => {
  withTempRoot((root) => {
    writeSource({ root, relative: "apps/website/src/import.ts", text: 'import { safeHref } from "@jini-ai/cookie-consent/render";\nsafeHref(x);\n// function safeHref is gone\n' });
    writeSource({ root, relative: "apps/website/src/__tests__/t.ts", text: "function safeHref() {}\n" });
    writeSource({ root, relative: "apps/website/src/x.test.ts", text: "function safeHref() {}\n" });
    writeSource({ root, relative: "apps/website/node_modules/m/index.ts", text: "function safeHref() {}\n" });
    writeSource({ root, relative: "apps/website/src/readme.md", text: "function safeHref() {}\n" });
    assert.deepEqual(findLocalHrefAllowlists({ root }), []);
  });
  withTempRoot((root) => assert.deepEqual(findLocalHrefAllowlists({ root }), []));
});

// ---------------------------------------------------------------------------
// Live: the real gate, today, on this checkout
// ---------------------------------------------------------------------------

test("live: the Jini standard passes every table row and this checkout declares no local safeHref", () => {
  const { mismatches, localCopies } = runMenuHrefAllowlistSync();
  assert.deepEqual(mismatches, [], `the Jini href standard disagrees with the table: ${JSON.stringify(mismatches)}`);
  assert.deepEqual(localCopies, [], `a local safeHref came back: ${JSON.stringify(localCopies)}`);
});

// ---------------------------------------------------------------------------
// CLI exit codes
// ---------------------------------------------------------------------------

const SCRIPT = path.resolve(import.meta.dirname, "../check-menu-href-allowlist-sync.ts");

function runCli({ root }: { root: string }): ReturnType<typeof spawnSync<string>> {
  return spawnSync(process.execPath, ["--import", "tsx", SCRIPT, "--root", root], { encoding: "utf8", timeout: 30_000 });
}

test("CLI exits 0 and says ok on a tree with no local copy", () => {
  withTempRoot((root) => {
    const result = runCli({ root });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, / — ok — jini:isAllowedHref and jini:toAllowedHref agree on all \d+ table rows and no local safeHref exists/);
  });
});

test("CLI exits 1 and names the file when a local safeHref comes back", () => {
  withTempRoot((root) => {
    writeSource({ root, relative: "apps/website/src/platform/html/safe-url.ts", text: "export function safeHref() {}\n" });
    const result = runCli({ root });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stdout);
    assert.doesNotMatch(result.stdout, / — ok — /);
    assert.match(result.stderr, /apps\/website\/src\/platform\/html\/safe-url\.ts:1 declares its own safeHref/);
    assert.match(result.stderr, /a local safeHref is a second href standard/);
  });
});

test("CLI refuses --root with no value instead of scanning the default tree", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, "--root"], { encoding: "utf8", timeout: 30_000 });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--root needs a directory/);
});
