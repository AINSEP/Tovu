import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRefsRepo } from "#src/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "#src/features/content-types/repo.memory";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { bindWidgetArea, mutateWidgetAreaPlacements, type RegionAreaServiceDeps } from "../../region-area-service";
import { InMemoryWidgetRegionBindingRepo } from "../../repo.memory";
import {
  createWidgetInstance,
  purgeWidgetInstance,
  trashWidgetInstance,
  updateWidgetInstance,
  type WidgetWriteServiceDeps,
} from "../../write-service";

/**
 * @file C-005 widget-instance CRUD — SPEC-043 REQ-01..06/42/43, AC-01..04/29, INV-01/09.
 *
 * Call-site note (Programmer stage): the stub-era functions took flat input objects; the real
 * implementation follows this codebase's actual `{ deps, input }` convention (see
 * `features/entries/write-service.ts`'s `createEntry`/`updateEntry`), since real infrastructure
 * (repos/clock/ids/authorize/outbox) has to come from somewhere. This suite was updated
 * mechanically for that shape only — every assertion below is unchanged from the certified
 * stub-era version. Real in-memory adapters back every call (`InMemoryEntryRepo`,
 * `InMemoryContentTypeRepo`, `InMemoryEntryRefsRepo`) — no mocking of the chokepoint itself, per
 * Constitution Article V (Integration-First Testing).
 */

const WORKSPACE_ID = "ws-1";
const ACTOR = { principalId: "user-1" };

function makeDeps(): WidgetWriteServiceDeps {
  let counter = 0;
  return {
    entryRepo: new InMemoryEntryRepo(),
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    clock: { nowIso: () => "2026-07-21T00:00:00.000Z" },
    ids: { newId: () => `id-${++counter}` },
    authorize: async () => ({ allowed: true, reason: "test: always allow" }),
    outbox: { enqueue: async () => undefined },
  };
}

/** Same underlying adapters as `deps`, extended with a bindingRepo — so a widget created via
 * `write-service.ts` and a widget placed via `region-area-service.ts` see the same state. */
function makeRegionDeps(deps: WidgetWriteServiceDeps): RegionAreaServiceDeps {
  return { ...deps, bindingRepo: new InMemoryWidgetRegionBindingRepo() };
}

test("AC-01/REQ-01: creating a text widget instance with valid config succeeds with status active", async () => {
  const { instance } = await createWidgetInstance({
    deps: makeDeps(),
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetType: "text",
      title: "Footer copyright notice",
      config: { body: "© 2026 Example Co." },
    },
  });

  assert.equal(instance.status, "active");
  assert.equal(instance.title, "Footer copyright notice");
  assert.deepEqual(instance.config, { body: "© 2026 Example Co." });
});

test("AC-02/REQ-02: creating a recent-entries widget with maxItems above the registered clamp is rejected, nothing persisted", async () => {
  await assert.rejects(
    () =>
      createWidgetInstance({
        deps: makeDeps(),
        input: {
          workspaceId: WORKSPACE_ID,
          actor: ACTOR,
          widgetType: "recent-entries",
          title: "Latest posts",
          config: { maxItems: 500 }, // registry.ts clamps this type's maxItems to 20
        },
      }),
    /WidgetConfigValidationError/
  );
});

test("AC-03/REQ-03: creating a widget of an unregistered type is rejected, nothing persisted", async () => {
  await assert.rejects(
    () =>
      createWidgetInstance({
        deps: makeDeps(),
        input: {
          workspaceId: WORKSPACE_ID,
          actor: ACTOR,
          // @ts-expect-error — deliberately an unregistered type key, proving runtime rejection.
          widgetType: "carousel",
          title: "Carousel",
          config: {},
        },
      }),
    /WidgetTypeUnregisteredError/
  );
});

test("AC-04/REQ-06: two concurrent updates against the same baseVersion — exactly one succeeds, the other gets a typed conflict", async () => {
  const deps = makeDeps();
  const { instance: created } = await createWidgetInstance({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetType: "text",
      title: "Sidebar note",
      config: { body: "original" },
    },
  });

  const [a, b] = await Promise.allSettled([
    updateWidgetInstance({
      deps,
      input: {
        workspaceId: WORKSPACE_ID,
        actor: ACTOR,
        widgetInstanceId: created.id,
        baseVersion: created.version,
        config: { body: "updated copy A" },
      },
    }),
    updateWidgetInstance({
      deps,
      input: {
        workspaceId: WORKSPACE_ID,
        actor: ACTOR,
        widgetInstanceId: created.id,
        baseVersion: created.version,
        config: { body: "updated copy B" },
      },
    }),
  ]);

  const settled = [a, b];
  const fulfilled = settled.filter((r) => r.status === "fulfilled");
  const rejected = settled.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "exactly one concurrent update must succeed");
  assert.equal(rejected.length, 1, "exactly one concurrent update must be rejected as a version conflict");
});

