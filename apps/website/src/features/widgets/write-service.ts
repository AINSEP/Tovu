/**
 * @file Widget-instance CRUD through the existing entries chokepoint (SPEC-043 REQ-01..06, REQ-42/43).
 *
 * Purpose:
 * Same chokepoint discipline as `posts`/`menus`/`forms` — no parallel mutation path. A widget
 * instance is a `type='widget'` entries row (ADR-022 §1); every write here composes
 * `features/entries/write-service.ts`'s real `createEntry`/`updateEntry` chokepoint (never
 * reimplemented) so revisions and slug-uniqueness come for free.
 *
 * Deleting (2026-09-21, generic Trash): `trashWidgetInstance` moves a widget to the Trash through
 * the injected `remove` and is UNCONDITIONAL (EC-07 — a trashed target degrades to the REQ-28
 * placeholder). The old second rung, `purgeWidgetInstance` (a `purged` payload status that never
 * removed the row, REQ-42/43), is retired: "delete permanently" is now the Trash's purge, and
 * `adoptLegacyTrashedWidgets` moves the widgets it left behind into the Trash.
 *
 * `entry_refs` extraction (INV-06) runs inside the same DB transaction as the triggering
 * `createEntry`/`updateEntry` call, via that chokepoint's optional `deps.onWritten` hook (added
 * 2026-07-21 — a narrow, additive extension to `features/entries/write-service.ts`, invoked after
 * `save`/`appendRevision` but before commit, so a failed extraction rolls back the whole write; see
 * the implementation report for why this was previously sequenced after instead).
 *
 * Architectural role:
 * `widgets` domain logic (implementation outline C-005).
 */
import type { ClockPort, OutboxPort, UUID } from "@jini-ai/cms/core";
import type { EntryRefsRepoPort } from "../../contracts/core/entry-refs/ports.js";
import { extractEntryRefs } from "../../contracts/core/entry-refs/extractor.js";
import type { ContentTypeRepoPort } from "../content-types/index.js";
import {
  VersionConflictError,
  toEntryOutbox,
  createEntry,
  updateEntry,
  type EntryListPort,
  type EntryRecord,
  type EntryRepoPort,
} from "../entries/index.js";
import {
  PRE_AUTHORIZED,
  requireWidgetPermission,
  type WidgetsAuthorizeFn,
} from "./authorize-helper.js";
import { withEntryLock } from "./concurrency.js";
import { validateWidgetConfig } from "./config-validation.js";
import {
  buildWidgetInstanceFieldsJson,
  ensureWidgetContentTypesRegistered,
  parseWidgetInstancePayload,
  toWidgetInstanceEntry,
} from "./entry-payload.js";
import {
  WidgetConfigValidationError,
  WidgetInstanceNotFoundError,
  WidgetTypeUnregisteredError,
  WidgetVersionConflictError,
} from "./errors.js";
import { findWidgetTypeRegistration } from "./registry.js";
import { WIDGET_CONTENT_TYPE, WIDGET_FIELD_NAMESPACE } from "./types.js";
import type { RemoveWidgetFn } from "./ports.js";
import type { WidgetInstanceEntry, WidgetTypeKey } from "./types.js";

export interface WidgetWriteServiceDeps {
  entryRepo: EntryRepoPort & EntryListPort;
  contentTypeRepo: ContentTypeRepoPort;
  entryRefsRepo: EntryRefsRepoPort;
  clock: ClockPort;
  ids: { newId: () => string };
  authorize: WidgetsAuthorizeFn;
  outbox: OutboxPort;
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return base.length > 0 ? base : "widget";
}

async function extractAndStoreInstanceRefs(deps: WidgetWriteServiceDeps, workspaceId: string, entry: EntryRecord): Promise<void> {
  const payload = parseWidgetInstancePayload(entry.fieldsJson);
  const refs = extractEntryRefs({
    workspaceId,
    sourceEntryId: entry.id,
    sourceEntryType: WIDGET_CONTENT_TYPE,
    bodyJson: entry.bodyJson,
    fieldsExt: { [WIDGET_FIELD_NAMESPACE]: { widgetType: payload.widgetType, config: payload.config } },
  });
  await deps.entryRefsRepo.replaceForSource({ workspaceId, sourceEntryId: entry.id, refs });
}

