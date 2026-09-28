import type { Insertable, Selectable } from "kysely";

import type { JsonValue } from "@jini-ai/cms/core";
import type {
  SettingsRepoPort,
  DefinitionStatus,
  RevisionEntityKind,
  RevisionOp,
  SettingDefinitionRecord,
  SettingRevisionRecord,
  SettingScope,
  SettingValueRecord,
  SettingValueSchema,
  ValueState,
} from "@jini-ai/cms/settings";

import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type {
  SettingDefinitionsTable,
  SettingRevisionsTable,
  SettingValuesGlobalTable,
} from "../../platform/db/content-database.generated.js";

/**
 * @file THE `SettingsRepoPort` adapter (SPEC-007, rule-of-two #2): one Kysely query body for every
 * dialect the storage kernel drives (storage plan §4, ADR-066). Satisfies the same port as
 * `@jini-ai/cms/settings`' `InMemorySettingsRepo`; `repo.sqlite.ts` is the thin subclass the call
 * sites build from the content db handle.
 *
 * `transaction` is the kernel's: `write-service.ts`'s chokepoint callback awaits repo calls inside
 * it, which the kernel allows (ADR-028 §4's "`BEGIN IMMEDIATE` -> ... -> COMMIT" on SQLite).
 */

type ValueRow = Pick<
  Selectable<SettingValuesGlobalTable>,
  "setting_id" | "value_json" | "state" | "def_version" | "seq" | "updated_by" | "updated_at" | "origin_plugin_id"
>;

