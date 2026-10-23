import { sql } from "kysely";
import type { VaultKind, VaultMeta } from "@jini-ai/platform/secrets/credential-sets";
import type { SecretsVaultTable } from "@jini-ai/db/secrets-vault";
import { tableExists } from "../kernel/dialect.js";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationContext, MigrationStep } from "./step.js";

/** ADR-066/S2: opaque copy first, destructive changes only after coverage. This file deliberately
 * owns its mapping and DDL: changing a runtime registry must never change a pinned migration.
 * SQLite's runner takes its whole-file pre-step backup; PostgreSQL/PGlite retain restore tables
 * AND the pre-step ledger. No cryptography or catalog-dependent guesses belong in this step.
 */
export const SECRETS_VAULT_ID = "0012_secrets_vault";
const SOURCES: readonly { table: string; kind: VaultKind }[] = [
  { table: "site_assistant_credentials", kind: "site-assistant" },
  { table: "admin_execution_credentials", kind: "personal-execution" },
  { table: "media_provider_credentials", kind: "media-provider" },
  { table: "custom_credential_sets", kind: "custom" },
  { table: "publish_content_peers", kind: "publish-peer" },
  { table: "database_transfer_destinations", kind: "database-destination" },
  { table: "vendor_credential_sets", kind: "vendor" },
  { table: "source_control_credential_sets", kind: "source-control" },
  { table: "publish_credential_sets", kind: "vendor" },
];
const KINDS = ["site-assistant", "personal-execution", "media-provider", "custom", "publish-peer",
  "database-destination", "vendor", "source-control", "mcp-env", "mcp-auth"] as const;
const CRYPTO_COLUMNS = ["sealed_key_id", "sealed_ciphertext", "sealed_nonce", "sealed_alg",
  "oauth_sealed_key_id", "oauth_sealed_ciphertext", "oauth_sealed_nonce", "oauth_sealed_alg", "aad_version", "oauth_aad_version"];
type LegacyRow = Record<string, string | number | boolean | null>;
type Coverage = Record<VaultKind, { rows: number; envelopes: number }>;

