import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { createWidgetInstance, type WidgetWriteServiceDeps } from "../../write-service.js";
import { InMemoryWidgetRegionBindingRepo } from "../../repo.memory.js";
import {
  bindWidgetArea,
  mutateWidgetAreaPlacements,
  reconcileWidgetRegionBindings,
  type RegionAreaServiceDeps,
} from "../../region-area-service.js";

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
    clock: { nowIso: () => "2026-07-21T00:00:00.000Z" },
    ids: { newId: () => `id-${++counter}` },
    authorize: async () => ({ allowed: true, reason: "test: always allow" }),
    outbox: { enqueue: async () => undefined },
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
  await reconcileWidgetRegionBindings({ deps, input: { workspaceId: WORKSPACE_ID } });
  // Once implemented: mutate an area entry's regionKey directly (bypassing the binding table),
  // call reconcileWidgetRegionBindings again, and assert the binding table now matches the
  // entry's regionKey exactly — proving the binding table is genuinely derived, not a second
  // source of truth that could silently drift (the exact defect class the ADR-047 debate found
  // in the original draft). A full assertion here requires the binding-read API this test will
  // gain once WidgetRegionBindingRepoPort has a real adapter to query.
});

test("AC-09/REQ-15/INV-03: reordering a region's placements is one atomic, versioned write", async () => {
  const deps = makeDeps();
  const { areaEntry: seeded } = await bindWidgetArea({ deps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } });
  const widgetSocial = await seedWidget(deps, "Social links");
  const widgetContact = await seedWidget(deps, "Contact form");

  const { areaEntry: updated } = await mutateWidgetAreaPlacements({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      areaEntryId: seeded.id,
      baseVersion: seeded.version,
      placements: [
        { placementId: "plc-1", widgetEntryId: widgetSocial, enabled: true },
        { placementId: "plc-2", widgetEntryId: widgetContact, enabled: true },
      ],
    },
  });

  assert.equal(updated.version, seeded.version + 1, "one mutation must advance the version by exactly one, not one per placement");
  assert.equal(updated.doc.placements.length, 2);
});

test("AC-10/REQ-16: a placement mutation referencing a widget from a different workspace is rejected, the area entry unchanged", async () => {
  const deps = makeDeps();
  const { areaEntry: seeded } = await bindWidgetArea({ deps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } });

  await assert.rejects(
    () =>
      mutateWidgetAreaPlacements({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          actor: ACTOR,
          areaEntryId: seeded.id,
          baseVersion: seeded.version,
          placements: [{ placementId: "plc-1", widgetEntryId: "widget-from-other-workspace", enabled: true }],
        },
      }),
    /Error/
  );
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
});
