import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  SKIP_REASONS,
  classifyPathJoinSegments,
  classifyRepoRelativeString,
  collectRepoSegments,
  collectSweepTargets,
  dropLeadingParentSegments,
  extractPathJoinSegments,
  extractRelativeImportSpecifiers,
  extractStringLiterals,
  findingKey,
  pathThatMustExist,
  resolveImportCandidates,
  shouldScanStringsIn,
  stripComments,
  sweepFiles,
  type DeadPathFinding,
  type SkipReason,
} from "../lib/dead-path-sweep.js";

/**
 * @file The dead-path guard: every relative import and every hardcoded repo-relative path string in
 * `development/scripts/**\/*.ts` and `apps/website/src/platform/db/*.config.ts` must resolve to
 * something that exists.
 *
 * ## Why a TEST and not a `check:*` script
 *
 * `test:ci`'s glob already covers `development/scripts/**\/*.test.ts`, so running this sweep as a
 * `node:test` file reaches CI with zero `package.json`/`ci.yml` editing — becoming a `check:*`
 * script would need both a new npm script AND a new `ci.yml` step to reach the same blocking
 * status this file already gets for free from `test:ci`'s existing gate.
 *
 * CORRECTED 2026-09-03 (see `git log -p` on this line for the prior text): this section previously
 * justified the TEST-not-`check:*` choice partly on "`check:*` scripts wired into `ci.yml` carry
 * `continue-on-error: true`, so a `check:` script cannot fail anything here" — that premise is
 * false and should not be reused. `ci.yml`'s `continue-on-error: true` + `id:` steps feed a Gate
 * summary step that reads `steps.<id>.outcome` (the step's result BEFORE `continue-on-error` is
 * applied — GitHub Actions reserves `.conclusion` for the post-swallow result) and `exit 1`s the
 * job if any gate's outcome isn't `success`. A `continue-on-error` `check:*` step wired into that
 * aggregator DOES fail the build on a real crash or finding; see `ci.yml:198-210`'s own comment.
 * The same false premise appears again below in `GENERATE_SEED_CONTENT_BEFORE_921D705F`'s
 * comment and, before this task's fix, in three now-removed register entries — see
 * `ADS-memory/reports/2026-09-03-ci-gate-wiring-audit.md` for the full correction and the
 * re-audit this triggered (every remaining register entry below was re-checked against the
 * corrected understanding; none were parked FOR this reason, so none change disposition).
 *
 * ## What it caught
 *
 * The `apps/website` restructure moved the source tree and left `src/...` behind in tooling nothing
 * exercises. Six instances were known when this was written (`drizzle.config.ts`, its
 * `database-journal` sibling, `generate-seed-content.ts`, `list-server-test-files.ts`,
 * `backfill-vendor-credentials.ts`, `backfill-slug-collision-defaults.ts`). Running the sweep found
 * 35 dead references across 14 files — every one an unmigrated `src/` path. See
 * `KNOWN_BROKEN_PENDING_OWNER_DECISION` for the ledger and why none of them are fixed here.
 *
 * 2026-09-02 follow-up: the owner authorized fixing five of those files in two passes (14 of the 35
 * references). Pass one — `check-architecture.ts`, `check-route-coverage-diff.ts`,
 * `check-src-complexity-drift.ts`, and the `drizzle.database-journal.config.ts` sibling fix
 * `drizzle.config.ts` got in 7fb47f55. Pass two — `list-server-test-files.ts`, the ONE entry this
 * guard was originally commissioned around, once the owner decided which tests CI should run was no
 * longer an open question. Both passes repoint each `src/...` string to `apps/website/src/...` with
 * no threshold, baseline, or scope changes beyond the path itself. Fixing `check-route-coverage-diff.ts`'s
 * two git pathspecs also required repointing `route-coverage-lib.ts`'s `isMeasurableRouteFile` (same
 * `src/server/routes/...` dead prefix, one function away) — that instance was invisible to this sweep
 * because both its literals end in `/` (the `trailing-separator` skip rule), so it was never one of
 * the 35 and has no register entry to remove. That rule unconditionally exempted every trailing-`/`
 * literal instead of just the ambiguous single-segment ones; see `classifyRepoRelativeString`'s
 * `NORMALIZED_SKIP_RULES` comment and the `historical:` tests below for the fix that closes the
 * general escape, not just this one already-fixed instance.
 *
 * 2026-09-03 (CI gate wiring audit, task 2): a CI-gate-wiring pass needed five crashing `check:*`
 * scripts repointed — `check-inventory`, `check-embed-marker-drift`, `check-outbox-bridge`,
 * `check-openapi-contract`, `check-openapi-secret-leaks` (the last two share
 * `development/scripts/lib/tovu-test-server.ts`'s import). Three of those five ARE this register's
 * entries for `check-capability-inventory.ts`, `check-embed-marker-drift.ts`, and
 * `lib/tovu-test-server.ts` — this sweep found them on 2026-09-02 and they were deliberately parked
 * here as "the owner's call, not a mechanical repair" (each entry's rationale said so explicitly).
 * That call was made this session; fixing them is exactly the mechanical repoint the register said it
 * was. Their entries are removed below as no-longer-broken, same as the two prior passes.
 *
 * The other two — `check-outbox-bridge.ts`'s `path.join(REPO_ROOT, "src")` and
 * `check-capability-inventory.ts`'s own `path.resolve(import.meta.dirname, "..", "..", "src",
 * "server")` — were NOT in this register at all, and the reason is a real gap, not an oversight in
 * the ledger: neither is a relative import (class 1) or a single hardcoded path string (class 2).
 * Both build a path from several separate string ARGUMENTS to `path.join`/`path.resolve`, and every
 * individual argument (`"src"`, `"server"`) has no `/` of its own, so class 2's `no-path-separator`
 * skip rule discarded each one without ever seeing they were joined together. This sweep could not
 * have found them before this commit added class 3 (`extractPathJoinSegments` +
 * `dropLeadingParentSegments`, see their doc comments in `lib/dead-path-sweep.ts`) specifically to
 * close that hole. Both instances are already fixed as of this commit, so class 3 reports zero live
 * findings against today's tree — its `historical:` tests below prove it would have caught the
 * pre-fix shape.
 *
 * The remaining 18 references across 6 files are unchanged and still the owner's call.
 *
 * 2026-09-05: the disclosed single-trailing-literal-segment blind spot in class 3 (`path.join(REPO_ROOT,
 * "src")`, one argument, no `/` of its own) is now closed — `classifyPathJoinSegments` in
 * `lib/dead-path-sweep.ts` classifies a lone trailing literal the same way it classifies two or more,
 * instead of discarding anything under two before classification ever ran. That gap had a live,
 * previously-undetected victim: `development/scripts/rewrite-deep-imports.ts:50`'s
 * `path.join(REPO_ROOT, "src")` — `src/` at repo root has been gone since the restructure, so this
 * unwired (no `package.json`/CI reference) codemod tool's `SRC_ROOT` was silently dead. Fixed to
 * `path.join(REPO_ROOT, "apps", "website", "src")`, matching this repo's `#src/*` import-alias mapping
 * (`package.json`'s `"imports"` field) and every prior repoint of this same rot. See the `closed:` and
 * `historical:` tests below for the proof, both that the new classifier catches this shape and that a
 * fresh sweep of the fixed file now finds nothing.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

// ---------------------------------------------------------------------------
// The known-broken register
// ---------------------------------------------------------------------------

interface KnownBrokenEntry {
  readonly rationale: string;
}

/** Builds one register row per specifier so the staleness gate below sees each dead reference
 *  individually — a per-FILE register would let a second dead path slip into an already-listed file
 *  unnoticed, which is the exact hole that makes a suppression list rot. */
