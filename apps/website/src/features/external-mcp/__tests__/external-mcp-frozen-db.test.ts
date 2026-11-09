import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { VaultError } from "@jini-ai/platform/secrets/credential-sets";
import type { FederatedCallTarget } from "@jini-ai/mcp/federation";
import { createTovuOAuthGuard } from "../../../platform/oauth/endpoint-safety.js";
import type { ContentKernel } from "../../../platform/db/content-kernel.js";
import type { ContentDb } from "../../../platform/db/sqlite/content-db.js";
import type { ExternalMcpServerRecord } from "../contracts.js";
import { createDeviceAuthorizationStore, createExternalMcpConnectionGate, createExternalMcpOAuthService, ExternalMcpReauthRequiredError } from "../external-mcp-oauth.js";
import { SqlExternalMcpServerRepo } from "../external-mcp-repo.js";
import { ExternalMcpSecretStoreUnconfiguredError, externalMcpAdmissionRevision, listExternalMcpServerViews, openExternalMcpOAuthPayload,
  readEnabledExternalMcpConfigs, saveExternalMcpServer } from "../external-mcp-store.js";
import { openExternalMcpVaultPayload, sealExternalMcpVaultPayload } from "../external-mcp-vault.js";
import { FROZEN_PLAINTEXT, FROZEN_PROVIDER, FROZEN_SERVERS, FROZEN_WORKSPACE, type FakeTokenReply, type FakeTokenRequest, closeFrozenDb,
  fakeOAuthServer, frozenClock, frozenKeyring, frozenSealer, loadFrozenSql, openFrozenDb, readFrozenSql, snapshotFrozenRows } from "./fixtures/mcp-credentials-frozen.fixture.js";

/**
 * @file G-mcp (EXTRACT-S5 H0): the frozen SQLite credential fixture, read and written ONLY through
 * the retained `SqlExternalMcpServerRepo` and the store/OAuth service — never by parsing sealed rows
 * by hand, because the envelope's non-enumerable vault context exists only once `joinedEnvelope`
 * rebuilds it. Rerun unchanged after every extraction batch: the counters and byte-identity
 * assertions below are the baseline that moved code must reproduce exactly.
 *
 * `S5_FROZEN_DB_OUT=<file>` keeps the post-write, post-restart database at that path for the
 * baseline rollback script (`fixtures/s5-baseline-rollback.mjs`).
 */

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-frozen-test-"));
test.after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));

const VALID_AT = "2026-08-25T12:10:00.000Z";
const EXPIRED_AT = "2026-08-25T13:30:00.000Z";
const AFTER_RESTART_AT = "2026-08-25T13:31:00.000Z";
const REFRESHED = { accessToken: "fake-access-token-0002", refreshToken: "fake-refresh-token-0002" } as const;
const NEW_ENV_KEY = "fake-env-key-0002";
const CANARY_PARTS = ["ct-9f3e51", "cs-9f3e51", "internal.canary.example", "/var/lib/canary-path"] as const;
const CANARY = `token=${CANARY_PARTS[0]} secret=${CANARY_PARTS[1]} at https://${CANARY_PARTS[2]}/oauth reading ${CANARY_PARTS[3]}`;

type Counts = Record<string, number>;
type Row = Record<string, unknown>;

/** Counts every method call on `inner` by name (calls the target re-enters through `this` are not double-counted). */
function counted<T extends object>(inner: T, counts: Counts, record?: (method: string, args: unknown[]) => void): T {
  return new Proxy(inner, { get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) => {
      counts[String(property)] = (counts[String(property)] ?? 0) + 1;
      record?.(String(property), args);
      return value.apply(target, args);
    };
  } });
}

function nonZero(counts: Counts): Counts {
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
}

function resetCounts(...all: Counts[]): void {
  for (const counts of all) for (const key of Object.keys(counts)) delete counts[key];
}

