import assert from "node:assert/strict";
import test from "node:test";

import type { UUID } from "@jini-ai/cms/core";

import { buildExecutionCredentialAad } from "#src/assistant/execution-credential-aad";
import { buildExternalMcpEnvAad, buildExternalMcpOAuthAad } from "#src/assistant/external-mcp-aad";
import { buildSiteAssistantCredentialAad } from "#src/assistant/site-credential-aad";
import { resolveSiteAssistantApiKey, setSiteAssistantCredential } from "#src/assistant/site-credential-store";
import { buildCustomCredentialAad } from "#src/features/custom-credentials/aad";
import { buildPublishCredentialAad } from "#src/features/deployments/publish-credentials/index";
import { buildMediaProviderCredentialAad } from "#src/features/media/aad";
import { buildSourceControlCredentialAad } from "#src/features/source-control/aad";
import { buildVendorCredentialAad } from "#src/features/vendor-credentials/aad";
import type { SecretSealerPort } from "#src/features/webhooks/index";
import { buildComposioConfigAad } from "#src/platform/connectors/composio-config-aad";
import { buildConnectorCredentialAad } from "#src/platform/connectors/connector-credential-aad";
import { InMemoryKeyring } from "../../../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../../../features/webhooks/secret-sealer.aesgcm.js";
import { principals, workspaces } from "../../schema.sqlite.js";
import { openContentDb, type ContentDb } from "../content-db.js";
import { SEALED_COLUMN_DESCRIPTORS } from "../sealed-credential-descriptors.sqlite.js";
import { SqliteSiteAssistantCredentialRepo } from "../site-credential-repo.sqlite.js";
import {
  discoverSealedColumns,
  listSealedCredentials,
  SealedCredentialInventoryLimitError,
  type SealedColumnDescriptor,
  type SealedCredentialInventory,
  type SealedCredentialInventoryDeps,
} from "../sealed-credential-inventory.sqlite.js";

/**
 * @file `listSealedCredentials` against a real, migrated `content.db` (`:memory:`) and the real
 * AES-GCM sealer. Every fixture blob is sealed with its store's own AAD builder, and every plaintext,
 * tail, mask and bearer value is a distinctive `LEAK-` marker so the no-secret assertions can search
 * the whole serialized inventory for any of them.
 */

const WS = "ws-inventory";
const NOW = "2026-09-16T00:00:00.000Z";
const LEAK = "LEAK-";

type Sealer = Pick<SecretSealerPort, "seal" | "open">;

interface Fixture {
  readonly db: ContentDb;
  readonly keyring: InMemoryKeyring;
  readonly sealer: AesGcmSecretSealer;
  /** Every value that must never appear in any inventory output. */
  readonly secrets: string[];
}

function insertRow(db: ContentDb, table: string, row: Record<string, unknown>): void {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");
  db.$client.prepare(`INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`).run(...Object.values(row));
}

async function sealedQuad(input: { sealer: Sealer; keyring: InMemoryKeyring; plaintext: string; aad: string | undefined; prefix?: string; secrets: string[] }) {
  const sealed = await input.sealer.seal({ plaintext: input.plaintext, key: await input.keyring.activeKey(), aad: input.aad });
  input.secrets.push(input.plaintext, sealed.ciphertext, sealed.nonce);
  const p = input.prefix ?? "";
  return { [`${p}sealed_key_id`]: sealed.keyId, [`${p}sealed_ciphertext`]: sealed.ciphertext, [`${p}sealed_nonce`]: sealed.nonce, [`${p}sealed_alg`]: sealed.alg };
}

/**
 * One sealed row in every production sealed column, each sealed by `sealWith` under that store's AAD.
 * Returns a db whose rows are sealed under `sealWith`'s root key.
 */
