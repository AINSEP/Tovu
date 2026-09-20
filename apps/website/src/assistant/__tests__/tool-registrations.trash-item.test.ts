import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { resetToolContributorsForTests } from "#src/assistant/tool-contribution-registry";
import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import {
  SURFACE_EXCHANGE_ID_PARAM,
  createSurfaceExchangeStore,
  type SurfaceExchangeStore,
} from "#src/contracts/core/tool-surface-exchanges";
import { commentsAgentToolCatalog } from "#src/features/comments/agent-tools";
import { postAgentToolCatalog } from "#src/features/post/agent-tools";
import { getRedirectsAgentToolCatalog } from "#src/features/redirects/agent-tools";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";
import type { RouteDeps } from "#src/server/routes/types";

import { deriveTrashItemRegistrations, TRASH_ITEM_DELEGATES, TRASH_ITEM_TOOL_ID } from "#src/features/trash/trash-item-tool";

/**
 * @file `trash_item` — one generic "move this to the Trash" tool that is a fifth DOOR onto the four
 * per-domain delete tools, not a fifth PATH around them.
 *
 * Everything here runs through the REAL registry (`buildAssistantToolRegistrations` over the real
 * hermetic composition) rather than a hand-built registration, because the defect this codebase
 * keeps shipping is a correct primitive whose call site was never wired. A test that built the tool
 * by hand would pass just as well with `trash_item` missing from the product.
 */

resetToolContributorsForTests();
installFirstPartyToolContributors();

const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-20T12:00:00.000Z";

type Grants = ReadonlySet<string>;

/** Real hermetic composition, with `authorize` replaced by an explicit grant set. */
function harness(grants: Grants) {
  const base = createRouteDeps() as unknown as RouteDeps;
  const authorizeCalls: string[] = [];
  const routeDeps = {
    ...base,
    authorize: async (params: { permission: string }) => {
      authorizeCalls.push(params.permission);
      return grants.has(params.permission)
        ? { allowed: true, reason: "matched" }
        : { allowed: false, reason: "insufficient_permission" };
    },
  } as RouteDeps;
  const surfaceExchanges = createSurfaceExchangeStore();
  const registrations = buildAssistantToolRegistrations(routeDeps, { surfaceExchanges });
  return { routeDeps, surfaceExchanges, registrations, authorizeCalls };
}

function tool(registrations: readonly ToolRegistration[], id: string): ToolRegistration {
  const found = registrations.find((registration) => registration.descriptor.id === id);
  assert.ok(found, `expected '${id}' to be registered in the real assistant catalog`);
  return found;
}

function call(registration: ToolRegistration, input: unknown, emitSurface?: SurfaceEmitter) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
    ...(emitSurface ? { emitSurface } : {}),
  } as ToolExecutionContext;
  return registration.handler(ctx);
}

async function seedPost(routeDeps: RouteDeps, overrides: Record<string, unknown> = {}) {
  const row = {
    id: "post-1",
    workspaceId: routeDeps.workspaceId,
    title: "A post nobody should lose",
    slug: "a-post",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    updatedAt: NOW,
    version: 1,
    deletedAt: null,
    ...overrides,
  };
  await routeDeps.postRepo.save(row as never);
  return row;
}

async function seedComment(routeDeps: RouteDeps, overrides: Record<string, unknown> = {}) {
  const row = {
    id: "comment-1",
    workspaceId: routeDeps.workspaceId,
    entryId: "entry-1",
    parentId: null,
    threadRootId: "comment-1",
    depth: 0,
    status: "approved",
    authorPrincipalId: null,
    authorName: "Ada",
    authorEmail: null,
    authorUrl: null,
    authorIpHash: null,
    bodyText: "First!",
    createdAt: NOW,
    updatedAt: NOW,
    version: 3,
    ...overrides,
  };
  await routeDeps.commentRepo.save(row as never);
  return row;
}

