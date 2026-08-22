import Database from "better-sqlite3";

import type { CapabilityCard } from "./capability-source-registry.js";

/**
 * @file A local FTS5 + `bm25()` index over an already-gathered `readonly CapabilityCard[]` —
 * `capability-tool-registrations.ts`'s `capability_search`/`capability_get` backing store, the
 * sibling of `tool-catalog-query.ts` (which backs `search_tools`/`describe_tool` the same way) and
 * `component-catalog-query.ts` (which backs `search_components`/`describe_component`).
 *
 * **A local schema, not `@jini-ai/sqlite`'s `tool_catalog`.** That table is `(id, description,
 * input_schema_json, source, updated_at)` — verified, no `kind` column, and no room for `pluginId`/
 * `skillName`/`revision` as first-class columns either. Reusing it would mean either overloading an
 * existing column (`source` already means something specific there: the tool id's own domain
 * prefix) or editing a published, cross-repo package for one feature slice's own card shape. A small
 * local schema costs nothing extra at this scale (tens of cards, not thousands) and keeps this
 * slice's columns honestly its own.
 *
 * **Two synchronous entry points, built from an already-async-gathered list.** Gathering cards is
 * inherently async — each registered `CapabilitySource.list(ctx)` is a `Promise`, per
 * `capability-source-registry.ts` — but once the list is in hand, indexing and querying it is pure,
 * synchronous SQLite work, exactly like `tool-catalog-query.ts`'s `search`/`describe` are synchronous
 * once `registry.list()` has already been read. Keeping that split explicit is what lets this module
 * be tested with a plain in-memory fixture array and no `CapabilitySource`, registry, or filesystem
 * in sight — `capability-tool-registrations.ts` owns the async gather (and its own lazy,
 * shared-in-flight-promise memoization); this module owns turning the result into a queryable index.
 *
 * **The handle boundary.** `CapabilityCard.handle` is carried into this module's storage (`get()`
 * returns it — `capability_get`'s handler needs it, in-process, to call the owning
 * `CapabilitySource.read()`) but is NEVER selected by `search()`, which only ever returns the
 * discovery-facing subset. This is deliberate, not an oversight: a search hit is exactly what a
 * `capability_search` tool response returns to the model, and `handle` carries absolute host paths
 * that must never cross that boundary (see `capability-source-registry.ts`'s own doc on
 * `CapabilityCard.handle`). `capability-tool-registrations.ts`'s `capability_get` handler is what
 * strips `handle` back off before its own response leaves the process — this module's job stops at
 * never including it in `search()`'s output in the first place.
 *
 * **`kind` filtering happens inside the SQL `WHERE` clause**, in the SAME statement as the FTS5
 * `MATCH`/`ORDER BY`/`LIMIT` — not as a `.filter()` applied to an already-limited JS array. The
 * difference is observable: a post-filter can silently return FEWER than `limit` results (or none at
 * all) when the top-`limit` unfiltered rows happen not to be the requested kind, even though matching
 * rows of that kind exist further down the ranking. See this file's own test for the differential
 * case that would catch a regression to the post-filter shape.
 */

/** Alphanumeric tokens only — same discipline as `tool-catalog-query.ts`'s indexing precedent (via
 *  `@jini-ai/sqlite`'s `tokenize`): an FTS5 MATCH string built from these can never contain FTS5
 *  query-syntax operators (`"`, `*`, `NOT`, `NEAR`, column filters), so a query string is never
 *  treated as anything but plain OR'd terms. */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function requireNonEmptyQuery(query: string): void {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("capability_search: 'query' (non-empty string) is required");
  }
}

function requireNonEmptyId(id: string): void {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error("capability_get: 'id' (non-empty string) is required");
  }
}

/** One `capability_search` result — {@link CapabilityCard} minus `handle`, plus a rank-derived
 *  `score`. See this file's header for why `handle` is never selected here. */
export interface CapabilitySearchHit {
  readonly id: string;
  readonly kind: string;
  readonly pluginId: string;
  readonly skillName: string;
  readonly revision: string;
  readonly name: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly source: string;
  readonly score: number;
}

export interface CapabilityCatalogSearchOptions {
  /** Exact-match filter, applied inside the same SQL statement as the ranking query (see this file's
   *  header). Omit for no filter. */
  readonly kind?: string;
  readonly limit?: number;
}

