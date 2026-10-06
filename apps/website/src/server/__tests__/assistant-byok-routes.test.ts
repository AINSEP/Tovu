import assert from "node:assert/strict";
import test from "node:test";

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import express from "express";
import { createContributionRegistry } from "@jini-ai/core";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import {
  createAssistantByokModule,
  FEDERATION_STILL_CONNECTING_NOTE,
  SYSTEM_PREAMBLE,
} from "../runtime/composition/modules/assistant-byok.js";
import { registerAuthRoutes } from "../inbound/admin-http/dev-auth.js";
import { MCP_UI_TOOL_CALLS_PATH, createByokToolSurface, type ByokToolSurface, type DerivedToolContributor, type ToolContributor } from "../../assistant/index.js";
import { installFirstPartyToolContributors } from "../runtime/composition/tool-catalog-manifest.js";
import { formatCustomInstructionsOverlay } from "../../assistant/custom-instructions.js";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";
import { POST_ENTITY_TYPE } from "../../features/trash/adapters/post.js";
import { INSTRUCTIONS_NAMESPACE } from "../../features/settings/index.js";
import { bootAuthenticated, startTestServer } from "./helpers/http-test-server.js";
import { startStubProviderServer, type StubProviderReply, type StubProviderRequest } from "./helpers/stub-provider-server.js";
import type { RouteDeps } from "../routes/types.js";
import { assertSpanOmits, createInMemoryOtel } from "../../platform/observability/__tests__/fixtures/in-memory-otel.js";

/**
 * @file Route-level coverage for `POST /api/admin/v1/assistant/byok-turn` (`modules/assistant-byok.ts`)
 * — the admin dock's "API · BYOK" execution mode, 2026-08-04.
 *
 * The property under test that matters most: a BYOK-mode turn can call a REAL admin tool
 * (`content_read.workspace`, from the identical `buildAssistantToolRegistrations` catalog the daemon uses)
 * and get a REAL result back — not a stub, not a mocked tool executor. Only the outbound call to
 * Anthropic is mocked (mirrors `site-assistant-routes.test.ts`'s identical posture for Google: no
 * live external dependency in a scoped test run, but everything on Tovu's own side of that boundary
 * is exercised for real).
 *
 * Auth uses an explicit permission grant (`workspace.manage`, the permission `content_read.workspace` inherits from `workspace_get`'s own catalog entry —
 * `@jini-ai/cms/workspace`'s `agent-tools.ts`) rather than the seeded dev owner, so this test does
 * not silently depend on exactly which permissions that seed happens to carry.
 */

const WORKSPACE_ID = "workspace-local";
const BYOK_TURN_PATH = "/api/admin/v1/assistant/byok-turn";

/** Mirrors `admin-assistant-execution-routes.test.ts`'s identical helper. */
let grantCounter = 0;
async function loginWithPermissions(deps: RouteDeps, baseUrl: string, permissions: readonly string[]): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-byok-${suffix}`;
  const policyId = `grant-policy-byok-${suffix}`;
  const username = `grant-byok-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: `Grants: ${permissions.join(", ") || "(none)"}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash({ password: "grant-pw" }),
  });
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: `grant-policy-${suffix}`, isBuiltin: false, isFrozen: false });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({
      id: `grant-pp-${suffix}-${permission}`,
      workspaceId: deps.workspaceId,
      policyId,
      permission,
      resourceType: null,
      constraintJson: null,
    });
  }
  await deps.principalPolicyRepo.save({ id: `grant-link-${suffix}`, workspaceId: deps.workspaceId, principalId, policyId });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "grant-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/** Writes `core.instructions.custom` straight at `deps.settingsRepo` — the same shape
 *  `custom-instructions.test.ts`'s own `writeCustomInstructions` helper uses, standing in for what an
 *  admin's Settings -> Instructions tab save does. Awaits `settingsUiTabsReady` first so the
 *  definition is guaranteed registered (see that field's own doc on `RouteDeps`). */
async function writeCustomInstructions(deps: RouteDeps, text: string): Promise<void> {
  await deps.settingsUiTabsReady;
  const definition = (await deps.settingsRepo.listActiveDefinitions({ workspaceId: null })).find(
    (d) => d.namespace === INSTRUCTIONS_NAMESPACE && d.key === "custom",
  );
  assert.ok(definition, "core.instructions.custom must be registered before writing a value");
  await deps.settingsRepo.saveWorkspaceValue({
    settingId: definition.settingId,
    scope: "workspace",
    workspaceId: deps.workspaceId,
    principalId: null,
    valueJson: text,
    state: "set",
    defVersion: definition.version,
    seq: 1,
    updatedBy: "test",
    updatedAt: deps.clock.nowIso(),
    originPluginId: null,
  });
}

/**
 * Real `content/event:`/`data:` SSE framing, matching `@jini-ai/agent-runtime`'s own
 * `providers/__tests__/anthropic-messages.test.ts` helpers exactly (same wire shape
 * `runAnthropicToolTurn` actually parses) — copied rather than imported, mirroring
 * `site-assistant-routes.test.ts`'s identical choice for its own Google helpers, for the same
 * reason: a drift in either side's understanding of the shape should fail these tests, not pass
 * vacuously against a shape nothing real produces.
 */
function sseFrame(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}
function messageStart(id = "msg_1"): string {
  return sseFrame("message_start", {
    type: "message_start",
    message: { id, type: "message", role: "assistant", content: [], model: "claude-opus-4-8", stop_reason: null, stop_sequence: null },
  });
}
function textBlock(index: number, text: string): string {
  return (
    sseFrame("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }) +
    sseFrame("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text } }) +
    sseFrame("content_block_stop", { type: "content_block_stop", index })
  );
}
function toolUseBlock(index: number, id: string, name: string, input: unknown): string {
  return (
    sseFrame("content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id, name, input: {} } }) +
    sseFrame("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }) +
    sseFrame("content_block_stop", { type: "content_block_stop", index })
  );
}
function messageDelta(stopReason: string): string {
  return sseFrame("message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 10 } });
}
function messageStop(): string {
  return sseFrame("message_stop", { type: "message_stop" });
}
function sseBody(...lines: string[]): StubProviderReply {
  return { status: 200, body: lines.join("") };
}

/** Boots a real loopback stub standing in for the provider host and returns its URL for the caller
 *  to embed in the request body's `byok.baseUrl` field — the substitution point that still works
 *  now that `@jini-ai/agent-runtime`'s adapters dial `pinnedFetch` (`node:https`/`node:http`
 *  directly), not `globalThis.fetch` (see `stub-provider-server.ts`'s own doc for the full history:
 *  stubbing the global stopped intercepting anything once the provider adapters moved to a DNS-
 *  pinned transport for the SSRF/DNS-rebinding fix). Replaces the old `stubAnthropicFetch`/
 *  `stubHostFetch` host-substring-matching pair — with an explicit `baseUrl` override there is no
 *  longer a real host to match against. Thin re-export of `startStubProviderServer` under this
 *  file's own established name. */
async function stubProvider(
  t: import("node:test").TestContext,
  respond: (callCount: number, requestBody: Record<string, unknown>, request: StubProviderRequest) => StubProviderReply,
): Promise<string> {
  return startStubProviderServer(t, respond);
}

function postByokTurn(baseUrl: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${BYOK_TURN_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

/** Splits a completed SSE response body into `{event, payload}` frames — the test-side counterpart
 *  to `assistant-transport.ts`'s `readSseFrames`, over the whole (already-finished) response text
 *  rather than a live stream, since the test just needs to assert on the full frame sequence. */
function parseSseFrames(text: string): Array<{ event: string; payload: Record<string, unknown> }> {
  return text
    .split("\n\n")
    .filter((raw) => raw.trim().length > 0)
    .map((raw) => {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      return { event, payload: JSON.parse(dataLines.join("\n")) as Record<string, unknown> };
    });
}

/**
 * Splits one already-decoded chunk of SSE text on frame boundaries, returning the trailing
 * incomplete fragment (if any) so the caller can prepend it to the next chunk. Shared by
 * {@link readSseFramesLive} — the read-while-open counterpart to {@link parseSseFrames} above, needed
 * for a redemption test that must act (POST a confirmation) WHILE the BYOK turn's own SSE response is
 * still open, which `res.text()` cannot express since it waits for the connection to close.
 */
function splitSseFrames(buffer: string): { frames: Array<{ event: string; payload: Record<string, unknown> }>; rest: string } {
  const frames: Array<{ event: string; payload: Record<string, unknown> }> = [];
  let rest = buffer;
  let boundary: number;
  while ((boundary = rest.indexOf("\n\n")) !== -1) {
    const raw = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    if (raw.trim().length === 0) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    frames.push({ event, payload: JSON.parse(dataLines.join("\n")) as Record<string, unknown> });
  }
  return { frames, rest };
}

/**
 * Reads frames off a LIVE (not-yet-finished) SSE response body, stopping as soon as `stopWhen`
 * matches one — so a test can act on that frame (e.g. redeem a parked confirmation) before the
 * server-side handler that is waiting on that action ever resolves. Returns the still-open `reader`
 * so the caller can keep draining the rest of the stream afterward with a second call.
 *
 * @complexity O(n) in bytes read before `stopWhen` first matches (or the stream ends).
 */
async function readSseFramesLive(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  stopWhen: (frame: { event: string; payload: Record<string, unknown> }) => boolean,
): Promise<{ frames: Array<{ event: string; payload: Record<string, unknown> }>; done: boolean }> {
  const decoder = new TextDecoder();
  let buffer = "";
  const seen: Array<{ event: string; payload: Record<string, unknown> }> = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const { frames, rest } = splitSseFrames(buffer);
    buffer = rest;
    for (const frame of frames) {
      seen.push(frame);
      if (stopWhen(frame)) return { frames: seen, done: false };
    }
    if (done) return { frames: seen, done: true };
  }
}

/** Pulls the `SURFACE_EXCHANGE_ID_PARAM` value back out of an `mcp-ui` frame's rendered resource —
 *  it is interpolated into the confirmation dialog's inline script (`buildConfirmationSurface`'s own
 *  doc: "the only place it may go"), not exposed as a separate structured field, so a real caller
 *  (the rendered dialog itself) and this test recover it the same way: by reading the resource's own
 *  rendered text.
 *
 *  Walks the ALREADY-`JSON.parse`d payload's string leaves directly, rather than
 *  `JSON.stringify`-ing the whole payload and regexing that: the resource's HTML `text` field is
 *  itself a JSON-escaped string (one level of `\"` escaping survives from the original wire frame,
 *  by design — that HTML embeds `PLAN`'s own `JSON.stringify`d params object). Re-`JSON.stringify`ing
 *  the parsed object re-escapes those already-unescaped quotes a SECOND time (`\"` becomes `\\\"`),
 *  so a plain-quote regex against the re-stringified text never matches the double-escaped one —
 *  caught by a standalone repro before this was ever run inside `node --test`, where the resulting
 *  `assert.ok` failure would otherwise have raced against this file's still-parked exchange in
 *  `t.after`'s `server.close()` and looked like a hang, not a clean assertion failure. */