/** Starts a call, waits for its dialog, and returns the pending result plus the dialog's exchange id. */
async function raiseDialog(registration: ToolRegistration, input: unknown) {
  const emitted: unknown[] = [];
  const pending = call(registration, input, async (surface) => void emitted.push(surface));
  // Settle the handler's reads before the dialog is asserted. Several turns, because trash_item
  // resolves the row before the delegate opens its own exchange.
  for (let turn = 0; turn < 10 && emitted.length === 0; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(emitted.length, 1, "exactly one confirmation dialog must be raised before anything is written");
  const html = (emitted[0] as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the dialog must carry its exchange id");
  return { pending, exchangeId: match[1]!, html };
}

function answer(store: SurfaceExchangeStore, spec: { exchangeId: string; toolId: string; decision: "confirm" | "cancel" }) {
  const delivered = store.deliver({
    exchangeId: spec.exchangeId,
    toolId: spec.toolId,
    principalId: PRINCIPAL_ID,
    params: { [SURFACE_EXCHANGE_ID_PARAM]: spec.exchangeId, decision: spec.decision },
  });
  assert.deepEqual(delivered, { ok: true });
}

async function trashRows(routeDeps: RouteDeps) {
  return (await routeDeps.trash.list({ workspaceId: routeDeps.workspaceId, now: NOW, limit: 50 })).items;
}

const EVERYTHING: Grants = new Set([
  "content.read",
  "content.write",
  "comments.read",
  "comments.moderate",
  "comments.delete",
  "media.read",
  "media.delete",
  "admin.redirects.manage",
]);

// --- reachability ----------------------------------------------------------------------------

test("trash_item is registered in the real assistant catalog, and declares itself destructive", () => {
  const { registrations } = harness(EVERYTHING);
  const registration = tool(registrations, TRASH_ITEM_TOOL_ID);
  assert.equal(registration.descriptor.readOnly, false);
});

test("a post trashed through trash_item goes through content_post_delete's own dialog, and lands in the Trash index", async () => {
  const { routeDeps, surfaceExchanges, registrations } = harness(EVERYTHING);
  await seedPost(routeDeps);

  const { pending, exchangeId } = await raiseDialog(tool(registrations, TRASH_ITEM_TOOL_ID), {
    entityType: "post",
    entityId: "post-1",
  });
  // Nothing is written while the human is still looking at the dialog.
  assert.equal((await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id: "post-1" }))?.deletedAt, null);
  assert.deepEqual(await trashRows(routeDeps), []);

  // The dialog's buttons answer the DELEGATE's exchange: the human is confirming content_post_delete.
  answer(surfaceExchanges, { exchangeId, toolId: "content_post_delete", decision: "confirm" });
  const result = (await pending) as { entityType: string; entityId: string; via: string; outcome: { deleted: boolean } };

  assert.equal(result.entityType, "post");
  assert.equal(result.entityId, "post-1");
  assert.equal(result.via, "content_post_delete");
  assert.equal(result.outcome.deleted, true);

  const after = await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id: "post-1" });
  assert.ok(after?.deletedAt, "the post's own marker must be set");
  const rows = await trashRows(routeDeps);
  assert.deepEqual(
    rows.map((row) => [row.entityType, row.entityId, row.displayTitle]),
    [["post", "post-1", "A post nobody should lose"]],
    "the marker and the index row are written together, by the domain's own path"
  );
});

test("a comment trashed through trash_item resolves its version server-side and goes through comments_trash_comment", async () => {
  const { routeDeps, surfaceExchanges, registrations } = harness(EVERYTHING);
  await seedComment(routeDeps);

  const { pending, exchangeId } = await raiseDialog(tool(registrations, TRASH_ITEM_TOOL_ID), {
    entityType: "comment",
    entityId: "comment-1",
  });
  answer(surfaceExchanges, { exchangeId, toolId: "comments_trash_comment", decision: "confirm" });
  const result = (await pending) as { via: string; outcome: { trashed: boolean } };

  assert.equal(result.via, "comments_trash_comment");
  assert.equal(result.outcome.trashed, true);
  const after = await routeDeps.commentRepo.findById({ workspaceId: routeDeps.workspaceId, id: "comment-1" });
  assert.equal(after?.status, "trash");
  assert.deepEqual(
    (await trashRows(routeDeps)).map((row) => [row.entityType, row.entityId]),
    [["comment", "comment-1"]]
  );
});

// --- confirmation --------------------------------------------------------------------------

test("cancelling the dialog writes nothing", async () => {
  const { routeDeps, surfaceExchanges, registrations } = harness(EVERYTHING);
  await seedPost(routeDeps);

  const { pending, exchangeId } = await raiseDialog(tool(registrations, TRASH_ITEM_TOOL_ID), {
    entityType: "post",
    entityId: "post-1",
  });
  answer(surfaceExchanges, { exchangeId, toolId: "content_post_delete", decision: "cancel" });
  const result = (await pending) as { outcome: { deleted: boolean; cancelled: boolean } };

  assert.deepEqual([result.outcome.deleted, result.outcome.cancelled], [false, true]);
  assert.equal((await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id: "post-1" }))?.deletedAt, null);
  assert.deepEqual(await trashRows(routeDeps), []);
});

