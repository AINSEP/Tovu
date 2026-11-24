import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { PostRecord } from "@jini-ai/cms/posts/post";
import { postRepoFor } from "../repo.js";
import { sqlAgentPauseHoldStore } from "../../../server/runtime/composition/agent-pause-gate.js";
import { buildPostRecord } from "./post-record.fixture.js";

/**
 * @file H4 (owner decision 11-23): while the agent-pause hold stands, a post an AGENT created and
 * scheduled for a moment after the pause began does not go live — not on the public list read
 * (`listPublishedPreviews`) and not in the go-live sweep (`listGoLiveCandidates`). Owner-created
 * posts, and agent posts that were already live before the pause, are untouched. Pinned on every
 * SQL dialect through the production repo and the production hold store.
 */

const WS = "ws-agent-hold";
const SAVED = "2026-11-20T10:00:00.000Z";
const HELD_SINCE = "2026-11-21T00:00:00.000Z";
const NOW = "2026-11-22T00:00:00.000Z";

const row = (id: string, fields: Partial<PostRecord> = {}) =>
  buildPostRecord({ id, slug: id, workspaceId: WS, status: "published", kind: "post", publishAt: "2026-11-21T12:00:00.000Z", updatedAt: SAVED, ...fields });

const ROWS = [
  row("agent-scheduled-in-pause"),
  row("owner-scheduled-in-pause"),
  row("agent-live-before-pause", { publishAt: "2026-11-20T12:00:00.000Z" }),
  row("agent-unscheduled", { publishAt: null }),
];
const AGENT_MADE = ["agent-scheduled-in-pause", "agent-live-before-pause", "agent-unscheduled"];

describeEachDialect("post go-live under the agent-pause hold", {
  tables: ["posts", "post_revisions", "agent_pause_holds"],
  make: (kernel) => ({ repo: postRepoFor(kernel, { mediaAccessEvidence: createMediaAccessEvidence() }), kernel: kernel as KyselyKernel<unknown> }),
}, (make) => {
  test("held: agent post scheduled after the pause stays unpublished; owner post goes live; release resumes it", async () => {
    const { repo, kernel } = make();
    for (const record of ROWS) await repo.save(record);
    await kernel.execute(sql`UPDATE posts SET created_by_kind = 'agent' WHERE id IN (${sql.join(AGENT_MADE)})`);
    const store = sqlAgentPauseHoldStore({ kernel });
    const goLive = async () => (await repo.listGoLiveCandidates({ workspaceId: WS, nowIso: NOW })).map((post) => post.id).sort();
    const previews = async () => (await repo.listPublishedPreviews({ workspaceId: WS, limit: 10, nowIso: NOW })).map((post) => post.id).sort();

    await store.hold({ workspaceId: WS, sinceIso: HELD_SINCE });
    assert.deepEqual(await goLive(), ["agent-live-before-pause", "owner-scheduled-in-pause"]);
    assert.deepEqual(await previews(), ["agent-live-before-pause", "agent-unscheduled", "owner-scheduled-in-pause"]);

    await store.hold({ workspaceId: "ws-other", sinceIso: HELD_SINCE });
    await store.release({ workspaceId: WS });
    assert.deepEqual(await goLive(), ["agent-live-before-pause", "agent-scheduled-in-pause", "owner-scheduled-in-pause"], "another workspace's hold does not apply");
    assert.deepEqual(await previews(), ["agent-live-before-pause", "agent-scheduled-in-pause", "agent-unscheduled", "owner-scheduled-in-pause"]);
  });
});
