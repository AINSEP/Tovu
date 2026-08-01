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
  /**
   * Every `setting_values_user` row for a workspace, across ALL principals
   * (not just one) — needed by `purge-service.ts`'s full-tenant teardown path
   * (ADR-028 §5), which must clear the FK-blocking `setting_values_user` rows
   * for every principal in the workspace, not just one caller-known id.
   */
  listUserValuesByWorkspace(required: { workspaceId: UUID }): Promise<SettingValueRecord[]>;
  deleteWorkspaceValue(required: { workspaceId: UUID; settingId: UUID }): Promise<void>;
  deleteUserValue(required: { workspaceId: UUID; principalId: UUID; settingId: UUID }): Promise<void>;

  /** Appends a revision and returns its assigned `seq` (used to stamp the paired value row). */
  appendRevision(record: Omit<SettingRevisionRecord, "seq">): Promise<number>;
  listRevisions(required: { settingId: UUID }): Promise<SettingRevisionRecord[]>;
  /**
   * Revisions with `seq` strictly greater than `sinceSeq`, oldest first, capped at `limit`.
   *
   * Exists for change detection across PROCESSES. `seq` is a monotonic autoincrement in the shared
   * database, so a poller in Tovu's main server observes writes made by the agent daemon — a
   * separate OS process with its own connection — without any IPC between them. That is the same
   * boundary that made the per-layer value cache unfixable (see `settings.ts`'s cache header);
   * here it is turned into the mechanism rather than the obstacle, because the ledger is shared
   * state by construction and an in-process cache never was.
   *
   * `limit` bounds a client that reconnects after a long absence: it drains in pages rather than
   * loading an unbounded backlog into memory.
   */
  listRevisionsSince(required: { sinceSeq: number; limit: number }): Promise<SettingRevisionRecord[]>;
  /** The newest assigned `seq`, or 0 when the ledger is empty — a subscriber's starting cursor. */
  maxRevisionSeq(): Promise<number>;

  /** Runs `fn` with the guarantee that all repo calls inside it commit or roll back together. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
