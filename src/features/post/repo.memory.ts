import type { PostRecord, PostRepoPort } from "./post";

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
}