export interface CapabilityCatalogQuery {
  /** @throws {Error} If `query` is missing, empty, or all-whitespace — exact text: `"capability_search: 'query' (non-empty string) is required"`. */
  search(query: string, options?: CapabilityCatalogSearchOptions): readonly CapabilitySearchHit[];
  /**
   * @throws {Error} If `id` is missing or empty — exact text: `"capability_get: 'id' (non-empty
   * string) is required"`.
   * @throws {Error} If `id` is not a known card — exact text: `"capability_get: no capability found
   * for id '<id>'"`.
   */
  get(id: string): CapabilityCard;
}

interface CapabilityRow {
  id: string;
  kind: string;
  pluginId: string;
  skillName: string;
  revision: string;
  name: string;
  description: string;
  keywordsJson: string;
  source: string;
  rank: number;
}

/**
 * Builds a queryable, in-memory (`:memory:`) index from an already-gathered card list. Disposable,
 * like `tool-catalog-query.ts`'s own seed — this is a snapshot of whatever
 * `capability-tool-registrations.ts`'s lazy build gathered, not durable state.
 *
 * @complexity O(c) to build (c = card count); `search`/`get` are SQLite's own index cost.
 */
export function buildCapabilityCatalogQuery(cards: readonly CapabilityCard[]): CapabilityCatalogQuery {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE capability_catalog (
      id            TEXT NOT NULL PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT NOT NULL,
      keywords      TEXT NOT NULL,
      kind          TEXT NOT NULL,
      plugin_id     TEXT NOT NULL,
      skill_name    TEXT NOT NULL,
      revision      TEXT NOT NULL,
      source        TEXT NOT NULL,
      keywords_json TEXT NOT NULL CHECK (json_valid(keywords_json)),
      updated_at    INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE capability_catalog_fts USING fts5(
      id,
      name,
      description,
      keywords,
      content='capability_catalog',
      content_rowid='rowid'
    );
  `);

  const byId = new Map<string, CapabilityCard>();
  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO capability_catalog
      (id, name, description, keywords, kind, plugin_id, skill_name, revision, source, keywords_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seed = db.transaction((rows: readonly CapabilityCard[]) => {
    for (const row of rows) {
      byId.set(row.id, row);
      insert.run(
        row.id,
        row.name,
        row.description,
        // Indexed text only, space-joined — the FTS column exists purely to be MATCHed against.
        // `keywords_json` (below) is the fidelity-preserving copy `get()`/`search()` actually read
        // back, so a keyword containing its own space (e.g. "ui ux") never gets mangled by this join.
        row.keywords.join(" "),
        row.kind,
        row.pluginId,
        row.skillName,
        row.revision,
        row.source,
        JSON.stringify(row.keywords),
        now,
      );
    }
    db.exec(`INSERT INTO capability_catalog_fts(capability_catalog_fts) VALUES('rebuild')`);
  });
  seed(cards);

  return {
    search(query, options = {}) {
      requireNonEmptyQuery(query);
      const terms = tokenize(query);
      if (terms.length === 0) return [];

      const matchExpr = terms.join(" OR ");
      const kind = options.kind ?? null;
      const limit = options.limit ?? 10;

      const rows = db
        .prepare(
          `SELECT cc.id AS id, cc.kind AS kind, cc.plugin_id AS pluginId, cc.skill_name AS skillName,
                  cc.revision AS revision, cc.name AS name, cc.description AS description,
                  cc.keywords_json AS keywordsJson, cc.source AS source,
                  bm25(capability_catalog_fts, 1.0, 6.0, 1.0, 3.0) AS rank
           FROM capability_catalog_fts
           JOIN capability_catalog cc ON cc.rowid = capability_catalog_fts.rowid
           WHERE capability_catalog_fts MATCH ?
             AND (? IS NULL OR cc.kind = ?)
           ORDER BY rank
           LIMIT ?`,
        )
        .all(matchExpr, kind, kind, limit) as CapabilityRow[];

      // bm25() returns a cost (smaller/more-negative = better match); invert to a positive score so
      // callers see "higher is better", matching `tool-catalog-query.ts`'s identical convention.
      // `handle` is deliberately never selected above, so there is nothing to omit here — see this
      // file's header.
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        pluginId: row.pluginId,
        skillName: row.skillName,
        revision: row.revision,
        name: row.name,
        description: row.description,
        keywords: JSON.parse(row.keywordsJson) as readonly string[],
        source: row.source,
        score: -row.rank,
      }));
    },

    get(id) {
      requireNonEmptyId(id);
      const found = byId.get(id);
      if (!found) throw new Error(`capability_get: no capability found for id '${id}'`);
      return found;
    },
  };
}
