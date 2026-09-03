/**
 * Embed-marker vocabulary drift check (embed-marker-migration.md item 4, 2026-08-10).
 *
 * `184 markers across 93 theme files` were consolidated onto one `data-embed-config` attribute
 * carrying JSON (`b7acc21`); `data-embed-type`, `data-embed-id`, `data-embed-variant`,
 * `data-tovu-slot`, `data-slot-variant`, and `data-nav-current` are retired, and the migration
 * doc's own words are "nothing may reintroduce them". Nothing enforced that until now — a theme
 * author (human or agent) hand-editing a `.html` file has no signal that these six names no longer
 * do anything.
 *
 * Two independent checks, same ratchet shape as `check:admin-complexity-drift`
 * (`check-admin-complexity-drift.ts` — report-only exit-1-on-violation, no CI wired up yet to
 * consume it, same disclosed posture):
 *
 * 1. A retired attribute name in real HTML ATTRIBUTE POSITION (`\s<name>\s*=`) in any theme `.html`
 *    file. Deliberately narrow, mirroring `check-outbox-bridge.ts`'s own stated philosophy (a shape
 *    check, not a parser) and `marker.ts`'s own file header (regex over a real HTML parser, for the
 *    same server-side/no-DOM/source-offset reasons) — this is that same style of check, not a new
 *    one. HTML comments are stripped before matching: several theme files narrate their OWN
 *    pre-migration history in prose (`"data-embed-type only substitutes a…"`), and a plain substring
 *    grep would flag all of them — the exact trap `theme-pages-render.canary.test.ts`'s first draft
 *    hit and had to correct for. A drift check an author disables within a week because it cries
 *    wolf on prose is worse than no check.
 * 2. Every `data-embed-config` value must parse as JSON and carry a `type` — asked of
 *    `scanEmbedMarkers`'s own `rejected` list (never a second parser; `marker.ts`'s file header is
 *    explicit that four independent regexes already drifted apart once) and reported through
 *    `describeRejection`, so a failure tells the author what they actually typed.
 *
 * Scope: `src/themes/**\/*.html` — the served/previewed markup surface. Explicitly NOT `.mjs`/`.md`
 * theme-authoring tooling and docs (`build-preview.mjs`, `NOTICE.md`, `src/themes/README.md`,
 * `theme-authoring-guide.md`): the migration doc's own "not done" list keeps "stale references to
 * the old vocabulary in comments and docs" as a SEPARATE item (7) from this drift check (item 4),
 * and at least one of those files is under active, unrelated edit as this check was written
 * (`src/themes/README.md`). Conflating the two would make this check's pass/fail depend on
 * someone else's in-flight, explicitly-delegated cleanup.
 *
 * 3. Any `slots.*.activeAttr` key in a theme `theme.json`. This was a non-blocking advisory until
 *    2026-08-10 and is now a hard failure — see {@link findLegacyActiveAttrFindings} for why the
 *    advisory was right then and wrong now, and why it fires on the KEY rather than the value.
 *
 * 3b. The retired post-template-slot placeholder `{"type":"post","id":"{{post}}"}` (2026-08-11
 *    unified-content-marker migration — see `ADS-memory/reports/design/
 *    2026-08-11-unified-content-marker-and-templates.md`). `injectPostEmbedId`, the function that
 *    used to substitute a real id into this exact literal, no longer exists — the unified
 *    `{"type":"content"}` marker (no id → the entity the route resolved) replaced it — so this
 *    literal string, wherever it still appears, is permanently dead: nothing will ever fill it in
 *    again, and the marker it sits in resolves to nothing forever. Same literal-substring-match
 *    style as check 1 (`RETIRED_ATTR_PATTERN`), for the same reason: `{{post}}` has no OTHER
 *    legitimate meaning as an `id` value now that the mechanism reading it is gone, so a plain
 *    substring match is precise enough without needing to also confirm the surrounding `"type"`.
 *
 * 4. Stored Page bodies (`posts.body_html` in `content.db`), same rules as checks 1, 2, and 3b.
 *    **Skipped, not failed, when no database is present**, so CI without one still passes.
 *
 *    Check 4 exists because of what checks 1-3 structurally cannot see, and it is not hypothetical:
 *    the `b7acc21` sweep covered 93 theme files ON DISK and every on-disk check reported OK, while a
 *    real Page in the database still carried `data-embed-type="form"` and had silently stopped
 *    rendering its contact form. A marker vocabulary check that only looks at the filesystem
 *    certifies half the surface and reads as if it certified all of it. Content is the other half.
 *
 *    Opens the database READ-ONLY, deliberately: `openContentDb` would run the migration stream and
 *    write a watermark row, and a check that mutates the thing it is checking is not a check.
 *
 * Usage: npx tsx development/scripts/check-embed-marker-drift.ts
 *        npx tsx development/scripts/check-embed-marker-drift.ts --dir <path>   (scan an alternate
 *        directory instead of `src/themes` — used to self-test this script against a synthetic
 *        fixture without needing a real violation to exist; production behavior is unaffected)
 *        npx tsx development/scripts/check-embed-marker-drift.ts --db <path>    (alternate content.db)
 *        npx tsx development/scripts/check-embed-marker-drift.ts --no-db        (skip check 4)
 * Exit codes: 0 = no retired attribute in markup or stored content, no unparseable
 *             data-embed-config, no legacy manifest field, no retired post-template placeholder.
 *             1 = at least one.
 */
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { scanEmbedMarkers, describeRejection } from "../../apps/website/src/contracts/core/embeds/marker.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const dirFlagIndex = process.argv.indexOf("--dir");
const THEMES_DIR = dirFlagIndex === -1 ? path.join(REPO_ROOT, "content", "themes") : path.resolve(process.argv[dirFlagIndex + 1]);
const dbFlagIndex = process.argv.indexOf("--db");
const CONTENT_DB = dbFlagIndex === -1 ? path.join(REPO_ROOT, "infra", "content.db") : path.resolve(process.argv[dbFlagIndex + 1]);
const SKIP_DB = process.argv.includes("--no-db");

