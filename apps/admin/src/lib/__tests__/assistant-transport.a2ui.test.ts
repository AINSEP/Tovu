import { expect, test } from "vitest";

import { translateRunAgentPayload } from "../assistant-transport";

/**
 * @file The `"a2ui"` branch of `translateRunAgentPayload` — the unwrap `A2uiSurfaceCard` depends on.
 *
 * Written against the pure function directly, same reasoning as
 * `assistant-transport.transcript.test.ts`: no `EventSource`/`fetch` stub needed to check a plain
 * reduction.
 */

test("unwraps an a2ui run event to the bare AgentToRendererMessage, not the {type, message} wire envelope", () => {
  const message = { version: "v1.0", createSurface: { surfaceId: "s1", catalogId: "cat" } };

  const translated = translateRunAgentPayload({ type: "a2ui", message });

  // `A2uiSurfaceCard`'s `extractSurfaceId`/`interpreter.applyAgentMessage` both read each event's
  // `data` as one spec-shaped envelope directly — handing them `{type: "a2ui", message}` instead
  // would fail every shape check they run (no top-level `version`, no `createSurface` key at the
  // top level) and the surface would silently never render.
  expect(translated).toEqual({ kind: "ext", name: "a2ui", data: message });
});

test("falls through the default branch (the whole envelope as data) for an event type with no dedicated case", () => {
  const payload = { type: "surface_request", foo: "bar" };

  expect(translateRunAgentPayload(payload)).toEqual({ kind: "ext", name: "surface_request", data: payload });
});
