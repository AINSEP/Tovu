import { openSqliteSnapshot } from "#src/platform/db/kernel/drivers/sqlite";
import { createCoreTableCatalog } from "#src/server/runtime/composition/database-transfer-adapters";
import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { sqliteConnectionOf } from "../../kernel/drivers/sqlite.js";
import { openSqliteSnapshotSource } from "#src/features/database-transfer/sqlite-source";
import { planSnapshotTables } from "#src/features/database-transfer/table-catalog";
import { listColumns, listIndexes, listTables } from "../../kernel/dialect.js";
import { readSchemaShape } from "../../kernel/schema-shape.js";
import { runMigrations } from "../runner.js";
import { SECRETS_VAULT_ID } from "../0012_secrets_vault.js";
import { insertFixture, previous, vaultFixture, vaultStep } from "./secrets-vault.fixture.js";

/** ADR-066/S2 prep: direct, unregistered step; real SQLite and PGlite fixtures. Assertions compare
 * every sealed byte and plain source value, challenge collisions and rollback, and enforce DDL.
 */
const folded = ["site_assistant_credentials", "admin_execution_credentials", "media_provider_credentials",
  "custom_credential_sets", "publish_content_peers", "database_transfer_destinations", "vendor_credential_sets",
  "source_control_credential_sets", "publish_credential_sets"];
type Row = Record<string, unknown>;
function meta(row: Row) { return typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta; }

test("S2 step factory takes its pinned checksum without needing registration", () => {
  assert.equal(vaultStep.id, SECRETS_VAULT_ID);
  assert.equal(vaultStep.checksum, "a".repeat(64));
});