test("with no confirmation channel, trash_item fails closed exactly as the delegate does, and writes nothing", async () => {
  const { routeDeps, registrations } = harness(EVERYTHING);
  await seedPost(routeDeps);

  await assert.rejects(
    call(tool(registrations, TRASH_ITEM_TOOL_ID), { entityType: "post", entityId: "post-1" }),
    { message: /^CONTENT_POST_NO_CONFIRMATION_CHANNEL: content_post_delete: this execution context has no interactive confirmation channel/ }
  );
  assert.equal((await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id: "post-1" }))?.deletedAt, null);
  assert.deepEqual(await trashRows(routeDeps), []);
});

// --- entityType validation -----------------------------------------------------------------

test("an entityType with no registered Trash adapter is refused with an exact error, before any read or permission check", async () => {
  const { routeDeps, registrations, authorizeCalls } = harness(EVERYTHING);
  await seedPost(routeDeps);

  await assert.rejects(call(tool(registrations, TRASH_ITEM_TOOL_ID), { entityType: "widget", entityId: "post-1" }), {
    message:
      "trash_item: 'widget' is not a kind of thing the Trash can hold. Expected one of: post, comment, media, redirect. Nothing was changed.",
  });
  assert.deepEqual(authorizeCalls, []);
  assert.deepEqual(await trashRows(routeDeps), []);
});

test("the entityType check reads the live adapter map at CALL time, not a list captured at registration", async () => {
  const { routeDeps, registrations } = harness(EVERYTHING);
  await seedPost(routeDeps);
  let postAdapterRegistered = true;
  const probed = { ...routeDeps, isTrashableEntityType: (entityType: string) => entityType !== "post" || postAdapterRegistered };
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashItem = tool(buildAssistantToolRegistrations(probed as RouteDeps, { surfaceExchanges }), TRASH_ITEM_TOOL_ID);
  void registrations;

  postAdapterRegistered = false;
  await assert.rejects(call(trashItem, { entityType: "post", entityId: "post-1" }), {
    message:
      "trash_item: 'post' is not a kind of thing the Trash can hold. Expected one of: comment, media, redirect. Nothing was changed.",
  });
  assert.equal((await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id: "post-1" }))?.deletedAt, null);
});

test("an id that does not exist in that kind's own table is refused with an exact error, and nothing is written", async () => {
  const { routeDeps, registrations } = harness(EVERYTHING);

  await assert.rejects(call(tool(registrations, TRASH_ITEM_TOOL_ID), { entityType: "comment", entityId: "no-such" }), {
    message: "trash_item: comment 'no-such' was not found. Nothing was changed.",
  });
  assert.deepEqual(await trashRows(routeDeps), []);
});

// --- escalation ----------------------------------------------------------------------------

test("ESCALATION: a principal holding only comments.delete cannot trash a post by naming it a comment", async () => {
  const { routeDeps, registrations } = harness(new Set(["comments.delete"]));
  await seedPost(routeDeps);
  const trashItem = tool(registrations, TRASH_ITEM_TOOL_ID);
  const emitted: unknown[] = [];

  await assert.rejects(
    call(trashItem, { entityType: "comment", entityId: "post-1" }, async (surface) => void emitted.push(surface)),
    { message: "trash_item: comment 'post-1' was not found. Nothing was changed." }
  );

  assert.deepEqual(emitted, [], "no dialog may be raised for an entity the named kind does not own");
  assert.equal((await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id: "post-1" }))?.deletedAt, null);
  assert.deepEqual(await trashRows(routeDeps), []);
});

test("ESCALATION: the same principal naming the post honestly is refused on content.write, before any read or dialog", async () => {
  const { routeDeps, registrations, authorizeCalls } = harness(new Set(["comments.delete"]));
  await seedPost(routeDeps);
  const emitted: unknown[] = [];

  await assert.rejects(
    call(tool(registrations, TRASH_ITEM_TOOL_ID), { entityType: "post", entityId: "post-1" }, async (surface) => void emitted.push(surface)),
    { message: "principal 'principal-under-test' is not authorized for 'content.write' (insufficient_permission)" }
  );
  assert.deepEqual(authorizeCalls, ["content.write"]);
  assert.deepEqual(emitted, []);
  assert.equal((await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id: "post-1" }))?.deletedAt, null);
});