const RETIRED_ATTRS = ["data-embed-type", "data-embed-id", "data-embed-variant", "data-tovu-slot", "data-slot-variant", "data-nav-current"];

/** One `\s<name>\s*=`-per-name alternation, built once — matches an attribute ASSIGNMENT, never a
 * bare mention, so prose like "`data-tovu-slot` only substitutes a…" (no trailing `=`) cannot trip
 * it. See this file's header for why that distinction is the whole point. */
const RETIRED_ATTR_PATTERN = new RegExp(`\\s(${RETIRED_ATTRS.join("|")})\\s*=`, "g");

interface Finding {
  file: string;
  line: number;
  message: string;
}

/** Recursively collects every `.html` file under `dir`. No exclusions beyond the extension filter —
 * unlike `check-admin-complexity-drift.ts`'s test-file exclusion, a theme's checked-in `preview/`
 * snapshots are real generated markup that can drift exactly like authored markup (and did, until
 * `65d011a`), so they are in scope, not carved out. */
function collectHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectHtmlFiles(full));
      continue;
    }
    if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

/** Recursively collects every `theme.json` under `dir`, for the activeAttr advisory only. */
function collectThemeManifests(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectThemeManifests(full));
      continue;
    }
    if (entry.name === "theme.json") out.push(full);
  }
  return out;
}

/** Same-length blank-out of every `<!-- … -->` block, newlines preserved so line numbers computed
 * against the result stay valid — the HTML-comment analog of `check-outbox-bridge.ts`'s own
 * `stripCommentsAndStrings` for JS, same reason: scan the stripped copy, report from real offsets. */
function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}

function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (content[i] === "\n") line++;
  return line;
}

