import type { ExpressionBuilder } from "kysely";

import type { ContentDatabase } from "../../platform/db/content-database.generated.js";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type {
  EntryTermRepoPort,
  ImportableTaxonomyRepoPort,
  ImportableTermRepoPort,
  Taxonomy,
  TaxonomyListPort,
  TaxonomyRepoPort,
  TaxonomyRevisionRepoPort,
  TaxonomyRevisionRow,
  Term,
  TermListPort,
  TermRepoPort,
  UnassignableEntryTermRepoPort,
} from "./index.js";
import { toTaxonomy, toTaxonomyRevisionRow, toTaxonomyRow, toTerm, toTermRow } from "./repo.rows.js";

/**
 * @file THE taxonomy repositories: one Kysely query body for every database the storage kernel drives
 * (SQLite, PGlite, Postgres). `SqlTaxonomyRepo`, `SqlTermRepo`, `SqlEntryTermRepo` and
 * `SqlTaxonomyRevisionRepo` satisfy the `taxonomy` package's write/list ports. Every statement goes
 * through `kernel.run` and is awaited.
 *
 * The certified ports never thread a `workspaceId` through their method signatures, so every class is
 * constructed workspace-scoped instead (the same "scoped at construction" precedent as
 * `database-journal-repo.ts`'s `siteId`).
 *
 * T6 (trash): tags/categories are trashable, but this domain never imports `features/trash`. A row is
 * hidden by its own `status` marker, and a term is ALSO hidden the instant its taxonomy is
 * ({@link termIsLive}): no second write cascades the hide onto every member term, so every term read
 * re-checks the parent taxonomy's status itself. Every read excludes trashed rows except the
 * publish-content and purge-audit reads, which are deliberately trash-blind (named on each).
 * `update` guards its `WHERE` so a stale write can never resurrect or edit an already-trashed row.
 *
 * Read-then-write sequences (`transaction`, `repointTerm`) take the `taxonomy:<workspaceId>` lock.
 */

const TRASH_STATUS = "trash";

/** Publish-content's taxonomy read: the full row, trashed ones included, so a precheck refuses a
 *  trashed destination instead of colliding. */
export interface TaxonomyPublishReadPort {
  findAnyById(id: string): Promise<Taxonomy | null>;
}

/** Publish-content's term read — see {@link TaxonomyPublishReadPort}. */
export interface TermPublishReadPort {
  findAnyById(id: string): Promise<Term | null>;
}

/**
 * One term assigned to a piece of content, joined with its own name and its owning taxonomy's name
 * — the shape {@link EntryTermReadPort.listForContent} returns, and the ONLY shape the public-render
 * surface needs (`pages.ts`'s `resolveAssignedTermsForRender`/`renderAssignedTermsBlock`).
 */
export interface AssignedTermView {
  termId: string;
  termName: string;
  taxonomyName: string;
}

/**
 * Additive capability beyond the certified `EntryTermRepoPort` (which has no by-content READ method).
 * Kept a SEPARATE, OPTIONAL field on `RouteDeps` (`entryTermReadRepo`) because `@jini-ai/cms/taxonomy`'s
 * `InMemoryEntryTermRepo` does not implement it; a caller missing this field degrades to "no terms
 * rendered", never a throw.
 */
export interface EntryTermReadPort {
  listForContent(params: { contentType: string; contentId: string }): Promise<readonly AssignedTermView[]>;
}

/** `terms.status <> 'trash' AND NOT EXISTS (the term's own taxonomy is trashed)`. Correlated to the
 *  `terms` row in scope, so it works bare and inside joins. @complexity O(1) to build; the subquery
 *  costs the `taxonomies` primary key. */
function termIsLive(eb: ExpressionBuilder<ContentDatabase, "terms">) {
  return eb.and([
    eb("terms.status", "!=", TRASH_STATUS),
    eb.not(
      eb.exists(
        eb
          .selectFrom("taxonomies")
          .select("taxonomies.id")
          .whereRef("taxonomies.id", "=", "terms.taxonomy_id")
          .where("taxonomies.status", "=", TRASH_STATUS)
      )
    ),
  ]);
}

