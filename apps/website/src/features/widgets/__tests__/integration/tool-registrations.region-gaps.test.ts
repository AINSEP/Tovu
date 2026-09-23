import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { memoryWidgetTrash } from "../support/memory-widget-trash.js";
import { InMemoryPostRepo } from "#src/features/post/index";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "#src/contracts/core/tool-surface-exchanges";
import type { UIResource } from "#src/assistant/index";
import { PRE_AUTHORIZED } from "../../authorize-helper.js";
import { areaDocWithPlacements, buildWidgetAreaFieldsJson, buildWidgetInstanceFieldsJson, parseWidgetAreaPayload, parseWidgetInstancePayload } from "../../entry-payload.js";
import { InMemoryWidgetRegionBindingRepo } from "../../repo.memory.js";
import { buildWidgetsRegistrations, type WidgetsToolDeps } from "../../tool-registrations.js";
import { WIDGET_AREA_CONTENT_TYPE } from "../../types.js";

/**
 * @file Closes the region/placement request-shape and defensive-lookup gaps that are unique to
 * `tool-registrations.ts` itself — logic that does not live in `region-area-service.ts` or the
 * admin HTTP routes, so it is not exercised by `region-area-service.integration.test.ts` or
 * `admin-widgets-routes.test.ts` even though both touch adjacent code:
 *
 * - `widgets_set_region_placements`' own request-shape validation (malformed placement objects,
 *   non-boolean `enabled`, and same-request duplicate `placementId`s) runs BEFORE
 *   `mutateWidgetAreaPlacements` is ever called — it is this file's own loop (tool-registrations.ts,
 *   `seenIds`), not the domain function's REQ-16 widget-existence check.
 * - `widgets_list_regions`' `placementCount` falls back to `0` when a binding's `areaEntryId` no
 *   longer resolves to a real entry — a defensive branch, not a happy-path one.
 * - `resolveWidgetPlacementView`'s `broken` flag (surfaced via `widgets_get_region`) has three
 *   independent ways to become `true`: the referenced widget is gone, it exists but is the wrong
 *   entry type, or it exists but its own payload status is not `active` (a legacy `purged`/`trash`
 *   status an older build wrote; the Trash itself hides the entry, which is the "gone" case).
 *
 * Real in-memory adapters throughout, mirroring `tool-registrations.widgets-contracts.test.ts`'s own
 * discipline (Constitution Article V) — this file additionally imports `PRE_AUTHORIZED` rather than
 * a hand-rolled allow-everything stub, since the exact authorize() shape does not matter for any
 * assertion here.
 */

const WORKSPACE_ID = "ws-region-gaps";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-08-20T00:00:00.000Z";

