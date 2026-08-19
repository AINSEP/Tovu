import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter } from "@jini-ai/core";
import type { ToolRegistration } from "@jini-ai/cms/core";

import { DEMO_CHOICES_TOOL_ID, buildDemoChoicesRegistrations } from "../demo-choices-tool.js";
import {
  SURFACE_DISMISSED_PARAM,
  SURFACE_EXCHANGE_ID_PARAM,
  createSurfaceExchangeStore,
  type SurfaceExchangeStore,
} from "../../core/tool-surface-exchanges.js";

/**
 * @file The single-call MCP-UI return path, end to end through a real tool handler (ADR-055
 * Decision 1).
 *
 * This is the test the feature exists for. The measured bug was not that a form rendered badly — the
 * controls were already proven to read back correctly across the sandbox — but that the human's
 * answer reached the server and went nowhere, so the agent, the only consumer that matters, never
 * received it. What is asserted here is therefore the hop that was missing: **submitting the form
 * resolves the agent's own tool call, with the human's selections as its result.**
 *
 * The send-then-wait ORDER gets its own test because reversing it is not a style regression, it is a
 * deadlock: the daemon reads surfaces out of a completed result, so a handler that waited before
 * sending would be waiting on a dialog nobody was ever shown.
 */

/** Enables the env-gated demo tool for one builder call, then restores the environment. */
function buildHandler(surfaceExchanges: SurfaceExchangeStore) {
  const previous = process.env["TOVU_ENABLE_DEMO_TOOLS"];
  process.env["TOVU_ENABLE_DEMO_TOOLS"] = "1";
  let registrations: ToolRegistration[];
  try {
    registrations = buildDemoChoicesRegistrations(undefined, { surfaceExchanges });
  } finally {
    if (previous === undefined) delete process.env["TOVU_ENABLE_DEMO_TOOLS"];
    else process.env["TOVU_ENABLE_DEMO_TOOLS"] = previous;
  }
  const registration = registrations.find((r) => r.descriptor.id === DEMO_CHOICES_TOOL_ID);
  assert.ok(registration, "the demo tool must be wired when its env gate is set");
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
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

test("the call stays open after the form is shown, and the human's selections become its result", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];

  const pending = call(handler, {
    emitSurface: async (surface) => {
      emitted.push(surface);
    },
  });

  // The surface is on screen while the call is still in flight — that is the whole mechanism.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1);
  assert.equal(surfaceExchanges.size(), 1);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the human answers"
  );

  const exchangeId = exchangeIdFromSurface(emitted[0]);
  const delivered = surfaceExchanges.deliver({
    exchangeId,
    toolId: DEMO_CHOICES_TOOL_ID,
    principalId: "principal-1",
    params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, plan: "pro", extras: ["analytics", "backups"] },
  });
  assert.deepEqual(delivered, { ok: true });

  // The hop that was missing: the values reach the agent, as this call's ordinary return value.
  assert.deepEqual(await pending, {
    submitted: true,
    plan: "pro",
    extras: ["analytics", "backups"],
    extrasCount: 2,
    note: "Tell the user what they picked (the plan and any extras) in plain language.",
  });
});

test("the surface reaches the human while the call is still open, carrying the id that answers it", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);

  let sizeAtEmit = -1;
  let idInEmittedHtml: string | undefined;
  const pending = call(handler, {
    emitSurface: async (surface) => {
      // Observed from INSIDE the emit — the ordering that makes the design work rather than
      // deadlock. The exchange already exists (the surface has to carry its id), and the send happens
      // before the handler starts waiting, so the dialog is on screen with the call still in flight.
      sizeAtEmit = surfaceExchanges.size();
      idInEmittedHtml = exchangeIdFromSurface(surface);
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sizeAtEmit, 1);
  assert.ok(idInEmittedHtml);

  surfaceExchanges.deliver({
    exchangeId: idInEmittedHtml,
    toolId: DEMO_CHOICES_TOOL_ID,
    principalId: "principal-1",
    params: { plan: "basic" },
  });
  assert.deepEqual(await pending, {
    submitted: true,
    plan: "basic",
    extras: [],
    extrasCount: 0,
    note: "Tell the user what they picked (the plan and any extras) in plain language.",
  });
});

