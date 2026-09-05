/**
 * Governance ADR scope-glob drift check (2026-09-03).
 *
 * ## What this catches, and why it's needed
 *
 * `ADS-memory/governance/adrs/ADR-INDEX.md` is a hand-maintained table mapping each governance ADR
 * to the file-tree paths it governs, via `Scope Globs`. Implementation agents consult this table
 * via `skills/adr-governance/SKILL.md`'s just-in-time lookup: match the files about to be touched
 * against every ACCEPTED row's globs, and comply with (or record an exception against) any ADR that
 * matches. That lookup is silently worthless the moment a glob stops matching anything — the agent
 * gets a clean "nothing applies" and never learns the rule exists.
 *
 * That is exactly what happened here. The 2026-09-02 `apps/website` restructure moved the source
 * tree from `src/**` to `apps/website/src/**` (see `check-src-complexity-drift.ts`'s own SCOPE
 * HISTORY note and `dead-path-sweep.ts`'s header for the same defect class hitting other tooling),
 * but every scope glob in this index was still written against the pre-restructure `src/...` paths
 * — discovered 2026-09-03: three MANDATORY, ACCEPTED governance ADRs (GOV-ADR-001/002/003) governed
 * ZERO files. Two of the four ADRs also turned out to have a second, deeper problem once corrected:
 * their actually-governed construct had been extracted out of this repo entirely into `@jini-ai/cms`
 * (a separate repository) — a corrected glob can match real Tovu files without those files
 * containing the logic the ADR describes. See this repo's governance audit report for the full
 * per-ADR writeup; this script only checks the shallower, mechanically-verifiable defect (zero
 * matches), not the deeper "governed construct moved to another repo" case, which needs human
 * judgment.
 *
 * ## Why this is a NEW script, not an extension of `development/scripts/lib/dead-path-sweep.ts`
 *
 * `dead-path-sweep.ts` was read first, per this file's own dispatch brief, specifically so this
 * would extend it rather than duplicate it if that fit. It does not fit, for two independent,
 * load-bearing reasons — not just a difference in file type:
 *
 * 1. **Its `RAW_SKIP_RULES` deliberately reject any glob-metacharacter-bearing string** (that file's
 *    `glob-or-regex-metacharacter` rule, matching on `[*?{}[\]!()|^$+\\]`) — on purpose, because that
 *    sweep resolves a FIXED literal path against the filesystem and a glob is not one. Every scope
 *    glob in this index contains `*` or `**`, so every single one would be skipped by that rule by
 *    design, not by oversight. Bypassing that rule for this one caller would mean carrying two
 *    incompatible resolution semantics (existence-check vs. pattern-match) behind one shared skip-rule
 *    table built for the first.
 * 2. **It only walks `development/scripts/**` plus the db `*.config.ts` files**
 *    (`collectSweepTargets`), extracting string literals and import specifiers with a hand-rolled
 *    TypeScript/JavaScript lexer (`stripComments`/`tokenizeStringLiterals`). `ADR-INDEX.md` is a
 *    markdown table, not source code that lexer would ever tokenize.
 *
 * The operation this guard needs — "does at least one file in the repo match this glob pattern" —
 * is categorically different from `dead-path-sweep.ts`'s "does this one exact literal path exist",
 * which is why this is a new, small, purpose-built script rather than a bolt-on to that one.
 *
 * ## Glob support is intentionally narrow
 *
 * `globToRegExp` below supports exactly what this index's globs use today: literal path segments,
 * `*` as a within-segment wildcard, and `**` as a zero-or-more-path-segments wildcard (with or
 * without a trailing `/`). It does not support brace expansion, character classes, or negation —
 * none of the four ADRs in this index use them, and a general-purpose glob library is not a
 * declared dependency of this project (`minimatch`/`tinyglobby` are present only transitively, deep
 * under `../Jini`'s own `node_modules` via a workspace dependency, which is not something this
 * script should reach into). If a future ADR's scope glob needs a feature this does not support,
 * add the feature and its test rather than reaching past `dependencies`/`devDependencies`.
 *
 * Usage: npx tsx development/scripts/check-governance-adr-scope-drift.ts
 * Exit codes: 0 = every ACCEPTED row's every scope glob matches at least one real file.
 *             1 = at least one does not.
 */
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const ADR_INDEX_PATH = path.join(REPO_ROOT, "ADS-memory", "governance", "adrs", "ADR-INDEX.md");

export interface AdrIndexRow {
  readonly id: string;
  readonly title: string;
  readonly enforcement: string;
  readonly scopeGlobs: readonly string[];
  readonly status: string;
  readonly file: string;
}

const TABLE_ROW = /^\|(.+)\|\s*$/;

/** Strips one pair of wrapping backticks a cell may carry (`` `src/features/**` `` -> `src/features/**`). */
function unbacktick(cell: string): string {
  return cell.length >= 2 && cell.startsWith("`") && cell.endsWith("`") ? cell.slice(1, -1) : cell;
}

