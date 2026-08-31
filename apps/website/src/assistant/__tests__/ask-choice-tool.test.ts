import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter } from "@jini-ai/core";
import type { ToolRegistration } from "@jini-ai/cms/core";

import { ASK_CHOICE_TOOL_ID, buildAskChoiceRegistrations } from "../ask-choice-tool.js";
import {
  SURFACE_DISMISSED_PARAM,
  SURFACE_EXCHANGE_ID_PARAM,
  createSurfaceExchangeStore,
  type SurfaceExchangeStore,
} from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file `assistant_ask_choice`'s own round trip, end to end through a real tool handler — the
 * production counterpart to `demo-choices-tool.test.ts`. That file proves the held-open MCP-UI
 * exchange mechanism works at all; this one proves the same mechanism carries MODEL-SUPPLIED
 * content (an arbitrary title, arbitrary options) rather than the fixed "Basic/Pro/Team" sample, and
 * that a genuinely single-select-only or multi-select-only question round-trips correctly (the
 * demo tool always sends both fields, so it never exercised either field being absent).
 */

function buildHandler(surfaceExchanges: SurfaceExchangeStore) {
  const registrations: ToolRegistration[] = buildAskChoiceRegistrations(undefined, { surfaceExchanges });
  const registration = registrations.find((r) => r.descriptor.id === ASK_CHOICE_TOOL_ID);
  assert.ok(registration, "the tool must be wired");
  return registration.handler;
}

interface CallOptions {
  input?: unknown;
  emitSurface?: SurfaceEmitter;
  signal?: AbortSignal;
}

function call(handler: ReturnType<typeof buildHandler>, options: CallOptions = {}) {
  return handler({
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: "run-1" },
    input: options.input ?? {},
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  } as Parameters<typeof handler>[0]);
}

/** Pulls the exchange id out of the emitted surface's HTML, the way the rendered iframe would. */
function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the administrator's answer has nothing to name");
  return match[1]!;
}

const MOBILE_CSS_CALL = {
  title: "Apply the mobile CSS fix now?",
  description: "The warped layout is caused by a hard-coded padding-bottom in the mobile breakpoint.",
  singleSelect: {
    label: "What should I do?",
    options: [
      { value: "apply", label: "Apply the fix now" },
      { value: "wait", label: "Wait for my review" },
    ],
  },
};

test("a single-select question round-trips the model's own title and options, not a fixed sample", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];

  const pending = call(handler, {
    input: MOBILE_CSS_CALL,
    emitSurface: async (surface) => {
      emitted.push(surface);
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1);
  assert.equal(surfaceExchanges.size(), 1);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the administrator answers",
  );

  const html = (emitted[0] as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  assert.match(html, /Apply the mobile CSS fix now\?/, "the model's own title must appear in the rendered form");
  assert.match(html, /Wait for my review/, "the model's own option label must appear in the rendered form");

  const exchangeId = exchangeIdFromSurface(emitted[0]);
  const delivered = surfaceExchanges.deliver({
    exchangeId,
    toolId: ASK_CHOICE_TOOL_ID,
    principalId: "principal-1",
    params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, choice: "wait" },
  });
  assert.deepEqual(delivered, { ok: true });

  assert.deepEqual(await pending, {
    submitted: true,
    choice: "wait",
    note: "Tell the administrator what you understood from their answer, in plain language, before proceeding.",
  });
});

test("a multi-select-only question has no 'choice' field at all, and an empty selection is a real answer", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];

  const pending = call(handler, {
    input: {
      title: "Which extras should I enable?",
      multiSelect: {
        label: "Extras",
        options: [
          { value: "analytics", label: "Analytics" },
          { value: "backups", label: "Backups" },
        ],
      },
    },
    emitSurface: async (s) => void emitted.push(s),
  });

  await new Promise((resolve) => setImmediate(resolve));
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({
    exchangeId,
    toolId: ASK_CHOICE_TOOL_ID,
    principalId: "principal-1",
    params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, selections: [] },
  });

  assert.deepEqual(await pending, {
    submitted: true,
    selections: [],
    note: "Tell the administrator what you understood from their answer, in plain language, before proceeding.",
  });
});