const known = (
  file: string,
  rationale: string,
  specifiers: readonly string[]
): Record<string, KnownBrokenEntry> =>
  Object.fromEntries(specifiers.map((specifier) => [`${file}:${specifier}`, { rationale }]));

const CI_GATE_SCOPE =
  "a CI gate's own scan scope, passed to depcruise/eslint/git with cwd=REPO_ROOT. Repointing it at " +
  "apps/website/src/ changes WHICH FILES THE GATE MEASURES and therefore what its committed baseline " +
  "means — an owner decision, not a mechanical path fix.";

const UNRUN_ONE_SHOT =
  "a one-shot operational script whose imports have been dead since the restructure. Nothing invokes " +
  "it, so nothing noticed. Repointing is mechanical, but the script has no test proving it still " +
  "works against today's schema, so a blind fix would ship an unverified migration tool.";

/**
 * Dead path references that exist TODAY and are deliberately not fixed by this change, each with the
 * reason it is the owner's call rather than a mechanical repair.
 *
 * This is NOT a general suppression mechanism, and nothing may be added to it to make an unrelated
 * failure go away. It is a ledger of one specific, finite piece of debt — the unfinished
 * `src/` to `apps/website/src/` migration — and it is paired with the staleness gate below: the
 * moment an entry's path starts resolving, the entry becomes redundant and the test FAILS, forcing
 * its removal. That pairing is what stops this list from drifting the way three other
 * hand-maintained registries in this repo did in a single day. It follows `REVIEWED_JSON_COLUMNS` in
 * `apps/website/src/platform/db/migration/manifest.ts` and its staleness/non-redundancy tests, which
 * is this codebase's established pattern for exactly this problem.
 *
 * The brief that commissioned this guard expected ONE entry (`list-server-test-files.ts`). The sweep
 * found 35. That gap is the finding, not a defect in the guard.
 *
 * A rationale that reasons "this is safe to park because ci.yml's continue-on-error swallows the
 * failure anyway" is WRONG and must not be reused — three entries here previously said exactly
 * that about check:*-script targets, and all three were actually failing the build the whole time
 * (see the file header's "Why a TEST and not a `check:*` script" section for the corrected
 * `.outcome`-vs-`.conclusion` mechanism, and `ADS-memory/reports/2026-09-03-ci-gate-wiring-audit.md`
 * for the full incident). "Nothing invokes this script" (true for every entry remaining below, all
 * one-shot operational tooling, never a `check:*` npm script) is a DIFFERENT and still-valid reason
 * to park an entry; "CI won't notice because continue-on-error" is not a reason at all.
 */
