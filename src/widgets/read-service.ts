/**
 * @file Widget-instance READ accessors (SPEC-043 REQ-04) — `write-service.ts` only ever exported
 * create/update/trash/purge; this file is the missing `widgets.read`-gated get/list side, named
 * separately per `features/entries`' own `write-service.ts`/`list.ts` split convention.
 *
 * External /audit-work finding (2026-07-21, ADR-047): confirmed no read/list accessor existed in
 * this package at all — the admin `get-by-id`/`list` routes (`routes/admin/widgets/*.ts`) this
 * dispatch builds depend on it directly.
 *
 * Disclosed, not silently omitted: REQ-04 also asks for "its full revision history." No revision-
 * READ capability exists anywhere in `features/entries` today for ANY content type (confirmed:
 * `EntryRepoPort` only exposes `appendRevision`, never a corresponding list/read method — neither
 * `InMemoryEntryRepo` nor `SqliteEntryRepo` exposes one either, even as an extra, non-port method).
 * That is a real, pre-existing gap in the shared chokepoint, not a widgets-specific hole, and
 * meaningfully larger than the two additive fixes this dispatch already made to
 * `features/entries/write-service.ts` (the `onWritten` hook, the `bodyJson` parameter) — it needs
 * its own port + both adapters, a bigger shared-module change than this dispatch is authorized to
 * make unilaterally. `getWidgetInstance` below returns current state only; `revisions: []` is
 * returned as an honest placeholder shape (not a silently-dropped field) so callers/tests have a
 * stable contract to code against once the underlying capability lands.
 *
 * Architectural role:
 * `widgets` domain logic, read side.
 */
import type { UUID } from "@jini-ai/cms/core";
import type { EntryListPort } from "../features/entries/list";
import type { EntryRepoPort } from "../features/entries/write-service";
import { requireWidgetPermission, type WidgetsAuthorizeFn } from "./authorize-helper";
import { WidgetInstanceNotFoundError } from "./errors";
import { toWidgetInstanceEntry } from "./entry-payload";
import { WIDGET_CONTENT_TYPE } from "./types";
import type { WidgetInstanceEntry } from "./types";

export interface WidgetReadServiceDeps {
  entryRepo: EntryRepoPort & EntryListPort;
  authorize: WidgetsAuthorizeFn;
}

export interface GetWidgetInstanceInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly widgetInstanceId: UUID;
}

export interface GetWidgetInstanceRequired {
  deps: WidgetReadServiceDeps;
  input: GetWidgetInstanceInput;
}

/** REQ-04: read a widget instance's current state (+ revision history — see this file's header for
 * the disclosed gap on that half). Returns any status (`active`/`trash`/`purged`) — the caller
 * decides whether a non-`active` instance is presentable (e.g. an admin editor still shows a
 * trashed instance so it can be restored/inspected). */
export async function getWidgetInstance(required: GetWidgetInstanceRequired): Promise<{ instance: WidgetInstanceEntry; revisions: [] }> {
  const { deps, input } = required;
  await requireWidgetPermission({
    authorize: deps.authorize,
    actor: input.actor,
    workspaceId: input.workspaceId,
    permission: "widgets.read",
  });

  const entry = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
  if (!entry || entry.type !== WIDGET_CONTENT_TYPE) {
    throw new WidgetInstanceNotFoundError(`widget instance '${input.widgetInstanceId}' was not found`);
  }
  return { instance: toWidgetInstanceEntry(entry), revisions: [] };
}

export interface ListWidgetInstancesInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  /** Narrow to one widget type; omitted lists every type (mirrors `EntryListPort.listByWorkspace`'s
   * own optional-`type` shape). */
  readonly widgetType?: string;
  /** Excludes `trash`/`purged` instances by default — the library screen's default view (REQ-04
   * read access still covers reading a specific trashed instance directly via `getWidgetInstance`,
   * this is only the list's default filter). */
  readonly includeInactive?: boolean;
}

export interface ListWidgetInstancesRequired {
  deps: WidgetReadServiceDeps;
  input: ListWidgetInstancesInput;
}

export async function listWidgetInstances(required: ListWidgetInstancesRequired): Promise<{ instances: WidgetInstanceEntry[] }> {
  const { deps, input } = required;
  await requireWidgetPermission({
    authorize: deps.authorize,
    actor: input.actor,
    workspaceId: input.workspaceId,
    permission: "widgets.read",
  });

  const rows = await deps.entryRepo.listByWorkspace({ workspaceId: input.workspaceId, type: WIDGET_CONTENT_TYPE });
  const instances: WidgetInstanceEntry[] = [];
  for (const row of rows) {
    let instance: WidgetInstanceEntry;
    try {
      instance = toWidgetInstanceEntry(row);
    } catch {
      // A malformed widget-instance row (e.g. wiped by an unrelated generic-entry update that
      // bypassed this feature's own write path) is skipped, not a 500 for the whole admin library
      // screen (Fable adversarial-review fix, 2026-07-21, Finding B).
      continue;
    }
    if (input.widgetType && instance.widgetType !== input.widgetType) continue;
    if (!input.includeInactive && instance.status !== "active") continue;
    instances.push(instance);
  }
  return { instances };
}
