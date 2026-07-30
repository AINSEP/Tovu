import type { PluginActivationRecord, PluginActivationRepoPort } from "./activation";

/**
 * @file In-memory `PluginActivationRepoPort` adapter — mirrors
 * `src/features/presentation/repo.memory.ts`'s shape exactly (rule-of-two, day one).
 *
 * Architectural role:
 * TDD-certified stub (implementation outline C-013). Method bodies intentionally throw until the
 * Programmer stage implements them against `__tests__/integration/repo.contract.test.ts` (the
 * shared suite this adapter and `repo.sqlite.ts` must both satisfy identically).
 */
export class InMemoryPluginActivationRepo implements PluginActivationRepoPort {
  private rows: PluginActivationRecord[];

  constructor(initialRows: PluginActivationRecord[] = []) {
    this.rows = [...initialRows];
  }

  async getActivation(required: { workspaceId: string; pluginId: string }): Promise<PluginActivationRecord | null> {
    return (
      this.rows.find(
        (row) => row.workspaceId === required.workspaceId && row.pluginId === required.pluginId
      ) ?? null
    );
  }

  async save(record: PluginActivationRecord): Promise<void> {
    const index = this.rows.findIndex(
      (row) => row.workspaceId === record.workspaceId && row.pluginId === record.pluginId
    );
    if (index === -1) {
      this.rows.push(record);
      return;
    }

    this.rows[index] = record;
  }

  async listAll(): Promise<PluginActivationRecord[]> {
    return [...this.rows];
  }
}
