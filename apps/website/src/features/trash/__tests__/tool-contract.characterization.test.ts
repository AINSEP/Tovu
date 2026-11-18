/**
 * @file Characterization of the Trash agent-tool contract (`trash_list_items`, `trash_restore_item`),
 * built THROUGH THE HOST CONTRIBUTOR (`contributeTrashTools().build(deps)`), so it pins what the
 * assistant's composition root receives regardless of which package the catalog and handlers live
 * in. It must stay green, unedited, across the move of the catalog and handlers into
 * `@jini-ai/cms/trash`.
 *
 * Pinned: registration ids and their order (saved in permissions and audit rows), every descriptor
 * byte-for-byte against a committed golden (including `metadata`: the host's search vocabulary and
 * approval policy), the derived-risk map, the per-tool permission refusal, one success view per
 * tool, what a principal may not see (absent from the list, refused on restore with the same
 * message), the days-remaining clock, the unknown-kind refusal's kind list (order and duplicates)
 * and the catalog enum's kind list (de-duplicated, in order). Neither tool opens a confirmation
 * dialog, so there is no approval path to pin.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import type { TrashEntityType, TrashItem, TrashPort } from "@jini-ai/cms/trash";
import type { UserRepoPort } from "@jini-ai/user-management";

import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { buildTrashRegistry, type TrashRegistry } from "../registry.js";
import { contributeTrashTools, type TrashToolDeps } from "../tool-registrations.js";

const WORKSPACE_ID = "ws-trash-contract";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-20T12:00:00.000Z";

const TOOL_IDS = ["trash_list_items", "trash_restore_item"] as const;

const DERIVED_RISK: ReadonlyArray<readonly [string, string]> = [
  ["trash_list_items", "none"],
  ["trash_restore_item", "mutates-durable-state"],
];

/** The bespoke kinds, in the order `TRASH_PERMISSION_BY_ENTITY_TYPE` declares them. */
const BESPOKE_KINDS = ["post", "comment", "media", "redirect", "plugin", "theme", "user"];

const GOLDEN = JSON.parse(readFileSync(new URL("./tool-contract.characterization.golden.json", import.meta.url), "utf8")) as Record<string, unknown>;

function trashItem(overrides: Partial<TrashItem> & Pick<TrashItem, "id" | "entityType" | "entityId">): TrashItem {
  return {
    workspaceId: WORKSPACE_ID,
    trashedAt: NOW,
    purgeAfter: "2026-09-27T12:00:00.000Z",
    actorPrincipalId: "principal-1",
    actorPluginId: null,
    displayTitle: `title of ${overrides.entityId}`,
    displaySubtitle: null,
    entityVersion: 2,
    priorMarker: null,
    ...overrides,
  };
}

interface Fixture {
  deps: TrashToolDeps;
  restoreCalls: Array<{ entityType: string; entityId: string }>;
}

function makeFixture(options: { granted?: readonly string[]; items?: TrashItem[]; registry?: TrashRegistry; clockIso?: string } = {}): Fixture {
  const granted = new Set(options.granted ?? ["content.read", "content.write", "comments.moderate", "media.delete", "admin.redirects.manage", "admin.forms.manage"]);
  const items = options.items ?? [trashItem({ id: "row-1", entityType: "post", entityId: "post-1" })];
  const restoreCalls: Fixture["restoreCalls"] = [];
  const trash: TrashPort = {
    async trash() {
      return { ok: true, version: 1 };
    },
    async restore(required) {
      restoreCalls.push({ entityType: required.entityType, entityId: required.entityId });
      return "restored";
    },
    async list() {
      return { items, nextCursor: "cursor-2" };
    },
    async purgeSelected() {
      throw new Error("purgeSelected must never be reached from a tool handler");
    },
  };
  const userRepo: UserRepoPort = {
    async findByPrincipalId() {
      return null;
    },
    async findByUsername() {
      return null;
    },
    async list() {
      return [{ principalId: "principal-1", workspaceId: WORKSPACE_ID, username: "alice", passwordHash: "unused" }];
    },
    async save() {},
  };
  const deps: TrashToolDeps = {
    workspaceId: WORKSPACE_ID,
    clock: createFakeClock({ startIso: options.clockIso ?? NOW }),
    trash,
    userRepo,
    registry: options.registry ?? buildTrashRegistry(),
    authorize: async (params) => (granted.has(params.permission) ? { allowed: true, reason: "matched" } : { allowed: false, reason: `missing ${params.permission}` }),
  };
  return { deps, restoreCalls };
}

function buildThroughContributor(deps: TrashToolDeps): ToolRegistration[] {
  return contributeTrashTools().build(deps, undefined);
}

function toolById(registrations: ToolRegistration[], id: string): ToolRegistration {
  const found = registrations.find((registration) => registration.descriptor.id === id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

function ctx(input: unknown): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal } as ToolExecutionContext;
}

const callList = (fixture: Fixture, input: unknown = {}) => toolById(buildThroughContributor(fixture.deps), "trash_list_items").handler(ctx(input));
const callRestore = (fixture: Fixture, input: unknown) => toolById(buildThroughContributor(fixture.deps), "trash_restore_item").handler(ctx(input));

/** A registry that also holds "post" (a kind the bespoke map already owns) and one extra kind. */
function overlappingRegistry(): TrashRegistry {
  const base = buildTrashRegistry();
  const anyEntry = [...base.values()][0]!;
  const extended = new Map<TrashEntityType, (typeof anyEntry)>(base);
  extended.set("post", { ...anyEntry, entityType: "post", permission: "content.write" });
  return extended;
}

