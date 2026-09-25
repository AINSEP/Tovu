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
import * as contentSchema from "#src/platform/db/schema.sqlite";
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
import { createRedirect } from "#src/features/redirects/redirects";

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

// This file's hermetic composition registers only the term/taxonomy GENERIC kinds. Built once from
// the real schema module, the full registry lets tests reach the remaining generic kinds too.
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
  /** Simulates another write landing on the row while a confirmation dialog is still open. */
  bumpFormVersion(id: string): void;
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
    bumpFormVersion: (id) => void db.$client.prepare(`UPDATE form_definitions SET version = version + 1 WHERE id = ?`).run(id),
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

async function seedMedia(routeDeps: RouteDeps, overrides: Record<string, unknown> = {}) {
  const record = {
    id: "media-1",
    workspaceId: routeDeps.workspaceId,
    title: "A photo nobody should lose",
    slug: "a-photo",
    alt: "",
    caption: "",
    credit: "",
    source: { sha256: "0".repeat(64) },
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    ...overrides,
  };
  await routeDeps.mediaRepo.save(record as never);
  return record;
}

async function seedRedirect(routeDeps: RouteDeps, overrides: Record<string, unknown> = {}) {
  const { record } = await createRedirect({
    deps: routeDeps.redirectsWriteDeps,
    input: {
      workspaceId: routeDeps.workspaceId,
      matchType: "exact",
      fromPattern: "/old-page",
      toTarget: "/new-page",
      statusCode: 301,
      actorId: PRINCIPAL_ID,
      ...overrides,
    } as never,
  });
  return record;
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
  "widgets.read",
  "widgets.delete",
  "widgets.place",
  "widgets.create",
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
  // AI marker (2026-09-21, trash T4c): the Trash row must carry the human's own principal AND a
  // non-null AI marker, so the admin screen can show "<user> + AI" rather than either collapsing
  // into "the human alone" (no pluginId at all) or losing who authorized the call (no principalId).
  assert.equal(rows[0]!.actorPrincipalId, PRINCIPAL_ID);
  assert.ok(rows[0]!.actorPluginId, "an assistant-initiated delete must record a non-null actorPluginId");
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
  const rows = await trashRows(routeDeps);
  assert.deepEqual(
    rows.map((row) => [row.entityType, row.entityId]),
    [["comment", "comment-1"]]
  );
  // AI marker (2026-09-21, trash T4c) — see the identical assertion on the post test above.
  assert.equal(rows[0]!.actorPrincipalId, PRINCIPAL_ID);
  assert.ok(rows[0]!.actorPluginId, "an assistant-initiated trash must record a non-null actorPluginId");
});

test("a media asset trashed through trash_item is tagged with the human principal AND a non-null AI marker", async () => {
  const { routeDeps, surfaceExchanges, registrations } = harness(EVERYTHING);
  await seedMedia(routeDeps);

  const { pending, exchangeId } = await raiseDialog(tool(registrations, TRASH_ITEM_TOOL_ID), {
    entityType: "media",
    entityId: "media-1",
  });
  answer(surfaceExchanges, { exchangeId, toolId: "media_trash_asset", decision: "confirm" });
  const result = (await pending) as { via: string; outcome: { trashed: boolean } };

  assert.equal(result.via, "media_trash_asset");
  assert.equal(result.outcome.trashed, true);
  const rows = await trashRows(routeDeps);
  assert.equal(rows[0]?.entityType, "media");
  assert.equal(rows[0]?.actorPrincipalId, PRINCIPAL_ID);
  assert.ok(rows[0]?.actorPluginId, "an assistant-initiated trash must record a non-null actorPluginId");
});

