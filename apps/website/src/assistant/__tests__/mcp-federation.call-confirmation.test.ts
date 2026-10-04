import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import type { ToolExecutor } from "@jini-ai/daemon";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import {
  SURFACE_EXCHANGE_ID_PARAM,
  createSurfaceExchangeStore,
  type SurfaceExchangeStore,
} from "../../contracts/core/tool-surface-exchanges.js";
import { buildFederatedCallConfirmSpec, createFederatedCallConfirmer } from "../external-mcp-call-confirmation.js";
import { InMemoryMcpSession } from "../mcp-federation/adapter.memory.js";
import type { FederatedMcpConnectionConfig, RemoteToolDescriptor } from "../mcp-federation/ports.js";
import { buildFederatedMcpRegistrations, type FederationDeps } from "../mcp-federation/registrations.js";
import * as shared from "@jini-ai/mcp/federation";
import { admitRemoteTools } from "@jini-ai/mcp/federation";
import { isMcpUiToolCallPermitted } from "../mcp-ui-tool-calls.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";

// The trust tier moved to @jini-ai/mcp/federation; this wrapper keeps the original positional call
// so the assertions below are unchanged.
const refusalForAdmittedToolUnderCurrentGrants = (
  tool: Parameters<typeof shared.refusalForAdmittedToolUnderCurrentGrants>[0]["tool"],
  grants: Parameters<typeof shared.refusalForAdmittedToolUnderCurrentGrants>[0]["grants"],
) => shared.refusalForAdmittedToolUnderCurrentGrants({ tool, grants });

/**
 * @file G3: the one approval rule for every federated (external MCP / agent plugin) tool.
 *
 * - A tool the server marks read-only (`readOnlyHint: true`, `destructiveHint` not true) runs as it
 *   always did.
 * - Every other tool — a write, a destructive tool, or one with no hints at all — is admitted from the
 *   operator allowlist, but each call waits on a Confirm/Cancel card, and nothing reaches the remote
 *   until a human clicks Confirm. `destructiveHint: true` gets the stronger, danger-styled card.
 * - Hints only ever ADD friction. The allowlist still decides what exists at all.
 *
 * The security properties, each pinned below: an unconfirmed call never reaches the remote; the
 * card's displayed arguments are exactly what gets sent; one confirmation authorizes exactly one
 * call; a tool not on the operator allowlist stays refused.
 */

const PRINCIPAL_ID = "principal-g3";
const SCHEMA = { type: "object", properties: { query: { type: "string" }, project_id: { type: "string" } } } as const;
/** A read-only tool's inputs: nothing write-shaped (`query`, `sql`, …), which would always ask. */
const READ_SCHEMA = { type: "object", properties: { project_id: { type: "string" } } } as const;

const CONFIG: FederatedMcpConnectionConfig = {
  connectionId: "supabase",
  label: "Supabase",
  allowedToolNames: ["list_tables", "execute_sql", "create_project", "get_advisors", "both_hints"],
  writeAllowedToolNames: [],
  connectTimeoutMs: 1_000,
  callTimeoutMs: 1_000,
  maxResultBytes: 4_096,
  maxTools: 16,
};

const TOOLS: RemoteToolDescriptor[] = [
  { name: "list_tables", description: "Lists tables.", inputSchema: READ_SCHEMA, annotations: { readOnlyHint: true } },
  { name: "execute_sql", description: "Runs SQL.", inputSchema: SCHEMA, annotations: { readOnlyHint: false, destructiveHint: true } },
  { name: "create_project", description: "Creates a project.", inputSchema: SCHEMA, annotations: { readOnlyHint: false } },
  { name: "get_advisors", description: "Advisors.", inputSchema: SCHEMA },
  { name: "both_hints", description: "Claims both.", inputSchema: SCHEMA, annotations: { readOnlyHint: true, destructiveHint: true } },
  { name: "drop_everything", description: "Not allowlisted.", inputSchema: SCHEMA, annotations: { destructiveHint: true } },
];

