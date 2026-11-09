import fs from "node:fs";
import { ensureVaultRepoFixture } from "../../../../platform/db/repos/__tests__/vault-repo.fixture.js";
import { type ContentKernel, contentKernel } from "../../../../platform/db/content-kernel.js";
import { closeSqliteConnection } from "../../../../platform/db/kernel/drivers/sqlite.js";
import { type ContentDb, openContentDb } from "../../../../platform/db/sqlite/content-db.js";
import type { OAuthProviderDescriptor } from "../../../../platform/oauth/index.js";
import { EnvOrFileKeyring } from "../../../webhooks/keyring.env.js";
import { AesGcmSecretSealer } from "../../../webhooks/secret-sealer.aesgcm.js";
import { SITE_KEY_ENV_VAR_NAME } from "../../../webhooks/site-key-sources.js";

/**
 * @file Shared inputs for the frozen external-MCP credential database (EXTRACT-S5 H0, G-mcp).
 *
 * `mcp-credentials.frozen.sql` was minted ONCE, before any extraction move, by
 * `mint-mcp-credentials-frozen.ts` through the unmoved `SqlExternalMcpServerRepo` + store. It is
 * never reminted: later batches prove that moved code still reads and writes these exact bytes.
 *
 * Everything here is a TEST value. The key below seals only the fake tokens in the fixture; it is not,
 * and never was, a site key of any deployment.
 */

/** Test-only 32-byte site key (hex). Its SHA256 is recorded in the S5 report; never a real key. */
export const FROZEN_TEST_SITE_KEY_HEX = "5e5e5e5e00112233445566778899aabbccddeeff0123456789abcdef5e5e5e5e";
export const FROZEN_WORKSPACE = "workspace-frozen";
export const FROZEN_SERVERS = { env: "env-tool", static: "static-http", oauth: "oauth-higgs" } as const;
/** Dump/load order: the FK parent workspace row, then vault envelopes, then the server pointers. */
export const FROZEN_TABLES = [["workspaces", "id"], ["secrets_vault", "workspace_id"], ["external_mcp_servers", "workspace_id"]] as const;
export const FROZEN_MINT_ISO = "2026-08-25T12:00:00.000Z";
export const FROZEN_REDIRECT_URI = "https://tovu.example.com/api/mcp-servers/oauth/callback/oauth-higgs";

/** The fake tokens and env values sealed in the fixture (plaintext a reader must recover). */
export const FROZEN_PLAINTEXT = {
  envBlock: { FAKE_API_KEY: "fake-env-key-0001", FAKE_REGION: "fake-region" },
  staticToken: "fake-static-token-0001",
  oauthEnv: { HIGGS_REGION: "fake-higgs-region" },
  clientSecret: "fake-client-secret-0001",
  accessToken: "fake-access-token-0001",
  refreshToken: "fake-refresh-token-0001",
} as const;

export const FROZEN_PROVIDER: OAuthProviderDescriptor = {
  providerId: "test-provider",
  label: "Test Provider",
  supportedGrants: ["authorization_code", "device_code"],
  authorizationEndpoint: "https://auth.example.com/authorize",
  tokenEndpoint: "https://auth.example.com/token",
  deviceAuthorizationEndpoint: "https://auth.example.com/device",
  defaultScopes: [],
  usesPkce: true,
  clientAuth: "none",
};

/** The production env keyring reading the test key from an injected env, never `process.env`. */
export function frozenKeyring(): EnvOrFileKeyring {
  return new EnvOrFileKeyring({ sources: [{ kind: "env" }] }, { env: () => ({ [SITE_KEY_ENV_VAR_NAME]: FROZEN_TEST_SITE_KEY_HEX }) });
}

export function frozenSealer(keyring: EnvOrFileKeyring = frozenKeyring()): AesGcmSecretSealer {
  return new AesGcmSecretSealer(keyring);
}

/** A settable clock (the store's `Clock` port reads only `nowMs`). */
export function frozenClock(startIso: string = FROZEN_MINT_ISO) {
  let nowMs = Date.parse(startIso);
  return { nowMs: () => nowMs, nowIso: () => new Date(nowMs).toISOString(), set: (iso: string) => { nowMs = Date.parse(iso); } };
}

export interface FakeTokenRequest { readonly url: string; readonly form: Record<string, string> }
export interface FakeTokenReply { readonly status?: number; readonly json: Record<string, unknown> }

/**
 * An in-process OAuth token server: each POST to the token endpoint is recorded and answered by
 * `reply`. Nothing leaves the process; the guarded transport still validates every URL first.
 */
export function fakeOAuthServer(reply: (request: FakeTokenRequest) => FakeTokenReply) {
  const requests: FakeTokenRequest[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = { url: String(url), form: Object.fromEntries(new URLSearchParams(String(init?.body ?? ""))) };
    requests.push(request);
    const answer = reply(request);
    return new Response(JSON.stringify(answer.json), { status: answer.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchFn, requests };
}

/** Opens (and migrates) a SQLite content database file and adds the disposable vault table. */
export async function openFrozenDb(filePath: string): Promise<{ db: ContentDb; kernel: ContentKernel }> {
  const db = openContentDb(filePath);
  const kernel = contentKernel(db);
  await ensureVaultRepoFixture({ kernel });
  return { db, kernel };
}

export function closeFrozenDb(db: ContentDb): void {
  closeSqliteConnection(db);
}

/** Loads the frozen SQL text (INSERT statements only) into an opened, migrated database. */
export function loadFrozenSql({ db, sqlText }: { db: ContentDb; sqlText: string }): void {
  db.$client.exec(sqlText);
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (Buffer.isBuffer(value)) return `X'${value.toString("hex")}'`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** Seeds the frozen workspace, the FK parent of every vault and server row. */
export function insertFrozenWorkspace({ db }: { db: ContentDb }): void {
  db.$client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)")
    .run(FROZEN_WORKSPACE, FROZEN_WORKSPACE, FROZEN_WORKSPACE, FROZEN_MINT_ISO);
}

function frozenRows({ db, table, column, rowid }: { db: ContentDb; table: string; column: string; rowid: boolean }): Record<string, unknown>[] {
  const rowidColumn = rowid ? 'rowid AS "__rowid", ' : "";
  return db.$client.prepare(`SELECT ${rowidColumn}* FROM "${table}" WHERE "${column}" = ? ORDER BY rowid`)
    .all(FROZEN_WORKSPACE) as Record<string, unknown>[];
}

/** Text SQL dump of the frozen workspace's rows, in {@link FROZEN_TABLES} order so pointers resolve on load. */
export function dumpFrozenRows({ db }: { db: ContentDb }): string {
  const lines: string[] = [];
  for (const [table, column] of FROZEN_TABLES) {
    const rows = frozenRows({ db, table, column, rowid: false });
    for (const row of rows) {
      const columns = Object.keys(row).map((name) => `"${name}"`).join(", ");
      lines.push(`INSERT INTO "${table}" (${columns}) VALUES (${Object.values(row).map(sqlLiteral).join(", ")});`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Every frozen-table row keyed by table, with SQLite's rowid, for byte-identity comparisons. */
export function snapshotFrozenRows({ db }: { db: ContentDb }): Record<string, Record<string, unknown>[]> {
  return Object.fromEntries(FROZEN_TABLES.map(([table, column]) => [table, frozenRows({ db, table, column, rowid: true })]));
}

export const FROZEN_SQL_PATH = new URL("./mcp-credentials.frozen.sql", import.meta.url);

export function readFrozenSql(): string {
  return fs.readFileSync(FROZEN_SQL_PATH, "utf8");
}
