import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { ChatOwnerScope } from "@jini-ai/chat/core";

import type { ChatKernel } from "#src/platform/db/chat-kernel";
import { createChatHistoryStore } from "../chat-history-store.js";
import { createSqliteAgentSessionStore } from "../agent-session-store.js";
import { emptiedPgChatKernel } from "./chat-dialect-matrix.js";

/**
 * @file Session-store selection by kernel transport. A PGlite over a socket and a real Postgres
 * connection both speak the Postgres dialect, so one PGlite database stands in for both; the
 * kernel is relabelled with each transport and the selected store must round-trip a session id.
 * The real-server run is the `[real postgres]` matrix of the dialect suites.
 */

const ADMIN: ChatOwnerScope = { scopeId: "ws", ownerKind: "user", ownerId: "alice" };
let shared: ChatKernel | undefined;
after(async () => { await (shared as unknown as { close?: () => Promise<void> } | undefined)?.close?.(); });

for (const transport of ["pglite-socket", "node-postgres"] as const) {
  test(`a ${transport} kernel stores and reads back an agent session id`, async () => {
    const kernel = emptiedPgChatKernel();
    shared = kernel;
    await createChatHistoryStore(kernel, ADMIN, () => 1_790_000_000_000).create({ id: `chat-${transport}` });
    const sessions = createSqliteAgentSessionStore({ ...kernel, transport } as ChatKernel);
    await sessions.setSessionId({ conversationId: `chat-${transport}`, agentId: "claude", sessionId: "sess-1" });
    assert.equal(await sessions.getSessionId({ conversationId: `chat-${transport}`, agentId: "claude" }), "sess-1");
  });
}