for (const dialect of ["sqlite", "pglite"] as const) {
  test(`${dialect}: all nine folded tables plus both MCP envelopes migrate without changing ciphertext`, async () => {
    const { kernel, envelopes } = await vaultFixture(dialect);
    try {
      const snapshots = new Map<string, Row[]>();
      for (const table of [...folded, "external_mcp_servers", "oauth_pending_authorizations", "tovu_migrations", "external_mcp_tool_approvals"]) {
        snapshots.set(table, await kernel.query<Row>(sql`SELECT * FROM ${sql.table(table)}`));
      }
      const devices = await kernel.query(sql`SELECT * FROM oauth_device_authorizations`);
      const deviceShape = await listColumns(kernel, "oauth_device_authorizations");
      const notes: string[] = [];
      await kernel.transaction(() => vaultStep.up(kernel, { note: note => notes.push(note) }));
      const rows = await kernel.query<Row>(sql`SELECT * FROM secrets_vault`);
      assert.equal(rows.length, 14);
      assert.equal(rows.filter(row => row.sealed_ciphertext !== null).length, envelopes.length);
      for (const fixture of envelopes) {
        const row = rows.find(row => row.kind === fixture.kind && row.workspace_id === fixture.workspaceId &&
          meta(row).legacyAad.table === fixture.table && meta(row).legacyAad.id === (fixture.table === "external_mcp_servers" || fixture.kind === "personal-execution" || fixture.kind === "media-provider" ? "ws" : fixture.id));
        assert.ok(row, `source ${fixture.table}/${fixture.kind} accounted for`);
        assert.equal(row.sealed_key_id, fixture.sealed.keyId);
        assert.equal(row.sealed_ciphertext, fixture.sealed.ciphertext);
        assert.equal(row.sealed_nonce, fixture.sealed.nonce);
        assert.equal(row.sealed_alg, fixture.sealed.alg);
        assert.equal(row.last4, null, "unknown legacy lengths never expose a suffix");
        assert.equal(row.token_length, null);
        assert.equal(row.revision, 1);
        assert.equal(meta(row).legacyAad.workspaceId, "ws");
        assert.equal(meta(row).migration.mappedId, row.id);
      }
      const site = rows.find(row => row.kind === "site-assistant" && row.workspace_id === "ws")!;
      assert.equal(site.provider, "google");
      assert.equal(site.owner_key, "tovu");
      assert.deepEqual({ baseUrl: meta(site).baseUrl, model: meta(site).model }, { baseUrl: null, model: "test-model" });
      const personal = rows.find(row => row.kind === "personal-execution")!;
      assert.equal(personal.principal_id, "p");
      assert.equal(meta(personal).legacyAad.principalId, "p");
      assert.equal(meta(personal).legacyAad.aadVersion, 0);
      assert.equal(meta(personal).protocol, "openai");
      assert.equal(meta(personal).maxTokens, 333);
      const media = rows.find(row => row.kind === "media-provider" && row.workspace_id === "ws")!;
      assert.equal(media.provider, "media-test");
      assert.equal(meta(media).model, "media-model");
      const custom = rows.find(row => row.kind === "custom")!;
      assert.equal(meta(custom).category, "general");
      assert.equal(meta(custom).username, null);
      assert.deepEqual(meta(custom).additionalHosts, ["https://other.example.test"]);
      const peer = rows.find(row => row.id === "peer")!;
      assert.equal(meta(peer).remoteWorkspaceId, "remote");
      assert.equal(meta(peer).baseUrl, "https://peer.example.test");
      const destination = rows.find(row => row.kind === "database-destination")!;
      assert.deepEqual(meta(destination).description, { host: "db.example.test", port: "5432", database: "content", user: "writer" });
      assert.equal(meta(destination).lastRun.rowCount, 4);
      assert.equal(destination.last4, null, "URI suffix is never a hint");
      const source = rows.find(row => row.kind === "source-control")!;
      assert.equal(source.provider, "source-test");
      assert.equal(meta(source).accountLabel, "source-account");
      assert.equal(rows.filter(row => row.sealed_ciphertext === null).length, 3);
      assert.ok(rows.find(row => row.id === "peer-empty" && row.sealed_key_id === null));
      const [mcp] = await kernel.query<Row>(sql`SELECT * FROM external_mcp_servers`);
      const env = rows.find(row => row.kind === "mcp-env")!;
      const auth = rows.find(row => row.kind === "mcp-auth")!;
      assert.equal(mcp.env_secret_id, env.id);
      assert.equal(mcp.oauth_secret_id, auth.id);
      assert.notEqual(env.id, auth.id);
      assert.equal(env.owner_key, "server");
      assert.equal(auth.owner_key, "server");
      assert.equal(auth.binding, null, "MCP consumers use the server-owned null-binding vault context");
      assert.equal(meta(env).legacyAad.aadVersion, 0);
      assert.equal(meta(auth).legacyAad.aadVersion, 1);
      const { sealed_key_id: _k, sealed_ciphertext: _c, sealed_nonce: _n, sealed_alg: _a, oauth_sealed_key_id: _ok,
        oauth_sealed_ciphertext: _oc, oauth_sealed_nonce: _on, oauth_sealed_alg: _oa, aad_version: _av, oauth_aad_version: _oav, ...plain } = snapshots.get("external_mcp_servers")![0];
      assert.deepEqual(mcp, { ...plain, env_secret_id: env.id, oauth_secret_id: auth.id });
      assert.deepEqual(await kernel.query(sql`SELECT * FROM external_mcp_tool_approvals`), snapshots.get("external_mcp_tool_approvals"));
      assert.deepEqual(await kernel.query(sql`SELECT * FROM oauth_device_authorizations`), devices);
      assert.deepEqual(await listColumns(kernel, "oauth_device_authorizations"), deviceShape);
      const tables = await listTables(kernel);
      for (const table of [...folded, "oauth_pending_authorizations"]) assert.equal(tables.includes(table), false);
      for (const column of await listColumns(kernel, "external_mcp_servers")) {
        assert.equal(column.name.includes("sealed_"), false);
        assert.equal(column.name.includes("aad_version"), false);
      }
      for (const kind of ["site-assistant", "personal-execution", "media-provider", "custom", "publish-peer", "database-destination", "vendor", "source-control", "mcp-env", "mcp-auth"]) {
        assert.ok(notes.some(note => note.startsWith(`vault coverage ${kind}:`)));
      }
      if (dialect === "pglite") {
        for (const [table, snapshot] of snapshots) assert.deepEqual(await kernel.query(sql`SELECT * FROM ${sql.table(`_vault_backup_${table}`)}`), snapshot);
        assert.ok(tables.includes("_vault_backup_tovu_migrations"));
        assert.equal(tables.includes("_vault_backup_oauth_device_authorizations"), false);
      } else assert.deepEqual(tables.filter(table => table.startsWith("_vault_backup_")), []);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: colliding IDs, labels and defaults preserve each original value with explicit mapping`, async () => {
    const { kernel, sealer, keyring } = await vaultFixture(dialect);
    try {
      // Use the same provider to force ID, label and default collisions within one target group.
      const sealed = await sealer.seal({ key: await keyring.activeKey({}),
        plaintext: JSON.stringify({ providerId: "vendor-test", token: "different-legacy-token" }),
        aad: "publish-credential-set:v1:ws:vendor-test:collision" });
      await kernel.execute(sql`UPDATE publish_credential_sets SET provider_id='vendor-test', sealed_key_id=${sealed.keyId},
        sealed_ciphertext=${sealed.ciphertext}, sealed_nonce=${sealed.nonce}, sealed_alg=${sealed.alg}`);
      await kernel.transaction(() => vaultStep.up(kernel, { note: () => {} }));
      const rows = await kernel.query<Row>(sql`SELECT * FROM secrets_vault WHERE kind='vendor' ORDER BY id`);
      assert.equal(rows.length, 2);
      const vendor = rows.find(row => meta(row).legacyAad.table === "vendor_credential_sets")!;
      const legacy = rows.find(row => meta(row).legacyAad.table === "publish_credential_sets")!;
      assert.equal(vendor.id, "collision");
      assert.notEqual(legacy.id, vendor.id);
      assert.equal(vendor.label, "Saved");
      assert.equal(legacy.label, "Saved (legacy copy)");
      assert.notEqual(legacy.sealed_ciphertext, vendor.sealed_ciphertext);
      assert.equal(meta(legacy).legacyAad.id, "collision");
      assert.equal(meta(legacy).migration.originalLabel, "Saved");
      assert.equal(meta(legacy).migration.originalDefault, true);
      assert.equal(meta(legacy).migration.mappedLabel, legacy.label);
      assert.equal(rows.filter(row => row.is_default === true || row.is_default === 1).length, 1);
    } finally { await kernel.close(); }
  });

  for (const occupiedCopies of [1, 2]) test(`${dialect}: human collision labels skip ${occupiedCopies} occupied legacy-copy labels`, async () => {
    const { kernel } = await vaultFixture(dialect);
    try {
      await kernel.execute(sql`UPDATE publish_credential_sets SET provider_id='vendor-test'`);
      const [vendor] = await kernel.query<Row>(sql`SELECT * FROM vendor_credential_sets WHERE id='collision'`);
      for (let copy = 1; copy <= occupiedCopies; copy++) {
        const label = `Saved (legacy copy${copy === 1 ? "" : ` ${copy}`})`;
        await insertFixture(kernel, "vendor_credential_sets", { ...vendor, id: `occupied-${copy}`, label,
          is_default: dialect === "sqlite" ? 0 : false } as Parameters<typeof insertFixture>[2]);
      }
      await kernel.transaction(() => vaultStep.up(kernel, { note: () => {} }));
      const rows = await kernel.query<Row>(sql`SELECT * FROM secrets_vault WHERE kind='vendor'`);
      const legacy = rows.find(row => meta(row).migration.table === "publish_credential_sets")!;
      assert.equal(legacy.label, `Saved (legacy copy ${occupiedCopies + 1})`);
      assert.equal(meta(legacy).migration.originalLabel, "Saved");
      assert.equal(meta(legacy).migration.id, "collision");
      assert.equal(meta(legacy).migration.mappedId, legacy.id);
      assert.equal(meta(legacy).migration.mappedLabel, legacy.label);
      assert.equal(new Set(rows.map(row => row.label)).size, rows.length);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: omitted insert fails coverage before DROP and rolls back all schema/data/ledger changes`, async () => {
    const { kernel } = await vaultFixture(dialect);
    try {
      const before = await readSchemaShape(kernel);
      const ledger = await kernel.query(sql`SELECT * FROM tovu_migrations`);
      const source = await kernel.query(sql`SELECT * FROM custom_credential_sets`);
      const execute = kernel.execute.bind(kernel);
      let omitted = false;
      let dropCalled = false;
      kernel.execute = async statement => {
        const compiled = await kernel.run(db => statement.compile(db).sql);
        if (/^DROP TABLE/.test(compiled)) dropCalled = true;
        if (!omitted && /^INSERT INTO secrets_vault/.test(compiled)) { omitted = true; return; }
        return execute(statement);
      };
      await assert.rejects(runMigrations(kernel, [...previous, vaultStep]), /coverage mismatch/);
      assert.equal(omitted, true);
      assert.equal(dropCalled, false);
      assert.deepEqual(await readSchemaShape(kernel), before);
      assert.deepEqual(await kernel.query(sql`SELECT * FROM tovu_migrations`), ledger);
      assert.deepEqual(await kernel.query(sql`SELECT * FROM custom_credential_sets`), source);
      assert.equal((await listTables(kernel)).some(table => table.startsWith("_vault_backup_")), false);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: mandatory singleton, uniqueness, JSON, quad, kind, revision, FK and pointer constraints are live`, async () => {
    const { kernel } = await vaultFixture(dialect);
    try {
      await kernel.transaction(() => vaultStep.up(kernel, { note: () => {} }));
      const rows = await kernel.query<Row>(sql`SELECT * FROM secrets_vault`);
      const clone = async (kind: string, overrides: Row) => {
        const row = rows.find(row => row.kind === kind)!;
        await insertFixture(kernel, "secrets_vault", { ...row, meta: JSON.stringify(meta(row)), id: "extra", is_default: dialect === "sqlite" ? 0 : false, ...overrides } as Parameters<typeof insertFixture>[2]);
      };
      await assert.rejects(clone("site-assistant", {}));
      await assert.rejects(clone("database-destination", {}));
      await assert.rejects(clone("personal-execution", {}));
      await assert.rejects(clone("personal-execution", { principal_id: null }));
      await assert.rejects(clone("personal-execution", { principal_id: "absent" }));
      await assert.rejects(clone("media-provider", {}));
      await assert.rejects(clone("media-provider", { provider: null }));
      await assert.rejects(clone("custom", {}));
      await assert.rejects(clone("publish-peer", {}));
      await assert.rejects(clone("vendor", {}));
      await assert.rejects(clone("source-control", {}));
      await assert.rejects(clone("vendor", { label: "Other", is_default: dialect === "sqlite" ? 1 : true }));
      await assert.rejects(clone("vendor", { label: "Other", sealed_nonce: null }));
      await assert.rejects(clone("vendor", { label: "Other", revision: 0 }));
      await assert.rejects(clone("vendor", { label: "Other", kind: "unknown" }));
      await assert.rejects(clone("vendor", { label: "Other", workspace_id: "absent" }));
      await assert.rejects(clone("vendor", { label: "Other", meta: "[]" }));
      await assert.rejects(clone("vendor", { label: "Other", meta: "broken" }));
      await assert.rejects(clone("custom", { label: "Other", provider: "parallel-owner" }));
      await assert.rejects(clone("custom", { label: "Other", owner_key: "parallel-owner" }));
      await assert.rejects(clone("vendor", { label: "Other", last4: "hort", token_length: 5 }));
      await clone("vendor", { id: "null-provider", provider: null, label: "Null", is_default: dialect === "sqlite" ? 1 : true });
      await clone("vendor", { id: "empty-provider", provider: "", label: "Null", is_default: dialect === "sqlite" ? 1 : true });
      await assert.rejects(clone("vendor", { id: "duplicate-null", provider: null, label: "Null" }));
      const env = rows.find(row => row.kind === "mcp-env")!;
      const auth = rows.find(row => row.kind === "mcp-auth")!;
      await assert.rejects(kernel.execute(sql`UPDATE external_mcp_servers SET env_secret_id=${auth.id}`));
      await assert.rejects(kernel.execute(sql`UPDATE external_mcp_servers SET oauth_secret_id='absent'`));
      await assert.rejects(kernel.execute(sql`UPDATE external_mcp_servers SET server_id='other-server'`));
      await assert.rejects(kernel.execute(sql`UPDATE secrets_vault SET kind='vendor',owner_key='tovu' WHERE id=${env.id}`));
      await assert.rejects(kernel.execute(sql`DELETE FROM secrets_vault WHERE id=${env.id}`));
      await kernel.execute(sql`UPDATE external_mcp_servers SET env_secret_id=NULL`);
      await kernel.execute(sql`DELETE FROM secrets_vault WHERE id=${env.id}`);
      const names = [...(await listIndexes(kernel, "secrets_vault")).keys()];
      for (const name of ["secrets_vault_scope", "secrets_vault_principal", "secrets_vault_singleton", "secrets_vault_personal",
        "secrets_vault_media", "secrets_vault_default", "secrets_vault_group_label", "secrets_vault_label"]) assert.ok(names.includes(name), name);
      await kernel.execute(sql`DELETE FROM principals WHERE id='p'`);
      assert.equal((await kernel.query(sql`SELECT id FROM secrets_vault WHERE kind='personal-execution'`)).length, 0);
      await kernel.execute(sql`DELETE FROM workspaces WHERE id='ws-empty'`);
      assert.equal((await kernel.query(sql`SELECT id FROM secrets_vault WHERE workspace_id='ws-empty'`)).length, 0);
    } finally { await kernel.close(); }
  });
}

test("SQLite ordinary transfer excludes the vault and all restore artifacts while retaining plugin content", async () => {
  const { kernel } = await vaultFixture("sqlite");
  try {
    await kernel.transaction(() => vaultStep.up(kernel, { note: () => {} }));
    await kernel.execute(sql`CREATE TABLE _vault_backup_tovu_migrations (id text PRIMARY KEY)`);
    await kernel.execute(sql`INSERT INTO _vault_backup_tovu_migrations VALUES ('restore-only')`);
    await kernel.execute(sql`CREATE TABLE p_demo__articles (id text PRIMARY KEY, title text)`);
    await kernel.execute(sql`INSERT INTO p_demo__articles VALUES ('live','Visible content')`);
    const source = openSqliteSnapshotSource({ bytes: sqliteConnectionOf(kernel)!.serialize(), open: data => openSqliteSnapshot({ data }) });
    try {
      const plan = planSnapshotTables({ source, catalog: createCoreTableCatalog({}) });
      assert.equal(plan.tables.some(table => table.name === "secrets_vault"), false);
      assert.equal(plan.tables.some(table => table.name.startsWith("_vault_backup_")), false);
      assert.ok(plan.tables.some(table => table.name === "p_demo__articles"));
      assert.ok(plan.leftOut.some(table => table.table === "secrets_vault" && table.reason.includes("saved keys")));
      assert.ok(plan.leftOut.some(table => table.table === "_vault_backup_tovu_migrations"));
    } finally { source.close(); }
  } finally { await kernel.close(); }
});

test("SQLite refuses to rebuild an MCP parent with unknown plugin children rather than cascading away their data", async () => {
  const { kernel } = await vaultFixture("sqlite");
  try {
    await kernel.execute(sql`CREATE TABLE p_demo__mcp_links (id text PRIMARY KEY, workspace_id text, server_id text,
      FOREIGN KEY(workspace_id,server_id) REFERENCES external_mcp_servers(workspace_id,server_id) ON DELETE CASCADE)`);
    await kernel.execute(sql`INSERT INTO p_demo__mcp_links VALUES ('link','ws','server')`);
    const before = await readSchemaShape(kernel);
    await assert.rejects(kernel.transaction(() => vaultStep.up(kernel, { note: () => {} })), /unsupported MCP child/);
    assert.deepEqual(await readSchemaShape(kernel), before);
    assert.deepEqual(await kernel.query(sql`SELECT * FROM p_demo__mcp_links`), [{ id: "link", workspace_id: "ws", server_id: "server" }]);
    assert.equal((await listTables(kernel)).includes("secrets_vault"), false);
  } finally { await kernel.close(); }
});
