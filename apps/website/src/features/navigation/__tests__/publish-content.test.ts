import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import type { PackedEntity, PublishContentDeps } from "#src/features/publish-content/type-registry";

import {
  InMemoryMenuRepo,
  InMemoryNavLocationBindingRepo,
  type MenuRepoPort,
  type NavLocationBindingRepoPort,
  type NavMenuDoc,
  type NavMenuEntry,
} from "../index.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { contributeMenusPublish } from "../publish-content.js";

/**
 * @file S3 (`menu` publish type) — `features/navigation/publish-content.ts`. Uses Jini's own
 * `InMemoryMenuRepo`/`InMemoryNavLocationBindingRepo` directly (not the host's trash-aware wrapper),
 * mirroring `redirects/__tests__/publish-content.test.ts`'s "real repo, real chokepoint" convention —
 * these assertions exercise the SAME `importMenuEntity` the write chokepoint itself runs.
 *
 * R3 (`ADS-memory/.local-artifacts/plan-publish-repoint-menus-2026-09-24.md` §3) adds
 * `referencesTo()`/`repointReferences()` coverage below, using the same repos plus a real
 * `InMemoryChangeSetRepo` and an `authorize` stub — the same "real chokepoint" convention `retire()`'s
 * own tests (`features/post/__tests__/publish-content.test.ts`) use for `executeCommand`.
 */

const WORKSPACE_ID = "workspace-1";

/** Distinct event ids: `InMemoryOutbox.enqueue` now drops a repeated `event.id` (like the SQL outbox),
 *  so a constant id silently swallowed every event after the first. */
function sequentialIds(prefix = "evt"): { newId(): string } {
  let next = 0;
  return { newId: () => `${prefix}-${++next}` };
}

function makePublishDeps(input: {
  menuRepo?: MenuRepoPort;
  navLocationBindingRepo?: NavLocationBindingRepoPort;
  clock?: { nowIso(): string; nowMs(): number };
  idGen?: { newId(): string };
  outbox?: InMemoryOutbox;
}): PublishContentDeps {
  return {
    workspaceId: WORKSPACE_ID,
    clock: input.clock ?? createFakeClock({ startIso: "2026-09-24T00:00:00.000Z" }),
    idGen: input.idGen ?? sequentialIds(),
    outbox: input.outbox ?? new InMemoryOutbox(),
    ports: {
      menu:
        input.menuRepo === undefined && input.navLocationBindingRepo === undefined
          ? undefined
          : {
              repo: input.menuRepo as MenuRepoPort,
              bindingRepo: input.navLocationBindingRepo as NavLocationBindingRepoPort,
            },
    },
  };
}

function packedEntity(id: string, state: Record<string, unknown>): PackedEntity {
  return { entityType: "menu", id, schemaVersion: 1, contentHash: "unused-in-these-tests", hashVersion: 1, requiredBlobs: [], state };
}

type MenuState = Pick<NavMenuEntry, "slug" | "title" | "status" | "doc" | "locations">;

