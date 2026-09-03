import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  collectRepoFiles,
  findEmptyGlobs,
  globMatchesAnyFile,
  globToRegExp,
  parseAdrIndexTable,
  type AdrIndexRow,
} from "../check-governance-adr-scope-drift.js";

/**
 * @file Direct coverage for `check-governance-adr-scope-drift.ts` plus a live regression assertion
 * against the real `ADR-INDEX.md`.
 *
 * ## What triggered this
 *
 * Every scope glob in `ADS-memory/governance/adrs/ADR-INDEX.md` was still written against the
 * pre-restructure `src/...` paths after the 2026-09-02 `apps/website` restructure moved the tree to
 * `apps/website/src/...` — three MANDATORY, ACCEPTED governance ADRs governed zero files, discovered
 * 2026-09-03. `historical:` below pins the exact dead globs found that day so a future regression of
 * the same shape (a restructure that repoints the tree again without repointing this index) is caught
 * by this test even before the live scan below runs.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

function row(overrides: Partial<AdrIndexRow> = {}): AdrIndexRow {
  return {
    id: "GOV-ADR-999",
    title: "Fixture row",
    enforcement: "MANDATORY",
    scopeGlobs: ["apps/website/src/features/**"],
    status: "ACCEPTED",
    file: "GOV-ADR-999-fixture.md",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseAdrIndexTable
// ---------------------------------------------------------------------------

test("parseAdrIndexTable: parses a real-shaped table, splits semicolon-joined globs, skips header/separator", () => {
  const markdown = [
    "# Governance ADR Index",
    "",
    "| ID | Title | Enforcement | Scope Globs | Status | File |",
    "|---|---|---|---|---|---|",
    "| GOV-ADR-001 | Some Rule | MANDATORY | `apps/website/src/features/**; apps/website/src/contracts/core/gated-mutations/**` | ACCEPTED | `GOV-ADR-001-some-rule.md` |",
    "",
  ].join("\n");

  const rows = parseAdrIndexTable(markdown);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.id, "GOV-ADR-001");
  assert.equal(rows[0]!.status, "ACCEPTED");
  assert.deepEqual(rows[0]!.scopeGlobs, [
    "apps/website/src/features/**",
    "apps/website/src/contracts/core/gated-mutations/**",
  ]);
});

test("parseAdrIndexTable: a commented-out example row is never parsed, even when it reuses a real id", () => {
  // Reproduces ADR-INDEX.md's own shape exactly: a real GOV-ADR-001 row above, and a commented-out
  // template below it that ALSO writes "GOV-ADR-001" as a placeholder id. If the parser skipped
  // comments per-LINE instead of stripping the whole `<!-- ... -->` block first, this would parse as
  // two GOV-ADR-001 rows.
  const markdown = [
    "| ID | Title | Enforcement | Scope Globs | Status | File |",
    "|---|---|---|---|---|---|",
    "| GOV-ADR-001 | Real Rule | MANDATORY | `apps/website/src/features/**` | ACCEPTED | `GOV-ADR-001-real.md` |",
    "",
    "<!-- Add new entries above this line. Keep sorted by ID. -->",
    "",
    "<!--",
    "Example row (do not leave uncommented without a real ADR file):",
    "| GOV-ADR-001 | No direct DB access from rendering layer | DEFAULT | `src/templates/**; src/views/**` | ACCEPTED | `GOV-ADR-001-no-db-in-templates.md` |",
    "-->",
  ].join("\n");

  const rows = parseAdrIndexTable(markdown);

  assert.equal(rows.length, 1, "the commented-out example row must not be parsed as a second row");
  assert.equal(rows[0]!.title, "Real Rule");
});

test("parseAdrIndexTable: an empty table (only header/separator) parses to zero rows", () => {
  const markdown = ["| ID | Title | Enforcement | Scope Globs | Status | File |", "|---|---|---|---|---|---|"].join("\n");
  assert.deepEqual(parseAdrIndexTable(markdown), []);
});

// ---------------------------------------------------------------------------
// globToRegExp / globMatchesAnyFile
// ---------------------------------------------------------------------------

test("globToRegExp: a literal path with no wildcard matches only itself", () => {
  const re = globToRegExp("apps/website/src/contracts/core/operation-lock.ts");
  assert.ok(re.test("apps/website/src/contracts/core/operation-lock.ts"));
  assert.ok(!re.test("apps/website/src/contracts/core/operation-lock.ts.bak"));
  assert.ok(!re.test("apps/website/src/contracts/core/other/operation-lock.ts"));
});

test("globToRegExp: trailing '/**' matches anything nested under the directory", () => {
  const re = globToRegExp("apps/website/src/features/**");
  assert.ok(re.test("apps/website/src/features/identity/wiring.ts"));
  assert.ok(re.test("apps/website/src/features/identity/__tests__/hasher.test.ts"));
  assert.ok(!re.test("apps/website/src/server/routes/types.ts"));
});

test("globToRegExp: '**/' in the middle matches across zero or more directory levels", () => {
  const re = globToRegExp("apps/website/src/**/*credential*.ts");
  assert.ok(re.test("apps/website/src/assistant/site-credential-store.ts"), "one level deep");
  assert.ok(
    re.test("apps/website/src/server/inbound/admin-http/routes/system/vendor-credentials.ts"),
    "several levels deep"
  );
  assert.ok(!re.test("apps/website/src/assistant/external-mcp-oauth.ts"), "no 'credential' in the name");
});

