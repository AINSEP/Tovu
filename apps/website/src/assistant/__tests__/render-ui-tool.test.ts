import assert from "node:assert/strict";
import test from "node:test";

import { A2UI_DISPLAY_ONLY_PROPERTY } from "@jini-ai/agentic/a2ui";
import type { SurfaceEmission, SurfaceEmitter } from "@jini-ai/core";
import type { ToolRegistration } from "@jini-ai/core";

import { RENDER_UI_TOOL_ID, buildRenderUiRegistrations, renderUiAgentToolCatalog } from "../render-ui-tool.js";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * @file The bug this pins: `assistant_render_ui` used to return `{rendered: true}` the instant its
 * outbound message was well-formed, regardless of whether the browser's A2UI interpreter actually
 * accepted the surface. A real refusal (a required prop missing, an unrecognized component type)
 * was only ever shown locally in `A2uiSurfaceCard`'s own UI — the tool call, and therefore the
 * model, had no way to learn its render had been refused, so it told the human a chart existed
 * that had never actually drawn. `A2uiSurfaceCard.tsx` now relays a refusal back through the same
 * `onAgentAction` pipe a button click already uses (Jini side); this file proves the Tovu-side half
 * of the fix: the tool call actually waits for that relay before declaring success.
 */

/** `rejectionGraceMs` defaults to a tiny value — real production sizing
 * (`RENDER_REJECTION_GRACE_MS`) is a UX tradeoff, not something this suite needs to wait out on
 * every run; only a test that specifically wants to observe grace-period timing should override it. */
function buildHandler(surfaceExchanges: SurfaceExchangeStore, rejectionGraceMs = 10) {
  const registrations: ToolRegistration[] = buildRenderUiRegistrations(
    undefined,
    { surfaceExchanges },
    { rejectionGraceMs },
  );
  const registration = registrations.find((r) => r.descriptor.id === RENDER_UI_TOOL_ID);
  assert.ok(registration, "the render-ui tool must be wired");
  return registration.handler;
}

// This file had NO registration test at all while the tool was gated, which is part of why its
// private `renderUiToolsEnabled()` copy of the gate stayed invisible: nothing here ever exercised
// the builder's own gating branch, so nothing had to change when the gate was found and removed.
// Asserting registration under a hostile environment is what closes that hole.
test("registers unconditionally — no environment can switch this tool off", () => {
  const previous = process.env["TOVU_ENABLE_DEMO_TOOLS"];
  delete process.env["TOVU_ENABLE_DEMO_TOOLS"];
  try {
    const registrations = buildRenderUiRegistrations(undefined, { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) });
    assert.ok(
      registrations.some((r) => r.descriptor.id === RENDER_UI_TOOL_ID),
      "the tool must register even with TOVU_ENABLE_DEMO_TOOLS absent",
    );
  } finally {
    if (previous !== undefined) process.env["TOVU_ENABLE_DEMO_TOOLS"] = previous;
  }
});

interface CallOptions {
  input?: unknown;
  emitSurface?: SurfaceEmitter;
}

function call(handler: ReturnType<typeof buildHandler>, options: CallOptions = {}) {
  return handler({
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: "run-1" },
    input: options.input ?? { components: [{ id: "root", component: "Text", text: "hi" }] },
    signal: new AbortController().signal,
  } as Parameters<typeof handler>[0], {
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  });
}

/** Pulls the surfaceId the tool minted (== the exchange id it opened) out of its own createSurface send. */
function surfaceIdFromEmitted(emitted: unknown[]): string {
  const createMsg = emitted.find(
    (e): e is { payload: { message: { createSurface?: { surfaceId: string } } } } =>
      typeof (e as { payload?: { message?: { createSurface?: unknown } } }).payload?.message?.createSurface === "object",
  );
  assert.ok(createMsg, "the tool must send a createSurface message carrying its own surfaceId");
  return createMsg.payload.message.createSurface!.surfaceId;
}

// Demo V3 2026-10-05: on Studio → Playground the chart was drawn on the canvas, but this note said
// "visible in the chat" and the model repeated it. Where it lands is the screen block's call.
const RENDERED_NOTE =
  "The surface is now visible to the administrator: on this screen's canvas or in the chat, as the Current admin screen block's 'Where drawings appear' line says (in the chat when there is no such line). Briefly describe what it shows and say where it is.";

test("the tool description says a drawing may land on the screen's canvas, not only in the chat", () => {
  const entry = renderUiAgentToolCatalog.find((tool) => tool.name === RENDER_UI_TOOL_ID)!;
  assert.match(entry.description, /^Renders an arbitrary A2UI surface in the admin UI: inline in the chat, or on the open screen's canvas when it has one \(the Current admin screen block's 'Where drawings appear' line says which\)\./);
  assert.doesNotMatch(entry.description, /inline in the chat, built/);
});