async function seedEverySealedColumn(sealWith: { sealer: Sealer; keyring: InMemoryKeyring }, secrets: string[]): Promise<ContentDb> {
  const db = openContentDb(":memory:");
  db.insert(workspaces).values({ id: WS, name: WS, slug: WS, createdAt: NOW }).run();
  db.insert(principals).values({ id: "principal-1", workspaceId: WS, kind: "user", displayName: "principal-1", status: "active", createdAt: NOW }).run();
  const seal = (table: string, aad: string | undefined, prefix?: string) =>
    sealedQuad({ ...sealWith, plaintext: `${LEAK}plaintext-${table}-${prefix ?? ""}`, aad, prefix, secrets });
  const stamps = { created_at: NOW, updated_at: NOW };

  insertRow(db, "site_assistant_credentials", {
    workspace_id: WS, provider: "anthropic", aad_version: 1, masked: `${LEAK}masked-site`, ...stamps,
    ...(await seal("site_assistant_credentials", buildSiteAssistantCredentialAad({ workspaceId: WS as UUID }))),
  });
  insertRow(db, "admin_execution_credentials", {
    workspace_id: WS, principal_id: "principal-1", protocol: "openai", provider_id: "openai", aad_version: 1, masked: `${LEAK}masked-exec`, ...stamps,
    ...(await seal("admin_execution_credentials", buildExecutionCredentialAad({ workspaceId: WS as UUID, principalId: "principal-1" as UUID }))),
  });
  insertRow(db, "publish_credential_sets", {
    id: "pub-1", workspace_id: WS, provider_id: "netlify", label: "Main site", is_default: 1, ...stamps,
    ...(await seal("publish_credential_sets", buildPublishCredentialAad({ workspaceId: WS as UUID, providerId: "netlify", id: "pub-1" as UUID }))),
  });
  insertRow(db, "source_control_credential_sets", {
    id: "sc-1", workspace_id: WS, provider_id: "github", label: "Repo", is_default: 1, ...stamps,
    ...(await seal("source_control_credential_sets", buildSourceControlCredentialAad({ workspaceId: WS as UUID, providerId: "github", id: "sc-1" as UUID }))),
  });
  insertRow(db, "custom_credential_sets", {
    id: "custom-1", workspace_id: WS, label: "Mailer", category: "email", base_url: "https://mail.example.test", username: `${LEAK}username`, ...stamps,
    ...(await seal("custom_credential_sets", buildCustomCredentialAad({ workspaceId: WS as UUID, id: "custom-1" as UUID }))),
  });
  insertRow(db, "vendor_credential_sets", {
    id: "vendor-1", workspace_id: WS, vendor_id: "vercel", label: "Deploys", token_tail: `${LEAK}token-tail`, is_default: 1, ...stamps,
    ...(await seal("vendor_credential_sets", buildVendorCredentialAad({ workspaceId: WS as UUID, vendorId: "vercel", id: "vendor-1" as UUID }))),
  });
  insertRow(db, "media_provider_credentials", {
    workspace_id: WS, provider_id: "fal", key_tail: `${LEAK}key-tail-media`, aad_version: 1, ...stamps,
    ...(await seal("media_provider_credentials", buildMediaProviderCredentialAad({ workspaceId: WS as UUID, providerId: "fal" }))),
  });
  insertRow(db, "composio_config", {
    workspace_id: WS, key_tail: `${LEAK}key-tail-composio`, key_generation: 1, aad_version: 1, ...stamps,
    ...(await seal("composio_config", buildComposioConfigAad({ workspaceId: WS as UUID }))),
  });
  insertRow(db, "external_mcp_servers", {
    workspace_id: WS, server_id: "linear", transport: "http", auth_mode: "oauth", enabled: 1, url: `https://mcp.example.test/?token=${LEAK}url-token`,
    aad_version: 1, oauth_aad_version: 1, ...stamps,
    ...(await seal("external_mcp_servers", buildExternalMcpEnvAad({ workspaceId: WS, serverId: "linear" }))),
    ...(await seal("external_mcp_servers", buildExternalMcpOAuthAad({ workspaceId: WS, serverId: "linear" }), "oauth_")),
  });
  const state = `${LEAK}oauth-state`;
  secrets.push(state);
  insertRow(db, "oauth_pending_authorizations", {
    state, owner_key: `${WS}:linear`, provider_id: "linear", redirect_uri: "https://site.example.test/cb", scopes_json: "[]", created_at: NOW, expires_at: NOW,
    ...(await seal("oauth_pending_authorizations", `${WS}:linear`)),
  });
  secrets.push(`${LEAK}user-code`);
  insertRow(db, "oauth_device_authorizations", {
    workspace_id: WS, server_id: "linear", user_code: `${LEAK}user-code`, verification_uri: "https://device.example.test", interval_seconds: 5, expires_at: NOW, created_at: NOW,
    ...(await seal("oauth_device_authorizations", `${WS}:linear`)),
  });
  insertRow(db, "composio_connector_credentials", {
    workspace_id: WS, connector_id: "github", account_label: `${LEAK}account-label`, aad_version: 1, ...stamps,
    ...(await seal("composio_connector_credentials", buildConnectorCredentialAad({ workspaceId: WS as UUID, connectorId: "github" }))),
  });
  secrets.push(`${LEAK}masked-site`, `${LEAK}masked-exec`, `${LEAK}username`, `${LEAK}token-tail`, `${LEAK}key-tail-media`, `${LEAK}key-tail-composio`, `${LEAK}url-token`, `${LEAK}account-label`);
  return db;
}