test("an empty checklist is a real answer, not a missing one", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];
  const pending = call(handler, { emitSurface: async (s) => void emitted.push(s) });

  await new Promise((resolve) => setImmediate(resolve));
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({
    exchangeId,
    toolId: DEMO_CHOICES_TOOL_ID,
    principalId: "principal-1",
    params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, plan: "basic", extras: [] },
  });

  assert.deepEqual(await pending, {
    submitted: true,
    plan: "basic",
    extras: [],
    extrasCount: 0,
    note: "Tell the user what they picked (the plan and any extras) in plain language.",
  });
});

test("Cancel resolves the call immediately instead of stranding it until the TTL", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];
  const pending = call(handler, { emitSurface: async (s) => void emitted.push(s) });

  await new Promise((resolve) => setImmediate(resolve));
  const exchangeId = exchangeIdFromSurface(emitted[0]);

  // The Cancel action posts back rather than just closing the dialog — a silent close would leave
  // the agent blocked for five minutes on a form the human already walked away from.
  surfaceExchanges.deliver({
    exchangeId,
    toolId: DEMO_CHOICES_TOOL_ID,
    principalId: "principal-1",
    params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true },
  });

  const result = (await pending) as { submitted: boolean; reason: string; note: string };
  assert.equal(result.submitted, false);
  assert.equal(result.reason, "cancelled");
  assert.match(result.note, /Do not assume any selection/);
});

test("an unanswered form returns an explicit no-answer result, not a hang or a throw", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const handler = buildHandler(surfaceExchanges);

  const result = (await call(handler, { emitSurface: async () => undefined })) as {
    submitted: boolean;
    reason: string;
    note: string;
  };

  // ADR-055 Decision 6: blocking moves the timeout story, it does not remove it. The model is still
  // alive to read this, which is the point of returning a result rather than raising.
  assert.equal(result.submitted, false);
  assert.equal(result.reason, "expired");
  assert.match(result.note, /did not respond/);
});

test("a cancelled run closes the exchange rather than holding the handler to the deadline", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const controller = new AbortController();

  const pending = call(handler, { emitSurface: async () => undefined, signal: controller.signal });
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

  const result = (await call(handler)) as { content: Array<{ type: string }> };

  // Waiting here would hang until the deadline with nothing on screen to answer it. The old
  // two-call shape is the correct degradation, not an exchange nobody can reach.
  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange — open() requires one");
  assert.equal(result.content[0]?.type, "text");
  assert.equal(result.content[1]?.type, "resource");
});

test("the fallback's second call still echoes the human's selections to the agent", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);

  const result = await call(handler, { input: { plan: "team", extras: ["support"] } });

  // Same shape as the held-open path's result, so the agent sees an identical answer either way — the
  // return PATH is what changed, not the answer.
  assert.deepEqual(result, {
    submitted: true,
    plan: "team",
    extras: ["support"],
    extrasCount: 1,
    note: "Tell the user what they picked (the plan and any extras) in plain language.",
  });
});

test("the fallback surface carries no exchange id, since nothing is waiting on it", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);

  const result = (await call(handler)) as { content: Array<{ resource?: { text: string } }> };
  const html = result.content[1]?.resource?.text ?? "";

  assert.ok(!html.includes(SURFACE_EXCHANGE_ID_PARAM), "an exchange id in a surface with no exchange behind it would name a call that does not exist");
});

test("the tool stays unwired when its env gate is unset", () => {
  const previous = process.env["TOVU_ENABLE_DEMO_TOOLS"];
  delete process.env["TOVU_ENABLE_DEMO_TOOLS"];
  try {
    assert.deepEqual(buildDemoChoicesRegistrations(undefined, { surfaceExchanges: createSurfaceExchangeStore() }), []);
  } finally {
    if (previous !== undefined) process.env["TOVU_ENABLE_DEMO_TOOLS"] = previous;
  }
});
