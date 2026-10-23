import assert from "node:assert/strict";
import test from "node:test";
import Ajv from "ajv";

import type { SurfaceEmitter } from "@jini-ai/core";
import type { ToolRegistration } from "@jini-ai/core";

import { ASK_CHOICE_ANSWER_TICKET_PARAM, ASK_CHOICE_TOOL_ID, askChoiceAgentToolCatalog, buildAskChoiceRegistrations } from "../ask-choice-tool.js";
import {
  SURFACE_DISMISSED_PARAM,
  SURFACE_EXCHANGE_ID_PARAM,
  createSurfaceExchangeStore,
  type SurfaceExchangeStore,
} from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


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
  principalId?: string;
}

function call(handler: ReturnType<typeof buildHandler>, options: CallOptions = {}) {
  return handler({
    executionId: "exec-1",
    principal: { id: options.principalId ?? "principal-1" },
    run: { id: "run-1" },
    input: options.input ?? {},
    signal: options.signal ?? new AbortController().signal,
  } as Parameters<typeof handler>[0], {
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  });
}

/** Pulls the exchange id out of the emitted surface's HTML, the way the rendered iframe would. */
function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the administrator's answer has nothing to name");
  return match[1]!;
}

/** Pulls the fallback path's answer ticket out of a directly-returned tool result's HTML, the way
 *  the rendered iframe's own submission would. */
