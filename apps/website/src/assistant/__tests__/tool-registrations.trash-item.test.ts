import { applyToolApprovalPolicy } from "../tool-approval-policy.js";
import { buildConfirmedAssistantToolRegistrations } from "./fixtures/confirmed-registrations.js";
import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";


import { type RegistryDepsWithoutLimiter, toAssistantRegistryDeps } from "#src/assistant/__tests__/fixtures/registry-deps";
import {
  createSurfaceExchangeStore,
  type SurfaceExchangeStore,
} from "@jini-ai/daemon/surface-exchanges";
import { commentsAgentToolCatalog } from "#src/features/comments/agent-tools";
import { postAgentToolCatalog } from "#src/features/post/agent-tools";
import { getRedirectsAgentToolCatalog } from "#src/features/redirects/agent-tools";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";
import { buildTrashRegistry } from "#src/features/trash/registry";
import type { TrashEntityType } from "@jini-ai/cms/trash";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createSqliteTrashDb } from "#src/features/trash/db-port.sqlite";
import { createTableTrashAdapter } from "#src/features/trash/table-adapter";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "#src/features/trash/repo.sqlite";
import { createTrashService, type TrashAdapter } from "@jini-ai/cms/trash";
import type { TrashAwareInMemoryEntryRepo } from "#src/features/entries/trash-aware-memory-repo";

import { deriveTrashItemRegistrations, TRASH_ITEM_DELEGATES, TRASH_ITEM_TOOL_ID, type TrashItemToolDeps } from "#src/features/trash/trash-item-tool";
import { trashThemeAgentToolCatalog } from "#src/features/theme/trash-theme-tool";
import { createRedirect } from "@jini-ai/cms/redirects";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

/**
 * @file `trash_item` — one generic "move this to the Trash" tool that is a fifth DOOR onto the four
 * per-domain delete tools, not a fifth PATH around them.
 *
 * Everything here runs through the REAL registry (`buildAssistantToolRegistrations` over the real
 * hermetic composition) rather than a hand-built registration, because the defect this codebase
 * keeps shipping is a correct primitive whose call site was never wired. A test that built the tool
 * by hand would pass just as well with `trash_item` missing from the product.
 */

contributions.contributors.clear({});
installFirstPartyToolContributors({ contributions });

const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-20T12:00:00.000Z";

type Grants = ReadonlySet<string>;

/** Real hermetic composition, with `authorize` replaced by an explicit grant set. */
function harness(grants: Grants) {
  const base = createRouteDeps() as unknown as RegistryDepsWithoutLimiter;
  const authorizeCalls: string[] = [];
  const routeDeps = {
    ...base,
    authorize: async (params: { permission: string }) => {
      authorizeCalls.push(params.permission);
      return grants.has(params.permission)
        ? { allowed: true, reason: "matched" }
        : { allowed: false, reason: "insufficient_permission" };
    },
  } as RegistryDepsWithoutLimiter;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const registrations = buildConfirmedAssistantToolRegistrations({ routeDeps: toAssistantRegistryDeps({ routeDeps }), surfaces: { surfaceExchanges }, options: { contributions } });
  return { routeDeps, surfaceExchanges, registrations, authorizeCalls };
}

// This file's hermetic composition registers only the form_submission/term/taxonomy GENERIC kinds
// (`form_submission` since ea41a5c33, F3469/F1868). Built once from the real schema module, the full
// registry lets tests reach the remaining generic kinds too.
const REAL_REGISTRY = buildTrashRegistry();

