import type { ContentTypeRepoPort } from "../features/content-types/write-service";
import { NoopContentTypeIndexProvisioner } from "../features/content-types/repo.memory";
import { registerContentType } from "../features/content-types/write-service";
import type { ClockPort, JsonObject } from "../core/ports";
import type { EntryRecord } from "../features/entries/types";
import { PRE_AUTHORIZED, WIDGETS_SYSTEM_ACTOR_ID } from "./authorize-helper";
import {
  WIDGET_AREA_CONTENT_TYPE,
  WIDGET_AREA_FIELD_NAMESPACE,
  WIDGET_CONTENT_TYPE,
  WIDGET_FIELD_NAMESPACE,
} from "./types";
import type {
  WidgetAreaDoc,
  WidgetAreaEntry,
  WidgetInstanceEntry,
  WidgetInstanceStatus,
  WidgetPlacementNode,
  WidgetRegionKey,
  WidgetTypeKey,
} from "./types";

/**
 * @file Storage-shape plumbing shared by `write-service.ts`/`region-area-service.ts` — how a
 * widget instance's/`widget_area`'s data actually lives inside an `entries` row.
 *
 * Purpose (a real, disclosed deviation from the spec's literal storage-path wording — see the
 * implementation report):
 * `features/entries/write-service.ts`'s `updateEntry` can only change `title`/`fieldsJson` — it has
 * no parameter to change `bodyJson` at all once an entry is created (confirmed by reading its
 * `UpdateEntryRequired.input` shape and body). Widget config MUST be updatable (REQ-05/AC-04), so
 * it cannot live in `bodyJson`.
 *
 * Owner namespace (2026-07-21, fixed): `features/entries/field-validation.ts`'s
 * `validateFieldsAgainstSchema` now accepts an `owner` parameter instead of hardcoding `site`
 * (a real, confirmed gap against ADR-022 §2 — see that file's header and the implementation
 * report). Widget instances write under `fields.ext.widget.*` (`WIDGET_FIELD_NAMESPACE`) and
 * `widget_area` entries under `fields.ext.widgets.*` (`WIDGET_AREA_FIELD_NAMESPACE`), matching
 * REQ-01/REQ-11's literal namespacing — not a shared `site` bag.
 *
 * A widget instance's `config` shape is still polymorphic per `widgetType` (declared in
 * `registry.ts`'s per-type `configSchema`, a JSON-Schema-like validator, not the generic entries
 * fixed-field-list schema `validateFieldsAgainstSchema` checks) — the generic entries content-type
 * field list genuinely cannot express "shape varies by widgetType" regardless of which `ext` owner
 * it validates under, and widgets already runs its own `validateWidgetConfig` (REQ-02) against the
 * real per-type schema before ever reaching this layer. So this file still stores the real
 * config/doc data as one JSON-serialized string in a single required `payload` text field — now
 * under the correct owner namespace — rather than mapping each config key to its own generic-entries
 * field, which round-trips the exact `WidgetInstanceEntry.config`/`WidgetAreaEntry.doc` shapes the
 * public contracts (`types.ts`) declare. `bodyJson` is left unused by this feature (REQ-11's
 * `bodyJson.placements` placement is a separate, disclosed deviation, not fixed by this namespace
 * change — see the implementation report).
 */

export const WIDGET_PAYLOAD_FIELD = "payload";

interface WidgetInstancePayload {
  widgetType: WidgetTypeKey;
  /** `Record<string, unknown>`, not `JsonObject`, matching the stub-frozen `Create/UpdateWidgetInstanceInput.config` shape (`write-service.ts`) — cast to `JsonObject` only at the `WidgetInstanceEntry` read-model boundary below. */
  config: Record<string, unknown>;
  status: WidgetInstanceStatus;
}

