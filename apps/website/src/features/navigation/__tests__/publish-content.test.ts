import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import type { PackedEntity, PublishContentDeps } from "#src/features/publish-content/type-registry";

import {
  InMemoryMenuRepo,
  InMemoryNavLocationBindingRepo,
  type MenuRepoPort,
  type NavLocationBindingRepoPort,
  type NavMenuEntry,
} from "../index.js";
import { contributeMenusPublish } from "../publish-content.js";

/**
 * @file S3 (`menu` publish type) — `features/navigation/publish-content.ts`. Uses Jini's own
 * `InMemoryMenuRepo`/`InMemoryNavLocationBindingRepo` directly (not the host's trash-aware wrapper),
 * mirroring `redirects/__tests__/publish-content.test.ts`'s "real repo, real chokepoint" convention —
 * these assertions exercise the SAME `importMenuEntity` the write chokepoint itself runs.
 */

const WORKSPACE_ID = "workspace-1";

function makePublishDeps(input: {
  menuRepo?: MenuRepoPort;
  navLocationBindingRepo?: NavLocationBindingRepoPort;
  clock?: { nowIso(): string };
  idGen?: { newId(): string };
  outbox?: InMemoryOutbox;
}): PublishContentDeps {
  return {
    workspaceId: WORKSPACE_ID,
    postRepo: undefined as unknown as PublishContentDeps["postRepo"],
    clock: input.clock ?? { nowIso: () => "2026-09-24T00:00:00.000Z" },
    idGen: input.idGen ?? { newId: () => "unused-in-these-tests" },
    outbox: input.outbox ?? new InMemoryOutbox(),
    menuRepo: input.menuRepo,
    navLocationBindingRepo: input.navLocationBindingRepo,
  };
}

function packedEntity(id: string, state: Record<string, unknown>): PackedEntity {
  return { entityType: "menu", id, schemaVersion: 1, contentHash: "unused-in-these-tests", hashVersion: 1, requiredBlobs: [], state };
}

