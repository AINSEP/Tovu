import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import * as schema from "#src/platform/db/schema";

import { buildTrashRegistry } from "../registry.js";
import { buildTrashRegistrations } from "../tool-registrations.js";
import type { PurgeReport, RestoreOutcome, TrashItem, TrashPort } from "../ports.js";

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
  authorizeCalls: { permission: string; entityType?: string }[];
}

function harness(optional: { items?: TrashItem[]; granted?: readonly string[]; outcome?: RestoreOutcome } = {}): Harness {
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
  const authorizeCalls: { permission: string; entityType?: string }[] = [];

  const trash: TrashPort = {
    async trash() {
      return { ok: true, version: 1 };
    },
    async restore(required) {
      restoreCalls.push({ entityType: required.entityType, entityId: required.entityId });
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

  return { byId: new Map(registrations.map((r) => [r.descriptor.id, r])), restoreCalls, authorizeCalls };
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

test("a listed row carries the snapshot, the actor and the days left — never a read of the entity", async () => {
  const h = harness();
  const result = (await list(h)) as { items: Record<string, unknown>[]; nextCursor: string | null };

  assert.deepEqual(result.items, [
    {
      entityType: "post",
      entityId: "post-1",
      title: "title of post-1",
      subtitle: null,
      deletedAt: NOW,
      deletedBy: "principal-1",
      permanentlyRemovedAfter: "2026-11-19T12:00:00.000Z",
      daysRemaining: 60,
    },
  ]);
  assert.equal(result.nextCursor, "cursor-2");
});

test("a row deleted by a plugin names the plugin, so a human can tell an agent's delete from their own", async () => {
  const h = harness({
    items: [item({ id: "r1", entityType: "media", entityId: "m-1", actorPluginId: "some-plugin" })],
  });
  const result = (await list(h)) as { items: { deletedBy: string }[] };
  assert.equal(result.items[0]!.deletedBy, "principal-1 (via some-plugin)");
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
  const h = harness({ items: [item({ id: "r1", entityType: "widget", entityId: "w-1" })] });
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
  await assert.rejects(() => restore(h, { entityType: "widget", entityId: "w-1" }), /not a kind the Trash can restore/);
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