/** The wired host over one opened database: counting kernel, repo, sealer and keyring plus a fake token server. */
function wire({ kernel, clockIso, reply }: { kernel: ContentKernel; clockIso: string; reply?: (request: FakeTokenRequest) => FakeTokenReply }) {
  const io = { kernel: {} as Counts, repo: {} as Counts, sealer: {} as Counts, keyring: {} as Counts };
  const openedAad: string[] = [];
  const repo = counted(new SqlExternalMcpServerRepo(counted(kernel, io.kernel)), io.repo);
  const keyring = counted(frozenKeyring(), io.keyring);
  const sealer = counted(frozenSealer(frozenKeyring()), io.sealer, (method, args) => {
    if (method === "open") openedAad.push(String((args[1] as { aad?: unknown } | undefined)?.aad ?? ""));
  });
  const clock = frozenClock(clockIso);
  const server = fakeOAuthServer(reply ?? (() => ({ status: 599, json: { error: "unexpected_request" } })));
  const service = createExternalMcpOAuthService({ workspaceId: FROZEN_WORKSPACE, repo, sealer, keyring, clock,
    devices: createDeviceAuthorizationStore(), lookupProvider: () => FROZEN_PROVIDER,
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }), fetchFn: ({ url }, init) => server.fetchFn(url, init) } });
  return { io, openedAad, repo, keyring, sealer, clock, server, service, store: { repo, sealer, keyring, clock } };
}

/** A fresh SQLite file holding exactly the frozen fixture rows. */
async function frozenDbFile(filePath: string): Promise<{ db: ContentDb; kernel: ContentKernel }> {
  fs.rmSync(filePath, { force: true });
  const opened = await openFrozenDb(filePath);
  loadFrozenSql({ db: opened.db, sqlText: readFrozenSql() });
  return opened;
}

async function requireRecord(repo: SqlExternalMcpServerRepo, serverId: string): Promise<ExternalMcpServerRecord> {
  const record = await repo.findByServerId({ workspaceId: FROZEN_WORKSPACE, serverId });
  assert.ok(record, `expected the frozen row '${serverId}'`);
  return record;
}

function vaultRow(rows: Row[], { owner, kind }: { owner: string; kind: string }): Row {
  const row = rows.find((candidate) => candidate.owner_key === owner && candidate.kind === kind);
  assert.ok(row, `expected the ${kind} vault row of ${owner}`);
  return row;
}

function serverRow(rows: Row[], serverId: string): Row {
  const row = rows.find((candidate) => candidate.server_id === serverId);
  assert.ok(row, `expected the server row ${serverId}`);
  return row;
}

function changedColumns(before: Row, after: Row): string[] {
  return Object.keys(before).filter((column) => before[column] !== after[column]).sort();
}

/** Opens all three frozen credentials through the store's own read paths and checks the plaintext. */
async function assertOpensAllThree(h: ReturnType<typeof wire>, expected: { envKey: string; accessToken: string; refreshToken: string }) {
  const { configs, failures } = await readEnabledExternalMcpConfigs({ repo: h.repo, sealer: h.sealer, oauth: h.service.tokenResolver }, FROZEN_WORKSPACE);
  assert.deepEqual(failures, []);
  const byId = Object.fromEntries(configs.map((config) => [config.serverId, config.target]));
  assert.deepEqual(byId[FROZEN_SERVERS.env], { kind: "stdio", command: "npx", args: ["-y", "env-tool-mcp"],
    env: { ...FROZEN_PLAINTEXT.envBlock, FAKE_API_KEY: expected.envKey } });
  assert.deepEqual(byId[FROZEN_SERVERS.static], { kind: "streamable_http", url: "https://mcp.static.example.com/mcp",
    headers: { authorization: `Bearer ${FROZEN_PLAINTEXT.staticToken}` } });
  assert.deepEqual(byId[FROZEN_SERVERS.oauth], { kind: "stdio", command: "npx", args: ["-y", "higgs-mcp"],
    env: { ...FROZEN_PLAINTEXT.oauthEnv, HIGGS_TOKEN: expected.accessToken } });
  const payload = await openExternalMcpOAuthPayload(h.sealer, await requireRecord(h.repo, FROZEN_SERVERS.oauth));
  assert.equal(payload.clientSecret, FROZEN_PLAINTEXT.clientSecret);
  assert.equal(payload.tokens?.refreshToken, expected.refreshToken);
}

function assertNoCanary(texts: readonly string[]): void {
  for (const text of texts) for (const part of CANARY_PARTS) assert.ok(!text.includes(part), `model-facing text leaked '${part}': ${text}`);
}

