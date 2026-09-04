import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  ACCEPTED_HREFS,
  REJECTED_HREFS,
  buildSharedTable,
  compareCheckers,
  extractBalancedBraces,
  extractSafeHrefDeclaration,
  loadHrefChecker,
  runMenuHrefAllowlistSync,
  type HrefChecker,
} from "../check-menu-href-allowlist-sync.js";

/**
 * @file Direct coverage for `check-menu-href-allowlist-sync.ts` (the cross-repo behavioral-equivalence
 * gate between Jini's `isAllowedHref` and Tovu's two `safeHref` render-time copies) plus a live
 * regression assertion against the real, current source of all three.
 *
 * See that script's own file header for the full "what this catches and why" writeup. This test file
 * additionally proves the gate mechanism ITSELF can fail (`"synthetic mismatch"` test below) — a
 * permanent, always-runnable companion to the one-off three-way RED/GREEN/RED proof captured in the
 * fix's own handoff report (which mutated the real Jini source, rebuilt, and re-ran the real script;
 * not repeated here as a live mutation because that would require a Jini rebuild inside this repo's
 * own test run, which this test suite has no business triggering).
 */

// ---------------------------------------------------------------------------
// extractBalancedBraces
// ---------------------------------------------------------------------------

test("extractBalancedBraces: a flat block with no nesting", () => {
  const source = "prefix { a; b; } suffix";
  const result = extractBalancedBraces(source, source.indexOf("{"));
  assert.equal(result, "{ a; b; }");
});

test("extractBalancedBraces: nested braces (if/try inside the outer block) do not truncate early", () => {
  const source = 'function f() { if (x) { try { y(); } catch { z(); } } return 1; } // trailing';
  const openIndex = source.indexOf("{");
  const result = extractBalancedBraces(source, openIndex);
  assert.equal(result, "{ if (x) { try { y(); } catch { z(); } } return 1; }");
});

test("extractBalancedBraces: throws when the index does not point at '{'", () => {
  assert.throws(() => extractBalancedBraces("abc", 0), /is not '\{'/);
});

test("extractBalancedBraces: throws on unbalanced input rather than returning a truncated slice", () => {
  assert.throws(() => extractBalancedBraces("{ a; { b; }", 0), /no matching closing brace/);
});

// ---------------------------------------------------------------------------
// extractSafeHrefDeclaration
// ---------------------------------------------------------------------------

const FIXTURE_SOURCE = `
import type { JsonValue } from "somewhere";

const SAFE_HREF_RESOLUTION_BASE = "http://tovu-safehref.invalid/";
const SAFE_HREF_RESOLUTION_ORIGIN = new URL(SAFE_HREF_RESOLUTION_BASE).origin;

function safeHref(value: string): string {
  if (value.startsWith("#")) return value;
  return "#";
}

function unrelated() {}
`;

test("extractSafeHrefDeclaration: pulls the const pair and the whole function, and the result is importable JS/TS", () => {
  const declaration = extractSafeHrefDeclaration(FIXTURE_SOURCE, "fixture.ts");
  assert.match(declaration, /const SAFE_HREF_RESOLUTION_BASE/);
  assert.match(declaration, /const SAFE_HREF_RESOLUTION_ORIGIN/);
  assert.match(declaration, /function safeHref\(value: string\): string \{/);
  assert.match(declaration, /export \{ safeHref \};/);
  assert.doesNotMatch(declaration, /unrelated/, "must not pull in an unrelated sibling function");
});

test("extractSafeHrefDeclaration: throws (not a silent empty result) when the const pair is missing", () => {
  const source = 'function safeHref(value: string): string { return "#"; }';
  assert.throws(() => extractSafeHrefDeclaration(source, "no-consts.ts"), /could not find the SAFE_HREF_RESOLUTION_BASE\/ORIGIN/);
});

test("extractSafeHrefDeclaration: throws when 'function safeHref(' is missing entirely", () => {
  const source = `
const SAFE_HREF_RESOLUTION_BASE = "http://tovu-safehref.invalid/";
const SAFE_HREF_RESOLUTION_ORIGIN = new URL(SAFE_HREF_RESOLUTION_BASE).origin;
function somethingElse() {}
`;
  assert.throws(() => extractSafeHrefDeclaration(source, "no-fn.ts"), /could not find 'function safeHref/);
});

// ---------------------------------------------------------------------------
// compareCheckers
// ---------------------------------------------------------------------------

test("compareCheckers: no mismatches when every checker agrees with the expected outcome", () => {
  const alwaysAccept: HrefChecker = () => true;
  const table = [{ href: "/x", expectedAccept: true }];
  assert.deepEqual(compareCheckers({ a: alwaysAccept, b: alwaysAccept }, table), []);
});

/**
 * Synthetic-mismatch proof: the permanent, always-runnable companion to the fix's own live RED-2
 * three-way proof (which mutated the real Jini source and reran the real CLI). Proves the comparator
 * itself flags a divergent implementation by name, without needing a real file mutation + rebuild.
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
  assert.equal(table.length, REJECTED_HREFS.length + ACCEPTED_HREFS.length);
  for (const href of REJECTED_HREFS) {
    assert.ok(table.some((row) => row.href === href && row.expectedAccept === false));
  }
  for (const href of ACCEPTED_HREFS) {
    assert.ok(table.some((row) => row.href === href && row.expectedAccept === true));
  }
});

// ---------------------------------------------------------------------------
// loadHrefChecker — exercises the real extraction + throwaway-file + dynamic-import path against the
// real render.ts, not a fixture, since that IS the thing this gate depends on working correctly.
// ---------------------------------------------------------------------------

test("loadHrefChecker: extracts a real, callable checker from render.ts that behaves correctly", async () => {
  const renderTsPath = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "apps/website/src/server/inbound/public-http/http/site/render.ts"
  );
  const checker = await loadHrefChecker(renderTsPath);
  assert.equal(checker("/quickstart"), true);
  assert.equal(checker("javascript:alert(1)"), false);
});

// ---------------------------------------------------------------------------
// Live: the real gate, today, on this checkout — this is check:menu-href-allowlist-sync's own
// assertion, run as a normal test rather than only as a standalone CLI script.
// ---------------------------------------------------------------------------

test("live: jini:isAllowedHref, render.ts:safeHref, and static-render.ts:safeHref agree on every table row", async () => {
  const mismatches = await runMenuHrefAllowlistSync();
  assert.deepEqual(mismatches, [], `href allowlist copies have drifted: ${JSON.stringify(mismatches)}`);
});