/** Fixed dialect fragments only (GOV-ADR-003); JSON and scope constraints match queryimpact.md. */
export function secretsVaultStatements({ dialect }: { dialect: "sqlite" | "postgres" }, _options: Record<string, never> = {}): readonly string[] {
  const jsonColumn = dialect === "sqlite"
    ? "meta text NOT NULL CONSTRAINT secrets_vault_meta CHECK(json_valid(meta) AND json_type(meta) = 'object')"
    : "meta jsonb NOT NULL CONSTRAINT secrets_vault_meta CHECK(jsonb_typeof(meta) = 'object')";
  const boolColumn = dialect === "sqlite" ? "is_default integer NOT NULL CONSTRAINT secrets_vault_boolean CHECK(is_default IN (false,true))" : "is_default boolean NOT NULL CONSTRAINT secrets_vault_boolean CHECK(is_default IN (false,true))";
  const table = `CREATE TABLE secrets_vault (
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    id text NOT NULL, kind text NOT NULL CONSTRAINT secrets_vault_kind CHECK(kind IN
      ('site-assistant','personal-execution','media-provider','custom','publish-peer','database-destination','vendor','source-control','mcp-env','mcp-auth')),
    owner_key text NOT NULL, principal_id text REFERENCES principals(id) ON DELETE CASCADE,
    binding text, provider text, label text NOT NULL, ${boolColumn},
    revision ${dialect === "sqlite" ? "integer" : "bigint"} NOT NULL CONSTRAINT secrets_vault_revision CHECK(revision > 0),
    sealed_key_id text, sealed_ciphertext text, sealed_nonce text, sealed_alg text,
    last4 text, token_length ${dialect === "sqlite" ? "integer" : "bigint"} CONSTRAINT secrets_vault_token_length CHECK(token_length IS NULL OR token_length >= 0), ${jsonColumn},
    created_at text NOT NULL, updated_at text NOT NULL,
    PRIMARY KEY(workspace_id,id),
    CONSTRAINT secrets_vault_sealed_shape CHECK((sealed_key_id IS NULL AND sealed_ciphertext IS NULL AND sealed_nonce IS NULL AND sealed_alg IS NULL)
      OR (sealed_key_id IS NOT NULL AND sealed_ciphertext IS NOT NULL AND sealed_nonce IS NOT NULL AND sealed_alg IS NOT NULL)),
    CONSTRAINT secrets_vault_personal_principal CHECK(kind <> 'personal-execution' OR principal_id IS NOT NULL),
    CONSTRAINT secrets_vault_media_provider CHECK(kind <> 'media-provider' OR provider IS NOT NULL),
    CONSTRAINT secrets_vault_principal_scope CHECK(kind = 'personal-execution' OR principal_id IS NULL),
    CONSTRAINT secrets_vault_owner CHECK(kind IN ('mcp-env','mcp-auth') OR owner_key = 'tovu'),
    CONSTRAINT secrets_vault_provider_scope CHECK(kind NOT IN ('custom','publish-peer','database-destination') OR provider IS NULL),
    CONSTRAINT secrets_vault_hint CHECK(last4 IS NULL OR (token_length IS NOT NULL AND token_length >= 12 AND length(last4) = 4))
  )`;
  const group = "workspace_id,kind,owner_key,(principal_id IS NULL),coalesce(principal_id,''),(provider IS NULL),coalesce(provider,'')";
  const indexes = [
    "CREATE INDEX secrets_vault_scope ON secrets_vault(workspace_id,kind,owner_key,principal_id,provider)",
    "CREATE INDEX secrets_vault_principal ON secrets_vault(principal_id,workspace_id,kind)",
    "CREATE UNIQUE INDEX secrets_vault_singleton ON secrets_vault(workspace_id,kind) WHERE kind IN ('site-assistant','database-destination')",
    "CREATE UNIQUE INDEX secrets_vault_personal ON secrets_vault(workspace_id,kind,principal_id) WHERE kind = 'personal-execution'",
    "CREATE UNIQUE INDEX secrets_vault_media ON secrets_vault(workspace_id,kind,provider) WHERE kind = 'media-provider'",
    `CREATE UNIQUE INDEX secrets_vault_default ON secrets_vault(${group}) WHERE is_default = ${dialect === "sqlite" ? "1" : "true"}`,
    `CREATE UNIQUE INDEX secrets_vault_group_label ON secrets_vault(${group},label) WHERE kind IN ('vendor','source-control')`,
    "CREATE UNIQUE INDEX secrets_vault_label ON secrets_vault(workspace_id,kind,label) WHERE kind IN ('custom','publish-peer')",
  ];
  return [table, ...indexes];
}
async function createVault({ kernel }: { kernel: StorageKernel<unknown> }): Promise<void> {
  for (const statement of secretsVaultStatements({ dialect: kernel.dialect })) await kernel.execute(sql.raw(statement));
}

function text({ row, field }: { row: LegacyRow; field: string }): string {
  const value = row[field];
  if (typeof value !== "string") throw new Error(`secrets vault: invalid source field ${field}`);
  return value;
}
function nullable({ row, field }: { row: LegacyRow; field: string }): string | null {
  return row[field] === null || row[field] === undefined ? null : text({ row, field });
}

/** Count guards fail closed; absence/NaN never becomes an apparently empty source. */
async function count({ kernel, table, where = sql`true` }: { kernel: StorageKernel<unknown>; table: string; where?: ReturnType<typeof sql> }): Promise<number> {
  const rows = await kernel.query<{ n: number | string }>(sql`SELECT count(*) AS n FROM ${sql.table(table)} WHERE ${where}`);
  const raw = rows[0]?.n;
  const n = Number(raw);
  if (rows.length !== 1 || (typeof raw !== "number" && (typeof raw !== "string" || !/^[0-9]+$/.test(raw))) ||
    !Number.isSafeInteger(n) || n < 0) throw new Error("secrets vault: invalid coverage count");
  return n;
}

