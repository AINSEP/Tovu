import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  collectRepoFiles,
  findEmptyGlobs,
  globMatchesAnyFile,
  globToRegExp,
  isMainModule,
  missingIndexNotice,
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

test("parseAdrIndexTable: a Scope Globs cell wrapping EACH glob individually strips cleanly, not just the outer pair", () => {
  // Gemini finding 11 (2026-09-05 re-triage): unbacktick() was applied once to the WHOLE cell before
  // splitting on ';'. Today's real ADR-INDEX.md wraps the whole cell once (`glob1; glob2`), which that
  // handles fine, but a cell that backtick-wraps each glob individually (`glob1`; `glob2`) would have
  // only its outermost backtick pair recognized and stripped -- because those two outermost characters
  // happen to be backticks too -- leaving a stray backtick on each split token. Not currently
  // triggered (today's index only uses the whole-cell form) but a real gap.
  const markdown = [
    "| ID | Title | Enforcement | Scope Globs | Status | File |",
    "|---|---|---|---|---|---|",
    "| GOV-ADR-778 | Some Rule | MANDATORY | `apps/website/src/features/**`; `apps/website/src/other/**` | ACCEPTED | `GOV-ADR-778-fixture.md` |",
    "",
  ].join("\n");

  const rows = parseAdrIndexTable(markdown);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]!.scopeGlobs, ["apps/website/src/features/**", "apps/website/src/other/**"]);
});

test("parseAdrIndexTable: an empty table (only header/separator) parses to zero rows", () => {
  const markdown = ["| ID | Title | Enforcement | Scope Globs | Status | File |", "|---|---|---|---|---|---|"].join("\n");
  assert.deepEqual(parseAdrIndexTable(markdown), []);
});