function extractExchangeId(mcpUiPayload: Record<string, unknown>): string {
  const pattern = /"__exchangeId":"([^"]+)"/;
  function search(value: unknown): string | null {
    if (typeof value === "string") return pattern.exec(value)?.[1] ?? null;
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = search(entry);
        if (found) return found;
      }
      return null;
    }
    if (value !== null && typeof value === "object") {
      for (const entry of Object.values(value)) {
        const found = search(entry);
        if (found) return found;
      }
      return null;
    }
    return null;
  }
  const found = search(mcpUiPayload);
  assert.ok(found, `expected an interpolated ${SURFACE_EXCHANGE_ID_PARAM} somewhere in the mcp-ui resource, found none`);
  return found!;
}

const BYOK_BODY = {
  messages: [{ role: "user", content: "What is this workspace called? Use your tool." }],
  byok: { protocol: "anthropic", apiKey: "sk-ant-test-fake-not-real", model: "claude-opus-4-8" },
};

test(`${BYOK_TURN_PATH} requires a session — an unauthenticated caller never reaches it`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await postByokTurn(baseUrl, "", BYOK_BODY);
  assert.equal(res.status, 401);
});

test(`${BYOK_TURN_PATH} rejects a request with no usable BYOK credential before touching the provider`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // No provider stub needed: credential validation fails before `runByokProviderTurn` is ever
  // reached, so there is nothing to intercept — see `stub-provider-server.ts`'s doc for why a
  // `globalThis.fetch` mock would not have intercepted a real outbound call here anyway.
  const res = await postByokTurn(baseUrl, cookie, { messages: BYOK_BODY.messages, byok: { protocol: "anthropic" } });
  assert.equal(res.status, 400);
});

