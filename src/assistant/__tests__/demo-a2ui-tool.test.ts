import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmission, SurfaceEmitter } from "@jini-ai/core";
import type { ToolRegistration } from "@jini-ai/cms/core";

import { DEMO_A2UI_TOOL_ID, buildDemoA2uiRegistrations } from "../demo-a2ui-tool.js";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file The A2UI multi-turn inbound transport, end to end through a real tool handler.
 *
 * `demo-choices-tool.test.ts` proves the one-shot `askOnce` path; this proves the shape A2UI exists
 * for — a call that stays open across TWO round trips, each one reflecting what the human just did
 * back into the next surface it sends, with the human's actions becoming the call's ordinary result.
 */

function buildHandler(surfaceExchanges: SurfaceExchangeStore) {
  const registrations: ToolRegistration[] = buildDemoA2uiRegistrations(undefined, { surfaceExchanges });
  const registration = registrations.find((r) => r.descriptor.id === DEMO_A2UI_TOOL_ID);
  assert.ok(registration, "the tool must be wired");
  return registration.handler;
}

interface CallOptions {
  emitSurface?: SurfaceEmitter;
  signal?: AbortSignal;
}

function call(handler: ReturnType<typeof buildHandler>, options: CallOptions = {}) {
  return handler({
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: "run-1" },
    input: {},
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  } as Parameters<typeof handler>[0]);
}

function surfaceIdOf(emission: SurfaceEmission): string {
  const message = (emission.payload as { message: Record<string, unknown> }).message;
  const createSurface = message["createSurface"] as { surfaceId: string } | undefined;
  const updateComponents = message["updateComponents"] as { surfaceId: string } | undefined;
  const id = createSurface?.surfaceId ?? updateComponents?.surfaceId;
  assert.ok(id, "every emitted A2UI message in this tool's flow carries a surfaceId");
  return id;
}

function actionMessage(surfaceId: string, name: string, timestamp = new Date().toISOString()) {
  return {
    version: "v1.0" as const,
    action: { name, surfaceId, sourceComponentId: "actionButton", timestamp, context: {} },
  };
}

test("the call stays open across two turns, and both actions become the call's result", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const emitted: SurfaceEmission[] = [];

  const pending = call(handler, { emitSurface: async (e) => void emitted.push(e) });

  await new Promise((resolve) => setImmediate(resolve));
  // createSurface, then the first updateComponents (the button) — both sent before the call ever
  // starts waiting, matching `askOnce`'s "send before receive" invariant even across two turns.
  assert.equal(emitted.length, 2);
  assert.equal(surfaceExchanges.size(), 1);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the first action arrives"
  );

  const surfaceId = surfaceIdOf(emitted[0]!);
  assert.equal(surfaceId, surfaceIdOf(emitted[1]!), "every message in one flow shares one surfaceId");

  const firstDelivered = surfaceExchanges.deliver({
    exchangeId: surfaceId,
    principalId: "principal-1",
    params: { message: actionMessage(surfaceId, `${DEMO_A2UI_TOOL_ID}.continue`) },
  });
  assert.deepEqual(firstDelivered, { ok: true });

  // The reflecting updateComponents arrives before the second receive — the property this whole
  // tool exists to demonstrate.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 3);
  const reflectingMessage = (emitted[2]!.payload as { message: { updateComponents: { components: Array<{ id: string; text?: unknown }> } } }).message;
  const statusComponent = reflectingMessage.updateComponents.components.find((c) => c.id === "status");
  assert.match(String(statusComponent?.text), new RegExp(`${DEMO_A2UI_TOOL_ID}\\.continue`));

  const secondDelivered = surfaceExchanges.deliver({
    exchangeId: surfaceId,
    principalId: "principal-1",
    params: { message: actionMessage(surfaceId, `${DEMO_A2UI_TOOL_ID}.finish`) },
  });
  assert.deepEqual(secondDelivered, { ok: true });

  assert.deepEqual(await pending, {
    completed: true,
    firstAction: { name: `${DEMO_A2UI_TOOL_ID}.continue`, context: {} },
    secondAction: { name: `${DEMO_A2UI_TOOL_ID}.finish`, context: {} },
  });
  assert.equal(surfaceExchanges.size(), 0, "the exchange closes once both turns complete");
});

test("the surface id doubles as the exchange id — a2ui-actions-route.ts needs no separate callback param", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const emitted: SurfaceEmission[] = [];
  call(handler, { emitSurface: async (e) => void emitted.push(e) });

  await new Promise((resolve) => setImmediate(resolve));
  const surfaceId = surfaceIdOf(emitted[0]!);

  // Delivering under the surfaceId (not some other id) is what proves the two are the same value —
  // a wrong id would 409/leave the exchange untouched, per surface-exchanges.ts's own contract.
  const delivered = surfaceExchanges.deliver({ exchangeId: surfaceId, principalId: "principal-1", params: { message: {} } });
  assert.deepEqual(delivered, { ok: true });
});

test("an unanswered surface returns an explicit no-answer result, not a hang or a throw", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const handler = buildHandler(surfaceExchanges);

  const result = (await call(handler, { emitSurface: async () => undefined })) as {
    completed: boolean;
    reason: string;
    note: string;
  };

  assert.equal(result.completed, false);
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

  const result = (await pending) as { completed: boolean; reason: string };
  assert.equal(result.reason, "abandoned");
  assert.equal(surfaceExchanges.size(), 0);
});

test("with no emit seam the tool reports it cannot run, and opens no exchange", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);

  const result = (await call(handler)) as { completed: boolean; reason: string };

  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange — open() requires one");
  assert.equal(result.completed, false);
  assert.equal(result.reason, "no-surface-channel");
});

// See `demo-choices-tool.test.ts`'s equivalent for why this asserts the opposite of what it used to.
test("registers unconditionally — no environment can switch this tool off", () => {
  const previous = process.env["TOVU_ENABLE_DEMO_TOOLS"];
  delete process.env["TOVU_ENABLE_DEMO_TOOLS"];
  try {
    const registrations = buildDemoA2uiRegistrations(undefined, { surfaceExchanges: createSurfaceExchangeStore() });
    assert.ok(
      registrations.some((r) => r.descriptor.id === DEMO_A2UI_TOOL_ID),
      "the tool must register even with TOVU_ENABLE_DEMO_TOOLS absent",
    );
  } finally {
    if (previous !== undefined) process.env["TOVU_ENABLE_DEMO_TOOLS"] = previous;
  }
});