function admitted(name: string) {
  const tool = admitRemoteTools({ tools: TOOLS, config: CONFIG }).admitted.find((entry) => entry.remoteName === name);
  assert.ok(tool, `expected '${name}' to be admitted`);
  return tool;
}

// ---------------------------------------------------------------------------
// Admission (trust.ts): the allowlist decides WHETHER; hints decide only how much friction.
// ---------------------------------------------------------------------------

test("G3 admission: a destructiveHint tool on the operator allowlist is admitted behind a destructive confirmation", () => {
  assert.equal(admitted("execute_sql").confirmation, "confirm-destructive");
});

test("G3 admission: a ordinary write remains admitted without a card", () => {
  assert.equal(admitted("create_project").confirmation, "none");
});

test("G3 admission: a tool without hints is admitted without a card but gains no read-only permission", () => {
  assert.equal(admitted("get_advisors").confirmation, "none");
});

test("G3 admission: a server-marked read-only tool runs with no confirmation", () => {
  assert.equal(admitted("list_tables").confirmation, "none");
});

test("G3 admission: readOnlyHint:true cannot cancel destructiveHint:true — hints only add friction", () => {
  assert.equal(admitted("both_hints").confirmation, "confirm-destructive");
});

test("G3 admission: a destructive tool NOT on the operator allowlist stays refused, reason not-in-operator-allowlist", () => {
  const report = admitRemoteTools({ tools: TOOLS, config: CONFIG });
  assert.deepEqual(
    report.refused.find((entry) => entry.remoteName === "drop_everything"),
    { remoteName: "drop_everything", reason: "not-in-operator-allowlist" },
  );
});

test("G3 per-call grants: an allowlisted destructive tool is not refused; removed from the allowlist it is", () => {
  const tool = { remoteName: "execute_sql", declaredAnnotations: { readOnlyHint: false, destructiveHint: true } };
  assert.equal(refusalForAdmittedToolUnderCurrentGrants(tool, { allowedToolNames: ["execute_sql"], writeAllowedToolNames: [] }), null);
  assert.equal(
    refusalForAdmittedToolUnderCurrentGrants(tool, { allowedToolNames: ["list_tables"], writeAllowedToolNames: [] }),
    "not-in-operator-allowlist",
  );
});

// ---------------------------------------------------------------------------
// The per-call card (registrations.ts handler + external-mcp-call-confirmation.ts).
// ---------------------------------------------------------------------------

interface Harness {
  readonly store: SurfaceExchangeStore;
  readonly sent: { name: string; args: Record<string, unknown> }[];
  registration(name: string): ToolRegistration;
}

function harness(options: { store?: SurfaceExchangeStore; withConfirmer?: boolean } = {}): Harness {
  const store = options.store ?? createSurfaceExchangeStore();
  const sent: { name: string; args: Record<string, unknown> }[] = [];
  const session = new InMemoryMcpSession({
    tools: TOOLS,
    onCall: (name, args) => {
      sent.push({ name, args: JSON.parse(JSON.stringify(args)) as Record<string, unknown> });
      return { content: [{ type: "text", text: `ran ${name}` }] };
    },
  });
  const deps: FederationDeps = {
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: "ws-g3",
    ...(options.withConfirmer === false ? {} : { confirmCall: createFederatedCallConfirmer({ surfaceExchanges: store }) }),
  };
  const { registrations } = buildFederatedMcpRegistrations({ tools: TOOLS, session, config: CONFIG, deps, nativeToolIds: new Set() });
  return {
    store,
    sent,
    registration(name) {
      const found = registrations.find((entry) => entry.descriptor.id === `mcp__supabase__${name}`);
      assert.ok(found, `expected a registration for ${name}`);
      return found;
    },
  };
}

interface Card {
  readonly exchangeId: string;
  readonly html: string;
  /** The `<dt>`/`<dd>` rows exactly as the human reads them, unescaped. */
  readonly details: readonly { label: string; value: string }[];
}