/**
 * The one shared shape every `createEntry`/`updateEntry` call in this file needs — mirrors
 * `region-area-service.ts`'s identical `entriesWriteDeps` helper. Bridges `deps.outbox` (the raw,
 * full-`DomainEvent` infra port — see `WidgetWriteServiceDeps.outbox`) through `toEntryOutbox` into
 * the narrower `{enqueue({name,payload})}` shape `createEntry`/`updateEntry` declare locally.
 * Previously each of the four call sites below passed `deps.outbox` straight through unwrapped —
 * compiled fine (`features/entries/write-service.ts`'s own narrow `OutboxPort` accepted it via a
 * structural/bivariance loophole), but threw `NOT NULL constraint failed: outbox_events.id` against
 * the real SQLite outbox in production on every widget create/update/trash/purge, invisible against
 * the in-memory test double (which accepts any shape). One composer means the bridge can't be
 * missed at a fifth call site later — see `ADS-memory/.local-artifacts/agent-reports/
 * 20260803-widget-delete-outbox-bug.md` and `20260803-jini-outbox-contract.md` for the full
 * investigation. `onWritten` is deliberately NOT included — it differs per call site (or is absent
 * entirely, as in `trashWidgetInstance`), so each caller still supplies its own.
 */
function entriesWriteDeps(deps: WidgetWriteServiceDeps, workspaceId: UUID) {
  return {
    entryRepo: deps.entryRepo,
    contentTypeRepo: deps.contentTypeRepo,
    clock: deps.clock,
    ids: deps.ids,
    authorize: PRE_AUTHORIZED,
    outbox: toEntryOutbox({ outbox: deps.outbox, clock: deps.clock, idGen: deps.ids, workspaceId }),
  };
}

export interface CreateWidgetInstanceInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly widgetType: WidgetTypeKey;
  readonly title: string;
  readonly config: Record<string, unknown>;
  readonly slug?: string;
}

export interface CreateWidgetInstanceRequired {
  deps: WidgetWriteServiceDeps;
  input: CreateWidgetInstanceInput;
}

/** REQ-01/02/03: authorize → validate config against the type's registered schema → create via the chokepoint. */
export async function createWidgetInstance(required: CreateWidgetInstanceRequired): Promise<{ instance: WidgetInstanceEntry }> {
  const { deps, input } = required;

  await requireWidgetPermission({
    authorize: deps.authorize,
    actor: input.actor,
    workspaceId: input.workspaceId,
    permission: "widgets.create",
  });

  // `input.widgetType` is typed `WidgetTypeKey` but only ASSERTED to be one — HTTP routes
  // (`server/routes/admin/widgets/create.ts`/`agent-tools.ts`) cast an unvalidated request-body
  // string to it. `findWidgetTypeRegistration` is the correct accessor here: `undefined` is
  // genuinely reachable, and this check is what catches an unregistered type at this boundary.
  const registration = findWidgetTypeRegistration(input.widgetType);
  if (!registration) {
    throw new WidgetTypeUnregisteredError(`widget type '${input.widgetType}' is not registered (REQ-03)`, input.widgetType);
  }

  const validation = validateWidgetConfig({ schema: registration.configSchema, config: input.config });
  if (!validation.valid) {
    throw new WidgetConfigValidationError(
      `config for widget type '${input.widgetType}' failed schema validation (REQ-02)`,
      validation.fieldErrors
    );
  }

  await ensureWidgetContentTypesRegistered({ deps, workspaceId: input.workspaceId });

  const slug = input.slug ?? `${slugify(input.title)}-${deps.ids.newId().slice(0, 8)}`;

  const created = await createEntry({
    deps: {
      ...entriesWriteDeps(deps, input.workspaceId),
      onWritten: (entry) => extractAndStoreInstanceRefs(deps, input.workspaceId, entry),
    },
    input: {
      actorId: input.actor.principalId,
      workspaceId: input.workspaceId,
      type: WIDGET_CONTENT_TYPE,
      slug,
      title: input.title,
      fieldsJson: buildWidgetInstanceFieldsJson({ widgetType: input.widgetType, config: input.config, status: "active" }),
      owner: WIDGET_FIELD_NAMESPACE,
    },
  });
  if (!created.ok) throw created.error;

  return { instance: toWidgetInstanceEntry(created.value.entry) };
}

export interface UpdateWidgetInstanceInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly widgetInstanceId: UUID;
  readonly baseVersion: number;
  readonly config: Record<string, unknown>;
  /** Optional (SPEC-043 ui.spec §4.3): omitted keeps the current title, forwarded to
   *  `updateEntry`'s own `title` field (`input.title ?? current.title`) the same way create's
   *  `title` reaches the entry row — never folded into `fieldsJson`, which only carries
   *  widget-domain payload (`widgetType`/`config`/`status`). */
  readonly title?: string;
}