const KNOWN_BROKEN_PENDING_OWNER_DECISION: Readonly<Record<string, KnownBrokenEntry>> = {
  ...known("development/scripts/agent-plugin-activation.ts", UNRUN_ONE_SHOT, [
    "../../src/features/agent-plugins/activation.js",
    "../../src/features/agent-plugins/layout.js",
    "../../src/features/agent-plugins/resolve-agent-plugin-refs.js",
  ]),
  ...known("development/scripts/install-agent-plugin.ts", UNRUN_ONE_SHOT, [
    "../../src/features/agent-plugins/fetch-archive.js",
    "../../src/features/agent-plugins/install.js",
    "../../src/features/agent-plugins/install-from-url.js",
    "../../src/features/agent-plugins/layout.js",
  ]),
  ...known("development/scripts/convert-legacy-doc-pages-to-html.ts", UNRUN_ONE_SHOT, [
    "../../src/platform/db/sqlite/content-db.js",
    "../../src/platform/db/sqlite/db-ops.js",
    "../../src/contracts/core/entry-refs/repo.sqlite.js",
    "../../src/features/pages/html-document-store.js",
    "../../src/server/inbound/public-http/http/site/render.js",
  ]),
  ...known("development/scripts/migrate-page-embed-markers.ts", UNRUN_ONE_SHOT, [
    "../../src/platform/db/sqlite/content-db.js",
    "../../src/contracts/core/embeds/marker.js",
    "../../src/contracts/core/entry-refs/extractor.js",
    "../../src/contracts/core/entry-refs/repo.sqlite.js",
  ]),
  ...known("development/scripts/theme-tool.ts", UNRUN_ONE_SHOT, ["../../src/features/theme/theme.js"]),
  ...known(
    "development/scripts/write-path-inventory.ts",
    `${UNRUN_ONE_SHOT} Note this script builds its own ROOT as development/, not the repo root, so ` +
      "the true dead target is development/src/platform/db/schema.ts — absent under either base.",
    ["src/platform/db/schema.ts"]
  ),
};

// ---------------------------------------------------------------------------
// The live sweep
// ---------------------------------------------------------------------------

const sweepTheRepo = (): readonly DeadPathFinding[] =>
  sweepFiles({ repoRoot: REPO_ROOT, files: collectSweepTargets(REPO_ROOT) });

/** The repo-relative paths a source text yields, with the skipped literals dropped. */
const repoRelativePathsIn = (source: string, segments: ReadonlySet<string>): string[] =>
  extractStringLiterals(source)
    .map((l) => classifyRepoRelativeString(l.value, { knownRepoSegments: segments }))
    .flatMap((c) => (c.kind === "repo-relative-path" ? [c.repoRelative] : []));

const describe = (f: DeadPathFinding): string =>
  `${f.file}:${f.line} [${f.kind}] "${f.specifier}" -> none of ${f.attempted.join(", ")} exist`;

test("dead-path sweep: no path reference outside the known-broken register resolves to nothing", () => {
  const unexpected = sweepTheRepo().filter((f) => !(findingKey(f) in KNOWN_BROKEN_PENDING_OWNER_DECISION));
  assert.deepEqual(
    unexpected.map(describe),
    [],
    "a path reference under development/scripts or the db tooling points at a file that does not exist"
  );
});

test("known-broken register has no stale entries — every listed reference is still actually broken", () => {
  const live = new Set(sweepTheRepo().map(findingKey));
  const stale = Object.keys(KNOWN_BROKEN_PENDING_OWNER_DECISION).filter((key) => !live.has(key));
  assert.deepEqual(
    stale,
    [],
    "this reference now resolves — delete its register entry rather than leaving a suppression behind"
  );
});

test("known-broken register is exactly the 18 references remaining after the 2026-09-03 gate-repoint pass — growth needs a deliberate edit", () => {
  assert.equal(Object.keys(KNOWN_BROKEN_PENDING_OWNER_DECISION).length, 18);
});

test("every known-broken entry carries a non-empty rationale", () => {
  const missing = Object.entries(KNOWN_BROKEN_PENDING_OWNER_DECISION)
    .filter(([, entry]) => entry.rationale.trim().length === 0)
    .map(([key]) => key);
  assert.deepEqual(missing, []);
});

test("the sweep actually looks at something — target enumeration is not silently empty", () => {
  const targets = collectSweepTargets(REPO_ROOT);
  assert.ok(targets.length > 40, `expected the sweep to cover the script tree, got ${targets.length} files`);
  assert.ok(targets.includes("development/scripts/list-server-test-files.ts"));
  assert.ok(targets.includes("apps/website/src/platform/db/drizzle.config.ts"));
  assert.ok(targets.includes("apps/website/src/platform/db/drizzle.database-journal.config.ts"));
  for (const t of targets) assert.ok(fs.existsSync(path.join(REPO_ROOT, t)), `${t} does not exist`);
});

// ---------------------------------------------------------------------------
// Historical proof: the matcher catches defects that actually shipped
// ---------------------------------------------------------------------------

