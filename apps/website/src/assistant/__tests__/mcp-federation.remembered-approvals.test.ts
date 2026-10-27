import assert from "node:assert/strict";
import { createLiveRunTracker, type LiveRunTracker } from "../agent-session-preset.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { openChatDb } from "../../platform/db/sqlite/chat-db.js";
import { buildFederatedCallConfirmSpec, createFederatedCallConfirmer } from "../external-mcp-call-confirmation.js";
import * as shared from "@jini-ai/mcp/federation";
import type { FederatedToolIdentity } from "@jini-ai/mcp/federation";
import { InMemoryExternalMcpToolApprovalRepo, createInMemoryConversationToolApprovalStore } from "../external-mcp-tool-approval-adapters.js";
import type { ConversationToolApprovalStore, ExternalMcpToolApprovalRepoPort } from "../external-mcp-tool-approval-ports.js";
import { InMemoryMcpSession } from "../mcp-federation/adapter.memory.js";
import type { FederatedMcpConnectionConfig, RemoteToolDescriptor } from "@jini-ai/mcp/federation";
import { TOVU_MCP_APPROVAL_FINGERPRINT_DOMAIN } from "../mcp-federation/presets.js";
import { buildFederatedMcpRegistrations, type FederationDeps } from "../mcp-federation/registrations.js";
import { createSqliteConversationToolApprovalStore } from "../persistence/conversation-tool-approval-store.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


// These wrappers bind Jini approval policy to Tovu's fingerprint domain and call contract.
const federatedToolApprovalFingerprint = (identity: FederatedToolIdentity) =>
  shared.federatedToolApprovalFingerprint({ identity, fingerprintDomain: TOVU_MCP_APPROVAL_FINGERPRINT_DOMAIN });
const describeFederatedTool = ({ remoteDescription, ...required }: { label: string; remoteName: string; remoteDescription?: string | undefined }) =>
  shared.describeFederatedTool(required, { remoteDescription });

/**
 * @file G3 remembered approvals (owner rule 2026-09-27): the card's Allow / Allow for this chat /
 * Always allow / Cancel, and what each remembers.
 *
 * - Allow runs this one call and remembers nothing.
 * - Allow for this chat stops asking for this tool in this conversation only, and survives a restart
 *   (kept in chat.db with the conversation).
 * - Always allow stops asking for this tool on this connection for the whole site, and can be revoked.
 * - A destructive tool offers neither remember choice, and no remembered approval skips its card
 *   (r4-mcp-federation BEHAVIOR-CHANGES "Destructive cards/grants"). The chat cases below therefore
 *   use `assistant_set_instructions`, which retains Jini's protected-action card without Tovu's
 *   mandatory per-call delivery/publication rule (c20232846, 6d3998810).
 * - Any remembered approval stops applying when the tool's server, name or hints change.
 */

const WORKSPACE_ID = "ws-g3r";
const PRINCIPAL_ID = "principal-g3r";
const OTHER_PRINCIPAL_ID = "principal-other";
// Owner 2026-10-07: delivery always asks; query/sql names alone do not require approval
// (`mcp-federation.extra-approval-checks.test.ts`).
const SCHEMA = { type: "object", properties: { project_id: { type: "string" }, name: { type: "string" } } } as const;

const CONFIG: FederatedMcpConnectionConfig = {
  connectionId: "supabase",
  label: "Supabase",
  allowedToolNames: ["delete_project", "assistant_set_instructions", "send_message"],
  // "May write" granted: these tests are about remembered approvals, not the write grant (fed-security).
  writeAllowedToolNames: ["delete_project", "assistant_set_instructions", "send_message"],
  connectTimeoutMs: 1_000,
  callTimeoutMs: 1_000,
  maxResultBytes: 4_096,
  maxTools: 16,
  origin: { kind: "roster", admissionRevision: "rev-1" },
};

