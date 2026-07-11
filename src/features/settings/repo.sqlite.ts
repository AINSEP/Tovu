import type Database from "better-sqlite3";
import { and, eq, isNull } from "drizzle-orm";

import type { JsonValue } from "../../core/ports";
import {
  settingDefinitions,
  settingRevisions,
  settingValuesGlobal,
  settingValuesUser,
  settingValuesWorkspace,
} from "../../infra/db/schema";
import type { ContentDb } from "../../infra/sqlite/content-db";
import type { SettingsRepoPort } from "./ports";
import type {
  DefinitionStatus,
  RevisionEntityKind,
  RevisionOp,
  SettingDefinitionRecord,
  SettingRevisionRecord,
  SettingScope,
  SettingValueRecord,
  SettingValueSchema,
  ValueState,
} from "./types";

/**
 * @file Drizzle/SQLite `SettingsRepoPort` adapter (SPEC-007, rule-of-two #2).
 *
 * Purpose:
 * Satisfies the same `SettingsRepoPort` as `repo.memory.ts`. `transaction`
 * uses manual `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` against the raw
 * better-sqlite3 handle (`db.$client`) rather than Drizzle's
 * `db.transaction((tx) => ...)` wrapper — that wrapper requires a
 * *synchronous* callback (better-sqlite3 itself is synchronous), but
 * `write-service.ts`'s chokepoint callback does `await`ed repo calls. Manual
 * BEGIN/COMMIT is safe here because better-sqlite3 has no real async I/O:
 * every call resolves on the same microtask tick, so no other statement can
 * interleave on this single connection between awaits. Matches ADR-028 §4's
 * literal "`BEGIN IMMEDIATE` -> ... -> COMMIT" language.
 */

function toSchema(json: string): SettingValueSchema {
  return JSON.parse(json) as SettingValueSchema;
}

