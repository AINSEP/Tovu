import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { createExternalMcpConnectionGate } from "../external-mcp-oauth.js";
import {
  deleteExternalMcpServer,
  readEnabledExternalMcpConfigs,
  saveExternalMcpServer,
  toResolvedFederatedConnections,
  type ExternalMcpServerRepoPort,
} from "../external-mcp-store.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import { InMemoryMcpSession } from "../mcp-federation/adapter.memory.js";
import { attachFederatedMcpTools } from "../mcp-federation/bootstrap.js";
import type { ResolvedFederatedConnection } from "../mcp-federation/config.js";
import type { FederatedMcpConnectionConfig, RemoteToolDescriptor } from "../mcp-federation/ports.js";

/**
 * @file End-to-end proof that a roster connection revoked AFTER admission — turned off, deleted,
 * edited, or narrowed — refuses its already-admitted federated tool on the very next call, with no
 * restart, through the REAL daemon wiring: `readEnabledExternalMcpConfigs` ->
 * `toResolvedFederatedConnections` -> `attachFederatedMcpTools` -> `createToolExecutor`, exactly as
 * `agent-daemon-server.ts` assembles it. `external-mcp-oauth.test.ts`'s gate-section tests exercise
 * `createExternalMcpConnectionGate` directly, unit-style; this file proves the same gate wired the
 * way it is actually consumed, with a real `ToolRegistry` and `ToolExecutor` in the loop.
 */

const WORKSPACE = "workspace-1";
const SERVER_ID = "acme";
const PRINCIPAL = "principal-1";

const READ_TOOL_ID = "mcp__acme__read_thing";
const WRITE_TOOL_ID = "mcp__acme__write_thing";

const CHANGED_MESSAGE =
  '"Acme" was changed in Integrations → External MCP after the assistant started. Ask the operator to restart the assistant so the change takes effect. Do not retry this tool.';

const REMOTE_TOOLS: RemoteToolDescriptor[] = [
  { name: "read_thing", description: "Reads a thing.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "write_thing", description: "Writes a thing.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: false } },
];

function makeClock(startIso = "2026-09-16T00:00:00.000Z") {
  let nowMs = Date.parse(startIso);
  return {
    nowIso: () => new Date(nowMs).toISOString(),
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

function makeStoreDeps(clock: { nowIso(): string }) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  return { repo, sealer, deps: { repo, keyring, sealer, clock } };
}

function baseSaveInput(overrides: Partial<Parameters<typeof saveExternalMcpServer>[1]> = {}) {
  return {
    workspaceId: WORKSPACE,
    serverId: SERVER_ID,
    label: "Acme",
    transport: "streamable_http",
    authMode: "none",
    enabled: true,
    command: "",
    url: "https://acme.example/mcp",
    args: "",
    allowedToolNames: "read_thing, write_thing",
    writeAllowedToolNames: "write_thing",
    principalId: PRINCIPAL,
    ...overrides,
  };
}

/** Wraps a repo so `findByServerId` always rejects — T1-9's broken-database double. Every other
 *  method delegates unchanged. */
function repoWhoseFindThrows(inner: ExternalMcpServerRepoPort, error: Error): ExternalMcpServerRepoPort {
  return {
    listByWorkspaceId: (workspaceId) => inner.listByWorkspaceId(workspaceId),
    findByServerId: () => Promise.reject(error),
    upsert: (record) => inner.upsert(record),
    deleteByServerId: (input) => inner.deleteByServerId(input),
    tryClaimOAuthRefreshLease: (input) => inner.tryClaimOAuthRefreshLease(input),
    releaseOAuthRefreshLease: (input) => inner.releaseOAuthRefreshLease(input),
  };
}

async function allow() {
  return { allowed: true as const, reason: "matched" };
}

/** Boots the real daemon path over one repo: reads the enabled roster, resolves it into federation
 *  connections, attaches them to a fresh registry through the SAME gate `agent-daemon-server.ts`
 *  wires, and returns an executor plus the live session (so a test can assert on `session.calls`
 *  directly rather than threading its own call-counting side channel).
 *
 *  `gateRepo` lets a test build the GATE over a different repo than the one admission itself read
 *  from (T1-9) — admission and the per-call gate are independent reads in production too, one at
 *  boot and one on every call, so nothing here is unrealistic. `presets` stands in for
 *  `attachFederatedMcpTools`'s own `connections` param (vendor presets), kept separate from the
 *  roster `extraConnections` the same way `bootstrap.ts` keeps them separate. */
async function boot(options: {
  repo: InMemoryExternalMcpServerRepo;
  sealer: AesGcmSecretSealer;
  gateRepo?: ExternalMcpServerRepoPort;
  presets?: readonly ResolvedFederatedConnection[];
}) {
  const { repo, sealer } = options;
  const { configs } = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);
  const extraConnections = toResolvedFederatedConnections(configs);

  const session = new InMemoryMcpSession({ tools: REMOTE_TOOLS });
  const registry = createToolRegistry();
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo: options.gateRepo ?? repo });

  await attachFederatedMcpTools({
    registry,
    deps: { authorize: allow, workspaceId: WORKSPACE, assertConnectionUsable: gate },
    connections: options.presets ?? [],
    extraConnections,
    connect: async () => session,
    logger: { info() {}, warn() {} },
  });

  return { toolExecutor: createToolExecutor({ registry }), session };
}