test("frozen fixture: the retained SQL repo and store open all three credentials; toView opens <= 2 envelopes per row", async () => {
  const { db, kernel } = await frozenDbFile(path.join(SCRATCH, "read.db"));
  const h = wire({ kernel, clockIso: VALID_AT });

  const views = await listExternalMcpServerViews({ repo: h.repo, sealer: h.sealer }, FROZEN_WORKSPACE);
  assert.deepEqual(views.map((view) => [view.serverId, view.authMode]).sort(),
    [[FROZEN_SERVERS.env, "none"], [FROZEN_SERVERS.oauth, "oauth"], [FROZEN_SERVERS.static, "static_env"]]);
  const opensPerRow = Object.values(FROZEN_SERVERS).map((serverId) => h.openedAad.filter((aad) => aad.includes(serverId)).length);
  assert.deepEqual(opensPerRow, [1, 1, 2]);
  assert.ok(opensPerRow.every((opens) => opens <= 2));
  assert.deepEqual(nonZero(h.io.sealer), { open: 4 });
  assert.deepEqual(nonZero(h.io.kernel), { query: 1 });
  assert.deepEqual(nonZero(h.io.keyring), {});
  assert.deepEqual(Object.keys(views.find((view) => view.serverId === FROZEN_SERVERS.env)?.envTokenHints ?? {}).sort(), ["FAKE_API_KEY", "FAKE_REGION"]);
  assert.ok(views.find((view) => view.serverId === FROZEN_SERVERS.static)?.accessTokenHint);
  assert.equal(views.find((view) => view.serverId === FROZEN_SERVERS.oauth)?.oauth.status, "connected");

  resetCounts(h.io.kernel, h.io.sealer, h.io.repo);
  await assertOpensAllThree(h, { envKey: FROZEN_PLAINTEXT.envBlock.FAKE_API_KEY, accessToken: FROZEN_PLAINTEXT.accessToken, refreshToken: FROZEN_PLAINTEXT.refreshToken });
  assert.equal(h.server.requests.length, 0, "a valid token is served without a refresh");
  closeFrozenDb(db);
});

test("frozen fixture: the connection gate reads one row and opens nothing", async () => {
  const { db, kernel } = await frozenDbFile(path.join(SCRATCH, "gate.db"));
  const h = wire({ kernel, clockIso: VALID_AT });
  const record = await requireRecord(h.repo, FROZEN_SERVERS.oauth);
  const gate = createExternalMcpConnectionGate({ workspaceId: FROZEN_WORKSPACE, repo: h.repo, isPluginEnabled: async () => true });
  const call: FederatedCallTarget = { remoteName: "generate_image", declaredAnnotations: undefined,
    origin: { kind: "roster", admissionRevision: externalMcpAdmissionRevision(record) } };
  resetCounts(h.io.kernel, h.io.repo, h.io.sealer);

  assert.equal(await gate(FROZEN_SERVERS.oauth, call), "current-grants-checked");
  assert.deepEqual(nonZero(h.io.repo), { findByServerId: 1 });
  assert.deepEqual(nonZero(h.io.kernel), { query: 1 });
  assert.deepEqual(nonZero(h.io.sealer), {});
  assert.deepEqual(nonZero(h.io.keyring), {});
  closeFrozenDb(db);
});

