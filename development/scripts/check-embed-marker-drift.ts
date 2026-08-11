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
 * One judgment call worth naming: every static theme's `theme.json` still writes
 * `"activeAttr": "data-nav-current"` in its `slots` block. That's a JSON manifest VALUE, not HTML
 * markup — never in "attribute position" — and `static-render.ts`'s `resolveSlotMarker` only tests
 * `descriptor.activeAttr` for presence/absence today (`ffb54fd`); the string content is inert. Not
 * scanned by either check above (a JSON string value failing an HTML-attribute-shaped regex would be
 * a category error), and deliberately not RATCHETED here either, because another agent is separately
 * deciding whether to rename that field — this script would otherwise be asserting an opinion on a
 * decision explicitly delegated elsewhere, and could start failing (or passing) out from under that
 * work for reasons unrelated to real markup drift. It IS surfaced, as a non-blocking advisory line,
 * so it stays visible without gating anyone's unrelated work.
 *
 * Usage: npx tsx development/scripts/check-embed-marker-drift.ts
 *        npx tsx development/scripts/check-embed-marker-drift.ts --dir <path>   (scan an alternate
 *        directory instead of `src/themes` — used to self-test this script against a synthetic
 *        fixture without needing a real violation to exist; production behavior is unaffected)
 * Exit codes: 0 = no retired attribute in markup, no unparseable data-embed-config. 1 = at least one.
 */
import fs from "node:fs";
import path from "node:path";

import { scanEmbedMarkers, describeRejection } from "../../src/core/embeds/marker.js";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const dirFlagIndex = process.argv.indexOf("--dir");
const THEMES_DIR = dirFlagIndex === -1 ? path.join(REPO_ROOT, "src", "themes") : path.resolve(process.argv[dirFlagIndex + 1]);

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

/** Non-blocking: every `theme.json` `slots.*.activeAttr` whose VALUE still spells a retired
 * attribute name — see this file's header for why this is advisory, not a ratcheted failure. */
function findActiveAttrAdvisories(manifestPath: string): string[] {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { slots?: Record<string, { activeAttr?: string }> };
  const advisories: string[] = [];
  for (const [slotId, descriptor] of Object.entries(manifest.slots ?? {})) {
    if (descriptor.activeAttr !== undefined && RETIRED_ATTRS.includes(descriptor.activeAttr)) {
      advisories.push(`${path.relative(REPO_ROOT, manifestPath)}: slots.${slotId}.activeAttr = "${descriptor.activeAttr}" (inert value, presence-only today — not ratcheted, see file header)`);
    }
  }
  return advisories;
}

function printAdvisories(manifests: string[]): void {
  const advisories = manifests.flatMap(findActiveAttrAdvisories);
  if (advisories.length === 0) return;
  console.log(`check:embed-marker-drift — ${advisories.length} non-blocking activeAttr advisory(ies):`);
  for (const a of advisories) console.log(`  - ${a}`);
}

function main(): void {
  const htmlFiles = collectHtmlFiles(THEMES_DIR);
  const findings = htmlFiles.flatMap((file) => {
    const html = fs.readFileSync(file, "utf8");
    return [...findRetiredAttrFindings(file, html), ...findRejectedMarkerFindings(file, html)];
  });

  printAdvisories(collectThemeManifests(THEMES_DIR));

  if (findings.length === 0) {
    console.log(`check:embed-marker-drift — OK: ${htmlFiles.length} theme file(s) scanned, no retired attribute, no unparseable data-embed-config.`);
    return;
  }

  console.error(`check:embed-marker-drift — ${findings.length} violation(s):`);
  for (const f of findings) console.error(`  - ${path.relative(REPO_ROOT, f.file)}:${f.line}: ${f.message}`);
  process.exit(1);
}

main();