interface WidgetAreaPayload {
  regionKey: WidgetRegionKey;
  doc: WidgetAreaDoc;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the single `payload` text field out of an entry's `fieldsJson.ext.<owner>` envelope. */
function readPayloadString(fieldsJson: unknown, owner: string): string {
  if (!isPlainObject(fieldsJson)) throw new Error("widgets: malformed fieldsJson (expected an object)");
  const ext = fieldsJson.ext;
  if (!isPlainObject(ext)) throw new Error("widgets: malformed fieldsJson (missing ext)");
  const ownerBag = ext[owner];
  if (!isPlainObject(ownerBag) || typeof ownerBag[WIDGET_PAYLOAD_FIELD] !== "string") {
    throw new Error(`widgets: malformed fieldsJson (missing fields.ext.${owner}.payload)`);
  }
  return ownerBag[WIDGET_PAYLOAD_FIELD];
}

function buildFieldsJson(payload: unknown, owner: string): unknown {
  return { ext: { [owner]: { [WIDGET_PAYLOAD_FIELD]: JSON.stringify(payload) } } };
}

export function buildWidgetInstanceFieldsJson(payload: WidgetInstancePayload): unknown {
  return buildFieldsJson(payload, WIDGET_FIELD_NAMESPACE);
}

export function parseWidgetInstancePayload(fieldsJson: unknown): WidgetInstancePayload {
  return JSON.parse(readPayloadString(fieldsJson, WIDGET_FIELD_NAMESPACE)) as WidgetInstancePayload;
}

export function buildWidgetAreaFieldsJson(payload: WidgetAreaPayload): unknown {
  return buildFieldsJson(payload, WIDGET_AREA_FIELD_NAMESPACE);
}

export function parseWidgetAreaPayload(fieldsJson: unknown): WidgetAreaPayload {
  return JSON.parse(readPayloadString(fieldsJson, WIDGET_AREA_FIELD_NAMESPACE)) as WidgetAreaPayload;
}

export function toWidgetInstanceEntry(entry: EntryRecord): WidgetInstanceEntry {
  const payload = parseWidgetInstancePayload(entry.fieldsJson);
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    slug: entry.slug,
    title: entry.title,
    status: payload.status,
    widgetType: payload.widgetType,
    config: payload.config as JsonObject,
    updatedAt: entry.updatedAt,
    version: entry.version,
  };
}

export function toWidgetAreaEntry(entry: EntryRecord): WidgetAreaEntry {
  const payload = parseWidgetAreaPayload(entry.fieldsJson);
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    regionKey: payload.regionKey,
    doc: payload.doc,
    updatedAt: entry.updatedAt,
    version: entry.version,
  };
}

/** Stable, workspace-unique slug for a region's `widget_area` entry — also the natural de-dup key REQ-13's idempotent seeding relies on. */
export function widgetAreaSlug(regionKey: WidgetRegionKey): string {
  return `widget-area-${regionKey}`;
}

export function emptyWidgetAreaDoc(): WidgetAreaDoc {
  return { schemaVersion: 1, placements: [] };
}

export function areaDocWithPlacements(doc: WidgetAreaDoc, placements: readonly WidgetPlacementNode[]): WidgetAreaDoc {
  return { schemaVersion: doc.schemaVersion, placements };
}

/**
 * Registers the `widget`/`widget_area` seeded content types (ADR-047 §1, REQ-11) in `workspaceId`
 * if not already present — idempotent, safe to call before every write. Delegates to
 * `features/content-types/write-service.ts`'s real `registerContentType` chokepoint (the same
 * mechanism any Collections content type is registered through) rather than hand-constructing a
 * `content_types` row, per this task's "compose real infra, don't reimplement" directive. Each
 * type gets exactly one required `text`-kind field (`payload`) — see this file's header for why
 * the real config/doc data is JSON-serialized into that one field rather than expressed as
 * per-field scalar columns.
 */
export async function ensureWidgetContentTypesRegistered(
  deps: { contentTypeRepo: ContentTypeRepoPort; clock: ClockPort; ids: { newId: () => string }; outbox: { enqueue(event: { name: string; payload: Record<string, unknown> }): Promise<void> } },
  workspaceId: string
): Promise<void> {
  await ensureOneContentTypeRegistered(deps, workspaceId, WIDGET_CONTENT_TYPE, "Widget");
  await ensureOneContentTypeRegistered(deps, workspaceId, WIDGET_AREA_CONTENT_TYPE, "Widget Area");
}

async function ensureOneContentTypeRegistered(
  deps: { contentTypeRepo: ContentTypeRepoPort; clock: ClockPort; ids: { newId: () => string }; outbox: { enqueue(event: { name: string; payload: Record<string, unknown> }): Promise<void> } },
  workspaceId: string,
  key: string,
  label: string
): Promise<void> {
  const existing = await deps.contentTypeRepo.findByKey({ workspaceId, key });
  if (existing) return;

  const result = await registerContentType({
    deps: {
      repo: deps.contentTypeRepo,
      clock: deps.clock,
      ids: deps.ids,
      authorize: PRE_AUTHORIZED,
      indexProvisioner: new NoopContentTypeIndexProvisioner(),
      outbox: deps.outbox,
    },
    input: {
      actorId: WIDGETS_SYSTEM_ACTOR_ID,
      workspaceId,
      key,
      label,
      fields: [{ name: WIDGET_PAYLOAD_FIELD, kind: "text", required: true, queryable: false }],
    },
  });
  if (!result.ok) throw result.error;
}