test("frozen fixture: leased refresh, static re-save and env update survive a restart with untouched rows byte-identical", async () => {
  const file = process.env.S5_FROZEN_DB_OUT ?? path.join(SCRATCH, "write.db");
  const first = await frozenDbFile(file);
  const before = snapshotFrozenRows({ db: first.db });
  const h = wire({ kernel: first.kernel, clockIso: EXPIRED_AT, reply: ({ form }) => form.grant_type === "refresh_token" && form.refresh_token === FROZEN_PLAINTEXT.refreshToken
    ? { json: { token_type: "Bearer", access_token: REFRESHED.accessToken, refresh_token: REFRESHED.refreshToken, expires_in: 3600 } }
    : { status: 400, json: { error: "invalid_grant" } } });

  // One leased refresh: one token request, one lease claim and release, one reseal.
  assert.equal(await h.service.tokenResolver.resolveAccessToken({ serverId: FROZEN_SERVERS.oauth }), REFRESHED.accessToken);
  assert.equal(h.server.requests.length, 1);
  assert.deepEqual(h.server.requests[0]?.form.grant_type, "refresh_token");
  assert.deepEqual(nonZero(h.io.repo), { findByServerId: 4, releaseOAuthRefreshLease: 1, tryClaimOAuthRefreshLease: 1, upsert: 1 });
  assert.deepEqual(nonZero(h.io.sealer), { open: 4, seal: 1 });
  assert.deepEqual(nonZero(h.io.kernel), { lockKey: 3, query: 4, run: 13, transaction: 3 });
  assert.deepEqual(nonZero(h.io.keyring), { activeKey: 1 });
  // A second call within the new lifetime is served from the row: no lease, no request, no seal.
  resetCounts(h.io.repo, h.io.sealer, h.io.kernel, h.io.keyring);
  assert.equal(await h.service.tokenResolver.resolveAccessToken({ serverId: FROZEN_SERVERS.oauth }), REFRESHED.accessToken);
  assert.equal(h.server.requests.length, 1);
  assert.deepEqual(nonZero(h.io.repo), { findByServerId: 1 });
  assert.deepEqual(nonZero(h.io.sealer), { open: 1 });

  // Static re-save without a new token carries the stored envelope; env update reseals the env block.
  const common = { workspaceId: FROZEN_WORKSPACE, enabled: true, writeAllowedToolNames: "", principalId: "principal-frozen" };
  await saveExternalMcpServer(h.store, { ...common, serverId: FROZEN_SERVERS.static, label: "Static HTTP renamed", transport: "streamable_http",
    authMode: "static_env", command: "", url: "https://mcp.static.example.com/mcp", args: "", allowedToolNames: "lookup" });
  await saveExternalMcpServer(h.store, { ...common, serverId: FROZEN_SERVERS.env, label: "Env Tool", transport: "stdio", authMode: "none",
    command: "npx", args: "-y env-tool-mcp", allowedToolNames: "search", env: `FAKE_API_KEY=${NEW_ENV_KEY}\nFAKE_REGION=${FROZEN_PLAINTEXT.envBlock.FAKE_REGION}` });
  closeFrozenDb(first.db);

  // Restart: a fresh connection, repo, keyring, sealer and service over the same file.
  const second = await openFrozenDb(file);
  const r = wire({ kernel: second.kernel, clockIso: AFTER_RESTART_AT });
  await assertOpensAllThree(r, { envKey: NEW_ENV_KEY, ...REFRESHED });
  assert.equal(r.server.requests.length, 0);
  const after = snapshotFrozenRows({ db: second.db });

  assert.deepEqual(after.workspaces, before.workspaces);
  const vaultBefore = before.secrets_vault as Row[];
  const vaultAfter = after.secrets_vault as Row[];
  assert.equal(vaultAfter.length, vaultBefore.length, "no orphaned or duplicated envelopes");
  for (const untouched of [{ owner: FROZEN_SERVERS.static, kind: "mcp-auth" }, { owner: FROZEN_SERVERS.oauth, kind: "mcp-env" }]) {
    assert.deepEqual(vaultRow(vaultAfter, untouched), vaultRow(vaultBefore, untouched), `${untouched.kind} of ${untouched.owner} is byte-identical`);
  }
  for (const rewritten of [{ owner: FROZEN_SERVERS.env, kind: "mcp-env" }, { owner: FROZEN_SERVERS.oauth, kind: "mcp-auth" }]) {
    const old = vaultRow(vaultBefore, rewritten);
    const fresh = vaultRow(vaultAfter, rewritten);
    // Baseline: a reseal stages a new vault id (label = id); every format column keeps its original value.
    assert.deepEqual(changedColumns(old, fresh), ["__rowid", "created_at", "id", "label", "sealed_ciphertext", "sealed_nonce", "updated_at"]);
    assert.equal(fresh.label, fresh.id);
    assert.equal(vaultBefore.some((row) => row.id === fresh.id), false);
  }
  const serversBefore = before.external_mcp_servers as Row[];
  const serversAfter = after.external_mcp_servers as Row[];
  const expectedChanges: Record<string, string[]> = {
    [FROZEN_SERVERS.env]: ["env_secret_id", "updated_at"],
    [FROZEN_SERVERS.static]: ["label", "updated_at"],
    [FROZEN_SERVERS.oauth]: ["oauth_expires_at", "oauth_secret_id", "updated_at"],
  };
  for (const serverId of Object.values(FROZEN_SERVERS)) {
    // Same rowid and created_at: the upsert updated the row in place, never recreated it.
    assert.deepEqual(changedColumns(serverRow(serversBefore, serverId), serverRow(serversAfter, serverId)), expectedChanges[serverId]);
  }

  // Rewritten payloads keep the original serialization (same key order, schema version 1).
  const rawPayload = async (h2: ReturnType<typeof wire>, serverId: string) => openExternalMcpVaultPayload({ sealer: h2.sealer,
    sealed: (await requireRecord(h2.repo, serverId)).sealedOAuth!, identity: { workspaceId: FROZEN_WORKSPACE, serverId }, kind: "mcp-auth" });
  const oauthPayload = await rawPayload(r, FROZEN_SERVERS.oauth);
  assert.deepEqual(Object.keys(oauthPayload), ["clientSecret", "tokens", "schemaVersion"]);
  assert.equal(oauthPayload.schemaVersion, 1);
  assert.deepEqual(Object.keys(oauthPayload.tokens as Row), ["accessToken", "refreshToken", "tokenType", "scopes", "expiresAt"]);
  closeFrozenDb(second.db);
});