function menuState(overrides: Partial<MenuState> = {}): MenuState {
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

test("pack() keeps both the page reference and last-known URL for a destination without that page", async () => {
  const target = { kind: "entryRef" as const, entryId: "page-about", entryType: "page", lastKnownHref: "/about" };
  const doc = { type: "menu" as const, version: 1 as const, items: [{ id: "about", target }] };
  const menuRepo = new InMemoryMenuRepo({}, { initialRows: [{ id: "footer", workspaceId: WORKSPACE_ID,
    ...menuState({ doc }), updatedAt: "2026-10-04", version: 1 } as NavMenuEntry] });
  const handler = contributeMenusPublish().build(makePublishDeps({ menuRepo }));
  const entities: PackedEntity[] = [];
  for await (const entity of handler.pack()) entities.push(entity);
  assert.deepEqual(entities[0].state.doc, doc);
});

test("pack() skips a trashed menu and packs a live one, keyed by the menu's own id", async () => {
  const menuRepo = new InMemoryMenuRepo({}, { initialRows: [
    { id: "menu-live", workspaceId: WORKSPACE_ID, ...menuState({ slug: "live-nav" }), updatedAt: "2026-01-01T00:00:00.000Z", version: 1 },
    {
      id: "menu-trashed",
      workspaceId: WORKSPACE_ID,
      ...menuState({ slug: "gone-nav", status: "trash" }),
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
    },
  ] as NavMenuEntry[] });
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
  const menuRepo = new InMemoryMenuRepo({});
  const bindingRepo = new InMemoryNavLocationBindingRepo({});
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
  const menuRepo = new InMemoryMenuRepo({}, { initialRows: [
    { id: "menu-header-nav", workspaceId: WORKSPACE_ID, ...menuState({ slug: "header-nav", locations: ["primary", "stale", "reassigned"] }), updatedAt: "2026-01-01T00:00:00.000Z", version: 3 },
  ] as NavMenuEntry[] });
  const other = { workspaceId: WORKSPACE_ID, locationKey: "reassigned", menuId: "menu-other", boundAt: "2026-01-01T00:00:00.000Z" };
  const unrelated = { ...other, locationKey: "sidebar" };
  const bindingRepo = new InMemoryNavLocationBindingRepo({}, { initialRows: [
    { ...other, locationKey: "primary", menuId: "menu-header-nav" },
    { ...other, locationKey: "stale", menuId: "menu-header-nav" }, other, unrelated,
  ] });
  const outbox = new InMemoryOutbox();
  const handler = contributeMenusPublish().build(makePublishDeps({ menuRepo, navLocationBindingRepo: bindingRepo, outbox }));

  const { changeSetId } = await handler.apply({
    entity: packedEntity("menu-header-nav", menuState({ slug: "header-nav", title: "New Title", locations: ["primary"] })),
    expectedVersion: 3,
    principalId: "operator-1",
    idempotencyKey: "idem-2",
  });

  assert.equal(changeSetId, "menu-header-nav");
  const landed = await menuRepo.findById({ workspaceId: WORKSPACE_ID, id: "menu-header-nav" });
  assert.equal(landed?.title, "New Title");
  assert.equal(landed?.version, 4);
  assert.equal(await bindingRepo.findByLocation({ workspaceId: WORKSPACE_ID, locationKey: "stale" }), null);
  assert.equal((await bindingRepo.findByLocation({ workspaceId: WORKSPACE_ID, locationKey: "primary" }))?.menuId, "menu-header-nav");
  assert.deepEqual(await bindingRepo.findByLocation({ workspaceId: WORKSPACE_ID, locationKey: "reassigned" }), other);
  assert.deepEqual(await bindingRepo.findByLocation({ workspaceId: WORKSPACE_ID, locationKey: "sidebar" }), unrelated);
  const events = (await outbox.claimPending({ batchSize: 10, nowIso: "2026-09-24T00:00:00.000Z" })).map((row) => row.event);
  assert.deepEqual(events.map(({ name, aggregateId, workspaceId, payload }) => ({ name, aggregateId, workspaceId, payload })), [
    { name: "navigation.menu.updated", aggregateId: "menu-header-nav", workspaceId: WORKSPACE_ID, payload: { menuId: "menu-header-nav", slug: "header-nav" } },
    { name: "navigation.location.assigned", aggregateId: "menu-header-nav", workspaceId: WORKSPACE_ID, payload: { locationKey: "primary", menuId: "menu-header-nav" } },
  ]);
});

test("apply() rebinds a location away from whatever destination menu previously held it (displacement)", async () => {
  const menuRepo = new InMemoryMenuRepo({}, { initialRows: [
    { id: "menu-old-header", workspaceId: WORKSPACE_ID, ...menuState({ slug: "old-header", locations: ["primary"] }), updatedAt: "2026-01-01T00:00:00.000Z", version: 1 },
  ] as NavMenuEntry[] });
  const bindingRepo = new InMemoryNavLocationBindingRepo({}, { initialRows: [
    { workspaceId: WORKSPACE_ID, locationKey: "primary", menuId: "menu-old-header", boundAt: "2026-01-01T00:00:00.000Z" },
  ] });
  const outbox = new InMemoryOutbox();
  const handler = contributeMenusPublish().build(
    makePublishDeps({ menuRepo, navLocationBindingRepo: bindingRepo, outbox, idGen: sequentialIds() })
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
  const events = (await outbox.claimPending({ batchSize: 10, nowIso: "2026-09-24T00:00:00.000Z" })).map((row) => row.event);
  assert.deepEqual(events.map(({ name, aggregateId, workspaceId, payload }) => ({ name, aggregateId, workspaceId, payload })), [
    { name: "navigation.menu.created", aggregateId: "menu-header-nav", workspaceId: WORKSPACE_ID, payload: { menuId: "menu-header-nav", slug: "header-nav" } },
    { name: "navigation.location.unassigned", aggregateId: "menu-old-header", workspaceId: WORKSPACE_ID, payload: { locationKey: "primary", menuId: "menu-old-header" } },
    { name: "navigation.location.assigned", aggregateId: "menu-header-nav", workspaceId: WORKSPACE_ID, payload: { locationKey: "primary", menuId: "menu-header-nav" } },
  ]);
});

test("apply() accepts a doc item whose entryRef target does not exist at the destination — no precheck on refs", async () => {
  const menuRepo = new InMemoryMenuRepo({});
  const bindingRepo = new InMemoryNavLocationBindingRepo({});
  const handler = contributeMenusPublish().build(makePublishDeps({ menuRepo, navLocationBindingRepo: bindingRepo }));

  const doc: NavMenuDoc = {
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
  const menuRepo = new InMemoryMenuRepo({}, { initialRows: [
    { id: "menu-old-header", workspaceId: WORKSPACE_ID, ...menuState({ slug: "old-header", locations: ["primary"] }), updatedAt: "2026-01-01T00:00:00.000Z", version: 1 },
  ] as NavMenuEntry[] });
  const bindingRepo = new InMemoryNavLocationBindingRepo({}, { initialRows: [
    { workspaceId: WORKSPACE_ID, locationKey: "primary", menuId: "menu-old-header", boundAt: "2026-01-01T00:00:00.000Z" },
  ] });
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
  const menuRepo = new InMemoryMenuRepo({}, { initialRows: [
    { id: "menu-other", workspaceId: WORKSPACE_ID, ...menuState({ slug: "header-nav" }), updatedAt: "2026-01-01T00:00:00.000Z", version: 1 },
  ] as NavMenuEntry[] });
  const handler = contributeMenusPublish().build(makePublishDeps({ menuRepo }));

  const reason = await handler.precheck(packedEntity("menu-incoming", menuState({ slug: "header-nav" })));
  assert.match(reason ?? "", /already held by a different menu/);
});

test("precheck() reports the tree validator's own message for an invalid doc", async () => {
  const menuRepo = new InMemoryMenuRepo({});
  const handler = contributeMenusPublish().build(makePublishDeps({ menuRepo }));

  const badDoc: NavMenuDoc = { type: "menu", version: 1, items: [{ id: "", label: "Bad", target: { kind: "url", href: "/ok" } }] };
  const reason = await handler.precheck(packedEntity("menu-bad", menuState({ doc: badDoc })));
  assert.equal(reason, "every menu item requires a non-empty id");
});

// ---------------------------------------------------------------------------
// referencesTo() / repointReferences() — R3
// (`ADS-memory/.local-artifacts/plan-publish-repoint-menus-2026-09-24.md` §2.1-§2.4, §3 R3)
// ---------------------------------------------------------------------------

function menuRow(overrides: Partial<NavMenuEntry> & Pick<NavMenuEntry, "id">): NavMenuEntry {
  return {
    workspaceId: WORKSPACE_ID,
    ...menuState(),
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  } as NavMenuEntry;
}

/** Same as {@link makePublishDeps} plus a real `changeSets`/`authorize` — what `repointReferences()`
 *  actually requires (see its own doc). `authorize` always allows unless overridden. */
function makeRepointDeps(input: {
  menuRepo: MenuRepoPort;
  authorize?: PublishContentDeps["authorize"];
}): PublishContentDeps & { changeSets: InMemoryChangeSetRepo } {
  const outbox = new InMemoryOutbox();
  return {
    ...makePublishDeps({ menuRepo: input.menuRepo, outbox }),
    changeSets: new InMemoryChangeSetRepo([], [], outbox),
    authorize: input.authorize ?? (async () => ({ allowed: true, reason: "test-always-allow" })),
  };
}

/**
 * A `MenuRepoPort` wrapper whose `findById` lands a concurrent edit (the stored version one higher)
 * before every call after the first — simulating a concurrent edit landing between
 * `repointOneMenu`'s own read (to compute `expectedVersion`) and `updateMenuTree`'s save inside
 * `execute()`, which the save's compare-and-set then refuses. Used only by the "changed during
 * publish" test below; every other method delegates unchanged.
 */
class VersionRacingMenuRepo implements MenuRepoPort {
  private readonly inner: MenuRepoPort;
  private calls = 0;

  constructor(rows: NavMenuEntry[]) {
    this.inner = new InMemoryMenuRepo({}, { initialRows: rows });
  }

  async findById(required: { workspaceId: string; id: string }): Promise<NavMenuEntry | null> {
    const row = await this.inner.findById(required);
    if (!row) return row;
    this.calls += 1;
    if (this.calls === 1) return row;
    const edited = { ...row, version: row.version + 1 };
    await this.inner.save(edited);
    return edited;
  }

  findBySlug(required: { workspaceId: string; slug: string }) {
    return this.inner.findBySlug(required);
  }

  list(required: { workspaceId: string }) {
    return this.inner.list(required);
  }

  save(record: NavMenuEntry, options?: { expectedVersion?: number | null | undefined }) {
    return this.inner.save(record, options);
  }

  remove(required: { workspaceId: string; id: string }) {
    return this.inner.remove(required);
  }

  transaction<T>(required: { fn: () => Promise<T> }) {
    return this.inner.transaction(required);
  }
}

function entryRefItem(id: string, entryId: string) {
  return { id, label: "About", target: { kind: "entryRef" as const, entryId } };
}

test("referencesTo() finds a menu whose nested entryRef targets one of the given ids", async () => {
  const menuRepo = new InMemoryMenuRepo({}, { initialRows: [
    menuRow({
      id: "menu-header",
      ...menuState({
        title: "Header",
        doc: {
          type: "menu",
          version: 1,
          items: [
            { id: "item-1", label: "Company", target: { kind: "url", href: "/contact" }, children: [entryRefItem("item-1a", "post-about")] },
          ],
        },
      }),
    }),
  ] });
  const handler = contributeMenusPublish().build(makePublishDeps({ menuRepo }));

  const holders = await handler.referencesTo!(["post-about"]);

  assert.deepEqual(holders, [{ entityType: "menu", entityId: "menu-header", entityLabel: "Header", referencedId: "post-about" }]);
});

test("referencesTo() finds nothing for a menu whose only item is a url target", async () => {
  const menuRepo = new InMemoryMenuRepo({}, { initialRows: [
    menuRow({
      id: "menu-footer",
      ...menuState({ title: "Footer", doc: { type: "menu", version: 1, items: [{ id: "item-1", label: "Contact", target: { kind: "url", href: "/contact" } }] } }),
    }),
  ] });
  const handler = contributeMenusPublish().build(makePublishDeps({ menuRepo }));

  const holders = await handler.referencesTo!(["post-about"]);
  assert.deepEqual(holders, []);
});

test("repointReferences() rewrites a live menu's entryRef and records one revertible change set", async () => {
  const menuRepo = new InMemoryMenuRepo({}, { initialRows: [
    menuRow({ id: "menu-header", ...menuState({ title: "Header", doc: { type: "menu", version: 1, items: [entryRefItem("item-1", "post-about")] } }), version: 5 }),
  ] });
  const deps = makeRepointDeps({ menuRepo });
  const handler = contributeMenusPublish().build(deps);

  const result = await handler.repointReferences!({
    replacements: [{ entityType: "post", oldId: "post-about", newId: "post-about-new" }],
    skipIds: new Set(),
    principalId: "operator-1",
    runId: "run-1",
  });

  assert.equal(result.linksUpdated, 1);
  assert.equal(result.changeSetIds.length, 1);
  assert.deepEqual(result.notUpdated, []);

  const landed = await menuRepo.findById({ workspaceId: WORKSPACE_ID, id: "menu-header" });
  assert.equal((landed?.doc.items[0]?.target as { entryId: string }).entryId, "post-about-new");

  const recorded = await deps.changeSets.findById({ workspaceId: WORKSPACE_ID, id: result.changeSetIds[0]! });
  assert.equal(recorded?.changeSet.status, "applied");
  assert.equal(recorded?.items[0]?.entityType, "menu");
  assert.equal(recorded?.items[0]?.operation, "update");
  assert.deepEqual(recorded?.items[0]?.inversePayload, { items: [entryRefItem("item-1", "post-about")] });
  const events = await deps.outbox!.claimPending({ batchSize: 10, nowIso: "2026-09-24T00:00:00.000Z" });
  const updates = events.filter((row) => row.event.name === "navigation.menu.updated").map((row) => row.event);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].workspaceId, WORKSPACE_ID);
  assert.equal(updates[0].aggregateId, "menu-header");
  assert.deepEqual(updates[0].payload, { menuId: "menu-header", slug: "primary-nav" });
});

test("repointReferences() leaves a menu named in skipIds untouched", async () => {
  const menuRepo = new InMemoryMenuRepo({}, { initialRows: [
    menuRow({ id: "menu-header", ...menuState({ title: "Header", doc: { type: "menu", version: 1, items: [entryRefItem("item-1", "post-about")] } }) }),
  ] });
  const deps = makeRepointDeps({ menuRepo });
  const handler = contributeMenusPublish().build(deps);

  const result = await handler.repointReferences!({
    replacements: [{ entityType: "post", oldId: "post-about", newId: "post-about-new" }],
    skipIds: new Set(["menu-header"]),
    principalId: "operator-1",
    runId: "run-1",
  });

  assert.equal(result.linksUpdated, 0);
  assert.deepEqual(result.changeSetIds, []);
  const landed = await menuRepo.findById({ workspaceId: WORKSPACE_ID, id: "menu-header" });
  assert.equal((landed?.doc.items[0]?.target as { entryId: string }).entryId, "post-about", "a skipped menu must be unchanged");
});

test("repointReferences() called a second time finds nothing left to repoint — no new change set", async () => {
  const menuRepo = new InMemoryMenuRepo({}, { initialRows: [
    menuRow({ id: "menu-header", ...menuState({ title: "Header", doc: { type: "menu", version: 1, items: [entryRefItem("item-1", "post-about")] } }) }),
  ] });
  const deps = makeRepointDeps({ menuRepo });
  const handler = contributeMenusPublish().build(deps);
  const replacements = [{ entityType: "post", oldId: "post-about", newId: "post-about-new" }];

  const first = await handler.repointReferences!({ replacements, skipIds: new Set(), principalId: "operator-1", runId: "run-1" });
  assert.equal(first.linksUpdated, 1);

  const second = await handler.repointReferences!({ replacements, skipIds: new Set(), principalId: "operator-1", runId: "run-2" });
  assert.equal(second.linksUpdated, 0);
  assert.deepEqual(second.changeSetIds, []);
});

test("repointReferences() reports a denied authorization without writing", async () => {
  const menuRepo = new InMemoryMenuRepo({}, { initialRows: [
    menuRow({ id: "menu-header", ...menuState({ title: "Header", doc: { type: "menu", version: 1, items: [entryRefItem("item-1", "post-about")] } }) }),
  ] });
  const deps = makeRepointDeps({ menuRepo, authorize: async () => ({ allowed: false, reason: "grant excludes menus" }) });
  const handler = contributeMenusPublish().build(deps);

  const result = await handler.repointReferences!({
    replacements: [{ entityType: "post", oldId: "post-about", newId: "post-about-new" }],
    skipIds: new Set(),
    principalId: "operator-1",
    runId: "run-1",
  });

  assert.deepEqual(result.notUpdated, ["Menu links were not updated: this publishing grant doesn't cover menus."]);
  assert.equal(result.linksUpdated, 0);
  const landed = await menuRepo.findById({ workspaceId: WORKSPACE_ID, id: "menu-header" });
  assert.equal((landed?.doc.items[0]?.target as { entryId: string }).entryId, "post-about", "a denied authorization must never write");
});

test("repointReferences() skips a menu that keeps conflicting after one retry, with the exact operator-facing line", async () => {
  const menuRepo = new VersionRacingMenuRepo([
    menuRow({ id: "menu-header", ...menuState({ title: "Header", doc: { type: "menu", version: 1, items: [entryRefItem("item-1", "post-about")] } }) }),
  ]);
  const deps = makeRepointDeps({ menuRepo });
  const handler = contributeMenusPublish().build(deps);

  const result = await handler.repointReferences!({
    replacements: [{ entityType: "post", oldId: "post-about", newId: "post-about-new" }],
    skipIds: new Set(),
    principalId: "operator-1",
    runId: "run-1",
  });

  assert.deepEqual(result.notUpdated, ["Menu 'Header' was not updated: it changed during publish."]);
  assert.equal(result.linksUpdated, 0);
  assert.deepEqual(result.changeSetIds, []);
});

/** A change-set ledger whose `insert` always fails — the "mutation landed, record did not" window
 *  `executeCommand` closes with `mutation.rollback` (INV-01: no mutation without a record). */
class FailingInsertChangeSetRepo extends InMemoryChangeSetRepo {
  override async insert(): Promise<void> {
    throw new Error("change-set ledger unavailable");
  }
}

test("repointReferences() puts the prior tree back when the change-set record fails after the write landed", async () => {
  const priorItems = [entryRefItem("item-1", "post-about")];
  const menuRepo = new InMemoryMenuRepo({}, { initialRows: [
    menuRow({ id: "menu-header", ...menuState({ title: "Header", doc: { type: "menu", version: 1, items: priorItems } }), version: 5 }),
  ] });
  const outbox = new InMemoryOutbox();
  const deps = { ...makeRepointDeps({ menuRepo }), outbox, changeSets: new FailingInsertChangeSetRepo([], [], outbox) };
  const handler = contributeMenusPublish().build(deps);

  await assert.rejects(
    () =>
      handler.repointReferences!({
        replacements: [{ entityType: "post", oldId: "post-about", newId: "post-about-new" }],
        skipIds: new Set(),
        principalId: "operator-1",
        runId: "run-1",
      }),
    /change-set ledger unavailable/
  );

  const landed = await menuRepo.findById({ workspaceId: WORKSPACE_ID, id: "menu-header" });
  // JSON round-trip: Jini's `validateAndCloneTree` writes an explicit `children: undefined`, which a
  // persisted tree never carries — the comparison is of the stored shape.
  assert.deepEqual(
    JSON.parse(JSON.stringify(landed?.doc.items)),
    priorItems,
    "an unrecorded repoint must be rolled back, never left live and unrevertible"
  );
});

test("repointReferences continues after a denied menu and repairs the next menu", async () => {
  const denied = menuRow({ id: "menu-a", slug: "a", doc: { type: "menu", version: 1, items: [entryRefItem("a", "old")] } });
  const allowed = menuRow({ id: "menu-b", slug: "b", doc: { type: "menu", version: 1, items: [entryRefItem("b", "old")] } });
  const repo = new InMemoryMenuRepo({}, { initialRows: [denied, allowed] });
  let checks = 0;
  const deps = makeRepointDeps({ menuRepo: repo, authorize: async () => ({ allowed: ++checks > 1, reason: "test" }) });
  const result = await contributeMenusPublish().build(deps).repointReferences!({ replacements: [{ entityType: "post", oldId: "old", newId: "new" }], skipIds: new Set(), principalId: "operator-1", runId: "run-1" });
  assert.equal(checks, 2);
  assert.equal(result.notUpdated.length, 1);
  assert.equal(result.linksUpdated, 1);
  assert.equal(result.changeSetIds.length, 1);
  assert.deepEqual(await repo.findById({ workspaceId: WORKSPACE_ID, id: denied.id }), denied);
  assert.deepEqual((await repo.findById({ workspaceId: WORKSPACE_ID, id: allowed.id }))?.doc.items, [{ ...entryRefItem("b", "new"), children: undefined }]);
  const recorded = await deps.changeSets.findById({ workspaceId: WORKSPACE_ID, id: result.changeSetIds[0] });
  assert.equal(recorded?.items[0].entityId, allowed.id);
});

test("repointReferences retries a single conflict from fresh state, preserving the concurrent edit", async () => {
  const initial = menuRow({ id: "menu-race", doc: { type: "menu", version: 1, items: [entryRefItem("a", "old")] } });
  const repo = new InMemoryMenuRepo({}, { initialRows: [initial] });
  const read = repo.findById.bind(repo);
  let reads = 0;
  repo.findById = async (request) => {
    if (++reads === 2) await repo.save({ ...initial, version: 2, title: "Concurrent title", doc: { ...initial.doc, items: [{ ...entryRefItem("a", "old"), label: "Concurrent label" }, { id: "added", label: "Contact", target: { kind: "url", href: "/contact" } }] } });
    return read(request);
  };
  const deps = makeRepointDeps({ menuRepo: repo });
  const result = await contributeMenusPublish().build(deps).repointReferences!({ replacements: [{ entityType: "post", oldId: "old", newId: "new" }], skipIds: new Set(), principalId: "operator-1", runId: "run-1" });
  assert.equal(result.linksUpdated, 1);
  assert.deepEqual(result.notUpdated, []);
  assert.equal(result.changeSetIds.length, 1);
  const landed = await read({ workspaceId: WORKSPACE_ID, id: initial.id });
  assert.equal(landed?.title, "Concurrent title");
  assert.equal(landed?.version, 3);
  assert.deepEqual(landed?.doc.items, [{ ...entryRefItem("a", "new"), label: "Concurrent label", children: undefined }, { id: "added", label: "Contact", target: { kind: "url", href: "/contact" }, children: undefined }]);
  const recorded = await deps.changeSets.findById({ workspaceId: WORKSPACE_ID, id: result.changeSetIds[0] });
  assert.deepEqual(recorded?.items[0].inversePayload, { items: [{ ...entryRefItem("a", "old"), label: "Concurrent label" }, { id: "added", label: "Contact", target: { kind: "url", href: "/contact" } }] });
});


test("referencesTo returns no holders without a menu port", async () => {
  assert.deepEqual(await contributeMenusPublish().build(makePublishDeps({})).referencesTo!(["old"]), []);
});

for (const missing of ["menu", "changeSets", "authorize", "outbox"] as const) {
  test(`repointReferences refuses a missing ${missing} dependency before changing menus`, async () => {
    const row = menuRow({ id: "missing-deps", doc: { type: "menu", version: 1, items: [entryRefItem("a", "old")] } });
    const repo = new InMemoryMenuRepo({}, { initialRows: [row] });
    const wired = makeRepointDeps({ menuRepo: repo });
    const deps: PublishContentDeps = missing === "menu" ? { ...wired, ports: {} } : { ...wired, [missing]: undefined };
    await assert.rejects(contributeMenusPublish().build(deps).repointReferences!({
      replacements: [{ entityType: "post", oldId: "old", newId: "new" }], skipIds: new Set(), principalId: "op", runId: "run",
    }), { message: "publish-content: menu.repointReferences() requires PublishContentDeps.ports.menu.repo, .changeSets, .authorize and .outbox — wire them from the real apply-loop composition root (features/publish-content/apply-loop.ts)." });
    assert.deepEqual(await repo.findById({ workspaceId: WORKSPACE_ID, id: row.id }), row);
  });
}

for (const outcome of ["removed", "already-repaired"] as const) {
  test(`repointReferences skips a menu ${outcome} after its list snapshot`, async () => {
    const row = menuRow({ id: "changed-since-list", doc: { type: "menu", version: 1, items: [entryRefItem("a", "old")] } });
    const repo = new InMemoryMenuRepo({}, { initialRows: [row] });
    const list = repo.list.bind(repo);
    repo.list = async request => {
      const snapshot = await list(request);
      if (outcome === "removed") await repo.remove({ workspaceId: WORKSPACE_ID, id: row.id });
      else await repo.save({ ...row, version: 2, doc: { ...row.doc, items: [entryRefItem("a", "new")] } });
      return snapshot;
    };
    const deps = makeRepointDeps({ menuRepo: repo });
    assert.deepEqual(await contributeMenusPublish().build(deps).repointReferences!({
      replacements: [{ entityType: "post", oldId: "old", newId: "new" }], skipIds: new Set(), principalId: "op", runId: "run",
    }), { changeSetIds: [], linksUpdated: 0, notUpdated: [] });
    const stored = await repo.findById({ workspaceId: WORKSPACE_ID, id: row.id });
    if (outcome === "removed") assert.equal(stored, null);
    else assert.deepEqual(stored, { ...row, version: 2, doc: { ...row.doc, items: [entryRefItem("a", "new")] } });
    assert.deepEqual(await deps.outbox!.claimPending({ batchSize: 10, nowIso: "2026-09-24T00:00:00.000Z" }), []);
  });
}

test("apply refuses a missing outbox before writing a menu", async () => {
  const repo = new InMemoryMenuRepo({});
  const deps = { ...makePublishDeps({ menuRepo: repo, navLocationBindingRepo: new InMemoryNavLocationBindingRepo({}) }), outbox: undefined };
  await assert.rejects(contributeMenusPublish().build(deps).apply({
    entity: packedEntity("incoming", menuState()), expectedVersion: undefined, principalId: "op", idempotencyKey: "missing-outbox",
  }), /menu\.apply\(\) requires PublishContentDeps\.outbox/);
  assert.deepEqual(await repo.list({ workspaceId: WORKSPACE_ID }), []);
});

test("apply defaults omitted locations to an empty list", async () => {
  const repo = new InMemoryMenuRepo({});
  const deps = makePublishDeps({ menuRepo: repo, navLocationBindingRepo: new InMemoryNavLocationBindingRepo({}) });
  const { locations: _locations, ...state } = menuState();
  await contributeMenusPublish().build(deps).apply({
    entity: packedEntity("incoming", state), expectedVersion: undefined, principalId: "op", idempotencyKey: "no-locations",
  });
  assert.deepEqual((await repo.findById({ workspaceId: WORKSPACE_ID, id: "incoming" }))?.locations, []);
});

test("precheck reports a non-Error thrown while reading the doc as its string form", async () => {
  const deps = makePublishDeps({ menuRepo: new InMemoryMenuRepo({}), navLocationBindingRepo: new InMemoryNavLocationBindingRepo({}) });
  const doc = { type: "menu", version: 1, get items(): never { throw "items unreadable"; } };
  assert.equal(await contributeMenusPublish().build(deps).precheck(packedEntity("incoming", menuState({ doc: doc as unknown as NavMenuDoc }))), "items unreadable");
});

const REPOINT_OLD_TO_NEW = { replacements: [{ entityType: "post", oldId: "post-about", newId: "post-about-new" }], skipIds: new Set<string>(), principalId: "operator-1", runId: "run-1" };

test("repointReferences gives a menu exactly two attempts when every write conflicts", async () => {
  const menuRepo = new VersionRacingMenuRepo([
    menuRow({ id: "menu-header", ...menuState({ title: "Header", doc: { type: "menu", version: 1, items: [entryRefItem("item-1", "post-about")] } }) }),
  ]);
  let authorizations = 0;
  const deps = makeRepointDeps({ menuRepo, authorize: async () => ({ allowed: ++authorizations > 0, reason: "test" }) });
  await contributeMenusPublish().build(deps).repointReferences!(REPOINT_OLD_TO_NEW);
  // executeCommand authorizes once per attempt, so this counts attempts.
  assert.equal(authorizations, 2);
});

test("repointReferences reports the grant line when the retry after a conflict is denied", async () => {
  const menuRepo = new VersionRacingMenuRepo([
    menuRow({ id: "menu-header", ...menuState({ title: "Header", doc: { type: "menu", version: 1, items: [entryRefItem("item-1", "post-about")] } }) }),
  ]);
  let authorizations = 0;
  const deps = makeRepointDeps({ menuRepo, authorize: async () => ({ allowed: ++authorizations === 1, reason: "second attempt denied" }) });
  const result = await contributeMenusPublish().build(deps).repointReferences!(REPOINT_OLD_TO_NEW);
  assert.equal(authorizations, 2);
  assert.deepEqual(result, { changeSetIds: [], linksUpdated: 0, notUpdated: ["Menu links were not updated: this publishing grant doesn't cover menus."] });
});