test("ESCALATION: comments.moderate alone (the Trash's RESTORE gate for comments) cannot trash a comment", async () => {
  const { routeDeps, registrations } = harness(new Set(["comments.moderate"]));
  await seedComment(routeDeps);

  await assert.rejects(call(tool(registrations, TRASH_ITEM_TOOL_ID), { entityType: "comment", entityId: "comment-1" }), {
    message: "principal 'principal-under-test' is not authorized for 'comments.delete' (insufficient_permission)",
  });
  assert.equal((await routeDeps.commentRepo.findById({ workspaceId: routeDeps.workspaceId, id: "comment-1" }))?.status, "approved");
});

// --- the delegate table cannot drift from the tools it routes to -----------------------------

test("every delegate pre-checks exactly the permission its own delete tool declares", () => {
  const declared = new Map<string, string>(
    [...postAgentToolCatalog, ...commentsAgentToolCatalog, ...getRedirectsAgentToolCatalog()].map((entry) => [
      entry.name,
      entry.authorization.permission,
    ])
  );
  // `media_trash_asset`'s catalog is Jini-owned; its Tovu wrapper hard-codes the same gate.
  declared.set("media_trash_asset", "media.delete");

  for (const delegate of TRASH_ITEM_DELEGATES.values()) {
    assert.equal(delegate.permission, declared.get(delegate.toolId), `${delegate.entityType} -> ${delegate.toolId}`);
  }
  assert.deepEqual([...TRASH_ITEM_DELEGATES.keys()], ["post", "comment", "media", "redirect"]);
});

test("SINK AUDIT: in the production catalog, trash_item accepts all four kinds — every delegate is really wired", () => {
  const { registrations } = harness(EVERYTHING);
  const schema = tool(registrations, TRASH_ITEM_TOOL_ID).descriptor.inputSchema as {
    properties: { entityType: { enum: string[] } };
  };
  assert.deepEqual(schema.properties.entityType.enum, ["post", "comment", "media", "redirect"]);
});

test("a kind whose delete tool is not registered is not accepted, with an exact error, and nothing is written", async () => {
  const { routeDeps, registrations } = harness(EVERYTHING);
  await seedComment(routeDeps);
  const withoutComments = registrations.filter((registration) => registration.descriptor.id !== "comments_trash_comment");
  const [trashItem] = deriveTrashItemRegistrations({ registrations: withoutComments, routeDeps });
  assert.ok(trashItem);

  await assert.rejects(call(trashItem, { entityType: "comment", entityId: "comment-1" }), {
    message:
      "trash_item: 'comment' is not a kind of thing the Trash can hold. Expected one of: post, media, redirect. Nothing was changed.",
  });
  assert.equal((await routeDeps.commentRepo.findById({ workspaceId: routeDeps.workspaceId, id: "comment-1" }))?.status, "approved");
});

test("with no delegate tool registered at all, trash_item is not registered", () => {
  const { routeDeps } = harness(EVERYTHING);
  assert.deepEqual(deriveTrashItemRegistrations({ registrations: [], routeDeps }), []);
});

// --- the purge ban reaches this tool too -----------------------------------------------------

test("trash_item never reaches TrashPort.purgeSelected, on any input shape a model is likely to send", async () => {
  const { routeDeps } = harness(EVERYTHING);
  class PurgeWasReachedError extends Error {}
  const guarded = {
    ...routeDeps,
    trash: {
      ...routeDeps.trash,
      async purgeSelected(): Promise<never> {
        throw new PurgeWasReachedError("trash_item reached purgeSelected");
      },
    },
  } as RouteDeps;
  const trashItem = tool(buildAssistantToolRegistrations(guarded, { surfaceExchanges: createSurfaceExchangeStore() }), TRASH_ITEM_TOOL_ID);

  for (const input of [{}, { entityType: "post", entityId: "post-1" }, { entityType: "comment", entityId: "c" }, { ids: ["row-1"] }]) {
    try {
      await call(trashItem, input);
    } catch (error) {
      assert.ok(!(error instanceof PurgeWasReachedError), `reached purgeSelected with ${JSON.stringify(input)}`);
    }
  }
});