test("returns rendered: true when nothing reports a refusal", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges);
  const emitted: SurfaceEmission[] = [];
  const components = [{ id: "root", component: "Text", text: "requested text" }];

  const result = await call(handler, { input: { components }, emitSurface: async (surface) => void emitted.push(surface) });

  assert.deepEqual(result, { rendered: true, note: RENDERED_NOTE });
  const surfaceId = surfaceIdFromEmitted(emitted);
  assert.equal(emitted.length, 2);
  assert.equal(emitted[0]!.channel, "a2ui");
  assert.equal(emitted[1]!.channel, "a2ui");
  const created = emitted[0]!.payload as { message: { version: string; createSurface: { surfaceId: string; catalogId: string; dataModel: unknown; surfaceProperties?: unknown } } };
  assert.equal(created.message.version, "v1.0");
  // A chart asks nothing: the chat must not read it as "Waiting for your answer above" while this
  // call waits out its refusal grace period (demo V3, 2026-10-05).
  assert.deepEqual(created.message.createSurface.surfaceProperties, { [A2UI_DISPLAY_ONLY_PROPERTY]: true });
  assert.equal(created.message.createSurface.surfaceId, surfaceId);
  assert.ok(created.message.createSurface.catalogId);
  assert.deepEqual(created.message.createSurface.dataModel, {});
  assert.deepEqual(emitted[1]!.payload, { message: { version: "v1.0", updateComponents: { surfaceId, components } } });
});

test("a button action during the grace period is not a renderer refusal", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges, 1000);
  const emitted: unknown[] = [];
  const pending = call(handler, { input: { components: [
    { id: "root", component: "Button", child: "label", action: { event: { name: "clicked", context: {} } } },
    { id: "label", component: "Text", text: "Continue" },
  ] }, emitSurface: async (surface) => {
    emitted.push(surface);
    if (emitted.length === 2) {
      const surfaceId = surfaceIdFromEmitted(emitted);
      assert.deepEqual(surfaceExchanges.deliver({ exchangeId: surfaceId, principalId: "principal-1", params: { message: { version: "v1.0", action: { surfaceId, name: "clicked", sourceComponentId: "root", timestamp: "2026-09-30T00:00:00.000Z", context: {} } } } }, { channel: "a2ui" }), { ok: true });
    }
  } });

  assert.deepEqual(await pending, { rendered: true, note: RENDERED_NOTE });
  assert.equal(surfaceExchanges.size(), 0);
});

test("returns rendered: false with the real reason when the browser relays a catalog-validation refusal — not a silent false success", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];

  const pending = call(handler, { emitSurface: async (surface) => void emitted.push(surface) });

  // Let the tool's createSurface + updateComponents sends land, the same way the demo-choices test
  // waits for its own surface to be emitted before answering it.
  await new Promise((resolve) => setImmediate(resolve));
  const surfaceId = surfaceIdFromEmitted(emitted);

  // Exactly the shape `A2uiSurfaceCard.tsx`'s relayed refusal takes (an `ErrorMessage`, delivered
  // through the same route a button click's `ActionMessage` would use) — not a fabricated shortcut.
  const delivered = surfaceExchanges.deliver({ exchangeId: surfaceId, principalId: "principal-1", params: {
      message: {
        version: "v1.0",
        error: {
          code: "VALIDATION_FAILED",
          surfaceId,
          path: "/components/0/categoryKey",
          message: 'Component "root" (recharts.bar-chart) failed catalog validation: categoryKey: Required',
        },
      },
    } }, { channel: "a2ui" });
  assert.deepEqual(delivered, { ok: true });

  assert.deepEqual(await pending, {
    rendered: false,
    reason: "rejected-by-renderer",
    detail: 'Component "root" (recharts.bar-chart) failed catalog validation: categoryKey: Required',
    note: "The browser refused to render this — it was NOT drawn and is not visible anywhere. Fix the reported prop and try again; do not tell the user it rendered.",
  });
});

test("falls back to a generic detail string when the relayed refusal carries no string error.message", async () => {
  // `rejectionMessageOf`'s fallback branch — a relayed refusal is still trusted as a refusal even
  // if its `message` field is missing or not a string, rather than silently reporting success.
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];

  const pending = call(handler, { emitSurface: async (surface) => void emitted.push(surface) });

  await new Promise((resolve) => setImmediate(resolve));
  const surfaceId = surfaceIdFromEmitted(emitted);

  const delivered = surfaceExchanges.deliver({ exchangeId: surfaceId, principalId: "principal-1", params: {
      message: {
        version: "v1.0",
        error: { code: "VALIDATION_FAILED", surfaceId },
      },
    } }, { channel: "a2ui" });
  assert.deepEqual(delivered, { ok: true });

  assert.deepEqual(await pending, {
    rendered: false,
    reason: "rejected-by-renderer",
    detail: "The browser rejected this surface.",
    note: "The browser refused to render this — it was NOT drawn and is not visible anywhere. Fix the reported prop and try again; do not tell the user it rendered.",
  });
});
