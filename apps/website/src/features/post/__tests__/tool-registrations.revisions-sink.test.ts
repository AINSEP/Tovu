import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";

/**
 * @file post_revisions sink proof (2026-09-18) — `content_post_create`/`content_post_update` call
 * `createPost`/`updatePost` from inside `executeCommand`'s `mutation.execute`, exactly like the
 * admin HTTP routes and `embed-service.ts`'s `writePostHostBody`. The revision writer is wired
 * inside `createPost`/`updatePost` themselves (`post.ts`), so this sink needs no code change of its
 * own — this test PROVES that, rather than assuming it (per the audit discipline: a correct
 * primitive with an unwired call site is this codebase's most common defect).
 *
 * Also proves the follow-up fix (2026-09-18 round 4): every tool handler now forwards
 * `ctx.principal.id` as `actorId`, so the revision this sink writes carries the real principal, not
 * the `"system"` fallback — and stamps `delegatedByWorkspaceId`/`delegatedById` (both non-null),
 * which is what makes an agent-run write distinguishable from a direct admin-route write in
 * `post_revisions`: `ctx.principal.id` is already the same real human id either way (see
 * `AGENT_TOOL_PRINCIPAL_KIND`'s own doc in `@jini-ai/cms/core`), so `actorId` alone cannot tell the
 * two apart — only the delegatedBy* marker can.
 */

const WORKSPACE_ID = "ws-post-revisions-sink";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-18T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

function fakeRouteDeps() {
  let counter = 0;
  const postRepo = new InMemoryPostRepo();
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    postRepo,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as PostToolDeps;
  return { deps, postRepo };
}

function registrationsFor(deps: PostToolDeps): Map<string, ToolRegistration> {
  return new Map(
    buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() }).map((r) => [r.descriptor.id, r])
  );
}

function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

function call(registration: ToolRegistration, input: unknown) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
  return registration.handler(ctx);
}

test("content_post_create appends a post_revisions row, proving the ledger covers this executeCommand-wrapped createPost() sink", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  const registrations = registrationsFor(deps);

  const result = (await call(tool(registrations, "content_post_create"), {
    kind: "post",
    title: "Hello from an agent",
  })) as { post: { id: string } };

  const revisions = await postRepo.listRevisions({ workspaceId: WORKSPACE_ID, postId: result.post.id });
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].op, "create");
  // The fix (see file header): the real principal, not the system fallback.
  assert.equal(revisions[0].actorId, PRINCIPAL_ID);
  // The distinguishing marker: an agent-run write carries a non-null delegatedBy* pair; a direct
  // admin-route write (see `revision-attribution.test.ts`) leaves both null.
  assert.equal(revisions[0].delegatedByWorkspaceId, WORKSPACE_ID);
  assert.equal(revisions[0].delegatedById, PRINCIPAL_ID);
});

test("content_post_update appends a chained post_revisions row, proving the ledger covers this executeCommand-wrapped updatePost() sink", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await postRepo.save({
    id: "p1",
    workspaceId: WORKSPACE_ID,
    title: "Original",
    slug: "original",
    bodyJson: EMPTY_DOC,
    status: "draft",
    kind: "post",
    updatedAt: NOW,
    version: 1,
  } as never);
  const registrations = registrationsFor(deps);

  await call(tool(registrations, "content_post_update"), {
    id: "p1",
    kind: "post",
    title: "Updated by an agent",
    slug: "original",
    bodyJson: EMPTY_DOC,
    status: "draft",
  });

  const revisions = await postRepo.listRevisions({ workspaceId: WORKSPACE_ID, postId: "p1" });
  assert.equal(revisions.length, 1, "the seed above bypassed createPost, so this update is the only appendRevision call");
  assert.equal(revisions[0].op, "update");
  assert.equal(revisions[0].stateJson.title, "Updated by an agent");
  assert.equal(revisions[0].actorId, PRINCIPAL_ID);
  assert.equal(revisions[0].delegatedByWorkspaceId, WORKSPACE_ID);
  assert.equal(revisions[0].delegatedById, PRINCIPAL_ID);
});