test("AC-29/REQ-42: force-purging a widget instance still referenced by a placement is rejected with the referencing list, unless force", async () => {
  // Corrected 2026-07-21: the original version of this test called `trashWidgetInstance` (which
  // ADR-047 §7's deletion ladder makes unconditional/soft, and the implementation outline's own
  // Contract Map already specified as such) and never created a placement to be "referenced" by —
  // both were authoring bugs in the test, not in the implementation, confirmed against
  // feature.spec.md REQ-42/43 and the outline's C-005 invariant note ("purgeWidgetInstance without
  // force must check entry_refs... the sole gate for REQ-42"). Fixed to exercise the actual
  // REQ-42-gated operation (`purgeWidgetInstance` without force) against a genuinely referenced
  // instance (placed into a live region).
  const deps = makeDeps();
  const { instance: created } = await createWidgetInstance({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetType: "text",
      title: "Footer note",
      config: { body: "text" },
    },
  });

  const regionDeps = makeRegionDeps(deps);
  const { areaEntry } = await bindWidgetArea({ deps: regionDeps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } });
  await mutateWidgetAreaPlacements({
    deps: regionDeps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      areaEntryId: areaEntry.id,
      baseVersion: areaEntry.version,
      placements: [{ placementId: "plc-1", widgetEntryId: created.id, enabled: true }],
    },
  });

  await assert.rejects(
    () =>
      purgeWidgetInstance({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          actor: ACTOR,
          widgetInstanceId: created.id,
          force: false,
        },
      }),
    /WidgetReferencedError/
  );
});

test("REQ-42/EC-07: trashing (soft-delete) a referenced widget instance is unconditional — trash is not reference-gated, only force-purge is (ADR-047 §7)", async () => {
  const deps = makeDeps();
  const { instance: created } = await createWidgetInstance({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetType: "text",
      title: "Footer note",
      config: { body: "text" },
    },
  });

  const regionDeps = makeRegionDeps(deps);
  const { areaEntry } = await bindWidgetArea({ deps: regionDeps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } });
  await mutateWidgetAreaPlacements({
    deps: regionDeps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      areaEntryId: areaEntry.id,
      baseVersion: areaEntry.version,
      placements: [{ placementId: "plc-1", widgetEntryId: created.id, enabled: true }],
    },
  });

  const { instance: trashed } = await trashWidgetInstance({
    deps,
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id },
  });
  assert.equal(trashed.status, "trash");
});

test("REQ-43: force-purging a referenced widget instance succeeds and flags the resulting dangling references rather than silently dropping them", async () => {
  const deps = makeDeps();
  const { instance: created } = await createWidgetInstance({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetType: "text",
      title: "Footer note",
      config: { body: "text" },
    },
  });

  await purgeWidgetInstance({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetInstanceId: created.id,
      force: true,
    },
  });
  // Once implemented: assert every entry_refs row that pointed at this instance is now
  // flagged/queryable as dangling (feature.spec.md EC-06) — requires the entry_refs read API,
  // asserted more fully in extractor.integration.test.ts.
});

// ---------------------------------------------------------------------------
// External /audit-work finding (2026-07-21, ADR-047) — purge must retract its OWN outgoing
// entry_refs (config ref-typed fields, e.g. a menu widget's menuRef); trash must NOT.
// ---------------------------------------------------------------------------

test("audit fix: force-purging a widget instance with an outgoing ref-typed config field (menuRef) retracts that row from entry_refs — the purged instance's own refs must not survive it", async () => {
  const deps = makeDeps();
  const { instance: created } = await createWidgetInstance({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetType: "menu",
      title: "Footer menu widget",
      config: { menuRef: "some-menu-id" },
    },
  });

  const refsBeforePurge = await deps.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: created.id });
  assert.ok(refsBeforePurge.length > 0, "sanity check: the menuRef must have been extracted on create");

  await purgeWidgetInstance({
    deps,
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id, force: true },
  });

  const refsAfterPurge = await deps.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: created.id });
  assert.deepEqual(refsAfterPurge, [], "a force-purged instance's own outgoing refs must be retracted, not left stale");
});

test("audit fix: trashing (not purging) a widget instance with an outgoing ref-typed config field leaves entry_refs untouched — trash is reversible, its refs must survive a later restore", async () => {
  const deps = makeDeps();
  const { instance: created } = await createWidgetInstance({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetType: "menu",
      title: "Footer menu widget",
      config: { menuRef: "some-menu-id" },
    },
  });

  const refsBeforeTrash = await deps.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: created.id });
  assert.ok(refsBeforeTrash.length > 0);

  await trashWidgetInstance({
    deps,
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id },
  });

  const refsAfterTrash = await deps.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: created.id });
  assert.deepEqual(refsAfterTrash, refsBeforeTrash, "trash must not retract refs — it's reversible, unlike purge");
});
