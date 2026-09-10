import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createToolRegistry, type SurfaceEmission } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import {
  EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID,
  buildExternalMcpReauthRegistrations,
} from "../external-mcp-reauth-tool.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import { saveExternalMcpServer } from "../external-mcp-store.js";
import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import {
  SURFACE_EXCHANGE_ID_PARAM,
  createSurfaceExchangeStore,
  type SurfaceExchangeStore,
} from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file Regression coverage for the re-auth surface (`external-mcp-reauth-tool.ts`) — the class of
 * bug the dispatch that built this file warns has shipped twice already (`assistant_ask_choice`,
 * `custom_credential_set_token`): a form/dialog renders correctly, but its submission 403s because
 * the tool id was never added to `MCP_UI_REDEEMABLE_TOOL_IDS`.
 *
 * Everything here runs against a SYNTHETIC connection in an in-memory repo — never the real
 * `content.db`, and never the live `higgsfield` row. `saveExternalMcpServer`/
 * `InMemoryExternalMcpServerRepo` are the same fixtures `external-mcp-oauth.test.ts` already uses for
 * this exact purpose.
 *
 * The property asserted is the REAL one, not the weaker "a status field changed": that an
 * expired-token connection raises the re-auth surface (a real `SurfaceEmission` is emitted, naming
 * the server), AND that the tool id is redeemable — a real HTTP round trip through
 * `mcp-ui-tool-calls-route.ts` returns 202, not the 403 `TOOL_NOT_ALLOWLISTED` an omitted id produces.
 *
 * Written and run against the pre-change code first (`external_mcp_reauth_prompt` absent from
 * `MCP_UI_REDEEMABLE_TOOL_IDS`), where "the redemption is not refused as unallowlisted" fails with
 * exactly that 403 — the required RED evidence for this dispatch's allowlist addition.
 */

const WORKSPACE = "workspace-1";
const SERVER_ID = "higgsfield-test";
const PRINCIPAL = "principal-admin-1";

async function makeOAuthServerFixture(status: "needs_reauth" | "connected" = "needs_reauth") {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowIso: () => "2026-09-02T00:00:00.000Z" };

  await saveExternalMcpServer(
    { repo, sealer, keyring, clock },
    {
      workspaceId: WORKSPACE,
      serverId: SERVER_ID,
      label: "Higgsfield (test)",
      transport: "streamable_http",
      authMode: "oauth",
      enabled: true,
      command: "",
      url: "https://mcp.example.com/v1",
      args: "",
      allowedToolNames: "generate_video",
      writeAllowedToolNames: "",
      principalId: PRINCIPAL,
      oauth: {
        providerId: "higgsfield",
        grant: "authorization_code",
        clientId: "tovu-client",
        clientSecret: "s3cr3t",
        scopes: "video:generate",
      },
    },
  );

  // `saveExternalMcpServer` always writes a fresh row as `disconnected` — move it into the state
  // under test directly on the repo, mirroring how `reportAuthFailure` marks a row durable.
  const record = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER_ID });
  assert.ok(record, "fixture setup: the row must exist immediately after saveExternalMcpServer");
  await repo.upsert({ ...record, oauthStatus: status });

  return repo;
}

/** Builds the real tool surface: one registry, one production-shaped executor (no `delegate`, no
 *  mocks) over the real `external_mcp_reauth_prompt` handler — same construction
 *  `mcp-ui-tool-calls-route.ask-choice.integration.test.ts` uses for its own tool. */