test("parseAdrIndexTable: a backtick-wrapped Status cell is still stripped, so findEmptyGlobs' ACCEPTED check still matches it", () => {
  // Gemini finding 9 (2026-09-05 re-triage): id/scopeGlobsCell/file were passed through unbacktick(),
  // but status and enforcement were assigned raw. A backtick-wrapped Status cell left row.status as
  // the literal string "`ACCEPTED`", which findEmptyGlobs' `row.status !== "ACCEPTED"` compares
  // against verbatim — silently skipping that row's enforcement entirely.
  const markdown = [
    "| ID | Title | Enforcement | Scope Globs | Status | File |",
    "|---|---|---|---|---|---|",
    "| GOV-ADR-777 | Some Rule | `MANDATORY` | `apps/website/src/features/**` | `ACCEPTED` | `GOV-ADR-777-fixture.md` |",
    "",
  ].join("\n");

  const rows = parseAdrIndexTable(markdown);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.status, "ACCEPTED", "a backtick-wrapped Status cell must be stripped like the other cells");
  assert.equal(rows[0]!.enforcement, "MANDATORY", "a backtick-wrapped Enforcement cell must be stripped like the other cells");
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

test("globToRegExp: a mid-segment '*' matches a directory name containing the wildcard substring", () => {
  // This only proves substring presence/absence, not '/'-spanning behavior: "apikeys" fails to
  // match purely because it lacks the literal substring "api-key" — the assertion below would
  // pass identically whether or not '*' wrongly spanned '/'. See the next test for that property.
  const re = globToRegExp("apps/website/src/**/*api-key*/**");
  assert.ok(re.test("apps/website/src/server/inbound/admin-http/routes/api-keys/create.ts"));
  assert.ok(!re.test("apps/website/src/server/inbound/admin-http/routes/apikeys/create.ts"), "no literal 'api-key' substring");
});

test("globToRegExp: a mid-segment '*' does not span '/' — an extra path segment cannot be absorbed into the wildcard", () => {
  // The real ADR glob above ("apps/website/src/**/*api-key*/**") cannot exercise this boundary at
  // all: its flanking '**' tokens are already fully permissive on both sides of the mid-segment
  // '*', so every candidate we tried (including "routes/api/key-store/create.ts" and
  // "routes/api-/key/create.ts") matches (or fails to match) IDENTICALLY whether '*' is
  // implemented as `[^/]*` or as a buggy `.*` that spans '/' — verified by diffing both
  // implementations against those candidates before writing this test. A literal substring like
  // "api-key" can never itself straddle a real '/' (a path separator would have to sit inside the
  // literal's own characters), so the only way to observe the span is with a glob whose wildcard
  // segment is flanked by fixed literals instead of '**', so an extra directory level in the
  // candidate can only be swallowed if '*' wrongly spans '/'.
  const re = globToRegExp("apps/website/src/routes/*api-key*/create.ts");
  assert.ok(
    re.test("apps/website/src/routes/x-api-key-y/create.ts"),
    "a single directory segment containing the substring matches"
  );
  assert.ok(
    !re.test("apps/website/src/routes/extra/x-api-key-y/create.ts"),
    "an extra directory level between the fixed prefix and the api-key segment must not be absorbed by '*'"
  );
});

test("globToRegExp: a trailing '**/' matches nested files, not just paths ending in '/'", () => {
  // Gemini finding 10 (2026-09-05 re-triage): nextGlobToken compiles "**/" to "(?:.*/)?", which at the
  // END of a pattern requires the matched string to either be empty there or end in '/'.
  // collectRepoFiles never returns paths ending in '/', so a glob written with a trailing '**/' could
  // never match any real file. Not currently triggered (today's ADR-INDEX.md has no trailing-'/'
  // globs) but a real gap.
  const re = globToRegExp("apps/website/src/features/**/");
  assert.ok(re.test("apps/website/src/features/identity/wiring.ts"), "a nested file must still match");
  assert.ok(re.test("apps/website/src/features/top-level.ts"), "a direct child file must still match");
  assert.ok(!re.test("apps/website/src/server/routes/types.ts"), "an unrelated path must not match");
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
// missingIndexNotice — the total-skip case (ADS-memory/governance/ is untracked by design, so this
// gate cannot verify anything on a fresh clone or in CI)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// isMainModule
// ---------------------------------------------------------------------------

test("isMainModule: an unset argv[1] does not throw, and compares as false against a real module URL", () => {
  // Gemini finding 12 (2026-09-05 re-triage): the module-level guard did `pathToFileURL(process.argv[1]).href`
  // with no `?? ""` fallback, unlike the sibling check-menu-href-allowlist-sync.ts. A call context with
  // argv[1] unset would throw a raw TypeError at import time instead of just comparing false. Not
  // currently triggered (this repo's test/CLI invocations always set argv[1]) but a real gap.
  assert.doesNotThrow(() => isMainModule("file:///some/module.ts", undefined));
  assert.equal(isMainModule("file:///some/module.ts", undefined), false);
});

test("isMainModule: true when import.meta.url matches the resolved argv[1] path", () => {
  const argv1 = "/Users/dev/repo/development/scripts/check-governance-adr-scope-drift.ts";
  assert.equal(isMainModule(pathToFileURL(argv1).href, argv1), true);
});

test("missingIndexNotice: reads as SKIPPED/unverified, never as a passing check", () => {
  const notice = missingIndexNotice("ADS-memory/governance/adrs/ADR-INDEX.md");

  // The 2026-09-05 governance audit's finding: a bare "ok" here is indistinguishable from "checked,
  // all clear" — this pins the wording so a future regression back to that form fails loudly instead
  // of silently reintroducing the vacuous-everywhere-but-one-machine gate.
  assert.ok(notice.includes("SKIPPED"), "must say SKIPPED, not read as a pass");
  assert.ok(notice.includes("UNVERIFIED"), "must say what was NOT checked");
  assert.ok(notice.includes("ADS-memory/governance/adrs/ADR-INDEX.md"), "must name the missing path");
  assert.ok(!/— ok —/.test(notice), "must not use this script's own 'ok' phrasing for a total skip");
});

test("missingIndexNotice: the real script actually reaches this path via console.warn, not console.log — proven by reading the source", () => {
  // A direct behavioral test would require spawning the script as a subprocess against a repo root
  // with no ADS-memory/governance/, which this file's sibling tests avoid (see the module-level
  // guard in check-governance-adr-scope-drift.ts). Reading the source is the seam this repo uses
  // elsewhere for the same constraint (e.g. dead-path-sweep.test.ts's own `shouldScanStringsIn` test
  // reads real files rather than spawning). This asserts main() is wired to the pure function above,
  // not a hand-rolled duplicate string that could drift from it.
  const source = fs.readFileSync(path.join(REPO_ROOT, "development/scripts/check-governance-adr-scope-drift.ts"), "utf8");
  assert.ok(
    /console\.warn\(missingIndexNotice\(/.test(source),
    "main() must print missingIndexNotice()'s own text via console.warn, not a separate inline string"
  );
});

// ---------------------------------------------------------------------------
// Live regression: the real ADR-INDEX.md, today, on this checkout.
// ---------------------------------------------------------------------------

test("live: every ACCEPTED row in the real ADR-INDEX.md matches at least one real file", (t) => {
  const indexPath = path.join(REPO_ROOT, "ADS-memory", "governance", "adrs", "ADR-INDEX.md");
  if (!fs.existsSync(indexPath)) {
    // ADS-memory/governance/ is untracked by design (see missingIndexNotice's own tests above) — on
    // any checkout without this developer's local copy, this is the expected state, not a failure.
    // Skipping explicitly here (rather than letting fs.readFileSync throw ENOENT) mirrors the real
    // script's own no-op behavior instead of reporting an unrelated crash for an expected condition.
    t.skip(`no ${path.relative(REPO_ROOT, indexPath)} on this checkout — governance/ is untracked by design`);
    return;
  }
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
