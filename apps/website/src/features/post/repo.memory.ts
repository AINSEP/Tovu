import { createHash, randomUUID } from "node:crypto";

import {
  isTrashed,
  type PostAutosaveSnapshot,
  type PostRecord,
  type PostRepoPort,
  type PostRevisionAppendResult,
  type PostRevisionInput,
  type PostRevisionRecord,
} from "./post.js";

/**
 * SPEC-005 (T021): `ext` needs no special handling here. Unlike `repo.sqlite.ts` — which has to
 * serialize it to a JSON text column and normalize the `{}` default back to an absent field —
 * this adapter stores and returns whole `PostRecord`s verbatim, exactly as it already does for
 * `bodyJson`, so `ext` (present or absent) round-trips unchanged.
 */

export class InMemoryPostRepo implements PostRepoPort {
  private rows: PostRecord[];
  /** Standing-draft autosave snapshots, keyed apart from `rows` — mirrors `repo.sqlite.ts`'s own
   *  `autosave_json` column being a sibling of the row rather than a `PostRecord` field (see
   *  `PostRepoPort.readAutosave`'s doc for why). */
  private autosaves = new Map<string, PostAutosaveSnapshot>();
  /** This adapter's `post_revisions` stand-in — a plain array mirrors `rows`' own storage choice
   *  (see `PostRepoPort.appendRevision`'s doc for the append-only contract both adapters share). */
  private revisions: PostRevisionRecord[] = [];

  constructor(initialRows: PostRecord[] = []) {
    this.rows = [...initialRows];
  }

  private autosaveKey(workspaceId: string, id: string): string {
    return `${workspaceId}:${id}`;
  }

  async findById(required: { workspaceId: string; id: string }): Promise<PostRecord | null> {
    return (
      this.rows.find((row) => row.workspaceId === required.workspaceId && row.id === required.id) ??
      null
    );
  }

  async findBySlug(required: { workspaceId: string; slug: string }): Promise<PostRecord | null> {
    return (
      this.rows.find(
        (row) => row.workspaceId === required.workspaceId && row.slug === required.slug
      ) ?? null
    );
  }

  async list(required: { workspaceId: string }): Promise<PostRecord[]> {
    return this.rows.filter((row) => row.workspaceId === required.workspaceId);
  }

  /** See `PostRepoPort.listPublishedPreviews`'s own doc for the exact contract (bounded,
   *  `kind: "post"`-filtered, newest `updatedAt` first). Filter-sort-slice here is this in-memory
   *  adapter's own stand-in for a real bounded query — `repo.sqlite.ts`'s adapter is the one that
   *  must push the equivalent `WHERE`/`ORDER BY`/`LIMIT` down to SQLite itself. */
  async listPublishedPreviews(required: { workspaceId: string; limit: number }): Promise<PostRecord[]> {
    return this.rows
      .filter(
        (row) =>
          row.workspaceId === required.workspaceId &&
          row.status === "published" &&
          row.kind === "post" &&
          !isTrashed(row)
      )
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
      .slice(0, required.limit);
  }

