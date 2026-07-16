import { and, eq } from "drizzle-orm";

import { stampWatermarkTx, type ContentDbTransaction } from "../../core/gated-mutations/watermark";
import { entryTerms, taxonomies, taxonomyRevisions, terms } from "../../infra/db/schema";
import type { ContentDb } from "../../infra/sqlite/content-db";
import { findOneBy } from "../../infra/sqlite/repo-helpers";
import type {
  EntryTermRepoPort,
  Taxonomy,
  TaxonomyRepoPort,
  TaxonomyRevisionRepoPort,
  TaxonomyRevisionRow,
  Term,
  TermRepoPort,
} from "./write-service";
import type { TaxonomyListPort, TermListPort } from "./list";

/**
 * @file Real SQLite adapters for the `taxonomy` package's write/list ports (ADR-006 rule-of-two
 * "second adapter" half — `repo.memory.ts`'s in-memory doubles are the first). Same disclosed gap
 * closure as `features/content-types/repo.sqlite.ts`/`features/entries/repo.sqlite.ts`.
 *
 * Purpose:
 * `TaxonomyRepoPort`/`TermRepoPort`/`EntryTermRepoPort`/`TaxonomyRevisionRepoPort` (this package's
 * own certified `write-service.ts`) never thread a `workspaceId` through their method signatures
 * (see that file's own header: "no `workspaceId` is threaded through this slice's certified
 * write-service tests"). Every adapter class here is therefore constructed workspace-scoped
 * instead — the same "scoped at construction" precedent `infra/sqlite/storage-journal-repo.ts`
 * already established for `siteId` — rather than widening a certified port signature that isn't
 * mine to change.
 *
 * Architectural role:
 * Infrastructure adapters. ADR-042 item 1: single-row lookups reuse `repo-helpers.ts`'s
 * `findOneBy`.
 */