test("frozen fixture: tampered context or owner is refused before any crypto, and restoring it reads again", async () => {
  const { db, kernel } = await frozenDbFile(path.join(SCRATCH, "tamper.db"));
  const h = wire({ kernel, clockIso: VALID_AT });
  const envId = String(vaultRow(snapshotFrozenRows({ db }).secrets_vault as Row[], { owner: FROZEN_SERVERS.env, kind: "mcp-env" }).id);
  // The schema's identity trigger refuses this write; the read-side check below covers a store tampered behind it.
  assert.throws(() => db.$client.prepare("UPDATE secrets_vault SET owner_key = ? WHERE id = ?").run(FROZEN_SERVERS.static, envId), /linked vault MCP identity/);
  db.$client.exec("DROP TRIGGER secrets_vault_mcp_identity");
  // A principal scope or a non-MCP kind is refused by the table's own CHECKs; owner, binding and the
  // other MCP kind reach the read check.
  assert.throws(() => db.$client.prepare("UPDATE secrets_vault SET principal_id = ? WHERE id = ?").run("principal-x", envId), /secrets_vault_principal_scope/);
  assert.throws(() => db.$client.prepare("UPDATE secrets_vault SET kind = ? WHERE id = ?").run("api-connection", envId), /secrets_vault_owner/);
  const tampers = [["owner_key", FROZEN_SERVERS.static, FROZEN_SERVERS.env], ["binding", "foreign-binding", null],
    ["kind", "mcp-auth", "mcp-env"]] as const;
  for (const [column, tampered, original] of tampers) {
    db.$client.prepare(`UPDATE secrets_vault SET "${column}" = ? WHERE id = ?`).run(tampered, envId);
    resetCounts(h.io.sealer, h.io.keyring);
    await assert.rejects(h.repo.findByServerId({ workspaceId: FROZEN_WORKSPACE, serverId: FROZEN_SERVERS.env }),
      (error: unknown) => error instanceof VaultError && error.code === "context", `${column} tamper is a context refusal`);
    await assert.rejects(listExternalMcpServerViews({ repo: h.repo, sealer: h.sealer }, FROZEN_WORKSPACE),
      (error: unknown) => error instanceof VaultError && error.code === "context");
    assert.deepEqual(nonZero(h.io.sealer), {}, `${column} tamper is refused before crypto`);
    assert.deepEqual(nonZero(h.io.keyring), {});
    db.$client.prepare(`UPDATE secrets_vault SET "${column}" = ? WHERE id = ?`).run(original, envId);
    const restored = await requireRecord(h.repo, FROZEN_SERVERS.env);
    assert.equal((await openExternalMcpVaultPayload({ sealer: h.sealer, sealed: restored.sealedEnv!, identity: { workspaceId: FROZEN_WORKSPACE,
      serverId: FROZEN_SERVERS.env }, kind: "mcp-env" })).FAKE_API_KEY, FROZEN_PLAINTEXT.envBlock.FAKE_API_KEY);
  }
  closeFrozenDb(db);
});

