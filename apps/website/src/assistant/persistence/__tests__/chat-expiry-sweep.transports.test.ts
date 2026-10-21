import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { ChatOwnerScope } from "@jini-ai/chat/core";

import type { ChatKernel } from "#src/platform/db/chat-kernel";
import { createChatHistoryStore } from "../chat-history-store.js";
import { sweepExpiredChats } from "../chat-expiry-sweep.js";
import { emptiedPgChatKernel } from "./chat-dialect-matrix.js";

/**
 * @file Maintenance selection by kernel transport. A PGlite served over a socket and a real
 * Postgres connection both speak the Postgres dialect, so the same PGlite database stands in for
 * both: the kernel is relabelled with each transport and the sweep must still drain expired chats.
 * The real-server run lives in the `[real postgres]` matrix of `chat-expiry-sweep.dialects.test.ts`.
 */

const T0 = 1_790_000_000_000;
const GUEST: ChatOwnerScope = { scopeId: "ws", ownerKind: "guest", ownerId: "hashed-session" };

let shared: ChatKernel | undefined;
after(async () => { await (shared as unknown as { close?: () => Promise<void> } | undefined)?.close?.(); });

for (const transport of ["pglite-socket", "node-postgres"] as const) {
  test(`a ${transport} kernel sweeps expired chats with Postgres-dialect maintenance`, async () => {
    const kernel = emptiedPgChatKernel();
    shared = kernel;
    const guest = createChatHistoryStore(kernel, GUEST, () => T0);
    await guest.create({ id: `expired-${transport}`, expiresAt: T0 - 1 });
    await guest.create({ id: `kept-${transport}` });
    const relabelled = { ...kernel, transport } as ChatKernel;
    assert.equal(relabelled.transport, transport);
    assert.equal(await sweepExpiredChats(relabelled, T0), 1);
    assert.deepEqual((await guest.list()).map((chat) => chat.id), [`kept-${transport}`]);
  });
}
