import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import type { UserRepoPort, UserRecord } from "@jini-ai/cms/identity";

import * as schema from "#src/platform/db/schema.sqlite";

import { TRASH_PERMISSION_BY_ENTITY_TYPE } from "../permissions.js";
import { buildTrashRegistry } from "../registry.js";
import { buildTrashRegistrations } from "../tool-registrations.js";
import type { PurgeReport, RestoreOutcome, TrashActor, TrashItem, TrashPort } from "../ports.js";

/** The real `form` entry (registry-derived permission), same source `deps.ts` composes from —
 *  needed because "form" -> "admin.forms.manage" is one of this file's pinned pairings, and that
 *  pairing now comes from `TRASHABLE`, not the bespoke `TRASH_PERMISSION_BY_ENTITY_TYPE` map. */
const REGISTRY = buildTrashRegistry({ schema });

/**
 * @file What the two trash tools actually do, and — the part that matters — **what they refuse to
 * show.**
 *
 * The Trash is the one screen in the product that lists four unrelated domains side by side, so a
 * single "trash.read" gate would be a way around four separate permissions at once: a principal
 * trusted only to moderate comments would read the titles of every deleted post. Each row is
 * therefore gated by the permission that would be needed to RESTORE that row's kind, which is the
 * permission that kind's own delete tool already required.
 */

const WS = "ws-1";
const NOW = "2026-09-20T12:00:00.000Z";

function item(overrides: Partial<TrashItem> & Pick<TrashItem, "id" | "entityType" | "entityId">): TrashItem {
  return {
    workspaceId: WS,
    trashedAt: NOW,
    purgeAfter: "2026-11-19T12:00:00.000Z",
    actorPrincipalId: "principal-1",
    actorPluginId: null,
    displayTitle: `title of ${overrides.entityId}`,
    displaySubtitle: null,
    entityVersion: 2,
    ...overrides,
  };
}

interface Harness {
  byId: Map<string, ToolRegistration>;
  restoreCalls: { entityType: string; entityId: string }[];
  /** The `actor` each `trash.restore` call received, positionally aligned with `restoreCalls` —
   *  kept separate so the pre-existing `restoreCalls` shape (asserted with exact `deepEqual`
   *  elsewhere in this file) never has to grow a field just to observe this. */
  restoreActors: (TrashActor | undefined)[];
  authorizeCalls: { permission: string; entityType?: string }[];
}

/** Minimal `UserRepoPort` double — only `list` is ever called from `tool-registrations.ts`'s
 *  username resolution; the rest exist to satisfy the port's full shape. */
function fakeUserRepo(users: readonly { principalId: string; username: string }[]): UserRepoPort {
  const toRecord = (u: { principalId: string; username: string }): UserRecord => ({
    principalId: u.principalId,
    workspaceId: WS,
    username: u.username,
    passwordHash: "unused-in-tests",
  });
  return {
    async findByPrincipalId(required) {
      const found = users.find((u) => u.principalId === required.principalId);
      return found ? toRecord(found) : null;
    },
    async findByUsername(required) {
      const found = users.find((u) => u.username === required.username);
      return found ? toRecord(found) : null;
    },
    async list() {
      return users.map(toRecord);
    },
    async save() {},
  };
}

function harness(
  optional: {
    items?: TrashItem[];
    granted?: readonly string[];
    outcome?: RestoreOutcome;
    users?: readonly { principalId: string; username: string }[];
  } = {}
): Harness {
  const items = optional.items ?? [item({ id: "r1", entityType: "post", entityId: "post-1" })];
  const granted = new Set(
    optional.granted ?? [
      "content.read",
      "content.write",
      "comments.moderate",
      "media.delete",
      "admin.redirects.manage",
      "admin.forms.manage",
    ]
  );
  const restoreCalls: { entityType: string; entityId: string }[] = [];
  const restoreActors: (TrashActor | undefined)[] = [];
  const authorizeCalls: { permission: string; entityType?: string }[] = [];

  const trash: TrashPort = {
    async trash() {
      return { ok: true, version: 1 };
    },
    async restore(required) {
      restoreCalls.push({ entityType: required.entityType, entityId: required.entityId });
      restoreActors.push(required.actor);
      return optional.outcome ?? "restored";
    },
    async list() {
      return { items, nextCursor: "cursor-2" };
    },
    async purgeSelected(): Promise<PurgeReport> {
      throw new Error("purgeSelected must never be reached from a tool handler");
    },
  };

  const registrations = buildTrashRegistrations({
    workspaceId: WS,
    clock: { nowIso: () => NOW },
    trash,
    userRepo: fakeUserRepo(optional.users ?? [{ principalId: "principal-1", username: "alice" }]),
    authorize: async (params) => {
      authorizeCalls.push({ permission: params.permission, entityType: params.entityType });
      return granted.has(params.permission)
        ? { allowed: true, reason: "matched" }
        : { allowed: false, reason: `missing ${params.permission}` };
    },
    // "form" -> "admin.forms.manage" is now registry-derived (`TRASHABLE`), not in the bespoke
    // `TRASH_PERMISSION_BY_ENTITY_TYPE` map — see `REGISTRY`'s own doc above.
    registry: REGISTRY,
  });

  return {
    byId: new Map(registrations.map((r) => [r.descriptor.id, r])),
    restoreCalls,
    restoreActors,
    authorizeCalls,
  };
}

