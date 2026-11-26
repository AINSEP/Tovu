import { RESERVED_SEGMENTS } from "@jini-ai/cms/routing/site/reserved-paths";
import { deriveDuplicateName } from "#src/features/content-duplication/copy-naming-policy";
import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import type { PostRepoPort } from "@jini-ai/cms/posts/post";
import { InMemoryChangeSetRepo } from "@jini-ai/cms/core/commands";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { InMemoryEventBus, InMemoryOutbox } from "@jini-ai/infra/events/memory-bus";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { buildContentDuplicationRegistrations } from "#src/features/content-duplication/tool-registrations";
import { createPost } from "@jini-ai/cms/posts/post-create";
import { updatePost } from "../post-update.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { SqlitePostRepo } from "../repo.sqlite.js";
import { buildPostRegistrations } from "../tool-registrations.js";
import { contributePostDuplicateHandlers } from "../post-tool-duplicate.js";
import { type PostToolDeps } from "../post-tool-deps.js";
import { makePglitePostRepo } from "./pglite-repo.fixture.js";

/**
 * @file H4(a) (owner decision 11-23): `posts.created_by_kind` is recorded AT WRITE TIME. A post an
 * agent creates through its tools records `"agent"`; one a person creates (the owner/admin routes
 * call `createPost` with no `creatorKind`) records `"person"`; and `updatePost` never changes it —
 * an owner editing an agent-made draft must not turn it into a person's post, or the agent-pause
 * hold would let it through. Pinned on every `PostRepoPort` adapter plus the real tool handlers.
 */

const WORKSPACE_ID = "ws-creator-kind";
const NOW = "2026-11-24T00:00:00.000Z";
const clock = { nowMs: () => Date.parse(NOW) };
const noopOutbox = { enqueue: async () => {}, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} };

function runCreatorKindContract(name: string, withRepo: () => { repo: PostRepoPort; teardown: () => void }) {
  test(`createPost records the creator kind given — "agent" for an agent, "person" when omitted (${name})`, async () => {
    const { repo, teardown } = withRepo();
    try {
      await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo, clock }, input: { workspaceId: WORKSPACE_ID, id: "by-agent", title: "A", actorId: "p-1", creatorKind: "agent" } });
      await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo, clock }, input: { workspaceId: WORKSPACE_ID, id: "by-person", title: "B", actorId: "p-1" } });
      assert.equal((await repo.findById({ workspaceId: WORKSPACE_ID, id: "by-agent" }))?.createdByKind, "agent");
      assert.equal((await repo.findById({ workspaceId: WORKSPACE_ID, id: "by-person" }))?.createdByKind, "person");
    } finally {
      teardown();
    }
  });

  test(`updatePost never changes the creator kind, whoever edits (${name})`, async () => {
    const { repo, teardown } = withRepo();
    try {
      await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo, clock }, input: { workspaceId: WORKSPACE_ID, id: "agent-draft", title: "Draft", actorId: "p-1", creatorKind: "agent" } });
      const result = await updatePost({
        deps: { repo, clock, outbox: noopOutbox },
        input: { workspaceId: WORKSPACE_ID, id: "agent-draft", title: "Owner edit", slug: "agent-draft", bodyJson: { type: "doc", content: [] }, status: "draft", actorId: "owner-1" },
      });
      assert.equal(result.post.createdByKind, "agent");
      assert.equal((await repo.findById({ workspaceId: WORKSPACE_ID, id: "agent-draft" }))?.createdByKind, "agent");
    } finally {
      teardown();
    }
  });
}

runCreatorKindContract("InMemoryPostRepo", () => ({ repo: new InMemoryPostRepo({}, { initialRows: [] }), teardown: () => {} }));
runCreatorKindContract("SqlitePostRepo", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "post-creator-kind-"));
  const repo = new SqlitePostRepo({ store: openContentDb(path.join(tmpDir, "content.db")), mediaAccessEvidence: createMediaAccessEvidence() });
  return { repo, teardown: () => fs.rmSync(tmpDir, { recursive: true, force: true }) };
});
runCreatorKindContract("PglitePostRepo", () => makePglitePostRepo());

function toolDeps() {
  const postRepo = new InMemoryPostRepo({});
  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock,
    idGen: { newId: () => `id-${++counter}` },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    postRepo,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as PostToolDeps;
  return { deps, postRepo };
}

function callTool(registration: ToolRegistration, input: unknown) {
  const ctx: ToolExecutionContext = { executionId: "exec-1", principal: { id: "principal-1" }, run: { id: "run-1" }, input, signal: new AbortController().signal };
  return registration.handler(ctx);
}

test("agent tools record created_by_kind 'agent': content_post_create and content_duplicate", async () => {
  const { deps, postRepo } = toolDeps();
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const create = buildPostRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "content_post_create");
  assert.ok(create);
  const { post } = (await callTool(create, { kind: "post", title: "From the agent" })) as { post: { id: string } };
  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: post.id }))?.createdByKind, "agent");

  const duplicate = buildContentDuplicationRegistrations(deps as unknown as AssistantToolRegistryDeps, { listResourceHandlers: () => contributePostDuplicateHandlers({ deriveDuplicateName }) }).find((r) => r.descriptor.id === "content_duplicate");
  assert.ok(duplicate);
  const copy = (await callTool(duplicate, { resource: "post", id: post.id })) as { post: { id: string } };
  assert.notEqual(copy.post.id, post.id);
  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: copy.post.id }))?.createdByKind, "agent");
});