/** Check 1 for one file: a retired attribute name in real assignment position, comments excluded. */
function findRetiredAttrFindings(file: string, html: string): Finding[] {
  const stripped = stripHtmlComments(html);
  const findings: Finding[] = [];
  for (const match of stripped.matchAll(RETIRED_ATTR_PATTERN)) {
    const index = match.index ?? 0;
    findings.push({ file, line: lineAt(html, index), message: `retired attribute "${match[1]}" is live in markup — the marker spine no longer reads it` });
  }
  return findings;
}

/** Check 2 for one file: every `data-embed-config` marker must parse and carry a `type`, asked of
 * `scanEmbedMarkers`'s own `rejected` list — never a second, drift-prone parser. */
function findRejectedMarkerFindings(file: string, html: string): Finding[] {
  const { rejected } = scanEmbedMarkers(html);
  return rejected.map((r) => ({ file, line: lineAt(html, r.index), message: describeRejection(r) }));
}

/** The retired post-template-slot placeholder value — see check 3b's own doc above. */
const RETIRED_POST_PLACEHOLDER = '"id":"{{post}}"';

/** Check 3b for one file: the retired `{"type":"post","id":"{{post}}"}` placeholder, comments
 * excluded (same `stripHtmlComments` pass check 1 already applies, for the same reason — a theme
 * file narrating its own migration history in prose must not trip this). */
function findRetiredPostPlaceholderFindings(file: string, html: string): Finding[] {
  const stripped = stripHtmlComments(html);
  const findings: Finding[] = [];
  let cursor = 0;
  for (;;) {
    const at = stripped.indexOf(RETIRED_POST_PLACEHOLDER, cursor);
    if (at === -1) break;
    findings.push({
      file,
      line: lineAt(html, at),
      message:
        'retired post-template-slot placeholder {"type":"post","id":"{{post}}"} — the substitution mechanism ' +
        '(injectPostEmbedId) that used to fill this in is gone; use {"type":"content"} instead (no id means ' +
        "\"the entity the route resolved\", the direct replacement — see the 2026-08-11 unified-content-marker design doc)",
    });
    cursor = at + RETIRED_POST_PLACEHOLDER.length;
  }
  return findings;
}

/**
 * Check 3: any `slots.*.activeAttr` in a theme manifest, BLOCKING as of 2026-08-10.
 *
 * This was a non-blocking advisory while the rename decision was open, and that was right — another
 * agent owned the decision, and this script had no business asserting an opinion that could start
 * failing out from under them. The decision landed in `bd7f97a`: the field is `honorsCurrentPage?:
 * boolean`, and all 6 in-repo manifests were migrated. With nothing left to break, the advisory
 * became a ratchet.
 *
 * Fails on the KEY's presence, not on its value. The old advisory only fired when the value spelled
 * a retired attribute name, which made sense while the field was live and its content was the
 * question. Now the field itself is the legacy — `"activeAttr": "anything-at-all"` is equally dead,
 * and flagging only the familiar spelling would let a hand-written variant through silently.
 *
 * `parseSlots` still ACCEPTS the legacy string, deliberately, so an out-of-tree theme keeps working.
 * That tolerance is for themes this check never scans; in-repo manifests are held to the new field.
 */