function answerTicketFromResult(result: unknown): string {
  const html = (result as { content: Array<{ resource?: { text: string } }> }).content[1]?.resource?.text ?? "";
  const match = html.match(new RegExp(`${ASK_CHOICE_ANSWER_TICKET_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the fallback surface must carry its answer ticket, or a real submission has nothing to redeem");
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
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
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
  const delivered = surfaceExchanges.deliver({ exchangeId, principalId: "principal-1", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, choice: "wait" } }, { toolId: ASK_CHOICE_TOOL_ID });
  assert.deepEqual(delivered, { ok: true });

  assert.deepEqual(await pending, {
    submitted: true,
    choice: "wait",
    note: "Tell the administrator what you understood from their answer, in plain language, before proceeding.",
  });
});

test("Tovuize's unchecked static opt-out submits true with empty selections and no choice", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];

  const pending = call(handler, {
    input: {
      title: "How should I convert this website?",
      description: "By default, images go into Media and pages become editable Tovu Pages.",
      submitLabel: "Convert website",
      multiSelect: {
        label: "Optional",
        options: [
          { value: "static", label: "Keep it as a static theme — same appearance, without individual page editing" },
        ],
      },
    },
    emitSurface: async (s) => void emitted.push(s),
  });

  await new Promise((resolve) => setImmediate(resolve));
  const html = (emitted[0] as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  assert.match(html, /Convert website/);
  assert.doesNotMatch(html, /<input[^>]*type="checkbox"[^>]*\schecked(?:[\s=>])/);
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({ exchangeId, principalId: "principal-1", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, selections: [] } }, { toolId: ASK_CHOICE_TOOL_ID });

  assert.deepEqual(await pending, {
    submitted: true,
    selections: [],
    note: "Tell the administrator what you understood from their answer, in plain language, before proceeding.",
  });
});

test("a question with both fields returns both the choice and the selections", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
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
  surfaceExchanges.deliver({ exchangeId, principalId: "principal-1", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, choice: "now", selections: ["email", "slack"] } }, { toolId: ASK_CHOICE_TOOL_ID });

  assert.deepEqual(await pending, {
    submitted: true,
    choice: "now",
    selections: ["email", "slack"],
    note: "Tell the administrator what you understood from their answer, in plain language, before proceeding.",
  });
});

test("Cancel resolves the call immediately instead of stranding it until the TTL", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];
  const pending = call(handler, { input: MOBILE_CSS_CALL, emitSurface: async (s) => void emitted.push(s) });

  await new Promise((resolve) => setImmediate(resolve));
  const exchangeId = exchangeIdFromSurface(emitted[0]);

  surfaceExchanges.deliver({ exchangeId, principalId: "principal-1", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true } }, { toolId: ASK_CHOICE_TOOL_ID });

  const result = (await pending) as { submitted: boolean; reason: string; note: string };
  assert.equal(result.submitted, false);
  assert.equal(result.reason, "cancelled");
  assert.match(result.note, /Do not assume any answer/);
});

test("an unanswered form returns an explicit no-answer result, not a hang or a throw", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, { idleTtlMs: 1 });
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
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
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
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges);

  const result = (await call(handler, { input: MOBILE_CSS_CALL })) as { content: Array<{ type: string }> };

  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange — open() requires one");
  assert.equal(result.content[0]?.type, "text");
  assert.equal(result.content[1]?.type, "resource");
});

test("the fallback's second call still echoes the administrator's selections to the agent, when it carries the real ticket", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges);

  const opened = (await call(handler, { input: MOBILE_CSS_CALL })) as { content: Array<{ resource?: { text: string } }> };
  const ticket = answerTicketFromResult(opened);

  const result = await call(handler, { input: { choice: "wait", [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket } });

  assert.deepEqual(result, {
    submitted: true,
    choice: "wait",
    note: "Tell the administrator what you understood from their answer, in plain language, before proceeding.",
  });
});

test("a real fallback ticket refuses choices and selections outside its rendered options", async (t) => {
  const handler = buildHandler(createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }));
  for (const answer of [
    { choice: "never-offered" },
    { choice: "wait", selections: ["never-offered"] },
    { selections: ["never-offered"] },
  ]) {
    await t.test(JSON.stringify(answer), async () => {
      const input = {
        title: MOBILE_CSS_CALL.title,
        ...("choice" in answer ? { singleSelect: MOBILE_CSS_CALL.singleSelect } : {}),
        multiSelect: { label: "Extras", options: [{ value: "email", label: "Email" }] },
      };
      const ticket = answerTicketFromResult(await call(handler, { input }));
      await assert.rejects(
        call(handler, { input: { ...answer, [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket } }),
        /does not match a form that is currently outstanding/,
      );
    });
  }
});

test("a fallback ticket accepts only the choices and selections offered by its own form", async () => {
  const handler = buildHandler(createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }));
  const input = { ...MOBILE_CSS_CALL, multiSelect: { label: "Extras", options: [{ value: "email", label: "Email" }] } };
  const ticket = answerTicketFromResult(await call(handler, { input }));
  const result = await call(handler, { input: { choice: "wait", selections: ["email"], [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket } });
  assert.equal((result as { submitted: boolean }).submitted, true);
  assert.equal((result as { choice: string }).choice, "wait");
  assert.deepEqual((result as { selections: string[] }).selections, ["email"]);
});

test("a fabricated second call with no ticket at all is refused, never reported as submitted", async () => {
  // This is the forgery the model itself could attempt: no form was ever rendered for this input,
  // so there is nothing to redeem. Before the fix this returned `{ submitted: true, choice:
  // 'media_generate_asset', ... }` — a decision the administrator never made, echoed straight into
  // the agent's next turn. The exact scenario a live incident traced a paid credential spend to.
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges);

  await assert.rejects(
    call(handler, { input: { choice: "media_generate_asset" } }),
    (error: Error) => {
      assert.match(error.message, /does not match a form that is currently outstanding/);
      assert.match(error.message, /never set 'choice' or 'selections' yourself/i);
      return true;
    },
  );
});

test("a second call carrying an unknown ticket is refused the same way as no ticket", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges);

  await assert.rejects(
    call(handler, { input: { choice: "wait", [ASK_CHOICE_ANSWER_TICKET_PARAM]: "not-a-real-ticket" } }),
    /does not match a form that is currently outstanding/,
  );
});

test("a ticket already redeemed once cannot be replayed", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges);

  const opened = (await call(handler, { input: MOBILE_CSS_CALL })) as { content: Array<{ resource?: { text: string } }> };
  const ticket = answerTicketFromResult(opened);

  const first = await call(handler, { input: { choice: "wait", [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket } });
  assert.deepEqual((first as { submitted: boolean }).submitted, true);

  await assert.rejects(
    call(handler, { input: { choice: "apply", [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket } }),
    /does not match a form that is currently outstanding/,
  );
});

test("a ticket minted for one administrator cannot be redeemed by another", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges);

  const opened = (await call(handler, { input: MOBILE_CSS_CALL, principalId: "principal-1" })) as {
    content: Array<{ resource?: { text: string } }>;
  };
  const ticket = answerTicketFromResult(opened);

  await assert.rejects(
    call(handler, { input: { choice: "wait", [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket }, principalId: "principal-2" }),
    /does not match a form that is currently outstanding/,
  );
});