function callReadThing(toolExecutor: ReturnType<typeof createToolExecutor>) {
  return toolExecutor.execute({ id: PRINCIPAL }, { id: "run-1" }, READ_TOOL_ID, {});
}

function callWriteThing(toolExecutor: ReturnType<typeof createToolExecutor>) {
  return toolExecutor.execute({ id: PRINCIPAL }, { id: "run-1" }, WRITE_TOOL_ID, {});
}

test("T1-1 control: an enabled connection's admitted tool completes and reaches the remote", async () => {
  const { repo, sealer, deps } = makeStoreDeps(makeClock());
  await saveExternalMcpServer(deps, baseSaveInput());
  const { toolExecutor, session } = await boot({ repo, sealer });

  const result = await callReadThing(toolExecutor);

  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.deepEqual(
    session.calls.map((call) => call.name),
    ["read_thing"],
  );
});

test("T1-2: a connection turned off after admission refuses its tool on the next call, without a restart", async () => {
  const { repo, sealer, deps } = makeStoreDeps(makeClock());
  await saveExternalMcpServer(deps, baseSaveInput());
  const { toolExecutor, session } = await boot({ repo, sealer });

  await saveExternalMcpServer(deps, baseSaveInput({ enabled: false }));
  const result = await callReadThing(toolExecutor);

  assert.equal(result.status, "failed");
  assert.equal(result.errorKind, "validation");
  assert.equal(result.error, '"Acme" is turned off in Integrations → External MCP. Ask the operator to turn it back on. Do not retry this tool.');
  assert.equal(session.calls.length, 0);
});

test("T1-3: turning it back on (same fields) lets the same admitted tool complete again", async () => {
  const { repo, sealer, deps } = makeStoreDeps(makeClock());
  await saveExternalMcpServer(deps, baseSaveInput());
  const { toolExecutor, session } = await boot({ repo, sealer });

  await saveExternalMcpServer(deps, baseSaveInput({ enabled: false }));
  await saveExternalMcpServer(deps, baseSaveInput({ enabled: true }));
  const result = await callReadThing(toolExecutor);

  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.deepEqual(
    session.calls.map((call) => call.name),
    ["read_thing"],
  );
});

test("T1-4: a deleted connection refuses its tool on the next call", async () => {
  const { repo, sealer, deps } = makeStoreDeps(makeClock());
  await saveExternalMcpServer(deps, baseSaveInput());
  const { toolExecutor, session } = await boot({ repo, sealer });

  await deleteExternalMcpServer({ repo }, { workspaceId: WORKSPACE, serverId: SERVER_ID });
  const result = await callReadThing(toolExecutor);

  assert.equal(result.status, "failed");
  assert.equal(result.errorKind, "validation");
  assert.equal(result.error, `"${SERVER_ID}" was removed from Integrations → External MCP, so its tools no longer work. Do not retry this tool.`);
  assert.equal(session.calls.length, 0);
});

test("T1-5: a connection deleted and re-created under the same id refuses as changed", async () => {
  const clock = makeClock();
  const { repo, sealer, deps } = makeStoreDeps(clock);
  await saveExternalMcpServer(deps, baseSaveInput());
  const { toolExecutor, session } = await boot({ repo, sealer });

  await deleteExternalMcpServer({ repo }, { workspaceId: WORKSPACE, serverId: SERVER_ID });
  await saveExternalMcpServer(deps, baseSaveInput({ url: "https://acme-v2.example/mcp" }));
  const differentUrl = await callReadThing(toolExecutor);
  assert.equal(differentUrl.status, "failed");
  assert.equal(differentUrl.error, CHANGED_MESSAGE);

  // Re-created a SECOND time with the ORIGINAL url, but only after time moved on — isolates
  // `createdAt`'s own contribution to the admission revision from the url difference the case above
  // already covers, so a mutant that drops `createdAt` from the hash cannot pass by accident.
  await deleteExternalMcpServer({ repo }, { workspaceId: WORKSPACE, serverId: SERVER_ID });
  clock.advance(1000);
  await saveExternalMcpServer(deps, baseSaveInput());
  const sameUrlLater = await callReadThing(toolExecutor);
  assert.equal(sameUrlLater.status, "failed");
  assert.equal(sameUrlLater.error, CHANGED_MESSAGE);

  assert.equal(session.calls.length, 0);
});