test(`${BYOK_TURN_PATH} runs a REAL admin tool through a BYOK provider turn and streams a real result back`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["workspace.manage"]);

  const expectedWorkspace = await deps.workspaceRepo.findById({ id: deps.workspaceId });
  assert.ok(expectedWorkspace);
  let continuation: Record<string, unknown> | undefined;
  const requests: StubProviderRequest[] = [];
  const providerUrl = await stubProvider(t, (callCount, requestBody, request) => {
    requests.push(request);
    if (callCount === 2) continuation = requestBody;
    if (callCount === 1) {
      // First turn: the model reaches `content_read.workspace` (the collapsed `workspace_get`) the only way a BYOK turn now offers — through
      // the meta-tool set (`byok-tool-surface.ts`'s `META_TOOL_DESCRIPTORS`), which is what the
      // route publishes instead of all 131 real descriptors. The real tool id is an ARGUMENT now,
      // not the tool name.
      return sseBody(messageStart(), toolUseBlock(0, "toolu_1", "execute_delegated_tool", { toolId: "content_read.workspace", input: {} }), messageDelta("tool_use"), messageStop());
    }
    // Second turn (after the REAL tool result is appended to the conversation): the model replies
    // in plain text. The assertion below on the SECOND call's request body is what proves the tool
    // actually ran — a stubbed/skipped executor would leave no real result to echo back here.
    return sseBody(messageStart("msg_2"), textBlock(0, "This workspace is named Tovu Dev."), messageDelta("end_turn"), messageStop());
  });

  const res = await postByokTurn(baseUrl, cookie, { ...BYOK_BODY, byok: { ...BYOK_BODY.byok, baseUrl: providerUrl } });
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("content-type")?.startsWith("text/event-stream"));

  const frames = parseSseFrames(await res.text());

  const toolUseFrame = frames.find((f) => f.event === "agent" && f.payload.type === "tool_use");
  assert.ok(toolUseFrame, "expected a tool_use event on the wire");
  assert.equal(toolUseFrame!.payload.name, "execute_delegated_tool");
  assert.equal((toolUseFrame!.payload.input as { toolId?: string }).toolId, "content_read.workspace");

  const toolResultFrame = frames.find((f) => f.event === "agent" && f.payload.type === "tool_result");
  assert.ok(toolResultFrame, "expected a tool_result event on the wire");
  assert.equal(toolResultFrame!.payload.isError, false);
  // The REAL `workspace_get` handler's output, reached under its collapsed `content_read.workspace` id — proves this round-tripped through
  // `toolExecutor.execute` against the real workspace repo, not a stub. `deps.workspaceId` is this
  // test's own seeded workspace id, which only the real handler could have echoed back.
  const resultContent = String(toolResultFrame!.payload.content);
  assert.match(resultContent, new RegExp(deps.workspaceId));
  assert.deepEqual(JSON.parse(resultContent), { workspace: expectedWorkspace });

  const textFrame = frames.find((f) => f.event === "agent" && f.payload.type === "text_delta");
  assert.ok(textFrame, "expected a text_delta event with the model's final reply");
  assert.equal(textFrame!.payload.delta, "This workspace is named Tovu Dev.");

  const endFrame = frames.find((f) => f.event === "end");
  assert.ok(endFrame, "expected a terminal end frame");
  assert.equal(requests.length, 2);
  assert.ok(continuation, "the provider must receive the real tool result");
  const resultBlocks = (continuation!.messages as Array<{ content: unknown }>).at(-1)!.content;
  assert.deepEqual(resultBlocks, [{ type: "tool_result", tool_use_id: "toolu_1", content: resultContent }]);
  for (const request of requests) {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/messages");
    assert.equal(request.headers["x-api-key"], BYOK_BODY.byok.apiKey);
    assert.equal(request.headers["anthropic-version"], "2023-06-01");
  }
});

test(`${BYOK_TURN_PATH} refuses a workspace mutation by a content.read-only session`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["content.read"]);
  const before = await deps.workspaceRepo.findById({ id: deps.workspaceId });
  assert.ok(before);
  const providerUrl = await stubProvider(t, (callCount) => callCount === 1
    ? sseBody(messageStart(), toolUseBlock(0, "denied-call", "execute_delegated_tool", {
      toolId: "workspace_update", input: { name: "Unauthorized rename" },
    }), messageDelta("tool_use"), messageStop())
    : sseBody(messageStart("msg_2"), textBlock(0, "Refused."), messageDelta("end_turn"), messageStop()));

  const res = await postByokTurn(baseUrl, cookie, { ...BYOK_BODY, byok: { ...BYOK_BODY.byok, baseUrl: providerUrl } });
  assert.equal(res.status, 200);
  const frames = parseSseFrames(await res.text());
  const result = frames.find((f) => f.event === "agent" && f.payload.type === "tool_result");
  assert.ok(result);
  assert.equal(result.payload.toolUseId, "denied-call");
  assert.equal(result.payload.isError, true);
  assert.match(String(result.payload.content), /not authorized|forbidden|permission|denied/i);
  assert.deepEqual(await deps.workspaceRepo.findById({ id: deps.workspaceId }), before);
});

test(`${BYOK_TURN_PATH} reports a provider error on its own SSE event name, not folded into 'agent'`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["workspace.manage"]);

  const providerUrl = await stubProvider(t, () => ({ status: 401, body: JSON.stringify({ error: { message: "invalid x-api-key" } }) }));

  const res = await postByokTurn(baseUrl, cookie, { ...BYOK_BODY, byok: { ...BYOK_BODY.byok, baseUrl: providerUrl } });
  assert.equal(res.status, 200); // headers already flushed before the provider call fails
  const frames = parseSseFrames(await res.text());
  const errorFrame = frames.find((f) => f.event === "error");
  assert.ok(errorFrame, "expected an 'error' SSE event, not a swallowed/miscategorized one");
});

/**
 * Regression coverage for the admin Instructions tab (`core.instructions.custom`) applying to BYOK
 * turns — before `resolveByokSystemPrompt` (`assistant-byok.ts`), this route always sent the bare
 * {@link SYSTEM_PREAMBLE}, so an operator's saved instructions silently had no effect in BYOK mode even
 * though the identical Local CLI path (`agent-daemon-server.ts`'s `systemOverlay()`) already applied
 * them. Asserts the exact composed string the provider receives, built from the SAME
 * `formatCustomInstructionsOverlay` production code uses to format the overlay, so this test does not
 * duplicate that header text as a second hardcoded literal that could drift from the real one.
 */
test(`${BYOK_TURN_PATH} composes 'system' from SYSTEM_PREAMBLE plus the admin Instructions tab's custom overlay, when one is set`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["workspace.manage"]);

  await writeCustomInstructions(deps, "Always respond in pirate slang.");

  let capturedSystem: unknown;
  const providerUrl = await stubProvider(t, (_callCount, requestBody) => {
    capturedSystem = requestBody.system;
    return sseBody(messageStart(), textBlock(0, "Arrr, ahoy."), messageDelta("end_turn"), messageStop());
  });

  const res = await postByokTurn(baseUrl, cookie, { ...BYOK_BODY, byok: { ...BYOK_BODY.byok, baseUrl: providerUrl } });
  assert.equal(res.status, 200);
  await res.text(); // drain the stream so the request completes

  const expectedOverlay = formatCustomInstructionsOverlay("Always respond in pirate slang.");
  assert.equal(capturedSystem, `${SYSTEM_PREAMBLE}\n\n${expectedOverlay}`);
});

// Demo V3 2026-10-05 / owner 2026-10-05: the per-message screen block (which page is open, where
// drawings appear) reached only the Local CLI path; a BYOK turn never saw the screen at all.
test(`${BYOK_TURN_PATH} puts the admin screen block in front of the newest user message`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["workspace.manage"]);

  let capturedMessages: Array<{ role: string; content: unknown }> = [];
  const providerUrl = await stubProvider(t, (_callCount, requestBody) => {
    capturedMessages = requestBody.messages as Array<{ role: string; content: unknown }>;
    return sseBody(messageStart(), textBlock(0, "Hello."), messageDelta("end_turn"), messageStop());
  });

  const res = await postByokTurn(baseUrl, cookie, {
    ...BYOK_BODY,
    pageContext: { path: "/playground", section: "playground", drawingSurface: "canvas" },
    byok: { ...BYOK_BODY.byok, baseUrl: providerUrl },
  });
  assert.equal(res.status, 200);
  await res.text();

  const firstUser = JSON.stringify(capturedMessages.find((message) => message.role === "user")?.content);
  assert.match(firstUser, /\[Current admin screen/);
  assert.match(firstUser, /- Where drawings appear: on this screen's canvas, not in the chat/);
  assert.match(firstUser, /What is this workspace called\? Use your tool\./);
});