/** Verbatim from `git show 921d705f^:development/scripts/generate-seed-content.ts` — the imports that
 *  crashed `check:seed-content-drift` with ERR_MODULE_NOT_FOUND.
 *
 *  CORRECTED 2026-09-03: this comment previously said "while ci.yml's continue-on-error swallowed
 *  it" — false. `check:seed-content-drift` was wired into `ci.yml` as `gate-seed-content-drift`,
 *  read by the Gate-summary aggregator, since `ee45f50f` (2026-08-20), well before the restructure
 *  broke this import (2026-09-02). The crash's `.outcome` would have been `failure` and the
 *  aggregator would have failed the build — see the file header's "Why a TEST and not a `check:*`
 *  script" section for the corrected mechanism. Left unresolved here only because this is a
 *  historical fixture past commit and not this task's business to re-litigate further than naming
 *  it wrong. */
const GENERATE_SEED_CONTENT_BEFORE_921D705F = `import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { seededPosts, seededPresentation, seededWorkspace } from "../../src/server/runtime/configuration/seed.js";
import type { TemplateSeedContent } from "../../src/platform/site-dir/types.js";
`;

/** Verbatim from `git show 7fb47f55^:apps/website/src/platform/db/drizzle.config.ts` — the config
 *  that made `drizzle-kit generate` fail "No schema files found", meaning NO migration could be
 *  generated by anyone after the restructure. */
const DRIZZLE_CONFIG_BEFORE_7FB47F55 = `export default defineConfig({
  dialect: "sqlite",
  schema: "./src/platform/db/schema.ts",
  out: "./src/platform/db/drizzle",
});
`;

/** Verbatim from `git show 678b6464^:development/scripts/route-coverage-lib.ts` — the
 *  `isMeasurableRouteFile` prefixes that matched nothing after the apps/website restructure, so both
 *  route-coverage gates measured zero files. Unlike the two fixtures above, THIS specific instance was
 *  never in `KNOWN_BROKEN_PENDING_OWNER_DECISION`: the old `trailing-separator` rule exempted both
 *  literals just for ending in `/`, so the sweep never saw them to report. */
const ROUTE_COVERAGE_LIB_BEFORE_678B6464 = `export function isMeasurableRouteFile(relPath: string): boolean {
  const normalized = relPath.split(path.sep).join("/");
  const isRoutePath = normalized.startsWith("src/server/routes/") || normalized.startsWith("src/server/inbound/admin-http/routes/");
  if (!isRoutePath) return false;
  if (normalized.includes("/__tests__/")) return false;
  if (/\\.(test|spec)\\.ts$/.test(normalized)) return false;
  const base = path.basename(normalized);
  if (base === "deps.ts" || base === "execution-deps.ts" || base === "types.ts") return false;
  return true;
}
`;

/** The pre-2026-09-03 form of `check-outbox-bridge.ts`'s `SRC_DIR` line (this task's own diff —
 *  see `ADS-memory/reports/2026-09-03-ci-gate-wiring-audit.md`) — `path.join(REPO_ROOT, "src")`
 *  crashed the scan with `ENOENT: no such file or directory, scandir '.../src'` after the restructure.
 *  Unlike the fixtures above, this one was NEVER in `KNOWN_BROKEN_PENDING_OWNER_DECISION`: `"src"` is
 *  a single argument with no `/` of its own, so class 2's `no-path-separator` rule discarded it and
 *  class 1 doesn't apply (it isn't an import). Invisible to this sweep until class 3 (below). */
const CHECK_OUTBOX_BRIDGE_BEFORE_20260903 = `const SRC_DIR = dirFlagIndex === -1 ? path.join(REPO_ROOT, "src") : path.resolve(process.argv[dirFlagIndex + 1]);
`;

/** The pre-2026-09-03 form of `check-capability-inventory.ts`'s `SERVER_DIR` line — same shape and
 *  same reason it was never in the register: `"src"`/`"server"` are separate arguments, neither
 *  containing a `/`. */
const CHECK_CAPABILITY_INVENTORY_SERVER_DIR_BEFORE_20260903 = `const SERVER_DIR = path.resolve(import.meta.dirname, "..", "..", "src", "server");
`;

test("historical: the pre-921d705f generate-seed-content.ts imports are flagged as dead", () => {
  const importerAbs = path.join(REPO_ROOT, "development/scripts/generate-seed-content.ts");
  const specifiers = extractRelativeImportSpecifiers(GENERATE_SEED_CONTENT_BEFORE_921D705F).map((s) => s.specifier);

  assert.deepEqual(specifiers, [
    "../../src/server/runtime/configuration/seed.js",
    "../../src/platform/site-dir/types.js",
  ]);

  for (const specifier of specifiers) {
    const candidates = resolveImportCandidates(importerAbs, specifier);
    const alive = candidates.filter((c) => fs.existsSync(c));
    assert.deepEqual(alive, [], `${specifier} unexpectedly resolves — the historical proof is vacuous`);
  }
});

test("historical: the fixed generate-seed-content.ts imports resolve, so the check above is not trivially true", () => {
  const importerAbs = path.join(REPO_ROOT, "development/scripts/generate-seed-content.ts");
  for (const specifier of [
    "../../apps/website/src/server/runtime/configuration/seed.js",
    "../../apps/website/src/platform/site-dir/types.js",
  ]) {
    const candidates = resolveImportCandidates(importerAbs, specifier);
    assert.ok(
      candidates.some((c) => fs.existsSync(c)),
      `${specifier} should resolve after the 921d705f fix; probed ${candidates.join(", ")}`
    );
  }
});