async function freshFixture(): Promise<Fixture> {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const secrets: string[] = [];
  const db = await seedEverySealedColumn({ sealer, keyring }, secrets);
  return { db, keyring, sealer, secrets };
}

function depsFor(fixture: Pick<Fixture, "db">, overrides: Partial<SealedCredentialInventoryDeps> & { sealer: Sealer; keyring: InMemoryKeyring }): SealedCredentialInventoryDeps {
  return { db: fixture.db.$client, hasRootKeySource: () => true, descriptors: SEALED_COLUMN_DESCRIPTORS, ...overrides };
}

function assertNoSecretIn(inventory: SealedCredentialInventory, secrets: readonly string[]): void {
  const serialized = JSON.stringify(inventory);
  assert.equal(serialized.includes(LEAK), false, `inventory output carries a ${LEAK} marker: ${serialized}`);
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, "inventory output carries a sealed value, nonce, or secret column");
}

function countingSealer(inner: Sealer): Sealer & { calls: number } {
  const counter = {
    calls: 0,
    seal: async (input: Parameters<Sealer["seal"]>[0]) => (counter.calls++, inner.seal(input)),
    open: async (input: Parameters<Sealer["open"]>[0]) => (counter.calls++, inner.open(input)),
  };
  return counter;
}

const columnKey = (entry: { table: string; column: string }) => `${entry.table}.${entry.column}`;

test("every sealed column in a freshly migrated content.db is discovered from the catalog, and each has exactly one descriptor", () => {
  const db = openContentDb(":memory:");
  const discovered = discoverSealedColumns(db.$client).map(columnKey).sort();
  const described = SEALED_COLUMN_DESCRIPTORS.map(columnKey).sort();

  assert.deepEqual(described, discovered);
  assert.equal(new Set(described).size, described.length, "a sealed column has two descriptors");
  assert.ok(discovered.includes("external_mcp_servers.oauth_sealed_ciphertext"), "a prefixed sealed column must be discovered too");
});

test("rows sealed under the active key with each store's own AAD all report opensUnderActiveKey=true, with non-secret labels", async () => {
  const fixture = await freshFixture();
  const inventory = await listSealedCredentials(depsFor(fixture, { sealer: fixture.sealer, keyring: fixture.keyring }));

  assert.equal(inventory.entries.length, SEALED_COLUMN_DESCRIPTORS.length);
  assert.deepEqual(inventory.totals, { sealed: 13, opens: 13, doesNotOpen: 0, unknown: 0 });
  for (const entry of inventory.entries) {
    assert.equal(entry.opensUnderActiveKey, true, `${columnKey(entry)} should open`);
    assert.equal(entry.unknownReason, null);
    assert.equal(entry.sealedKeyId, "v1");
  }
  assert.equal(inventory.activeKeyId, "v1");
  assert.ok(inventory.columns.every((column) => column.coverage === "classified" && column.sealedRows === 1));

  const byColumn = new Map(inventory.entries.map((entry) => [columnKey(entry), entry]));
  assert.deepEqual(byColumn.get("vendor_credential_sets.sealed_ciphertext"), {
    table: "vendor_credential_sets", column: "sealed_ciphertext", workspaceId: WS, rowId: "vendor-1",
    label: 'Vendor credentials "Deploys" (vercel)', sealedKeyId: "v1", opensUnderActiveKey: true, unknownReason: null,
  });
  assert.equal(byColumn.get("external_mcp_servers.oauth_sealed_ciphertext")?.label, 'MCP server "linear" OAuth credentials');
  const pending = byColumn.get("oauth_pending_authorizations.sealed_ciphertext");
  assert.equal(pending?.rowId, null, "the OAuth state is a bearer value and must not become the row id");
  assertNoSecretIn(inventory, fixture.secrets);
});

