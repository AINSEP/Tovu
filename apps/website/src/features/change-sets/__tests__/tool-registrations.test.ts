import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { listToolContributors, registerToolContributor, resetToolContributorsForTests } from "#src/assistant/tool-contribution-registry";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo, InMemoryPostSearchIndex, createPostRevertRegistry } from "#src/features/post/index";
import { contributePostTools } from "#src/features/post/tool-registrations";
import { contributeChangeSetsTools } from "#src/features/change-sets/tool-registrations";
import { getChangeSetsAgentToolCatalog } from "#src/features/change-sets/agent-tools";
import type { PostRecord } from "#src/features/post/post";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file `change_sets_list` + `change_sets_revert` (F7b option A, S6, 2026-09-24) TDD certification.
 *
 * Real in-memory adapters throughout (`InMemoryPostRepo`, `InMemoryChangeSetRepo`, `InMemoryOutbox`,
 * `InMemoryEventBus`, the real post-domain `createPostRevertRegistry`), exercised through the real
 * `content_post_update` tool alongside these two new tools — proving the FULL agent-reachable path
 * (update writes a change set, revert reads it back through the same `RevertRegistry` the admin
 * Recovery page uses), not a mocked chokepoint.
 *
 * Same "register into the tool-contribution registry, then read through
 * `buildAssistantToolRegistrations`" shape `assistant/__tests__/tool-registrations.post.test.ts` and
 * `tool-registrations.theme-set-active.test.ts` already use.
 */

resetToolContributorsForTests();
registerToolContributor(contributePostTools());
registerToolContributor(contributeChangeSetsTools());

const WORKSPACE_ID = "ws-change-sets-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-24T00:00:00.000Z";
const LATER = "2026-09-24T01:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

function seededPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE_ID,
    title: "Original Title",
    slug: "original-slug",
    bodyJson: EMPTY_DOC,
    status: "draft",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const postRepo = new InMemoryPostRepo([seededPost()]);
  const changeSets = new InMemoryChangeSetRepo();
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  let counter = 0;

  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    changeSets,
    outbox,
    bus,
    postRepo,
    postSearch: new InMemoryPostSearchIndex(postRepo),
    revertRegistry: createPostRevertRegistry({
      postRepo,
      clock: { nowIso: () => NOW },
      outbox,
      forgetRemoved: async () => {},
    }),
    authorize: async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  };

  return { deps: deps as unknown as RouteDeps, postRepo, changeSets };
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID } as ToolExecutionContext["principal"],
    run: { id: "run-1" } as ToolExecutionContext["run"],
    input,
    signal: new AbortController().signal,
  };
}

function registrationsFor(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps).map((r) => [r.descriptor.id, r]));
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = registrationsFor(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

test("change_sets_revert: undoes an agent's own content_post_update, restoring the old title", async () => {
  const { deps } = fakeRouteDeps();

  const updated = (await wired("content_post_update", deps).handler(
    executionContext({ id: "post-1", kind: "post", title: "Edited Title" })
  )) as { post: { version: number } };
  assert.equal(updated.post.version, 2, "the update must have written a new version");

  const listed = (await wired("change_sets_list", deps).handler(executionContext({}))) as {
    changeSets: Array<{ id: string; status: string }>;
  };
  const applied = listed.changeSets.find((cs) => cs.status === "applied");
  assert.ok(applied, "expected exactly one applied change set from the update");

  const reverted = (await wired("change_sets_revert", deps).handler(
    executionContext({ changeSetId: applied.id })
  )) as { reverted: boolean; changeSet: { status: string } };

  assert.equal(reverted.reverted, true);
  assert.equal(reverted.changeSet.status, "reverted");

  const afterRevert = await deps.postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" });
  assert.equal(afterRevert?.title, "Original Title", "the title must be restored to its pre-edit value");
});

test("change_sets_revert: a newer human save after the agent's edit returns a conflict, and the title is not reverted", async () => {
  const { deps, postRepo } = fakeRouteDeps();

  await wired("content_post_update", deps).handler(executionContext({ id: "post-1", kind: "post", title: "Edited Title" }));

  const listed = (await wired("change_sets_list", deps).handler(executionContext({}))) as {
    changeSets: Array<{ id: string; status: string }>;
  };
  const applied = listed.changeSets.find((cs) => cs.status === "applied");
  assert.ok(applied, "expected an applied change set to revert");

  // A newer save by someone else — a direct repo write, not through any tool, mirroring
  // `contracts/core/commands/__tests__/integration/revert-plugin-ext.integration.test.ts`'s own
  // technique for simulating "the entity moved on since this change set was applied".
  const editedByAgent = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" });
  assert.ok(editedByAgent);
  await postRepo.save({ ...editedByAgent, title: "Human Edited Title", version: editedByAgent.version + 1, updatedAt: LATER });

  const reverted = (await wired("change_sets_revert", deps).handler(
    executionContext({ changeSetId: applied.id })
  )) as { reverted: boolean; code?: string };

  assert.equal(reverted.reverted, false);
  assert.equal(reverted.code, "REVERT_CONFLICT");

  const afterAttempt = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" });
  assert.equal(afterAttempt?.title, "Human Edited Title", "a conflicted revert must not have written anything");
});

test("change_sets_revert: the published schema has no 'force' property", () => {
  const revertEntry = getChangeSetsAgentToolCatalog().find((tool) => tool.name === "change_sets_revert");
  assert.ok(revertEntry, "expected a change_sets_revert catalog entry");
  const properties = (revertEntry.inputSchema as { properties: Record<string, unknown> }).properties;
  assert.ok(!("force" in properties), "change_sets_revert must not accept a 'force' parameter at all");
});

test("change_sets_revert: the contributor registers under its own domain key", () => {
  const domains = listToolContributors().map((c) => c.domain);
  assert.ok(domains.includes("change-sets"));
});