test("rejects a call with no title, decorated with the tool's own schema so the model can correct in one turn", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
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
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges);

  await assert.rejects(
    call(handler, { input: { title: "Pick something" } }),
    /at least one of 'singleSelect' or 'multiSelect' is required/,
  );
});

test("registers unconditionally, publishing its own catalog schema", () => {
  const registrations = buildAskChoiceRegistrations(undefined, { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) });
  const registration = registrations.find((r) => r.descriptor.id === ASK_CHOICE_TOOL_ID);
  assert.ok(registration, "the tool must register");
  assert.ok(registration.descriptor.inputSchema, "the tool must publish an inputSchema");
  const schema = registration.descriptor.inputSchema as {
    type: string;
    required: string[];
    anyOf: Array<{ required: string[] }>;
    properties: Record<string, {
      type: string;
      required: string[];
      properties: { label: { type: string }; options: {
        type: string; minItems: number;
        items: { type: string; required: string[]; properties: Record<string, { type: string }> };
      } };
    }>;
  };
  assert.equal(schema.type, "object");
  assert.equal(schema.required, undefined);
  assert.equal(schema.properties.title.type, "string");
  assert.deepEqual(schema.anyOf, [{ required: ["question", "options"] }, { required: ["title", "singleSelect"] }, { required: ["title", "multiSelect"] }, { required: ["title", "options"] }]);
  for (const field of ["singleSelect", "multiSelect"]) {
    const select = schema.properties[field]!;
    assert.equal(select.type, "object");
    assert.deepEqual(select.required, ["label", "options"]);
    assert.equal(select.properties.label.type, "string");
    assert.equal(select.properties.options.type, "array");
    assert.equal(select.properties.options.minItems, 1);
    const option = select.properties.options.items;
    assert.equal(option.type, "object");
    assert.deepEqual(option.required, ["label"]);
    assert.equal(option.properties.value.type, "string");
    assert.equal(option.properties.id.type, "string");
    assert.equal(option.properties.label.type, "string");
  }
  const validate = new Ajv().compile(schema);
  for (const valid of [
    MOBILE_CSS_CALL,
    { title: "Extras", multiSelect: MOBILE_CSS_CALL.singleSelect },
    { ...MOBILE_CSS_CALL, multiSelect: MOBILE_CSS_CALL.singleSelect },
    { title: "Default value", multiSelect: { label: "Pick", options: [{ label: "Use label as value" }] } },
  ]) assert.equal(validate(valid), true, JSON.stringify(validate.errors));
  for (const invalid of [
    { singleSelect: MOBILE_CSS_CALL.singleSelect },
    { title: "No fields" },
    { title: "No options", singleSelect: { label: "Pick", options: [] } },
    { title: "Wrong value type", singleSelect: { label: "Pick", options: [{ value: 1, label: "One" }] } },
  ]) assert.equal(validate(invalid), false, JSON.stringify(invalid));
});

test('normalization: real flat mingjie choice succeeds and mixed select shapes fail precisely', async () => {
  const { executeRegisteredTool } = await import('./fixtures/execute-registered-tool.js');
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const registration = buildAskChoiceRegistrations(undefined, { surfaceExchanges })[0]!;
  const input = { title: 'Site "mingjie" is created. Switch to it now?', options: [
    { value: 'switch', label: 'Switch to mingjie now' }, { value: 'stay', label: 'Stay on the current site' },
  ] };
  const result = await executeRegisteredTool({ registration, input });
  assert.equal(result.status, 'completed');
  assert.match(JSON.stringify(result.output), /Switch to mingjie now/);
  assert.match(JSON.stringify(result.output), /options→singleSelect.options/);
  const ambiguous = await executeRegisteredTool({ registration, input: { ...input, singleSelect: { label: 'Which?', options: input.options } } });
  assert.equal(ambiguous.errorKind, 'validation');
  assert.match(ambiguous.error!, /Send either flat options or explicit select fields/);
});

