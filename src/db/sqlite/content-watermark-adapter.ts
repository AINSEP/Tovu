import { stampWatermarkTx, type ContentDbTransaction } from "../../core/gated-mutations/watermark";
import type { ContentDb } from "./content-db";

/**
 * @file Adapts `core/gated-mutations/watermark.ts`'s certified `stampWatermarkTx` to the narrower
 * `WatermarkPort` shapes `features/content-types/write-service.ts` and
 * `features/entries/write-service.ts` each declare locally (`stampWatermark(input): Promise<number>`).
 *
 * Purpose:
 * Both write-services call `deps.watermark.stampWatermark()` from INSIDE their own
 * `deps.repo.transaction()` callback (`SqliteContentTypeRepo.transaction`/`SqliteEntryRepo.transaction`
 * use the same manual `BEGIN IMMEDIATE`/`COMMIT` pattern `SqliteSettingsRepo.transaction` already
 * established — see that file's doc comment for why: better-sqlite3 has no real async I/O, so no
 * other statement can interleave on this single connection between awaits). `stampWatermarkTx`
 * itself only calls `.update()`/`.select()` on its `tx` parameter, a structural subset every
 * `ContentDb` instance already satisfies — passing the plain `db` handle here is therefore safe
 * PROVIDED the caller is already inside an open `BEGIN IMMEDIATE` block, which both write-services'
 * own chokepoint discipline guarantees.
 *
 * Architectural role:
 * Infrastructure adapter, shared by `features/content-types/repo.sqlite.ts` and
 * `features/entries/repo.sqlite.ts` — avoids duplicating this one-call wrapper twice.
 */
export interface ContentDbWatermarkPort {
  stampWatermark(input: { workspaceId: string }): Promise<number>;
}

export class SqliteContentWatermarkAdapter implements ContentDbWatermarkPort {
  constructor(private readonly db: ContentDb) {}

  /**
   * Advances `database_write_watermark` by exactly 1, reusing SPEC-016's certified
   * `stampWatermarkTx` rather than re-implementing the increment SQL.
   *
   * @complexity O(1) — one UPDATE + one SELECT against a single-row table.
   * @overallScore 100
   */
  async stampWatermark(_input: { workspaceId: string }): Promise<number> {
    const { newValue } = stampWatermarkTx({ tx: this.db as unknown as ContentDbTransaction });
    return newValue;
  }
}