function toDefinitionRecord(row: typeof settingDefinitions.$inferSelect): SettingDefinitionRecord {
  return {
    settingId: row.settingId,
    version: row.version,
    workspaceId: row.workspaceId,
    namespace: row.namespace,
    key: row.key,
    ownerKind: row.ownerKind as SettingDefinitionRecord["ownerKind"],
    ownerId: row.ownerId,
    schema: toSchema(row.schemaJson),
    defaultValue: row.defaultJson == null ? null : (JSON.parse(row.defaultJson) as JsonValue),
    scopes: row.scopes,
    secret: row.secret === 1,
    status: row.status as DefinitionStatus,
    aliasOfNamespace: row.aliasOfNs,
    aliasOfKey: row.aliasOfKey,
    coercionTag: row.coercionJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toValueRecord(
  row: {
    settingId: string;
    valueJson: string | null;
    state: string;
    defVersion: number;
    seq: number;
    updatedBy: string;
    updatedAt: string;
    originPluginId: string | null;
  },
  scope: SettingScope,
  workspaceId: string | null,
  principalId: string | null
): SettingValueRecord {
  return {
    settingId: row.settingId,
    scope,
    workspaceId,
    principalId,
    valueJson: row.valueJson == null ? null : (JSON.parse(row.valueJson) as JsonValue),
    state: row.state as ValueState,
    defVersion: row.defVersion,
    seq: row.seq,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    originPluginId: row.originPluginId,
  };
}

/** `state='set'` always serializes the value (even JSON `null`) as text so it's distinguishable from a SQL-NULL 'cleared' row. */
function valueJsonColumn(state: ValueState, valueJson: JsonValue | null): string | null {
  return state === "cleared" ? null : JSON.stringify(valueJson);
}

export class SqliteSettingsRepo implements SettingsRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findActiveDefinition(required: {
    namespace: string;
    key: string;
    workspaceId: string | null;
  }): Promise<SettingDefinitionRecord | null> {
    const workspaceClause =
      required.workspaceId === null
        ? isNull(settingDefinitions.workspaceId)
        : eq(settingDefinitions.workspaceId, required.workspaceId);
    const rows = this.db
      .select()
      .from(settingDefinitions)
      .where(
        and(
          eq(settingDefinitions.namespace, required.namespace),
          eq(settingDefinitions.key, required.key),
          workspaceClause
        )
      )
      .all()
      .filter((r) => r.status === "active" || r.status === "alias" || r.status === "tombstone");
    return rows[0] ? toDefinitionRecord(rows[0]) : null;
  }

  async findDefinitionBySettingId(required: {
    settingId: string;
    version?: number;
  }): Promise<SettingDefinitionRecord | null> {
    const rows = this.db
      .select()
      .from(settingDefinitions)
      .where(eq(settingDefinitions.settingId, required.settingId))
      .all();
    if (required.version != null) {
      const row = rows.find((r) => r.version === required.version);
      return row ? toDefinitionRecord(row) : null;
    }
    const active = rows.find((r) => r.status === "active");
    if (active) return toDefinitionRecord(active);
    const latest = rows.sort((a, b) => b.version - a.version)[0];
    return latest ? toDefinitionRecord(latest) : null;
  }

  async listActiveDefinitions(required: { workspaceId: string | null }): Promise<SettingDefinitionRecord[]> {
    const workspaceClause =
      required.workspaceId === null
        ? isNull(settingDefinitions.workspaceId)
        : eq(settingDefinitions.workspaceId, required.workspaceId);
    const rows = this.db
      .select()
      .from(settingDefinitions)
      .where(workspaceClause)
      .all()
      .filter((r) => r.status === "active" || r.status === "alias");
    return rows.map(toDefinitionRecord);
  }

  async saveDefinition(record: SettingDefinitionRecord): Promise<void> {
    this.db
      .insert(settingDefinitions)
      .values({
        settingId: record.settingId,
        version: record.version,
        workspaceId: record.workspaceId,
        namespace: record.namespace,
        key: record.key,
        ownerKind: record.ownerKind,
        ownerId: record.ownerId,
        schemaJson: JSON.stringify(record.schema),
        defaultJson: record.defaultValue == null ? null : JSON.stringify(record.defaultValue),
        scopes: record.scopes,
        secret: record.secret ? 1 : 0,
        status: record.status,
        aliasOfKey: record.aliasOfKey,
        aliasOfNs: record.aliasOfNamespace,
        coercionJson: record.coercionTag,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
      .onConflictDoUpdate({
        target: [settingDefinitions.settingId, settingDefinitions.version],
        set: {
          workspaceId: record.workspaceId,
          namespace: record.namespace,
          key: record.key,
          ownerKind: record.ownerKind,
          ownerId: record.ownerId,
          schemaJson: JSON.stringify(record.schema),
          defaultJson: record.defaultValue == null ? null : JSON.stringify(record.defaultValue),
          scopes: record.scopes,
          secret: record.secret ? 1 : 0,
          status: record.status,
          aliasOfKey: record.aliasOfKey,
          aliasOfNs: record.aliasOfNamespace,
          coercionJson: record.coercionTag,
          updatedAt: record.updatedAt,
        },
      })
      .run();
  }

  async getGlobalValue(settingId: string): Promise<SettingValueRecord | null> {
    const rows = this.db
      .select()
      .from(settingValuesGlobal)
      .where(eq(settingValuesGlobal.settingId, settingId))
      .all();
    return rows[0] ? toValueRecord(rows[0], "global", null, null) : null;
  }

  async getWorkspaceValue(required: {
    workspaceId: string;
    settingId: string;
  }): Promise<SettingValueRecord | null> {
    const rows = this.db
      .select()
      .from(settingValuesWorkspace)
      .where(
        and(
          eq(settingValuesWorkspace.workspaceId, required.workspaceId),
          eq(settingValuesWorkspace.settingId, required.settingId)
        )
      )
      .all();
    return rows[0] ? toValueRecord(rows[0], "workspace", required.workspaceId, null) : null;
  }

  async getUserValue(required: {
    workspaceId: string;
    principalId: string;
    settingId: string;
  }): Promise<SettingValueRecord | null> {
    const rows = this.db
      .select()
      .from(settingValuesUser)
      .where(
        and(
          eq(settingValuesUser.workspaceId, required.workspaceId),
          eq(settingValuesUser.principalId, required.principalId),
          eq(settingValuesUser.settingId, required.settingId)
        )
      )
      .all();
    return rows[0] ? toValueRecord(rows[0], "user", required.workspaceId, required.principalId) : null;
  }

  async saveGlobalValue(record: SettingValueRecord): Promise<void> {
    this.db
      .insert(settingValuesGlobal)
      .values({
        settingId: record.settingId,
        valueJson: valueJsonColumn(record.state, record.valueJson),
        state: record.state,
        defVersion: record.defVersion,
        seq: record.seq,
        updatedBy: record.updatedBy,
        updatedAt: record.updatedAt,
        originPluginId: record.originPluginId,
      })
      .onConflictDoUpdate({
        target: settingValuesGlobal.settingId,
        set: {
          valueJson: valueJsonColumn(record.state, record.valueJson),
          state: record.state,
          defVersion: record.defVersion,
          seq: record.seq,
          updatedBy: record.updatedBy,
          updatedAt: record.updatedAt,
          originPluginId: record.originPluginId,
        },
      })
      .run();
  }

  async saveWorkspaceValue(record: SettingValueRecord): Promise<void> {
    if (record.workspaceId == null) throw new Error("saveWorkspaceValue requires workspaceId");
    this.db
      .insert(settingValuesWorkspace)
      .values({
        settingId: record.settingId,
        workspaceId: record.workspaceId,
        valueJson: valueJsonColumn(record.state, record.valueJson),
        state: record.state,
        defVersion: record.defVersion,
        seq: record.seq,
        updatedBy: record.updatedBy,
        updatedAt: record.updatedAt,
        originPluginId: record.originPluginId,
      })
      .onConflictDoUpdate({
        target: [settingValuesWorkspace.workspaceId, settingValuesWorkspace.settingId],
        set: {
          valueJson: valueJsonColumn(record.state, record.valueJson),
          state: record.state,
          defVersion: record.defVersion,
          seq: record.seq,
          updatedBy: record.updatedBy,
          updatedAt: record.updatedAt,
          originPluginId: record.originPluginId,
        },
      })
      .run();
  }

  async saveUserValue(record: SettingValueRecord): Promise<void> {
    if (record.workspaceId == null || record.principalId == null) {
      throw new Error("saveUserValue requires workspaceId and principalId");
    }
    this.db
      .insert(settingValuesUser)
      .values({
        settingId: record.settingId,
        workspaceId: record.workspaceId,
        principalId: record.principalId,
        valueJson: valueJsonColumn(record.state, record.valueJson),
        state: record.state,
        defVersion: record.defVersion,
        seq: record.seq,
        updatedBy: record.updatedBy,
        updatedAt: record.updatedAt,
        originPluginId: record.originPluginId,
      })
      .onConflictDoUpdate({
        target: [settingValuesUser.workspaceId, settingValuesUser.principalId, settingValuesUser.settingId],
        set: {
          valueJson: valueJsonColumn(record.state, record.valueJson),
          state: record.state,
          defVersion: record.defVersion,
          seq: record.seq,
          updatedBy: record.updatedBy,
          updatedAt: record.updatedAt,
          originPluginId: record.originPluginId,
        },
      })
      .run();
  }

  async listWorkspaceValues(required: { workspaceId: string }): Promise<SettingValueRecord[]> {
    const rows = this.db
      .select()
      .from(settingValuesWorkspace)
      .where(eq(settingValuesWorkspace.workspaceId, required.workspaceId))
      .all();
    return rows.map((r) => toValueRecord(r, "workspace", required.workspaceId, null));
  }

  async listUserValues(required: { workspaceId: string; principalId: string }): Promise<SettingValueRecord[]> {
    const rows = this.db
      .select()
      .from(settingValuesUser)
      .where(
        and(
          eq(settingValuesUser.workspaceId, required.workspaceId),
          eq(settingValuesUser.principalId, required.principalId)
        )
      )
      .all();
    return rows.map((r) => toValueRecord(r, "user", required.workspaceId, required.principalId));
  }

  async deleteWorkspaceValue(required: { workspaceId: string; settingId: string }): Promise<void> {
    this.db
      .delete(settingValuesWorkspace)
      .where(
        and(
          eq(settingValuesWorkspace.workspaceId, required.workspaceId),
          eq(settingValuesWorkspace.settingId, required.settingId)
        )
      )
      .run();
  }

  async deleteUserValue(required: { workspaceId: string; principalId: string; settingId: string }): Promise<void> {
    this.db
      .delete(settingValuesUser)
      .where(
        and(
          eq(settingValuesUser.workspaceId, required.workspaceId),
          eq(settingValuesUser.principalId, required.principalId),
          eq(settingValuesUser.settingId, required.settingId)
        )
      )
      .run();
  }

  async appendRevision(record: Omit<SettingRevisionRecord, "seq">): Promise<number> {
    const result = this.db
      .insert(settingRevisions)
      .values({
        entityKind: record.entityKind,
        settingId: record.settingId,
        scope: record.scope,
        workspaceId: record.workspaceId,
        principalId: record.principalId,
        op: record.op,
        beforeJson: record.beforeJson == null ? null : JSON.stringify(record.beforeJson),
        afterJson: record.afterJson == null ? null : JSON.stringify(record.afterJson),
        defVersion: record.defVersion,
        actor: record.actor,
        originPluginId: record.originPluginId,
        changeSetId: record.changeSetId,
        createdAt: record.createdAt,
      })
      .run();
    return Number(result.lastInsertRowid);
  }

  async listRevisions(required: { settingId: string }): Promise<SettingRevisionRecord[]> {
    const rows = this.db
      .select()
      .from(settingRevisions)
      .where(eq(settingRevisions.settingId, required.settingId))
      .all();
    return rows
      .map((r) => ({
        seq: r.seq,
        entityKind: r.entityKind as RevisionEntityKind,
        settingId: r.settingId,
        scope: r.scope as SettingScope | null,
        workspaceId: r.workspaceId,
        principalId: r.principalId,
        op: r.op as RevisionOp,
        beforeJson: r.beforeJson == null ? null : (JSON.parse(r.beforeJson) as JsonValue),
        afterJson: r.afterJson == null ? null : (JSON.parse(r.afterJson) as JsonValue),
        defVersion: r.defVersion,
        actor: r.actor,
        originPluginId: r.originPluginId,
        changeSetId: r.changeSetId,
        createdAt: r.createdAt,
      }))
      .sort((a, b) => a.seq - b.seq);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // `$client` (the raw better-sqlite3 handle) exists at runtime on every
    // `drizzle()`-constructed instance but isn't part of the exported
    // `BetterSQLite3Database` class type `ContentDb` aliases — a known
    // drizzle-orm typing gap (the property lives on the factory's return
    // type, not the class). Cast narrowly, scoped to this one call site.
    const client = (this.db as unknown as { $client: Database.Database }).$client;
    client.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn();
      client.exec("COMMIT");
      return result;
    } catch (error) {
      client.exec("ROLLBACK");
      throw error;
    }
  }
}
