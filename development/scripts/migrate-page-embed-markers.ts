/**
 * Migrate STORED Page bodies onto the `data-embed-config` marker spine (embed-marker-migration.md).
 *
 * ## Why this script exists
 *
 * The 2026-08-10 marker unification (`b7acc21`) swept 184 markers across 93 theme files ON DISK.
 * Page bodies do not live on disk — they live in `posts.body_html` in `content.db`, and they were
 * never swept. A stored Page still carrying `data-embed-type="…"` is not merely stale spelling: the
 * shared parser (`src/contracts/core/embeds/marker.ts`) reads `data-embed-config` and nothing else, so such a
 * marker is INVISIBLE to every consumer. It renders to the visitor as an inert empty `<div>`, and its
 * `entry_refs` row (written under the pre-migration locator format) points at nothing any current
 * code path would reproduce. The embed is silently dead and nothing reports it.
 *
 * ## Why this reads the retired attributes with its own pattern
 *
 * Every other consumer in this codebase is forbidden from writing a marker regex — there is ONE
 * parser and they all call it. This script is the single exception, and structurally has to be: its
 * whole job is reading the spelling the shared parser deliberately cannot see. A migration from an
 * old format needs a reader for the old format. `scanEmbedMarkers` is still used here, as the
 * VERIFIER — every rewritten body is re-parsed with it and the run aborts if the result does not come
 * back clean, so the shared parser remains the authority on what a valid marker is.
 *
 * ## The `form` type
 *
 * `form` was removed as an embed type on 2026-08-10 (see
 * `development/docs/architecture/embed-type-inventory.md`). A stored `form` marker's id is a Forms
 * DEFINITION id, so it cannot simply be re-spelled — the replacement is a `contact-form` WIDGET
 * instance whose `config.formDefinitionId` is that same definition. This script looks for a live,
 * non-trash/purged one and rewrites the marker to point at it. **It never creates one.** If no
 * matching widget instance exists, the row is reported as BLOCKED and left byte-for-byte untouched:
 * fabricating owner content to make a migration finish is worse than stopping and saying so.
 *
 * ## Safety
 *
 * Dry-run by default; `--apply` is required to write. A `--db` that does not resolve to a real,
 * already-existing file (the default included) fails loudly via `resolveExistingDbPath` before
 * anything is opened — `openContentDb` creates-and-migrates on open, so a typo'd path used to open
 * (and migrate) a brand-new empty database and report "no stored Page body carries a retired
 * attribute" instead of the real problem. A dry run itself opens strictly read-only
 * (`openContentDbReadOnly`), so unlike an ordinary `openContentDb` open it never migrates the schema
 * either — only `--apply` does.
 *
 * Every body is backed up to the report before it is replaced, and `--apply` prints the exact SQL
 * to reverse each row. Idempotent: a second run over migrated content finds nothing to do and exits
 * 0.
 *
 * Usage:
 *   npx tsx development/scripts/migrate-page-embed-markers.ts               (dry run, default db)
 *   npx tsx development/scripts/migrate-page-embed-markers.ts --apply
 *   npx tsx development/scripts/migrate-page-embed-markers.ts --db <path> --apply
 *
 * Exit codes: 0 = nothing to do, or everything migrated. 1 = at least one row is BLOCKED (needs a
 * human decision), or a rewritten body failed the shared parser's own re-check.
 */
import path from "node:path";