  async save(record: PostRecord): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === record.id);
    if (index === -1) {
      this.rows.push(record);
      return;
    }

    this.rows[index] = record;
  }

  /** See `PostRepoPort.saveIfVersion`'s own doc for the contract this mirrors from
   *  `repo.sqlite.ts`'s conditional `UPDATE`. Deliberately NOT a fall-through to `save()`: a row
   *  that is absent or has moved past `ifVersion` reports `applied: false` and writes nothing at
   *  all — no insert, no partial update, no version bump. The workspace is part of the match here
   *  (unlike `save()` above, which keys on `id` alone) because the SQLite predicate includes it,
   *  and an adapter pair that disagrees on what "the same row" means is how a guard passes its
   *  in-memory tests and fails in production. */
  async saveIfVersion(required: {
    record: PostRecord;
    ifVersion: number;
  }): Promise<{ applied: boolean }> {
    const index = this.rows.findIndex(
      (row) => row.workspaceId === required.record.workspaceId && row.id === required.record.id
    );
    if (index === -1 || this.rows[index].version !== required.ifVersion) return { applied: false };

    this.rows[index] = required.record;
    return { applied: true };
  }

  /**
   * Stamps the trash marker (see `post.ts`'s `PostRecord.deletedAt`). The row is KEPT — that is the
   * whole point of a soft delete — so this is a field update on the existing record, never a splice
   * out of `rows`. A row this adapter dropped could not be restored by `postDeleteReverter`, and
   * `findBySlug` would stop reserving its slug, which `repo.sqlite.ts`'s real unique index would
   * then reject at insert time. Both adapters must behave identically here.
   */
  async softDelete(required: {
    workspaceId: string;
    id: string;
    deletedAt: string;
    updatedAt: string;
    version: number;
  }): Promise<void> {
    const index = this.rows.findIndex(
      (row) => row.workspaceId === required.workspaceId && row.id === required.id
    );
    if (index === -1) return;

    this.rows[index] = {
      ...this.rows[index],
      deletedAt: required.deletedAt,
      updatedAt: required.updatedAt,
      version: required.version,
    };
  }

  /** See `PostRepoPort.readAutosave`'s own doc. */
  async readAutosave(required: { workspaceId: string; id: string }): Promise<PostAutosaveSnapshot | null> {
    return this.autosaves.get(this.autosaveKey(required.workspaceId, required.id)) ?? null;
  }

  /** See `PostRepoPort.writeAutosave`'s own doc for the staleness contract this mirrors from
   *  `repo.sqlite.ts`'s conditional `UPDATE`: a missing row or a `version` that has moved past
   *  `snapshot.baseVersion` both report `applied: false` without touching the parked snapshot. */
  async writeAutosave(required: {
    workspaceId: string;
    id: string;
    snapshot: PostAutosaveSnapshot;
  }): Promise<{ applied: boolean }> {
    const row = await this.findById(required);
    if (!row || row.version !== required.snapshot.baseVersion) return { applied: false };
    this.autosaves.set(this.autosaveKey(required.workspaceId, required.id), required.snapshot);
    return { applied: true };
  }

  /** See `PostRepoPort.clearAutosave`'s own doc — unconditional, no version guard. */
  async clearAutosave(required: { workspaceId: string; id: string }): Promise<void> {
    this.autosaves.delete(this.autosaveKey(required.workspaceId, required.id));
  }

  /** See `PostRepoPort.appendRevision`'s own doc. Mirrors `repo.sqlite.ts`'s adapter exactly:
   *  `previousId` is the latest existing row for this `(workspaceId, postId)` found BEFORE the new
   *  row is pushed, and `contentHash` is computed here so both adapters apply the identical rule. */
  async appendRevision(input: PostRevisionInput): Promise<PostRevisionAppendResult> {
    const priorForPost = this.revisions.filter(
      (row) => row.workspaceId === input.workspaceId && row.postId === input.postId
    );
    const previousId = priorForPost.length > 0 ? priorForPost[priorForPost.length - 1].id : null;

    const id = randomUUID();
    const contentHash = createHash("sha256").update(JSON.stringify(input.stateJson)).digest("hex");

    this.revisions.push({
      id,
      postId: input.postId,
      workspaceId: input.workspaceId,
      seq: input.seq,
      op: input.op,
      stateJson: input.stateJson,
      contentHash,
      actorId: input.actorId,
      delegatedByWorkspaceId: input.delegatedByWorkspaceId ?? null,
      delegatedById: input.delegatedById ?? null,
      restoredFrom: input.restoredFrom ?? null,
      recordedAt: input.recordedAt,
    });

    return { id, previousId };
  }

  /** See `PostRepoPort.listRevisions`'s own doc — ascending `seq`, matching `repo.sqlite.ts`'s
   *  `ORDER BY seq ASC`. */
  async listRevisions(required: { workspaceId: string; postId: string }): Promise<PostRevisionRecord[]> {
    return this.revisions
      .filter((row) => row.workspaceId === required.workspaceId && row.postId === required.postId)
      .slice()
      .sort((a, b) => a.seq - b.seq);
  }

  /**
   * See `PostRepoPort.transaction`'s own doc for why this exists. No real SQL connection backs
   * this adapter, so "atomic" here means snapshot-and-restore: `rows`/`revisions`/`autosaves` are
   * captured before `fn` runs, and restored verbatim if it throws — safe because JavaScript has no
   * real concurrent access to these arrays between the snapshot and the restore (single-threaded,
   * no I/O yields a competing writer could land in).
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const rowsSnapshot = [...this.rows];
    const revisionsSnapshot = [...this.revisions];
    const autosavesSnapshot = new Map(this.autosaves);
    try {
      return await fn();
    } catch (error) {
      this.rows = rowsSnapshot;
      this.revisions = revisionsSnapshot;
      this.autosaves = autosavesSnapshot;
      throw error;
    }
  }
}
