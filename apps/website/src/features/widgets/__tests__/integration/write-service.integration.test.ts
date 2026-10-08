import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { buildWidgetInstanceFieldsJson, toWidgetInstanceEntry } from "@jini-ai/cms/widgets";
import { bindWidgetArea, mutateWidgetAreaPlacements, type RegionAreaServiceDeps } from "@jini-ai/cms/widgets";
import { InMemoryWidgetRegionBindingRepo } from "@jini-ai/cms/widgets";
import type { WidgetTypeKey } from "@jini-ai/cms/widgets";
import { createWidgetInstance, trashWidgetInstance, updateWidgetInstance, type WidgetTrashDeps } from "@jini-ai/cms/widgets";
import { WidgetForbiddenError, WidgetVersionConflictError } from "@jini-ai/cms/widgets";
import { WIDGET_CONTENT_TYPE } from "@jini-ai/cms/widgets";
import { memoryWidgetTrash } from "../support/memory-widget-trash.js";
import { InMemoryOutbox } from "#src/contracts/core/events/index";

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

function makeDeps(): WidgetTrashDeps {
  let counter = 0;
  const trash = memoryWidgetTrash();
  return { host: buildWidgetHostPorts({}, {}),
    entryRepo: trash.entryRepo,
    remove: trash.remove,
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    clock: { nowMs: () => Date.parse("2026-07-21T00:00:00.000Z") },
    ids: { newId: () => `id-${++counter}` },
    authorize: async () => ({ allowed: true, reason: "test: always allow" }),
    outbox: new InMemoryOutbox(),
  };
}

/** Same underlying adapters as `deps`, extended with a bindingRepo — so a widget created via
 * `Jini/packages/cms/src/widgets/write-service.ts` and a widget placed via `Jini/packages/cms/src/widgets/region-area-service.ts` see the same state. */
function makeRegionDeps(deps: WidgetTrashDeps): RegionAreaServiceDeps {
  return { ...deps, bindingRepo: new InMemoryWidgetRegionBindingRepo() };
}

// REQ-42/43 (superseded 2026-09-21, generic Trash): the reference-gated "purge" rung and its
// `force` variant are retired — a permanent delete is now only the Trash's purge, which is
// unconditional and deletes the widget's own outgoing refs (`features/trash/__tests__/
// widget-trash-flow.test.ts` covers it on real SQLite). The three tests that exercised
// `purgeWidgetInstance` were replaced by this one and that suite.

// ---------------------------------------------------------------------------
// External /audit-work finding (2026-07-21, ADR-047) — trash must NOT retract a widget's own
// outgoing entry_refs (the purge half now lives in the Trash; see the note above).
// ---------------------------------------------------------------------------

test("audit fix: trashing (not purging) a widget instance with an outgoing ref-typed config field leaves entry_refs untouched — trash is reversible, its refs must survive a later restore", async () => {
  const deps = makeDeps();
  const { instance: created } = await createWidgetInstance({
    deps: deps,
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
    deps: deps,
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id },
  });

  const refsAfterTrash = await deps.entryRefsRepo.findBySource({ workspaceId: WORKSPACE_ID, sourceEntryId: created.id });
  assert.deepEqual(refsAfterTrash, refsBeforeTrash, "trash must not retract refs — it's reversible, unlike purge");
});

// ---------------------------------------------------------------------------
// REQ-05/06: updateWidgetInstance's own unregistered-type guard. `createWidgetInstance` refuses to
// ever persist an instance of an unregistered type (AC-03/REQ-03 above), so the only way this
// UPDATE-time guard fires is a type deregistered out from under an existing instance — reproduced
// here the same way the C5 malformed-row test does, by writing the entry directly via
// `entryRepo.save`, bypassing the write-service chokepoint that would otherwise prevent it.
// ---------------------------------------------------------------------------

