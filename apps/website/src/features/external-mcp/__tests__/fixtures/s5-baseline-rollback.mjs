// EXTRACT-S5 BASELINE rollback proof for the frozen external-MCP credential database.
//
// Opens a COPY of a database written by `external-mcp-frozen-db.test.ts` (S5_FROZEN_DB_OUT) with the
// BASELINE (pin) Tovu code — every module below is imported from `--base`, never from this tree —
// and proves old code still reads all three credentials and that no row was recreated. Run from the
// baseline checkout so tsx and its dependencies resolve there:
//
//   cd <baseline-tovu> && TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx \
//     <s5-tovu>/apps/website/src/features/external-mcp/__tests__/fixtures/s5-baseline-rollback.mjs \
//     --base <baseline-tovu> --db <post-write db>
//
// TEST key and FAKE tokens only (the same values as `mcp-credentials-frozen.fixture.ts`, repeated here
// because the baseline tree predates that module). Exits 0 only when every check holds.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TEST_SITE_KEY_HEX = "5e5e5e5e00112233445566778899aabbccddeeff0123456789abcdef5e5e5e5e";
const WORKSPACE = "workspace-frozen";
const SERVERS = { env: "env-tool", static: "static-http", oauth: "oauth-higgs" };
const READ_AT = "2026-08-25T13:31:00.000Z";
// The plaintext the frozen-DB test leaves behind: env update, carried static token, one leased refresh.
const EXPECTED = {
  env: { FAKE_API_KEY: "fake-env-key-0002", FAKE_REGION: "fake-region" },
  staticAuthorization: "Bearer fake-static-token-0001",
  oauthEnv: { HIGGS_REGION: "fake-higgs-region", HIGGS_TOKEN: "fake-access-token-0002" },
  clientSecret: "fake-client-secret-0001",
  refreshToken: "fake-refresh-token-0002",
};
const UNTOUCHED_VAULT = [[SERVERS.static, "mcp-auth"], [SERVERS.oauth, "mcp-env"]];
const REWRITTEN_VAULT = [[SERVERS.env, "mcp-env"], [SERVERS.oauth, "mcp-auth"]];
const FORMAT_COLUMNS = ["workspace_id", "kind", "owner_key", "principal_id", "binding", "provider", "is_default", "revision",
  "sealed_key_id", "sealed_alg", "last4", "token_length", "meta"];
const SERVER_IDENTITY = ["__rowid", "workspace_id", "server_id", "created_at", "transport", "auth_mode", "provisioned_by_plugin_id"];
const PROVIDER = { providerId: "test-provider", label: "Test Provider", supportedGrants: ["authorization_code", "device_code"],
  authorizationEndpoint: "https://auth.example.com/authorize", tokenEndpoint: "https://auth.example.com/token",
  deviceAuthorizationEndpoint: "https://auth.example.com/device", defaultScopes: [], usesPkce: true, clientAuth: "none" };

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

const base = path.resolve(arg("base"));
const source = path.resolve(arg("db"));
const fixture = path.resolve(arg("fixture", new URL("./mcp-credentials.frozen.sql", import.meta.url).pathname));
const load = (relative) => import(pathToFileURL(path.join(base, "apps/website/src", relative)).href);

const { openContentDb } = await load("platform/db/sqlite/content-db.ts");
const { contentKernel } = await load("platform/db/content-kernel.ts");
const { closeSqliteConnection } = await load("platform/db/kernel/drivers/sqlite.ts");
const { ensureVaultRepoFixture } = await load("platform/db/repos/__tests__/vault-repo.fixture.ts");
const { SqlExternalMcpServerRepo } = await load("features/external-mcp/external-mcp-repo.ts");
const { readEnabledExternalMcpConfigs, openExternalMcpOAuthPayload } = await load("features/external-mcp/external-mcp-store.ts");
const { createExternalMcpOAuthService, createDeviceAuthorizationStore } = await load("features/external-mcp/external-mcp-oauth.ts");
const { createTovuOAuthGuard } = await load("platform/oauth/endpoint-safety.ts");
const { EnvOrFileKeyring } = await load("features/webhooks/keyring.env.ts");
const { AesGcmSecretSealer } = await load("features/webhooks/secret-sealer.aesgcm.ts");
const { SITE_KEY_ENV_VAR_NAME } = await load("features/webhooks/site-key-sources.ts");

