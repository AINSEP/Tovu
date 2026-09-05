/**
 * Convert legacy `kind: "page"`, `bodyFormat: "doc"` rows to `bodyFormat: "html"`.
 *
 * ## Why this script exists
 *
 * Pages predate the Pages-vibecoding rework (SPEC-047/ADR-056): the current `PageEditor.tsx` only
 * ever produces `bodyFormat: "html"` rows, but a handful of Pages created before that rework are
 * still `bodyFormat: "doc"` (TipTap JSON) — leftovers, not a supported ongoing shape. Owner decision
 * (2026-08-11): Pages should be uniformly HTML. `our-story` is the deliberate exception (the
 * hand-set page-template proof of concept) and is never a target of this script.
 *
 * ## Why this uses `PagesHtmlDocumentStore.ensureHtmlFormat`, not raw SQL or ADR-041's migration path
 *
 * `PagesHtmlDocumentStore` (`src/features/pages/html-document-store.ts`) is the one real chokepoint
 * for a Page's HTML body: optimistic concurrency (version-conditioned compare-and-set) and
 * `entry_refs` re-indexing are already wired there, and duplicating either by hand here would be the
 * exact bug class that chokepoint exists to prevent. Its `write()` method requires the row to
 * ALREADY be `bodyFormat: "html"` (its own `WHERE bodyFormat = 'html'` clause) — the method that
 * performs the one-way `doc` -> `html` flip, seeds `body_html`, nulls `body_json`, and re-indexes
 * `entry_refs` is `ensureHtmlFormat(seedHtml)`, so that is what this script calls.
 *
 * ADR-041's `executeMigrateForward` is deliberately NOT used — that ADR governs schema/DDL ceremony
 * only, and its own text rejects raw-row content edits as a category error against the write
 * chokepoint model this codebase already commits to. This script performs a content edit through
 * that chokepoint, not a schema change.
 *
 * ## Conversion
 *
 * The TipTap `body_json` doc is walked by the SAME renderer public rendering already uses for a
 * `doc`-format Post's body (`renderDocNode`, `server/http/site/render.ts`) — reused, not
 * reimplemented, so a converted Page's body renders byte-identical to what it rendered as `doc`
 * (`entryContent`/`renderPostBody` wrap both formats in the exact same `<article>`/`.prose` chrome;
 * only what fills it differs). Legacy TipTap `image` nodes carrying only `attrs.src` (never a safe
 * value to trust onto public HTML — see that case's comment in `render.ts`) keep degrading to the
 * same placeholder they always have; this script does not change that behavior, it only reuses it.
 *
 * ## Safety
 *
 * Dry-run by default; `--apply` is required to write. A `--db` that does not resolve to a real,
 * already-existing file (the default included) fails loudly via `resolveExistingDbPath` before
 * anything is opened — `openContentDb` creates-and-migrates on open, so a typo'd path used to open
 * (and migrate) a brand-new empty database and report every allowlisted slug as "NOT FOUND" instead
 * of the real problem. A dry run itself opens strictly read-only (`openContentDbReadOnly`), so
 * unlike an ordinary `openContentDb` open it never migrates the schema either — only `--apply` does.
 *
 * A whole-file online-backup restore point (`@jini-ai/infra`'s `SqliteDbOpsAdapter`, the same
 * mechanism the admin Database panel uses) is captured immediately before the first write in an
 * `--apply` run, and its artifact ref is printed. Idempotent: `ensureHtmlFormat` no-ops (content
 * untouched) on a row already `bodyFormat: "html"`, so a second run over already-converted rows
 * changes nothing.
 *
 * A row is SKIPPED (not converted) if it is not `kind: "page"`, not `bodyFormat: "doc"`, or not in
 * the explicit slug allowlist below — this script never guesses which rows are "legacy Pages" by
 * scanning the table, on purpose: the allowlist is the record of what a human (this dispatch's
 * recon, cross-checked live) decided qualifies, so a future unrelated `doc`-format Page can never be
 * silently swept in by a broadened WHERE clause.
 *
 * Usage:
 *   npx tsx development/scripts/convert-legacy-doc-pages-to-html.ts               (dry run)
 *   npx tsx development/scripts/convert-legacy-doc-pages-to-html.ts --apply
 *   npx tsx development/scripts/convert-legacy-doc-pages-to-html.ts --db <path> --apply
 *
 * Exit codes: 0 = every allowlisted row already converted or converted cleanly. 1 = at least one
 * allowlisted row was not found, or was found in a shape this script refuses to touch (wrong kind).
 */
import path from "node:path";