test(`${BYOK_TURN_PATH} sends the bare SYSTEM_PREAMBLE as 'system' when no custom instructions are set`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["workspace.manage"]);

  let capturedSystem: unknown;
  const providerUrl = await stubProvider(t, (_callCount, requestBody) => {
    capturedSystem = requestBody.system;
    return sseBody(messageStart(), textBlock(0, "Hello."), messageDelta("end_turn"), messageStop());
  });

  const res = await postByokTurn(baseUrl, cookie, { ...BYOK_BODY, byok: { ...BYOK_BODY.byok, baseUrl: providerUrl } });
  assert.equal(res.status, 200);
  await res.text();

  assert.equal(capturedSystem, SYSTEM_PREAMBLE);
});

/**
 * Bare `ByokToolSurface` stand-in for the federation system-prompt tests below — deliberately NOT
 * built through `createByokToolSurface` (which would spin up a real registry/executor/federation
 * runtime these tests have no interest in controlling). `handleTurn` (`assistant-byok.ts`) only ever
 * reads `.ready`, `.metaTools`, `.executeMetaTool`, `.awaitFederation`, and
 * `.federation?.refusalPrefix()` off the surface it is handed, so those are the only members given
 * real behavior here — everything else is a placeholder the route never touches for a turn with no
 * tool_use block, and the whole object is cast past the full interface rather than hand-filling
 * `registry`/`executor` with fakes nothing here exercises.
 */
function stubByokToolSurface(options: { readonly settled: boolean; readonly refusalPrefix?: string }): ByokToolSurface {
  return {
    metaTools: [],
    surfaceExchanges: createSurfaceExchangeStore(),
    executeMetaTool: async () => ({ content: "" }),
    ready: Promise.resolve(),
    awaitFederation: async () => ({ settled: options.settled }),
    ...(options.refusalPrefix !== undefined ? { federation: { refusalPrefix: () => options.refusalPrefix } } : {}),
  } as unknown as ByokToolSurface;
}

/** Builds a hand-assembled express app around a caller-supplied `toolSurface`, mirroring the
 *  no-hang test's identical shape below — `createApp` always builds its own production
 *  `ByokToolSurface` and offers no seam to swap in {@link stubByokToolSurface}'s bare stand-in. */
async function bootWithStubSurface(deps: ReturnType<typeof createRouteDeps>, toolSurface: ByokToolSurface, t: import("node:test").TestContext) {
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  createAssistantByokModule(deps, toolSurface).registerRoutes?.(app);
  return bootAuthenticated(app, t);
}

/**
 * RED-first coverage for §2.1 item 6 / S5 of `design-byok-external-mcp-2026-09-24.md`: a turn whose
 * `awaitFederation` call times out gets `FEDERATION_STILL_CONNECTING_NOTE` appended, and a turn whose
 * surface reports federation drift gets that `refusalPrefix()` text too — both ahead of the custom
 * overlay, in the fixed order `resolveByokSystemPrompt`'s own doc specifies.
 */
test(`${BYOK_TURN_PATH} composes 'system' with the federation refusal prefix and the still-connecting note when awaitFederation does not settle`, async (t) => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const toolSurface = stubByokToolSurface({ settled: false, refusalPrefix: "PREFIX" });
  const { baseUrl } = await bootWithStubSurface(deps, toolSurface, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["workspace.manage"]);

  let capturedSystem: unknown;
  const providerUrl = await stubProvider(t, (_callCount, requestBody) => {
    capturedSystem = requestBody.system;
    return sseBody(messageStart(), textBlock(0, "Hello."), messageDelta("end_turn"), messageStop());
  });

  const res = await postByokTurn(baseUrl, cookie, { ...BYOK_BODY, byok: { ...BYOK_BODY.byok, baseUrl: providerUrl } });
  assert.equal(res.status, 200);
  await res.text();

  assert.equal(capturedSystem, `${SYSTEM_PREAMBLE}\n\nPREFIX\n\n${FEDERATION_STILL_CONNECTING_NOTE}`);
});

test(`${BYOK_TURN_PATH} sends the bare SYSTEM_PREAMBLE when the surface has no federation drift and awaitFederation settles`, async (t) => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const toolSurface = stubByokToolSurface({ settled: true });
  const { baseUrl } = await bootWithStubSurface(deps, toolSurface, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["workspace.manage"]);

  let capturedSystem: unknown;
  const providerUrl = await stubProvider(t, (_callCount, requestBody) => {
    capturedSystem = requestBody.system;
    return sseBody(messageStart(), textBlock(0, "Hello."), messageDelta("end_turn"), messageStop());
  });

  const res = await postByokTurn(baseUrl, cookie, { ...BYOK_BODY, byok: { ...BYOK_BODY.byok, baseUrl: providerUrl } });
  assert.equal(res.status, 200);
  await res.text();

  assert.equal(capturedSystem, SYSTEM_PREAMBLE);
});

/**
 * Coverage for the other 3 protocols (`byok-provider-turn.ts`'s `runOpenAiTurn`/`runAzureTurn`/
 * `runGoogleTurn`) — previously "implemented but unverified" per the 2026-08-04 milestone report.
 * OpenAI's own wire helpers below are copied from `@jini-ai/agent-runtime`'s
 * `providers/__tests__/openai-chat.test.ts` (same reasoning as the Anthropic helpers above: a drift
 * in either side's understanding of the shape should fail these tests, not pass vacuously). Azure
 * reuses the identical chunk shape — its chat/completions wire format is OpenAI-compatible, only the
 * request URL differs (`{baseUrl}/openai/deployments/{model}/chat/completions`, confirmed against
 * `azure-chat.ts`'s own `azureRequestUrl`).
 */
function chunk(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
function openAiDone(): string {
  return "data: [DONE]\n\n";
}
function openAiTextChunk(content: string): string {
  return chunk({ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content }, finish_reason: null }] });
}
function openAiToolCallStartChunk(index: number, id: string, name: string): string {
  return chunk({ id: "c1", choices: [{ index: 0, delta: { tool_calls: [{ index, id, type: "function", function: { name, arguments: "" } }] }, finish_reason: null }] });
}
function openAiToolCallArgsChunk(index: number, argsFragment: string): string {
  return chunk({ id: "c1", choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: argsFragment } }] }, finish_reason: null }] });
}
function openAiFinishChunk(reason: string): string {
  return chunk({ id: "c1", choices: [{ index: 0, delta: {}, finish_reason: reason }] });
}