const TOOLS: RemoteToolDescriptor[] = [
  { name: "delete_project", description: "Permanently deletes a project.", inputSchema: SCHEMA, annotations: { readOnlyHint: false, destructiveHint: true } },
  { name: "assistant_set_instructions", description: "Changes assistant instructions.", inputSchema: SCHEMA, annotations: { readOnlyHint: false } },
  { name: "send_message", description: "Sends a chat message to a real person.", inputSchema: SCHEMA, annotations: { readOnlyHint: false } },
];

interface Stores {
  readonly always: ExternalMcpToolApprovalRepoPort;
  readonly chat: ConversationToolApprovalStore;
}

interface Harness {
  readonly tracker?: LiveRunTracker;
  readonly store: SurfaceExchangeStore;
  readonly sent: { name: string; args: Record<string, unknown> }[];
  registration(name: string): ToolRegistration;
}

function harness(
  stores: Stores,
  options: { tools?: RemoteToolDescriptor[]; config?: FederatedMcpConnectionConfig; mayManage?: boolean; tracker?: LiveRunTracker;
    /** Approval deps to leave out (a host without that store), and an injected clock. */
    approvals?: { omit?: readonly ("always" | "chat" | "conversationIdForRun")[]; now?: () => Date } } = {},
): Harness {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const sent: { name: string; args: Record<string, unknown> }[] = [];
  const tools = options.tools ?? TOOLS;
  const session = new InMemoryMcpSession({
    tools }, {
    onCall: ({ name, args }) => {
      sent.push({ name, args: JSON.parse(JSON.stringify(args)) as Record<string, unknown> });
      return { content: [{ type: "text", text: `ran ${name}` }] };
    } });
  // Calling a federated tool at all already takes `admin.integrations.manage` on the connection
  // (entity "federated-mcp-connection"); "Always allow" re-checks it on the site's integrations
  // (entity "integration"), the scope the setting it saves lives in. Denied only there, here.
  const authorize: FederationDeps["authorize"] = async (request) =>
    request.permission === "admin.integrations.manage" && request.entityType === "integration" && options.mayManage === false
      ? { allowed: false, reason: "no-matching-grant" }
      : { allowed: true, reason: "matched" };
  const deps: FederationDeps = {
    authorize,
    workspaceId: WORKSPACE_ID,
    confirmCall: createFederatedCallConfirmer(
      { surfaceExchanges: store },
      withoutOmitted({
        workspaceId: WORKSPACE_ID,
        authorize,
        always: stores.always,
        chat: stores.chat,
        // Run ids here are "<conversation>/<n>": the daemon maps a run to the conversation it started in.
        conversationIdForRun: options.tracker
          ? (runId: string) => options.tracker!.conversationIdForRun({ runId: runId }, {})
          : (runId: string) => (runId.startsWith("none/") ? undefined : runId.split("/")[0]),
        ...(options.approvals?.now ? { now: options.approvals.now } : {}),
      }, options.approvals?.omit ?? []),
    ),
  };
  const { registrations } = buildFederatedMcpRegistrations({ tools, session, config: options.config ?? CONFIG, deps, nativeToolIds: new Set() });
  return {
    store,
    sent,
    tracker: options.tracker,
    registration(name) {
      const found = registrations.find((entry) => entry.descriptor.id === `mcp__supabase__${name}`);
      assert.ok(found, `expected a registration for ${name}`);
      return found;
    },
  };
}

/** Drops the named optional approval deps, as a host that never wired that store would. */
function withoutOmitted<T extends Record<string, unknown>>(approvals: T, omit: readonly string[]): T {
  return Object.fromEntries(Object.entries(approvals).filter(([key]) => !omit.includes(key))) as T;
}

interface Card {
  readonly exchangeId: string;
  readonly html: string;
  /** The buttons as the person sees them, in order: [action id, label]. */
  readonly buttons: readonly (readonly [string, string])[];
}

function readCard(emission: unknown): Card {
  const html = (emission as { payload: { resource: { resource: { text?: string } } } }).payload.resource.resource.text ?? "";
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the card must carry its exchange id");
  const buttons = [...html.matchAll(/<button [^>]*data-mcpui-action="([^"]+)"[^>]*>([^<]*)<\/button>/g)].map(
    (row) => [row[1] ?? "", row[2] ?? ""] as const,
  );
  return { exchangeId: match[1] ?? "", html, buttons };
}