function unescapeHtml(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function readCard(emission: unknown): Card {
  const resource = (emission as { payload: { resource: { resource: { text?: string } } } }).payload.resource;
  const html = resource.resource.text ?? "";
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the card must carry its exchange id");
  const details = [...html.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map((row) => ({
    label: unescapeHtml(row[1] ?? ""),
    value: unescapeHtml(row[2] ?? ""),
  }));
  return { exchangeId: match[1] ?? "", html, details };
}

function call(
  h: Harness,
  name: string,
  input: unknown,
  options: { emit?: boolean; signal?: AbortSignal } = {},
): { pending: Promise<unknown>; cards: unknown[] } {
  const cards: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (surface) => void cards.push(surface);
  const ctx = {
    executionId: `exec-${Math.random()}`,
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-g3" },
    input,
    signal: options.signal ?? new AbortController().signal,
    ...(options.emit === false ? {} : { emitSurface }),
  } as ToolExecutionContext;
  return { pending: h.registration(name).handler(ctx), cards };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function answer(h: Harness, card: Card, name: string, decision: "confirm" | "cancel") {
  return h.store.deliver({ exchangeId: card.exchangeId, params: { decision }, principalId: PRINCIPAL_ID, toolId: `mcp__supabase__${name}` });
}

test("G3 card: an unconfirmed call never reaches the remote — nothing is sent while the card waits, one call after Confirm", async () => {
  const h = harness();
  const { pending, cards } = call(h, "execute_sql", { project_id: "ppnxclfntfaoocrvipht", query: "drop table g3" });
  await tick();

  assert.equal(cards.length, 1, "a confirmation card is shown before anything runs");
  assert.deepEqual(h.sent, [], "nothing reached the remote while the card is waiting");

  assert.deepEqual(answer(h, readCard(cards[0]), "execute_sql", "confirm"), { ok: true });
  await pending;
  assert.deepEqual(h.sent, [{ name: "execute_sql", args: { project_id: "ppnxclfntfaoocrvipht", query: "drop table g3" } }]);
});

test("G3 card: Cancel sends nothing and tells the model in words", async () => {
  const h = harness();
  const { pending, cards } = call(h, "execute_sql", { query: "drop table g3" });
  await tick();
  answer(h, readCard(cards[0]), "execute_sql", "cancel");

  assert.deepEqual(await pending, {
    federated: { connectionId: "supabase", tool: "execute_sql" },
    ran: false,
    cancelled: true,
    note: "The user cancelled. Nothing was changed.",
  });
  assert.deepEqual(h.sent, []);
});

test("G3 card: an expired card sends nothing and says it expired", async () => {
  const h = harness({ store: createSurfaceExchangeStore({ idleTtlMs: 20 }) });
  const { pending, cards } = call(h, "execute_sql", { query: "drop table demo" });

  assert.deepEqual(await pending, {
    federated: { connectionId: "supabase", tool: "execute_sql" },
    ran: false,
    cancelled: false,
    reason: "expired",
    note: "The user did not answer the confirmation dialog before it expired. Nothing was changed.",
  });
  assert.equal(cards.length, 1);
  assert.deepEqual(h.sent, []);
});

test("G3 card: a run that ends while the card waits sends nothing", async () => {
  const h = harness();
  const abort = new AbortController();
  const { pending } = call(h, "execute_sql", { query: "delete from t" }, { signal: abort.signal });
  await tick();
  abort.abort();

  const result = (await pending) as { ran: boolean; reason: string };
  assert.equal(result.ran, false);
  assert.equal(result.reason, "abandoned");
  assert.deepEqual(h.sent, []);
});

test("G3 card: the displayed arguments are exactly what is sent — mutating the input after the card is shown changes nothing", async () => {
  const h = harness();
  const input = { project_id: "ppnxclfntfaoocrvipht", query: "drop table g3_smoke_test" };
  const { pending, cards } = call(h, "execute_sql", input);
  await tick();
  const card = readCard(cards[0]);

  // A swap attempt between display and execution: the object the model handed in is changed after
  // the human has seen the card.
  input.query = "drop schema public cascade";
  answer(h, card, "execute_sql", "confirm");
  await pending;

  assert.deepEqual(card.details, [
    { label: "Service", value: "Supabase" },
    { label: "Tool", value: "execute_sql" },
    { label: "project_id", value: "ppnxclfntfaoocrvipht" },
    { label: "query", value: "drop table g3_smoke_test" },
  ]);
  assert.deepEqual(h.sent, [
    { name: "execute_sql", args: { project_id: "ppnxclfntfaoocrvipht", query: "drop table g3_smoke_test" } },
  ]);
});

test("G3 card: one confirmation authorizes exactly one call — a second call gets its own card, and re-sending the first Confirm is refused", async () => {
  const h = harness();
  const first = call(h, "execute_sql", { query: "delete from t where id = 1" });
  await tick();
  const firstCard = readCard(first.cards[0]);
  answer(h, firstCard, "execute_sql", "confirm");
  await first.pending;

  const second = call(h, "execute_sql", { query: "delete from t where id = 2" });
  await tick();
  assert.equal(second.cards.length, 1, "the second call shows its own card");
  const secondCard = readCard(second.cards[0]);
  assert.notEqual(secondCard.exchangeId, firstCard.exchangeId);

  assert.deepEqual(answer(h, firstCard, "execute_sql", "confirm"), { ok: false, reason: "unknown-or-closed" });
  await tick();
  assert.deepEqual(h.sent.map((entry) => entry.args["query"]), ["delete from t where id = 1"], "the replayed Confirm ran nothing");

  answer(h, secondCard, "execute_sql", "cancel");
  await second.pending;
  assert.equal(h.sent.length, 1);
});

test("G3 card: another principal or tool cannot confirm the call", async () => {
  const h = harness();
  const { pending, cards } = call(h, "execute_sql", { query: "drop table g3" });
  await tick();
  const card = readCard(cards[0]);
  try {
    for (const binding of [
      { principalId: "another-admin", toolId: "mcp__supabase__execute_sql" },
      { principalId: PRINCIPAL_ID, toolId: "mcp__supabase__create_project" },
    ]) {
      assert.deepEqual(h.store.deliver({ exchangeId: card.exchangeId, params: { decision: "confirm" }, ...binding }),
        { ok: false, reason: "binding-mismatch" });
      await tick();
      assert.deepEqual(h.sent, []);
      assert.equal(h.store.size(), 1, "a mismatched answer leaves the legitimate call parked");
    }
  } finally {
    answer(h, card, "execute_sql", "cancel");
    await pending;
  }
  assert.deepEqual(h.sent, []);
});

test("G3 card: destructive tools get the danger-styled card with the stronger warning; plain writes do not", async () => {
  const base = { toolId: "mcp__supabase__x", remoteName: "execute_sql", connectionId: "supabase", connectionLabel: "Supabase", arguments: {}, declaredAnnotations: undefined, origin: undefined, description: "", inputSchema: {}, writeShapedInputs: [] };
  const destructive = buildFederatedCallConfirmSpec({ ...base, destructive: true });
  const write = buildFederatedCallConfirmSpec({ ...base, remoteName: "create_project", destructive: false });

  assert.equal(destructive.title, "Run execute_sql on Supabase?");
  assert.equal(destructive.danger, true);
  assert.equal(
    destructive.warning,
    "Supabase marks this tool as destructive: it can delete or overwrite data, and that may not be undoable.",
  );
  assert.equal(write.title, "Run create_project on Supabase?");
  assert.equal(write.danger, false);
  assert.equal(write.warning, "This can change things in Supabase.");

  // And the live card really carries it.
  const h = harness();
  const { pending, cards } = call(h, "execute_sql", { query: "drop table g3" });
  await tick();
  const card = readCard(cards[0]);
  answer(h, card, "execute_sql", "cancel");
  await pending;
  assert.ok(card.html.includes("Supabase marks this tool as destructive: it can delete or overwrite data, and that may not be undoable."));
});

test("G3 card: a server-marked read-only tool runs with no card", async () => {
  const h = harness();
  const { pending, cards } = call(h, "list_tables", {});
  await pending;
  assert.equal(cards.length, 0);
  assert.deepEqual(h.sent, [{ name: "list_tables", args: {} }]);
});

test("G3 card: with no way to ask a human (no emitSurface), a confirm-gated tool is refused and nothing is sent", async () => {
  const h = harness();
  await assert.rejects(
    () => call(h, "execute_sql", { query: "drop table g3" }, { emit: false }).pending,
    {
      message:
        "EXTERNAL_MCP_NO_CONFIRMATION_CHANNEL: mcp__supabase__execute_sql: this execution context has no interactive " +
        "confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.",
    },
  );
  assert.deepEqual(h.sent, []);
});

test("G3 card: a composition root that wires no confirmer refuses every confirm-gated tool and sends nothing", async () => {
  const h = harness({ withConfirmer: false });
  await assert.rejects(() => call(h, "execute_sql", {query: "drop table g3"}).pending, {
    message:
      "EXTERNAL_MCP_NO_CONFIRMATION_CHANNEL: mcp__supabase__execute_sql: this protected action requires confirmation, " +
      "and nothing here can ask a person. Nothing was sent.",
  });
  assert.deepEqual(h.sent, []);
});

// ---------------------------------------------------------------------------
// The click route: a federated id may ANSWER an open card, never be executed by the route.
// ---------------------------------------------------------------------------

test("G3 route rule: a federated id is permitted only as an answer to an open card", () => {
  assert.equal(isMcpUiToolCallPermitted("mcp__supabase__execute_sql", true), true);
  assert.equal(isMcpUiToolCallPermitted("mcp__supabase__execute_sql", false), false);
  assert.equal(isMcpUiToolCallPermitted("identity_user_delete_everything", true), false);
  // A native redeemable id needs no open card. (`content_post_delete` left the redeemable set in
  // 6eac86229 when deletion became a reversible trash move; `settings_set_value` is still on it.)
  assert.equal(isMcpUiToolCallPermitted("settings_set_value", false), true);
});

function refusingExecutor(): { executor: ToolExecutor; executed: string[] } {
  const executed: string[] = [];
  return {
    executed,
    executor: {
      execute: async ({ toolId }) => {
        executed.push(toolId);
        return { executionId: "x", status: "completed", output: {} };
      },
      resumeConfirmation: () => undefined,
      cancel: () => undefined,
      getAuditRecord: () => null,
    },
  };
}

test("G3 route: a federated tool call with no exchange is refused 403 and never executed", async (t) => {
  const { executor, executed } = refusingExecutor();
  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor: executor, surfaceExchanges: createSurfaceExchangeStore() });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL_ID },
    body: JSON.stringify({ toolName: "mcp__supabase__execute_sql", params: { query: "drop table g3" } }),
  });

  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), {
    error: "'mcp__supabase__execute_sql' is not an MCP-UI-redeemable tool",
    code: "TOOL_NOT_ALLOWLISTED",
  });
  assert.deepEqual(executed, []);
});

test("G3 route: Confirm on an open federated card is delivered (202) and the held call runs once", async (t) => {
  const h = harness();
  const { executor, executed } = refusingExecutor();
  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor: executor, surfaceExchanges: h.store });
  const baseUrl = await startTestServer(app, t);

  const { pending, cards } = call(h, "execute_sql", { query: "drop table g3" });
  await tick();
  const card = readCard(cards[0]);
  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL_ID },
    body: JSON.stringify({
      toolName: "mcp__supabase__execute_sql",
      params: { [SURFACE_EXCHANGE_ID_PARAM]: card.exchangeId, decision: "confirm" },
    }),
  });
  await pending;

  assert.equal(res.status, 202);
  assert.deepEqual(executed, [], "the route delivered the answer; it executed nothing itself");
  assert.deepEqual(h.sent, [{ name: "execute_sql", args: { query: "drop table g3" } }]);
});