test("a question with both fields returns both the choice and the selections", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];

  const pending = call(handler, {
    input: {
      title: "Rollout plan",
      singleSelect: { label: "Plan", options: [{ value: "now", label: "Now" }, { value: "later", label: "Later" }] },
      multiSelect: { label: "Notify", options: [{ value: "email", label: "Email" }, { value: "slack", label: "Slack" }] },
    },
    emitSurface: async (s) => void emitted.push(s),
  });

  await new Promise((resolve) => setImmediate(resolve));
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({
    exchangeId,
    toolId: ASK_CHOICE_TOOL_ID,
    principalId: "principal-1",
    params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, choice: "now", selections: ["email", "slack"] },
  });

  assert.deepEqual(await pending, {
    submitted: true,
    choice: "now",
    selections: ["email", "slack"],
    note: "Tell the administrator what you understood from their answer, in plain language, before proceeding.",
  });
});

test("Cancel resolves the call immediately instead of stranding it until the TTL", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];
  const pending = call(handler, { input: MOBILE_CSS_CALL, emitSurface: async (s) => void emitted.push(s) });

  await new Promise((resolve) => setImmediate(resolve));
  const exchangeId = exchangeIdFromSurface(emitted[0]);

  surfaceExchanges.deliver({
    exchangeId,
    toolId: ASK_CHOICE_TOOL_ID,
    principalId: "principal-1",
    params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true },
  });

  const result = (await pending) as { submitted: boolean; reason: string; note: string };
  assert.equal(result.submitted, false);
  assert.equal(result.reason, "cancelled");
  assert.match(result.note, /Do not assume any answer/);
});

test("an unanswered form returns an explicit no-answer result, not a hang or a throw", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const handler = buildHandler(surfaceExchanges);

  const result = (await call(handler, { input: MOBILE_CSS_CALL, emitSurface: async () => undefined })) as {
    submitted: boolean;
    reason: string;
    note: string;
  };

  assert.equal(result.submitted, false);
  assert.equal(result.reason, "expired");
  assert.match(result.note, /did not respond/);
});

test("a cancelled run closes the exchange rather than holding the handler to the deadline", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const controller = new AbortController();

  const pending = call(handler, { input: MOBILE_CSS_CALL, emitSurface: async () => undefined, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(surfaceExchanges.size(), 1);

  controller.abort();

  const result = (await pending) as { submitted: boolean; reason: string };
  assert.equal(result.reason, "abandoned");
  assert.equal(surfaceExchanges.size(), 0);
});

test("with no emit seam the tool falls back to returning the surface, and opens no exchange", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);

  const result = (await call(handler, { input: MOBILE_CSS_CALL })) as { content: Array<{ type: string }> };

  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange — open() requires one");
  assert.equal(result.content[0]?.type, "text");
  assert.equal(result.content[1]?.type, "resource");
});

test("the fallback's second call still echoes the administrator's selections to the agent", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);

  const result = await call(handler, { input: { choice: "wait" } });

  assert.deepEqual(result, {
    submitted: true,
    choice: "wait",
    note: "Tell the administrator what you understood from their answer, in plain language, before proceeding.",
  });
});

test("rejects a call with no title, decorated with the tool's own schema so the model can correct in one turn", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);

  await assert.rejects(
    call(handler, { input: { singleSelect: MOBILE_CSS_CALL.singleSelect } }),
    (error: Error) => {
      assert.match(error.message, /'title' is required/);
      assert.match(error.message, /retry/i);
      assert.match(error.message, /assistant_ask_choice/);
      return true;
    },
  );
});

test("rejects a call with neither singleSelect nor multiSelect", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);

  await assert.rejects(
    call(handler, { input: { title: "Pick something" } }),
    /at least one of 'singleSelect' or 'multiSelect' is required/,
  );
});

test("registers unconditionally, publishing its own catalog schema", () => {
  const registrations = buildAskChoiceRegistrations(undefined, { surfaceExchanges: createSurfaceExchangeStore() });
  const registration = registrations.find((r) => r.descriptor.id === ASK_CHOICE_TOOL_ID);
  assert.ok(registration, "the tool must register");
  assert.ok(registration.descriptor.inputSchema, "the tool must publish an inputSchema");
});