test("historical: the pre-7fb47f55 drizzle.config.ts path strings are flagged as dead", () => {
  const segments = collectRepoSegments(REPO_ROOT);
  const paths = repoRelativePathsIn(DRIZZLE_CONFIG_BEFORE_7FB47F55, segments);

  assert.deepEqual(paths, ["src/platform/db/schema.ts", "src/platform/db/drizzle"]);
  for (const p of paths) {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, pathThatMustExist(p))), false, `${p} unexpectedly exists`);
  }
});

test("historical: the current drizzle.config.ts path strings resolve, so the check above is not trivially true", () => {
  const segments = collectRepoSegments(REPO_ROOT);
  const source = fs.readFileSync(path.join(REPO_ROOT, "apps/website/src/platform/db/drizzle.config.ts"), "utf8");
  const paths = repoRelativePathsIn(source, segments);

  assert.deepEqual(paths, ["apps/website/src/platform/db/schema.ts", "apps/website/src/platform/db/drizzle"]);
  for (const p of paths) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, pathThatMustExist(p))), `${p} should exist after 7fb47f55`);
  }
});

test("historical [adversarial]: the pre-678b6464 route-coverage-lib.ts prefixes are flagged as dead now that trailing-/ literals with real directory structure are classified", () => {
  const segments = collectRepoSegments(REPO_ROOT);
  const paths = repoRelativePathsIn(ROUTE_COVERAGE_LIB_BEFORE_678B6464, segments);

  assert.deepEqual(paths, ["src/server/routes", "src/server/inbound/admin-http/routes"]);
  for (const p of paths) {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, pathThatMustExist(p))), false, `${p} unexpectedly exists`);
  }
});

test("historical: the current route-coverage-lib.ts prefixes resolve, so the check above is not trivially true", () => {
  const segments = collectRepoSegments(REPO_ROOT);
  const source = fs.readFileSync(path.join(REPO_ROOT, "development/scripts/route-coverage-lib.ts"), "utf8");
  const paths = repoRelativePathsIn(source, segments).filter((p) => p.includes("routes"));

  assert.deepEqual(paths, [
    "apps/website/src/server/routes",
    "apps/website/src/server/inbound/admin-http/routes",
    "apps/website/src/server/inbound/public-http/routes",
  ]);
  for (const p of paths) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, pathThatMustExist(p))), `${p} should exist after 678b6464`);
  }
});

// ---------------------------------------------------------------------------
// class 3: path.join()/path.resolve() call extraction (2026-09-03)
// ---------------------------------------------------------------------------

test("extractPathJoinSegments finds the trailing string-literal run and ignores the non-literal base", () => {
  const source = `const SERVER_DIR = path.resolve(import.meta.dirname, "..", "..", "src", "server");`;
  const found = extractPathJoinSegments(source);

  assert.deepEqual(
    found.map((c) => c.segments),
    [["..", "..", "src", "server"]]
  );
  assert.equal(found[0]!.line, 1);
});

test("extractPathJoinSegments stops the trailing run at the first non-literal argument, however many literals came before it", () => {
  const source = `path.join(REPO_ROOT, someVar, "src", "server");`;
  const found = extractPathJoinSegments(source);

  // "src"/"server" come AFTER someVar, so they are still the trailing run; someVar itself is not a
  // literal and is excluded, and REPO_ROOT (the base) never enters the run at all.
  assert.deepEqual(
    found.map((c) => c.segments),
    [["src", "server"]]
  );
});

test("extractPathJoinSegments finds nothing when no argument is a trailing string literal", () => {
  const source = `path.join(REPO_ROOT, someVar);`;
  assert.deepEqual(extractPathJoinSegments(source), []);
});

test("extractPathJoinSegments ignores calls other than path.join/path.resolve", () => {
  const source = `otherThing.join(REPO_ROOT, "src", "server");`;
  assert.deepEqual(extractPathJoinSegments(source), []);
});

test("dropLeadingParentSegments strips only the leading .. run, keeping a .. that appears later", () => {
  assert.deepEqual(dropLeadingParentSegments(["..", "..", "src", "server"]), ["src", "server"]);
  assert.deepEqual(dropLeadingParentSegments(["src", "..", "server"]), ["src", "..", "server"]);
  assert.deepEqual(dropLeadingParentSegments(["src"]), ["src"]);
});

/** The pre-fix form of `rewrite-deep-imports.ts:50` (this task's own diff) — a SINGLE trailing literal
 *  segment (`"src"`) passed to `path.join(REPO_ROOT, ...)`, same call shape as the historical
 *  `check-outbox-bridge.ts` SRC_DIR fixture above. `src/` at repo root has been gone since the 2026-09
 *  restructure; this line was silently dead because `rewrite-deep-imports.ts` is a one-shot codemod
 *  tool wired into neither `package.json` nor CI, so nothing ever ran it to notice. */
const REWRITE_DEEP_IMPORTS_SRC_ROOT_BEFORE_FIX = `const SRC_ROOT = path.join(REPO_ROOT, "src");
`;