/** Splits one markdown table row into trimmed cells, or `[]` if the line is not a table row. */
function splitRow(line: string): readonly string[] {
  const match = TABLE_ROW.exec(line.trim());
  if (!match) return [];
  return match[1]!.split("|").map((cell) => cell.trim());
}

/**
 * Parses `ADR-INDEX.md`'s registry table into rows.
 *
 * HTML comments are stripped BEFORE line-splitting, not skipped by line — the file's own commented-
 * out example row (`<!-- Example row ... | GOV-ADR-001 | ... | -->`) is textually indistinguishable
 * from a real table row once rendered line-by-line; only the comment delimiters mark it as inert.
 * Stripping `/<!--[\s\S]*?-->/` first removes that whole block (and the "Add new entries above this
 * line" marker) before any row-shaped line is considered, so the duplicate `GOV-ADR-001` id in the
 * commented example is never parsed as a second real row.
 *
 * @param markdown raw contents of `ADR-INDEX.md`
 * @returns real table rows only — header, separator, and commented-out rows excluded
 * @complexity O(n) in file size.
 */
export function parseAdrIndexTable(markdown: string): readonly AdrIndexRow[] {
  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, "");
  const rows: AdrIndexRow[] = [];
  for (const line of withoutComments.split("\n")) {
    const cells = splitRow(line);
    if (cells.length !== 6) continue;
    const [id, title, enforcement, scopeGlobsCell, status, file] = cells as [string, string, string, string, string, string];
    if (id === "ID") continue; // header row
    if (cells.every((c) => c.length > 0 && /^-+$/.test(c))) continue; // separator row (|---|---|...)
    rows.push({
      id: unbacktick(id),
      title,
      enforcement,
      scopeGlobs: unbacktick(scopeGlobsCell)
        .split(";")
        .map((g) => g.trim())
        .filter((g) => g.length > 0),
      status,
      file: unbacktick(file),
    });
  }
  return rows;
}

const REGEX_METACHARS = /[.^$+?()|[\]{}\\]/;

interface GlobToken {
  /** the regex fragment this token translates to */
  readonly regexFragment: string;
  /** how many characters of the glob this token consumed */
  readonly consumed: number;
}

/**
 * Classifies and converts the single glob token starting at `glob[i]`. Split out of
 * {@link globToRegExp} purely to keep that function's complexity under the shop ceiling — four
 * sequential guard clauses instead of a nested if/else chain.
 *
 * @complexity O(1) — a fixed sequence of character comparisons.
 */
function nextGlobToken(glob: string, i: number): GlobToken {
  const c = glob[i]!;
  if (c === "*" && glob[i + 1] === "*" && glob[i + 2] === "/") return { regexFragment: "(?:.*/)?", consumed: 3 }; // "**/" — zero or more whole path segments, including none
  if (c === "*" && glob[i + 1] === "*") return { regexFragment: ".*", consumed: 2 }; // trailing/standalone "**" — anything, including "/"
  if (c === "*") return { regexFragment: "[^/]*", consumed: 1 }; // single "*" — within one path segment only
  if (REGEX_METACHARS.test(c)) return { regexFragment: `\\${c}`, consumed: 1 };
  return { regexFragment: c, consumed: 1 };
}

/**
 * Converts one scope glob to a `RegExp`, per the narrow support this file's header documents.
 *
 * @param glob a single glob (already split out of a `;`-joined Scope Globs cell)
 * @returns a `RegExp` anchored full-string (`^...$`) against a repo-relative, forward-slash path
 * @complexity O(n) in glob length.
 */
export function globToRegExp(glob: string): RegExp {
  let out = "";
  let i = 0;
  while (i < glob.length) {
    const token = nextGlobToken(glob, i);
    out += token.regexFragment;
    i += token.consumed;
  }
  return new RegExp(`^${out}$`);
}

/** Whether `glob` matches at least one repo-relative path in `files`. */
export function globMatchesAnyFile(glob: string, files: readonly string[]): boolean {
  const re = globToRegExp(glob);
  return files.some((f) => re.test(f));
}

const PRUNED_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

/**
 * Every file in the repo, repo-relative with forward slashes, pruning heavy/irrelevant directories
 * by name (build output and VCS internals — the same category `dead-path-sweep.ts`'s
 * `collectRepoSegments` prunes, for the same reason: a name that only exists inside one of these is
 * not a location a scope glob would ever legitimately name).
 *
 * @param repoRoot absolute repository root
 * @returns repo-relative file paths, in directory-walk order
 * @complexity O(f) in files visited; one `readdirSync` per directory.
 */
export function collectRepoFiles(repoRoot: string): readonly string[] {
  const out: string[] = [];
  const walk = (relDir: string): void => {
    const abs = path.join(repoRoot, relDir);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (PRUNED_DIRS.has(entry.name)) continue;
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(rel);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  };
  walk("");
  return out;
}

export interface EmptyGlobViolation {
  readonly adrId: string;
  readonly status: string;
  readonly glob: string;
}

