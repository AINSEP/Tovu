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
import * as contentSchema from "#src/platform/db/schema";
import { buildTrashRegistry } from "#src/features/trash/registry";
import type { TrashEntityType } from "#src/features/trash/ports";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createSqliteTrashDb } from "#src/features/trash/db-port.sqlite";
import { createTableTrashAdapter } from "#src/features/trash/table-adapter";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "#src/features/trash/repo.sqlite";
import { createTrashService } from "#src/features/trash/write-service";
import type { TrashAdapter } from "#src/features/trash/index";
import type { TrashAwareInMemoryEntryRepo } from "#src/features/entries/trash-aware-memory-repo";

import { deriveTrashItemRegistrations, TRASH_ITEM_DELEGATES, TRASH_ITEM_TOOL_ID, type TrashItemToolDeps } from "#src/features/trash/trash-item-tool";

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

// This file's own hermetic composition (`createRouteDeps()` in `composition/app.ts`) hardcodes
// `registry: new Map()` — it has no Drizzle-backed `content.db` for `createTableTrashAdapter` to run
// against (see that file's comment on the field) — so it can never surface a GENERIC kind (`form`,
// `form_submission`, and whatever T1 adds) on its own. Built once from the real schema module (no
// live DB needed — it is pure table/column metadata), the same way the real composition root
// (`composition/deps.ts`) builds it, so a test that needs a generic kind reachable overrides
// `registry`/`isTrashableEntityType` locally with this rather than asserting against data the
// hermetic root structurally cannot produce.
const REAL_REGISTRY = buildTrashRegistry({ schema: contentSchema });

function withRealTrashRegistry(routeDeps: RouteDeps): RouteDeps {
  return {
    ...routeDeps,
    registry: REAL_REGISTRY,
    // Production ties the two together the same way (`deps.ts`: every registry entry gets an
    // adapter, so `isTrashableEntityType` is `trashAdapters.has`, and `trashAdapters` is built FROM
    // the registry) — `||` keeps this hermetic root's existing delegate-backed kinds (post, comment,
    // media, redirect, widget, all wired via hand-built in-memory adapters) true too.
    isTrashableEntityType: (entityType: TrashEntityType) => routeDeps.isTrashableEntityType(entityType) || REAL_REGISTRY.has(entityType),
  } as RouteDeps;
}

/** The generic (no-delegate) kinds `withRealTrashRegistry` makes reachable, in registry insertion
 *  order — computed from the SAME registry rather than hardcoded, so this file does not go stale the
 *  moment another task registers a new `TRASHABLE` type (T1 is mid-flight on `menu`/`term`/
 *  `taxonomy` as this is written). */
function realGenericKinds(): TrashEntityType[] {
  return [...REAL_REGISTRY.keys()].filter((entityType) => !TRASH_ITEM_DELEGATES.has(entityType));
}

/**
 * A GENERIC kind (no bespoke delegate, e.g. `form`) actually WRITES through `moveToTrash`, which
 * reads `routeDeps.db` — this file's own hermetic `harness()` stubs `db` to throw ("must never be
 * called", true only while `registry` is empty). Real SQLite, real `buildTrashRegistry`, real
 * `TrashPort` — the same three-line composition `features/trash/__tests__/form-trash-flow.test.ts`
 * already uses for the identical reason — is the only way to exercise the generic path past its
 * confirmation dialog rather than stopping at "the dialog was raised."
 */
interface SqliteFormHarness {
  routeDeps: TrashItemToolDeps;
  surfaces: { surfaceExchanges: SurfaceExchangeStore };
  authorizeCalls: Array<{ permission: string }>;
  formIsLive(id: string): boolean;
}

