import type { ContentTypeRepoPort } from "../features/content-types/write-service";
import { NoopContentTypeIndexProvisioner, toContentTypeOutbox } from "../features/content-types/repo.memory";
import { registerContentType } from "../features/content-types/write-service";
import type { ClockPort, JsonObject, OutboxPort } from "@jini-ai/cms/core";
import type { EntryRecord } from "../features/entries";
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

export function areaDocWithPlacements(required: {
  doc: WidgetAreaDoc;
  placements: readonly WidgetPlacementNode[];
}): WidgetAreaDoc {
  return { schemaVersion: required.doc.schemaVersion, placements: required.placements };
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
  required: {
    deps: {
      contentTypeRepo: ContentTypeRepoPort;
      clock: ClockPort;
      ids: { newId: () => string };
      // Full-`DomainEvent` infra port (`core/ports.ts`'s own `OutboxPort`, what `SqliteOutboxAdapter`/
      // `InMemoryOutbox` actually implement) — NOT `content-types`' own narrower local port.
      // `ensureOneContentTypeRegistered` below bridges it with `toContentTypeOutbox` at its own
      // `registerContentType` call, mirroring `write-service.ts`'s `entriesWriteDeps`/`toEntryOutbox`
      // for the sibling `entries` chokepoint.
      //
      // CORRECTION (2026-08-03, verified): an earlier version of this comment claimed the unwrapped
      // adapter "threw `NOT NULL constraint failed: outbox_events.id` the first time a workspace
      // creates its first widget/widget_area". That is FALSE and was inferred, never observed.
      // `registerContentType` (`@jini-ai/cms` `content-types/write-service.ts:141`) declares `outbox`
      // as a required dep and **never calls `enqueue` on it** — the only content-types functions that
      // enqueue are `lifecycle.ts`'s `deprecateContentType`/`tombstoneContentType`. So this seeding
      // path could not have thrown, and the bridge here is defensive rather than load-bearing. Kept
      // wrapped anyway: the dep is declared, `registerContentType` may legitimately start enqueuing a
      // `content_type.registered` event later, and an unwrapped adapter would then fail exactly the
      // way the entries path did. See
      // `ADS-memory/reports/audits/2026-08-03-audit-dossier-outbox-and-tool-surface.md`.
      outbox: OutboxPort;
    };
    workspaceId: string;
  },
  _optional: Record<string, never> = {}
): Promise<void> {
  const { deps, workspaceId } = required;
  await ensureOneContentTypeRegistered(deps, workspaceId, WIDGET_CONTENT_TYPE, "Widget");
  await ensureOneContentTypeRegistered(deps, workspaceId, WIDGET_AREA_CONTENT_TYPE, "Widget Area");
}

async function ensureOneContentTypeRegistered(
  deps: { contentTypeRepo: ContentTypeRepoPort; clock: ClockPort; ids: { newId: () => string }; outbox: OutboxPort },
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
      outbox: toContentTypeOutbox({ outbox: deps.outbox, clock: deps.clock, idGen: deps.ids, workspaceId }),
    },
    input: {
      actorId: WIDGETS_SYSTEM_ACTOR_ID,
      // Not a human and not the assistant — this is the widgets subsystem seeding its own two
      // content types at boot (REQ-13). Recording it as such keeps the audit trail able to say
      // "nobody did this, the system did".
      principalKind: "system",
      workspaceId,
      key,
      label,
      fields: [{ name: WIDGET_PAYLOAD_FIELD, kind: "text", required: true, queryable: false }],
    },
  });
  if (!result.ok) throw result.error;
}
