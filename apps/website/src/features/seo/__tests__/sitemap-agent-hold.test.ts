import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo } from "../../post/repo.memory.js";
import { buildPostRecord } from "../../post/__tests__/post-record.fixture.js";
import { createSeoPostPort } from "../index.js";

/**
 * @file H4: the sitemap reads posts through `createSeoPostPort().list`. While the agent-pause hold
 * stands, an AGENT post scheduled after the pause began is not listed (so it cannot reach the
 * sitemap); owner posts and agent posts scheduled before the pause are listed; no reader = no filter.
 */

const WS = "ws-seo-hold";
const row = (id: string, createdByKind: "agent" | "person", publishAt: string) =>
  buildPostRecord({ id, slug: id, workspaceId: WS, status: "published", kind: "post", publishAt, updatedAt: "2026-11-20T10:00:00.000Z", createdByKind });
const rows = [row("agent-held", "agent", "2026-11-21T12:00:00.000Z"), row("owner", "person", "2026-11-21T12:00:00.000Z"), row("agent-earlier", "agent", "2026-11-20T12:00:00.000Z")];
const postRepo = new InMemoryPostRepo({}, { initialRows: rows });
const listed = async (optional: Parameters<typeof createSeoPostPort>[1]) => (await createSeoPostPort({ postRepo }, optional).list({ workspaceId: WS })).map((post) => post.id).sort();

test("held agent schedule is dropped from the sitemap's post list", async () => {
  assert.deepEqual(await listed({ agentHold: { heldSince: async () => "2026-11-21T00:00:00.000Z" } }), ["agent-earlier", "owner"]);
});

test("no hold, or no reader: every post is listed", async () => {
  assert.equal((await listed({ agentHold: { heldSince: async () => null } })).length, 3);
  assert.equal((await listed({})).length, 3);
});
