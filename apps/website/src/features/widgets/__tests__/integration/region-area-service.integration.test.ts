import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { parseWidgetAreaPayload } from "../../entry-payload.js";
import { WidgetAreaConflictError, WidgetInstanceNotFoundError } from "../../errors.js";
import { createWidgetInstance, type WidgetWriteServiceDeps } from "../../write-service.js";
import { InMemoryWidgetRegionBindingRepo } from "../../repo.memory.js";
import {
  bindWidgetArea,
  mutateWidgetAreaPlacements,
  reconcileWidgetRegionBindings,
  type RegionAreaServiceDeps,
} from "../../region-area-service.js";
import { InMemoryOutbox } from "#src/contracts/core/events/index";

/**
 * @file C-006 `widget_area` region composition — SPEC-043 REQ-11..17, AC-06..11, INV-02/03.
 *
 * Call-site note (Programmer stage): restructured to this codebase's real `{ deps, input }`
 * convention (see `write-service.integration.test.ts`'s identical note) — every assertion below is
 * unchanged from the certified stub-era version. Written to mirror
 * `navigation/__tests__/reconcile.test.ts`'s C-009 test shape, since REQ-11/12 deliberately
 * structurally mirror `nav_location_bindings`/`reconcile.ts`.
 */

const WORKSPACE_ID = "ws-1";
const ACTOR = { principalId: "user-1" };

function makeDeps(): RegionAreaServiceDeps & WidgetWriteServiceDeps {
  let counter = 0;
  const entryRepo = new InMemoryEntryRepo();
  const contentTypeRepo = new InMemoryContentTypeRepo();
  const entryRefsRepo = new InMemoryEntryRefsRepo();
  const bindingRepo = new InMemoryWidgetRegionBindingRepo();
  return {
    entryRepo,
    contentTypeRepo,
    entryRefsRepo,
    bindingRepo,
    clock: { nowMs: () => Date.parse("2026-07-21T00:00:00.000Z") },
    ids: { newId: () => `id-${++counter}` },
    authorize: async () => ({ allowed: true, reason: "test: always allow" }),
    outbox: new InMemoryOutbox(),
  };
}

/** A live, non-trashed widget instance in `deps`' own store — for placement-reference tests. */
async function seedWidget(deps: WidgetWriteServiceDeps, title: string): Promise<string> {
  const { instance } = await createWidgetInstance({
    deps,
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text", title, config: { body: title } },
  });
  return instance.id;
}

test("AC-06/REQ-11/12: activating a theme with a footer region and no existing binding seeds exactly one widget_area entry and one binding row", async () => {
  const deps = makeDeps();
  const { areaEntry } = await bindWidgetArea({ deps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } });

  assert.equal(areaEntry.regionKey, "footer");
  assert.equal(areaEntry.workspaceId, WORKSPACE_ID);
  assert.deepEqual(areaEntry.doc.placements, []);
});

test("AC-07/INV-02: widget_region_bindings is always derivable, in full, from live widget_area entries alone", async () => {
  const deps = makeDeps();
  const footer = (await bindWidgetArea({ deps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } })).areaEntry;
  const sidebar = (await bindWidgetArea({ deps, input: { workspaceId: WORKSPACE_ID, regionKey: "sidebar" } })).areaEntry;
  await bindWidgetArea({ deps, input: { workspaceId: "other-workspace", regionKey: "footer" } });
  const foreign = await deps.bindingRepo.listByWorkspace({ workspaceId: "other-workspace" });
  await deps.bindingRepo.upsert({ workspaceId: WORKSPACE_ID, regionKey: "footer", areaEntryId: "wrong-area", updatedAt: "old" });
  await deps.bindingRepo.upsert({ workspaceId: WORKSPACE_ID, regionKey: "stale", areaEntryId: "missing-area", updatedAt: "old" });
  await deps.bindingRepo.markInactive({ workspaceId: WORKSPACE_ID, regionKey: "sidebar" });
  await reconcileWidgetRegionBindings({ deps, input: { workspaceId: WORKSPACE_ID } });
  assert.deepEqual((await deps.bindingRepo.listByWorkspace({ workspaceId: WORKSPACE_ID })).sort((a, b) => a.regionKey.localeCompare(b.regionKey)), [
    { workspaceId: WORKSPACE_ID, regionKey: "footer", areaEntryId: footer.id, updatedAt: "2026-07-21T00:00:00.000Z" },
    { workspaceId: WORKSPACE_ID, regionKey: "sidebar", areaEntryId: sidebar.id, updatedAt: "2026-07-21T00:00:00.000Z" },
  ]);
  assert.deepEqual(await deps.bindingRepo.listByWorkspace({ workspaceId: "other-workspace" }), foreign);
});

