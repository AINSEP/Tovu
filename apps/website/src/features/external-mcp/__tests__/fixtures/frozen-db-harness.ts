import assert from "node:assert/strict";
import { createTovuOAuthGuard } from "../../../../platform/oauth/endpoint-safety.js";
import type { ContentKernel } from "../../../../platform/db/content-kernel.js";
import type { ExternalMcpServerRecord } from "../../contracts.js";
import { createDeviceAuthorizationStore, createExternalMcpOAuthService } from "../../external-mcp-oauth.js";
import { SqlExternalMcpServerRepo } from "../../external-mcp-repo.js";
import { openExternalMcpOAuthPayload, readEnabledExternalMcpConfigs } from "../../external-mcp-store.js";
import { FROZEN_PLAINTEXT, FROZEN_PROVIDER, FROZEN_SERVERS, FROZEN_WORKSPACE, type FakeTokenReply, type FakeTokenRequest,
  fakeOAuthServer, frozenClock, frozenKeyring, frozenSealer } from "./mcp-credentials-frozen.fixture.js";

/**
 * @file The wired host for the frozen external-MCP credential tests (EXTRACT-S5 H0): counting kernel,
 * repo, sealer and keyring over any dialect's content kernel, the post-write clock instants, and the
 * all-three-credentials read. Shared by the SQLite and PostgreSQL frozen-DB tests so both replay the
 * same flow and counters.
 */

export const VALID_AT = "2026-08-25T12:10:00.000Z";
export const EXPIRED_AT = "2026-08-25T13:30:00.000Z";
export const AFTER_RESTART_AT = "2026-08-25T13:31:00.000Z";
export const REFRESHED = { accessToken: "fake-access-token-0002", refreshToken: "fake-refresh-token-0002" } as const;
export const NEW_ENV_KEY = "fake-env-key-0002";

export type Counts = Record<string, number>;
export type Row = Record<string, unknown>;

/** Counts every method call on `inner` by name (calls the target re-enters through `this` are not double-counted). */
export function counted<T extends object>(inner: T, counts: Counts, record?: (method: string, args: unknown[]) => void): T {
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

export function nonZero(counts: Counts): Counts {
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
}

export function resetCounts(...all: Counts[]): void {
  for (const counts of all) for (const key of Object.keys(counts)) delete counts[key];
}

/** The wired host over one opened database: counting kernel, repo, sealer and keyring plus a fake token server. */
export function wire({ kernel, clockIso, reply }: { kernel: ContentKernel; clockIso: string; reply?: (request: FakeTokenRequest) => FakeTokenReply }) {
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


export async function requireRecord(repo: SqlExternalMcpServerRepo, serverId: string): Promise<ExternalMcpServerRecord> {
  const record = await repo.findByServerId({ workspaceId: FROZEN_WORKSPACE, serverId });
  assert.ok(record, `expected the frozen row '${serverId}'`);
  return record;
}

export function vaultRow(rows: Row[], { owner, kind }: { owner: string; kind: string }): Row {
  const row = rows.find((candidate) => candidate.owner_key === owner && candidate.kind === kind);
  assert.ok(row, `expected the ${kind} vault row of ${owner}`);
  return row;
}

export function serverRow(rows: Row[], serverId: string): Row {
  const row = rows.find((candidate) => candidate.server_id === serverId);
  assert.ok(row, `expected the server row ${serverId}`);
  return row;
}

export function changedColumns(before: Row, after: Row): string[] {
  return Object.keys(before).filter((column) => before[column] !== after[column]).sort();
}

/** Opens all three frozen credentials through the store's own read paths and checks the plaintext. */
export async function assertOpensAllThree(h: ReturnType<typeof wire>, expected: { envKey: string; accessToken: string; refreshToken: string }) {
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