/** Safely retain identities, including IDs reused by another folded table. Reservation of ALL
 * original IDs prevents a generated collision ID from stealing a later source's original ID. */
function freeValue({ preferred, fallback, taken, reserved }: { preferred: string; fallback: string; taken: Set<string>; reserved: Set<string> }): string {
  let value = preferred;
  let suffix = 0;
  if (taken.has(value)) do { value = `${fallback}:${suffix++}`; } while (taken.has(value) || reserved.has(value));
  taken.add(value);
  return value;
}

/** Retain a source label or return a human legacy-copy suffix, reserving it in the group.
 * Machine identity stays in migration metadata. No I/O or errors; mutates only `taken`.
 * @complexity O(c) set lookups/O(1) auxiliary space for c occupied copy suffixes.
 */
function freeLabel({ preferred, taken }: { preferred: string; taken: Set<string> }, _options = {}): string {
  let label = preferred;
  let copy = 1;
  while (taken.has(label)) {
    label = `${preferred} (legacy copy${copy === 1 ? "" : ` ${copy}`})`;
    copy++;
  }
  taken.add(label);
  return label;
}

/** The named `SELECT *` columns under new keys, omitting a column this row lacks — the same object
 * JSON serialization of a direct `row.column` read would store. */
function columns({ row, names }: { row: LegacyRow; names: Readonly<Record<string, string>> }): VaultMeta {
  const out: VaultMeta = {};
  for (const [key, column] of Object.entries(names)) {
    const value = row[column];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Plain metadata alone moves here. Legacy tails have unknown lengths and are intentionally
 * withheld until boot opens the payload and calls Jini's length-aware hint implementation. */
function metadata({ table, row }: { table: string; row: LegacyRow }): VaultMeta {
  switch (table) {
    case "site_assistant_credentials": case "media_provider_credentials":
      return columns({ row, names: { baseUrl: "base_url", model: "model" } });
    case "admin_execution_credentials":
      return columns({ row, names: { protocol: "protocol", baseUrl: "base_url", model: "model", maxTokens: "max_tokens" } });
    case "custom_credential_sets":
      return { ...columns({ row, names: { category: "category", baseUrl: "base_url" } }),
        additionalHosts: row.additional_hosts_json === null ? [] : JSON.parse(String(row.additional_hosts_json)), ...columns({ row, names: { username: "username" } }) };
    case "publish_content_peers": return columns({ row, names: { baseUrl: "base_url", remoteWorkspaceId: "remote_workspace_id" } });
    case "database_transfer_destinations": return { description: columns({ row, names: { host: "host", port: "port", database: "database_name", user: "user_name" } }),
      lastRun: row.last_run_json === null ? null : JSON.parse(String(row.last_run_json)) };
    case "vendor_credential_sets": case "source_control_credential_sets": case "publish_credential_sets": return columns({ row, names: { accountLabel: "account_label" } });
    default: return {};
  }
}

function originalId({ row, kind }: { row: LegacyRow; kind: VaultKind }): string {
  if (typeof row.id === "string") return row.id;
  return `vault:${JSON.stringify([kind, row.principal_id ?? row.provider_id ?? row.server_id ?? null])}`;
}

/** One opaque insert; its explicit source context is the only input to future legacy opening. */
async function insertMapped({ kernel, table, kind, row, id, label, isDefault }: {
  kernel: StorageKernel<unknown>; table: string; kind: VaultKind; row: LegacyRow; id: string; label: string; isDefault: boolean;
}): Promise<void> {
  const workspaceId = text({ row, field: "workspace_id" });
  const mcp = table === "external_mcp_servers";
  const prefix = kind === "mcp-auth" ? "oauth_" : "";
  const provider = nullable({ row, field: kind === "mcp-auth" ? "oauth_provider_id" : table === "site_assistant_credentials" ? "provider" : table === "vendor_credential_sets" ? "vendor_id" : "provider_id" });
  const legacy = { table, workspaceId, id: nullable({ row, field: "id" }) ?? workspaceId,
    principalId: nullable({ row, field: "principal_id" }), provider,
    serverId: nullable({ row, field: "server_id" }), aadVersion: Number(row[kind === "mcp-auth" ? "oauth_aad_version" : "aad_version"] ?? 1) };
  const meta = { ...metadata({ table, row }), legacyAad: legacy,
    migration: { ...legacy, originalLabel: nullable({ row, field: "label" }), originalDefault: row.is_default === true || row.is_default === 1,
      mappedId: id, mappedLabel: label } };
  const savedAt = nullable({ row, field: "saved_at" });
  const values: SecretsVaultTable = { workspace_id: workspaceId, id, kind, owner_key: mcp ? text({ row, field: "server_id" }) : "tovu",
    principal_id: legacy.principalId, binding: null, provider, label,
    is_default: kernel.dialect === "sqlite" ? Number(isDefault) : isDefault, revision: 1,
    sealed_key_id: nullable({ row, field: `${prefix}sealed_key_id` }),
    sealed_ciphertext: nullable({ row, field: `${prefix}sealed_ciphertext` }),
    sealed_nonce: nullable({ row, field: `${prefix}sealed_nonce` }), sealed_alg: nullable({ row, field: `${prefix}sealed_alg` }),
    last4: null, token_length: null, meta: JSON.stringify(meta),
    created_at: savedAt ?? text({ row, field: "created_at" }), updated_at: savedAt ?? text({ row, field: "updated_at" }) };
  const columns = Object.keys(values);
  await kernel.execute(sql`INSERT INTO secrets_vault (${sql.join(columns.map(name => sql.ref(name)))})
    VALUES (${sql.join(Object.values(values).map(value => sql`${value}`))})`);
  if (mcp) await kernel.execute(sql`UPDATE external_mcp_servers SET ${sql.ref(kind === "mcp-env" ? "env_secret_id" : "oauth_secret_id")} = ${id}
    WHERE workspace_id = ${workspaceId} AND server_id = ${legacy.serverId}`);
}

/** Fixed SQLite DDL shared by upgrades and the empty-database constructor; never used to adopt existing data. */
export const MCP_VAULT_SQLITE_STATEMENTS: readonly string[] = (() => {
  const columns = ["workspace_id", "server_id", "label", "provisioned_by_plugin_id", "transport", "auth_mode", "enabled",
    "command", "url", "args", "allowed_tool_names", "write_allowed_tool_names", "write_grants_updated_by_principal_id",
      "write_grants_updated_at", "env_names", "oauth_provider_id", "oauth_grant", "oauth_client_id", "oauth_endpoints_json",
      "oauth_scopes_json", "oauth_status", "oauth_expires_at", "oauth_token_env_name", "oauth_refresh_lease_until",
      "created_at", "updated_at", "env_secret_id", "oauth_secret_id"];
    const declarations = columns.map(name => {
      if (name === "workspace_id") return "workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE";
      if (name === "enabled") return "enabled integer NOT NULL";
      if (name === "auth_mode") return "auth_mode text NOT NULL DEFAULT 'static_env'";
      return `${name} text${["server_id", "transport", "created_at", "updated_at"].includes(name) ? " NOT NULL" : ""}`;
    });
  return [
    `CREATE TABLE _vault_mcp_new (${declarations.join(",")}, PRIMARY KEY(workspace_id,server_id),
      FOREIGN KEY(workspace_id,env_secret_id) REFERENCES secrets_vault(workspace_id,id) ON DELETE RESTRICT,
      FOREIGN KEY(workspace_id,oauth_secret_id) REFERENCES secrets_vault(workspace_id,id) ON DELETE RESTRICT)`,
    `INSERT INTO _vault_mcp_new (${columns.join(",")}) SELECT ${columns.join(",")} FROM external_mcp_servers`,
    "CREATE TEMP TABLE _vault_mcp_approvals AS SELECT * FROM external_mcp_tool_approvals",
    "DROP TABLE external_mcp_servers",
    "ALTER TABLE _vault_mcp_new RENAME TO external_mcp_servers",
    "INSERT INTO external_mcp_tool_approvals SELECT * FROM _vault_mcp_approvals",
    "DROP TABLE _vault_mcp_approvals",
    `CREATE TRIGGER secrets_vault_mcp_pointer_insert BEFORE INSERT ON external_mcp_servers
      WHEN (NEW.env_secret_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM secrets_vault WHERE workspace_id=NEW.workspace_id AND id=NEW.env_secret_id AND kind='mcp-env' AND owner_key=NEW.server_id))
        OR (NEW.oauth_secret_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM secrets_vault WHERE workspace_id=NEW.workspace_id AND id=NEW.oauth_secret_id AND kind='mcp-auth' AND owner_key=NEW.server_id))
      BEGIN SELECT RAISE(ABORT,'invalid vault MCP pointer'); END`,
    `CREATE TRIGGER secrets_vault_mcp_pointer_update BEFORE UPDATE ON external_mcp_servers
      WHEN (NEW.env_secret_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM secrets_vault WHERE workspace_id=NEW.workspace_id AND id=NEW.env_secret_id AND kind='mcp-env' AND owner_key=NEW.server_id))
        OR (NEW.oauth_secret_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM secrets_vault WHERE workspace_id=NEW.workspace_id AND id=NEW.oauth_secret_id AND kind='mcp-auth' AND owner_key=NEW.server_id))
      BEGIN SELECT RAISE(ABORT,'invalid vault MCP pointer'); END`,
    `CREATE TRIGGER secrets_vault_mcp_identity BEFORE UPDATE OF kind,owner_key ON secrets_vault
      WHEN (NEW.kind <> OLD.kind OR NEW.owner_key <> OLD.owner_key) AND EXISTS
        (SELECT 1 FROM external_mcp_servers WHERE workspace_id=OLD.workspace_id AND (env_secret_id=OLD.id OR oauth_secret_id=OLD.id))
      BEGIN SELECT RAISE(ABORT,'linked vault MCP identity'); END`,
  ];
})();

/** SQLite cannot DROP a column referenced by a table CHECK. Rebuild its parent, retaining all
 * plain fields and the approval child rows that ON DELETE CASCADE would otherwise remove.
 * The device table references workspaces only and is never read or changed by this step.
 */
async function finishMcp({ kernel }: { kernel: StorageKernel<unknown> }): Promise<void> {
  if (kernel.dialect === "sqlite") {
    const unknownChildren = await kernel.query(sql`SELECT DISTINCT m.name FROM sqlite_schema m,
      pragma_foreign_key_list(m.name) fk WHERE m.type='table' AND fk."table"='external_mcp_servers'
      AND m.name <> 'external_mcp_tool_approvals'`);
    if (unknownChildren.length) throw new Error("secrets vault: unsupported MCP child table; preserve before rebuilding");
    const approvals = await tableExists(kernel, "external_mcp_tool_approvals");
    for (const statement of MCP_VAULT_SQLITE_STATEMENTS) {
      if (!approvals && statement.includes("_vault_mcp_approvals")) continue;
      await kernel.execute(sql.raw(statement));
    }
  } else {
    await kernel.execute(sql`ALTER TABLE external_mcp_servers DROP CONSTRAINT external_mcp_servers_sealed_shape,
      DROP CONSTRAINT external_mcp_servers_oauth_sealed_shape`);
    for (const column of CRYPTO_COLUMNS) await kernel.execute(sql`ALTER TABLE external_mcp_servers DROP COLUMN ${sql.ref(column)}`);
    await kernel.execute(sql`ALTER TABLE external_mcp_servers
      ADD CONSTRAINT external_mcp_env_secret_fk FOREIGN KEY(workspace_id,env_secret_id) REFERENCES secrets_vault(workspace_id,id) ON DELETE RESTRICT,
      ADD CONSTRAINT external_mcp_oauth_secret_fk FOREIGN KEY(workspace_id,oauth_secret_id) REFERENCES secrets_vault(workspace_id,id) ON DELETE RESTRICT`);
    await kernel.execute(sql`CREATE FUNCTION secrets_vault_check_mcp_pointer() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (NEW.env_secret_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM secrets_vault WHERE workspace_id=NEW.workspace_id AND id=NEW.env_secret_id AND kind='mcp-env' AND owner_key=NEW.server_id))
          OR (NEW.oauth_secret_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM secrets_vault WHERE workspace_id=NEW.workspace_id AND id=NEW.oauth_secret_id AND kind='mcp-auth' AND owner_key=NEW.server_id))
        THEN RAISE EXCEPTION 'invalid vault MCP pointer'; END IF; RETURN NEW;
      END $$`);
    await kernel.execute(sql`CREATE TRIGGER secrets_vault_mcp_pointer BEFORE INSERT OR UPDATE ON external_mcp_servers
      FOR EACH ROW EXECUTE FUNCTION secrets_vault_check_mcp_pointer()`);
    await kernel.execute(sql`CREATE FUNCTION secrets_vault_check_mcp_identity() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (NEW.kind <> OLD.kind OR NEW.owner_key <> OLD.owner_key) AND EXISTS
          (SELECT 1 FROM external_mcp_servers WHERE workspace_id=OLD.workspace_id AND (env_secret_id=OLD.id OR oauth_secret_id=OLD.id))
        THEN RAISE EXCEPTION 'linked vault MCP identity'; END IF; RETURN NEW;
      END $$`);
    await kernel.execute(sql`CREATE TRIGGER secrets_vault_mcp_identity BEFORE UPDATE OF kind,owner_key ON secrets_vault
      FOR EACH ROW EXECUTE FUNCTION secrets_vault_check_mcp_identity()`);
  }
}

/** O(n log n) CPU/O(n) memory for n credential rows; fixed table reads, one opaque insert per row.
 * Runner supplies the transaction and migration lock. Coverage failure rolls back copies and DDL.
 */
async function up(kernel: StorageKernel<unknown>, context: MigrationContext): Promise<void> {
  const affected = [...SOURCES.map(source => source.table), "external_mcp_servers", "oauth_pending_authorizations", "tovu_migrations"];
  if (await tableExists(kernel, "external_mcp_tool_approvals")) affected.push("external_mcp_tool_approvals");
  if (kernel.dialect === "postgres") {
    // Backups are restore artifacts, never ordinary transfer/export input. A pre-existing backup
    // refuses re-entry rather than overwriting the only old ciphertext or ledger available.
    for (const table of affected) {
      await kernel.execute(sql`LOCK TABLE ${sql.table(table)} IN ACCESS EXCLUSIVE MODE`);
      await kernel.execute(sql`CREATE TABLE ${sql.table(`_vault_backup_${table}`)} AS TABLE ${sql.table(table)}`);
    }
  }
  await createVault({ kernel });
  await kernel.execute(sql`ALTER TABLE external_mcp_servers ADD COLUMN env_secret_id text`);
  await kernel.execute(sql`ALTER TABLE external_mcp_servers ADD COLUMN oauth_secret_id text`);
  const coverage = Object.fromEntries(KINDS.map(kind => [kind, { rows: 0, envelopes: 0 }])) as Coverage;
  const entries: { table: string; kind: VaultKind; row: LegacyRow }[] = [];
  for (const { table, kind } of SOURCES) {
    const rows = await kernel.query<LegacyRow>(sql`SELECT * FROM ${sql.table(table)} ORDER BY workspace_id`);
    coverage[kind].rows += await count({ kernel, table });
    coverage[kind].envelopes += await count({ kernel, table, where: sql`sealed_ciphertext IS NOT NULL` });
    entries.push(...rows.map(row => ({ table, kind, row })));
  }
  for (const kind of ["mcp-env", "mcp-auth"] as const) {
    const column = kind === "mcp-env" ? "sealed_ciphertext" : "oauth_sealed_ciphertext";
    const where = sql`${sql.ref(column)} IS NOT NULL`;
    coverage[kind].rows = coverage[kind].envelopes = await count({ kernel, table: "external_mcp_servers", where });
    const rows = await kernel.query<LegacyRow>(sql`SELECT * FROM external_mcp_servers WHERE ${where} ORDER BY workspace_id,server_id`);
    entries.push(...rows.map(row => ({ table: "external_mcp_servers", kind, row })));
  }
  const reserved = new Map<string, Set<string>>();
  const ids = new Map<string, Set<string>>();
  for (const entry of entries) {
    const workspaceId = text({ row: entry.row, field: "workspace_id" });
    const values = reserved.get(workspaceId) ?? new Set<string>();
    values.add(originalId(entry));
    reserved.set(workspaceId, values);
  }
  const labels = new Map<string, Set<string>>();
  const defaults = new Set<string>();
  // Vendor rows win their historical identity over publish predecessors, regardless of defaults.
  // Sorting within each source gives deterministic mapping even after dump/restore row reordering.
  entries.sort((a, b) => {
    const rank = (entry: typeof a) => entry.table === "publish_credential_sets" ? 1 : 0;
    const left = JSON.stringify([a.table, a.row.workspace_id, originalId(a)]);
    const right = JSON.stringify([b.table, b.row.workspace_id, originalId(b)]);
    return rank(a) - rank(b) || (left < right ? -1 : left > right ? 1 : 0);
  });
  for (const entry of entries) {
    const { row, kind, table } = entry;
    const workspaceId = text({ row, field: "workspace_id" });
    const preferred = originalId(entry);
    const takenIds = ids.get(workspaceId) ?? new Set<string>();
    ids.set(workspaceId, takenIds);
    const id = freeValue({ preferred, fallback: `vault:${JSON.stringify([table, preferred])}`,
      taken: takenIds, reserved: reserved.get(workspaceId)! });
    const provider = row.vendor_id ?? row.provider_id ?? row.provider ?? row.oauth_provider_id ?? null;
    const group = JSON.stringify([workspaceId, kind, table === "external_mcp_servers" ? row.server_id : "tovu", row.principal_id ?? null, provider]);
    const taken = labels.get(group) ?? new Set<string>();
    labels.set(group, taken);
    const originalLabel = nullable({ row, field: "label" }) ?? kind;
    const label = freeLabel({ preferred: originalLabel, taken });
    const wantsDefault = row.is_default === true || row.is_default === 1;
    const isDefault = wantsDefault && !defaults.has(group);
    if (isDefault) defaults.add(group);
    await insertMapped({ kernel, table, kind, row, id, label, isDefault });
    if (id !== preferred || label !== originalLabel || wantsDefault !== isDefault) context.note(`vault mapping preserved ${table} identity/default in meta.migration`);
  }
  for (const kind of KINDS) {
    const rows = await count({ kernel, table: "secrets_vault", where: sql`kind = ${kind}` });
    const envelopes = await count({ kernel, table: "secrets_vault", where: sql`kind = ${kind} AND sealed_ciphertext IS NOT NULL` });
    if (rows !== coverage[kind].rows || envelopes !== coverage[kind].envelopes) throw new Error(`secrets vault coverage mismatch: ${kind}`);
    context.note(`vault coverage ${kind}: rows=${rows}, envelopes=${envelopes}`);
  }
  await finishMcp({ kernel });
  for (const { table } of SOURCES) await kernel.execute(sql`DROP TABLE ${sql.table(table)}`);
  await kernel.execute(sql`DROP TABLE oauth_pending_authorizations`);
}

/** Activated content step; the final source checksum is pinned in checksums.ts. */
export function secretsVault(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: SECRETS_VAULT_ID, checksum: required.checksum, up };
}