test("the same rows sealed under a DIFFERENT root key report opensUnderActiveKey=false rather than throwing", async () => {
  const other = await freshFixture();
  const activeKeyring = new InMemoryKeyring();
  const inventory = await listSealedCredentials(depsFor(other, { sealer: new AesGcmSecretSealer(activeKeyring), keyring: activeKeyring }));

  assert.deepEqual(inventory.totals, { sealed: 13, opens: 0, doesNotOpen: 13, unknown: 0 });
  assert.ok(inventory.entries.every((entry) => entry.opensUnderActiveKey === false && entry.unknownReason === null));
  assertNoSecretIn(inventory, other.secrets);
});

test("a sealed table with NO descriptor is still counted — its rows are unknown/no-descriptor, not skipped", async () => {
  const fixture = await freshFixture();
  fixture.db.$client.exec(
    `CREATE TABLE plugin_vault (vault_token TEXT PRIMARY KEY, sealed_key_id TEXT, sealed_ciphertext TEXT, sealed_nonce TEXT, sealed_alg TEXT)`
  );
  const quad = await sealedQuad({ sealer: fixture.sealer, keyring: fixture.keyring, plaintext: `${LEAK}vault-plaintext`, aad: "vault", secrets: fixture.secrets });
  insertRow(fixture.db, "plugin_vault", { vault_token: `${LEAK}vault-pk-1`, ...quad });
  insertRow(fixture.db, "plugin_vault", { vault_token: `${LEAK}vault-pk-2`, ...quad });
  insertRow(fixture.db, "plugin_vault", { vault_token: `${LEAK}vault-pk-3` });
  fixture.secrets.push(`${LEAK}vault-pk-1`, `${LEAK}vault-pk-2`);

  const inventory = await listSealedCredentials(depsFor(fixture, { sealer: fixture.sealer, keyring: fixture.keyring }));

  assert.equal(inventory.totals.sealed, 15, "13 registered + 2 sealed vault rows; the NULL vault row holds nothing");
  assert.deepEqual(inventory.columns.find((column) => column.table === "plugin_vault"), {
    table: "plugin_vault", column: "sealed_ciphertext", coverage: "no-descriptor", sealedRows: 2,
  });
  const vault = inventory.entries.filter((entry) => entry.table === "plugin_vault");
  assert.equal(vault.length, 2);
  for (const entry of vault) {
    assert.deepEqual(entry, {
      table: "plugin_vault", column: "sealed_ciphertext", workspaceId: null, rowId: null,
      label: "Sealed credential in unregistered column plugin_vault.sealed_ciphertext", sealedKeyId: "v1",
      opensUnderActiveKey: "unknown", unknownReason: "no-descriptor",
    });
  }
  assertNoSecretIn(inventory, fixture.secrets);
});

test("removing a production descriptor does not make the count drop — that column turns unknown instead", async () => {
  const fixture = await freshFixture();
  const withoutVendor = SEALED_COLUMN_DESCRIPTORS.filter((descriptor) => descriptor.table !== "vendor_credential_sets");
  const inventory = await listSealedCredentials(depsFor(fixture, { sealer: fixture.sealer, keyring: fixture.keyring, descriptors: withoutVendor }));

  assert.deepEqual(inventory.totals, { sealed: 13, opens: 12, doesNotOpen: 0, unknown: 1 });
  const vendor = inventory.entries.find((entry) => entry.table === "vendor_credential_sets");
  assert.equal(vendor?.opensUnderActiveKey, "unknown");
  assert.equal(vendor?.unknownReason, "no-descriptor");
});

test("undeterminable: with no root key source present, every row is unknown/no-root-key and the sealer is never called", async () => {
  const fixture = await freshFixture();
  const sealer = countingSealer(fixture.sealer);
  const inventory = await listSealedCredentials(depsFor(fixture, { sealer, keyring: fixture.keyring, hasRootKeySource: () => false }));

  assert.equal(sealer.calls, 0, "no derivation may run when no key source exists — a keyring could mint one");
  assert.deepEqual(inventory.totals, { sealed: 13, opens: 0, doesNotOpen: 0, unknown: 13 });
  assert.ok(inventory.entries.every((entry) => entry.unknownReason === "no-root-key"));
});