import { openContentDb, openContentDbReadOnly, type ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { scanEmbedMarkers, describeRejection } from "../../apps/website/src/contracts/core/embeds/marker.js";
import { extractHtmlEntryRefs } from "../../apps/website/src/contracts/core/entry-refs/extractor.js";
import { SqliteEntryRefsRepo } from "../../apps/website/src/platform/db/sqlite/entry-refs-repo.sqlite.js";
import { resolveExistingDbPath } from "./backfill-db-path.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

interface Args {
  readonly dbPath: string;
  readonly apply: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const dbFlag = argv.indexOf("--db");
  return {
    dbPath: dbFlag === -1 ? path.join(REPO_ROOT, "infra", "content.db") : path.resolve(argv[dbFlag + 1]),
    apply: argv.includes("--apply"),
  };
}

/**
 * The retired vocabulary, as it was actually written into Page bodies before `b7acc21` — recovered
 * from the pre-migration `html-embeds.ts` rather than guessed. `data-embed-type` is the anchor; the
 * other three are optional siblings inside the SAME open tag.
 */
const RETIRED_TYPE_ATTR = /\sdata-embed-type\s*=\s*"([a-z][a-z0-9-]*)"/i;
const RETIRED_SIBLING_ATTRS = ["data-embed-id", "data-embed-name", "data-embed-variant"] as const;

/** Any element (not only `<div>`) carrying `data-embed-type`, captured with its full attribute run. */
const RETIRED_ELEMENT = /<([a-z]+)((?:\s+[^>]*?)?\sdata-embed-type\s*=\s*"[^"]*"(?:\s+[^>]*?)?)\s*>/gi;

function attrValue(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? match[1] : undefined;
}

/** Strip every retired embed attribute from an attribute run, leaving the author's own attributes
 * (`class`, `aria-label`, `data-agent-element`, …) in place and in order. */
function stripRetiredAttrs(attrs: string): string {
  let out = attrs.replace(RETIRED_TYPE_ATTR, "");
  for (const name of RETIRED_SIBLING_ATTRS) {
    out = out.replace(new RegExp(`\\s${name}\\s*=\\s*"[^"]*"`, "i"), "");
  }
  return out;
}

/** One marker found in the retired spelling, plus what it should become. */
interface PlannedMarker {
  readonly whole: string;
  readonly tag: string;
  readonly survivingAttrs: string;
  readonly oldType: string;
  readonly oldId: string | undefined;
  readonly config: Record<string, string> | undefined;
  /** Set when this marker cannot be migrated without a human decision. */
  readonly blocked: string | undefined;
}

/**
 * Resolve a retired `form` marker onto the `contact-form` widget instance that replaces it.
 * Returns the widget's ENTRY id, or `undefined` when no live one references that form definition.
 *
 * Reads `entries` directly rather than through `EntryRepoPort` because this is a one-off maintenance
 * script operating on a database file, not a request path — the same posture
 * `check-*-drift.ts` scripts already take toward repo internals.
 *
 * @complexity O(w) over the workspace's `widget`-type entries, once per run (the caller memoizes).
 */
function findContactFormWidget(db: ContentDb, workspaceId: string, formDefinitionId: string): string | undefined {
  const rows = db.$client
    .prepare("SELECT id, fields_json AS fieldsJson FROM entries WHERE workspace_id = ? AND type = 'widget'")
    .all(workspaceId) as { id: string; fieldsJson: string }[];

  const match = rows.find((row) => {
    const payload = readWidgetPayload(row.fieldsJson);
    if (payload === undefined) return false;
    if (payload.widgetType !== "contact-form") return false;
    if (payload.status === "trash" || payload.status === "purged") return false;
    return payload.config?.formDefinitionId === formDefinitionId;
  });
  return match?.id;
}

interface WidgetPayload {
  readonly widgetType?: string;
  readonly config?: Record<string, unknown>;
  readonly status?: string;
}

/** The doubly-encoded widget payload (`fields_json.ext.widget.payload` is itself a JSON string).
 * `undefined` for any row this script cannot read — an unreadable widget is not a migration
 * candidate, and it is also not this script's problem to repair. */
function readWidgetPayload(fieldsJson: string): WidgetPayload | undefined {
  try {
    const fields = JSON.parse(fieldsJson) as { ext?: { widget?: { payload?: string } } };
    const raw = fields.ext?.widget?.payload;
    return typeof raw === "string" ? (JSON.parse(raw) as WidgetPayload) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Plan every retired marker in one body. Pure with respect to the database except for the
 * `resolveForm` callback, which is injected so the planning logic stays directly testable and so the
 * `form` lookup strategy is visible at the call site rather than buried here.
 */
function planMarkers(html: string, resolveForm: (formDefinitionId: string) => string | undefined): PlannedMarker[] {
  return [...html.matchAll(RETIRED_ELEMENT)].map((match) => {
    const [whole, tag, attrs] = match as unknown as [string, string, string];
    const oldType = (attrs.match(RETIRED_TYPE_ATTR)?.[1] ?? "").toLowerCase();
    const oldId = attrValue(attrs, "data-embed-id");
    const base = { whole, tag, survivingAttrs: stripRetiredAttrs(attrs), oldType, oldId };
    const outcome = oldType === "form" ? planFormMarker(oldId, resolveForm) : { config: plainConfig(oldType, oldId, attrs), blocked: undefined };
    return { ...base, ...outcome };
  });
}

/** The straight re-spelling every surviving type takes: the retired attribute triple becomes config
 * keys of the same names, with absent attributes staying absent rather than becoming `null`. */
function plainConfig(oldType: string, oldId: string | undefined, attrs: string): Record<string, string> {
  const config: Record<string, string> = { type: oldType };
  if (oldId !== undefined) config.id = oldId;
  const name = attrValue(attrs, "data-embed-name");
  if (name !== undefined) config.name = name;
  const variant = attrValue(attrs, "data-embed-variant");
  if (variant !== undefined) config.variant = variant;
  return config;
}

/** The one type that cannot be re-spelled — see this file's header. Either a live `contact-form`
 * widget instance already carries this form definition (rewrite onto it) or the marker is BLOCKED
 * for a human; this script never creates the widget itself. */
function planFormMarker(
  oldId: string | undefined,
  resolveForm: (formDefinitionId: string) => string | undefined
): { config: Record<string, string> | undefined; blocked: string | undefined } {
  if (oldId === undefined) {
    return { config: undefined, blocked: 'a "form" marker with no data-embed-id — there is no form definition to migrate it onto' };
  }
  const widgetEntryId = resolveForm(oldId);
  if (widgetEntryId === undefined) {
    return {
      config: undefined,
      blocked: `no live contact-form widget instance references form definition ${oldId} — create one (config.formDefinitionId = ${oldId}) and re-run, or migrate this marker by hand`,
    };
  }
  return { config: { type: "widget", id: widgetEntryId }, blocked: undefined };
}

/** Rewrite one body from its plan. Applied right-to-left via `split`/`join` on the exact matched
 * text, so an unmigrated (blocked) marker is left byte-for-byte as authored. */
function rewriteBody(html: string, planned: readonly PlannedMarker[]): string {
  let out = html;
  for (const marker of planned) {
    if (marker.config === undefined) continue;
    const attrs = marker.survivingAttrs.trimEnd();
    const config = `data-embed-config='${JSON.stringify(marker.config)}'`;
    out = out.replace(marker.whole, `<${marker.tag}${attrs ? `${attrs} ` : " "}${config}>`);
  }
  return out;
}

interface RowPlan {
  readonly id: string;
  readonly slug: string;
  readonly workspaceId: string;
  readonly before: string;
  readonly after: string;
  readonly planned: readonly PlannedMarker[];
}

function planRows(db: ContentDb): RowPlan[] {
  const rows = db.$client
    .prepare(
      "SELECT id, slug, workspace_id AS workspaceId, body_html AS bodyHtml FROM posts WHERE body_html LIKE '%data-embed-type%'"
    )
    .all() as { id: string; slug: string; workspaceId: string; bodyHtml: string }[];

  return rows.map((row) => {
    const memo = new Map<string, string | undefined>();
    const planned = planMarkers(row.bodyHtml, (formDefinitionId) => {
      if (!memo.has(formDefinitionId)) memo.set(formDefinitionId, findContactFormWidget(db, row.workspaceId, formDefinitionId));
      return memo.get(formDefinitionId);
    });
    return { id: row.id, slug: row.slug, workspaceId: row.workspaceId, before: row.bodyHtml, after: rewriteBody(row.bodyHtml, planned), planned };
  });
}

/** Re-extract `entry_refs` for EVERY html-format Page, not only the rewritten ones. The locator
 * format itself changed in this migration (`bodyHtml[data-embed-type=form#1]` ->
 * `bodyHtml[embed:widget#1]`), so a page whose markers were already migrated by hand can still carry
 * stale rows. Extraction is a pure function of the stored body, so doing all of them is idempotent
 * and makes the index match the content by construction rather than by bookkeeping. */
async function reextractAllHtmlPages(db: ContentDb): Promise<number> {
  const repo = new SqliteEntryRefsRepo(db);
  const pages = db.$client
    .prepare("SELECT id, workspace_id AS workspaceId, body_html AS bodyHtml FROM posts WHERE body_format = 'html' AND body_html IS NOT NULL")
    .all() as { id: string; workspaceId: string; bodyHtml: string }[];

  for (const page of pages) {
    const refs = extractHtmlEntryRefs({ workspaceId: page.workspaceId, sourceEntryId: page.id, html: page.bodyHtml });
    await repo.replaceForSource({ workspaceId: page.workspaceId, sourceEntryId: page.id, refs });
  }
  return pages.length;
}

function reportRow(plan: RowPlan): void {
  console.log(`\n  page ${plan.slug} (${plan.id})`);
  for (const marker of plan.planned) {
    if (marker.blocked !== undefined) {
      console.error(`    BLOCKED  data-embed-type="${marker.oldType}"${marker.oldId ? ` id="${marker.oldId}"` : ""} — ${marker.blocked}`);
      continue;
    }
    console.log(`    migrate  data-embed-type="${marker.oldType}"${marker.oldId ? ` id="${marker.oldId}"` : ""}  ->  ${JSON.stringify(marker.config)}`);
  }
}

/** The shared parser is the authority on whether the rewrite produced a valid marker — never this
 * script's own pattern. A body that comes back with rejections is not written. */
function verifyRewrite(plan: RowPlan): string[] {
  const { rejected } = scanEmbedMarkers(plan.after);
  return rejected.map((r) => `${plan.slug} (${plan.id}): ${describeRejection(r)}`);
}

/** Print the reversal statements, then write. Reversal FIRST and unconditionally: if the write step
 * dies partway, the operator still has the undo for what did land. */
function applyRows(db: ContentDb, changed: readonly RowPlan[]): void {
  console.log("\n  Reversal SQL (run against this same db to undo):");
  for (const plan of changed) {
    console.log(`    UPDATE posts SET body_html = ${quoteSql(plan.before)} WHERE id = '${plan.id}';`);
  }
  const update = db.$client.prepare("UPDATE posts SET body_html = ? WHERE id = ?");
  for (const plan of changed) update.run(plan.after, plan.id);
  console.log(`\n  WROTE ${changed.length} page body(ies).`);
}

/** Abort before any write if the shared parser rejects a rewritten body. Never returns when it
 * fires — the process exits rather than writing markup no consumer could read. */
function abortOnUnparseableRewrite(changed: readonly RowPlan[]): void {
  const problems = changed.flatMap(verifyRewrite);
  if (problems.length === 0) return;
  console.error(`\n  ABORT: ${problems.length} rewritten body(ies) failed the shared parser's own re-check — nothing was written:`);
  for (const p of problems) console.error(`    - ${p}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  // Prove the database is really there BEFORE opening it: `openContentDb` creates-and-migrates on
  // open, so a mistyped path would otherwise open (and migrate) a brand-new empty database and
  // report a false "nothing to do" instead of the real problem — no such database.
  const dbPath = resolveExistingDbPath(args.dbPath);
  console.log(`migrate-page-embed-markers — db: ${dbPath}${args.apply ? "" : "  (DRY RUN — pass --apply to write)"}`);

  // A dry run must never migrate the schema — which `openContentDb` does unconditionally. Only
  // `--apply` gets the read-write, migrating open; every dry run opens strictly read-only.
  const db = args.apply ? openContentDb(dbPath) : openContentDbReadOnly(dbPath);
  const plans = planRows(db);
  const changed = plans.filter((p) => p.after !== p.before);
  const blockedCount = plans.reduce((n, p) => n + p.planned.filter((m) => m.blocked !== undefined).length, 0);

  if (plans.length === 0) console.log("  OK: no stored Page body carries a retired data-embed-type attribute.");
  for (const plan of plans) reportRow(plan);
  abortOnUnparseableRewrite(changed);

  if (args.apply) {
    if (changed.length > 0) applyRows(db, changed);
    console.log(`  Re-extracted entry_refs for ${await reextractAllHtmlPages(db)} html-format page(s).`);
  } else if (changed.length > 0) {
    console.log(`\n  Would write ${changed.length} page body(ies) and re-extract entry_refs for every html-format page.`);
  }

  if (blockedCount > 0) {
    console.error(`\n  ${blockedCount} marker(s) BLOCKED — left untouched, see above. Exit 1.`);
    process.exit(1);
  }
}

/** Single-quoted SQL string literal with embedded quotes doubled — for the printed reversal
 * statement only, never for a query this script itself runs (those are all parameterized). */
function quoteSql(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

void main();