test("frozen fixture: a foreign kind is refused before the parser; invalid AAD and payload version are refused", async () => {
  const { db, kernel } = await frozenDbFile(path.join(SCRATCH, "kinds.db"));
  const h = wire({ kernel, clockIso: VALID_AT });
  const envRecord = await requireRecord(h.repo, FROZEN_SERVERS.env);
  resetCounts(h.io.sealer);
  for (const kind of ["mcp-auth", "api-connection"] as const) {
    await assert.rejects(openExternalMcpVaultPayload({ sealer: h.sealer, sealed: envRecord.sealedEnv!, identity: envRecord, kind: kind as "mcp-auth" }),
      (error: unknown) => error instanceof VaultError && error.code === "context");
  }
  assert.deepEqual(nonZero(h.io.sealer), {}, "foreign kinds never reach the parser or the sealer");
  // The seal path refuses a foreign kind before its metadata parser, the keyring or the sealer runs.
  resetCounts(h.io.sealer, h.io.keyring);
  await assert.rejects(sealExternalMcpVaultPayload({ deps: { sealer: h.sealer, keyring: h.keyring }, identity: envRecord,
    kind: "api-connection" as "mcp-env", payload: { FAKE_API_KEY: "fake-foreign" } }), (error: unknown) => error instanceof VaultError && error.code === "context");
  assert.deepEqual(nonZero(h.io.sealer), {});
  assert.deepEqual(nonZero(h.io.keyring), {});

  // Invalid AAD: the static row's ciphertext transplanted into the OAuth row's own, context-valid envelope.
  const vault = snapshotFrozenRows({ db }).secrets_vault as Row[];
  const donor = vaultRow(vault, { owner: FROZEN_SERVERS.static, kind: "mcp-auth" });
  const target = vaultRow(vault, { owner: FROZEN_SERVERS.oauth, kind: "mcp-auth" });
  db.$client.prepare("UPDATE secrets_vault SET sealed_ciphertext = ?, sealed_nonce = ? WHERE id = ?").run(donor.sealed_ciphertext, donor.sealed_nonce, target.id);
  const transplanted = await requireRecord(h.repo, FROZEN_SERVERS.oauth);
  resetCounts(h.io.sealer);
  await assert.rejects(openExternalMcpOAuthPayload(h.sealer, transplanted), ExternalMcpSecretStoreUnconfiguredError);
  assert.deepEqual(nonZero(h.io.sealer), { open: 1 }, "the AAD mismatch is refused by the one open");
  db.$client.prepare("UPDATE secrets_vault SET sealed_ciphertext = ?, sealed_nonce = ? WHERE id = ?").run(target.sealed_ciphertext, target.sealed_nonce, target.id);

  // Invalid payload version: a newer schema sealed through the real seal path is refused, not misread.
  const record = await requireRecord(h.repo, FROZEN_SERVERS.oauth);
  const identity = { workspaceId: FROZEN_WORKSPACE, serverId: FROZEN_SERVERS.oauth };
  const newer = await sealExternalMcpVaultPayload({ deps: { sealer: h.sealer, keyring: h.keyring }, identity, kind: "mcp-auth",
    payload: { schemaVersion: 2, clientSecret: FROZEN_PLAINTEXT.clientSecret } });
  await h.repo.upsert({ ...record, sealedOAuth: newer });
  const versioned = openExternalMcpOAuthPayload(h.sealer, await requireRecord(h.repo, FROZEN_SERVERS.oauth));
  await assert.rejects(versioned, (error: unknown) => error instanceof Error && !(error instanceof ExternalMcpSecretStoreUnconfiguredError)
    && /schema version 2, newer than this build understands \(1\)/.test(error.message));
  closeFrozenDb(db);
});

test("frozen fixture: provider errors carrying token/secret/URL/path never reach model-facing text", async () => {
  const replies: Record<string, FakeTokenReply> = {
    invalidGrant: { status: 400, json: { error: "invalid_grant", error_description: CANARY } },
    outage: { status: 500, json: { error: "server_error", error_description: CANARY, error_uri: `https://${CANARY_PARTS[2]}/doc` } },
  };
  for (const [name, reply] of Object.entries(replies)) {
    const { db, kernel } = await frozenDbFile(path.join(SCRATCH, `canary-${name}.db`));
    const h = wire({ kernel, clockIso: EXPIRED_AT, reply: () => reply });
    const thrown = await h.service.tokenResolver.resolveAccessToken({ serverId: FROZEN_SERVERS.oauth }).then(() => null, (error: unknown) => error);
    assert.ok(thrown instanceof Error, `${name}: the refresh fails`);
    assert.equal(thrown instanceof ExternalMcpReauthRequiredError, name === "invalidGrant");
    const { failures } = await readEnabledExternalMcpConfigs({ repo: h.repo, sealer: h.sealer, oauth: h.service.tokenResolver }, FROZEN_WORKSPACE);
    assert.deepEqual(failures.map((failure) => failure.serverId), [FROZEN_SERVERS.oauth]);
    const record = await requireRecord(h.repo, FROZEN_SERVERS.oauth);
    const gate = createExternalMcpConnectionGate({ workspaceId: FROZEN_WORKSPACE, repo: h.repo, isPluginEnabled: async () => true });
    const verdict = await gate(FROZEN_SERVERS.oauth, { remoteName: "generate_image", declaredAnnotations: undefined,
      origin: { kind: "roster", admissionRevision: externalMcpAdmissionRevision(record) } }).then(String, (error: unknown) => String((error as Error).message));
    assertNoCanary([thrown.message, ...failures.map((failure) => failure.reason), verdict]);
    closeFrozenDb(db);
  }
});