let executions = 0;

function call(
  h: Harness,
  name: string,
  input: unknown,
  options: { conversation?: string; principalId?: string } = {},
): { pending: Promise<unknown>; cards: unknown[] } {
  const cards: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (surface) => void cards.push(surface);
  executions += 1;
  const ctx = {
    executionId: `exec-${executions}`,
    principal: { id: options.principalId ?? PRINCIPAL_ID },
    run: { id: `${options.conversation ?? "chat-a"}/${executions}` },
    input,
    signal: new AbortController().signal,
    emitSurface,
  } as ToolExecutionContext;
  if (h.tracker) h.tracker.register({ conversationId: options.conversation ?? "chat-a", runId: ctx.run.id }, {});
  return { pending: h.registration(name).handler(ctx), cards };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function answer(h: Harness, card: Card, name: string, params: Record<string, unknown>, principalId = PRINCIPAL_ID) {
  return h.store.deliver({ exchangeId: card.exchangeId, params, principalId }, { toolId: `mcp__supabase__${name}` });
}

/** Calls `name`, waits for its card, answers it with `params`, and returns the card. */
async function callAndAnswer(
  h: Harness,
  name: string,
  params: Record<string, unknown>,
  options: { conversation?: string; principalId?: string } = {},
): Promise<Card> {
  const { pending, cards } = call(h, name, { name: "one" }, options);
  await tick();
  assert.equal(cards.length, 1, `expected a card for ${name}`);
  const card = readCard(cards[0]);
  assert.deepEqual(answer(h, card, name, params, options.principalId), { ok: true });
  await pending;
  return card;
}

/** Calls `name` and reports whether it ran without asking. */
async function runsWithoutCard(h: Harness, name: string, options: { conversation?: string; principalId?: string } = {}): Promise<boolean> {
  const before = h.sent.length;
  const { pending, cards } = call(h, name, { name: "two" }, options);
  await tick();
  if (cards.length > 0) {
    answer(h, readCard(cards[0]), name, { decision: "cancel" }, options.principalId);
    await pending;
    return false;
  }
  await pending;
  return h.sent.length === before + 1;
}

function memoryStores(): Stores {
  return { always: new InMemoryExternalMcpToolApprovalRepo(), chat: createInMemoryConversationToolApprovalStore() };
}

// ---------------------------------------------------------------------------
// The buttons
// ---------------------------------------------------------------------------

test("G3 remembered: a non-destructive card offers Allow / Allow for this chat / Always allow / Cancel", async () => {
  const h = harness(memoryStores());
  const card = await callAndAnswer(h, "assistant_set_instructions", { decision: "cancel" });
  assert.deepEqual(card.buttons, [
    ["confirm", "Allow"],
    ["allow-chat", "Allow for this chat"],
    ["allow-always", "Always allow"],
    ["cancel", "Cancel"],
  ]);
});

for (const choice of ["chat", "always"] as const) test(`G3 remembered: delivery ignores a forged ${choice} choice and asks on every call`, async () => {
  const stores = memoryStores();
  const h = harness(stores);
  const card = await callAndAnswer(h, "send_message", { decision: "confirm", choice });
  assert.deepEqual(card.buttons, [["confirm", "Allow"], ["cancel", "Cancel"]]);
  assert.equal(card.html.includes("This action publishes, unpublishes or deploys content in Supabase. Approval applies to this call only."), true);
  assert.deepEqual(h.sent, [{ name: "send_message", args: { name: "one" } }]);
  assert.deepEqual(await stores.always.listByWorkspaceId(WORKSPACE_ID), []);
  assert.equal(await runsWithoutCard(h, "send_message", { conversation: "chat-a" }), false);
  assert.equal(await runsWithoutCard(h, "send_message", { conversation: "chat-b" }), false);
  assert.equal(h.sent.length, 1, "cancelling either later call sends nothing");
});

test("G3 remembered: delivery ignores existing matching chat and Always allow grants", async () => {
  const stores = memoryStores();
  const tool = TOOLS.find(tool => tool.name === "send_message")!;
  const fingerprint = federatedToolApprovalFingerprint({
    connectionId: CONFIG.connectionId, remoteName: tool.name, declaredAnnotations: tool.annotations,
    origin: CONFIG.origin,
    description: describeFederatedTool({ label: CONFIG.label, remoteName: tool.name, remoteDescription: tool.description }),
    inputSchema: SCHEMA,
  });
  await stores.always.upsert({ workspaceId: WORKSPACE_ID, serverId: CONFIG.connectionId, toolName: tool.name,
    fingerprint, grantedByPrincipalId: PRINCIPAL_ID, grantedAt: "2026-10-01T00:00:00.000Z" });
  const key = { conversationId: "chat-a", principalId: PRINCIPAL_ID, connectionId: CONFIG.connectionId, toolName: tool.name, fingerprint };
  await stores.chat.grant(key, "2026-10-01T00:00:00.000Z");
  assert.equal(await stores.chat.has(key), true);
  assert.equal((await stores.always.listByWorkspaceId(WORKSPACE_ID)).length, 1);
  const h = harness(stores);
  assert.equal(await runsWithoutCard(h, tool.name), false);
  assert.deepEqual(h.sent, []);
  assert.deepEqual(await stores.always.listByWorkspaceId(WORKSPACE_ID), []);
});

// Stricter since r4-mcp-federation (BEHAVIOR-CHANGES "Destructive cards/grants"): a destructive card
// used to offer "Allow for this chat"; it now offers neither remember choice.
test("G3 remembered: a destructive card never offers Always allow or Allow for this chat", async () => {
  const h = harness(memoryStores());
  const card = await callAndAnswer(h, "delete_project", { decision: "cancel" });
  assert.deepEqual(card.buttons, [
    ["confirm", "Allow"],
    ["cancel", "Cancel"],
  ]);
});

test("G3 remembered: the spec builder never offers a remember choice for a destructive tool, even when asked to", () => {
  const request = { toolId: "mcp__supabase__delete_project", remoteName: "delete_project", connectionId: "supabase", connectionLabel: "Supabase", arguments: {}, destructive: true, declaredAnnotations: undefined, origin: undefined, description: "", inputSchema: {}, writeShapedInputs: [] };
  const spec = buildFederatedCallConfirmSpec(request, { offerChat: true, offerAlways: true });
  assert.deepEqual(spec.confirmLabel, "Allow");
  assert.equal(spec.alternatives, undefined);
});

test("G3 remembered: with no conversation to remember in, the card offers no Allow for this chat", async () => {
  const h = harness(memoryStores());
  const { pending, cards } = call(h, "assistant_set_instructions", {}, { conversation: "none" });
  await tick();
  const card = readCard(cards[0]);
  answer(h, card, "assistant_set_instructions", { decision: "cancel" });
  await pending;
  assert.deepEqual(card.buttons, [
    ["confirm", "Allow"],
    ["allow-always", "Always allow"],
    ["cancel", "Cancel"],
  ]);
});

test("G3 remembered: a person who may not manage integrations is not offered Always allow", async () => {
  const h = harness(memoryStores(), { mayManage: false });
  const card = await callAndAnswer(h, "assistant_set_instructions", { decision: "cancel" });
  assert.deepEqual(card.buttons.map(([id]) => id), ["confirm", "allow-chat", "cancel"]);
});

test("G3 remembered: a connection with no saved row (a preset) is not offered Always allow", async () => {
  const h = harness(memoryStores(), { config: { ...CONFIG, origin: { kind: "preset" } } });
  const card = await callAndAnswer(h, "assistant_set_instructions", { decision: "cancel" });
  assert.deepEqual(card.buttons.map(([id]) => id), ["confirm", "allow-chat", "cancel"]);
});

test("G3 remembered: long or multi-line arguments render as a scrolling code block; short ones stay inline", () => {
  const request = {
    toolId: "mcp__supabase__delete_project",
    remoteName: "delete_project",
    connectionId: "supabase",
    connectionLabel: "Supabase",
    arguments: { project_id: "ppnxclfntfaoocrvipht", query: "create table t (\n  id bigint primary key\n);", options: { dry: false } },
    destructive: true,
    declaredAnnotations: undefined,
    origin: undefined,
    description: "",
    inputSchema: {},
    writeShapedInputs: ["query"],
  };
  const spec = buildFederatedCallConfirmSpec(request);
  assert.deepEqual(spec.details.map((row) => [row.label, row.format ?? "text"]), [
    ["Service", "text"],
    ["Tool", "text"],
    ["project_id", "text"],
    ["query", "code"],
    ["options", "code"],
  ]);
});

// ---------------------------------------------------------------------------
// Allow (once)
// ---------------------------------------------------------------------------

test("G3 remembered: Allow runs exactly this call and remembers nothing — the next call asks again", async () => {
  const stores = memoryStores();
  const h = harness(stores);
  await callAndAnswer(h, "assistant_set_instructions", { decision: "confirm" });
  assert.equal(h.sent.length, 1);
  assert.equal(await runsWithoutCard(h, "assistant_set_instructions"), false);
  assert.deepEqual(await stores.always.listByWorkspaceId(WORKSPACE_ID), []);
});

// ---------------------------------------------------------------------------
// Allow for this chat
// ---------------------------------------------------------------------------

test("G3 remembered: Allow for this chat runs this call, then the same tool runs without a card in the same chat", async () => {
  const h = harness(memoryStores());
  await callAndAnswer(h, "assistant_set_instructions", { decision: "confirm", choice: "chat" }, { conversation: "chat-a" });
  assert.equal(h.sent.length, 1);
  assert.equal(await runsWithoutCard(h, "assistant_set_instructions", { conversation: "chat-a" }), true);
  assert.equal(h.sent.length, 2);
});

// Stricter since r4-mcp-federation (BEHAVIOR-CHANGES "Destructive cards/grants"): this destructive
// call used to run without a card after "Allow for this chat"; a forged chat choice now runs only the
// answered call, remembers nothing, and the next call in the same chat asks again.
test("G3 remembered: a forged Allow for this chat on a destructive card runs that one call and the next call asks again", async () => {
  const stores = memoryStores();
  const h = harness(stores);
  await callAndAnswer(h, "delete_project", { decision: "confirm", choice: "chat" }, { conversation: "chat-a" });
  assert.equal(h.sent.length, 1);
  assert.equal(await runsWithoutCard(h, "delete_project", { conversation: "chat-a" }), false);
  assert.equal(h.sent.length, 1);
});

test("G3 remembered: a new conversation asks again after Allow for this chat", async () => {
  const h = harness(memoryStores());
  await callAndAnswer(h, "assistant_set_instructions", { decision: "confirm", choice: "chat" }, { conversation: "chat-a" });
  assert.equal(await runsWithoutCard(h, "assistant_set_instructions", { conversation: "chat-b" }), false);
});

test("G3 remembered: Allow for this chat covers only that tool, and only that person", async () => {
  const h = harness(memoryStores());
  await callAndAnswer(h, "assistant_set_instructions", { decision: "confirm", choice: "chat" }, { conversation: "chat-a" });
  assert.equal(await runsWithoutCard(h, "send_message", { conversation: "chat-a" }), false);
  assert.equal(await runsWithoutCard(h, "assistant_set_instructions", { conversation: "chat-a", principalId: OTHER_PRINCIPAL_ID }), false);
});

test("G3 remembered: Allow for this chat survives a restart — it is kept in chat.db with the conversation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "g3-chat-approvals-"));
  try {
    const path = join(dir, "chat.db");
    const first = openChatDb(path);
    first
      .prepare(`INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, created_at, updated_at) VALUES (?, ?, 'user', ?, 0, 0)`)
      .run("chat-a", WORKSPACE_ID, PRINCIPAL_ID);
    const always = new InMemoryExternalMcpToolApprovalRepo();
    const before = harness({ always, chat: createSqliteConversationToolApprovalStore(first) });
    await callAndAnswer(before, "assistant_set_instructions", { decision: "confirm", choice: "chat" }, { conversation: "chat-a" });
    first.close();

    // A fresh process: a new handle on the same file, new stores, a new registry.
    const second = openChatDb(path);
    const after = harness({ always, chat: createSqliteConversationToolApprovalStore(second) });
    assert.equal(await runsWithoutCard(after, "assistant_set_instructions", { conversation: "chat-a" }), true);
    assert.equal(await runsWithoutCard(after, "assistant_set_instructions", { conversation: "chat-b" }), false);

    // Deleting the chat deletes what it remembered.
    second.prepare(`DELETE FROM ai_chats WHERE id = ?`).run("chat-a");
    const rows = second.prepare(`SELECT COUNT(*) AS n FROM assistant_conversation_tool_approvals`).get() as { n: number };
    assert.equal(rows.n, 0);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("G3 remembered: a chat the store cannot record in (not in ai_chats) still runs the approved call once, then asks again", async () => {
  const dir = mkdtempSync(join(tmpdir(), "g3-chat-approvals-"));
  try {
    const db = openChatDb(join(dir, "chat.db"));
    const h = harness({ always: new InMemoryExternalMcpToolApprovalRepo(), chat: createSqliteConversationToolApprovalStore(db) });
    await callAndAnswer(h, "assistant_set_instructions", { decision: "confirm", choice: "chat" }, { conversation: "chat-missing" });
    assert.equal(h.sent.length, 1);
    assert.equal(await runsWithoutCard(h, "assistant_set_instructions", { conversation: "chat-missing" }), false);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Always allow
// ---------------------------------------------------------------------------

test("G3 remembered: Always allow runs this call, is saved per site + connection + tool, and later calls in any chat run without a card", async () => {
  const stores = memoryStores();
  const h = harness(stores);
  await callAndAnswer(h, "assistant_set_instructions", { decision: "confirm", choice: "always" }, { conversation: "chat-a" });
  assert.equal(h.sent.length, 1);

  const saved = await stores.always.listByWorkspaceId(WORKSPACE_ID);
  assert.equal(saved.length, 1);
  assert.deepEqual(
    { ...saved[0], grantedAt: "(time)" },
    {
      workspaceId: WORKSPACE_ID,
      serverId: "supabase",
      toolName: "assistant_set_instructions",
      fingerprint: federatedToolApprovalFingerprint({
        connectionId: "supabase",
        remoteName: "assistant_set_instructions",
        declaredAnnotations: { readOnlyHint: false },
        origin: { kind: "roster", admissionRevision: "rev-1" },
        description: describeFederatedTool({ label: "Supabase", remoteName: "assistant_set_instructions", remoteDescription: "Changes assistant instructions." }),
        inputSchema: SCHEMA,
      }),
      grantedByPrincipalId: PRINCIPAL_ID,
      grantedAt: "(time)",
    },
  );

  assert.equal(await runsWithoutCard(h, "assistant_set_instructions", { conversation: "chat-b" }), true);
  assert.equal(await runsWithoutCard(h, "assistant_set_instructions", { conversation: "none" }), true);
  assert.equal(await runsWithoutCard(h, "delete_project", { conversation: "chat-b" }), false, "only that tool");
});

test("G3 remembered: a forged Always allow on a destructive card runs that one call and saves nothing", async () => {
  const stores = memoryStores();
  const h = harness(stores);
  await callAndAnswer(h, "delete_project", { decision: "confirm", choice: "always" });
  assert.equal(h.sent.length, 1);
  assert.deepEqual(await stores.always.listByWorkspaceId(WORKSPACE_ID), []);
  assert.equal(await runsWithoutCard(h, "delete_project", { conversation: "chat-a" }), false);
});

test("G3 remembered: a remember value on a Cancel runs nothing and saves nothing", async () => {
  const stores = memoryStores();
  const h = harness(stores);
  await callAndAnswer(h, "assistant_set_instructions", { decision: "cancel", choice: "always" });
  assert.deepEqual(h.sent, []);
  assert.deepEqual(await stores.always.listByWorkspaceId(WORKSPACE_ID), []);
});

test("G3 remembered: revoking an Always allow makes the tool ask again", async () => {
  const stores = memoryStores();
  const h = harness(stores);
  await callAndAnswer(h, "assistant_set_instructions", { decision: "confirm", choice: "always" });
  assert.equal(await stores.always.delete({ workspaceId: WORKSPACE_ID, serverId: "supabase", toolName: "assistant_set_instructions" }), true);
  assert.equal(await runsWithoutCard(h, "assistant_set_instructions", { conversation: "chat-b" }), false);
});

// ---------------------------------------------------------------------------
// Tool identity: a changed server, name or hints voids a remembered approval
// ---------------------------------------------------------------------------

test("G3 remembered: a destructive annotation voids an Always allow and requires approval for every call", async () => {
  const stores = memoryStores();
  await callAndAnswer(harness(stores), "assistant_set_instructions", { decision: "confirm", choice: "always" });

  const nowDestructive = TOOLS.map((tool) => (tool.name === "assistant_set_instructions" ? { ...tool, annotations: { readOnlyHint: false, destructiveHint: true } } : tool));
  const h = harness(stores, { tools: nowDestructive });
  const { pending, cards } = call(h, "assistant_set_instructions", {}, { conversation: "chat-b" });
  await tick();
  assert.equal(cards.length, 1, "the changed tool asks again");
  const card = readCard(cards[0]);
  // Owner 2026-10-07: destructive declarations require one-call consent; they cannot be remembered.
  assert.deepEqual(card.buttons.map(([id]) => id), ["confirm", "cancel"]);
  answer(h, card, "assistant_set_instructions", { decision: "cancel" });
  await pending;
  assert.deepEqual(h.sent, []);
  assert.deepEqual(await stores.always.listByWorkspaceId(WORKSPACE_ID), []);
  await callAndAnswer(h, "assistant_set_instructions", { decision: "confirm", choice: "always" }, { conversation: "chat-b" });
  assert.equal(h.sent.length, 1, "an explicit confirmation approves exactly one call");
  assert.deepEqual(await stores.always.listByWorkspaceId(WORKSPACE_ID), [], "a forged remember choice saves nothing");
  assert.equal(await runsWithoutCard(h, "assistant_set_instructions", { conversation: "chat-b" }), false);
});

test("G3 remembered: a changed annotation voids an Allow for this chat", async () => {
  const stores = memoryStores();
  await callAndAnswer(harness(stores), "assistant_set_instructions", { decision: "confirm", choice: "chat" }, { conversation: "chat-a" });
  const changed = TOOLS.map((tool) => (tool.name === "assistant_set_instructions" ? { ...tool, annotations: { readOnlyHint: false, idempotentHint: true } } : tool));
  assert.equal(await runsWithoutCard(harness(stores, { tools: changed }), "assistant_set_instructions", { conversation: "chat-a" }), false);
});

test("G3 remembered: publication requires each call's approval and never offers a remembered scope", async () => {
  const stores = memoryStores();
  await callAndAnswer(harness(stores), "assistant_set_instructions", { decision: "confirm", choice: "always" });
  const tools = TOOLS.map(tool => tool.name === "assistant_set_instructions" ? { ...tool, description: "Publishes a site." } : tool);
  const h = harness(stores, { tools });
  const card = await callAndAnswer(h, "assistant_set_instructions", { decision: "confirm", choice: "always" });
  assert.deepEqual(card.buttons.map(([id]) => id), ["confirm", "cancel"]);
  assert.equal(card.html.includes("This action publishes, unpublishes or deploys content in Supabase. Approval applies to this call only."), true);
  assert.equal(h.sent.length, 1);
  assert.deepEqual(await stores.always.listByWorkspaceId(WORKSPACE_ID), []);
  assert.equal(await runsWithoutCard(h, "assistant_set_instructions", { conversation: "chat-b" }), false);
  assert.equal(h.sent.length, 1);
});

test("G3 remembered: a changed server (a new admission revision) voids an Always allow", async () => {
  const stores = memoryStores();
  await callAndAnswer(harness(stores), "assistant_set_instructions", { decision: "confirm", choice: "always" });
  const moved = harness(stores, { config: { ...CONFIG, origin: { kind: "roster", admissionRevision: "rev-2" } } });
  assert.equal(await runsWithoutCard(moved, "assistant_set_instructions", { conversation: "chat-b" }), false);
});

test("G3 remembered: the fingerprint ignores hint key order but not hint values", () => {
  const base = { connectionId: "supabase", remoteName: "assistant_set_instructions", origin: { kind: "roster", admissionRevision: "rev-1" }, description: "Changes assistant instructions.", inputSchema: SCHEMA } as const;
  assert.equal(
    federatedToolApprovalFingerprint({ ...base, declaredAnnotations: { readOnlyHint: false, idempotentHint: true } }),
    federatedToolApprovalFingerprint({ ...base, declaredAnnotations: { idempotentHint: true, readOnlyHint: false } }),
  );
  assert.notEqual(
    federatedToolApprovalFingerprint({ ...base, declaredAnnotations: { readOnlyHint: false } }),
    federatedToolApprovalFingerprint({ ...base, declaredAnnotations: { readOnlyHint: false, destructiveHint: false } }),
  );
  assert.notEqual(
    federatedToolApprovalFingerprint({ ...base, declaredAnnotations: undefined }),
    federatedToolApprovalFingerprint({ ...base, remoteName: "assistant_update_instructions", declaredAnnotations: undefined }),
  );
});

test("remembered chat approvals use the live tracker conversation lookup and stay isolated", async () => {
  const tracker = createLiveRunTracker({}, {});
  const h = harness(memoryStores(), { tracker });
  await callAndAnswer(h, "assistant_set_instructions", { decision: "confirm", choice: "chat" }, { conversation: "chat-tracker-a" });
  assert.equal(await runsWithoutCard(h, "assistant_set_instructions", { conversation: "chat-tracker-a" }), true);
  assert.equal(await runsWithoutCard(h, "assistant_set_instructions", { conversation: "chat-tracker-b" }), false);
  assert.equal(h.sent.length, 2);
});

// ---------------------------------------------------------------------------
// Hosts that wire fewer approval deps, an injected clock, and a non-Error persistence failure
// ---------------------------------------------------------------------------

test("G3 remembered: a host with no approval stores and no conversation lookup offers only Allow / Cancel", async () => {
  const h = harness(memoryStores(), { approvals: { omit: ["always", "chat", "conversationIdForRun"] } });
  const card = await callAndAnswer(h, "assistant_set_instructions", { decision: "confirm" });
  assert.deepEqual(card.buttons.map(([id]) => id), ["confirm", "cancel"]);
  assert.equal(h.sent.length, 1);
});

test("G3 remembered: an Allow for this chat is stamped with the injected approval clock", async () => {
  const granted: string[] = [];
  const memory = createInMemoryConversationToolApprovalStore();
  const chat: ConversationToolApprovalStore = { has: (key) => memory.has(key),
    grant: async (key, grantedAt) => { granted.push(grantedAt); await memory.grant(key, grantedAt); } };
  const h = harness({ always: new InMemoryExternalMcpToolApprovalRepo(), chat }, { approvals: { now: () => new Date("2026-03-04T05:06:07.000Z") } });
  await callAndAnswer(h, "assistant_set_instructions", { decision: "confirm", choice: "chat" });
  assert.deepEqual(granted, ["2026-03-04T05:06:07.000Z"]);
  assert.equal(await runsWithoutCard(h, "assistant_set_instructions"), true);
});

test("G3 remembered: a chat store failing with a non-Error value still runs the approved call and logs the raw reason", async (t) => {
  const warnings: string[] = [];
  t.mock.method(console, "warn", (line: unknown) => void warnings.push(String(line)));
  const chat: ConversationToolApprovalStore = { has: async () => false, grant: () => Promise.reject("disk full") };
  const h = harness({ always: new InMemoryExternalMcpToolApprovalRepo(), chat });
  await callAndAnswer(h, "assistant_set_instructions", { decision: "confirm", choice: "chat" });
  assert.equal(h.sent.length, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /could not remember the "chat" approval for mcp__supabase__assistant_set_instructions; this call runs, the next one asks again — disk full$/);
});