export interface UpdateWidgetInstanceRequired {
  deps: WidgetWriteServiceDeps;
  input: UpdateWidgetInstanceInput;
}

/** REQ-05/06: update via the chokepoint, rejecting a stale `baseVersion` with a typed conflict. */
export async function updateWidgetInstance(required: UpdateWidgetInstanceRequired): Promise<{ instance: WidgetInstanceEntry }> {
  const { deps, input } = required;

  await requireWidgetPermission({
    authorize: deps.authorize,
    actor: input.actor,
    workspaceId: input.workspaceId,
    permission: "widgets.update",
  });

  return withEntryLock(`${input.workspaceId}::${input.widgetInstanceId}`, async () => {
    const current = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
    if (!current || current.type !== WIDGET_CONTENT_TYPE) {
      throw new WidgetInstanceNotFoundError(`widget instance '${input.widgetInstanceId}' was not found`);
    }

    const currentPayload = parseWidgetInstancePayload(current.fieldsJson);
    // `currentPayload.widgetType` is typed `WidgetTypeKey` but only ASSERTED to be one —
    // `parseWidgetInstancePayload` casts decoded, stored JSON (`entry-payload.ts`), so
    // `findWidgetTypeRegistration` is the correct, honestly-partial accessor here too.
    const registration = findWidgetTypeRegistration(currentPayload.widgetType);
    if (!registration) {
      throw new WidgetTypeUnregisteredError(`widget type '${currentPayload.widgetType}' is not registered`, currentPayload.widgetType);
    }

    const validation = validateWidgetConfig({ schema: registration.configSchema, config: input.config });
    if (!validation.valid) {
      throw new WidgetConfigValidationError(
        `config for widget type '${currentPayload.widgetType}' failed schema validation (REQ-02)`,
        validation.fieldErrors
      );
    }

    const result = await updateEntry({
      deps: {
        ...entriesWriteDeps(deps, input.workspaceId),
        onWritten: (entry) => extractAndStoreInstanceRefs(deps, input.workspaceId, entry),
      },
      input: {
        actorId: input.actor.principalId,
        workspaceId: input.workspaceId,
        id: input.widgetInstanceId,
        title: input.title,
        fieldsJson: buildWidgetInstanceFieldsJson({ widgetType: currentPayload.widgetType, config: input.config, status: currentPayload.status }),
        expectedVersion: input.baseVersion,
        owner: WIDGET_FIELD_NAMESPACE,
      },
    });

    if (!result.ok) {
      if (result.error instanceof VersionConflictError) {
        const latest = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
        throw new WidgetVersionConflictError(result.error.message, latest?.version ?? current.version);
      }
      throw result.error;
    }

    return { instance: toWidgetInstanceEntry(result.value.entry) };
  });
}

export interface TrashWidgetInstanceInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly widgetInstanceId: UUID;
}

/** {@link WidgetWriteServiceDeps} plus the Trash, injected: `remove` (bound to `"widget"` at the
 *  composition root) and the transaction the adoption step runs each widget in. */
export interface WidgetTrashDeps extends WidgetWriteServiceDeps {
  remove: RemoveWidgetFn;
  transaction: <T>(fn: () => Promise<T>) => Promise<T>;
}

export interface TrashWidgetInstanceRequired {
  deps: Pick<WidgetTrashDeps, "entryRepo" | "clock" | "authorize" | "remove">;
  input: TrashWidgetInstanceInput;
}

/**
 * Deleting a widget = moving it to the Trash (the injected `remove`). UNCONDITIONAL, per ADR-047 §7
 * and feature.spec.md EC-07: a widget still placed somewhere can be trashed, and every placement
 * then renders the REQ-28 placeholder until it is restored. Only a purge from the Trash removes it
 * for good.
 *
 * Never parses the payload, so a widget whose `fields_json` is corrupt can still be deleted, and
 * never touches its outgoing `entry_refs` (a restore needs them).
 *
 * @throws WidgetInstanceNotFoundError when the widget is missing, already trashed, or not a widget.
 * @throws WidgetVersionConflictError when the row changed between the read and the move.
 * @complexity O(1): one read, one `remove` call (and one more read only on a version conflict).
 */