/**
 * ACCEPTED rows whose scope glob(s) match zero files today. Mirrors the `adr-governance` skill's own
 * rule of matching only `Status = ACCEPTED` rows (`PROPOSED`/`SUPERSEDED`/`DEPRECATED` are not
 * consulted for enforcement, so a dead glob there is not yet a live gap — still worth correcting for
 * accuracy, but not a gate failure).
 *
 * @complexity O(r · g · f) in rows, globs per row, and files — small in practice (a handful of rows
 * and globs against a few thousand files).
 */
export function findEmptyGlobs(rows: readonly AdrIndexRow[], files: readonly string[]): readonly EmptyGlobViolation[] {
  const violations: EmptyGlobViolation[] = [];
  for (const row of rows) {
    if (row.status !== "ACCEPTED") continue;
    for (const glob of row.scopeGlobs) {
      if (!globMatchesAnyFile(glob, files)) {
        violations.push({ adrId: row.id, status: row.status, glob });
      }
    }
  }
  return violations;
}

/**
 * The notice printed when `ADR-INDEX.md` is absent — this script's total-skip case, not its "ok"
 * case. Pulled out as a pure function (rather than an inline `console.log` string) so a test can pin
 * its wording: this exact message is what stops the gate from reading as "checked, all clear" on
 * every machine except the one where `ADS-memory/governance/` happens to exist locally (see
 * `main`'s own comment, and the file header's "Why this is a NEW script" section's governance audit
 * reference). A silent `console.log("... ok ...")` here was the original, vacuous form — this
 * function is what a future regression back to that wording would break.
 *
 * @param relIndexPath `ADR-INDEX.md`'s path, relative to the repo root, for the message
 * @returns the full notice text
 * @complexity O(1).
 */
export function missingIndexNotice(relIndexPath: string): string {
  return (
    `check:governance-adr-scope-drift — SKIPPED (nothing verified): no ${relIndexPath} on this checkout. ` +
    "ADS-memory/governance/ is untracked by design (see .gitignore) - every governance ADR's scope glob is " +
    "UNVERIFIED here, and will be on any fresh clone or CI runner too. This is an expected, healthy state, " +
    "not a tooling failure - but do not read it as a passing check, because nothing was checked."
  );
}

function main(): void {
  // Mirrors `skills/adr-governance/SKILL.md`'s own stated rule ("If the file does not exist or the
  // table is empty, no governance ADRs apply — skip"). Load-bearing here, not just symmetric: this
  // file lives under `ADS-memory/governance/`, which `.gitignore` marks local-only (only
  // `ADS-memory/reports|specs|specs_as_built/` are tracked — see that rule's own comment). A fresh
  // clone or CI runner has no `ADS-memory/` at all until `ads-initialization.sh` seeds it from an
  // EMPTY template (`AI-Dev-Shop/project-knowledge-template/governance/adrs/ADR-INDEX.md` — zero
  // rows), so "the file is missing" is an expected, healthy state there, not a tooling failure.
  //
  // Exiting 0 here (rather than failing) is deliberate and unchanged: this script is not wired into
  // `package.json`/`ci.yml` today (confirmed by the 2026-09-05 governance audit), and the missing-file
  // case is the NORMAL case on every machine but this developer's, not an error condition — failing
  // it would break the moment anyone DID wire this in. What changed is the message: `console.warn`
  // (not `console.log`) and wording that says SKIPPED, not "ok", because a bare "ok" here reads as
  // "checked, passed" when the honest status is "could not check anything on this machine."
  if (!fs.existsSync(ADR_INDEX_PATH)) {
    console.warn(missingIndexNotice(path.relative(REPO_ROOT, ADR_INDEX_PATH)));
    return;
  }
  const markdown = fs.readFileSync(ADR_INDEX_PATH, "utf8");
  const rows = parseAdrIndexTable(markdown);
  const files = collectRepoFiles(REPO_ROOT);
  const violations = findEmptyGlobs(rows, files);
  const acceptedCount = rows.filter((r) => r.status === "ACCEPTED").length;

  if (violations.length === 0) {
    console.log(
      `check:governance-adr-scope-drift — ok — every ACCEPTED governance ADR's scope glob matches at least one file (${acceptedCount} ACCEPTED row(s) checked).`
    );
    return;
  }

  console.error(`check:governance-adr-scope-drift — ${violations.length} ACCEPTED governance ADR scope glob(s) match ZERO files:`);
  for (const v of violations) console.error(`  - ${v.adrId}: '${v.glob}'`);
  console.error(
    "\nA MANDATORY/DEFAULT governance ADR whose scope glob matches nothing is silently unenforceable — " +
      "the adr-governance skill's just-in-time lookup will always report 'nothing applies' for it. Repoint " +
      "the glob in ADS-memory/governance/adrs/ADR-INDEX.md to the construct's real current location. If the " +
      "governed construct no longer exists anywhere, escalate to the ADR owner rather than deleting the row."
  );
  process.exit(1);
}

// Guarded, following check-src-complexity-drift.ts's own precedent: this file is also imported as a
// plain module by its own unit test, which exercises the pure functions directly without running the
// real scan against the real repo on every test run.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