function toDefinitionRecord(row: Selectable<SettingDefinitionsTable>): SettingDefinitionRecord {
  return {
    settingId: row.setting_id,
    version: row.version,
    workspaceId: row.workspace_id,
    namespace: row.namespace,
    key: row.key,
    ownerKind: row.owner_kind as SettingDefinitionRecord["ownerKind"],
    ownerId: row.owner_id,
    schema: JSON.parse(row.schema_json) as SettingValueSchema,
    defaultValue: row.default_json == null ? null : (JSON.parse(row.default_json) as JsonValue),
    scopes: row.scopes,
    secret: Number(row.secret) === 1,
    status: row.status as DefinitionStatus,
    aliasOfNamespace: row.alias_of_ns,
    aliasOfKey: row.alias_of_key,
    coercionTag: row.coercion_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDefinitionRow(record: SettingDefinitionRecord): Insertable<SettingDefinitionsTable> {
  return {
    setting_id: record.settingId,
    version: record.version,
    workspace_id: record.workspaceId,
    namespace: record.namespace,
    key: record.key,
    owner_kind: record.ownerKind,
    owner_id: record.ownerId,
    schema_json: JSON.stringify(record.schema),
    default_json: record.defaultValue == null ? null : JSON.stringify(record.defaultValue),
    scopes: record.scopes,
    secret: record.secret ? 1 : 0,
    status: record.status,
    alias_of_key: record.aliasOfKey,
    alias_of_ns: record.aliasOfNamespace,
    coercion_json: record.coercionTag,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function toValueRecord(row: ValueRow, scope: SettingScope, workspaceId: string | null, principalId: string | null): SettingValueRecord {
  return {
    settingId: row.setting_id,
    scope,
    workspaceId,
    principalId,
    valueJson: row.value_json == null ? null : (JSON.parse(row.value_json) as JsonValue),
    state: row.state as ValueState,
    defVersion: row.def_version,
    seq: row.seq,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    originPluginId: row.origin_plugin_id,
  };
}

/** The columns every value table shares, as written. `state='set'` always serializes the value (even
 *  JSON `null`) as text so it's distinguishable from a SQL-NULL 'cleared' row. */
function valueColumns(record: SettingValueRecord) {
  return {
    value_json: record.state === "cleared" ? null : JSON.stringify(record.valueJson),
    state: record.state,
    def_version: record.defVersion,
    seq: record.seq,
    updated_by: record.updatedBy,
    updated_at: record.updatedAt,
    origin_plugin_id: record.originPluginId,
  };
}

function toRevisionRecord(row: Selectable<SettingRevisionsTable>): SettingRevisionRecord {
  return {
    seq: row.seq,
    entityKind: row.entity_kind as RevisionEntityKind,
    settingId: row.setting_id,
    scope: row.scope as SettingScope | null,
    workspaceId: row.workspace_id,
    principalId: row.principal_id,
    op: row.op as RevisionOp,
    beforeJson: row.before_json == null ? null : (JSON.parse(row.before_json) as JsonValue),
    afterJson: row.after_json == null ? null : (JSON.parse(row.after_json) as JsonValue),
    defVersion: row.def_version,
    actor: row.actor,
    originPluginId: row.origin_plugin_id,
    changeSetId: row.change_set_id,
    createdAt: row.created_at,
  };
}

export class SqlSettingsRepo implements SettingsRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findActiveDefinition(required: {
    namespace: string;
    key: string;
    workspaceId: string | null;
  }): Promise<SettingDefinitionRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("setting_definitions")
        .selectAll()
        .where("namespace", "=", required.namespace)
        .where("key", "=", required.key)
        .where("workspace_id", required.workspaceId === null ? "is" : "=", required.workspaceId)
        .where("status", "in", ["active", "alias", "tombstone"])
        .orderBy("version")
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toDefinitionRecord(row) : null;
  }

  async findDefinitionBySettingId(required: {
    settingId: string;
    version?: number;
  }): Promise<SettingDefinitionRecord | null> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("setting_definitions").selectAll().where("setting_id", "=", required.settingId).execute()
    );
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
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("setting_definitions")
        .selectAll()
        .where("workspace_id", required.workspaceId === null ? "is" : "=", required.workspaceId)
        .where("status", "in", ["active", "alias"])
        .orderBy("setting_id")
        .orderBy("version")
        .execute()
    );
    return rows.map(toDefinitionRecord);
  }

  async saveDefinition(record: SettingDefinitionRecord): Promise<void> {
    const row = toDefinitionRow(record);
    const { setting_id: _id, version: _version, created_at: _created, ...updatable } = row;
    await this.kernel.run((db) =>
      db
        .insertInto("setting_definitions")
        .values(row)
        .onConflict((oc) => oc.columns(["setting_id", "version"]).doUpdateSet(updatable))
        .execute()
    );
  }

  async getGlobalValue(settingId: string): Promise<SettingValueRecord | null> {
    const row = await this.kernel.run((db) =>
      db.selectFrom("setting_values_global").selectAll().where("setting_id", "=", settingId).limit(1).executeTakeFirst()
    );
    return row ? toValueRecord(row, "global", null, null) : null;
  }

  async getWorkspaceValue(required: { workspaceId: string; settingId: string }): Promise<SettingValueRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("setting_values_workspace")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("setting_id", "=", required.settingId)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toValueRecord(row, "workspace", required.workspaceId, null) : null;
  }

  async getUserValue(required: {
    workspaceId: string;
    principalId: string;
    settingId: string;
  }): Promise<SettingValueRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("setting_values_user")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("principal_id", "=", required.principalId)
        .where("setting_id", "=", required.settingId)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toValueRecord(row, "user", required.workspaceId, required.principalId) : null;
  }

  async saveGlobalValue(record: SettingValueRecord): Promise<void> {
    const columns = valueColumns(record);
    await this.kernel.run((db) =>
      db
        .insertInto("setting_values_global")
        .values({ setting_id: record.settingId, ...columns })
        .onConflict((oc) => oc.column("setting_id").doUpdateSet(columns))
        .execute()
    );
  }

  async saveWorkspaceValue(record: SettingValueRecord): Promise<void> {
    const workspaceId = record.workspaceId;
    if (workspaceId == null) throw new Error("saveWorkspaceValue requires workspaceId");
    const columns = valueColumns(record);
    await this.kernel.run((db) =>
      db
        .insertInto("setting_values_workspace")
        .values({ setting_id: record.settingId, workspace_id: workspaceId, ...columns })
        .onConflict((oc) => oc.columns(["workspace_id", "setting_id"]).doUpdateSet(columns))
        .execute()
    );
  }

  async saveUserValue(record: SettingValueRecord): Promise<void> {
    const { workspaceId, principalId } = record;
    if (workspaceId == null || principalId == null) {
      throw new Error("saveUserValue requires workspaceId and principalId");
    }
    const columns = valueColumns(record);
    await this.kernel.run((db) =>
      db
        .insertInto("setting_values_user")
        .values({ setting_id: record.settingId, workspace_id: workspaceId, principal_id: principalId, ...columns })
        .onConflict((oc) => oc.columns(["workspace_id", "principal_id", "setting_id"]).doUpdateSet(columns))
        .execute()
    );
  }

  async listWorkspaceValues(required: { workspaceId: string }): Promise<SettingValueRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("setting_values_workspace").selectAll().where("workspace_id", "=", required.workspaceId).execute()
    );
    return rows.map((r) => toValueRecord(r, "workspace", required.workspaceId, null));
  }

  async listUserValues(required: { workspaceId: string; principalId: string }): Promise<SettingValueRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("setting_values_user")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("principal_id", "=", required.principalId)
        .execute()
    );
    return rows.map((r) => toValueRecord(r, "user", required.workspaceId, required.principalId));
  }

  async listUserValuesByWorkspace(required: { workspaceId: string }): Promise<SettingValueRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("setting_values_user").selectAll().where("workspace_id", "=", required.workspaceId).execute()
    );
    return rows.map((r) => toValueRecord(r, "user", required.workspaceId, r.principal_id));
  }

  async deleteWorkspaceValue(required: { workspaceId: string; settingId: string }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .deleteFrom("setting_values_workspace")
        .where("workspace_id", "=", required.workspaceId)
        .where("setting_id", "=", required.settingId)
        .execute()
    );
  }

  async deleteUserValue(required: { workspaceId: string; principalId: string; settingId: string }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .deleteFrom("setting_values_user")
        .where("workspace_id", "=", required.workspaceId)
        .where("principal_id", "=", required.principalId)
        .where("setting_id", "=", required.settingId)
        .execute()
    );
  }

  /**
   * Appends one revision and returns its `seq`. Takes `lockKey` on the revision stream inside the
   * caller's transaction (or its own): `listRevisionsSince` subscribers page by `seq`, so a lower
   * `seq` must never commit after a higher one — on Postgres, sequence values are handed out before
   * commit, and without the lock two writers could commit out of order and a subscriber would skip
   * the late one. SQLite's `BEGIN IMMEDIATE` already serializes writers.
   */
  async appendRevision(record: Omit<SettingRevisionRecord, "seq">): Promise<number> {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey("setting_revisions");
      const inserted = await this.kernel.run((db) =>
        db
          .insertInto("setting_revisions")
          .values({
            entity_kind: record.entityKind,
            setting_id: record.settingId,
            scope: record.scope,
            workspace_id: record.workspaceId,
            principal_id: record.principalId,
            op: record.op,
            before_json: record.beforeJson == null ? null : JSON.stringify(record.beforeJson),
            after_json: record.afterJson == null ? null : JSON.stringify(record.afterJson),
            def_version: record.defVersion,
            actor: record.actor,
            origin_plugin_id: record.originPluginId,
            change_set_id: record.changeSetId,
            created_at: record.createdAt,
          })
          .returning("seq")
          .executeTakeFirstOrThrow()
      );
      return Number(inserted.seq);
    });
  }

  async listRevisions(required: { settingId: string }): Promise<SettingRevisionRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("setting_revisions").selectAll().where("setting_id", "=", required.settingId).orderBy("seq").execute()
    );
    return rows.map(toRevisionRecord);
  }

  async listRevisionsSince(required: {
    sinceSeq: number;
    limit: number;
    workspaceId: string;
  }): Promise<SettingRevisionRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("setting_revisions")
        .selectAll()
        .where("seq", ">", required.sinceSeq)
        // A NULL `workspace_id` is a platform definition or a `global`-scope value — resolved by
        // every workspace, so every workspace must hear about it. Everything else belongs to one
        // tenant. See the port's doc for why this is a page-sizing predicate rather than the
        // disclosure check: it must stay a superset of `isRevisionVisibleTo`, which remains the
        // only thing deciding what a subscriber is actually told.
        .where((eb) => eb.or([eb("workspace_id", "is", null), eb("workspace_id", "=", required.workspaceId)]))
        .orderBy("seq")
        .limit(required.limit)
        .execute()
    );
    return rows.map(toRevisionRecord);
  }

  async maxRevisionSeq(): Promise<number> {
    // `seq` is the auto-assigned primary key, so this is an index lookup rather than a scan.
    const row = await this.kernel.run((db) =>
      db.selectFrom("setting_revisions").select("seq").orderBy("seq", "desc").limit(1).executeTakeFirst()
    );
    return row ? Number(row.seq) : 0;
  }

  /**
   * Runs `fn` inside one kernel transaction. A call nested in the same async context joins the
   * outer one; an unrelated caller (another request) waits its turn instead of landing inside it —
   * the kernel tracks this per async context, so two independent root calls never merge (the defect
   * an instance-level depth counter once had). A caller that needs several writes to commit together
   * opens ONE transaction around them — see `resetNamespace`.
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.kernel.transaction(fn);
  }
}

/** The settings repo on `kernel`'s database, whichever dialect. */
export function settingsRepoFor(kernel: ContentKernel): SettingsRepoPort {
  return new SqlSettingsRepo(kernel);
}
