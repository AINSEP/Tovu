import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRecord } from "./post-record.fixture.js";

/**
 * @file H4: `InMemoryPostRepo` honours an injected hold reader exactly like `SqlPostRepo`'s
 * `notHeldAgentSchedule` — an AGENT post scheduled after the pause began is hidden from the public
 * list and the go-live sweep; owner posts, agent posts live before the pause and unscheduled agent
 * posts are untouched; another workspace's hold does not apply; no reader means no filtering.
 */

const WS = "ws-mem-hold";
const SAVED = "2026-11-20T10:00:00.000Z";
const HELD_SINCE = "2026-11-21T00:00:00.000Z";
const NOW = "2026-11-22T00:00:00.000Z";

const row = (id: string, createdByKind: "agent" | "person", publishAt: string | null = "2026-11-21T12:00:00.000Z") =>
  buildPostRecord({ id, slug: id, workspaceId: WS, status: "published", kind: "post", publishAt, updatedAt: SAVED, createdByKind });
const ROWS = [
  row("agent-scheduled-in-pause", "agent"),
  row("owner-scheduled-in-pause", "person"),
  row("agent-live-before-pause", "agent", "2026-11-20T12:00:00.000Z"),
  row("agent-unscheduled", "agent", null),
];
const heldAt = (since: string | null) => ({ heldSince: async ({ workspaceId }: { workspaceId: string }) => (workspaceId === WS ? since : null) });
const ids = (posts: { id: string }[]) => posts.map((post) => post.id).sort();

test("held: agent post scheduled after the pause is hidden from previews and go-live; owner/earlier/unscheduled are not", async () => {
  const repo = new InMemoryPostRepo({}, { initialRows: ROWS, agentHold: heldAt(HELD_SINCE) });
  assert.deepEqual(ids(await repo.listGoLiveCandidates({ workspaceId: WS, nowIso: NOW })), ["agent-live-before-pause", "owner-scheduled-in-pause"]);
  assert.deepEqual(ids(await repo.listPublishedPreviews({ workspaceId: WS, limit: 10, nowIso: NOW })), ["agent-live-before-pause", "agent-unscheduled", "owner-scheduled-in-pause"]);
});

test("released (reader says null) or no reader: nothing is filtered", async () => {
  for (const options of [{ agentHold: heldAt(null) }, {}]) {
    const repo = new InMemoryPostRepo({}, { initialRows: ROWS, ...options });
    assert.equal((await repo.listGoLiveCandidates({ workspaceId: WS, nowIso: NOW })).length, 3);
    assert.equal((await repo.listPublishedPreviews({ workspaceId: WS, limit: 10, nowIso: NOW })).length, 4);
  }
});