test("undeterminable: a key source that cannot round-trip a probe makes every row unknown — never false — and no error text leaks", async () => {
  const fixture = await freshFixture();
  const broken: Sealer = {
    seal: async () => { throw new Error(`${LEAK}key material in a seal error`); },
    open: async () => { throw new Error(`${LEAK}key material in an open error`); },
  };
  const inventory = await listSealedCredentials(depsFor(fixture, { sealer: broken, keyring: fixture.keyring }));

  assert.deepEqual(inventory.totals, { sealed: 13, opens: 0, doesNotOpen: 0, unknown: 13 });
  assert.ok(inventory.entries.every((entry) => entry.unknownReason === "active-key-unavailable"));
  assertNoSecretIn(inventory, fixture.secrets);
});

test("undeterminable: a key that stops working mid-scan turns the failing row unknown, not false", async () => {
  const fixture = await freshFixture();
  let healthy = true;
  const flaky: Sealer = {
    seal: async (input) => {
      if (!healthy) throw new Error("keyring went away");
      return fixture.sealer.seal(input);
    },
    open: async (input) => {
      if (input.aad !== "sealed-credential-inventory-probe:v1") healthy = false;
      if (!healthy) throw new Error("keyring went away");
      return fixture.sealer.open(input);
    },
  };
  const inventory = await listSealedCredentials(depsFor(fixture, { sealer: flaky, keyring: fixture.keyring }));

  assert.equal(inventory.totals.doesNotOpen, 0);
  assert.ok(inventory.entries.every((entry) => entry.unknownReason === "active-key-unavailable"));
});

test("an unrecognized aad_version is unknown, a legacy aad_version=0 no-AAD row opens, and another row's AAD reads false", async () => {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const db = openContentDb(":memory:");
  const secrets: string[] = [];
  for (const id of [WS, "ws-legacy", "ws-transplant"]) db.insert(workspaces).values({ id, name: id, slug: id, createdAt: NOW }).run();
  const row = (workspace_id: string, aad_version: number) => ({ workspace_id, provider: "anthropic", aad_version, masked: "x", created_at: NOW, updated_at: NOW });

  insertRow(db, "site_assistant_credentials", { ...row(WS, 2), ...(await sealedQuad({ sealer, keyring, plaintext: "a", aad: buildSiteAssistantCredentialAad({ workspaceId: WS as UUID }), secrets })) });
  insertRow(db, "site_assistant_credentials", { ...row("ws-legacy", 0), ...(await sealedQuad({ sealer, keyring, plaintext: "b", aad: undefined, secrets })) });
  insertRow(db, "site_assistant_credentials", {
    ...row("ws-transplant", 1),
    ...(await sealedQuad({ sealer, keyring, plaintext: "c", aad: buildSiteAssistantCredentialAad({ workspaceId: WS as UUID }), secrets })),
  });

  const inventory = await listSealedCredentials({ db: db.$client, sealer, keyring, hasRootKeySource: () => true, descriptors: SEALED_COLUMN_DESCRIPTORS });
  const byWorkspace = new Map(inventory.entries.map((entry) => [entry.workspaceId, entry]));

  assert.equal(byWorkspace.get(WS)?.opensUnderActiveKey, "unknown");
  assert.equal(byWorkspace.get(WS)?.unknownReason, "unrecognized-aad-version");
  assert.equal(byWorkspace.get("ws-legacy")?.opensUnderActiveKey, true);
  assert.equal(byWorkspace.get("ws-transplant")?.opensUnderActiveKey, false);
});