export class SqlTaxonomyRepo
  implements TaxonomyRepoPort, TaxonomyListPort, ImportableTaxonomyRepoPort, TaxonomyPublishReadPort
{
  constructor(protected readonly kernel: ContentKernel, protected readonly workspaceId: string) {}

  async insert(row: Taxonomy): Promise<unknown> {
    await this.kernel.run((db) => db.insertInto("taxonomies").values(toTaxonomyRow(this.workspaceId, row)).execute());
    return row;
  }

  async findById({ id }: { id: string }): Promise<{ id: string; hierarchical: boolean; allowList?: string[] } | null> {
    const row = await this.findLive(id);
    return row ? { id: row.id, hierarchical: row.hierarchical } : null;
  }

  /** `ImportableTaxonomyRepoPort` (`importTaxonomy`'s CAS read) — the full live row. */
  async findByIdFull({ id }: { id: string }): Promise<Taxonomy | null> {
    return this.findLive(id);
  }

  /** Publish-content's read: the full row even when trashed (`status` = `"trash"`), so a precheck can
   *  refuse it instead of planning a create that would collide. */
  async findAnyById(id: string): Promise<Taxonomy | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("taxonomies")
        .selectAll()
        .where("workspace_id", "=", this.workspaceId)
        .where("id", "=", id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toTaxonomy(row) : null;
  }

  /** `ImportableTaxonomyRepoPort` — live rows only, same no-revive guard as `SqlTermRepo.update`. */
  async update(row: Taxonomy): Promise<unknown> {
    await this.kernel.run((db) =>
      db
        .updateTable("taxonomies")
        .set({
          name: row.name,
          hierarchical: row.hierarchical ? 1 : 0,
          status: row.status,
          updated_at: row.updatedAt,
          version: row.version,
        })
        .where("workspace_id", "=", this.workspaceId)
        .where("id", "=", row.id)
        .where("status", "!=", TRASH_STATUS)
        .execute()
    );
    return row;
  }

  async list(): Promise<Taxonomy[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("taxonomies")
        .selectAll()
        .where("workspace_id", "=", this.workspaceId)
        .where("status", "!=", TRASH_STATUS)
        .execute()
    );
    return rows.map(toTaxonomy);
  }

  /** Trash display read for `trashTaxonomy` (`trash-term.ts`) — additive, not part of the certified
   *  `TaxonomyRepoPort`. Excludes an already-trashed taxonomy, like every other read here.
   *  @complexity O(1) plus whatever index the workspace/id match uses. */
  async findForTrash(id: string): Promise<{ id: string; name: string; version: number } | null> {
    const row = await this.findLive(id);
    return row ? { id: row.id, name: row.name, version: row.version } : null;
  }

  /** `DeletableTaxonomyRepoPort` (`@jini-ai/cms/taxonomy`) — additive capability behind
   *  `deleteTaxonomy`, workspace-scoped like every other method on this class. */
  async delete({ id }: { id: string }): Promise<void> {
    await this.kernel.run((db) =>
      db.deleteFrom("taxonomies").where("workspace_id", "=", this.workspaceId).where("id", "=", id).execute()
    );
  }

  /**
   * `TransactionalRepoPort` (`@jini-ai/cms/taxonomy`) — backs `deleteTerm`/`deleteTaxonomy`'s
   * guard-and-cascade atomicity: there is no FK/CASCADE at the schema level, so the transaction is the
   * only thing that can undo a mid-cascade failure, and it wraps the guard reads too so they cannot go
   * stale. Runs on the connection's kernel, so every write `terms`/`entryTerms`/`taxonomyRevisions`
   * (or the outbox) makes while `fn` runs lands inside it; nested calls join, and the workspace's
   * taxonomy lock is held to the end.
   *
   * @complexity O(1) fixed overhead plus whatever `fn` itself costs.
   */
  async transaction<T>({ fn }: { fn: () => Promise<T> }): Promise<T> {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey(`taxonomy:${this.workspaceId}`);
      return fn();
    });
  }

  private async findLive(id: string): Promise<Taxonomy | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("taxonomies")
        .selectAll()
        .where("workspace_id", "=", this.workspaceId)
        .where("id", "=", id)
        .where("status", "!=", TRASH_STATUS)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toTaxonomy(row) : null;
  }
}