function makeDeps(): WidgetsToolDeps {
  let counter = 0;
  const widgetTrash = memoryWidgetTrash();
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as WidgetsToolDeps["outbox"],
    entryRepo: widgetTrash.entryRepo,
    removeWidget: widgetTrash.remove,
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    widgetBindingRepo: new InMemoryWidgetRegionBindingRepo(),
    postRepo: new InMemoryPostRepo(),
    changeSets: new InMemoryChangeSetRepo(),
    pluginBeforeSaveHook: undefined as unknown as WidgetsToolDeps["pluginBeforeSaveHook"],
    authorize: PRE_AUTHORIZED,
  };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function wired(toolId: string, deps: WidgetsToolDeps): ToolRegistration {
  const found = buildWidgetsRegistrations(deps).find((r) => r.descriptor.id === toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

/**
 * `widgets_trash_instance` now raises a confirmation dialog (2026-09-08, ADS-memory/reports/
 * 2026-09-08-delete-confirmation-build.md) rather than trashing synchronously — this helper raises
 * it and immediately confirms, standing in for the human's click, for tests (like this file's own)
 * that only need a trashed instance to exist and are not themselves certifying the confirmation gate
 * (that is `widgets/__tests__/agent-tools.trash-confirmation.test.ts`'s job).
 */
async function trashInstance(deps: WidgetsToolDeps, widgetInstanceId: string): Promise<unknown> {
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = buildWidgetsRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "widgets_trash_instance");
  assert.ok(trashTool, "expected 'widgets_trash_instance' to be wired");
  const emitted: unknown[] = [];
  const pending = trashTool.handler({
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: { widgetInstanceId },
    signal: new AbortController().signal,
    emitSurface: async (s) => void emitted.push(s),
  });
  await new Promise((resolve) => setImmediate(resolve));
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id");
  surfaceExchanges.deliver({ exchangeId: match[1]!, toolId: "widgets_trash_instance", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  return pending;
}

async function createInstance(deps: WidgetsToolDeps, title = "Note"): Promise<{ id: string; version: number }> {
  const out = (await wired("widgets_create_instance", deps).handler(
    executionContext({ widgetType: "text", title, config: { body: "hi" } })
  )) as { instance: { id: string; version: number } };
  return out.instance;
}

async function bindRegion(deps: WidgetsToolDeps, regionKey = "footer"): Promise<{ areaEntryId: string; version: number }> {
  const out = (await wired("widgets_bind_region", deps).handler(executionContext({ regionKey }))) as {
    area: { id: string; version: number };
  };
  return { areaEntryId: out.area.id, version: out.area.version };
}

/**
 * Writes a placement into an area entry's `doc` DIRECTLY via `entryRepo.save`, bypassing
 * `mutateWidgetAreaPlacements` (and therefore REQ-16's widget-existence/type check) entirely.
 *
 * This is deliberate, not a workaround: REQ-16 already refuses a dangling or wrong-type
 * `widgetEntryId` at WRITE time (confirmed empirically — attempting this through
 * `widgets_set_region_placements` throws `WidgetInstanceNotFoundError` before anything is stored),
 * so `resolveWidgetPlacementView`'s "missing widget" / "wrong type" `broken` branches can only ever
 * be reached by a row that became invalid AFTER a valid placement (a hard delete outside the normal
 * soft-delete write paths, or an unrelated write corrupting the row) — the same class of defensive
 * gap the file's own "Fable adversarial-review fix" tests elsewhere in this suite target.
 */
async function injectPlacementDirectly(
  deps: WidgetsToolDeps,
  areaEntryId: string,
  placement: { placementId: string; widgetEntryId: string; enabled: boolean }
): Promise<void> {
  const areaEntry = await deps.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: areaEntryId });
  assert.ok(areaEntry, "expected the area entry to already exist");
  const payload = parseWidgetAreaPayload(areaEntry.fieldsJson);
  const nextDoc = areaDocWithPlacements({ doc: payload.doc, placements: [placement] });
  await deps.entryRepo.save({
    ...areaEntry,
    fieldsJson: buildWidgetAreaFieldsJson({ regionKey: payload.regionKey, doc: nextDoc }),
    version: areaEntry.version + 1,
  });
}

// ---------------------------------------------------------------------------
// widgets_set_region_placements: this file's OWN request-shape validation
// ---------------------------------------------------------------------------

test("widgets_set_region_placements: two placements in the SAME payload sharing a placementId are rejected before any write, with the offending id named", async () => {
  const deps = makeDeps();
  const widget = await createInstance(deps);
  const region = await bindRegion(deps);

  await assert.rejects(
    wired("widgets_set_region_placements", deps).handler(
      executionContext({
        regionKey: "footer",
        baseVersion: region.version,
        placements: [
          { placementId: "dup-1", widgetEntryId: widget.id, enabled: true },
          { placementId: "dup-1", widgetEntryId: widget.id, enabled: false },
        ],
      })
    ),
    (err: unknown) => err instanceof Error && err.message === "duplicate placementId 'dup-1'"
  );
});

test("widgets_set_region_placements: a non-object placement entry is rejected with the exact 'each placement must be an object' message", async () => {
  const deps = makeDeps();
  await bindRegion(deps);

  await assert.rejects(
    wired("widgets_set_region_placements", deps).handler(
      executionContext({ regionKey: "footer", baseVersion: 1, placements: ["not-an-object"] })
    ),
    (err: unknown) => err instanceof Error && err.message === "each placement must be an object"
  );
});

test("widgets_set_region_placements: a placement with a non-boolean 'enabled' is rejected with the exact message", async () => {
  const deps = makeDeps();
  const widget = await createInstance(deps);
  await bindRegion(deps);

  await assert.rejects(
    wired("widgets_set_region_placements", deps).handler(
      executionContext({
        regionKey: "footer",
        baseVersion: 1,
        placements: [{ placementId: "p-1", widgetEntryId: widget.id, enabled: "yes" }],
      })
    ),
    (err: unknown) => err instanceof Error && err.message === "each placement's 'enabled' must be a boolean"
  );
});

test("widgets_set_region_placements: an omitted placementId is auto-assigned via idGen rather than rejected", async () => {
  const deps = makeDeps();
  const widget = await createInstance(deps);
  const region = await bindRegion(deps);

  const out = (await wired("widgets_set_region_placements", deps).handler(
    executionContext({
      regionKey: "footer",
      baseVersion: region.version,
      placements: [{ widgetEntryId: widget.id, enabled: true }],
    })
  )) as { area: { version: number } };
  assert.equal(out.area.version, region.version + 1);
});

test("widgets_set_region_placements: an unbound regionKey is rejected with WidgetAreaNotFoundError, distinct from the malformed-shape errors above", async () => {
  const deps = makeDeps();
  await assert.rejects(
    wired("widgets_set_region_placements", deps).handler(
      executionContext({ regionKey: "sidebar", baseVersion: 1, placements: [] })
    ),
    // Reclassified by `toModelFacingWidgetsError` (`tool-registrations.ts`) so this typed not-found
    // reaches the model as a 400 rather than a redacted 500 — see that function's doc comment.
    (err: unknown) => err instanceof Error && err.name === "ToolInputError" && /^WIDGETS_AREA_NOT_FOUND: region 'sidebar' is not bound$/.test(err.message)
  );
});

// ---------------------------------------------------------------------------
// widgets_list_regions: placementCount's defensive fallback
// ---------------------------------------------------------------------------

test("widgets_list_regions: a binding whose areaEntryId no longer resolves to a real entry reports placementCount 0 rather than throwing", async () => {
  const deps = makeDeps();
  // A binding pointing at an area entry id that was never actually created — simulates the area
  // row having been deleted out from under an otherwise-live binding.
  deps.widgetBindingRepo = new InMemoryWidgetRegionBindingRepo([
    { workspaceId: WORKSPACE_ID, regionKey: "footer", areaEntryId: "dangling-area-id", updatedAt: NOW },
  ]);

  const out = (await wired("widgets_list_regions", deps).handler(executionContext({}))) as {
    regions: Array<{ regionKey: string; placementCount: number }>;
  };
  assert.equal(out.regions.length, 1);
  assert.equal(out.regions[0].regionKey, "footer");
  assert.equal(out.regions[0].placementCount, 0);
});

test("widgets_list_regions: a real, bound area with placements reports its actual placementCount, not the fallback", async () => {
  const deps = makeDeps();
  const widget = await createInstance(deps);
  const region = await bindRegion(deps);
  await wired("widgets_set_region_placements", deps).handler(
    executionContext({
      regionKey: "footer",
      baseVersion: region.version,
      placements: [{ placementId: "p-1", widgetEntryId: widget.id, enabled: true }],
    })
  );

  const out = (await wired("widgets_list_regions", deps).handler(executionContext({}))) as {
    regions: Array<{ regionKey: string; placementCount: number }>;
  };
  assert.equal(out.regions[0].placementCount, 1);
});

// ---------------------------------------------------------------------------
// resolveWidgetPlacementView (via widgets_get_region): the three independent ways `broken` becomes true
// ---------------------------------------------------------------------------

test("widgets_get_region: a placement whose widgetEntryId no longer resolves to any entry resolves broken:true with null title/type", async () => {
  const deps = makeDeps();
  const region = await bindRegion(deps);
  // REQ-16 refuses a dangling widgetEntryId at write time (see injectPlacementDirectly's own doc),
  // so this bypasses the tool's write path entirely to simulate the row having gone missing AFTER
  // a valid placement.
  await injectPlacementDirectly(deps, region.areaEntryId, { placementId: "p-missing", widgetEntryId: "does-not-exist", enabled: true });

  const out = (await wired("widgets_get_region", deps).handler(executionContext({ regionKey: "footer" }))) as {
    placements: Array<{ placementId: string; widgetTitle: string | null; widgetType: string | null; broken: boolean }>;
  };
  assert.deepEqual(out.placements, [
    { placementId: "p-missing", widgetEntryId: "does-not-exist", enabled: true, widgetTitle: null, widgetType: null, broken: true },
  ]);
});

test("widgets_get_region: a placement referencing an entry of the WRONG type (a widget_area, not a widget instance) resolves broken:true and widgetType:null, even though the entry itself resolves (title still surfaces from it)", async () => {
  const deps = makeDeps();
  const region = await bindRegion(deps);
  // The area entry itself is a real row of a real type — just not `WIDGET_CONTENT_TYPE` — proving
  // the type check, not merely existence, gates `widgetType`/`broken`; `widgetTitle` comes from the
  // resolved entry regardless of type (`widget?.title`), so it is NOT null here. Injected directly
  // for the same REQ-16 reason as the "missing" case above.
  const areaEntry = await deps.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: region.areaEntryId });
  assert.ok(areaEntry);
  assert.equal(areaEntry.type, WIDGET_AREA_CONTENT_TYPE);
  await injectPlacementDirectly(deps, region.areaEntryId, { placementId: "p-wrong-type", widgetEntryId: region.areaEntryId, enabled: true });

  const out = (await wired("widgets_get_region", deps).handler(executionContext({ regionKey: "footer" }))) as {
    placements: Array<{ broken: boolean; widgetTitle: string | null; widgetType: string | null }>;
  };
  assert.equal(out.placements[0].broken, true);
  assert.equal(out.placements[0].widgetType, null);
  assert.equal(out.placements[0].widgetTitle, areaEntry.title);
});