test("descriptor faults are unknown, never thrown: unsupported alg, incomplete quad, missing column, NULL identity, sealed identity column", async () => {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const db = openContentDb(":memory:");
  const secrets: string[] = [];
  db.$client.exec(`CREATE TABLE fixture_sealed (id TEXT, name TEXT, sealed_key_id TEXT, sealed_ciphertext TEXT, sealed_nonce TEXT, sealed_alg TEXT)`);
  const good = await sealedQuad({ sealer, keyring, plaintext: `${LEAK}fixture`, aad: "fixture", secrets });
  insertRow(db, "fixture_sealed", { id: "alg", name: "n", ...good, sealed_alg: "xchacha20poly1305" });
  insertRow(db, "fixture_sealed", { id: "incomplete", name: "n", ...good, sealed_nonce: null });
  insertRow(db, "fixture_sealed", { id: "null-name", name: null, ...good });

  const descriptor = (identityColumns: string[]): SealedColumnDescriptor => ({
    table: "fixture_sealed",
    column: "sealed_ciphertext",
    identityColumns,
    workspaceId: () => null,
    rowId: (row) => String(row.id),
    label: (row) => {
      if (typeof row.name !== "string") throw new Error(`${LEAK}descriptor error text`);
      return `Fixture ${row.name}`;
    },
    aadFor: () => ({ kind: "aad", aad: "fixture" }),
  });
  const run = (descriptors: SealedColumnDescriptor[]) => listSealedCredentials({ db: db.$client, sealer, keyring, hasRootKeySource: () => true, descriptors });

  const fits = await run([descriptor(["id", "name"])]);
  assert.deepEqual(fits.entries.map((entry) => [entry.rowId, entry.unknownReason]), [["alg", "unsupported-alg"], ["incomplete", "incomplete-sealed-row"], [null, "descriptor-error"]]);
  assertNoSecretIn(fits, secrets);

  const missingColumn = await run([descriptor(["id", "no_such_column"])]);
  assert.ok(missingColumn.entries.every((entry) => entry.unknownReason === "descriptor-schema-mismatch" && entry.rowId === null));
  assert.equal(missingColumn.columns.find((column) => column.table === "fixture_sealed")?.coverage, "descriptor-schema-mismatch");

  const sealedAsIdentity = await run([descriptor(["id", "sealed_ciphertext"])]);
  assert.ok(sealedAsIdentity.entries.every((entry) => entry.unknownReason === "descriptor-schema-mismatch"));
  assertNoSecretIn(sealedAsIdentity, secrets);
});

test("a credential written through the real site-credential store is reported as opening, agreeing with the store's own read", async () => {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const db = openContentDb(":memory:");
  const repo = new SqliteSiteAssistantCredentialRepo(db);
  await setSiteAssistantCredential({ repo, sealer, keyring, clock: { nowIso: () => NOW } } as Parameters<typeof setSiteAssistantCredential>[0], {
    workspaceId: WS as UUID,
    apiKey: `${LEAK}real-store-api-key`,
    provider: "anthropic",
  });

  const inventory = await listSealedCredentials({ db: db.$client, sealer, keyring, hasRootKeySource: () => true, descriptors: SEALED_COLUMN_DESCRIPTORS });

  assert.equal(await resolveSiteAssistantApiKey({ repo, sealer }, { workspaceId: WS as UUID }).then((resolved) => resolved?.apiKey), `${LEAK}real-store-api-key`);
  assert.deepEqual(inventory.totals, { sealed: 1, opens: 1, doesNotOpen: 0, unknown: 0 });
  assertNoSecretIn(inventory, [`${LEAK}real-store-api-key`]);
});

test("the inventory is read-only: no row changes, and a writing statement is refused before it runs", async () => {
  const fixture = await freshFixture();
  const changesBefore = fixture.db.$client.prepare("SELECT total_changes() AS n").get();
  await listSealedCredentials(depsFor(fixture, { sealer: fixture.sealer, keyring: fixture.keyring }));
  assert.deepEqual(fixture.db.$client.prepare("SELECT total_changes() AS n").get(), changesBefore);

  const client = fixture.db.$client;
  const writingDb = {
    prepare: () => client.prepare("DELETE FROM site_assistant_credentials WHERE 0 = 1"),
    transaction: client.transaction.bind(client),
  } as unknown as SealedCredentialInventoryDeps["db"];
  await assert.rejects(listSealedCredentials({ ...depsFor(fixture, { sealer: fixture.sealer, keyring: fixture.keyring }), db: writingDb }), {
    message: "sealed-credential inventory refused to run a statement that can write",
  });
  assert.deepEqual(client.prepare("SELECT total_changes() AS n").get(), changesBefore);
});

test("above maxEntries the inventory refuses with counts only, rather than returning an understated list", async () => {
  const fixture = await freshFixture();
  await assert.rejects(listSealedCredentials(depsFor(fixture, { sealer: fixture.sealer, keyring: fixture.keyring }), { maxEntries: 12 }), (error: unknown) => {
    assert.ok(error instanceof SealedCredentialInventoryLimitError);
    assert.equal(error.message, "sealed-credential inventory found 13 sealed rows, over its limit of 12; refusing to return an understated count");
    assert.equal(error.sealedRows, 13);
    return true;
  });
});