test("a redirect tombstoned through trash_item is tagged with the human principal AND a non-null AI marker", async () => {
  const { routeDeps, surfaceExchanges, registrations } = harness(EVERYTHING);
  const rule = await seedRedirect(routeDeps);

  const { pending, exchangeId } = await raiseDialog(tool(registrations, TRASH_ITEM_TOOL_ID), {
    entityType: "redirect",
    entityId: rule.id,
  });
  answer(surfaceExchanges, { exchangeId, toolId: "redirects_tombstone", decision: "confirm" });
  const result = (await pending) as { via: string; outcome: { tombstoned: boolean } };

  assert.equal(result.via, "redirects_tombstone");
  assert.equal(result.outcome.tombstoned, true);
  const rows = await trashRows(routeDeps);
  assert.equal(rows[0]?.entityType, "redirect");
  assert.equal(rows[0]?.actorPrincipalId, PRINCIPAL_ID);
  assert.ok(rows[0]?.actorPluginId, "an assistant-initiated tombstone must record a non-null actorPluginId");
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
  // registered adapter (`widgets_trash_instance`) in this file's default harness — `form` is a
  // genuinely un-adapted kind here (see `withRealTrashRegistry`'s comment).
  await assert.rejects(call(tool(registrations, TRASH_ITEM_TOOL_ID), { entityType: "form", entityId: "post-1" }), {
    message:
      "trash_item: 'form' is not a kind of thing the Trash can hold. Expected one of: post, comment, media, redirect, widget, term, taxonomy. Nothing was changed.",
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
  // Delegate and generic kinds remain available; only `post` is removed by this probe.
  await assert.rejects(call(trashItem, { entityType: "post", entityId: "post-1" }), {
    message:
      "trash_item: 'post' is not a kind of thing the Trash can hold. Expected one of: comment, media, redirect, widget, term, taxonomy. Nothing was changed.",
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

// --- generic-kind acceptance tests (trash T4c, over the real-SQLite form harness) ------------

test("a generic kind (form): cancel writes nothing, confirm on the same item trashes it and tags it with the AI marker", async () => {
  const h = sqliteFormHarness();
  const [trashItem] = deriveTrashItemRegistrations({ registrations: [], routeDeps: h.routeDeps, surfaces: h.surfaces });

  const cancelled = await raiseDialog(trashItem, { entityType: "form", entityId: "f1" });
  answer(h.surfaces.surfaceExchanges, { exchangeId: cancelled.exchangeId, toolId: TRASH_ITEM_TOOL_ID, decision: "cancel" });
  const cancelResult = (await cancelled.pending) as { outcome: { trashed: boolean; cancelled: boolean } };
  assert.deepEqual([cancelResult.outcome.trashed, cancelResult.outcome.cancelled], [false, true]);
  assert.equal(h.formIsLive("f1"), true, "a cancelled dialog must leave the form untouched");

  const confirmed = await raiseDialog(trashItem, { entityType: "form", entityId: "f1" });
  answer(h.surfaces.surfaceExchanges, { exchangeId: confirmed.exchangeId, toolId: TRASH_ITEM_TOOL_ID, decision: "confirm" });
  const confirmResult = (await confirmed.pending) as { via: string; outcome: { trashed: boolean } };
  assert.equal(confirmResult.via, "moveToTrash");
  assert.equal(confirmResult.outcome.trashed, true);
  assert.equal(h.formIsLive("f1"), false, "a confirmed dialog must move the form to the Trash");

  const rows = (await h.routeDeps.trash.list({ workspaceId: h.routeDeps.workspaceId, now: NOW, limit: 50 })).items;
  assert.equal(rows[0]?.actorPrincipalId, PRINCIPAL_ID);
  assert.ok(rows[0]?.actorPluginId, "the generic trash_item path must also record a non-null actorPluginId");
});

test("a generic kind (form): the row changes while the confirmation dialog is open, so confirming is refused with version-changed", async () => {
  const h = sqliteFormHarness();
  const [trashItem] = deriveTrashItemRegistrations({ registrations: [], routeDeps: h.routeDeps, surfaces: h.surfaces });

  const { pending, exchangeId } = await raiseDialog(trashItem, { entityType: "form", entityId: "f1" });
  // Someone else edits the form while the human is still looking at the dialog raised above.
  h.bumpFormVersion("f1");
  answer(h.surfaces.surfaceExchanges, { exchangeId, toolId: TRASH_ITEM_TOOL_ID, decision: "confirm" });

  await assert.rejects(pending, {
    message: "trash_item: form 'f1' changed while the confirmation was open. Reload and try again. Nothing was changed.",
  });
  assert.equal(h.formIsLive("f1"), true, "a version race must leave the form untouched, nothing trashed");
});

test("a generic kind (form): an id that does not exist is refused with an exact error, with no dialog raised", async () => {
  const h = sqliteFormHarness();
  const [trashItem] = deriveTrashItemRegistrations({ registrations: [], routeDeps: h.routeDeps, surfaces: h.surfaces });
  const emitted: unknown[] = [];

  await assert.rejects(
    call(trashItem, { entityType: "form", entityId: "no-such" }, async (surface) => void emitted.push(surface)),
    { message: "trash_item: form 'no-such' was not found. Nothing was changed." }
  );
  assert.deepEqual(emitted, []);
});

test("a generic kind (form): permission is checked before any dialog is raised", async () => {
  const h = sqliteFormHarness({ deny: true });
  const [trashItem] = deriveTrashItemRegistrations({ registrations: [], routeDeps: h.routeDeps, surfaces: h.surfaces });
  const emitted: unknown[] = [];

  await assert.rejects(
    call(trashItem, { entityType: "form", entityId: "f1" }, async (surface) => void emitted.push(surface)),
    { message: /principal '.*' is not authorized for 'admin\.forms\.manage'/ }
  );
  assert.deepEqual(emitted, [], "no dialog may be raised for a principal that cannot pass the permission gate");
});

test("trash_item's GENERIC path never reaches TrashPort.purgeSelected either", async () => {
  const h = sqliteFormHarness();
  class PurgeWasReachedError extends Error {}
  const guarded = {
    ...h.routeDeps,
    trash: {
      ...h.routeDeps.trash,
      async purgeSelected(): Promise<never> {
        throw new PurgeWasReachedError("trash_item reached purgeSelected");
      },
    },
  } as TrashItemToolDeps;
  const [trashItem] = deriveTrashItemRegistrations({ registrations: [], routeDeps: guarded, surfaces: h.surfaces });

  try {
    await call(trashItem, { entityType: "form", entityId: "f1" });
  } catch (error) {
    assert.ok(!(error instanceof PurgeWasReachedError), "trash_item's generic path must never reach purgeSelected");
  }
});

test("a widget with a corrupt payload can still be trashed, through widgets_trash_instance directly AND through trash_item, both tagged with the AI marker", async () => {
  const { routeDeps, surfaceExchanges, registrations } = harness(EVERYTHING);
  const entryRepo = (routeDeps as unknown as { entryRepo: TrashAwareInMemoryEntryRepo }).entryRepo;

  async function createCorruptWidget(title: string): Promise<string> {
    const created = (await call(tool(registrations, "widgets_create_instance"), {
      widgetType: "text",
      title,
      config: { body: "hi" },
    })) as { instance: { id: string } };
    const id = created.instance.id;
    const row = await entryRepo.findAnyById({ workspaceId: routeDeps.workspaceId, id });
    await entryRepo.saveAny({ ...row!, fieldsJson: "{not json" });
    return id;
  }

  // Route 1: the delegate tool called directly.
  const id1 = await createCorruptWidget("Corrupt widget one");
  const direct = await raiseDialog(tool(registrations, "widgets_trash_instance"), { widgetInstanceId: id1 });
  answer(surfaceExchanges, { exchangeId: direct.exchangeId, toolId: "widgets_trash_instance", decision: "confirm" });
  const directResult = (await direct.pending) as { trashed: boolean };
  assert.equal(directResult.trashed, true);
  const after1 = await entryRepo.findAnyById({ workspaceId: routeDeps.workspaceId, id: id1 });
  assert.equal(after1?.fieldsJson, "{not json", "the corrupt payload bytes must survive untouched");
  assert.ok(after1?.deletedAt);

  // Route 2: the same delegate reached through trash_item.
  const id2 = await createCorruptWidget("Corrupt widget two");
  const viaTrashItem = await raiseDialog(tool(registrations, TRASH_ITEM_TOOL_ID), { entityType: "widget", entityId: id2 });
  answer(surfaceExchanges, { exchangeId: viaTrashItem.exchangeId, toolId: "widgets_trash_instance", decision: "confirm" });
  const viaResult = (await viaTrashItem.pending) as { via: string; outcome: { trashed: boolean } };
  assert.equal(viaResult.via, "widgets_trash_instance");
  assert.equal(viaResult.outcome.trashed, true);
  const after2 = await entryRepo.findAnyById({ workspaceId: routeDeps.workspaceId, id: id2 });
  assert.equal(after2?.fieldsJson, "{not json", "the corrupt payload bytes must survive untouched");
  assert.ok(after2?.deletedAt);

  const rows = await trashRows(routeDeps);
  const byId = new Map(rows.map((row) => [row.entityId, row]));
  assert.ok(byId.get(id1)?.actorPluginId, "the direct delegate call must record a non-null actorPluginId");
  assert.ok(byId.get(id2)?.actorPluginId, "the trash_item-routed call must record a non-null actorPluginId");
});
