import type { ContentTypeRepoPort } from "../features/content-types/write-service";
import { NoopContentTypeIndexProvisioner } from "../features/content-types/repo.memory";
import { registerContentType } from "../features/content-types/write-service";
import type { ClockPort, JsonObject } from "../core/ports";
import type { EntryRecord } from "../features/entries/types";
import { PRE_AUTHORIZED, WIDGETS_SYSTEM_ACTOR_ID } from "./authorize-helper";
import {
  WIDGET_AREA_CONTENT_TYPE,
  WIDGET_CONTENT_TYPE,
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
 * it cannot live in `bodyJson`. Separately, `features/entries/field-validation.ts`'s
 * `validateFieldsAgainstSchema` hardcodes the extension-field envelope to exactly
 * `{ ext: { site: {...} } }` — the single literal namespace `site`, not a per-content-type owner
 * namespace — so this repo's real, running generic entries system cannot validate a
 * `fields.ext.widget.*`/`fields.ext.widgets.*` bag the way `widgets/types.ts`'s doc comments
 * describe (that shape was never built for the generic entries system; only `navigation`'s
 * bespoke, pre-generic-entries `menus` table ever carried a real `fields.ext.navigation.*`-shaped
 * bag, and that table is untouched by this feature).
 *
 * Given both constraints, and given this task's scope forbids editing `features/entries/*`, this
 * file stores a widget instance's/`widget_area`'s REAL data as one JSON-serialized string in a
 * single required `payload` text field under the one namespace the real validator supports
 * (`fieldsJson.ext.site.payload`) — trivially schema-valid (a single required `text`-kind field
 * always passes `conformsToKind`), fully mutable via `updateEntry`'s `fieldsJson` parameter, and
 * round-trips the exact `WidgetInstanceEntry.config`/`WidgetAreaEntry.doc` shapes the public
 * contracts (`types.ts`) declare. `bodyJson` is left unused by this feature.
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

/** Reads the single `payload` text field out of an entry's `fieldsJson.ext.site` envelope. */
function readPayloadString(fieldsJson: unknown): string {
  if (!isPlainObject(fieldsJson)) throw new Error("widgets: malformed fieldsJson (expected an object)");
  const ext = fieldsJson.ext;
  if (!isPlainObject(ext)) throw new Error("widgets: malformed fieldsJson (missing ext)");
  const site = ext.site;
  if (!isPlainObject(site) || typeof site[WIDGET_PAYLOAD_FIELD] !== "string") {
    throw new Error("widgets: malformed fieldsJson (missing fields.ext.site.payload)");
  }
  return site[WIDGET_PAYLOAD_FIELD];
}

function buildFieldsJson(payload: unknown): unknown {
  return { ext: { site: { [WIDGET_PAYLOAD_FIELD]: JSON.stringify(payload) } } };
}

export function buildWidgetInstanceFieldsJson(payload: WidgetInstancePayload): unknown {
  return buildFieldsJson(payload);
}

export function parseWidgetInstancePayload(fieldsJson: unknown): WidgetInstancePayload {
  return JSON.parse(readPayloadString(fieldsJson)) as WidgetInstancePayload;
}

export function buildWidgetAreaFieldsJson(payload: WidgetAreaPayload): unknown {
  return buildFieldsJson(payload);
}

export function parseWidgetAreaPayload(fieldsJson: unknown): WidgetAreaPayload {
  return JSON.parse(readPayloadString(fieldsJson)) as WidgetAreaPayload;
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
