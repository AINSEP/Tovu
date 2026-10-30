import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError } from "@jini-ai/core";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { ExternalMcpConnectionRevokedError, rosterRefusalFor } from "../external-mcp-revocation.js";
import { type ExternalMcpRevocationReason } from "../contracts.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import { externalMcpAdmissionRevision, saveExternalMcpServer } from "../external-mcp-store.js";
import { type ExternalMcpServerRecord } from "../contracts.js";

/**
 * @file `ExternalMcpConnectionRevokedError`'s operator-facing wording, per revocation reason: each
 * names the connection by its label when it has one (falling back to its id), says what changed,
 * and tells the model not to retry — except `unverifiable`, the one transient reason.
 */

const EXPECTED: Record<ExternalMcpRevocationReason, { labelled: string; unlabelled: string }> = {
  removed: {
    labelled: '"srv" was removed from Integrations → External MCP, so its tools no longer work. Do not retry this tool.',
    unlabelled: '"srv" was removed from Integrations → External MCP, so its tools no longer work. Do not retry this tool.',
  },
  "turned-off": {
    labelled: '"Search" is turned off in Integrations → External MCP. Ask the operator to turn it back on. Do not retry this tool.',
    unlabelled: '"srv" is turned off in Integrations → External MCP. Ask the operator to turn it back on. Do not retry this tool.',
  },
  disconnected: {
    labelled: '"Search" is disconnected in Integrations → External MCP. Ask the operator to reconnect it. Do not retry this tool.',
    unlabelled: '"srv" is disconnected in Integrations → External MCP. Ask the operator to reconnect it. Do not retry this tool.',
  },
  changed: {
    labelled: '"Search" was changed in Integrations → External MCP after the assistant started. Ask the operator to restart the assistant so the change takes effect. Do not retry this tool.',
    unlabelled: '"srv" was changed in Integrations → External MCP after the assistant started. Ask the operator to restart the assistant so the change takes effect. Do not retry this tool.',
  },
  "tool-not-allowed": {
    labelled: '"query" on "Search" is no longer allowed in Integrations → External MCP. Do not retry this tool.',
    unlabelled: '"query" on "srv" is no longer allowed in Integrations → External MCP. Do not retry this tool.',
  },
  "write-not-allowed": {
    labelled: '"query" on "Search" is no longer allowed to make changes in Integrations → External MCP. Do not retry this tool.',
    unlabelled: '"query" on "srv" is no longer allowed to make changes in Integrations → External MCP. Do not retry this tool.',
  },
  unverifiable: {
    labelled: 'The assistant could not confirm that "srv" is still allowed, so this call was refused. Try again later.',
    unlabelled: 'The assistant could not confirm that "srv" is still allowed, so this call was refused. Try again later.',
  },
};

for (const [reason, messages] of Object.entries(EXPECTED) as [ExternalMcpRevocationReason, (typeof EXPECTED)[ExternalMcpRevocationReason]][]) {
  test(`a '${reason}' revocation is a non-retryable input error naming the connection`, () => {
    const labelled = new ExternalMcpConnectionRevokedError({ serverId: "srv", label: "Search", remoteName: "query", reason });
    const unlabelled = new ExternalMcpConnectionRevokedError({ serverId: "srv", label: null, remoteName: "query", reason });
    assert.equal(labelled.message, messages.labelled);
    assert.equal(unlabelled.message, messages.unlabelled);
    assert.ok(labelled instanceof ToolInputError);
    assert.equal(labelled.name, "ExternalMcpConnectionRevokedError");
    assert.equal(labelled.code, "EXTERNAL_MCP_CONNECTION_REVOKED");
    assert.equal(labelled.retryable, false);
    assert.equal(labelled.serverId, "srv");
    assert.equal(labelled.reason, reason);
  });
}

// ---------------------------------------------------------------------------
// rosterRefusalFor — the call-time re-check of an admitted federated tool against the live row
// ---------------------------------------------------------------------------

async function storedRecord(input: { authMode: "none" | "oauth"; allowed: string; writeAllowed: string }): Promise<ExternalMcpServerRecord> {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const clock = { nowMs: () => Date.parse("2026-09-02T00:00:00.000Z"), nowIso: () => "2026-09-02T00:00:00.000Z" };
  await saveExternalMcpServer({ repo, sealer: new AesGcmSecretSealer(keyring), keyring, clock }, {
    workspaceId: "workspace-1", serverId: "srv", label: "Search", transport: "streamable_http", authMode: input.authMode,
    enabled: true, command: "", url: "https://mcp.example.test/v1", args: "",
    allowedToolNames: input.allowed, writeAllowedToolNames: input.writeAllowed, principalId: "owner",
    ...(input.authMode === "oauth" ? { oauth: { providerId: "example", grant: "authorization_code", clientId: "client", clientSecret: ["s", "e", "c"].join(""), scopes: "read" } } : {}),
  });
  const record = await repo.findByServerId({ workspaceId: "workspace-1", serverId: "srv" });
  assert.ok(record);
  return record;
}

function callFor(record: ExternalMcpServerRecord, remoteName: string, readOnlyHint?: boolean) {
  return { remoteName, ...(readOnlyHint === undefined ? {} : { declaredAnnotations: { readOnlyHint } }),
    origin: { kind: "roster" as const, admissionRevision: externalMcpAdmissionRevision(record) } };
}

test("rosterRefusalFor refuses an unprovenanced or preset call as unverifiable", async () => {
  const record = await storedRecord({ authMode: "none", allowed: "query", writeAllowed: "" });
  assert.equal(rosterRefusalFor(record, { remoteName: "query" } as never), "unverifiable");
  assert.equal(rosterRefusalFor(record, { remoteName: "query", origin: { kind: "preset" } } as never), "unverifiable");
});

test("rosterRefusalFor names a removed, changed, or turned-off connection", async () => {
  const record = await storedRecord({ authMode: "none", allowed: "query", writeAllowed: "" });
  const call = callFor(record, "query", true);
  assert.equal(rosterRefusalFor(null, call as never), "removed");
  assert.equal(rosterRefusalFor({ ...record, url: "https://elsewhere.example.test/v1" }, call as never), "changed");
  assert.equal(rosterRefusalFor({ ...record, enabled: false }, call as never), "turned-off");
});

test("rosterRefusalFor refuses a freshly saved (never authorized) OAuth connection as disconnected", async () => {
  const record = await storedRecord({ authMode: "oauth", allowed: "query", writeAllowed: "" });
  assert.equal(rosterRefusalFor(record, callFor(record, "query", true) as never), "disconnected");
});

test("rosterRefusalFor passes an allowlisted read tool, refuses a write tool with no write grant, and refuses one no longer allowlisted", async () => {
  const record = await storedRecord({ authMode: "none", allowed: "query", writeAllowed: "" });
  assert.equal(rosterRefusalFor(record, callFor(record, "query", true) as never), null);
  // "May write" is a grant: a tool the remote declares as a write needs the write list.
  assert.equal(rosterRefusalFor(record, callFor(record, "query", false) as never), "write-not-allowed");
  assert.equal(rosterRefusalFor(record, callFor(record, "drop_table", true) as never), "tool-not-allowed");
  const granted = await storedRecord({ authMode: "none", allowed: "query", writeAllowed: "query" });
  assert.equal(rosterRefusalFor(granted, callFor(granted, "query", false) as never), null);
});