function menuState(overrides: Partial<Pick<NavMenuEntry, "slug" | "title" | "status" | "doc" | "locations">> = {}) {
  return {
    slug: "primary-nav",
    title: "Primary Nav",
    status: "published",
    doc: { type: "menu", version: 1, items: [] },
    locations: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// pack()
// ---------------------------------------------------------------------------

test("pack() yields nothing when menuRepo is absent", async () => {
  const handler = contributeMenusPublish().build(makePublishDeps({}));
  const entities: PackedEntity[] = [];
  for await (const entity of handler.pack()) entities.push(entity);
  assert.deepEqual(entities, []);
});

test("pack() skips a trashed menu and packs a live one, keyed by the menu's own id", async () => {
  const menuRepo = new InMemoryMenuRepo([
    { id: "menu-live", workspaceId: WORKSPACE_ID, ...menuState({ slug: "live-nav" }), updatedAt: "2026-01-01T00:00:00.000Z", version: 1 },
    {
      id: "menu-trashed",
      workspaceId: WORKSPACE_ID,
      ...menuState({ slug: "gone-nav", status: "trash" }),
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
    },
  ] as NavMenuEntry[]);
  const handler = contributeMenusPublish().build(makePublishDeps({ menuRepo }));

  const entities: PackedEntity[] = [];
  for await (const entity of handler.pack()) entities.push(entity);

  assert.deepEqual(entities.map((e) => e.id), ["menu-live"]);
  assert.equal(entities[0].state.slug, "live-nav");
});

// ---------------------------------------------------------------------------
// apply() — id-preserving create, OCC update, location displacement, entryRef degrade
// ---------------------------------------------------------------------------

test("apply() creates a new menu under the SOURCE id (never mints its own, unlike createMenu)", async () => {
  const menuRepo = new InMemoryMenuRepo();
  const bindingRepo = new InMemoryNavLocationBindingRepo();
  const handler = contributeMenusPublish().build(
    makePublishDeps({ menuRepo, navLocationBindingRepo: bindingRepo, idGen: { newId: () => "generated-1" } })
  );

  const { changeSetId } = await handler.apply({
    entity: packedEntity("menu-header-nav", menuState({ slug: "header-nav" })),
    expectedVersion: undefined,
    principalId: "operator-1",
    idempotencyKey: "idem-1",
  });

  assert.equal(changeSetId, "menu-header-nav");
  const landed = await menuRepo.findById({ workspaceId: WORKSPACE_ID, id: "menu-header-nav" });
  assert.equal(landed?.id, "menu-header-nav");
  assert.equal(landed?.slug, "header-nav");
  assert.equal(landed?.version, 1);
});

test("apply() updates an existing destination row under OCC, re-resolved by its own id", async () => {
  const menuRepo = new InMemoryMenuRepo([
    { id: "menu-header-nav", workspaceId: WORKSPACE_ID, ...menuState({ slug: "header-nav" }), updatedAt: "2026-01-01T00:00:00.000Z", version: 3 },
  ] as NavMenuEntry[]);
  const bindingRepo = new InMemoryNavLocationBindingRepo();
  const handler = contributeMenusPublish().build(makePublishDeps({ menuRepo, navLocationBindingRepo: bindingRepo }));

  const { changeSetId } = await handler.apply({
    entity: packedEntity("menu-header-nav", menuState({ slug: "header-nav", title: "New Title" })),
    expectedVersion: 3,
    principalId: "operator-1",
    idempotencyKey: "idem-2",
  });

  assert.equal(changeSetId, "menu-header-nav");
  const landed = await menuRepo.findById({ workspaceId: WORKSPACE_ID, id: "menu-header-nav" });
  assert.equal(landed?.title, "New Title");
  assert.equal(landed?.version, 4);
});

test("apply() rebinds a location away from whatever destination menu previously held it (displacement)", async () => {
  const menuRepo = new InMemoryMenuRepo([
    { id: "menu-old-header", workspaceId: WORKSPACE_ID, ...menuState({ slug: "old-header", locations: ["primary"] }), updatedAt: "2026-01-01T00:00:00.000Z", version: 1 },
  ] as NavMenuEntry[]);
  const bindingRepo = new InMemoryNavLocationBindingRepo([
    { workspaceId: WORKSPACE_ID, locationKey: "primary", menuId: "menu-old-header", boundAt: "2026-01-01T00:00:00.000Z" },
  ]);
  const handler = contributeMenusPublish().build(
    makePublishDeps({ menuRepo, navLocationBindingRepo: bindingRepo, idGen: { newId: () => "evt-1" } })
  );

  await handler.apply({
    entity: packedEntity("menu-header-nav", menuState({ slug: "header-nav", locations: ["primary"] })),
    expectedVersion: undefined,
    principalId: "operator-1",
    idempotencyKey: "idem-3",
  });

  const binding = await bindingRepo.findByLocation({ workspaceId: WORKSPACE_ID, locationKey: "primary" });
  assert.equal(binding?.menuId, "menu-header-nav", "the location must now point at the newly-published menu");

  const displaced = await menuRepo.findById({ workspaceId: WORKSPACE_ID, id: "menu-old-header" });
  assert.deepEqual(displaced?.locations, [], "the displaced menu must lose the location from its own locations field");
  assert.equal(displaced?.version, 2);
});

test("apply() accepts a doc item whose entryRef target does not exist at the destination — no precheck on refs", async () => {
  const menuRepo = new InMemoryMenuRepo();
  const bindingRepo = new InMemoryNavLocationBindingRepo();
  const handler = contributeMenusPublish().build(makePublishDeps({ menuRepo, navLocationBindingRepo: bindingRepo }));

  const doc = {
    type: "menu",
    version: 1,
    items: [{ id: "item-1", label: "Missing Page", target: { kind: "entryRef", entryId: "page-does-not-exist" } }],
  };

  const { changeSetId } = await handler.apply({
    entity: packedEntity("menu-with-dead-ref", menuState({ slug: "dead-ref-nav", doc })),
    expectedVersion: undefined,
    principalId: "operator-1",
    idempotencyKey: "idem-4",
  });

  assert.ok(changeSetId, "applying a menu whose entryRef target is missing must still succeed — resolution degrades at RENDER time, not publish time");
  const landed = await menuRepo.findById({ workspaceId: WORKSPACE_ID, id: "menu-with-dead-ref" });
  assert.equal(landed?.doc.items[0]?.target.kind, "entryRef");
});

test("apply() round-trip (simulated rollback): publishing the prior record back restores the prior binding owner", async () => {
  const menuRepo = new InMemoryMenuRepo([
    { id: "menu-old-header", workspaceId: WORKSPACE_ID, ...menuState({ slug: "old-header", locations: ["primary"] }), updatedAt: "2026-01-01T00:00:00.000Z", version: 1 },
  ] as NavMenuEntry[]);
  const bindingRepo = new InMemoryNavLocationBindingRepo([
    { workspaceId: WORKSPACE_ID, locationKey: "primary", menuId: "menu-old-header", boundAt: "2026-01-01T00:00:00.000Z" },
  ]);
  const handler = contributeMenusPublish().build(
    makePublishDeps({ menuRepo, navLocationBindingRepo: bindingRepo, idGen: { newId: () => "evt" } })
  );

  // Forward: publish a new menu that takes over "primary" from menu-old-header.
  await handler.apply({
    entity: packedEntity("menu-header-nav", menuState({ slug: "header-nav", locations: ["primary"] })),
    expectedVersion: undefined,
    principalId: "operator-1",
    idempotencyKey: "idem-5",
  });
  assert.equal((await bindingRepo.findByLocation({ workspaceId: WORKSPACE_ID, locationKey: "primary" }))?.menuId, "menu-header-nav");

  // Rollback: re-publish menu-old-header's own prior state (still claiming "primary") — the same
  // shape a restore-point/undo flow would replay.
  await handler.apply({
    entity: packedEntity("menu-old-header", menuState({ slug: "old-header", locations: ["primary"] })),
    expectedVersion: 2, // bumped once already by the displacement above
    principalId: "operator-1",
    idempotencyKey: "idem-6",
  });

  const binding = await bindingRepo.findByLocation({ workspaceId: WORKSPACE_ID, locationKey: "primary" });
  assert.equal(binding?.menuId, "menu-old-header", "restoring the prior record must restore the prior binding owner");
});

// ---------------------------------------------------------------------------
// precheck()
// ---------------------------------------------------------------------------

test("precheck() rejects a slug already held by a different menu", async () => {
  const menuRepo = new InMemoryMenuRepo([
    { id: "menu-other", workspaceId: WORKSPACE_ID, ...menuState({ slug: "header-nav" }), updatedAt: "2026-01-01T00:00:00.000Z", version: 1 },
  ] as NavMenuEntry[]);
  const handler = contributeMenusPublish().build(makePublishDeps({ menuRepo }));

  const reason = await handler.precheck(packedEntity("menu-incoming", menuState({ slug: "header-nav" })));
  assert.match(reason ?? "", /already held by a different menu/);
});

test("precheck() reports the tree validator's own message for an invalid doc", async () => {
  const menuRepo = new InMemoryMenuRepo();
  const handler = contributeMenusPublish().build(makePublishDeps({ menuRepo }));

  const badDoc = { type: "menu", version: 1, items: [{ id: "", label: "Bad", target: { kind: "url", href: "/ok" } }] };
  const reason = await handler.precheck(packedEntity("menu-bad", menuState({ doc: badDoc })));
  assert.equal(reason, "every menu item requires a non-empty id");
});