function sqliteFormHarness(options: { deny?: boolean } = {}): SqliteFormHarness {
  const workspaceId = "ws-trash-item-generic";
  const db = openContentDb(":memory:");
  db.$client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(workspaceId, workspaceId, workspaceId, NOW);
  db.$client
    .prepare(
      `INSERT INTO form_definitions
         (id, workspace_id, name, slug, fields_json, notify_json, status, created_at, updated_at, deleted_at, version)
       VALUES ('f1', ?, 'Contact Form', 'contact-form', '{"fields":[]}', '{"enabled":false,"recipients":[]}', 'active', ?, ?, NULL, 1)`
    )
    .run(workspaceId, NOW, NOW);

  const registry = buildTrashRegistry({ schema: contentSchema });
  const trashDb = createSqliteTrashDb({ db });
  const adapters = new Map<string, TrashAdapter>(
    [...registry.values()].map((entry) => [entry.entityType, createTableTrashAdapter({ entry, db: trashDb })])
  );
  let seq = 0;
  const trash = createTrashService({
    repo: new SqliteTrashRepo(db.$client),
    adapters,
    idGen: { next: () => `trash-${(seq += 1)}` },
    transaction: createContentDbTransactionRunner(db.$client),
  });

  const authorizeCalls: Array<{ permission: string }> = [];
  const routeDeps = {
    workspaceId,
    authorize: async (params: { permission: string }) => {
      authorizeCalls.push(params);
      return options.deny ? { allowed: false, reason: "insufficient_permission" } : { allowed: true, reason: "matched" };
    },
    isTrashableEntityType: (entityType: TrashEntityType) => registry.has(entityType),
    registry,
    trash,
    db: trashDb,
    clock: { nowIso: () => NOW },
  } as unknown as TrashItemToolDeps;

  return {
    routeDeps,
    surfaces: { surfaceExchanges: createSurfaceExchangeStore() },
    authorizeCalls,
    formIsLive: (id) =>
      (db.$client.prepare(`SELECT deleted_at FROM form_definitions WHERE id = ?`).get(id) as { deleted_at: string | null } | undefined)
        ?.deleted_at === null,
  };
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
  await routeDeps.commentRepo.create(row as never);
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

  // `form`, not `widget`: `widget` is one of `TRASH_ITEM_DELEGATES` now (2026-09-21), so it has a
  // registered adapter (`widgets_trash_instance`) in this file's default (registry-empty) harness —
  // `form` is a genuinely un-adapted kind here (its only home is the GENERIC registry path, and this
  // harness's `registry` is empty; see `withRealTrashRegistry`'s comment).
  await assert.rejects(call(tool(registrations, TRASH_ITEM_TOOL_ID), { entityType: "form", entityId: "post-1" }), {
    message:
      "trash_item: 'form' is not a kind of thing the Trash can hold. Expected one of: post, comment, media, redirect, widget. Nothing was changed.",
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
  // `widget` now appears in "Expected one of" too (it is a delegate kind whose own
  // `isTrashableEntityType` check `probed` never touches — only `post` is probed here).
  await assert.rejects(call(trashItem, { entityType: "post", entityId: "post-1" }), {
    message:
      "trash_item: 'post' is not a kind of thing the Trash can hold. Expected one of: comment, media, redirect, widget. Nothing was changed.",
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
  // `widgets_trash_instance`'s catalog is Jini-owned too; its Tovu wrapper hard-codes the same gate.
  declared.set("widgets_trash_instance", "widgets.delete");

  for (const delegate of TRASH_ITEM_DELEGATES.values()) {
    assert.equal(delegate.permission, declared.get(delegate.toolId), `${delegate.entityType} -> ${delegate.toolId}`);
  }
  assert.deepEqual([...TRASH_ITEM_DELEGATES.keys()], ["post", "comment", "media", "redirect", "widget"]);
});

test("SINK AUDIT: in the production catalog, trash_item accepts every delegate AND every generic TRASHABLE kind", () => {
  const { routeDeps, registrations } = harness(EVERYTHING);
  // This file's hermetic `registrations`/`routeDeps.registry` is empty (see `withRealTrashRegistry`'s
  // comment), so the generic side is rebuilt directly with a real, non-empty registry rather than
  // read off `harness()`'s own already-built (registry-empty) `trash_item`.
  const [trashItem] = deriveTrashItemRegistrations({
    registrations,
    routeDeps: withRealTrashRegistry(routeDeps),
    surfaces: createSurfaceExchangeStore(),
  });
  const schema = trashItem.descriptor.inputSchema as {
    properties: { entityType: { enum: string[] } };
  };
  // Delegates first (insertion order of TRASH_ITEM_DELEGATES), then generic registry kinds with no
  // delegate (insertion order of TRASHABLE) — `widget` has a delegate, so it never repeats below.
  assert.deepEqual(schema.properties.entityType.enum, ["post", "comment", "media", "redirect", "widget", ...realGenericKinds()]);
});

test("a kind whose delete tool is not registered is not accepted, with an exact error, and nothing is written", async () => {
  const { routeDeps, registrations } = harness(EVERYTHING);
  await seedComment(routeDeps);
  const withoutComments = registrations.filter((registration) => registration.descriptor.id !== "comments_trash_comment");
  const [trashItem] = deriveTrashItemRegistrations({
    registrations: withoutComments,
    routeDeps: withRealTrashRegistry(routeDeps),
    surfaces: createSurfaceExchangeStore(),
  });
  assert.ok(trashItem);

  const accepted = ["post", "media", "redirect", "widget", ...realGenericKinds()].join(", ");
  await assert.rejects(call(trashItem, { entityType: "comment", entityId: "comment-1" }), {
    message: `trash_item: 'comment' is not a kind of thing the Trash can hold. Expected one of: ${accepted}. Nothing was changed.`,
  });
  assert.equal((await routeDeps.commentRepo.findById({ workspaceId: routeDeps.workspaceId, id: "comment-1" }))?.status, "approved");
});

test("with no delegate tool registered and an empty registry, trash_item is not registered", () => {
  const { routeDeps } = harness(EVERYTHING);
  const emptyRegistry = { ...routeDeps, registry: new Map() };
  assert.deepEqual(deriveTrashItemRegistrations({ registrations: [], routeDeps: emptyRegistry, surfaces: createSurfaceExchangeStore() }), []);
});

test("with no delegate tool registered but a non-empty registry, trash_item is still registered for the GENERIC kinds", () => {
  const { routeDeps } = harness(EVERYTHING);
  const [trashItem] = deriveTrashItemRegistrations({
    registrations: [],
    routeDeps: withRealTrashRegistry(routeDeps),
    surfaces: createSurfaceExchangeStore(),
  });
  assert.ok(trashItem, "generic registry kinds have no delegate, so trash_item must still be built from the registry alone");
  const schema = trashItem.descriptor.inputSchema as { properties: { entityType: { enum: string[] } } };
  // `registrations: []` (not just "no widget delegate"): NO delegate handler resolves here, so even
  // `widget` (which normally routes to its delegate — see `realGenericKinds()`, used elsewhere for
  // the ordinary case) falls through to the generic path too. Every registry entry, unfiltered.
  assert.deepEqual(schema.properties.entityType.enum, [...REAL_REGISTRY.keys()]);
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
