import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter } from "@jini-ai/core";
import type { ToolRegistration } from "@jini-ai/cms/core";

import { RENDER_UI_TOOL_ID, buildRenderUiRegistrations } from "../render-ui-tool.js";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";

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
    const registrations = buildRenderUiRegistrations(undefined, { surfaceExchanges: createSurfaceExchangeStore() });
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
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  } as Parameters<typeof handler>[0]);
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

test("returns rendered: true when nothing reports a refusal", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];

  const result = await call(handler, { emitSurface: async (surface) => void emitted.push(surface) });

  assert.deepEqual(result, { rendered: true, note: "The surface is now visible in the chat. Briefly describe what it shows." });
});

test("returns rendered: false with the real reason when the browser relays a catalog-validation refusal — not a silent false success", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];

  const pending = call(handler, { emitSurface: async (surface) => void emitted.push(surface) });

  // Let the tool's createSurface + updateComponents sends land, the same way the demo-choices test
  // waits for its own surface to be emitted before answering it.
  await new Promise((resolve) => setImmediate(resolve));
  const surfaceId = surfaceIdFromEmitted(emitted);

  // Exactly the shape `A2uiSurfaceCard.tsx`'s relayed refusal takes (an `ErrorMessage`, delivered
  // through the same route a button click's `ActionMessage` would use) — not a fabricated shortcut.
  const delivered = surfaceExchanges.deliver({
    exchangeId: surfaceId,
    principalId: "principal-1",
    params: {
      message: {
        version: "v1.0",
        error: {
          code: "VALIDATION_FAILED",
          surfaceId,
          path: "/components/0/categoryKey",
          message: 'Component "root" (recharts.bar-chart) failed catalog validation: categoryKey: Required',
        },
      },
    },
  });
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
  const surfaceExchanges = createSurfaceExchangeStore();
  const handler = buildHandler(surfaceExchanges);
  const emitted: unknown[] = [];

  const pending = call(handler, { emitSurface: async (surface) => void emitted.push(surface) });

  await new Promise((resolve) => setImmediate(resolve));
  const surfaceId = surfaceIdFromEmitted(emitted);

  const delivered = surfaceExchanges.deliver({
    exchangeId: surfaceId,
    principalId: "principal-1",
    params: {
      message: {
        version: "v1.0",
        error: { code: "VALIDATION_FAILED", surfaceId },
      },
    },
  });
  assert.deepEqual(delivered, { ok: true });

  assert.deepEqual(await pending, {
    rendered: false,
    reason: "rejected-by-renderer",
    detail: "The browser rejected this surface.",
    note: "The browser refused to render this — it was NOT drawn and is not visible anywhere. Fix the reported prop and try again; do not tell the user it rendered.",
  });
});