test("widgets_get_region: a trashed widget instance resolves broken:true with no title/type (the Trash hides the entry from every read)", async () => {
  const deps = makeDeps();
  const widget = await createInstance(deps, "Trashed Note");
  const region = await bindRegion(deps);
  await wired("widgets_set_region_placements", deps).handler(
    executionContext({
      regionKey: "footer",
      baseVersion: region.version,
      placements: [{ placementId: "p-trashed", widgetEntryId: widget.id, enabled: true }],
    })
  );
  await trashInstance(deps, widget.id);

  const out = (await wired("widgets_get_region", deps).handler(executionContext({ regionKey: "footer" }))) as {
    placements: Array<{ broken: boolean; widgetTitle: string | null; widgetType: string | null }>;
  };
  assert.equal(out.placements[0].broken, true);
  // A trashed entry reads as missing (entries.deleted_at), so there is no title/type to surface;
  // the placement itself stays, ready for a restore.
  assert.equal(out.placements[0].widgetTitle, null);
  assert.equal(out.placements[0].widgetType, null);
});

test("widgets_get_region: a widget whose payload still carries a legacy non-active status resolves broken:true with its title/type surfaced", async () => {
  const deps = makeDeps();
  const widget = await createInstance(deps, "Legacy Purged Note");
  const region = await bindRegion(deps);
  await wired("widgets_set_region_placements", deps).handler(
    executionContext({
      regionKey: "footer",
      baseVersion: region.version,
      placements: [{ placementId: "p-legacy", widgetEntryId: widget.id, enabled: true }],
    })
  );
  // What an older build's "delete permanently" left behind: the row stays, its payload says purged.
  const entry = await deps.entryRepo.findById({ workspaceId: WORKSPACE_ID, id: widget.id });
  assert.ok(entry);
  const payload = parseWidgetInstancePayload(entry.fieldsJson);
  await deps.entryRepo.save({ ...entry, fieldsJson: buildWidgetInstanceFieldsJson({ ...payload, status: "purged" }), version: entry.version + 1 });

  const out = (await wired("widgets_get_region", deps).handler(executionContext({ regionKey: "footer" }))) as {
    placements: Array<{ broken: boolean; widgetTitle: string | null; widgetType: string | null }>;
  };
  assert.equal(out.placements[0].broken, true, "a non-active payload status alone must mark the placement broken");
  assert.equal(out.placements[0].widgetTitle, "Legacy Purged Note");
  assert.equal(out.placements[0].widgetType, "text");
});

