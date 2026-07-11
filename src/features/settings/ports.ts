import type { UUID } from "../../core/ports";
import type { SettingDefinitionRecord, SettingRevisionRecord, SettingValueRecord } from "./types";

/**
 * @file Port contract for the `settings` library (SPEC-007, ADR-028 §8, ADR-PIPE-007).
 *
 * Purpose:
 * Dependency-inversion seam (ADR-006 rule-of-two) for the 5 settings tables.
 * Deliberately does NOT declare a principal-lookup method — REQ-13's
 * target-principal check reuses `identity.PrincipalRepoPort.findById`
 * directly (ADR-PIPE-007 Pattern Evaluation: reuse, not a new port).
 *
 * `transaction` gives `write-service.ts`/`purge-service.ts` the same-tx
 * guarantee INV-01/INV-06 depend on (value/definition row + its revision row
 * must commit together, or not at all).
 *
 * Interfaces and types only — no feature logic.
 */
export interface SettingsRepoPort {
  findActiveDefinition(required: {
    namespace: string;
    key: string;
    workspaceId: UUID | null;
  }): Promise<SettingDefinitionRecord | null>;
  findDefinitionBySettingId(required: {
    settingId: UUID;
    version?: number;
  }): Promise<SettingDefinitionRecord | null>;
  listActiveDefinitions(required: { workspaceId: UUID | null }): Promise<SettingDefinitionRecord[]>;
  saveDefinition(record: SettingDefinitionRecord): Promise<void>;

  getGlobalValue(settingId: UUID): Promise<SettingValueRecord | null>;
  getWorkspaceValue(required: { workspaceId: UUID; settingId: UUID }): Promise<SettingValueRecord | null>;
  getUserValue(required: {
    workspaceId: UUID;
    principalId: UUID;
    settingId: UUID;
  }): Promise<SettingValueRecord | null>;
  saveGlobalValue(record: SettingValueRecord): Promise<void>;
  saveWorkspaceValue(record: SettingValueRecord): Promise<void>;
  saveUserValue(record: SettingValueRecord): Promise<void>;

  listWorkspaceValues(required: { workspaceId: UUID }): Promise<SettingValueRecord[]>;
  listUserValues(required: { workspaceId: UUID; principalId: UUID }): Promise<SettingValueRecord[]>;
  deleteWorkspaceValue(required: { workspaceId: UUID; settingId: UUID }): Promise<void>;
  deleteUserValue(required: { workspaceId: UUID; principalId: UUID; settingId: UUID }): Promise<void>;

  /** Appends a revision and returns its assigned `seq` (used to stamp the paired value row). */
  appendRevision(record: Omit<SettingRevisionRecord, "seq">): Promise<number>;
  listRevisions(required: { settingId: UUID }): Promise<SettingRevisionRecord[]>;

  /** Runs `fn` with the guarantee that all repo calls inside it commit or roll back together. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