test('chat-input regression: option id aliases accept descriptions and remain the actual answer values', async () => {
  const { executeRegisteredTool } = await import('./fixtures/execute-registered-tool.js');
  for (const shape of ['legacy-flat', 'flat', 'singleSelect', 'multiSelect']) {
    const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
    const registration = buildAskChoiceRegistrations(undefined, { surfaceExchanges })[0]!;
    const options = [{ id: 'publish', label: 'Publish now', description: 'Make the site available.' }, { label: 'Later', description: 'Keep working locally.' }];
    const input = shape === 'legacy-flat' ? { title: 'Next step?', options }
      : shape === 'flat' ? { question: 'Next step?', options }
      : { title: 'Next step?', [shape]: { label: 'Choose', options } };
    const before = structuredClone(input);
    const pending = await executeRegisteredTool({ registration, input });
    assert.equal(pending.status, 'completed');
    assert.match(JSON.stringify(pending.output), /Publish now/);
    assert.match(JSON.stringify(pending.output), /Make the site available/);
    assert.match(JSON.stringify(pending.output), /Keep working locally/);
    const ticket = answerTicketFromResult(pending.output);
    const params = shape === 'multiSelect' ? { selections: ['publish', 'Later'] } : { choice: 'publish' };
    const answer = await executeRegisteredTool({ registration, input: { ...params, [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket } });
    assert.equal(answer.status, 'completed');
    assert.deepEqual(answer.output, { submitted: true, ...params, note: "Tell the administrator what you understood from their answer, in plain language, before proceeding." });
    assert.deepEqual(input, before);
  }
});

test('chat-input regression: conflicting option ids fail before showing a form and unknown keys list accepted properties', async () => {
  const { executeRegisteredTool } = await import('./fixtures/execute-registered-tool.js');
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const registration = buildAskChoiceRegistrations(undefined, { surfaceExchanges })[0]!;
  for (const value of ['publish', 'other']) {
    const result = await executeRegisteredTool({ registration, input: { title: 'Next?', options: [{ id: 'publish', value, label: 'Publish' }] } });
    assert.equal(result.errorKind, 'validation');
    assert.match(result.error!, /Conflicting.*id.*value.*Send only.*value/);
    assert.equal(surfaceExchanges.size(), 0);
  }
  const unknown = await executeRegisteredTool({ registration, input: { question: 'Next?', options: [{ label: 'Publish', invented: 'private-value' }] } });
  assert.equal(unknown.errorKind, 'validation');
  assert.match(unknown.error!, /Unknown input 'singleSelect.options\[0\].invented'.*Declared inputs:.*label.*value.*description/);
  assert.doesNotMatch(unknown.error!, /private-value/);
});

test('normalization: fallback answer tickets survive the closed input schema and still bind answers', async () => {
  const { executeRegisteredTool } = await import('./fixtures/execute-registered-tool.js');
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const registration = buildAskChoiceRegistrations(undefined, { surfaceExchanges })[0]!;
  const input = { title: 'Site "mingjie" is created. Switch to it now?', options: [
    { value: 'switch', label: 'Switch to mingjie now' }, { value: 'stay', label: 'Stay on the current site' },
  ] };
  const pending = await executeRegisteredTool({ registration, input });
  const ticket = answerTicketFromResult(pending.output);
  const answer = await executeRegisteredTool({ registration, input: { choice: 'stay', [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket } });
  assert.equal(answer.status, 'completed');
  assert.match(JSON.stringify(answer.output), /"submitted":true/);
  const replay = await executeRegisteredTool({ registration, input: { choice: 'stay', [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket } });
  assert.equal(replay.errorKind, 'validation');
  assert.match(replay.error!, /does not match a form/);
});

test('delegated normalization: human fallback tickets survive transport and remain single use', async () => {
  const { executeRegisteredTool, executeDelegatedRegisteredTool, delegatedText } = await import('./fixtures/execute-registered-tool.js');
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const registration = buildAskChoiceRegistrations(undefined, { surfaceExchanges })[0]!;
  // A headless renderer minted the ticket; its actual human callback enters through MCP.
  const pending = await executeRegisteredTool({ registration, input: {
    title: 'Site "mingjie" is created. Switch to it now?', options: [
      { value: 'switch', label: 'Switch to mingjie now' }, { value: 'stay', label: 'Stay on the current site' },
    ],
  } });
  const ticket = answerTicketFromResult(pending.output);
  const input = { choice: 'stay', [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket };
  const reply = await executeDelegatedRegisteredTool({ registration, input });
  assert.equal(reply.isError, undefined, delegatedText(reply));
  const output = JSON.parse(delegatedText(reply)).output as { submitted: boolean; choice: string };
  assert.equal(output.submitted, true);
  assert.equal(output.choice, 'stay');
  const replay = await executeDelegatedRegisteredTool({ registration, input });
  assert.equal(replay.isError, true);
  assert.match(delegatedText(replay), /does not match a form/);
});

test('delegated normalization: flat choice travels through the bridge, waits for a real exchange answer and returns it to the model', { timeout: 5000 }, async () => {
  const { executeDelegatedRegisteredTool, delegatedText } = await import('./fixtures/execute-registered-tool.js');
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const emitted: unknown[] = [];
  const surfaceExchanges: SurfaceExchangeStore = {
    ...store,
    open: input => store.open({ ...input, emit: async emission => {
      emitted.push(emission);
      await input.emit(emission);
      const exchangeId = exchangeIdFromSurface(emission);
      assert.deepEqual(store.deliver({ exchangeId, principalId: 'caller', params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, choice: 'stay' } }, { toolId: ASK_CHOICE_TOOL_ID }), { ok: true });
    } }),
  };
  const registration = buildAskChoiceRegistrations(undefined, { surfaceExchanges })[0]!;
  const input = { title: 'Switch to mingjie now?', options: [{ value: 'switch', label: 'Switch to mingjie now' }, { value: 'stay', label: 'Stay here' }] };
  const reply = await executeDelegatedRegisteredTool({ registration, input });
  assert.equal(reply.isError, undefined, delegatedText(reply));
  const visible = JSON.parse(delegatedText(reply));
  assert.equal(visible.status, 'completed');
  assert.equal(visible.output.submitted, true);
  assert.equal(visible.output.choice, 'stay');
  assert.match(delegatedText(reply), /options→singleSelect.options/);
  assert.equal(emitted.length, 1);
  assert.match(JSON.stringify(emitted), /Switch to mingjie now/);
  assert.equal(store.size(), 0);
  const refused = await executeDelegatedRegisteredTool({ registration, input: { ...input, singleSelect: { label: 'Which?', options: input.options } } });
  assert.equal(refused.isError, true);
  assert.match(delegatedText(refused), /Send either flat options or explicit select fields/);
  assert.equal(emitted.length, 1);
});

test('canonical flat questions use the catalog compatibility schema and keep authenticated answers unchanged', async () => {
  const { ASK_CHOICE_INPUT_SCHEMA } = await import('@jini-ai/mcp/tools/ask-choice');
  const { executeRegisteredTool } = await import('./fixtures/execute-registered-tool.js');
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const registration = buildAskChoiceRegistrations(undefined, { surfaceExchanges })[0]!;
  assert.deepEqual(registration.descriptor.inputSchema, askChoiceAgentToolCatalog[0]!.inputSchema);
  const schema = registration.descriptor.inputSchema as { properties: Record<string, unknown> };
  assert.deepEqual(schema.properties.question, ASK_CHOICE_INPUT_SCHEMA.properties.question);
  for (const field of ['choice', 'selections', ASK_CHOICE_ANSWER_TICKET_PARAM]) assert.equal(field in schema.properties, false);
  const pending = await executeRegisteredTool({ registration, input: { question: 'Start now?', options: [{ label: 'Now', description: 'Start immediately' }, { label: 'Later', value: 'wait' }] } });
  assert.equal(pending.status, 'completed');
  const ticket = answerTicketFromResult(pending.output);
  const answer = await executeRegisteredTool({ registration, input: { choice: 'Now', [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket } });
  assert.equal(answer.status, 'completed');
  assert.match(JSON.stringify(answer.output), /"submitted":true/);
  assert.match(JSON.stringify(answer.output), /"choice":"Now"/);
  const forged = await executeRegisteredTool({ registration, input: { choice: 'Now', [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket } });
  assert.equal(forged.errorKind, 'validation');
});

test("a checklist's hint is rendered with the multi-select field it describes", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];
  const pending = call(handler, {
    input: {
      title: "Extras",
      multiSelect: { label: "Notify", hint: "Pick every channel that should hear about it", options: [{ value: "email", label: "Email" }] },
    },
    emitSurface: async (s) => void emitted.push(s),
  });
  await new Promise((resolve) => setImmediate(resolve));
  const html = (emitted[0] as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  assert.match(html, /Pick every channel that should hear about it/);
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({ exchangeId, principalId: "principal-1", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, selections: ["email"] } }, { toolId: ASK_CHOICE_TOOL_ID });
  assert.deepEqual((await pending as { selections: unknown }).selections, ["email"]);
});