test("widgets_get_region: a live, active placement resolves broken:false with its real title/type", async () => {
  const deps = makeDeps();
  const widget = await createInstance(deps, "Live Note");
  const region = await bindRegion(deps);
  await wired("widgets_set_region_placements", deps).handler(
    executionContext({
      regionKey: "footer",
      baseVersion: region.version,
      placements: [{ placementId: "p-live", widgetEntryId: widget.id, enabled: true }],
    })
  );

  const out = (await wired("widgets_get_region", deps).handler(executionContext({ regionKey: "footer" }))) as {
    placements: Array<{ broken: boolean; widgetTitle: string | null; widgetType: string | null }>;
  };
  assert.deepEqual(out.placements[0], { placementId: "p-live", widgetEntryId: widget.id, enabled: true, widgetTitle: "Live Note", widgetType: "text", broken: false });
});

test("widgets_get_region: an unbound regionKey is rejected with WidgetAreaNotFoundError", async () => {
  const deps = makeDeps();
  await assert.rejects(
    wired("widgets_get_region", deps).handler(executionContext({ regionKey: "nonexistent" })),
    // Reclassified by `toModelFacingWidgetsError` (`tool-registrations.ts`) — see the sibling
    // `widgets_set_region_placements` test above for why the name/message shape changed.
    (err: unknown) => err instanceof Error && err.name === "ToolInputError" && /^WIDGETS_AREA_NOT_FOUND: region 'nonexistent' is not bound$/.test(err.message)
  );
});
