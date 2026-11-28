import assert from "node:assert/strict";
import test from "node:test";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { registerSlugChangeCapture } from "#src/platform/routing/adapter";
import { routeDepsChatAgents } from "../route-deps-content-chat.js";

/**
 * @file SPEC-009 REQ-15: `routeDepsChatAgents.slugChangeCapture` reads routing's capture slot per call,
 * so a capture bound (or unbound) after the deps were assembled is the one a rename sees.
 * The chat-backed factories are built over an in-memory database and never used here.
 */

type Required = Parameters<typeof routeDepsChatAgents>[0];

function deps() {
  const kernel = contentKernel({ store: openContentDb(":memory:") });
  return routeDepsChatAgents({
    kernel, chat: kernel, clock: { nowMs: () => 0 }, outbox: {}, entryRefsRepo: {}, entryRepo: {},
    tracker: {}, postRepo: {}, pluginExports: { validateHtml: async () => [] },
  } as unknown as Required);
}

test("slugChangeCapture returns the capture bound after assembly, and nothing once it is unbound", () => {
  const assembled = deps();
  assert.equal(assembled.slugChangeCapture(), undefined, "no capture is bound yet");
  const capture = { onSlugChange: async () => {} };
  const unbind = registerSlugChangeCapture({ impl: capture });
  try {
    assert.equal(assembled.slugChangeCapture(), capture);
  } finally {
    unbind();
  }
  assert.equal(assembled.slugChangeCapture(), undefined);
});