function withRealTrashRegistry(routeDeps: RegistryDepsWithoutLimiter): RegistryDepsWithoutLimiter {
  return {
    ...routeDeps,
    registry: REAL_REGISTRY,
    // Production ties the two together the same way (`deps.ts`: every registry entry gets an
    // adapter, so `isTrashableEntityType` is `trashAdapters.has`, and `trashAdapters` is built FROM
    // the registry) — `||` keeps this hermetic root's existing delegate-backed kinds (post, comment,
    // media, redirect, widget, all wired via hand-built in-memory adapters) true too.
    isTrashableEntityType: (entityType: TrashEntityType) => routeDeps.isTrashableEntityType(entityType) || REAL_REGISTRY.has(entityType),
  } as RegistryDepsWithoutLimiter;
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

  const registry = buildTrashRegistry();
  const trashDb = createSqliteTrashDb({ db });
  const adapters = new Map<string, TrashAdapter>(
    [...registry.values()].map((entry) => [entry.entityType, createTableTrashAdapter({ entry, db: trashDb })])
  );
  let seq = 0;
  const trash = createTrashService({
    repo: new SqliteTrashRepo(db.$client),
    adapters,
    idGen: { newId: () => `trash-${(seq += 1)}` },
    transaction: ({ work }) => createContentDbTransactionRunner(db.$client)(work),
    entityPolicy: ({ entityType }) => adapters.has(entityType),
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
    clock: { nowMs() { return Date.parse(this.nowIso()); }, nowIso: () => NOW },
  } as unknown as TrashItemToolDeps;

  return {
    routeDeps,
    surfaces: { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
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
  return registration.handler(ctx, emitSurface ? { emitSurface } : {});
}

async function seedPost(routeDeps: RegistryDepsWithoutLimiter, overrides: Record<string, unknown> = {}) {
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

async function seedMedia(routeDeps: RegistryDepsWithoutLimiter, overrides: Record<string, unknown> = {}) {
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

async function seedRedirect(routeDeps: RegistryDepsWithoutLimiter, overrides: Record<string, unknown> = {}) {
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

async function seedComment(routeDeps: RegistryDepsWithoutLimiter, overrides: Record<string, unknown> = {}) {
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
  await routeDeps.commentRepo.create({ record: row as never }, {});
  return row;
}

/** Starts a call and returns its pending result. */
async function beginCall(registration: ToolRegistration, input: unknown) {
  return {pending: call(registration, input)};
}

async function trashRows(routeDeps: RegistryDepsWithoutLimiter) {
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

test("a post trashed through trash_item uses content_post_delete's permission checks, and lands in the Trash index", async () => {
  const { routeDeps, registrations } = harness(EVERYTHING);
  await seedPost(routeDeps);

  const { pending } = await beginCall(tool(registrations, TRASH_ITEM_TOOL_ID), {
    entityType: "post",
    entityId: "post-1",
  });
  // No delegate write happens before policy approval (certified in tool-approval-policy.test.ts).

  // The shared fixture answers trash_item's policy card; its original content_post_delete delegate then runs.
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
  const { routeDeps, registrations } = harness(EVERYTHING);
  await seedComment(routeDeps);

  const { pending } = await beginCall(tool(registrations, TRASH_ITEM_TOOL_ID), {
    entityType: "comment",
    entityId: "comment-1",
  });
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
  const { routeDeps, registrations } = harness(EVERYTHING);
  await seedMedia(routeDeps);

  const { pending } = await beginCall(tool(registrations, TRASH_ITEM_TOOL_ID), {
    entityType: "media",
    entityId: "media-1",
  });
  const result = (await pending) as { via: string; outcome: { trashed: boolean } };

  assert.equal(result.via, "media_trash_asset");
  assert.equal(result.outcome.trashed, true);
  const rows = await trashRows(routeDeps);
  assert.equal(rows[0]?.entityType, "media");
  assert.equal(rows[0]?.actorPrincipalId, PRINCIPAL_ID);
  assert.ok(rows[0]?.actorPluginId, "an assistant-initiated trash must record a non-null actorPluginId");
});

test("a redirect tombstoned through trash_item is tagged with the human principal AND a non-null AI marker", async () => {
  const { routeDeps, registrations } = harness(EVERYTHING);
  const rule = await seedRedirect(routeDeps);

  const { pending } = await beginCall(tool(registrations, TRASH_ITEM_TOOL_ID), {
    entityType: "redirect",
    entityId: rule.id,
  });
  const result = (await pending) as { via: string; outcome: { tombstoned: boolean } };

  assert.equal(result.via, "redirects_tombstone");
  assert.equal(result.outcome.tombstoned, true);
  const rows = await trashRows(routeDeps);
  assert.equal(rows[0]?.entityType, "redirect");
  assert.equal(rows[0]?.actorPrincipalId, PRINCIPAL_ID);
  assert.ok(rows[0]?.actorPluginId, "an assistant-initiated tombstone must record a non-null actorPluginId");
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
      "trash_item: 'form' is not a kind of thing the Trash can hold. Expected one of: post, comment, media, redirect, widget, theme, form_submission, term, taxonomy. Nothing was changed.",
  });
  assert.deepEqual(authorizeCalls, []);
  assert.deepEqual(await trashRows(routeDeps), []);
});

test("the entityType check reads the live adapter map at CALL time, not a list captured at registration", async () => {
  const { routeDeps, registrations } = harness(EVERYTHING);
  await seedPost(routeDeps);
  let postAdapterRegistered = true;
  const probed = { ...routeDeps, isTrashableEntityType: (entityType: string) => entityType !== "post" || postAdapterRegistered };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const trashItem = tool(buildConfirmedAssistantToolRegistrations({ routeDeps: toAssistantRegistryDeps({ routeDeps: probed as RegistryDepsWithoutLimiter }), surfaces: { surfaceExchanges }, options: { contributions } }), TRASH_ITEM_TOOL_ID);
  void registrations;

  postAdapterRegistered = false;
  // Delegate, generic and `user` kinds remain available; only `post` is removed by this probe.
  await assert.rejects(call(trashItem, { entityType: "post", entityId: "post-1" }), {
    message:
      "trash_item: 'post' is not a kind of thing the Trash can hold. Expected one of: comment, media, redirect, widget, theme, form_submission, term, taxonomy, user. Nothing was changed.",
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

  assert.equal(emitted.length, 0, "trash is reversible, so no dialog opens; the delegate ownership check alone refuses another kind");
});

test("ESCALATION: the same principal naming the post honestly is refused on content.write", async () => {
  const { routeDeps, registrations, authorizeCalls } = harness(new Set(["comments.delete"]));
  await seedPost(routeDeps);
  const emitted: unknown[] = [];

  await assert.rejects(
    call(tool(registrations, TRASH_ITEM_TOOL_ID), { entityType: "post", entityId: "post-1" }, async (surface) => void emitted.push(surface)),
    { message: "principal 'principal-under-test' is not authorized for 'content.write' (insufficient_permission)" }
  );
  assert.deepEqual(authorizeCalls, ["content.write"]);
  assert.equal(emitted.length, 0, "trash is reversible, so no dialog opens; the domain permission check still refuses");
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
  for (const entry of trashThemeAgentToolCatalog) declared.set(entry.name, entry.authorization.permission);

  for (const delegate of TRASH_ITEM_DELEGATES.values()) {
    assert.equal(delegate.permission, declared.get(delegate.toolId), `${delegate.entityType} -> ${delegate.toolId}`);
  }
  assert.deepEqual([...TRASH_ITEM_DELEGATES.keys()], ["post", "comment", "media", "redirect", "widget", "theme"]);
});

test("SINK AUDIT: in the production catalog, trash_item accepts every delegate AND every generic TRASHABLE kind", () => {
  const { routeDeps, registrations } = harness(EVERYTHING);
  // This file's hermetic `registrations`/`routeDeps.registry` is empty (see `withRealTrashRegistry`'s
  // comment), so the generic side is rebuilt directly with a real, non-empty registry rather than
  // read off `harness()`'s own already-built (registry-empty) `trash_item`.
  const [trashItem] = deriveTrashItemRegistrations({
    registrations,
    routeDeps: withRealTrashRegistry(routeDeps),
    surfaces: { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
  });
  const schema = trashItem.descriptor.inputSchema as {
    properties: { entityType: { enum: string[] } };
  };
  // Delegates first (insertion order of TRASH_ITEM_DELEGATES), then generic registry kinds with no
  // delegate (insertion order of TRASHABLE) — `widget` has a delegate, so it never repeats below.
  assert.deepEqual(schema.properties.entityType.enum, ["post", "comment", "media", "redirect", "widget", "theme", ...realGenericKinds()]);
});

test("a kind whose delete tool is not registered is not accepted, with an exact error, and nothing is written", async () => {
  const { routeDeps, registrations } = harness(EVERYTHING);
  await seedComment(routeDeps);
  const withoutComments = registrations.filter((registration) => registration.descriptor.id !== "comments_trash_comment");
  const [trashItem] = deriveTrashItemRegistrations({
    registrations: withoutComments,
    routeDeps: withRealTrashRegistry(routeDeps),
    surfaces: { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
  });
  assert.ok(trashItem);

  const accepted = ["post", "media", "redirect", "widget", "theme", ...realGenericKinds()].join(", ");
  await assert.rejects(call(trashItem, { entityType: "comment", entityId: "comment-1" }), {
    message: `trash_item: 'comment' is not a kind of thing the Trash can hold. Expected one of: ${accepted}. Nothing was changed.`,
  });
  assert.equal((await routeDeps.commentRepo.findById({ workspaceId: routeDeps.workspaceId, id: "comment-1" }))?.status, "approved");
});

test("with no delegate tool registered and an empty registry, trash_item is not registered", () => {
  const { routeDeps } = harness(EVERYTHING);
  const emptyRegistry = { ...routeDeps, registry: new Map() };
  assert.deepEqual(deriveTrashItemRegistrations({ registrations: [], routeDeps: emptyRegistry, surfaces: { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) } }), []);
});

test("with no delegate tool registered but a non-empty registry, trash_item is still registered for the GENERIC kinds", () => {
  const { routeDeps } = harness(EVERYTHING);
  const [trashItem] = deriveTrashItemRegistrations({
    registrations: [],
    routeDeps: withRealTrashRegistry(routeDeps),
    surfaces: { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
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
  const before = await seedPost(routeDeps);
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  let purgeCalls = 0;
  class PurgeWasReachedError extends Error {}
  const guarded = {
    ...routeDeps,
    trash: {
      ...routeDeps.trash,
      async purgeSelected(): Promise<never> {
        purgeCalls += 1;
        throw new PurgeWasReachedError("trash_item reached purgeSelected");
      },
    },
  } as RegistryDepsWithoutLimiter;
  const trashItem = tool(buildConfirmedAssistantToolRegistrations({ routeDeps: toAssistantRegistryDeps({ routeDeps: guarded }), surfaces: { surfaceExchanges }, options: { contributions } }), TRASH_ITEM_TOOL_ID);

  for (const input of [{}, { entityType: "post", entityId: "missing-post" }, { entityType: "comment", entityId: "c" }, { ids: ["row-1"] }]) {
    try {
      await call(trashItem, input);
    } catch (error) {
      assert.ok(!(error instanceof PurgeWasReachedError), `reached purgeSelected with ${JSON.stringify(input)}`);
    }
  }
  const confirmed = await beginCall(trashItem, { entityType: "post", entityId: "post-1" });
  const result = await confirmed.pending as { outcome: { deleted: boolean } };
  assert.equal(result.outcome.deleted, true);
  assert.equal(purgeCalls, 0, "a successful reversible delegate operation must never purge");
  assert.equal((await trashRows(guarded))[0]?.entityId, "post-1");
  assert.equal(await guarded.trash.restore({ workspaceId: guarded.workspaceId, entityType: "post", entityId: "post-1", at: NOW }), "restored");
  assert.equal((await guarded.postRepo.findById({ workspaceId: guarded.workspaceId, id: "post-1" }))?.title, before.title);
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
  let purgeCalls = 0;
  class PurgeWasReachedError extends Error {}
  const guarded = {
    ...h.routeDeps,
    trash: {
      ...h.routeDeps.trash,
      async purgeSelected(): Promise<never> {
        purgeCalls += 1;
        throw new PurgeWasReachedError("trash_item reached purgeSelected");
      },
    },
  } as TrashItemToolDeps;
  const [trashItem] = deriveTrashItemRegistrations({ registrations: [], routeDeps: guarded, surfaces: h.surfaces });

  try {
    await call(trashItem, { entityType: "form", entityId: "missing-form" });
  } catch (error) {
    assert.ok(!(error instanceof PurgeWasReachedError), "trash_item's generic path must never reach purgeSelected");
  }
  const confirmed = await beginCall(trashItem, { entityType: "form", entityId: "f1" });
  const result = await confirmed.pending as { outcome: { trashed: boolean } };
  assert.equal(result.outcome.trashed, true);
  assert.equal(purgeCalls, 0, "a successful reversible generic operation must never purge");
  assert.equal(h.formIsLive("f1"), false);
  const rows = await guarded.trash.list({ workspaceId: guarded.workspaceId, now: NOW, limit: 50 });
  assert.equal(rows.items[0]?.entityId, "f1");
  assert.equal(await guarded.trash.restore({ workspaceId: guarded.workspaceId, entityType: "form", entityId: "f1", at: NOW }), "restored");
  assert.equal(h.formIsLive("f1"), true, "the form must remain recoverable");
});

test("a widget with a corrupt payload can still be trashed, through widgets_trash_instance directly AND through trash_item, both tagged with the AI marker", async () => {
  const { routeDeps, registrations } = harness(EVERYTHING);
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
  const direct = await beginCall(tool(registrations, "widgets_trash_instance"), { widgetInstanceId: id1 });
  const directResult = (await direct.pending) as { trashed: boolean };
  assert.equal(directResult.trashed, true);
  const after1 = await entryRepo.findAnyById({ workspaceId: routeDeps.workspaceId, id: id1 });
  assert.equal(after1?.fieldsJson, "{not json", "the corrupt payload bytes must survive untouched");
  assert.ok(after1?.deletedAt);

  // Route 2: the same delegate reached through trash_item.
  const id2 = await createCorruptWidget("Corrupt widget two");
  const viaTrashItem = await beginCall(tool(registrations, TRASH_ITEM_TOOL_ID), { entityType: "widget", entityId: id2 });
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

// Owner rule 2026-10-08: trash is restorable, so the host policy runs it without a dialog.
test("n06: generic trash records the AI actor, and the host policy runs it without approval", async () => {
  const h = sqliteFormHarness();
  const [registration] = deriveTrashItemRegistrations({registrations: [], routeDeps: h.routeDeps, surfaces: h.surfaces});
  const hostRegistration = applyToolApprovalPolicy({ registration: registration!, surfaces: h.surfaces });
  const result = await call(hostRegistration, {entityType: "form", entityId: "f1"}) as {outcome: {trashed: boolean}};
  assert.equal(result.outcome.trashed, true);
  assert.equal(h.formIsLive("f1"), false);
  assert.equal(h.surfaces.surfaceExchanges.size(), 0);
  const rows = (await h.routeDeps.trash.list({workspaceId: h.routeDeps.workspaceId, now: NOW, limit: 50})).items;
  assert.equal(rows[0]?.actorPrincipalId, PRINCIPAL_ID);
  assert.equal(rows[0]?.actorPluginId, "assistant");
});