function ctx(input: unknown): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  } as ToolExecutionContext;
}

const list = (h: Harness, input: unknown = {}) => h.byId.get("trash_list_items")!.handler(ctx(input));
const restore = (h: Harness, input: unknown) => h.byId.get("trash_restore_item")!.handler(ctx(input));

test("a listed row carries the snapshot, the resolved actor username and the days left — never a read of the entity", async () => {
  const h = harness();
  const result = (await list(h)) as { items: Record<string, unknown>[]; nextCursor: string | null };

  assert.deepEqual(result.items, [
    {
      entityType: "post",
      entityId: "post-1",
      title: "title of post-1",
      subtitle: null,
      deletedAt: NOW,
      deletedBy: "alice",
      permanentlyRemovedAfter: "2026-11-19T12:00:00.000Z",
      daysRemaining: 60,
    },
  ]);
  assert.equal(result.nextCursor, "cursor-2");
});

test("a row deleted by a plugin names the plugin's human grantor, not the raw principal id", async () => {
  const h = harness({
    items: [item({ id: "r1", entityType: "media", entityId: "m-1", actorPluginId: "some-plugin" })],
  });
  const result = (await list(h)) as { items: { deletedBy: string }[] };
  assert.equal(result.items[0]!.deletedBy, "alice + AI");
});

test("an actor with no matching user account falls back to a readable label, not the raw UUID", async () => {
  const h = harness({
    items: [item({ id: "r1", entityType: "post", entityId: "post-1", actorPrincipalId: "principal-gone" })],
    users: [],
  });
  const result = (await list(h)) as { items: { deletedBy: string }[] };
  assert.equal(result.items[0]!.deletedBy, "deleted user");
});

test("a row trashed by the system actor names it 'system', not the raw principal id", async () => {
  const h = harness({
    items: [item({ id: "r1", entityType: "post", entityId: "post-1", actorPrincipalId: "system" })],
    users: [],
  });
  const result = (await list(h)) as { items: { deletedBy: string }[] };
  assert.equal(result.items[0]!.deletedBy, "system");
});

test("rows the caller could not restore are omitted from the list, kind by kind", async () => {
  const h = harness({
    items: [
      item({ id: "r1", entityType: "post", entityId: "post-1" }),
      item({ id: "r2", entityType: "comment", entityId: "c-1" }),
      item({ id: "r3", entityType: "media", entityId: "m-1" }),
    ],
    // A comment moderator, and nothing more.
    granted: ["content.read", "comments.moderate"],
  });

  const result = (await list(h)) as { items: { entityId: string }[] };
  assert.deepEqual(
    result.items.map((row) => row.entityId),
    ["c-1"],
    "a principal who can only moderate comments must not read the titles of deleted posts and media"
  );
});

test("an unknown kind is never listed — a phase-2 domain has to opt in, not opt out", async () => {
  const h = harness({ items: [item({ id: "r1", entityType: "gizmo", entityId: "g-1" })] });
  const result = (await list(h)) as { items: unknown[] };
  assert.deepEqual(result.items, []);
});

test("the permission checked per kind is the one that kind's own delete tool required", async () => {
  for (const [entityType, permission] of [
    ["post", "content.write"],
    ["comment", "comments.moderate"],
    ["media", "media.delete"],
    ["redirect", "admin.redirects.manage"],
    ["form", "admin.forms.manage"],
  ] as const) {
    const h = harness();
    await restore(h, { entityType, entityId: "e-1" });
    assert.ok(
      h.authorizeCalls.some((call) => call.permission === permission && call.entityType === entityType),
      `restoring a ${entityType} must check '${permission}', the gate its delete tool checks`
    );
    assert.deepEqual(h.restoreCalls, [{ entityType, entityId: "e-1" }]);
  }
});

test("a denied restore throws and never reaches the port", async () => {
  const h = harness({ granted: ["content.read"] });
  await assert.rejects(() => restore(h, { entityType: "post", entityId: "post-1" }), /content\.write/);
  assert.deepEqual(h.restoreCalls, [], "the port must not be called at all when authorization denies");
});

test("restoring a kind the Trash does not own is refused by name, not silently attempted", async () => {
  const h = harness();
  await assert.rejects(() => restore(h, { entityType: "gizmo", entityId: "g-1" }), /not a kind the Trash can restore/);
  assert.deepEqual(h.restoreCalls, []);
});

test("a non-restored outcome is reported with the reason and a note, not thrown", async () => {
  const h = harness({ outcome: "adapter-unavailable" });
  const result = (await restore(h, { entityType: "post", entityId: "post-1" })) as {
    restored: boolean;
    reason: string;
    note: string;
  };
  assert.equal(result.restored, false);
  assert.equal(result.reason, "adapter-unavailable");
  assert.match(result.note, /no longer installed/);
});

