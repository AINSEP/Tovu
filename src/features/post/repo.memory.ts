import type { PostRecord, PostRepoPort } from "./post";

/**
 * SPEC-005 (T021): `ext` needs no special handling here. Unlike `repo.sqlite.ts` — which has to
 * serialize it to a JSON text column and normalize the `{}` default back to an absent field —
 * this adapter stores and returns whole `PostRecord`s verbatim, exactly as it already does for
 * `bodyJson`, so `ext` (present or absent) round-trips unchanged.
 */

export class InMemoryPostRepo implements PostRepoPort {
  private rows: PostRecord[];

  constructor(initialRows: PostRecord[] = []) {
    this.rows = [...initialRows];
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

  async save(record: PostRecord): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === record.id);
    if (index === -1) {
      this.rows.push(record);
      return;
    }

    this.rows[index] = record;
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
}
