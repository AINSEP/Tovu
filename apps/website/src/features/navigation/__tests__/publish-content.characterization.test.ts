import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { PublishContentApplyRowError } from "#src/features/publish-content/apply-errors";
import type { PackedEntity, PublishContentDeps } from "#src/features/publish-content/type-registry";

import { InMemoryMenuRepo, InMemoryNavLocationBindingRepo, type NavMenuEntry } from "../index.js";
import { contributeMenusPublish } from "../publish-content.js";

/**
 * @file Characterization pin for M-MENU (`plan-publish-all-types-2026-09-25.md` §5, §7): the live site
 * holds a baseline `contentHash` for every published menu, so moving the handler onto
 * `createRepoPublishHandler` must keep every hash, packed state and exact reason byte-identical.
 * Written against the hand-written handler and kept green across the migration.
 */

const WORKSPACE_ID = "workspace-1";

const ROWS = [
  {
    id: "menu-header-nav",
    workspaceId: WORKSPACE_ID,
    slug: "header-nav",
    title: "Header",
    status: "published",
    doc: {
      type: "menu",
      version: 1,
      items: [
        { id: "i1", label: "About", target: { kind: "entryRef", entryId: "post-about" } },
        { id: "i2", label: "Docs", target: { kind: "url", href: "/docs" }, children: [{ id: "i3", label: "API", target: { kind: "url", href: "/docs/api" } }] },
      ],
    },
    locations: ["header"],
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 3,
  },
  { id: "menu-empty", workspaceId: WORKSPACE_ID, slug: "empty", title: "Empty", status: "draft", doc: { type: "menu", version: 1, items: [] }, locations: [], updatedAt: "2026-01-02T00:00:00.000Z", version: 1 },
  { id: "menu-trashed", workspaceId: WORKSPACE_ID, slug: "old", title: "Old", status: "trash", doc: { type: "menu", version: 1, items: [] }, locations: [], updatedAt: "2026-01-03T00:00:00.000Z", version: 2 },
] as unknown as NavMenuEntry[];

const PINNED_HASHES: Record<string, string> = {
  "menu-header-nav": "03036fd7571988a38b09365f04c73acde5beb407388c7cc48f2fca8048368beb",
  "menu-empty": "5098f558a80824b5816a20182ea51e4e7c12ba1cb7d238721f229f16217c7df0",
};

function deps(wired = true): PublishContentDeps {
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => "2026-09-24T00:00:00.000Z" },
    idGen: { newId: () => "unused" },
    outbox: new InMemoryOutbox(),
    ports: wired ? { menu: { repo: new InMemoryMenuRepo(structuredClone(ROWS)), bindingRepo: new InMemoryNavLocationBindingRepo() } } : {},
  };
}

const entity = (id: string, state: Record<string, unknown>): PackedEntity => ({
  entityType: "menu",
  id,
  schemaVersion: 1,
  contentHash: "unused",
  hashVersion: 1,
  requiredBlobs: [],
  state,
});

test("pack(): pinned contentHash and packed state per menu; trashed rows skipped", async () => {
  const packed: PackedEntity[] = [];
  for await (const e of contributeMenusPublish().build(deps()).pack()) packed.push(e);
  assert.deepEqual(
    packed.map((e) => [e.id, e.contentHash, e.schemaVersion, e.hashVersion, e.requiredBlobs]),
    Object.entries(PINNED_HASHES).map(([id, hash]) => [id, hash, 1, 1, []])
  );
  const { slug, title, status, doc, locations } = ROWS[0];
  assert.deepEqual(packed[0].state, { slug, title, status, doc, locations });
});

test("inspect(): the destination's hash equals the pinned pack hash", async () => {
  const handler = contributeMenusPublish().build(deps());
  for (const [id, hash] of Object.entries(PINNED_HASHES)) {
    assert.deepEqual(await handler.inspect(id), { version: ROWS.find((r) => r.id === id)!.version, hash });
  }
});

test("precheck(): exact reason strings", async () => {
  const state = { slug: "fresh", title: "Fresh", status: "published", doc: { type: "menu", version: 1, items: [] }, locations: [] };
  assert.equal(
    await contributeMenusPublish().build(deps(false)).precheck(entity("m", state)),
    "menu entity 'm' cannot be prechecked — no menu port wired for this deps bag"
  );
  const handler = contributeMenusPublish().build(deps());
  assert.equal(await handler.precheck(entity("menu-new", state)), null);
  assert.equal(await handler.precheck(entity("menu-empty", { ...state, slug: "empty" })), null);
  // The slug sentence drops "menu " and "at this destination" (plan §2.3); the owner-facing rewrite in
  // `ui/report-rows.ts` matches both, so only the shared core is pinned.
  assert.match(
    (await handler.precheck(entity("menu-new", { ...state, slug: "header-nav" }))) ?? "",
    /^(?:menu )?slug 'header-nav' is already held by a different menu \('menu-header-nav'\)/
  );
  const badDoc = { type: "menu", version: 1, items: [{ id: "", label: "Bad", target: { kind: "url", href: "/ok" } }] };
  assert.equal(await handler.precheck(entity("menu-new", { ...state, doc: badDoc })), "every menu item requires a non-empty id");
});

test("apply(): exact blocked text, stale version is a conflict, unwired throws naming the port", async () => {
  const handler = contributeMenusPublish().build(deps());
  const state = { slug: "fresh", title: "Fresh", status: "published", doc: { type: "menu", version: 1, items: [] }, locations: [] };
  const badDoc = { type: "menu", version: 1, items: [{ id: "", label: "Bad", target: { kind: "url", href: "/ok" } }] };
  await assert.rejects(
    () => handler.apply({ entity: entity("menu-new", { ...state, doc: badDoc }), expectedVersion: undefined, principalId: "op", idempotencyKey: "k1" }),
    (err: unknown) => err instanceof PublishContentApplyRowError && err.rowOutcome === "blocked" && err.message === "every menu item requires a non-empty id"
  );
  await assert.rejects(
    () => handler.apply({ entity: entity("menu-empty", { ...state, slug: "empty" }), expectedVersion: 7, principalId: "op", idempotencyKey: "k2" }),
    (err: unknown) => err instanceof PublishContentApplyRowError && err.rowOutcome === "conflict"
  );
  await assert.rejects(
    () => contributeMenusPublish().build(deps(false)).apply({ entity: entity("m", state), expectedVersion: undefined, principalId: "op", idempotencyKey: "k3" }),
    /^Error: publish-content: menu\.apply\(\) requires PublishContentDeps\.ports\.menu/
  );
});

test("apply(): create keeps the source id, update bumps the version; changeSetId is the menu id", async () => {
  const d = deps();
  const handler = contributeMenusPublish().build(d);
  const state = { slug: "fresh", title: "Fresh", status: "published", doc: { type: "menu", version: 1, items: [] }, locations: ["footer"] };
  assert.equal((await handler.apply({ entity: entity("menu-new", state), expectedVersion: undefined, principalId: "op", idempotencyKey: "k4" })).changeSetId, "menu-new");
  const { changeSetId } = await handler.apply({ entity: entity("menu-empty", { ...state, slug: "empty", locations: [] }), expectedVersion: 1, principalId: "op", idempotencyKey: "k5" });
  assert.equal(changeSetId, "menu-empty");
  const repo = d.ports.menu!.repo;
  assert.equal((await repo.findById({ workspaceId: WORKSPACE_ID, id: "menu-new" }))?.title, "Fresh");
  assert.equal((await repo.findById({ workspaceId: WORKSPACE_ID, id: "menu-empty" }))?.version, 2);
});