test("daysRemaining never goes negative, whatever the clock says", async () => {
  const h = harness({ items: [item({ id: "r1", entityType: "post", entityId: "post-1", purgeAfter: "2020-01-01T00:00:00.000Z" })] });
  const result = (await list(h)) as { items: { daysRemaining: number }[] };
  assert.equal(result.items[0]!.daysRemaining, 0);
});

test("the built tools accept every kind the Trash holds, not just the phase-1 four — REGISTRY carries widget/menu/form", async () => {
  const h = harness({
    items: [item({ id: "r1", entityType: "widget", entityId: "w-1" })],
    granted: ["content.read", "widgets.delete"],
  });

  const restoreDescriptor = h.byId.get("trash_restore_item")!.descriptor;
  const restoreEnum = (restoreDescriptor.inputSchema as { properties: { entityType: { enum: string[] } } }).properties
    .entityType.enum;
  assert.ok(restoreEnum.includes("widget"), `trash_restore_item's entityType enum must include 'widget', got ${restoreEnum.join(", ")}`);
  assert.ok(restoreEnum.includes("menu"), `trash_restore_item's entityType enum must include 'menu', got ${restoreEnum.join(", ")}`);
  assert.ok(restoreEnum.includes("form"), `trash_restore_item's entityType enum must include 'form', got ${restoreEnum.join(", ")}`);

  const listDescriptor = h.byId.get("trash_list_items")!.descriptor;
  const listEnum = (
    listDescriptor.inputSchema as { properties: { entityTypes: { items: { enum: string[] } } } }
  ).properties.entityTypes.items.enum;
  assert.ok(listEnum.includes("widget"), `trash_list_items' entityTypes enum must include 'widget', got ${listEnum.join(", ")}`);
  assert.ok(listEnum.includes("menu"), `trash_list_items' entityTypes enum must include 'menu', got ${listEnum.join(", ")}`);
  assert.ok(listEnum.includes("form"), `trash_list_items' entityTypes enum must include 'form', got ${listEnum.join(", ")}`);

  const result = await restore(h, { entityType: "widget", entityId: "w-1" });
  assert.deepEqual(result, { restored: true, entityType: "widget", entityId: "w-1" });
});

test("both enums are exactly the bespoke permission-map kinds plus every registry kind — no more, no fewer", () => {
  const h = harness();
  const expected = [...new Set([...TRASH_PERMISSION_BY_ENTITY_TYPE.keys(), ...REGISTRY.keys()])].sort();
  const restoreEnum = (h.byId.get("trash_restore_item")!.descriptor.inputSchema as { properties: { entityType: { enum: string[] } } })
    .properties.entityType.enum;
  const listEnum = (h.byId.get("trash_list_items")!.descriptor.inputSchema as { properties: { entityTypes: { items: { enum: string[] } } } })
    .properties.entityTypes.items.enum;
  assert.deepEqual([...restoreEnum].sort(), expected);
  assert.deepEqual([...listEnum].sort(), expected);
});

test("restoring each registry kind checks that kind's own registry permission, and is refused without it", async () => {
  for (const [entityType, entry] of REGISTRY) {
    const allowed = harness({ granted: ["content.read", entry.permission] });
    await restore(allowed, { entityType, entityId: "e-1" });
    assert.ok(
      allowed.authorizeCalls.some((call) => call.permission === entry.permission && call.entityType === entityType),
      `restoring a ${entityType} must check '${entry.permission}'`
    );
    assert.deepEqual(allowed.restoreCalls, [{ entityType, entityId: "e-1" }]);

    const denied = harness({ granted: ["content.read"] });
    await assert.rejects(() => restore(denied, { entityType, entityId: "e-1" }));
    assert.deepEqual(denied.restoreCalls, [], `a ${entityType} restore without '${entry.permission}' must never reach the port`);
  }
});

test("a restore records the calling principal as the actor, so the Trash list can attribute it", async () => {
  const h = harness();
  await restore(h, { entityType: "post", entityId: "post-1" });
  assert.deepEqual(h.restoreActors, [{ principalId: "principal-1", pluginId: "assistant" }]);
});

test("restoring a kind the Trash does not own throws a ToolInputError, not a plain Error — it must reach the model, not get redacted", async () => {
  const h = harness();
  await assert.rejects(
    () => restore(h, { entityType: "gizmo", entityId: "g-1" }),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected a ToolInputError, got ${(err as Error)?.constructor?.name}`);
      assert.match((err as Error).message, /^trash_restore_item: 'gizmo' is not a kind the Trash can restore\./);
      return true;
    }
  );
});

test("a malformed entityTypes filter throws a ToolInputError, not a plain Error", async () => {
  const h = harness();
  await assert.rejects(
    () => list(h, { entityTypes: "post" }),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected a ToolInputError, got ${(err as Error)?.constructor?.name}`);
      return true;
    }
  );
});