test(`${BYOK_TURN_PATH} (openai protocol): a FAILED tool call folds isError into the content string, not a discarded field`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["workspace.manage"]);

  const requests: StubProviderRequest[] = [];
  let secondRequestBody: Record<string, unknown> | undefined;
  const providerUrl = await stubProvider(t, (callCount, requestBody, request) => {
    requests.push(request);
    if (callCount === 1) {
      // `workspace_update` with an EMPTY input — `updateWorkspace` itself throws
      // `WorkspaceValidationError` on an empty update (its own catalog entry's documented
      // contract: "At least one of name/slug is required"). A deterministic, real handler
      // failure — `ToolExecutor` catches it and reports `status: 'failed'`, exercising the exact
      // "OpenAiToolResult has no isError field" gap the milestone report flagged as unverified.
      // Routed through the meta-tool set (what the route publishes now), with `input: {}` as the
      // EMPTY update — so the failure under test is still `updateWorkspace`'s own thrown
      // `WorkspaceValidationError` surfacing as `ToolExecutor`'s `status: 'failed'`. Naming
      // `workspace_update` as the tool NAME here would also produce an `isError` result, but a
      // different one (`executeMetaTool`'s "not a callable tool here"), and this test would then
      // pass without ever reaching a real handler.
      return sseBody(
        openAiToolCallStartChunk(0, "call_1", "execute_delegated_tool"),
        openAiToolCallArgsChunk(0, '{"toolId":"workspace_update","input":{}}'),
        openAiFinishChunk("tool_calls"),
        openAiDone(),
      );
    }
    secondRequestBody = requestBody;
    return sseBody(openAiTextChunk("I could not update that."), openAiFinishChunk("stop"), openAiDone());
  });

  const res = await postByokTurn(baseUrl, cookie, { messages: BYOK_BODY.messages, byok: { protocol: "openai", apiKey: "sk-test-fake", model: "gpt-4o", baseUrl: providerUrl } });
  assert.equal(res.status, 200);
  const frames = parseSseFrames(await res.text());

  const toolResultFrame = frames.find((f) => f.event === "agent" && f.payload.type === "tool_result");
  assert.ok(toolResultFrame, "expected a tool_result event");
  // This is a real discovery, not an assumption going in: `runOpenAiToolTurn`'s OWN `tool_result`
  // event always reports `isError: false` for any plain-string content — verified by reading
  // `openai-chat.ts`'s internal result guard, which only ever sets `isError: true` for the
  // adapter's OWN content-shape violations (e.g. an oversized image), never for what a host's
  // `executeTool` returned. So the wire's `isError` is NOT trustworthy taken from the adapter
  // directly — `byok-provider-turn.ts`'s `runOpenAiTurn` derives it instead from whether `content`
  // carries the `[tool error]` fold marker. Both are asserted below: this is the property that
  // would break if that derivation were ever removed and the raw (always-false) adapter value crept
  // back in — a UI coloring a "failed" tool result off `isError` would stop distinguishing a failed
  // openai/azure tool call from a successful one, with only the text still saying so.
  assert.equal(toolResultFrame!.payload.isError, true);
  assert.match(String(toolResultFrame!.payload.content), /\[tool error\]/);

  // The actual wire assertion: OpenAI's `role:'tool'` message has no `isError` field at all, so the
  // ONLY way the model can learn this call failed is if the failure text is folded into `content`
  // itself. If `runOpenAiTurn`'s executeTool wrapper regressed to returning `{content, isError}`
  // unfolded, this second request would carry a bare success-looking tool message with the model
  // never told anything went wrong — this assertion is what would have caught that class of bug.
  assert.ok(secondRequestBody, "expected a second request once the tool result was appended");
  assert.match(JSON.stringify(secondRequestBody), /\[tool error\]/);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/chat/completions");
    assert.equal(request.headers.authorization, "Bearer sk-test-fake");
  }
});

test(`${BYOK_TURN_PATH} (azure protocol): a real tool round-trips through the OpenAI-compatible chat/completions wire shape`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["workspace.manage"]);

  const expectedWorkspace = await deps.workspaceRepo.findById({ id: deps.workspaceId });
  assert.ok(expectedWorkspace);
  let continuation: Record<string, unknown> | undefined;
  const requests: StubProviderRequest[] = [];
  const providerUrl = await stubProvider(t, (callCount, requestBody, request) => {
    requests.push(request);
    if (callCount === 2) continuation = requestBody;
    if (callCount === 1) {
      // Through the meta-tool set — see the Anthropic round-trip test's own note. Sent as two
      // argument fragments, which also keeps this test's coverage of the adapter's incremental
      // `arguments` reassembly now that there are real arguments to reassemble.
      return sseBody(
        openAiToolCallStartChunk(0, "call_1", "execute_delegated_tool"),
        openAiToolCallArgsChunk(0, '{"toolId":"content_read.'),
        openAiToolCallArgsChunk(0, 'workspace","input":{}}'),
        openAiFinishChunk("tool_calls"),
        openAiDone(),
      );
    }
    return sseBody(openAiTextChunk("This workspace is named Tovu Dev."), openAiFinishChunk("stop"), openAiDone());
  });

  const res = await postByokTurn(baseUrl, cookie, {
    messages: BYOK_BODY.messages,
    byok: { protocol: "azure", apiKey: "azure-test-fake", model: "gpt-4o-deployment", baseUrl: providerUrl },
  });
  assert.equal(res.status, 200);
  const frames = parseSseFrames(await res.text());

  const toolResultFrame = frames.find((f) => f.event === "agent" && f.payload.type === "tool_result");
  assert.ok(toolResultFrame, "expected a tool_result event");
  assert.equal(toolResultFrame!.payload.isError, false);
  assert.match(String(toolResultFrame!.payload.content), new RegExp(deps.workspaceId));
  const resultContent = String(toolResultFrame!.payload.content);
  assert.deepEqual(JSON.parse(resultContent), { workspace: expectedWorkspace });

  const endFrame = frames.find((f) => f.event === "end");
  assert.ok(endFrame, "expected a terminal end frame");
  assert.equal(requests.length, 2);
  assert.ok(continuation, "the provider must receive the real tool result");
  const messages = continuation!.messages as Array<Record<string, unknown>>;
  assert.deepEqual(messages.find((m) => m.role === "tool"), { role: "tool", tool_call_id: "call_1", content: resultContent });
  assert.equal(continuation!.model, undefined, "Azure selects the deployment in the URL");
  for (const request of requests) {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/openai/deployments/gpt-4o-deployment/chat/completions?api-version=2024-10-21");
    assert.equal(request.headers["api-key"], "azure-test-fake");
    assert.equal(request.headers.authorization, undefined);
  }
});

test(`${BYOK_TURN_PATH} (azure protocol): rejects with a clear error when no baseUrl is supplied, before any request`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["workspace.manage"]);

  // No provider stub needed: azure requires baseUrl, checked before any outbound request — see the
  // sibling "rejects a request with no usable BYOK credential" test's own identical note.
  const res = await postByokTurn(baseUrl, cookie, {
    messages: BYOK_BODY.messages,
    byok: { protocol: "azure", apiKey: "azure-test-fake", model: "gpt-4o-deployment" },
  });
  assert.equal(res.status, 200);
  const frames = parseSseFrames(await res.text());
  const errorFrame = frames.find((f) => f.event === "error");
  assert.ok(errorFrame, "expected an 'error' event naming the missing baseUrl");
  assert.match(String(errorFrame!.payload.message), /base url/i);
});