export class SqlTermRepo implements TermRepoPort, TermListPort, ImportableTermRepoPort, TermPublishReadPort {
  constructor(protected readonly kernel: ContentKernel, protected readonly workspaceId: string) {}

  async insert(row: Term): Promise<unknown> {
    await this.kernel.run((db) => db.insertInto("terms").values(toTermRow(this.workspaceId, row)).execute());
    return row;
  }

  /** `where`-guarded (T6): a stale rename can never write over an already-trashed row, so
   *  `renameTerm` (`@jini-ai/cms/taxonomy`) silently no-ops against a trashed term rather than
   *  reviving it with a new name. A 0-row update is not an error: `renameTerm`'s own `findById` (also
   *  trash-filtered) already turns a trashed term into a 404 before this runs; this is defense in
   *  depth against a race between that read and this write. */
  async update(row: Term): Promise<unknown> {
    await this.kernel.run((db) =>
      db
        .updateTable("terms")
        .set({
          taxonomy_id: row.taxonomyId,
          parent_id: row.parentId,
          name: row.name,
          status: row.status,
          updated_at: row.updatedAt,
          version: row.version,
        })
        .where("workspace_id", "=", this.workspaceId)
        .where("id", "=", row.id)
        .where(termIsLive)
        .execute()
    );
    return row;
  }

  async findById({ id }: { id: string }): Promise<{ id: string; taxonomyId: string; name?: string } | null> {
    const row = await this.findLive(id);
    return row ? { id: row.id, taxonomyId: row.taxonomyId, name: row.name } : null;
  }

  /** `ImportableTermRepoPort` (`importTerm`'s CAS read) — the full live row. */
  async findByIdFull({ id }: { id: string }): Promise<Term | null> {
    return this.findLive(id);
  }

  /** Publish-content's read: the full row even when trashed (see `SqlTaxonomyRepo.findAnyById`). */
  async findAnyById(id: string): Promise<Term | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("terms")
        .selectAll()
        .where("workspace_id", "=", this.workspaceId)
        .where("id", "=", id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toTerm(row) : null;
  }