import { openContentDb, openContentDbReadOnly, type ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../apps/website/src/platform/db/sqlite/db-ops.js";
import { SqliteEntryRefsRepo } from "../../apps/website/src/platform/db/sqlite/entry-refs-repo.sqlite.js";
import { PagesHtmlDocumentStore } from "../../apps/website/src/features/pages/html-document-store.sqlite.js";
import { renderDocNode } from "../../apps/website/src/server/inbound/public-http/http/site/render.js";
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
 * The explicit, human-decided set of legacy doc-format Pages this script is authorized to touch —
 * five published legal/info pages (recon, 2026-08-11) plus four empty draft stubs found live in
 * `content.db` while running this script (predate the recon; two, `untitled-2`/`untitled-3`, were not
 * in the recon's table at all — see this dispatch's handoff report for that discrepancy).
 * `our-story` is deliberately absent — it is the hand-set page-template demo and must stay `doc`.
 */
const TARGET_SLUGS: readonly string[] = [
  "terms-of-service",
  "privacy-policy",
  "contact",
  "team",
  "faq",
  "untitled",
  "untitled-2",
  "untitled-3",
  "untitled-4",
];

interface PostRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly slug: string;
  readonly kind: string;
  readonly bodyFormat: string;
  readonly bodyJson: string | null;
}

/**
 * Reads the allowlisted rows directly (one-off maintenance script operating on a database file, not
 * a request path — same posture `migrate-page-embed-markers.ts` already takes toward repo internals).
 *
 * @complexity O(k) — one indexed lookup per allowlisted slug (k = TARGET_SLUGS.length).
 */
function loadTargetRows(db: ContentDb): PostRow[] {
  const stmt = db.$client.prepare(
    "SELECT id, workspace_id AS workspaceId, slug, kind, body_format AS bodyFormat, body_json AS bodyJson FROM posts WHERE slug = ?"
  );
  return TARGET_SLUGS.map((slug) => stmt.get(slug) as PostRow | undefined).filter((row): row is PostRow => row !== undefined);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // Prove the database is really there BEFORE opening it: `openContentDb` creates-and-migrates on
  // open, so a mistyped path would otherwise open (and migrate) a brand-new empty database and
  // report every allowlisted slug as "NOT FOUND" instead of the real problem — no such database.
  const dbPath = resolveExistingDbPath(args.dbPath);
  // A dry run must never migrate the schema — which `openContentDb` does unconditionally. Only
  // `--apply` gets the read-write, migrating open; every dry run opens strictly read-only.
  const db = args.apply ? openContentDb(dbPath) : openContentDbReadOnly(dbPath);
  const clock = { nowIso: () => new Date().toISOString() };
  const entryRefsRepo = new SqliteEntryRefsRepo(db);

  const rows = loadTargetRows(db);
  const foundSlugs = new Set(rows.map((r) => r.slug));
  const missing = TARGET_SLUGS.filter((slug) => !foundSlugs.has(slug));
  for (const slug of missing) {
    console.error(`NOT FOUND: '${slug}' — no row with this slug exists. Nothing done for it.`);
  }

  let blocked = false;
  let restorePointCaptured = false;

  for (const row of rows) {
    if (row.kind !== "page") {
      console.error(`SKIPPED (wrong kind): '${row.slug}' is kind='${row.kind}', not 'page'. Refusing to touch.`);
      blocked = true;
      continue;
    }
    if (row.bodyFormat === "html") {
      console.log(`ALREADY HTML: '${row.slug}' — no-op (idempotent).`);
      continue;
    }
    if (row.bodyFormat !== "doc") {
      console.error(`SKIPPED (unexpected format): '${row.slug}' has bodyFormat='${row.bodyFormat}'.`);
      blocked = true;
      continue;
    }

    const bodyJson = row.bodyJson ? JSON.parse(row.bodyJson) : {};
    const seedHtml = renderDocNode(bodyJson);

    if (!args.apply) {
      console.log(`DRY RUN: '${row.slug}' would convert. Rendered body length: ${seedHtml.length} chars.`);
      continue;
    }

    if (!restorePointCaptured) {
      const dbOps = new SqliteDbOpsAdapter({ db, filePath: dbPath });
      const restorePoint = await dbOps.captureRestorePoint({ scopeId: "convert-legacy-doc-pages-to-html" });
      console.log(
        `RESTORE POINT CAPTURED: artifactRef='${restorePoint.artifactRef}' watermarkAtCapture=${restorePoint.watermarkAtCapture}`
      );
      restorePointCaptured = true;
    }

    const store = new PagesHtmlDocumentStore({ workspaceId: row.workspaceId, postId: row.id }, { db, clock, entryRefsRepo });
    await store.ensureHtmlFormat(seedHtml);
    console.log(`CONVERTED: '${row.slug}' (id=${row.id}). Rendered body length: ${seedHtml.length} chars.`);
  }

  if (missing.length > 0 || blocked) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