test(`${BYOK_TURN_PATH} (google protocol): a real tool round-trips through Gemini's streamGenerateContent wire shape`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["workspace.manage"]);

  // Mirrors `site-assistant-routes.test.ts`'s identical Gemini wire helpers exactly — same shape
  // `runGoogleToolTurn` actually parses.
  function functionCallCandidate(name: string, args: unknown, id: string): string {
    return chunk({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name, args, id } }] }, index: 0 }] });
  }
  function textCandidate(text: string, finishReason: string): string {
    return chunk({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason, index: 0 }] });
  }

  const expectedWorkspace = await deps.workspaceRepo.findById({ id: deps.workspaceId });
  assert.ok(expectedWorkspace);
  let continuation: Record<string, unknown> | undefined;
  const requests: StubProviderRequest[] = [];
  const providerUrl = await stubProvider(t, (callCount, requestBody, request) => {
    requests.push(request);
    if (callCount === 2) continuation = requestBody;
    if (callCount === 1) {
      return sseBody(functionCallCandidate("execute_delegated_tool", { toolId: "content_read.workspace", input: {} }, "call_1"), textCandidate("", "STOP"));
    }
    return sseBody(textCandidate("This workspace is named Tovu Dev.", "STOP"));
  });

  const res = await postByokTurn(baseUrl, cookie, {
    messages: BYOK_BODY.messages,
    byok: { protocol: "google", apiKey: "google-test-fake", model: "gemini-flash-latest", baseUrl: providerUrl },
  });
  assert.equal(res.status, 200);
  const frames = parseSseFrames(await res.text());

  const toolResultFrame = frames.find((f) => f.event === "agent" && f.payload.type === "tool_result");
  assert.ok(toolResultFrame, "expected a tool_result event");
  assert.equal(toolResultFrame!.payload.isError, false);
  assert.match(String(toolResultFrame!.payload.content), new RegExp(deps.workspaceId));
  const resultContent = String(toolResultFrame!.payload.content);
  assert.deepEqual(JSON.parse(resultContent), { workspace: expectedWorkspace });

  const endFrame = frames.find((f) => f.event === "end");
  assert.ok(endFrame, "expected a terminal end frame");
  assert.equal(requests.length, 2);
  assert.ok(continuation, "the provider must receive the real tool result");
  const contents = continuation!.contents as Array<{ parts: unknown[] }>;
  assert.deepEqual(contents.at(-1)!.parts, [{ functionResponse: {
    name: "execute_delegated_tool", id: "call_1", response: { content: resultContent, isError: false },
  } }]);
  for (const request of requests) {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse");
    assert.equal(request.headers["x-goog-api-key"], "google-test-fake");
  }
});

/** The gated tool this section parks: permanent deletion still waits for a human Confirm click. */
const PURGE_TOOL_ID = "trash_purge_item";

/** Seeds one draft post, moves it to the Trash, and stubs the Anthropic turn that asks
 *  `trash_purge_item` to permanently delete its Trash row — the shared setup for every test below in
 *  this section. Turn 2's stub is generic ("Done.") because each test's own assertions are about the
 *  tool_result/redemption plumbing, not the model's final wording. Returns the stub server's URL,
 *  which the caller must thread into the request body's `byok.baseUrl` field. */
async function seedTrashedPostAndStubPurgeTurn(t: import("node:test").TestContext, deps: RouteDeps, postId: string): Promise<string> {
  await deps.postRepo.save({
    id: postId,
    workspaceId: deps.workspaceId,
    title: "BYOK emitSurface probe",
    slug: postId,
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "draft",
    kind: "post",
    updatedAt: deps.clock.nowIso(),
    version: 1,
  });
  const marker = await deps.trash.trash({
    workspaceId: deps.workspaceId,
    entityType: POST_ENTITY_TYPE,
    entityId: postId,
    actor: { principalId: "seed" },
    display: { title: "BYOK emitSurface probe" },
    at: deps.clock.nowIso(),
    expectedVersion: 1,
  });
  assert.equal(marker.ok, true, "seeding the post into the Trash");
  const trashItemId = await trashRowFor(deps, postId);
  assert.ok(trashItemId, "the trashed post must have a Trash row");

  return stubProvider(t, (callCount) => {
    if (callCount === 1) {
      return sseBody(
        messageStart(),
        toolUseBlock(0, "toolu_1", "execute_delegated_tool", { toolId: PURGE_TOOL_ID, input: { trashItemId } }),
        messageDelta("tool_use"),
        messageStop(),
      );
    }
    return sseBody(messageStart("msg_2"), textBlock(0, "Done."), messageDelta("end_turn"), messageStop());
  });
}

/** The first-party contributed domains (`trash_purge_item` among them) a hand-built surface needs —
 *  `createApp`'s own BYOK module installs these; a test composing `createByokToolSurface` directly
 *  must pass them itself. */
function firstPartyContributions() {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  return contributions;
}

/** The Trash row id holding `postId`, or undefined once it has been purged. */
async function trashRowFor(deps: RouteDeps, postId: string): Promise<string | undefined> {
  const page = await deps.trash.list({ workspaceId: deps.workspaceId, now: deps.clock.nowIso(), limit: 50 });
  return page.items.find((item) => item.entityType === POST_ENTITY_TYPE && item.entityId === postId)?.id;
}

/**
 * `trash_purge_item` stands in for `content_post_delete`, which raised a confirmation card here until
 * 6eac86229 ("confirm destructive and protected actions only") made reversible removal immediate.
 * Permanent deletion still waits for a human Confirm click, so it is the gated tool this section
 * drives. Before the redemption slice, BYOK mode omitted `emitSurface` entirely and a gated tool
 * failed closed with a thrown error rather than parking (see git history for that prior test).
 * `assistant-byok.ts` now builds a real `SurfaceEmitter` per tool call, so this same tool call PARKS
 * instead — and `modules/assistant.ts`'s redemption proxy can deliver into it directly, against the
 * SAME `surfaceExchanges` store `app.ts` composed both modules with. This test proves the whole chain
 * is reachable end-to-end, through the real routes, with a real effect (the post is actually purged) —
 * not just that a surface event appears on the wire.
 */