function buildRealReauthToolExecutor(repo: InMemoryExternalMcpServerRepo, surfaceExchanges: SurfaceExchangeStore) {
  const registry = createToolRegistry();
  for (const registration of buildExternalMcpReauthRegistrations({ workspaceId: WORKSPACE, externalMcpServerRepo: repo }, { surfaceExchanges })) {
    registry.register(registration);
  }
  return createToolExecutor({ registry });
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — the way the rendered iframe would. */
function exchangeIdFromEmission(emission: SurfaceEmission): string {
  const resource = (emission.payload as { resource?: { resource?: { text?: string } } }).resource;
  const html = resource?.resource?.text ?? "";
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the administrator's acknowledgement has nothing to name");
  return match[1]!;
}

test("an expired-token connection raises the re-auth surface, naming the server", async () => {
  const repo = await makeOAuthServerFixture("needs_reauth");
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealReauthToolExecutor(repo, surfaceExchanges);

  const emitted: SurfaceEmission[] = [];
  const pending = toolExecutor.execute(
    { id: PRINCIPAL },
    { id: "run-1" },
    EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID,
    { id: SERVER_ID },
    undefined,
    async (emission: SurfaceEmission) => {
      emitted.push(emission);
    },
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(emitted.length, 1, "the notice must be emitted before the call parks");
  const html = (emitted[0]!.payload as { resource?: { resource?: { text?: string } } }).resource?.resource?.text ?? "";
  assert.match(html, /Higgsfield \(test\)/, "the dialog must name the actual server, not a generic message");
  assert.match(html, /Settings.*External MCP/, "the dialog must point at the existing Settings authorize flow");

  // Deliver the acknowledgement so the parked call resolves and the test does not leak a timer.
  const exchangeId = exchangeIdFromEmission(emitted[0]!);
  const delivered = surfaceExchanges.deliver({ exchangeId, params: {}, toolId: EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID, principalId: PRINCIPAL });
  assert.equal(delivered.ok, true);
  const executed = await pending;
  assert.equal(executed.status, "completed");
  assert.deepEqual(executed.output, {
    promptShown: true,
    acknowledged: true,
    serverId: SERVER_ID,
    label: "Higgsfield (test)",
    currentStatus: "needs_reauth",
    note:
      "The administrator acknowledged the reconnect notice for \"Higgsfield (test)\". Its status is still " +
      "'needs_reauth' — ask them to confirm they finished in Settings → External MCP before retrying, or " +
      "call this tool again once they say they have.",
  });
});

test("real round trip: an mcp-ui acknowledgement of external_mcp_reauth_prompt's dialog is redeemed, not refused as unallowlisted", async (t) => {
  const repo = await makeOAuthServerFixture("needs_reauth");
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealReauthToolExecutor(repo, surfaceExchanges);

  const emitted: SurfaceEmission[] = [];
  const pending = toolExecutor.execute(
    { id: PRINCIPAL },
    { id: "run-1" },
    EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID,
    { id: SERVER_ID },
    undefined,
    async (emission: SurfaceEmission) => {
      emitted.push(emission);
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1);
  const exchangeId = exchangeIdFromEmission(emitted[0]!);

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({
      toolName: EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId },
    }),
  });

  // This is the exact failure class the dispatch warns has shipped twice: a 403 with this body,
  // raised by `mcp-ui-tool-calls-route.ts`'s own `isMcpUiToolCallAllowed` gate before the exchange
  // delivery is ever reached — i.e. before `external_mcp_reauth_prompt` was added to
  // `MCP_UI_REDEEMABLE_TOOL_IDS`.
  const body = (await res.json()) as { delivered?: boolean; error?: string; code?: string };
  assert.equal(res.status, 202, `expected the delivery to be accepted, not refused as unallowlisted: ${JSON.stringify(body)}`);
  assert.equal(body.delivered, true);

  const executed = await pending;
  assert.equal(executed.status, "completed", `parked call must resolve completed: ${JSON.stringify(executed)}`);
  const output = executed.output as { acknowledged?: boolean; serverId?: string };
  assert.equal(output.acknowledged, true);
  assert.equal(output.serverId, SERVER_ID);
});

test("degrades to the existing terminal error when the connection is not OAuth-authenticated, rather than raising a broken dialog", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowIso: () => "2026-09-02T00:00:00.000Z" };
  await saveExternalMcpServer(
    { repo, sealer, keyring, clock },
    {
      workspaceId: WORKSPACE,
      serverId: "static-server",
      label: "Static server",
      transport: "stdio",
      authMode: "static_env",
      enabled: true,
      command: "npx",
      args: "",
      allowedToolNames: "",
      writeAllowedToolNames: "",
      principalId: PRINCIPAL,
    },
  );

  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealReauthToolExecutor(repo, surfaceExchanges);
  const executed = await toolExecutor.execute({ id: PRINCIPAL }, { id: "run-1" }, EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID, { id: "static-server" });

  assert.equal(executed.status, "failed");
  assert.match(executed.error ?? "", /does not use OAuth authorization/);
  assert.equal(surfaceExchanges.size(), 0, "no dialog, and therefore no exchange, may be left open for a connection with nothing to reconnect");
});

