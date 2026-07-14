import type { SettingsRepoPort } from "./ports";
import type { SettingDefinitionRecord, SettingRevisionRecord, SettingValueRecord } from "./types";

/**
 * @file In-memory adapter for `SettingsRepoPort` (SPEC-007, rule-of-two #1).
 *
 * Purpose:
 * Test/dev implementation. Mirrors the exact style of
 * `features/presentation/repo.memory.ts` / `identity/repo.memory.ts`:
 * constructor takes seed rows, methods filter/mutate internal arrays.
 * `transaction` is a no-op wrapper here (all mutations are already
 * synchronous/atomic in-process) — the real atomicity guarantee is proven
 * against `repo.sqlite.ts`.
 */
export class InMemorySettingsRepo implements SettingsRepoPort {
  private definitions: SettingDefinitionRecord[];
  private globalValues: SettingValueRecord[];
  private workspaceValues: SettingValueRecord[];
  private userValues: SettingValueRecord[];
  private revisions: SettingRevisionRecord[];
  private nextSeq: number;

  constructor(
    seed: {
      definitions?: SettingDefinitionRecord[];
      globalValues?: SettingValueRecord[];
      workspaceValues?: SettingValueRecord[];
      userValues?: SettingValueRecord[];
      revisions?: SettingRevisionRecord[];
    } = {}
  ) {
    this.definitions = [...(seed.definitions ?? [])];
    this.globalValues = [...(seed.globalValues ?? [])];
    this.workspaceValues = [...(seed.workspaceValues ?? [])];
    this.userValues = [...(seed.userValues ?? [])];
    this.revisions = [...(seed.revisions ?? [])];
    this.nextSeq = (seed.revisions?.reduce((max, r) => Math.max(max, r.seq), 0) ?? 0) + 1;
  }

  async findActiveDefinition(required: {
    namespace: string;
    key: string;
    workspaceId: string | null;
  }): Promise<SettingDefinitionRecord | null> {
    // Matches active/alias/tombstone (the "current" row for this (ns,key,ws)
    // slot — callers decide how to react to each status, e.g. settings.ts
    // treats tombstone as read-absent but write-service.ts reports it
    // distinctly as DEFINITION_TOMBSTONED). Deliberately excludes
    // `deprecated`: those are stale prior-version rows superseded by a newer
    // active row at the same (ns,key,ws) slot (ADR-028 §2's retype
    // mechanism), so including them would make this lookup ambiguous.
    return (
      this.definitions.find(
        (d) =>
          d.namespace === required.namespace &&
          d.key === required.key &&
          d.workspaceId === required.workspaceId &&
          (d.status === "active" || d.status === "alias" || d.status === "tombstone")
      ) ?? null
    );
  }

  async findDefinitionBySettingId(required: {
    settingId: string;
    version?: number;
  }): Promise<SettingDefinitionRecord | null> {
    const candidates = this.definitions.filter((d) => d.settingId === required.settingId);
    if (required.version != null) {
      return candidates.find((d) => d.version === required.version) ?? null;
    }
    return (
      candidates.find((d) => d.status === "active") ??
      candidates.sort((a, b) => b.version - a.version)[0] ??
      null
    );
  }

  async listActiveDefinitions(required: { workspaceId: string | null }): Promise<SettingDefinitionRecord[]> {
    return this.definitions.filter(
      (d) => d.workspaceId === required.workspaceId && (d.status === "active" || d.status === "alias")
    );
  }

  async saveDefinition(record: SettingDefinitionRecord): Promise<void> {
    const index = this.definitions.findIndex(
      (d) => d.settingId === record.settingId && d.version === record.version
    );
    if (index === -1) {
      this.definitions.push(record);
      return;
    }
    this.definitions[index] = record;
  }

  async getGlobalValue(settingId: string): Promise<SettingValueRecord | null> {
    return this.globalValues.find((v) => v.settingId === settingId) ?? null;
  }

  async getWorkspaceValue(required: {
    workspaceId: string;
    settingId: string;
  }): Promise<SettingValueRecord | null> {
    return (
      this.workspaceValues.find(
        (v) => v.workspaceId === required.workspaceId && v.settingId === required.settingId
      ) ?? null
    );
  }

  async getUserValue(required: {
    workspaceId: string;
    principalId: string;
    settingId: string;
  }): Promise<SettingValueRecord | null> {
    return (
      this.userValues.find(
        (v) =>
          v.workspaceId === required.workspaceId &&
          v.principalId === required.principalId &&
          v.settingId === required.settingId
      ) ?? null
    );
  }

  async saveGlobalValue(record: SettingValueRecord): Promise<void> {
    const index = this.globalValues.findIndex((v) => v.settingId === record.settingId);
    if (index === -1) {
      this.globalValues.push(record);
      return;
    }
    this.globalValues[index] = record;
  }

  async saveWorkspaceValue(record: SettingValueRecord): Promise<void> {
    const index = this.workspaceValues.findIndex(
      (v) => v.workspaceId === record.workspaceId && v.settingId === record.settingId
    );
    if (index === -1) {
      this.workspaceValues.push(record);
      return;
    }
    this.workspaceValues[index] = record;
  }

  async saveUserValue(record: SettingValueRecord): Promise<void> {
    const index = this.userValues.findIndex(
      (v) =>
        v.workspaceId === record.workspaceId &&
        v.principalId === record.principalId &&
        v.settingId === record.settingId
    );
    if (index === -1) {
      this.userValues.push(record);
      return;
    }
    this.userValues[index] = record;
  }

  async listWorkspaceValues(required: { workspaceId: string }): Promise<SettingValueRecord[]> {
    return this.workspaceValues.filter((v) => v.workspaceId === required.workspaceId);
  }

  async listUserValues(required: { workspaceId: string; principalId: string }): Promise<SettingValueRecord[]> {
    return this.userValues.filter(
      (v) => v.workspaceId === required.workspaceId && v.principalId === required.principalId
    );
  }

  async listUserValuesByWorkspace(required: { workspaceId: string }): Promise<SettingValueRecord[]> {
    return this.userValues.filter((v) => v.workspaceId === required.workspaceId);
  }

  async deleteWorkspaceValue(required: { workspaceId: string; settingId: string }): Promise<void> {
    this.workspaceValues = this.workspaceValues.filter(
      (v) => !(v.workspaceId === required.workspaceId && v.settingId === required.settingId)
    );
  }

  async deleteUserValue(required: { workspaceId: string; principalId: string; settingId: string }): Promise<void> {
    this.userValues = this.userValues.filter(
      (v) =>
        !(
          v.workspaceId === required.workspaceId &&
          v.principalId === required.principalId &&
          v.settingId === required.settingId
        )
    );
  }

  async appendRevision(record: Omit<SettingRevisionRecord, "seq">): Promise<number> {
    const seq = this.nextSeq++;
    this.revisions.push({ ...record, seq });
    return seq;
  }

  async listRevisions(required: { settingId: string }): Promise<SettingRevisionRecord[]> {
    return this.revisions.filter((r) => r.settingId === required.settingId).sort((a, b) => a.seq - b.seq);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}