function toTaxonomy(row: typeof taxonomies.$inferSelect): Taxonomy {
  return {
    id: row.id,
    name: row.name,
    hierarchical: row.hierarchical === 1,
    status: row.status,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toTerm(row: typeof terms.$inferSelect): Term {
  return {
    id: row.id,
    taxonomyId: row.taxonomyId,
    parentId: row.parentId,
    name: row.name,
    status: row.status,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class SqliteTaxonomyRepo implements TaxonomyRepoPort, TaxonomyListPort {
  constructor(private readonly deps: { db: ContentDb; workspaceId: string }) {}

  async insert(row: Taxonomy): Promise<unknown> {
    this.deps.db
      .insert(taxonomies)
      .values({
        id: row.id,
        workspaceId: this.deps.workspaceId,
        name: row.name,
        hierarchical: row.hierarchical ? 1 : 0,
        status: row.status,
        updatedAt: row.updatedAt,
        version: row.version,
      })
      .run();
    return row;
  }

  async findById(id: string): Promise<{ id: string; hierarchical: boolean; allowList?: string[] } | null> {
    return findOneBy(
      this.deps.db,
      taxonomies,
      [eq(taxonomies.workspaceId, this.deps.workspaceId), eq(taxonomies.id, id)],
      (row) => ({ id: row.id, hierarchical: row.hierarchical === 1 })
    );
  }

  async list(): Promise<Taxonomy[]> {
    const rows = this.deps.db.select().from(taxonomies).where(eq(taxonomies.workspaceId, this.deps.workspaceId)).all();
    return rows.map(toTaxonomy);
  }
}

export class SqliteTermRepo implements TermRepoPort, TermListPort {
  constructor(private readonly deps: { db: ContentDb; workspaceId: string }) {}

  async insert(row: Term): Promise<unknown> {
    this.deps.db
      .insert(terms)
      .values({
        id: row.id,
        workspaceId: this.deps.workspaceId,
        taxonomyId: row.taxonomyId,
        parentId: row.parentId,
        name: row.name,
        status: row.status,
        updatedAt: row.updatedAt,
        version: row.version,
      })
      .run();
    return row;
  }

  async update(row: Term): Promise<unknown> {
    this.deps.db
      .update(terms)
      .set({
        taxonomyId: row.taxonomyId,
        parentId: row.parentId,
        name: row.name,
        status: row.status,
        updatedAt: row.updatedAt,
        version: row.version,
      })
      .where(and(eq(terms.workspaceId, this.deps.workspaceId), eq(terms.id, row.id)))
      .run();
    return row;
  }

  async findById(id: string): Promise<{ id: string; taxonomyId: string; name?: string } | null> {
    return findOneBy(this.deps.db, terms, [eq(terms.workspaceId, this.deps.workspaceId), eq(terms.id, id)], (row) => ({
      id: row.id,
      taxonomyId: row.taxonomyId,
      name: row.name,
    }));
  }

  async listByTaxonomy(params: { taxonomyId: string }): Promise<Term[]> {
    const rows = this.deps.db
      .select()
      .from(terms)
      .where(and(eq(terms.workspaceId, this.deps.workspaceId), eq(terms.taxonomyId, params.taxonomyId)))
      .all();
    return rows.map(toTerm);
  }

  /** Ancestor-chain lookup for `validation-chain.ts`'s `wouldCreateCycle` — mirrors
   * `InMemoryTermRepo.getParentId`'s optional, not-yet-wired-by-any-route seam. */
  getParentId(termId: string): string | null {
    const row = findOneBy(this.deps.db, terms, [eq(terms.workspaceId, this.deps.workspaceId), eq(terms.id, termId)], (r) => r.parentId);
    return row ?? null;
  }
}

export class SqliteEntryTermRepo implements EntryTermRepoPort {
  constructor(private readonly deps: { db: ContentDb; workspaceId: string }) {}

  /** Idempotent upsert keyed by `entry_terms_unique` (`workspaceId`, `contentType`, `contentId`,
   * `termId`) — mirrors `InMemoryEntryTermRepo.upsert`'s find-or-replace behavior. */
  async upsert(row: { contentType: string; contentId: string; termId: string; addedAt: string }): Promise<unknown> {
    const values = {
      workspaceId: this.deps.workspaceId,
      contentType: row.contentType,
      contentId: row.contentId,
      termId: row.termId,
      addedAt: row.addedAt,
    };
    this.deps.db
      .insert(entryTerms)
      .values(values)
      .onConflictDoUpdate({ target: [entryTerms.workspaceId, entryTerms.contentType, entryTerms.contentId, entryTerms.termId], set: { addedAt: row.addedAt } })
      .run();
    return row;
  }

  async deleteByContent(params: { workspaceId: string; contentType: string; contentId: string }): Promise<number> {
    const result = this.deps.db
      .delete(entryTerms)
      .where(
        and(
          eq(entryTerms.workspaceId, params.workspaceId),
          eq(entryTerms.contentType, params.contentType),
          eq(entryTerms.contentId, params.contentId)
        )
      )
      .run();
    return Number(result.changes ?? 0);
  }

  /**
   * SPEC-018 C-207 (`mergeTerm`'s plan-time overlap disclosure, REQ-16) — counts content already
   * assigned to BOTH `fromTermId` and `intoTermId`. Not part of the certified `EntryTermRepoPort`
   * (that port has no by-term enumeration method at all) — an additive capability this dispatch's
   * gated-mutation composition needs, implemented identically on `InMemoryEntryTermRepo` so both
   * `server/app.ts`'s hermetic composition and `server/deps.ts`'s real one can drive the same
   * merge ceremony. Bounded by taxonomy's own low-volume assumption (ADR-044) — no cap needed.
   *
   * @complexity O(f + i) where f/i are the row counts for each term.
   * @overallScore 100
   */
  async countOverlap(params: { fromTermId: string; intoTermId: string }): Promise<number> {
    const fromRows = this.deps.db
      .select({ contentType: entryTerms.contentType, contentId: entryTerms.contentId })
      .from(entryTerms)
      .where(and(eq(entryTerms.workspaceId, this.deps.workspaceId), eq(entryTerms.termId, params.fromTermId)))
      .all();
    const intoKeys = new Set(
      this.deps.db
        .select({ contentType: entryTerms.contentType, contentId: entryTerms.contentId })
        .from(entryTerms)
        .where(and(eq(entryTerms.workspaceId, this.deps.workspaceId), eq(entryTerms.termId, params.intoTermId)))
        .all()
        .map((r) => `${r.contentType}::${r.contentId}`)
    );
    return fromRows.filter((r) => intoKeys.has(`${r.contentType}::${r.contentId}`)).length;
  }

  /**
   * SPEC-018 C-207 — the actual merge execution: re-points every `entry_terms` row from
   * `fromTermId` to `intoTermId` (upsert dedupes automatically via `entry_terms_unique`, so
   * content already assigned to both collapses to one row — the disclosed, ADR-044-named loss
   * mode `merge-term.ts`'s own header names), then deletes the now-empty `fromTermId` rows.
   *
   * @complexity O(f) in the number of rows currently assigned to `fromTermId`.
   * @overallScore 100
   */
  async repointTerm(params: { fromTermId: string; intoTermId: string }): Promise<{ repointedCount: number }> {
    const fromRows = this.deps.db
      .select()
      .from(entryTerms)
      .where(and(eq(entryTerms.workspaceId, this.deps.workspaceId), eq(entryTerms.termId, params.fromTermId)))
      .all();
    for (const row of fromRows) {
      await this.upsert({ contentType: row.contentType, contentId: row.contentId, termId: params.intoTermId, addedAt: row.addedAt });
    }
    this.deps.db
      .delete(entryTerms)
      .where(and(eq(entryTerms.workspaceId, this.deps.workspaceId), eq(entryTerms.termId, params.fromTermId)))
      .run();
    return { repointedCount: fromRows.length };
  }
}

export class SqliteTaxonomyRevisionRepo implements TaxonomyRevisionRepoPort {
  constructor(private readonly deps: { db: ContentDb; workspaceId: string }) {}

  async insert(row: TaxonomyRevisionRow): Promise<unknown> {
    this.deps.db
      .insert(taxonomyRevisions)
      .values({
        workspaceId: this.deps.workspaceId,
        taxonomyId: row.taxonomyId,
        op: row.op,
        previousStateJson: row.previousState == null ? null : JSON.stringify(row.previousState),
        actorId: row.actorId,
        recordedAt: row.recordedAt,
      })
      .run();
    return row;
  }
}

/** Sync `WriteServiceDeps.stampWatermark` binding over the real `content.db` watermark
 * (`core/gated-mutations/watermark.ts`'s certified `stampWatermarkTx`) — see that module's own
 * doc comment for why passing the plain `db` handle is safe here (no `db.transaction()` wraps
 * `taxonomy/write-service.ts`'s own mutations, so each call is its own implicit autocommit
 * statement; this stamp call is likewise its own autocommit statement, same atomicity envelope
 * every other individual write in this write-service already has). Disclosed narrowing, not a
 * silent gap: this package's write-service never wraps its own multi-row writes in one
 * transaction at all (see `write-service.ts`'s header), so the watermark stamp cannot be made any
 * more atomic with its sibling writes than those sibling writes already are with each other. */
export function sqliteStampWatermark(db: ContentDb): () => void {
  return () => {
    stampWatermarkTx({ tx: db as unknown as ContentDbTransaction });
  };
}