test("closed: a SINGLE meaningful segment in a path.join/path.resolve call is no longer invisible — closes the check-outbox-bridge.ts / rewrite-deep-imports.ts blind spot", () => {
  const segments = collectRepoSegments(REPO_ROOT);

  // classes 1 (imports) and 2 (hardcoded strings) still see nothing: "src" alone has no "/". Only
  // class 3 (path.join/path.resolve call extraction) can see this shape at all.
  assert.deepEqual(extractRelativeImportSpecifiers(CHECK_OUTBOX_BRIDGE_BEFORE_20260903), []);
  assert.deepEqual(repoRelativePathsIn(CHECK_OUTBOX_BRIDGE_BEFORE_20260903, segments), []);

  // classifyPathJoinSegments (unlike classifyRepoRelativeString) omits the `no-path-separator` rule,
  // because a path.join/path.resolve ARGUMENT is a path segment by construction — a single trailing
  // literal carries the same restructure-sensitive meaning as two or more. "dist"/"node_modules"/etc.
  // stay safe because collectRepoSegments prunes them, not because of a segment-count floor.
  const [outboxCandidate] = extractPathJoinSegments(CHECK_OUTBOX_BRIDGE_BEFORE_20260903);
  assert.ok(outboxCandidate, "expected one path.join call");
  const outboxMeaningful = dropLeadingParentSegments(outboxCandidate.segments);
  assert.deepEqual(outboxMeaningful, ["src"]);
  assert.deepEqual(classifyPathJoinSegments(outboxMeaningful, { knownRepoSegments: segments }), {
    kind: "repo-relative-path",
    repoRelative: "src",
  });
  assert.equal(fs.existsSync(path.join(REPO_ROOT, pathThatMustExist("src"))), false, "src unexpectedly exists at repo root");

  // Same shape, a REAL live victim this task found and fixed (not just a historical fixture):
  // rewrite-deep-imports.ts's own pre-fix SRC_ROOT line, reaches the identical classification.
  const [rewriteCandidate] = extractPathJoinSegments(REWRITE_DEEP_IMPORTS_SRC_ROOT_BEFORE_FIX);
  assert.ok(rewriteCandidate);
  const rewriteMeaningful = dropLeadingParentSegments(rewriteCandidate.segments);
  assert.deepEqual(rewriteMeaningful, ["src"]);
  assert.deepEqual(classifyPathJoinSegments(rewriteMeaningful, { knownRepoSegments: segments }), {
    kind: "repo-relative-path",
    repoRelative: "src",
  });

  // Proven end to end through the real sweep against today's (fixed) file: a fresh sweep finds nothing
  // wrong with rewrite-deep-imports.ts, because the fix below is already live in the source tree.
  const currentFindings = sweepFiles({ repoRoot: REPO_ROOT, files: ["development/scripts/rewrite-deep-imports.ts"] });
  assert.deepEqual(currentFindings, []);
});

test("historical [direct]: the pre-fix SRC_DIR/SERVER_DIR shapes resolve to nothing under REPO_ROOT — both the one-segment and two-segment forms", () => {
  // check-outbox-bridge.ts's SRC_DIR was a SINGLE meaningful segment ("src") — proven reachable by
  // classifyPathJoinSegments in the test above. SERVER_DIR is the two-segment case, same classifier:
  const [candidate] = extractPathJoinSegments(CHECK_CAPABILITY_INVENTORY_SERVER_DIR_BEFORE_20260903);
  assert.ok(candidate);
  const meaningful = dropLeadingParentSegments(candidate.segments);
  assert.deepEqual(meaningful, ["src", "server"]);

  const classified = classifyPathJoinSegments(meaningful, { knownRepoSegments: collectRepoSegments(REPO_ROOT) });
  assert.deepEqual(classified, { kind: "repo-relative-path", repoRelative: "src/server" });
  assert.equal(fs.existsSync(path.join(REPO_ROOT, pathThatMustExist("src/server"))), false, "src/server unexpectedly exists");
});