test("T1-6: editing the URL of an admitted connection refuses as changed", async () => {
  const { repo, sealer, deps } = makeStoreDeps(makeClock());
  await saveExternalMcpServer(deps, baseSaveInput());
  const { toolExecutor, session } = await boot({ repo, sealer });

  await saveExternalMcpServer(deps, baseSaveInput({ url: "https://acme-v2.example/mcp" }));
  const result = await callReadThing(toolExecutor);

  assert.equal(result.status, "failed");
  assert.equal(result.error, CHANGED_MESSAGE);
  assert.equal(session.calls.length, 0);
});

test("T1-7: removing write_thing from the write list refuses the write tool; read_thing still completes", async () => {
  const { repo, sealer, deps } = makeStoreDeps(makeClock());
  await saveExternalMcpServer(deps, baseSaveInput());
  const { toolExecutor, session } = await boot({ repo, sealer });

  await saveExternalMcpServer(deps, baseSaveInput({ writeAllowedToolNames: "" }));

  const writeResult = await callWriteThing(toolExecutor);
  assert.equal(writeResult.status, "failed");
  assert.equal(writeResult.errorKind, "validation");
  assert.equal(
    writeResult.error,
    '"write_thing" on "Acme" is no longer allowed to make changes in Integrations → External MCP. Do not retry this tool.',
  );

  const readResult = await callReadThing(toolExecutor);
  assert.equal(readResult.status, "completed", JSON.stringify(readResult));

  assert.deepEqual(
    session.calls.map((call) => call.name),
    ["read_thing"],
  );
});

test("T1-8: removing read_thing from the allowlist refuses it", async () => {
  const { repo, sealer, deps } = makeStoreDeps(makeClock());
  await saveExternalMcpServer(deps, baseSaveInput());
  const { toolExecutor, session } = await boot({ repo, sealer });

  await saveExternalMcpServer(deps, baseSaveInput({ allowedToolNames: "write_thing", writeAllowedToolNames: "write_thing" }));
  const result = await callReadThing(toolExecutor);

  assert.equal(result.status, "failed");
  assert.equal(result.errorKind, "validation");
  assert.equal(result.error, '"read_thing" on "Acme" is no longer allowed in Integrations → External MCP. Do not retry this tool.');
  assert.equal(session.calls.length, 0);
});

test("T1-9: a row read that throws refuses without reaching the remote, and the model text has no read-error detail", async (t) => {
  const { repo, sealer, deps } = makeStoreDeps(makeClock());
  await saveExternalMcpServer(deps, baseSaveInput());
  const readFailure = new Error("SQLITE_BUSY /secret/path/content.db");
  const { toolExecutor, session } = await boot({ repo, sealer, gateRepo: repoWhoseFindThrows(repo, readFailure) });

  const warn = t.mock.method(console, "warn");
  const result = await callReadThing(toolExecutor);

  assert.equal(result.status, "failed");
  assert.equal(result.errorKind, "validation");
  assert.equal(result.error, `The assistant could not confirm that "${SERVER_ID}" is still allowed, so this call was refused. Try again later.`);
  assert.ok(!(result.error ?? "").includes("SQLITE_BUSY"), "the model text must not leak the underlying read error");
  assert.ok(!(result.error ?? "").includes("/secret/path"), "the model text must not leak a filesystem path");
  assert.equal(session.calls.length, 0);

  assert.ok(
    warn.mock.calls.some((call) => String(call.arguments[0]).includes("SQLITE_BUSY") && String(call.arguments[0]).includes(SERVER_ID)),
    "the read failure's detail must still reach console.warn for an operator to find",
  );
});

test("T1-10: a preset connection with no row still completes", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const sealer = new AesGcmSecretSealer(new InMemoryKeyring());
  const presetConfig: FederatedMcpConnectionConfig = {
    connectionId: "acme-preset",
    label: "Acme Preset",
    allowedToolNames: ["read_thing"],
    writeAllowedToolNames: [],
    connectTimeoutMs: 1_000,
    callTimeoutMs: 1_000,
    maxResultBytes: 4_096,
    maxTools: 8,
  };
  const { toolExecutor, session } = await boot({
    repo,
    sealer,
    presets: [{ config: presetConfig, launch: { url: "https://acme-preset.example/mcp", headers: {} } }],
  });

  const result = await toolExecutor.execute({ id: PRINCIPAL }, { id: "run-1" }, "mcp__acme-preset__read_thing", {});

  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.deepEqual(
    session.calls.map((call) => call.name),
    ["read_thing"],
  );
});