function enumOf(registrations: ToolRegistration[], toolId: string): string[] {
  const schema = JSON.parse(JSON.stringify(toolById(registrations, toolId).descriptor.inputSchema)) as { properties: { entityType?: { enum: string[] }; entityTypes?: { items: { enum: string[] } } } };
  return schema.properties.entityType?.enum ?? schema.properties.entityTypes!.items.enum;
}

test("(a) registration ids, in order, are the two trash tools", () => {
  const ids = buildThroughContributor(makeFixture().deps).map((registration) => registration.descriptor.id);
  assert.deepEqual(ids, [...TOOL_IDS]);
});

test("(b) every descriptor equals the committed golden, metadata included", () => {
  for (const registration of buildThroughContributor(makeFixture().deps)) {
    const descriptor = JSON.parse(JSON.stringify(registration.descriptor));
    assert.deepStrictEqual(descriptor, GOLDEN[registration.descriptor.id], registration.descriptor.id);
  }
  assert.deepEqual(Object.keys(GOLDEN), [...TOOL_IDS]);
});

test("(c) the contributor's derived-risk map is the two authored entries", () => {
  assert.deepEqual([...contributeTrashTools().risk.entries()], DERIVED_RISK.map(([id, risk]) => [id, risk]));
});

test("(d) trash_list_items: a principal without content.read is refused with a ForbiddenError naming the permission", async () => {
  await assert.rejects(callList(makeFixture({ granted: ["content.write"] })), (error: unknown) => {
    assert.ok(error instanceof Error, "expected an Error");
    assert.equal(error.constructor.name, "ForbiddenError");
    assert.equal(error.message, "principal 'principal-under-test' is not authorized for 'content.read' (missing content.read)");
    return true;
  });
});

test("(d) trash_restore_item: a principal without the kind's permission is refused and never reaches the port", async () => {
  const fixture = makeFixture({ granted: ["content.read"] });
  await assert.rejects(callRestore(fixture, { entityType: "post", entityId: "post-1" }), (error: unknown) => {
    assert.ok(error instanceof Error, "expected an Error");
    assert.equal(error.constructor.name, "ForbiddenError");
    assert.equal(error.message, "principal 'principal-under-test' is not authorized for 'content.write' (missing content.write)");
    return true;
  });
  assert.deepEqual(fixture.restoreCalls, []);
});

test("(e) one success call per tool returns the model-facing view", async () => {
  const fixture = makeFixture({ items: [trashItem({ id: "row-1", entityType: "post", entityId: "post-1", actorPluginId: "assistant" })] });
  assert.deepEqual(await callList(fixture), {
    items: [
      {
        trashItemId: "row-1",
        entityType: "post",
        entityId: "post-1",
        title: "title of post-1",
        subtitle: null,
        deletedAt: NOW,
        deletedBy: "alice + AI",
        permanentlyRemovedAfter: "2026-09-27T12:00:00.000Z",
        daysRemaining: 7,
      },
    ],
    nextCursor: "cursor-2",
  });
  assert.deepEqual(await callRestore(fixture, { entityType: "post", entityId: "post-1" }), { restored: true, entityType: "post", entityId: "post-1" });
  assert.deepEqual(fixture.restoreCalls, [{ entityType: "post", entityId: "post-1" }]);
});

test("(f) a row the principal may not see is absent from the list, and restoring that kind is refused with the same message", async () => {
  const items = [trashItem({ id: "row-1", entityType: "post", entityId: "post-1" }), trashItem({ id: "row-2", entityType: "comment", entityId: "comment-1" })];
  const fixture = makeFixture({ items, granted: ["content.read", "content.write"] });
  const listed = (await callList(fixture)) as { items: Array<{ entityType: string }> };
  assert.deepEqual(listed.items.map((row) => row.entityType), ["post"]);
  await assert.rejects(callRestore(fixture, { entityType: "comment", entityId: "comment-1" }), { message: "principal 'principal-under-test' is not authorized for 'comments.moderate' (missing comments.moderate)" });
  assert.deepEqual(fixture.restoreCalls, []);
});

test("(g) daysRemaining counts whole days from the injected clock and never goes negative", async () => {
  const items = [
    trashItem({ id: "row-1", entityType: "post", entityId: "post-1", purgeAfter: "2026-09-21T11:00:00.000Z" }),
    trashItem({ id: "row-2", entityType: "post", entityId: "post-2", purgeAfter: "2026-09-19T12:00:00.000Z" }),
  ];
  const listed = (await callList(makeFixture({ items }))) as { items: Array<{ daysRemaining: number }> };
  assert.deepEqual(listed.items.map((row) => row.daysRemaining), [1, 0]);
});

test("(h) the unknown-kind refusal lists the bespoke kinds then the registry kinds, duplicates included", async () => {
  const registry = overlappingRegistry();
  const registryKinds = [...registry.keys()];
  assert.ok(registryKinds.includes("post"), "the fixture registry must overlap the bespoke map");
  await assert.rejects(callRestore(makeFixture({ registry }), { entityType: "ghost", entityId: "g-1" }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError, `got ${(error as Error)?.constructor?.name}`);
    assert.equal(error.message, `trash_restore_item: 'ghost' is not a kind the Trash can restore. Expected one of: ${[...BESPOKE_KINDS, ...registryKinds].join(", ")}.`);
    return true;
  });
});

test("(i) the catalog's entityType enums are de-duplicated and ordered bespoke kinds first, then registry kinds", () => {
  const registry = overlappingRegistry();
  const expected = [...new Set([...BESPOKE_KINDS, ...registry.keys()])];
  const registrations = buildThroughContributor(makeFixture({ registry }).deps);
  assert.deepEqual(enumOf(registrations, "trash_restore_item"), expected);
  assert.deepEqual(enumOf(registrations, "trash_list_items"), expected);
  assert.ok(expected.length < BESPOKE_KINDS.length + registry.size, "the fixture must actually contain a duplicate");
});