async function open(filePath) {
  const db = openContentDb(filePath);
  const kernel = contentKernel(db);
  await ensureVaultRepoFixture({ kernel });
  return { db, kernel };
}

function snapshot(db) {
  const rows = (table, column) => db.$client.prepare(`SELECT rowid AS "__rowid", * FROM "${table}" WHERE "${column}" = ? ORDER BY rowid`).all(WORKSPACE);
  return { workspaces: rows("workspaces", "id"), vault: rows("secrets_vault", "workspace_id"), servers: rows("external_mcp_servers", "workspace_id") };
}

const pick = (row, columns) => Object.fromEntries(columns.map((column) => [column, row[column]]));
const vaultRow = (rows, [owner, kind]) => {
  const row = rows.find((candidate) => candidate.owner_key === owner && candidate.kind === kind);
  assert.ok(row, `${kind} vault row of ${owner}`);
  return row;
};

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "s5-baseline-rollback-"));
const checks = [];
const check = async (name, run) => { await run(); checks.push(name); };
try {
  const reference = await open(path.join(scratch, "fixture.db"));
  reference.db.$client.exec(fs.readFileSync(fixture, "utf8"));
  const frozen = snapshot(reference.db);
  closeSqliteConnection(reference.db);

  const copy = path.join(scratch, "copy.db");
  fs.copyFileSync(source, copy);
  const { db, kernel } = await open(copy);
  const now = snapshot(db);

  await check("workspace row unchanged", () => assert.deepEqual(now.workspaces, frozen.workspaces));
  await check("server rows updated in place (rowid/created_at/identity unchanged)", () => {
    assert.equal(now.servers.length, frozen.servers.length);
    for (const row of frozen.servers) assert.deepEqual(pick(now.servers.find((candidate) => candidate.server_id === row.server_id) ?? {}, SERVER_IDENTITY), pick(row, SERVER_IDENTITY));
  });
  await check("untouched envelopes byte-identical", () => {
    assert.equal(now.vault.length, frozen.vault.length);
    for (const key of UNTOUCHED_VAULT) assert.deepEqual(vaultRow(now.vault, key), vaultRow(frozen.vault, key));
  });
  await check("rewritten envelopes keep the original format columns", () => {
    for (const key of REWRITTEN_VAULT) assert.deepEqual(pick(vaultRow(now.vault, key), FORMAT_COLUMNS), pick(vaultRow(frozen.vault, key), FORMAT_COLUMNS));
  });

  const keyring = new EnvOrFileKeyring({ sources: [{ kind: "env" }] }, { env: () => ({ [SITE_KEY_ENV_VAR_NAME]: TEST_SITE_KEY_HEX }) });
  const sealer = new AesGcmSecretSealer(keyring);
  const repo = new SqlExternalMcpServerRepo(kernel);
  let requests = 0;
  const service = createExternalMcpOAuthService({ workspaceId: WORKSPACE, repo, sealer, keyring, clock: { nowMs: () => Date.parse(READ_AT) },
    devices: createDeviceAuthorizationStore(), lookupProvider: () => PROVIDER,
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }), fetchFn: async () => { requests += 1; throw new Error("no network in rollback"); } } });
  await check("baseline code opens all three credentials", async () => {
    const { configs, failures } = await readEnabledExternalMcpConfigs({ repo, sealer, oauth: service.tokenResolver }, WORKSPACE);
    assert.deepEqual(failures, []);
    const target = (serverId) => configs.find((config) => config.serverId === serverId)?.target;
    assert.deepEqual(target(SERVERS.env)?.env, EXPECTED.env);
    assert.equal(target(SERVERS.static)?.headers?.authorization, EXPECTED.staticAuthorization);
    assert.deepEqual(target(SERVERS.oauth)?.env, EXPECTED.oauthEnv);
    const payload = await openExternalMcpOAuthPayload(sealer, await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVERS.oauth }));
    assert.equal(payload.clientSecret, EXPECTED.clientSecret);
    assert.equal(payload.tokens?.refreshToken, EXPECTED.refreshToken);
    assert.equal(requests, 0, "no refresh was needed");
  });
  closeSqliteConnection(db);
  process.stdout.write(`${JSON.stringify({ ok: true, base, source, checks }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, base, source, checks, failure: String(error?.message ?? error) }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