test(`${BYOK_TURN_PATH}: trash_purge_item PARKS via a real emitSurface, and redeeming the confirmation through the LOCAL (non-daemon) delivery path actually purges the post`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["content.read", "content.write"]);

  const otherCookie = await loginWithPermissions(deps, baseUrl, ["content.read", "content.write"]);

  const postId = `byok-park-redeem-confirm-${Date.now()}`;
  const providerUrl = await seedTrashedPostAndStubPurgeTurn(t, deps, postId);

  const res = await postByokTurn(baseUrl, cookie, { messages: [{ role: "user", content: "Delete that draft post." }], byok: { ...BYOK_BODY.byok, baseUrl: providerUrl } });
  assert.equal(res.status, 200);
  assert.ok(res.body, "expected a readable stream body");
  const reader = res.body!.getReader();

  // `reader.cancel()` in `finally`, not left to `bootAuthenticated`'s own `t.after(() => server.close())`:
  // if any assertion below throws WHILE the exchange is still parked (e.g. before redemption), the
  // server-side handler stays blocked in `askOnce` and `server.close()` would then wait out the full
  // production TTL before its callback fires — turning a fast assertion failure into a slow one. See
  // this file's own commit history for the standalone repro that caught exactly this shape of bug in
  // `extractExchangeId`. Cancelling here unconditionally closes the connection, which the server's own
  // `res.on("close", ...)` guard (`assistant-byok.ts`) already turns into a clean abort.
  try {
    // Read only until the confirmation dialog appears — the server-side handler is now parked on
    // `askOnce`, awaiting exactly the redemption POST below, and will not produce a `tool_result` or
    // `end` frame until it arrives. Reading the whole body first (`res.text()`) would hang forever.
    const { frames: framesBeforeRedemption, done: endedBeforeSurface } = await readSseFramesLive(
      reader,
      (frame) => frame.event === "agent" && frame.payload.type === "mcp-ui",
    );
    assert.ok(!endedBeforeSurface, "the stream ended before raising a confirmation dialog — the tool did not park");
    const surfaceFrame = framesBeforeRedemption.find((f) => f.event === "agent" && f.payload.type === "mcp-ui")!;
    assert.equal(surfaceFrame.payload.toolUseId, "toolu_1", "the surface must correlate to the tool_use that raised it");
    const exchangeId = extractExchangeId(surfaceFrame.payload);

    const foreignRedeem = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
      method: "POST",
      headers: { cookie: otherCookie, "content-type": "application/json" },
      body: JSON.stringify({ toolName: PURGE_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" } }),
    });
    assert.equal(foreignRedeem.status, 409);
    assert.equal((await foreignRedeem.json()).reason, "binding-mismatch");
    assert.ok(await trashRowFor(deps, postId), "a foreign redemption must not purge the post");

    // The redemption call: a separate HTTP request, exactly the shape `McpUiSurfaceCard`'s
    // "Permanently delete" button issues, hitting the SAME endpoint the daemon-mode path uses.
    const redeem = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ toolName: PURGE_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" } }),
    });
    assert.equal(redeem.status, 202, "expected the LOCAL store to deliver — a 4xx/5xx here means it fell through to (or was rejected by) the daemon instead");
    assert.deepEqual(await redeem.json(), { delivered: true });

    // Now drain the rest of the original stream — the parked call has been answered and the turn can
    // finish.
    const { frames: remainingFrames } = await readSseFramesLive(reader, () => false);
    const frames = [...framesBeforeRedemption, ...remainingFrames];

    const toolResultFrame = frames.find((f) => f.event === "agent" && f.payload.type === "tool_result");
    assert.ok(toolResultFrame, "expected a tool_result event — the parked call resolved, it did not hang");
    assert.notEqual(toolResultFrame!.payload.isError, true);
    const parsedResult = JSON.parse(String(toolResultFrame!.payload.content)) as { removed: boolean; purged: number };
    assert.equal(parsedResult.removed, true);
    assert.equal(parsedResult.purged, 1);

    const endFrame = frames.find((f) => f.event === "end");
    assert.ok(endFrame, "expected a terminal end frame — the turn completed normally");
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  assert.equal(await trashRowFor(deps, postId), undefined, "the Trash row must be gone");
  assert.equal(
    await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: postId }),
    null,
    "the post must actually be purged — this is a real effect, not a stubbed one",
  );
});

test(`${BYOK_TURN_PATH}: disconnecting a parked purge aborts the tool, closes its exchange, and prevents deletion`, { timeout: 15_000 }, async (t) => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const store = createSurfaceExchangeStore({ idleTtlMs: 5_000, maxLifetimeMs: 5_000 });
  const surface = createByokToolSurface(deps, { surfaceExchangeStore: store, contributions: firstPartyContributions() });
  const execute = surface.executeMetaTool.bind(surface);
  let toolSignal: AbortSignal | undefined;
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const observedSurface = {
    ...surface,
    executeMetaTool: async (...args: Parameters<ByokToolSurface["executeMetaTool"]>) => {
      toolSignal = args[3];
      try {
        return await execute(...args);
      } finally {
        resolveFinished();
      }
    },
  };
  const { baseUrl } = await bootWithStubSurface(deps, observedSurface, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["content.read", "content.write"]);
  const postId = "byok-disconnected-delete";
  const providerUrl = await seedTrashedPostAndStubPurgeTurn(t, deps, postId);
  const res = await postByokTurn(baseUrl, cookie, { ...BYOK_BODY, byok: { ...BYOK_BODY.byok, baseUrl: providerUrl } });
  const reader = res.body!.getReader();
  try {
    const { frames } = await readSseFramesLive(reader, (f) => f.event === "agent" && f.payload.type === "mcp-ui");
    assert.ok(frames.some((f) => f.payload.type === "mcp-ui"));
    assert.equal(store.size(), 1);
    assert.ok(toolSignal);
    assert.equal(toolSignal.aborted, false);
    await reader.cancel();
    await finished;
    assert.equal(toolSignal.aborted, true, "the HTTP close must abort the active tool");
    assert.equal(store.size(), 0, "the abandoned exchange must be cleaned up");
    assert.ok(await trashRowFor(deps, postId), "an abandoned purge must leave the post in the Trash");
  } finally {
    await reader.cancel().catch(() => undefined);
  }
});

test(`${BYOK_TURN_PATH}: cancelling the same confirmation dialog leaves the post untouched`, async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["content.read", "content.write"]);

  const postId = `byok-park-redeem-cancel-${Date.now()}`;
  const providerUrl = await seedTrashedPostAndStubPurgeTurn(t, deps, postId);

  const res = await postByokTurn(baseUrl, cookie, { messages: [{ role: "user", content: "Delete that draft post." }], byok: { ...BYOK_BODY.byok, baseUrl: providerUrl } });
  const reader = res.body!.getReader();

  // See the sibling "confirm" test above for why cleanup is explicit here rather than left to
  // `bootAuthenticated`'s own `t.after(() => server.close())`.
  try {
    const { frames: framesBeforeRedemption } = await readSseFramesLive(reader, (frame) => frame.event === "agent" && frame.payload.type === "mcp-ui");
    const surfaceFrame = framesBeforeRedemption.find((f) => f.event === "agent" && f.payload.type === "mcp-ui")!;
    const exchangeId = extractExchangeId(surfaceFrame.payload);

    const redeem = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ toolName: PURGE_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" } }),
    });
    assert.equal(redeem.status, 202);

    const { frames: remainingFrames } = await readSseFramesLive(reader, () => false);
    const frames = [...framesBeforeRedemption, ...remainingFrames];
    const toolResultFrame = frames.find((f) => f.event === "agent" && f.payload.type === "tool_result");
    assert.ok(toolResultFrame);
    const parsedResult = JSON.parse(String(toolResultFrame!.payload.content)) as { removed: boolean; cancelled: boolean };
    assert.equal(parsedResult.removed, false);
    assert.equal(parsedResult.cancelled, true);
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  assert.ok(await trashRowFor(deps, postId), "cancelling must not delete anything");
});