test("globToRegExp: a mid-segment '*' matches a directory name containing the wildcard, not spanning '/'", () => {
  const re = globToRegExp("apps/website/src/**/*api-key*/**");
  assert.ok(re.test("apps/website/src/server/inbound/admin-http/routes/api-keys/create.ts"));
  assert.ok(!re.test("apps/website/src/server/inbound/admin-http/routes/apikeys/create.ts"), "no literal 'api-key' substring");
});

test("globMatchesAnyFile: true iff at least one candidate matches", () => {
  const files = ["apps/website/src/features/identity/wiring.ts", "apps/website/src/server/routes/types.ts"];
  assert.equal(globMatchesAnyFile("apps/website/src/features/**", files), true);
  assert.equal(globMatchesAnyFile("apps/website/src/nonexistent/**", files), false);
});

// ---------------------------------------------------------------------------
// findEmptyGlobs
// ---------------------------------------------------------------------------

test("findEmptyGlobs: flags each empty glob in an ACCEPTED row separately", () => {
  const files = ["apps/website/src/features/identity/wiring.ts"];
  const rows = [
    row({
      id: "GOV-ADR-A",
      scopeGlobs: ["apps/website/src/features/**", "apps/website/src/nonexistent/**"],
    }),
  ];

  const violations = findEmptyGlobs(rows, files);

  assert.equal(violations.length, 1);
  assert.equal(violations[0]!.adrId, "GOV-ADR-A");
  assert.equal(violations[0]!.glob, "apps/website/src/nonexistent/**");
});

test("findEmptyGlobs: a PROPOSED row's dead glob is not flagged — mirrors adr-governance's ACCEPTED-only rule", () => {
  const files = ["apps/website/src/features/identity/wiring.ts"];
  const rows = [row({ id: "GOV-ADR-B", status: "PROPOSED", scopeGlobs: ["apps/website/src/nonexistent/**"] })];

  assert.deepEqual(findEmptyGlobs(rows, files), []);
});

test("findEmptyGlobs: a fully-matching ACCEPTED row produces no violations", () => {
  const files = ["apps/website/src/features/identity/wiring.ts"];
  const rows = [row({ id: "GOV-ADR-C", scopeGlobs: ["apps/website/src/features/**"] })];

  assert.deepEqual(findEmptyGlobs(rows, files), []);
});

// ---------------------------------------------------------------------------
// historical: the exact dead globs found 2026-09-03, pinned so a future re-break of the same shape
// (a restructure that moves the tree again without repointing this index) is caught here even
// before someone thinks to re-run the live scan.
// ---------------------------------------------------------------------------

test("historical: the pre-2026-09-03 src/... globs no longer match anything in the real repo", () => {
  const files = collectRepoFiles(REPO_ROOT);
  const deadGlobs = [
    "src/features/**",
    "src/core/gated-mutations/**",
    "src/features/storage/**",
    "src/features/recovery/**",
    "src/core/operation-lock.ts",
    "src/features/content-types/**",
    "src/infra/**",
  ];
  for (const glob of deadGlobs) {
    assert.equal(globMatchesAnyFile(glob, files), false, `'${glob}' was expected to still be dead (pre-restructure path)`);
  }
});

// ---------------------------------------------------------------------------
// Live regression: the real ADR-INDEX.md, today, on this checkout.
// ---------------------------------------------------------------------------

test("live: every ACCEPTED row in the real ADR-INDEX.md matches at least one real file", () => {
  const indexPath = path.join(REPO_ROOT, "ADS-memory", "governance", "adrs", "ADR-INDEX.md");
  const markdown = fs.readFileSync(indexPath, "utf8");
  const rows = parseAdrIndexTable(markdown);
  const files = collectRepoFiles(REPO_ROOT);

  const violations = findEmptyGlobs(rows, files);

  assert.deepEqual(
    violations,
    [],
    `ADR-INDEX.md has an ACCEPTED row whose scope glob matches zero files: ${JSON.stringify(violations)}`
  );
  // Sanity: this asserts against something real, not an accidentally-empty table.
  assert.ok(rows.some((r) => r.status === "ACCEPTED"), "expected at least one ACCEPTED row to exist");
});