function findLegacyActiveAttrFindings(manifestPath: string): Finding[] {
  const raw = fs.readFileSync(manifestPath, "utf8");
  let manifest: { slots?: Record<string, { activeAttr?: unknown }> };
  try {
    manifest = JSON.parse(raw) as typeof manifest;
  } catch (err) {
    // A theme.json that does not parse is a real problem and must not crash this script with a bare
    // stack trace — it is reported like any other finding, naming the file.
    return [{ file: manifestPath, line: 1, message: `theme.json is not valid JSON (${(err as Error).message})` }];
  }

  const findings: Finding[] = [];
  // Cursor advances past each match so the Nth offending slot reports the Nth occurrence's line, not
  // the first one's. `Object.entries` preserves the manifest's own key order for these string keys,
  // which is what makes walking the two in step correct.
  let cursor = 0;
  for (const [slotId, descriptor] of Object.entries(manifest.slots ?? {})) {
    if (descriptor === null || typeof descriptor !== "object" || !Object.hasOwn(descriptor, "activeAttr")) continue;
    const at = raw.indexOf('"activeAttr"', cursor);
    if (at !== -1) cursor = at + 1;
    findings.push({
      file: manifestPath,
      line: lineAt(raw, at === -1 ? 0 : at),
      message:
        `retired manifest field "slots.${slotId}.activeAttr" — renamed to "honorsCurrentPage" (boolean) in bd7f97a. ` +
        "The value is inert; the field name is what static-render reads.",
    });
  }
  return findings;
}

/**
 * Check 4 — the same two markup rules applied to stored Page bodies. Returns `undefined` when there
 * is no database to check, which the caller reports as a SKIP rather than a pass: "no db present"
 * and "db present and clean" are different states, and printing OK for the first would be the exact
 * false assurance this check was added to remove.
 *
 * `file` on each finding is a `posts` locator rather than a path — these findings have no file, and
 * inventing one would send a reader to the filesystem for content that only exists in a row.
 */
function findStoredPageFindings(): { findings: Finding[]; scanned: number } | undefined {
  if (SKIP_DB || !fs.existsSync(CONTENT_DB)) return undefined;

  // READ-ONLY on purpose — see this file's header. A check must never migrate what it inspects.
  const db = new Database(CONTENT_DB, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare("SELECT id, slug, body_html AS bodyHtml FROM posts WHERE body_html IS NOT NULL")
      .all() as { id: string; slug: string; bodyHtml: string }[];

    const findings = rows.flatMap((row) => {
      const where = `posts/${row.slug} (${row.id})`;
      return [
        ...findRetiredAttrFindings(where, row.bodyHtml),
        ...findRejectedMarkerFindings(where, row.bodyHtml),
        ...findRetiredPostPlaceholderFindings(where, row.bodyHtml),
      ];
    });
    return { findings, scanned: rows.length };
  } finally {
    db.close();
  }
}

/** Findings carry either a real path or a `posts/...` row locator; only the former is relativized. */
function describeLocation(file: string): string {
  return file.startsWith("posts/") ? file : path.relative(REPO_ROOT, file);
}

function main(): void {
  const htmlFiles = collectHtmlFiles(THEMES_DIR);
  const findings = htmlFiles.flatMap((file) => {
    const html = fs.readFileSync(file, "utf8");
    return [
      ...findRetiredAttrFindings(file, html),
      ...findRejectedMarkerFindings(file, html),
      ...findRetiredPostPlaceholderFindings(file, html),
    ];
  });
  findings.push(...collectThemeManifests(THEMES_DIR).flatMap(findLegacyActiveAttrFindings));

  const stored = findStoredPageFindings();
  if (stored) findings.push(...stored.findings);
  const storedNote = stored
    ? `${stored.scanned} stored Page body(ies) scanned`
    : `stored Page bodies SKIPPED (${SKIP_DB ? "--no-db" : `no database at ${path.relative(REPO_ROOT, CONTENT_DB)}`})`;

  if (findings.length === 0) {
    console.log(
      `check:embed-marker-drift — OK: ${htmlFiles.length} theme file(s) scanned, ${storedNote}; no retired attribute, no unparseable data-embed-config, no legacy activeAttr, no retired post-template placeholder.`
    );
    return;
  }

  console.error(`check:embed-marker-drift — ${findings.length} violation(s) (${htmlFiles.length} theme file(s) scanned, ${storedNote}):`);
  for (const f of findings) console.error(`  - ${describeLocation(f.file)}:${f.line}: ${f.message}`);
  process.exit(1);
}

main();