test("degrades to the existing terminal error when the connection does not exist", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealReauthToolExecutor(repo, surfaceExchanges);
  const executed = await toolExecutor.execute({ id: PRINCIPAL }, { id: "run-1" }, EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID, { id: "no-such-server" });

  assert.equal(executed.status, "failed");
  assert.match(executed.error ?? "", /is disconnected/);
  assert.match(executed.error ?? "", /Do not retry this tool/);
});

test("idempotent under two concurrent failures for the SAME connection: only one exchange opens", async () => {
  const repo = await makeOAuthServerFixture("needs_reauth");
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealReauthToolExecutor(repo, surfaceExchanges);

  const emittedA: SurfaceEmission[] = [];
  const emittedB: SurfaceEmission[] = [];
  const callA = toolExecutor.execute({ id: PRINCIPAL }, { id: "run-a" }, EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID, { id: SERVER_ID }, undefined, async (e) => {
    emittedA.push(e);
  });
  const callB = toolExecutor.execute({ id: PRINCIPAL }, { id: "run-b" }, EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID, { id: SERVER_ID }, undefined, async (e) => {
    emittedB.push(e);
  });

  // Let A open its exchange first (module-level `Set` check happens synchronously before any await
  // inside the handler, so ordering here is deterministic within one microtask flush).
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(emittedA.length, 1, "the first call must raise a dialog");
  assert.equal(emittedB.length, 0, "the second call must NOT raise a second dialog for the same connection");
  assert.equal(surfaceExchanges.size(), 1, "exactly one exchange may be open for this connection at a time");

  // B must resolve immediately with an "already showing" result rather than hang waiting on an
  // exchange it never opened.
  const resultB = await callB;
  assert.equal(resultB.status, "completed");
  assert.deepEqual(resultB.output, {
    promptShown: false,
    alreadyShowing: true,
    serverId: SERVER_ID,
    label: "Higgsfield (test)",
    note: 'A reconnect notice for "Higgsfield (test)" is already showing. Do not open another — wait for the administrator to answer that one.',
  });

  // Clean up A's still-open exchange so the process has nothing left pending.
  const exchangeId = exchangeIdFromEmission(emittedA[0]!);
  surfaceExchanges.deliver({ exchangeId, params: {}, toolId: EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID, principalId: PRINCIPAL });
  await callA;
});

// ---------------------------------------------------------------------------
// 500-redact defect (RED->GREEN): `parseReauthServerId` used to reject a missing/non-string `id`
// with a bare `Error`, which `@jini-ai/daemon`'s `ToolExecutor` tags `errorKind: 'internal'` —
// exactly the classification `@jini-ai/http-kit`'s `delegatedToolExecuteRoute` SEC-005-redacts into
// a message-stripped 500. It now throws `ToolInputError`, mirroring
// `features/post/tool-registrations.ts`'s fix shape. Asserted through the real `ToolExecutor` this
// file's other tests already drive — `errorKind` is the exact field the wire-level 400/500 split
// reads.
// ---------------------------------------------------------------------------

test("external_mcp_reauth_prompt called with no 'id' fails with errorKind 'validation' (400), not a redacted 'internal' (500)", async () => {
  const repo = await makeOAuthServerFixture("needs_reauth");
  const surfaceExchanges = createSurfaceExchangeStore();
  const toolExecutor = buildRealReauthToolExecutor(repo, surfaceExchanges);

  const executed = await toolExecutor.execute({ id: PRINCIPAL }, { id: "run-1" }, EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID, {}, undefined, async () => {});

  assert.equal(executed.status, "failed");
  assert.equal(executed.errorKind, "validation", `expected 'validation', got ${JSON.stringify(executed)}`);
  assert.match(executed.error ?? "", /'id' is required/);
});
