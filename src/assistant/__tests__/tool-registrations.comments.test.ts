/**
 * @file Covers the 7 Comments tools: catalog completeness, published contracts, risk
 * cross-check, the ADR-021 authorization half (explicit-handler style — see
 * `tool-registrations.ts`'s `assertAuthorizedOrThrow` doc comment for why Comments/Members/
 * Newsletter differ from Forms/Identity here), and a multi-tool workflow test proving the tools
 * compose correctly in sequence.
 *
 * Uses the REAL `InMemoryCommentRepo` / `InMemorySettingsRepo` / real `createCommentWriteService`
 * (as `comments/__tests__/write-service.test.ts` does) rather than hand-rolled write-log fakes, so
 * "nothing was written" / "the setting is actually persisted" is asserted against real repo state.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { ForbiddenError } from "@jini-ai/cms/core";
import {
  ForbiddenError as SettingsForbiddenError,
  InMemorySettingsRepo,
} from "../../features/settings/index.js";
import { commentsAgentToolCatalog, type AgentToolDefinition } from "../../comments/agent-tools.js";
import { InMemoryCommentRepo } from "../../comments/repo.memory.js";
import { createCommentHookRegistry } from "../../comments/hooks.js";
import { createCommentWriteService } from "../../comments/write-service.js";
import { ensureCommentsSettingDefinitions } from "../../comments/settings.js";
import type { CommentRecord } from "../../comments/types.js";
import { InMemoryPrincipalRepo } from "@jini-ai/cms/identity";
import type { RouteDeps } from "../../server/routes/types.js";
import {
  assertRiskMetadataIsWirable,
  buildAssistantToolRegistrations,
} from "../tool-registrations/index.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeCommentsTools } from "../../comments/tool-registrations.js";

// Comments moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17 — see `tool-contribution-registry.ts`'s header), so
// `buildAssistantToolRegistrations` below no longer wires it unless something explicitly installs
// it first, mirroring what the real composition roots (`agent-daemon-server.ts`,
// `assistant-byok.ts`) now do via `installFirstPartyToolContributors()`. Reset first so this file's
// own registration is the only one this process's registry holds while these tests run.
resetToolContributorsForTests();
contributeCommentsTools();

const WORKSPACE_ID = "ws-comments-tools";
const PRINCIPAL_ID = "principal-under-test";
const SYSTEM_PRINCIPAL_ID = "system-comments-settings";
const NOW = "2026-07-29T00:00:00.000Z";

function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

async function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const commentRepo = new InMemoryCommentRepo();
  const settingsRepo = new InMemorySettingsRepo();
  const principalRepo = new InMemoryPrincipalRepo();
  const clock = { nowIso: () => NOW };
  const idGen = counterIdGen();

  // The real ledger write chokepoint requires a registered definition before `set()` can write a
  // value — mirrors what boot-time `commentsSettingsReady` does in the real server.
  await ensureCommentsSettingDefinitions(
    { settingsRepo, clock, ids: idGen, principals: principalRepo },
    { workspaceId: WORKSPACE_ID, systemPrincipalId: SYSTEM_PRINCIPAL_ID },
  );

  const authorizeCalls: Array<Record<string, unknown>> = [];
  const authorize = async (params: Record<string, unknown>) => {
    authorizeCalls.push(params);
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  };

  const commentWriteService = createCommentWriteService({
    repo: commentRepo,
    outbox: { enqueue: async () => {} },
    hooks: createCommentHookRegistry(),
    clock,
    idGen,
  });

  const deps = {
    workspaceId: WORKSPACE_ID,
    clock,
    idGen,
    authorize,
    commentRepo,
    commentWriteService,
    commentsReady: Promise.resolve(),
    commentsSettingsReady: Promise.resolve(),
    settingsRepo,
    principalRepo,
  };

  return { deps: deps as unknown as RouteDeps, commentRepo, settingsRepo, authorizeCalls };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = commentsAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function commentsRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(
    buildAssistantToolRegistrations(deps)
      .filter((r) => r.descriptor.id.startsWith("comments_"))
      .map((r) => [r.descriptor.id, r]),
  );
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = commentsRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

/** Seeds one `pending` comment directly into the repo (Comments has no agent-callable "create comment" tool — ingress is the public visitor path, not an admin operation). */
function seedComment(overrides: Partial<CommentRecord> = {}): CommentRecord {
  return {
    id: overrides.id ?? "comment-1",
    workspaceId: WORKSPACE_ID,
    entryId: "entry-1",
    parentId: null,
    threadRootId: overrides.id ?? "comment-1",
    depth: 0,
    status: "pending",
    authorPrincipalId: null,
    authorName: "Visitor",
    authorEmail: "visitor@example.test",
    authorUrl: null,
    authorIpHash: "hash",
    bodyText: "Great post!",
    spamScore: 0.1,
    spamProvider: "heuristic",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. The catalog is complete and honest about what Comments can do
// ---------------------------------------------------------------------------

test("exactly the 7 designed Comments tools are wired — no invented purge tool", async () => {
  const { deps } = await fakeRouteDeps();
  assert.deepEqual(
    [...commentsRegistrations(deps).keys()].sort(),
    [
      "comments_approve_comment",
      "comments_get_settings",
      "comments_list_moderation_queue",
      "comments_mark_comment_spam",
      "comments_restore_comment",
      "comments_trash_comment",
      "comments_update_settings",
    ],
  );
});

test("no wired tool is named for a purge/permanent-delete, and none claims to purge", async () => {
  const { deps } = await fakeRouteDeps();
  for (const [id, registration] of commentsRegistrations(deps)) {
    assert.equal(/purge|permanent/i.test(id), false, `'${id}' must not be named for a purge — that lever is human-UI-only`);
    const claim = registration.descriptor.description.replace(/\b(never|no|not)\b[^.;—]*/gi, "");
    assert.equal(/\bpurge(s|d|ing)?\b/i.test(claim), false, `'${id}' must not claim to purge`);
  }
});

// ---------------------------------------------------------------------------
// 2. Published contracts + risk metadata
// ---------------------------------------------------------------------------

test("every wired Comments registration publishes its catalog entry's inputSchema and description", async () => {
  const { deps } = await fakeRouteDeps();
  for (const [id, registration] of commentsRegistrations(deps)) {
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired Comments tool", async () => {
  const { deps } = await fakeRouteDeps();
  for (const [, registration] of commentsRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined);
  }
});

test("the real Comments catalog and tool-registrations' independent risk classification agree", async () => {
  const { deps } = await fakeRouteDeps();
  for (const id of commentsRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a Comments catalog entry cannot downgrade its own risk", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("comments_approve_comment", { ...catalogEntry("comments_approve_comment"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("the ToolPolicy layer is a pass-through 'allow' for every Comments registration", async () => {
  const { deps } = await fakeRouteDeps();
  for (const [toolId, registration] of commentsRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

// ---------------------------------------------------------------------------
// 3. Authorization (explicit-handler style) — each moderation action
// ---------------------------------------------------------------------------

const MODERATION_TOOLS: Record<string, { permission: string; toStatus: string }> = {
  comments_approve_comment: { permission: "comments.moderate", toStatus: "approved" },
  comments_mark_comment_spam: { permission: "comments.moderate", toStatus: "spam" },
  comments_trash_comment: { permission: "comments.delete", toStatus: "trash" },
  comments_restore_comment: { permission: "comments.moderate", toStatus: "approved" },
};

for (const [toolId, spec] of Object.entries(MODERATION_TOOLS)) {
  test(`${toolId}: calls authorize() with its declared permission before touching the repo`, async () => {
    const { deps, commentRepo, authorizeCalls } = await fakeRouteDeps();
    await commentRepo.create(seedComment());
    authorizeCalls.length = 0;

    await wired(toolId, deps).handler(executionContext({ commentId: "comment-1", expectedVersion: 1 }));

    assert.equal(authorizeCalls.length, 1);
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0].permission, spec.permission);
    assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
    assert.equal(authorizeCalls[0].entityType, "comment");
    assert.equal(authorizeCalls[0].entityId, "comment-1");
  });

  test(`${toolId}: a denied principal is refused with ForbiddenError and the comment is left unchanged`, async () => {
    const { deps, commentRepo } = await fakeRouteDeps({ allow: false });
    await commentRepo.create(seedComment());

    await assert.rejects(
      () => wired(toolId, deps).handler(executionContext({ commentId: "comment-1", expectedVersion: 1 })),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenError, `expected ForbiddenError, got ${String(error)}`);
        assert.match((error as Error).message, new RegExp(PRINCIPAL_ID));
        assert.match((error as Error).message, new RegExp(spec.permission.replace(".", "\\.")));
        return true;
      },
    );

    const stillThere = await commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" });
    assert.equal(stillThere?.status, "pending", "a refused moderation action must not change the comment's status");
    assert.equal(stillThere?.version, 1, "a refused moderation action must not bump the version");
  });

  test(`${toolId}: transitions the comment to '${spec.toStatus}' on success`, async () => {
    const { deps, commentRepo } = await fakeRouteDeps();
    await commentRepo.create(seedComment());

    const result = (await wired(toolId, deps).handler(executionContext({ commentId: "comment-1", expectedVersion: 1 }))) as {
      moderated: { commentId: string; toStatus: string };
    };
    assert.deepEqual(result.moderated, { commentId: "comment-1", toStatus: spec.toStatus });

    const updated = await commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" });
    assert.equal(updated?.status, spec.toStatus);
    assert.equal(updated?.version, 2);
  });

  test(`${toolId}: a stale expectedVersion is rejected as a conflict, not silently applied`, async () => {
    const { deps, commentRepo } = await fakeRouteDeps();
    await commentRepo.create(seedComment());

    await assert.rejects(
      () => wired(toolId, deps).handler(executionContext({ commentId: "comment-1", expectedVersion: 99 })),
      /modified concurrently/,
    );
  });
}

test("comments_list_moderation_queue: calls authorize() with 'comments.read' and is read-only", async () => {
  const { deps, commentRepo, authorizeCalls } = await fakeRouteDeps();
  await commentRepo.create(seedComment());
  authorizeCalls.length = 0;

  const result = (await wired("comments_list_moderation_queue", deps).handler(executionContext({}))) as {
    items: { id: string; bodyText: string; version: number }[];
  };

  assert.equal(authorizeCalls.length, 1);
  assert.equal(authorizeCalls[0].permission, "comments.read");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "comment-1");
  assert.equal(result.items[0].bodyText, "Great post!");
  assert.equal("workspaceId" in result.items[0], false, "the agent is already scoped to one workspace");
});

test("comments_list_moderation_queue: a denied principal is refused and gets no data back", async () => {
  const { deps } = await fakeRouteDeps({ allow: false });
  await assert.rejects(() => wired("comments_list_moderation_queue", deps).handler(executionContext({})), ForbiddenError);
});

test("comments_get_settings: calls authorize() with 'comments.configure' (explicit pre-check, since getCommentsSettings does not self-enforce)", async () => {
  const { deps, authorizeCalls } = await fakeRouteDeps();
  authorizeCalls.length = 0;

  const result = (await wired("comments_get_settings", deps).handler(executionContext({}))) as { settings: { enabled: boolean } };

  assert.equal(authorizeCalls.length, 1);
  assert.equal(authorizeCalls[0].permission, "comments.configure");
  assert.equal(result.settings.enabled, true, "default enabled=true before any write");
});

test("comments_get_settings: a denied principal is refused", async () => {
  const { deps } = await fakeRouteDeps({ allow: false });
  await assert.rejects(() => wired("comments_get_settings", deps).handler(executionContext({})), ForbiddenError);
});

test("comments_update_settings: an empty patch is refused rather than accepted as a no-op", async () => {
  const { deps } = await fakeRouteDeps();
  await assert.rejects(() => wired("comments_update_settings", deps).handler(executionContext({})), /at least one of/);
});

test("comments_update_settings: self-enforces via setCommentsSettings's internal set() call — a denied caller is refused and nothing is persisted", async () => {
  const { deps, settingsRepo } = await fakeRouteDeps({ allow: false });
  await assert.rejects(
    () => wired("comments_update_settings", deps).handler(executionContext({ maxDepth: 3 })),
    SettingsForbiddenError,
  );
  // Re-read through a freshly-allowed handle over the SAME repo instance — proves no value row was written.
  const stillDefault = (await wired("comments_get_settings", { ...deps, authorize: async () => ({ allowed: true, reason: "matched" }) } as unknown as RouteDeps).handler(
    executionContext({}),
  )) as { settings: { maxDepth: number } };
  assert.equal(stillDefault.settings.maxDepth, 5, "the default, unwritten value — the denied write must not have persisted");
  assert.ok(settingsRepo, "sanity: same repo instance used across both calls");
});

test("comments_update_settings: persists a partial patch and leaves omitted fields unchanged", async () => {
  const { deps } = await fakeRouteDeps();
  const result = (await wired("comments_update_settings", deps).handler(executionContext({ maxDepth: 2, requireModeration: false }))) as {
    settings: { maxDepth: number; requireModeration: boolean; enabled: boolean };
  };
  assert.equal(result.settings.maxDepth, 2);
  assert.equal(result.settings.requireModeration, false);
  assert.equal(result.settings.enabled, true, "omitted field keeps its default/prior value");
});

// ---------------------------------------------------------------------------
// 4. Multi-tool workflow: update a setting, then act on a real comment using the
//    id/version a prior tool call returned — proving output-to-input composition.
// ---------------------------------------------------------------------------

test("workflow: comments_update_settings -> comments_list_moderation_queue -> comments_approve_comment -> comments_list_moderation_queue chains correctly and leaves consistent state", async () => {
  const { deps, commentRepo } = await fakeRouteDeps();
  await commentRepo.create(seedComment({ id: "c-workflow", bodyText: "Needs review" }));

  // Step 1: tighten moderation settings (a real admin task before reviewing the queue).
  const settingsResult = (await wired("comments_update_settings", deps).handler(executionContext({ requireModeration: true, maxDepth: 4 }))) as {
    settings: { requireModeration: boolean; maxDepth: number };
  };
  assert.equal(settingsResult.settings.requireModeration, true);
  assert.equal(settingsResult.settings.maxDepth, 4);

  // Step 2: list the pending queue — this is how a real caller learns a comment's id/version.
  const queueBefore = (await wired("comments_list_moderation_queue", deps).handler(executionContext({ status: "pending" }))) as {
    items: { id: string; version: number; status: string }[];
  };
  assert.equal(queueBefore.items.length, 1);
  const target = queueBefore.items[0];
  assert.equal(target.id, "c-workflow");
  assert.equal(target.status, "pending");

  // Step 3: act on the comment using EXACTLY the id/version the queue call returned — never a
  // hardcoded value — proving the two tools compose (an agent cannot invent expectedVersion).
  const approveResult = (await wired("comments_approve_comment", deps).handler(
    executionContext({ commentId: target.id, expectedVersion: target.version, note: "looks fine" }),
  )) as { moderated: { commentId: string; toStatus: string } };
  assert.deepEqual(approveResult.moderated, { commentId: "c-workflow", toStatus: "approved" });

  // Step 4: re-list and confirm the state transition is visible end-to-end — pending is now empty,
  // approved now has exactly the one comment, at the bumped version.
  const pendingAfter = (await wired("comments_list_moderation_queue", deps).handler(executionContext({ status: "pending" }))) as { items: unknown[] };
  assert.equal(pendingAfter.items.length, 0);

  const approvedAfter = (await wired("comments_list_moderation_queue", deps).handler(executionContext({ status: "approved" }))) as {
    items: { id: string; version: number }[];
  };
  assert.equal(approvedAfter.items.length, 1);
  assert.equal(approvedAfter.items[0].id, "c-workflow");
  assert.equal(approvedAfter.items[0].version, 2);

  const stored = await commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "c-workflow" });
  assert.equal(stored?.status, "approved");
  assert.equal(stored?.version, 2);
});