export async function trashWidgetInstance(
  required: TrashWidgetInstanceRequired
): Promise<{ widgetInstanceId: UUID; version: number | null }> {
  const { deps, input } = required;

  await requireWidgetPermission({
    authorize: deps.authorize,
    actor: input.actor,
    workspaceId: input.workspaceId,
    permission: "widgets.delete",
  });

  return withEntryLock(`${input.workspaceId}::${input.widgetInstanceId}`, async () => {
    const notFound = () => new WidgetInstanceNotFoundError(`widget instance '${input.widgetInstanceId}' was not found`);
    const current = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
    if (!current || current.type !== WIDGET_CONTENT_TYPE) throw notFound();

    const removed = await deps.remove({
      workspaceId: input.workspaceId,
      id: current.id,
      display: { title: current.title, subtitle: current.slug },
      at: deps.clock.nowIso(),
      expectedVersion: current.version,
      actor: { principalId: input.actor.principalId },
    });
    if (removed.ok) return { widgetInstanceId: current.id, version: removed.version };
    if (removed.reason === "not-found") throw notFound();

    const fresh = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
    if (!fresh) throw notFound();
    throw new WidgetVersionConflictError(
      `widget instance '${input.widgetInstanceId}' changed while it was being deleted — reload and try again`,
      fresh.version
    );
  });
}

/** The payload statuses the old delete ladder left behind: `trash` (step 1) and `purged` (its
 *  "delete permanently", which never removed the row). */
const LEGACY_DELETED_STATUSES: ReadonlySet<string> = new Set(["trash", "purged"]);

/** Who the Trash records as having moved an adopted widget there. */
const ADOPTION_ACTOR = { principalId: "system" } as const;

export interface AdoptLegacyTrashedWidgetsRequired {
  deps: WidgetTrashDeps;
  input: { readonly workspaceId: UUID };
}

/**
 * One-time, idempotent boot step (owner decision 6): every widget the old delete ladder left with
 * payload status `trash` or `purged` goes into the Trash, so it gets the same 60 days as anything
 * else deleted today. Per widget, in ONE transaction: the payload status goes back to `active`
 * (so a restore brings back a working widget), its outgoing refs are re-derived (the old purge had
 * retracted them), then the Trash takes it. A second run finds nothing: an adopted widget is in the
 * Trash, so the entries reads no longer return it.
 *
 * A widget whose payload does not parse is skipped; nothing about it says it was deleted.
 *
 * @returns the ids it moved to the Trash.
 * @complexity O(w) over the workspace's live widgets: one list, then one update + one `remove` for
 *             each adopted widget.
 */
export async function adoptLegacyTrashedWidgets(required: AdoptLegacyTrashedWidgetsRequired): Promise<{ adopted: UUID[] }> {
  const { deps, input } = required;
  const widgets = await deps.entryRepo.listByWorkspace({ workspaceId: input.workspaceId, type: WIDGET_CONTENT_TYPE });
  const adopted: UUID[] = [];

  for (const widget of widgets) {
    let payload: ReturnType<typeof parseWidgetInstancePayload>;
    try {
      payload = parseWidgetInstancePayload(widget.fieldsJson);
    } catch {
      continue;
    }
    if (!LEGACY_DELETED_STATUSES.has(payload.status)) continue;

    await deps.transaction(async () => {
      const updated = await updateEntry({
        deps: {
          ...entriesWriteDeps(deps, input.workspaceId),
          onWritten: (entry) => extractAndStoreInstanceRefs(deps, input.workspaceId, entry),
        },
        input: {
          actorId: ADOPTION_ACTOR.principalId,
          workspaceId: input.workspaceId,
          id: widget.id,
          fieldsJson: buildWidgetInstanceFieldsJson({ ...payload, status: "active" }),
          expectedVersion: widget.version,
          owner: WIDGET_FIELD_NAMESPACE,
        },
      });
      if (!updated.ok) throw updated.error;

      const removed = await deps.remove({
        workspaceId: input.workspaceId,
        id: widget.id,
        display: { title: widget.title, subtitle: widget.slug },
        at: deps.clock.nowIso(),
        expectedVersion: updated.value.entry.version,
        actor: ADOPTION_ACTOR,
      });
      // Thrown, not skipped: the payload update above must roll back with it, or the widget would
      // come back to life on the site.
      if (!removed.ok) throw new Error(`widget '${widget.id}' could not be moved to the Trash: ${removed.reason}`);
    });
    adopted.push(widget.id);
  }

  return { adopted };
}