  async listByTaxonomy(params: { taxonomyId: string }): Promise<Term[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("terms")
        .selectAll()
        .where("workspace_id", "=", this.workspaceId)
        .where("taxonomy_id", "=", params.taxonomyId)
        .where(termIsLive)
        .execute()
    );
    return rows.map(toTerm);
  }

  /** Trash display read for `trashTerm` (`trash-term.ts`) — the term's own name plus its taxonomy's
   *  name, the same join `registry.ts`'s `term` entry uses for the generic Trash's display. Excludes
   *  an already-trashed term (own marker or taxonomy trashed). @complexity O(1) plus the join's index. */
  async findForTrash(
    id: string
  ): Promise<{ id: string; name: string; taxonomyId: string; taxonomyName: string; version: number } | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("terms")
        .innerJoin("taxonomies", "taxonomies.id", "terms.taxonomy_id")
        .select([
          "terms.id as id",
          "terms.name as name",
          "terms.taxonomy_id as taxonomyId",
          "taxonomies.name as taxonomyName",
          "terms.version as version",
        ])
        .where("terms.workspace_id", "=", this.workspaceId)
        .where("terms.id", "=", id)
        .where(termIsLive)
        .limit(1)
        .executeTakeFirst()
    );
    return row ?? null;
  }

  /** Purge-audit read for `taxonomy-trash-follow-ups.ts`'s term `beforePurge` hook — deliberately
   *  trash-BLIND, unlike every other read on this class: a purge only ever runs on a row that is
   *  already hidden, so a live filter would return `null` exactly when the follow-up needs the term's
   *  name/taxonomy for the revision it is about to write. @complexity O(1). */
  async findForPurgeAudit(id: string): Promise<{ id: string; name: string; taxonomyId: string } | null> {
    const row = await this.findAnyById(id);
    return row ? { id: row.id, name: row.name, taxonomyId: row.taxonomyId } : null;
  }

  /** Purge-audit read for the taxonomy `beforePurge` hook — the ids of EVERY member term regardless
   *  of status, because the taxonomy `purgeFirst` cascade physically deletes all of them, whether or
   *  not each carries its own trash marker. `listByTaxonomy` cannot serve this: it excludes rows under
   *  an already-trashed taxonomy, which is always true by the time a purge runs. */
  async listIdsForPurgeAudit(taxonomyId: string): Promise<string[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("terms")
        .select("id")
        .where("workspace_id", "=", this.workspaceId)
        .where("taxonomy_id", "=", taxonomyId)
        .execute()
    );
    return rows.map((row) => row.id);
  }

  /** Ancestor-chain lookup for `validation-chain.ts`'s `wouldCreateCycle` — mirrors
   *  `InMemoryTermRepo.getParentId`'s optional, not-yet-wired-by-any-route seam. Async since a query
   *  can no longer be a synchronous terminal; nothing calls it today. Trash-blind, like the original. */
  async getParentId(termId: string): Promise<string | null> {
    const row = await this.findAnyById(termId);
    return row?.parentId ?? null;
  }

  /** `DeletableTermRepoPort` (`@jini-ai/cms/taxonomy`) — additive capability behind `deleteTerm`. */
  async delete({ id }: { id: string }): Promise<void> {
    await this.kernel.run((db) =>
      db.deleteFrom("terms").where("workspace_id", "=", this.workspaceId).where("id", "=", id).execute()
    );
  }

  /** `DeletableTermRepoPort.countChildren` — direct children only (one level), workspace-scoped. */
  async countChildren(params: { parentId: string }): Promise<number> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("terms")
        .select((eb) => eb.fn.countAll().as("n"))
        .where("workspace_id", "=", this.workspaceId)
        .where("parent_id", "=", params.parentId)
        .executeTakeFirst()
    );
    return Number(row?.n ?? 0);
  }

  private async findLive(id: string): Promise<Term | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("terms")
        .selectAll()
        .where("workspace_id", "=", this.workspaceId)
        .where("id", "=", id)
        .where(termIsLive)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toTerm(row) : null;
  }
}

export class SqlEntryTermRepo implements EntryTermRepoPort, EntryTermReadPort, UnassignableEntryTermRepoPort {
  constructor(protected readonly kernel: ContentKernel, protected readonly workspaceId: string) {}

  /** Idempotent upsert keyed by `entry_terms_unique` (`workspace_id`, `content_type`, `content_id`,
   *  `term_id`) — mirrors `InMemoryEntryTermRepo.upsert`'s find-or-replace behavior. */
  async upsert(row: { contentType: string; contentId: string; termId: string; addedAt: string }): Promise<unknown> {
    await this.upsertRow(row);
    return row;
  }

  async deleteByContent(params: { workspaceId: string; contentType: string; contentId: string }): Promise<number> {
    const result = await this.kernel.run((db) =>
      db
        .deleteFrom("entry_terms")
        .where("workspace_id", "=", params.workspaceId)
        .where("content_type", "=", params.contentType)
        .where("content_id", "=", params.contentId)
        .executeTakeFirst()
    );
    return Number(result.numDeletedRows);
  }

