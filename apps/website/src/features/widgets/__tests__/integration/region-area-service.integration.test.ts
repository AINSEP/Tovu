import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { parseWidgetAreaPayload } from "@jini-ai/cms/widgets";
import { WidgetAreaConflictError, WidgetInstanceNotFoundError } from "@jini-ai/cms/widgets";
import { createWidgetInstance, type WidgetWriteServiceDeps } from "@jini-ai/cms/widgets";
import { InMemoryWidgetRegionBindingRepo } from "@jini-ai/cms/widgets";
import { bindWidgetArea, mutateWidgetAreaPlacements, reconcileWidgetRegionBindings, type RegionAreaServiceDeps } from "@jini-ai/cms/widgets";
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
  return { host: buildWidgetHostPorts({}, {}),
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
    deps: deps,
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text", title, config: { body: title } },
  });
  return instance.id;
}

test("AC-09/REQ-15/INV-03: reordering a region's placements is one atomic, versioned write", async () => {
  const deps = makeDeps();
  const { areaEntry: empty } = await bindWidgetArea({ deps: deps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } });
  const widgetSocial = await seedWidget(deps, "Social links");
  const widgetContact = await seedWidget(deps, "Contact form");
  const originalPlacements = [
    { placementId: "plc-1", widgetEntryId: widgetSocial, enabled: true },
    { placementId: "plc-2", widgetEntryId: widgetContact, enabled: false },
  ];
  const { areaEntry: seeded } = await mutateWidgetAreaPlacements({ deps: deps, input: {
    workspaceId: WORKSPACE_ID, actor: ACTOR, areaEntryId: empty.id, baseVersion: empty.version, placements: originalPlacements,
  } });
  const refsBefore = await deps.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: seeded.id });
  assert.equal(refsBefore.length, 2);

  const { areaEntry: updated } = await mutateWidgetAreaPlacements({
    deps: deps,
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
  assert.deepEqual(parseWidgetAreaPayload({ fieldsJson: persisted.fieldsJson }).doc.placements, [originalPlacements[1], originalPlacements[0]]);
  assert.deepEqual((await deps.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: seeded.id })).sort((a, b) => a.targetId.localeCompare(b.targetId)), [
    { workspaceId: WORKSPACE_ID, sourceEntryId: seeded.id, sourceKind: "widget-area-placement", fieldPath: "bodyJson.placements[1]", targetKind: "entry", targetId: widgetSocial },
    { workspaceId: WORKSPACE_ID, sourceEntryId: seeded.id, sourceKind: "widget-area-placement", fieldPath: "bodyJson.placements[0]", targetKind: "entry", targetId: widgetContact },
  ].sort((a, b) => a.targetId.localeCompare(b.targetId)));
});