test("AC-09/REQ-15/INV-03: reordering a region's placements is one atomic, versioned write", async () => {
  const deps = makeDeps();
  const { areaEntry: empty } = await bindWidgetArea({ deps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } });
  const widgetSocial = await seedWidget(deps, "Social links");
  const widgetContact = await seedWidget(deps, "Contact form");
  const originalPlacements = [
    { placementId: "plc-1", widgetEntryId: widgetSocial, enabled: true },
    { placementId: "plc-2", widgetEntryId: widgetContact, enabled: false },
  ];
  const { areaEntry: seeded } = await mutateWidgetAreaPlacements({ deps, input: {
    workspaceId: WORKSPACE_ID, actor: ACTOR, areaEntryId: empty.id, baseVersion: empty.version, placements: originalPlacements,
  } });
  const refsBefore = await deps.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: seeded.id });
  assert.equal(refsBefore.length, 2);

  const { areaEntry: updated } = await mutateWidgetAreaPlacements({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      areaEntryId: seeded.id,
      baseVersion: seeded.version,
      placements: [originalPlacements[1]!, originalPlacements[0]!],
    },
  });

  assert.equal(updated.version, seeded.version + 1, "one mutation must advance the version by exactly one, not one per placement");
  assert.equal(updated.doc.placements.length, 2);
  assert.deepEqual(updated.doc.placements, [originalPlacements[1], originalPlacements[0]]);
  const persisted = await deps.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: seeded.id });
  assert.ok(persisted);
  assert.deepEqual(parseWidgetAreaPayload(persisted.fieldsJson).doc.placements, [originalPlacements[1], originalPlacements[0]]);
  assert.deepEqual((await deps.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: seeded.id })).sort((a, b) => a.targetId.localeCompare(b.targetId)), [
    { workspaceId: WORKSPACE_ID, sourceEntryId: seeded.id, sourceKind: "widget-area-placement", fieldPath: "bodyJson.placements[1]", targetKind: "entry", targetId: widgetSocial },
    { workspaceId: WORKSPACE_ID, sourceEntryId: seeded.id, sourceKind: "widget-area-placement", fieldPath: "bodyJson.placements[0]", targetKind: "entry", targetId: widgetContact },
  ].sort((a, b) => a.targetId.localeCompare(b.targetId)));
});

test("AC-10/REQ-16: a placement mutation referencing a widget from a different workspace is rejected, the area entry unchanged", async () => {
  const deps = makeDeps();
  const { areaEntry: seeded } = await bindWidgetArea({ deps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } });
  const { instance: foreign } = await createWidgetInstance({ deps, input: {
    workspaceId: "other-workspace", actor: ACTOR, widgetType: "text", title: "Foreign widget", config: { body: "foreign body" },
  } });
  assert.ok(await deps.entryRepo.findById({ workspaceId: "other-workspace", id: foreign.id }));
  const before = structuredClone(await deps.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: seeded.id }));
  const refsBefore = await deps.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: seeded.id });

  await assert.rejects(
    () =>
      mutateWidgetAreaPlacements({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          actor: ACTOR,
          areaEntryId: seeded.id,
          baseVersion: seeded.version,
          placements: [{ placementId: "plc-1", widgetEntryId: foreign.id, enabled: true }],
        },
      }),
    (error: unknown) => error instanceof WidgetInstanceNotFoundError && error.message.includes(foreign.id)
  );
  assert.deepEqual(await deps.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: seeded.id }), before);
  assert.deepEqual(await deps.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: seeded.id }), refsBefore);
});

test("EC-02/REQ-15: two concurrent reorders of the same region — one wins under OCC, the other must retry against the new version", async () => {
  const deps = makeDeps();
  const { areaEntry: seeded } = await bindWidgetArea({ deps, input: { workspaceId: WORKSPACE_ID, regionKey: "sidebar" } });
  const widgetA = await seedWidget(deps, "Widget A");
  const widgetB = await seedWidget(deps, "Widget B");

  const [a, b] = await Promise.allSettled([
    mutateWidgetAreaPlacements({
      deps,
      input: {
        workspaceId: WORKSPACE_ID,
        actor: ACTOR,
        areaEntryId: seeded.id,
        baseVersion: seeded.version,
        placements: [{ placementId: "plc-a", widgetEntryId: widgetA, enabled: true }],
      },
    }),
    mutateWidgetAreaPlacements({
      deps,
      input: {
        workspaceId: WORKSPACE_ID,
        actor: ACTOR,
        areaEntryId: seeded.id,
        baseVersion: seeded.version,
        placements: [{ placementId: "plc-b", widgetEntryId: widgetB, enabled: true }],
      },
    }),
  ]);

  const settled = [a, b];
  assert.equal(settled.filter((r) => r.status === "fulfilled").length, 1, "exactly one concurrent reorder must succeed");
  assert.equal(settled.filter((r) => r.status === "rejected").length, 1, "exactly one concurrent reorder must be rejected as a conflict — no silent last-writer-wins");
  const winner = settled.find((result) => result.status === "fulfilled")!;
  const loser = settled.find((result) => result.status === "rejected")!;
  assert.equal(winner.status, "fulfilled");
  assert.equal(loser.status, "rejected");
  if (winner.status !== "fulfilled" || loser.status !== "rejected") throw new Error("invalid settlement");
  assert.ok(loser.reason instanceof WidgetAreaConflictError);
  assert.equal(loser.reason.currentVersion, seeded.version + 1);
  const winningPlacements = a.status === "fulfilled"
    ? [{ placementId: "plc-a", widgetEntryId: widgetA, enabled: true }]
    : [{ placementId: "plc-b", widgetEntryId: widgetB, enabled: true }];
  const losingPlacements = a.status === "rejected"
    ? [{ placementId: "plc-a", widgetEntryId: widgetA, enabled: true }]
    : [{ placementId: "plc-b", widgetEntryId: widgetB, enabled: true }];
  const persisted = await deps.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: seeded.id });
  assert.ok(persisted);
  assert.deepEqual(parseWidgetAreaPayload(persisted.fieldsJson).doc.placements, winningPlacements);
  const retried = await mutateWidgetAreaPlacements({ deps, input: {
    workspaceId: WORKSPACE_ID, actor: ACTOR, areaEntryId: seeded.id, baseVersion: loser.reason.currentVersion, placements: losingPlacements,
  } });
  assert.equal(retried.areaEntry.version, seeded.version + 2);
  assert.deepEqual(parseWidgetAreaPayload((await deps.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: seeded.id }))!.fieldsJson).doc.placements, losingPlacements);
});