  /** `UnassignableEntryTermRepoPort` (`@jini-ai/cms/taxonomy`) — additive capability for
   *  `unassignTerms`. Returns the number of rows actually removed (0 or 1, given `entry_terms_unique`)
   *  rather than throwing on a no-op, like `deleteByContent`. */
  async remove(row: { contentType: string; contentId: string; termId: string }): Promise<number> {
    const result = await this.kernel.run((db) =>
      db
        .deleteFrom("entry_terms")
        .where("workspace_id", "=", this.workspaceId)
        .where("content_type", "=", row.contentType)
        .where("content_id", "=", row.contentId)
        .where("term_id", "=", row.termId)
        .executeTakeFirst()
    );
    return Number(result.numDeletedRows);
  }

  /**
   * SPEC-018 C-207 (`mergeTerm`'s plan-time overlap disclosure) — counts content already assigned to
   * BOTH `fromTermId` and `intoTermId`. Bounded by taxonomy's own low-volume assumption (ADR-044).
   *
   * @complexity O(f + i) where f/i are the row counts for each term.
   */
  async countOverlap(params: { fromTermId: string; intoTermId: string }): Promise<number> {
    const fromRows = await this.contentOfTerm(params.fromTermId);
    const intoRows = await this.contentOfTerm(params.intoTermId);
    const intoKeys = new Set(intoRows.map((r) => `${r.content_type}::${r.content_id}`));
    return fromRows.filter((r) => intoKeys.has(`${r.content_type}::${r.content_id}`)).length;
  }

  /**
   * SPEC-018 C-207 — the actual merge execution: re-points every `entry_terms` row from `fromTermId`
   * to `intoTermId` (the upsert dedupes via `entry_terms_unique`, so content already assigned to both
   * collapses to one row — the disclosed, ADR-044-named loss mode `merge-term.ts` names), then deletes
   * the now-empty `fromTermId` rows. One transaction under the taxonomy lock: a failure part-way
   * leaves nothing re-pointed.
   *
   * @complexity O(f) in the number of rows currently assigned to `fromTermId`.
   */
  async repointTerm(params: { fromTermId: string; intoTermId: string }): Promise<{ repointedCount: number }> {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey(`taxonomy:${this.workspaceId}`);
      const fromRows = await this.kernel.run((db) =>
        db
          .selectFrom("entry_terms")
          .selectAll()
          .where("workspace_id", "=", this.workspaceId)
          .where("term_id", "=", params.fromTermId)
          .execute()
      );
      for (const row of fromRows) {
        await this.upsertRow({
          contentType: row.content_type,
          contentId: row.content_id,
          termId: params.intoTermId,
          addedAt: row.added_at,
        });
      }
      await this.kernel.run((db) =>
        db
          .deleteFrom("entry_terms")
          .where("workspace_id", "=", this.workspaceId)
          .where("term_id", "=", params.fromTermId)
          .execute()
      );
      return { repointedCount: fromRows.length };
    });
  }

  /** `AssignmentCountEntryTermRepoPort` (`@jini-ai/cms/taxonomy`) — the guard `deleteTerm`/
   *  `deleteTaxonomy` use to refuse destroying a live content assignment.
   *  @complexity O(1) — one count. */
  async countByTerm(params: { termId: string }): Promise<number> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("entry_terms")
        .select((eb) => eb.fn.countAll().as("n"))
        .where("workspace_id", "=", this.workspaceId)
        .where("term_id", "=", params.termId)
        .executeTakeFirst()
    );
    return Number(row?.n ?? 0);
  }

  /**
   * `EntryTermReadPort` — the public-render read path: every term currently assigned to one
   * `(contentType, contentId)` pair, joined with its own name and its owning taxonomy's name in one
   * query, ordered by `added_at` so a page lists terms in the order they were assigned.
   *
   * T6: trashing never touches `entry_terms` (a trashed term/taxonomy stays assigned), so the
   * assignment row survives and is filtered out HERE at read time. {@link termIsLive}'s `NOT EXISTS`
   * also covers a term whose taxonomy is trashed.
   *
   * @complexity O(n) in the number of terms assigned to this one piece of content (typically single
   * digits) — one join query.
   */
  async listForContent(params: { contentType: string; contentId: string }): Promise<readonly AssignedTermView[]> {
    return this.kernel.run((db) =>
      db
        .selectFrom("entry_terms")
        .innerJoin("terms", "terms.id", "entry_terms.term_id")
        .innerJoin("taxonomies", "taxonomies.id", "terms.taxonomy_id")
        .select(["terms.id as termId", "terms.name as termName", "taxonomies.name as taxonomyName"])
        .where("entry_terms.workspace_id", "=", this.workspaceId)
        .where("entry_terms.content_type", "=", params.contentType)
        .where("entry_terms.content_id", "=", params.contentId)
        .where(termIsLive)
        .orderBy("entry_terms.added_at")
        .execute()
    );
  }

  /** Every `(content_type, content_id)` assigned to one term in this workspace. */
  private contentOfTerm(termId: string) {
    return this.kernel.run((db) =>
      db
        .selectFrom("entry_terms")
        .select(["content_type", "content_id"])
        .where("workspace_id", "=", this.workspaceId)
        .where("term_id", "=", termId)
        .execute()
    );
  }

  private async upsertRow(row: { contentType: string; contentId: string; termId: string; addedAt: string }) {
    await this.kernel.run((db) =>
      db
        .insertInto("entry_terms")
        .values({
          workspace_id: this.workspaceId,
          content_type: row.contentType,
          content_id: row.contentId,
          term_id: row.termId,
          added_at: row.addedAt,
        })
        .onConflict((oc) =>
          oc.columns(["workspace_id", "content_type", "content_id", "term_id"]).doUpdateSet({ added_at: row.addedAt })
        )
        .execute()
    );
  }
}