/**
 * The no-hang property, proven structurally rather than by waiting out the real thing: production
 * uses `surface-exchanges.ts`'s `DEFAULT_SURFACE_MAX_LIFETIME_MS` (5.5 minutes) as the hard ceiling on
 * an unredeemed park, which would make a literal test of it both slow and a bad use of a shared test
 * run (see `PRIORITY: scoped test runs only`). `createByokToolSurface`'s injectable
 * `surfaceExchangeStore` override (added for exactly this) lets this test swap in a store with
 * millisecond TTLs, exercising the SAME code path (`trash_purge_item`'s `askOnce` loop,
 * `SurfaceExchangeStore`'s own idle/lifetime timers) production uses — only the constant differs.
 * Built with a hand-assembled express app (not `createApp`) because `createApp` always builds its
 * BYOK surface with the production defaults; this is the one place that needs to override them.
 */
test(`${BYOK_TURN_PATH}: an UNREDEEMED confirmation resolves via its own bounded TTL — it does not hang the request for anywhere near the production 5.5-minute ceiling`, async (t) => {
  const deps = createRouteDeps();
  await deps.identityReady;

  const shortTtlStore = createSurfaceExchangeStore({ idleTtlMs: 30, maxLifetimeMs: 60 });
  const toolSurface = createByokToolSurface(deps, { surfaceExchangeStore: shortTtlStore, contributions: firstPartyContributions() });

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  createAssistantByokModule(deps, toolSurface).registerRoutes?.(app);

  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["content.read", "content.write"]);

  const postId = `byok-no-hang-probe-${Date.now()}`;
  const providerUrl = await seedTrashedPostAndStubPurgeTurn(t, deps, postId);

  const startedAt = Date.now();
  const res = await postByokTurn(baseUrl, cookie, { messages: [{ role: "user", content: "Delete that draft post." }], byok: { ...BYOK_BODY.byok, baseUrl: providerUrl } });
  assert.equal(res.status, 200);
  const frames = parseSseFrames(await res.text()); // safe to buffer here — nobody redeems, so the short TTL is what ends the wait
  const elapsedMs = Date.now() - startedAt;

  assert.ok(elapsedMs < 5_000, `expected the short-TTL override to end the park in well under 5s (it did not redeem), took ${elapsedMs}ms`);

  const surfaceFrame = frames.find((f) => f.event === "agent" && f.payload.type === "mcp-ui");
  assert.ok(surfaceFrame, "expected the confirmation dialog to be raised — proves parking happened, not a fail-closed short-circuit");

  const toolResultFrame = frames.find((f) => f.event === "agent" && f.payload.type === "tool_result");
  assert.ok(toolResultFrame, "expected a tool_result event — the parked call resolved on its own, it did not hang the request");
  assert.notEqual(toolResultFrame!.payload.isError, true, "an expired confirmation is a truthful RESULT the model can read, not a thrown error");
  const parsedResult = JSON.parse(String(toolResultFrame!.payload.content)) as { removed: boolean; reason?: string };
  assert.equal(parsedResult.removed, false);
  assert.equal(parsedResult.reason, "expired");

  const endFrame = frames.find((f) => f.event === "end");
  assert.ok(endFrame, "expected a terminal end frame — the turn completed, it did not hang");

  assert.ok(await trashRowFor(deps, postId), "nothing was deleted — the confirmation never arrived");
});

// --- Spans: one root agent-run span per BYOK turn, named for the protocol, ended with how the turn
// ended — never exporting the API key or the conversation.

/** Boots the BYOK route with an in-memory OTel port injected as `RouteDeps.observability`. */
async function bootTraced(t: import("node:test").TestContext) {
  const { exporter, port } = createInMemoryOtel();
  const deps = createRouteDeps();
  deps.observability = port;
  const { baseUrl } = await bootAuthenticated(createApp(deps), t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["workspace.manage"]);
  const agentRunSpan = async () => {
    const find = () => exporter.getFinishedSpans().find((span) => span.name.startsWith("invoke_agent"));
    for (let waited = 0; !find() && waited < 2_000; waited += 10) await new Promise((r) => setTimeout(r, 10));
    const span = find();
    assert.ok(span, "expected one agent-run span");
    return span;
  };
  return { baseUrl, cookie, agentRunSpan };
}

test(`${BYOK_TURN_PATH} spans: a completed turn is one root invoke_agent span named for the protocol, succeeded`, async (t) => {
  const { baseUrl, cookie, agentRunSpan } = await bootTraced(t);
  const providerUrl = await stubProvider(t, () => sseBody(messageStart(), textBlock(0, "Hi."), messageDelta("end_turn"), messageStop()));

  await (await postByokTurn(baseUrl, cookie, { ...BYOK_BODY, byok: { ...BYOK_BODY.byok, baseUrl: providerUrl } })).text();

  const run = await agentRunSpan();
  assert.equal(run.name, "invoke_agent anthropic");
  assert.equal(run.kind, SpanKind.INTERNAL);
  assert.equal(run.parentSpanContext, undefined, "a turn is its own trace root");
  assert.equal(run.attributes["agent.run.status"], "succeeded");
  assert.equal(typeof run.attributes["agent.run.id"], "string");
  assert.equal(run.status.code, SpanStatusCode.UNSET);
  assertSpanOmits(run, [BYOK_BODY.byok.apiKey, "What is this workspace called"]);
});

test(`${BYOK_TURN_PATH} spans: a provider failure ends the turn's span as failed with an ERROR status`, async (t) => {
  const { baseUrl, cookie, agentRunSpan } = await bootTraced(t);
  const providerUrl = await stubProvider(t, () => ({ status: 401, body: JSON.stringify({ error: { message: "invalid x-api-key" } }) }));

  await (await postByokTurn(baseUrl, cookie, { ...BYOK_BODY, byok: { ...BYOK_BODY.byok, baseUrl: providerUrl } })).text();

  const run = await agentRunSpan();
  assert.equal(run.attributes["agent.run.status"], "failed");
  assert.equal(run.status.code, SpanStatusCode.ERROR);
  assertSpanOmits(run, [BYOK_BODY.byok.apiKey, "invalid x-api-key"]);
});

test(`${BYOK_TURN_PATH} spans: the browser disconnecting mid-turn ends the span as canceled, not failed`, async (t) => {
  const { baseUrl, cookie, agentRunSpan } = await bootTraced(t);
  let arrived!: () => void;
  const providerCalled = new Promise<void>((resolve) => { arrived = resolve; });
  const silentProvider = createServer(() => arrived()); // never answers: the turn is mid-flight
  await new Promise<void>((resolve) => silentProvider.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    silentProvider.closeAllConnections();
    return new Promise<void>((resolve) => silentProvider.close(() => resolve()));
  });
  const controller = new AbortController();

  const pending = fetch(`${baseUrl}${BYOK_TURN_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ ...BYOK_BODY, byok: { ...BYOK_BODY.byok, baseUrl: `http://127.0.0.1:${(silentProvider.address() as AddressInfo).port}` } }),
    signal: controller.signal,
  }).then((res) => res.text());
  await providerCalled;
  controller.abort();
  await assert.rejects(pending);

  const run = await agentRunSpan();
  assert.equal(run.attributes["agent.run.status"], "canceled");
  assert.equal(run.status.code, SpanStatusCode.UNSET);
});
