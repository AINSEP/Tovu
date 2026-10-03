import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { ForbiddenError, type AuthorizeFn } from "@jini-ai/cms/core";

import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo, InMemoryPostSearchIndex, createPostRevertRegistry } from "#src/features/post/index";
import { contributePostTools } from "#src/features/post/tool-registrations";
import { contributeChangeSetsTools } from "#src/features/change-sets/tool-registrations";
import { getChangeSetsAgentToolCatalog } from "#src/features/change-sets/agent-tools";
import type { PostRecord } from "#src/features/post/post";
import type { RouteDeps } from "#src/server/routes/types";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

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

contributions.contributors.clear({});
contributions.contributors.register({ contribution: contributePostTools() });
contributions.contributors.register({ contribution: contributeChangeSetsTools() });

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

function fakeRouteDeps(options: { allow?: boolean; allowedPermissions?: string[] } = {}) {
  const allow = options.allow ?? true;
  const postRepo = new InMemoryPostRepo([seededPost()]);
  const changeSets = new InMemoryChangeSetRepo();
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  let counter = 0;
  const authorizationCalls: Parameters<AuthorizeFn>[0][] = [];

  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs() { return Date.parse(this.nowIso()); }, nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    changeSets,
    outbox,
    bus,
    postRepo,
    postSearch: new InMemoryPostSearchIndex(postRepo),
    revertRegistry: createPostRevertRegistry({
      postRepo,
      clock: { nowMs() { return Date.parse(this.nowIso()); }, nowIso: () => NOW },
      outbox,
      forgetRemoved: async () => {},
    }),
    authorize: async (input: Parameters<AuthorizeFn>[0]) => {
      authorizationCalls.push(input);
      return allow && (!options.allowedPermissions || options.allowedPermissions.includes(input.permission))
        ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  return { deps: deps as unknown as RouteDeps, postRepo, changeSets, authorizationCalls };
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
  return new Map(buildAssistantToolRegistrations(deps, undefined, { contributions }).map((r) => [r.descriptor.id, r]));
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

test("change_sets_revert maps missing, reverted and non-revertible records to ToolInputError", async () => {
  const { deps, changeSets } = fakeRouteDeps();
  const revert = (changeSetId: string) => wired("change_sets_revert", deps).handler(executionContext({ changeSetId }));
  await assert.rejects(() => revert("missing"), (err) => err instanceof ToolInputError && /was not found/.test(err.message));
  await changeSets.insert({ record: { id: "reverted", workspaceId: WORKSPACE_ID, status: "reverted", summary: "already undone", createdAt: NOW }, items: [] });
  await assert.rejects(() => revert("reverted"), (err) => err instanceof ToolInputError && /only 'applied'/.test(err.message));
  await changeSets.insert({ record: { id: "unsupported", workspaceId: WORKSPACE_ID, status: "applied", summary: "unsupported inverse", createdAt: NOW }, items: [
    { id: "item-1", changeSetId: "unsupported", entityType: "unsupported", entityId: "entity-1", operation: "update", position: 0, inversePayload: {} },
  ] });
  await assert.rejects(() => revert("unsupported"), (err) => err instanceof ToolInputError && /no inverse applier/.test(err.message));
  const failure = new Error("unexpected storage failure");
  changeSets.findById = async () => { throw failure; };
  await assert.rejects(() => revert("unsupported"), (err) => err === failure);
});

test("change-set tools enforce scoped permissions before reading or reverting", async () => {
  for (const options of [{ allow: false }, { allowedPermissions: ["changeset.read"] }]) {
    const { deps, postRepo, changeSets, authorizationCalls } = fakeRouteDeps(options);
    const header = { id: "cs-denied", workspaceId: WORKSPACE_ID, status: "applied" as const, summary: "edit", createdAt: NOW };
    await changeSets.insert({ record: header, items: [{ id: "item-denied", changeSetId: header.id, entityType: "post", entityId: "post-1", operation: "update", position: 0, entityVersionAtApply: 1, inversePayload: { ...seededPost(), title: "Reverted Title" } }] });
    const before = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" });
    await assert.rejects(() => wired("change_sets_revert", deps).handler(executionContext({ changeSetId: header.id })), ForbiddenError);
    assert.deepEqual(authorizationCalls, [{ principalId: PRINCIPAL_ID, permission: "changeset.revert", workspaceId: WORKSPACE_ID, entityType: "change_set", entityId: header.id }]);
    assert.deepEqual(await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" }), before);
    assert.equal((await changeSets.findById({ workspaceId: WORKSPACE_ID, id: header.id }))?.changeSet.status, "applied");
    authorizationCalls.length = 0;
    let listed = false;
    const originalList = changeSets.listByWorkspace.bind(changeSets);
    changeSets.listByWorkspace = async (input) => { listed = true; return originalList(input); };
    if (options.allow === false) {
      await assert.rejects(() => wired("change_sets_list", deps).handler(executionContext({})), ForbiddenError);
      assert.equal(listed, false);
    } else {
      await wired("change_sets_list", deps).handler(executionContext({}));
      assert.equal(listed, true);
    }
    assert.deepEqual(authorizationCalls, [{ principalId: PRINCIPAL_ID, permission: "changeset.read", workspaceId: WORKSPACE_ID, entityType: "change_set" }]);
  }
});

test("change_sets_revert: the published schema has no 'force' property", () => {
  const revertEntry = getChangeSetsAgentToolCatalog().find((tool) => tool.name === "change_sets_revert");
  assert.ok(revertEntry, "expected a change_sets_revert catalog entry");
  const properties = (revertEntry.inputSchema as { properties: Record<string, unknown> }).properties;
  assert.ok(!("force" in properties), "change_sets_revert must not accept a 'force' parameter at all");
});

test("change_sets_revert: the contributor registers under its own domain key", () => {
  const domains = contributions.contributors.list({}).map((c) => c.domain);
  assert.ok(domains.includes("change-sets"));
});

test("change_sets_list: newest first, 20 by default, and never more than 100 however large the limit", async () => {
  const { deps, changeSets } = fakeRouteDeps();
  // Inserted oldest first, so a list that trusted insertion order would come back reversed.
  for (let i = 0; i < 105; i++) {
    const createdAt = new Date(Date.UTC(2026, 8, 24, 0, 0, i)).toISOString();
    await changeSets.insert({ record: { id: `cs-${i}`, workspaceId: WORKSPACE_ID, status: "applied", summary: `change ${i}`, createdAt } as never, items: [] }
    );
  }

  const byDefault = (await wired("change_sets_list", deps).handler(executionContext({}))) as { changeSets: { id: string }[] };
  assert.equal(byDefault.changeSets.length, 20);
  assert.equal(byDefault.changeSets[0]?.id, "cs-104");

  const huge = (await wired("change_sets_list", deps).handler(executionContext({ limit: 500 }))) as { changeSets: unknown[] };
  assert.equal(huge.changeSets.length, 100);
});