export class SqlTaxonomyRevisionRepo implements TaxonomyRevisionRepoPort {
  constructor(protected readonly kernel: ContentKernel, protected readonly workspaceId: string) {}

  async insert(row: TaxonomyRevisionRow): Promise<unknown> {
    await this.kernel.run((db) =>
      db.insertInto("taxonomy_revisions").values(toTaxonomyRevisionRow(this.workspaceId, row)).execute()
    );
    return row;
  }

  /** Test-only helper: the append-only revision ledger for one taxonomy, in seq order. */
  async listForTests(taxonomyId: string): Promise<TaxonomyRevisionRow[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("taxonomy_revisions")
        .selectAll()
        .where("workspace_id", "=", this.workspaceId)
        .where("taxonomy_id", "=", taxonomyId)
        .orderBy("seq", "asc")
        .execute()
    );
    return rows.map((r) => ({
      taxonomyId: r.taxonomy_id,
      op: r.op as TaxonomyRevisionRow["op"],
      previousState: r.previous_state_json == null ? null : (JSON.parse(r.previous_state_json) as Record<string, unknown>),
      actorId: r.actor_id,
      recordedAt: r.recorded_at,
    }));
  }
}

/** The taxonomy repo for `kernel`, scoped to `workspaceId`. */
export function taxonomyRepoFor(kernel: ContentKernel, workspaceId: string): SqlTaxonomyRepo {
  return new SqlTaxonomyRepo(kernel, workspaceId);
}

/** The term repo for `kernel`, scoped to `workspaceId`. */
export function termRepoFor(kernel: ContentKernel, workspaceId: string): SqlTermRepo {
  return new SqlTermRepo(kernel, workspaceId);
}

/** The entry-term repo for `kernel`, scoped to `workspaceId`. */
export function entryTermRepoFor(kernel: ContentKernel, workspaceId: string): SqlEntryTermRepo {
  return new SqlEntryTermRepo(kernel, workspaceId);
}

/** The taxonomy-revision repo for `kernel`, scoped to `workspaceId`. */
export function taxonomyRevisionRepoFor(kernel: ContentKernel, workspaceId: string): SqlTaxonomyRevisionRepo {
  return new SqlTaxonomyRevisionRepo(kernel, workspaceId);
}