test("historical: the current check-outbox-bridge.ts, check-capability-inventory.ts, and rewrite-deep-imports.ts path.join/path.resolve calls resolve, so the checks above are not trivially true", () => {
  const segments = collectRepoSegments(REPO_ROOT);
  const files = [
    "development/scripts/check-outbox-bridge.ts",
    "development/scripts/check-capability-inventory.ts",
    "development/scripts/rewrite-deep-imports.ts",
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    for (const candidate of extractPathJoinSegments(source)) {
      const meaningful = dropLeadingParentSegments(candidate.segments);
      if (meaningful.length < 1) continue;
      const classified = classifyPathJoinSegments(meaningful, { knownRepoSegments: segments });
      if (classified.kind !== "repo-relative-path") continue;
      assert.ok(
        fs.existsSync(path.join(REPO_ROOT, pathThatMustExist(classified.repoRelative))),
        `${classified.repoRelative} should exist after this task's repoint (found in ${file})`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// The matcher's own rules
// ---------------------------------------------------------------------------

test("stripComments blanks comments without touching string literals or line numbers", () => {
  const source = ['const a = "http://x/y"; // ../../src/gone.js', "/* ../../src/also-gone.js */", 'const b = "./real/path.ts";'].join("\n");
  const stripped = stripComments(source);

  assert.equal(stripped.length, source.length);
  assert.equal(stripped.split("\n").length, 3);
  assert.ok(stripped.includes('"http://x/y"'));
  assert.ok(stripped.includes('"./real/path.ts"'));
  assert.equal(stripped.includes("gone.js"), false, "a path mentioned only in a comment must not be swept");
});

test("stripComments keeps a // sequence that lives inside a string literal", () => {
  const stripped = stripComments('const u = "https://example.com/a"; const v = 1;');
  assert.ok(stripped.includes("https://example.com/a"));
  assert.ok(stripped.includes("const v = 1;"));
});

test("extractRelativeImportSpecifiers finds from/side-effect/dynamic/require forms and ignores bare specifiers", () => {
  const source = [
    'import fs from "node:fs";',
    'import { a } from "./a.js";',
    'export { b } from "../b.js";',
    'import "./side-effect.js";',
    'const c = await import("./dyn.js");',
    'const d = require("../req.js");',
    'import x from "@jini-ai/cms";',
  ].join("\n");

  assert.deepEqual(
    extractRelativeImportSpecifiers(source).map((s) => s.specifier).sort(),
    ["../b.js", "../req.js", "./a.js", "./dyn.js", "./side-effect.js"]
  );
});

test("resolveImportCandidates applies the .js-written/.ts-on-disk rewrite", () => {
  const candidates = resolveImportCandidates("/repo/development/scripts/x.ts", "./route-coverage-lib.js");
  assert.ok(candidates.includes("/repo/development/scripts/route-coverage-lib.js"));
  assert.ok(candidates.includes("/repo/development/scripts/route-coverage-lib.ts"));
});

test("resolveImportCandidates really resolves this repo's own .js-written imports", () => {
  const importerAbs = path.join(REPO_ROOT, "development/scripts/list-server-test-files.ts");
  const candidates = resolveImportCandidates(importerAbs, "./route-coverage-lib.js");
  assert.ok(candidates.some((c) => fs.existsSync(c)));
  assert.equal(fs.existsSync(path.join(REPO_ROOT, "development/scripts/route-coverage-lib.js")), false);
  assert.ok(fs.existsSync(path.join(REPO_ROOT, "development/scripts/route-coverage-lib.ts")));
});

test("classifyRepoRelativeString names the rule for every string it declines", () => {
  const segments = new Set(["src", "apps", "development", "content"]);
  const cases: readonly [string, string][] = [
    ["https://example.com/a/b", "url-scheme"],
    ["src/**/*.test.ts", "glob-or-regex-metacharacter"],
    ["find src/server -type f", "contains-whitespace"],
    ["#src/platform/db/schema.js", "package-imports-specifier"],
    ["@jini-ai/cms/dist/index.js", "scoped-package-specifier"],
    ["/Users/la/Programming/Tovu/src", "absolute-or-home-path"],
    ["~/src/thing.ts", "absolute-or-home-path"],
    ["node:fs/promises", "colon-bearing-specifier"],
    ["application/json", "not-a-known-repo-segment"],
    ["schema.ts", "no-path-separator"],
    ["../../src/gone.js", "parent-relative-outside-repo"],
    ["__tests__/", "trailing-separator"],
    ["text/html", "not-a-known-repo-segment"],
  ];

  for (const [value, expected] of cases) {
    const classified = classifyRepoRelativeString(value, { knownRepoSegments: segments });
    assert.equal(classified.kind, "skipped", `${value} should have been skipped`);
    if (classified.kind !== "skipped") continue;
    assert.equal(classified.reason, expected, `wrong rule for ${value}`);
    assert.ok(SKIP_REASONS.includes(classified.reason), `${expected} is not a declared SkipReason`);
  }
});

test("SKIP_REASONS is exactly the SkipReason union — neither the rule tables nor the type can grow alone", () => {
  // The Record forces TypeScript to reject this file if a SkipReason is added to the union without a
  // key here; the assertion rejects it if a rule is added to the tables without the union.
  const everyReason: Record<SkipReason, true> = {
    "own-import-specifier": true,
    "url-scheme": true,
    "glob-or-regex-metacharacter": true,
    "contains-whitespace": true,
    "package-imports-specifier": true,
    "scoped-package-specifier": true,
    "absolute-or-home-path": true,
    "colon-bearing-specifier": true,
    "no-path-separator": true,
    "parent-relative-outside-repo": true,
    "trailing-separator": true,
    "not-a-known-repo-segment": true,
  };
  assert.deepEqual(new Set(SKIP_REASONS), new Set(Object.keys(everyReason)));
});

test("classifyRepoRelativeString hands a `./` literal that is also an import specifier back to class 1", () => {
  const segments = new Set(["lib", "apps"]);
  const asString = classifyRepoRelativeString("./lib/openapi-operations.js", {
    knownRepoSegments: segments,
    ownImportSpecifiers: new Set(["./lib/openapi-operations.js"]),
  });
  assert.deepEqual(asString, { kind: "skipped", reason: "own-import-specifier" });

  // ...and without that hint it IS treated as repo-root-relative, which is what drizzle.config.ts needs.
  const withoutHint = classifyRepoRelativeString("./apps/website/src/platform/db/schema.ts", {
    knownRepoSegments: segments,
  });
  assert.deepEqual(withoutHint, { kind: "repo-relative-path", repoRelative: "apps/website/src/platform/db/schema.ts" });
});

test("classifyRepoRelativeString recognizes a first segment that only exists deeper in the tree — the whole point", () => {
  // `src` is not a repo-root entry any more; it exists at apps/website/src. Deriving the candidate
  // set from the ROOT LISTING alone would make every dead `src/...` string invisible.
  const segments = collectRepoSegments(REPO_ROOT);
  assert.equal(fs.existsSync(path.join(REPO_ROOT, "src")), false, "a root-level src/ would invalidate this test");
  assert.ok(segments.has("src"));
  assert.deepEqual(classifyRepoRelativeString("src/server", { knownRepoSegments: segments }), {
    kind: "repo-relative-path",
    repoRelative: "src/server",
  });
});

test("classifyRepoRelativeString [adversarial]: a trailing-/ literal with real directory structure is classified and checked, not exempted — the route-coverage-lib.ts escape", () => {
  const segments = collectRepoSegments(REPO_ROOT);

  // Same shape as `isMeasurableRouteFile`'s dead `src/server/routes/` prefix: multiple segments, the
  // slash is purely a writing style, and the target genuinely does not exist. Before this fix, the
  // unconditional `trailing-separator` rule skipped this outright and the sweep never probed it.
  assert.deepEqual(classifyRepoRelativeString("src/server/routes/", { knownRepoSegments: segments }), {
    kind: "repo-relative-path",
    repoRelative: "src/server/routes",
  });
  assert.equal(
    fs.existsSync(path.join(REPO_ROOT, pathThatMustExist("src/server/routes"))),
    false,
    "src/server/routes unexpectedly exists — the escape-proof case is vacuous"
  );

  // The live, fixed prefix from the same function: still classified (not exempted for its trailing
  // /), but now resolves because the directory it names is real.
  assert.deepEqual(
    classifyRepoRelativeString("apps/website/src/server/routes/", { knownRepoSegments: segments }),
    { kind: "repo-relative-path", repoRelative: "apps/website/src/server/routes" }
  );
  assert.ok(fs.existsSync(path.join(REPO_ROOT, pathThatMustExist("apps/website/src/server/routes"))));
});

test("classifyRepoRelativeString: a trailing-/ literal naming only ONE segment stays skipped — no regression for real non-path usage", () => {
  const segments = collectRepoSegments(REPO_ROOT);
  assert.ok(segments.has("__tests__"), "collectRepoSegments should find __tests__ as a directory name");

  // Verbatim shape of report-churn-hotspots.ts / check-src-complexity-drift.ts's own
  // `relPath.includes("__tests__/")` filter: a directory-NAME token, not a location to resolve. A
  // single segment plus a trailing / carries no more structure than the bare word does, and
  // `no-path-separator` already declines a bare "__tests__" for the same reason.
  assert.deepEqual(classifyRepoRelativeString("__tests__/", { knownRepoSegments: segments }), {
    kind: "skipped",
    reason: "trailing-separator",
  });
  assert.deepEqual(classifyRepoRelativeString("__tests__", { knownRepoSegments: segments }), {
    kind: "skipped",
    reason: "no-path-separator",
  });

  // Proven against the real file: sweeping it reports nothing for this literal.
  const reported = sweepFiles({ repoRoot: REPO_ROOT, files: ["development/scripts/report-churn-hotspots.ts"] });
  assert.deepEqual(
    reported.filter((f) => f.specifier.includes("__tests__")),
    []
  );
});

test("pathThatMustExist requires source files whole and non-source paths only down to their directory", () => {
  assert.equal(pathThatMustExist("apps/website/src/platform/db/schema.ts"), "apps/website/src/platform/db/schema.ts");
  assert.equal(pathThatMustExist("development/scripts/dev.mjs"), "development/scripts/dev.mjs");
  // a not-yet-generated artifact must not read as rot
  assert.equal(pathThatMustExist("development/coverage/lcov.unit.info"), "development/coverage");
  assert.equal(pathThatMustExist("src/server"), "src");
});

test("generated coverage artifacts are not reported as dead paths", () => {
  const artifacts = ["development/coverage/lcov.unit.info", "development/coverage/test-results.tap"];
  for (const a of artifacts) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, pathThatMustExist(a))), `${a}'s parent directory should exist`);
  }
  const reported = sweepTheRepo().filter((f) => artifacts.includes(f.attempted[0]!));
  assert.deepEqual(reported, []);
});

test("shouldScanStringsIn excludes test files' fixture paths but not their imports", () => {
  assert.equal(shouldScanStringsIn("development/scripts/__tests__/check-coverage-integrity.test.ts"), false);
  assert.equal(shouldScanStringsIn("development/scripts/__tests__/emit-dist-package-json.test.mjs"), false);
  assert.equal(shouldScanStringsIn("development/scripts/list-server-test-files.ts"), true);

  // check-coverage-integrity.test.ts asserts against `src/contracts/core/embeds/marker.ts`, a path
  // that has never existed — fixture data, not a reference the program follows. Its own relative
  // imports are still swept, and pass.
  const reported = sweepTheRepo().filter((f) => f.file.includes("__tests__/") && f.kind === "repo-relative-string");
  assert.deepEqual(reported, []);
});
