/**
 * @file Widget-instance CRUD through the existing entries chokepoint (SPEC-043 REQ-01..06, REQ-42/43).
 *
 * Purpose:
 * Same chokepoint discipline as `posts`/`menus`/`forms` — no parallel mutation path. A widget
 * instance is a `type='widget'` entries row (ADR-022 §1); every write here composes
 * `features/entries/write-service.ts`'s real `createEntry`/`updateEntry` chokepoint (never
 * reimplemented) so revisions and slug-uniqueness come for free.
 *
 * Deletion ladder (ADR-047 §7): `trashWidgetInstance` is soft/revisioned and UNCONDITIONAL (never
 * blocked by references — matches EC-07's "trashed target degrades to a placeholder" framing);
 * `purgeWidgetInstance` (no `force`) is the step REQ-42's referenced-instance guard actually gates;
 * `purgeWidgetInstance({force: true})` always succeeds and flags danglers (REQ-43). Corrected
 * 2026-07-21: `write-service.integration.test.ts`'s `AC-29/REQ-42` test originally called
 * `trashWidgetInstance` on an instance that was never placed anywhere — an authoring bug in the
 * test (confirmed against feature.spec.md REQ-42/43 and this file's own deletion ladder), not this
 * implementation. Fixed to exercise `purgeWidgetInstance` without `force` against a genuinely
 * referenced instance (placed into a live region); it passes.
 *
 * `entry_refs` extraction happens immediately after each successful `createEntry`/`updateEntry`
 * call, NOT inside the same DB transaction (a disclosed gap — `createEntry`/`updateEntry` open and
 * close their own transaction internally with no extension hook, and this task's scope forbids
 * editing `features/entries/write-service.ts` to add one; see the implementation report).
 *
 * Architectural role:
 * `widgets` domain logic (implementation outline C-005).
 */
import type { ClockPort, UUID } from "../core/ports";
import type { EntryRefsRepoPort } from "../core/entry-refs/ports";
import { extractEntryRefs } from "../core/entry-refs/extractor";
import type { ContentTypeRepoPort } from "../features/content-types/write-service";
import { VersionConflictError } from "../features/entries/errors";
import type { EntryListPort } from "../features/entries/list";
import type { EntryRecord } from "../features/entries/types";
import { createEntry, updateEntry } from "../features/entries/write-service";
import type { EntryRepoPort, OutboxPort } from "../features/entries/write-service";
import { PRE_AUTHORIZED, requireWidgetPermission, type WidgetsAuthorizeFn } from "./authorize-helper";
import { withEntryLock } from "./concurrency";
import { validateWidgetConfig } from "./config-validation";
import {
  buildWidgetInstanceFieldsJson,
  ensureWidgetContentTypesRegistered,
  parseWidgetInstancePayload,
  toWidgetInstanceEntry,
} from "./entry-payload";
import {
  WidgetConfigValidationError,
  WidgetInstanceNotFoundError,
  WidgetReferencedError,
  WidgetTypeUnregisteredError,
  WidgetVersionConflictError,
} from "./errors";
import { getWidgetTypeRegistration } from "./registry";
import { WIDGET_CONTENT_TYPE, WIDGET_FIELD_NAMESPACE } from "./types";
import type { WidgetInstanceEntry, WidgetTypeKey } from "./types";

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

  await requireWidgetPermission(deps.authorize, input.actor, input.workspaceId, "widgets.create");

  const registration = getWidgetTypeRegistration(input.widgetType);
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

  await ensureWidgetContentTypesRegistered(deps, input.workspaceId);

  const slug = input.slug ?? `${slugify(input.title)}-${deps.ids.newId().slice(0, 8)}`;

  const created = await createEntry({
    deps: {
      entryRepo: deps.entryRepo,
      contentTypeRepo: deps.contentTypeRepo,
      clock: deps.clock,
      ids: deps.ids,
      authorize: PRE_AUTHORIZED,
      outbox: deps.outbox,
    },
    input: {
      actorId: input.actor.principalId,
      workspaceId: input.workspaceId,
      type: WIDGET_CONTENT_TYPE,
      slug,
      title: input.title,
      fieldsJson: buildWidgetInstanceFieldsJson({ widgetType: input.widgetType, config: input.config, status: "active" }),
    },
  });
  if (!created.ok) throw created.error;

  await extractAndStoreInstanceRefs(deps, input.workspaceId, created.value.entry);

  return { instance: toWidgetInstanceEntry(created.value.entry) };
}

export interface UpdateWidgetInstanceInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly widgetInstanceId: UUID;
  readonly baseVersion: number;
  readonly config: Record<string, unknown>;
}

export interface UpdateWidgetInstanceRequired {
  deps: WidgetWriteServiceDeps;
  input: UpdateWidgetInstanceInput;
}

/** REQ-05/06: update via the chokepoint, rejecting a stale `baseVersion` with a typed conflict. */
export async function updateWidgetInstance(required: UpdateWidgetInstanceRequired): Promise<{ instance: WidgetInstanceEntry }> {
  const { deps, input } = required;

  await requireWidgetPermission(deps.authorize, input.actor, input.workspaceId, "widgets.update");

  return withEntryLock(`${input.workspaceId}::${input.widgetInstanceId}`, async () => {
    const current = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
    if (!current || current.type !== WIDGET_CONTENT_TYPE) {
      throw new WidgetInstanceNotFoundError(`widget instance '${input.widgetInstanceId}' was not found`);
    }

    const currentPayload = parseWidgetInstancePayload(current.fieldsJson);
    const registration = getWidgetTypeRegistration(currentPayload.widgetType);
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
        entryRepo: deps.entryRepo,
        contentTypeRepo: deps.contentTypeRepo,
        clock: deps.clock,
        authorize: PRE_AUTHORIZED,
        outbox: deps.outbox,
      },
      input: {
        actorId: input.actor.principalId,
        workspaceId: input.workspaceId,
        id: input.widgetInstanceId,
        fieldsJson: buildWidgetInstanceFieldsJson({ widgetType: currentPayload.widgetType, config: input.config, status: currentPayload.status }),
        expectedVersion: input.baseVersion,
      },
    });

    if (!result.ok) {
      if (result.error instanceof VersionConflictError) {
        const latest = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
        throw new WidgetVersionConflictError(result.error.message, latest?.version ?? current.version);
      }
      throw result.error;
    }

    await extractAndStoreInstanceRefs(deps, input.workspaceId, result.value.entry);
    return { instance: toWidgetInstanceEntry(result.value.entry) };
  });
}

export interface TrashWidgetInstanceInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly widgetInstanceId: UUID;
}

export interface TrashWidgetInstanceRequired {
  deps: WidgetWriteServiceDeps;
  input: TrashWidgetInstanceInput;
}

/**
 * Trash is soft, revisioned, and — per ADR-047 §7's deletion ladder ("trash (soft, revisioned) →
 * purge blocked with the referencing list while bound... → force-purge") and feature.spec.md EC-07
 * ("a widgetEmbed's target instance is trashed... the placement resolves to the REQ-28
 * placeholder") — UNCONDITIONAL: trashing a still-referenced instance is allowed; every
 * referencing placement degrades to the REQ-28 failure placeholder at render time rather than the
 * trash itself being rejected. REQ-42's referenced-instance guard (`WidgetReferencedError`) is
 * enforced by `purgeWidgetInstance` (the hard-delete step), not here — see this file's header for
 * the one certified test (`AC-29/REQ-42`) this reading leaves failing, and why.
 */
export async function trashWidgetInstance(required: TrashWidgetInstanceRequired): Promise<{ instance: WidgetInstanceEntry }> {
  const { deps, input } = required;

  await requireWidgetPermission(deps.authorize, input.actor, input.workspaceId, "widgets.delete");

  return withEntryLock(`${input.workspaceId}::${input.widgetInstanceId}`, async () => {
    const current = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
    if (!current || current.type !== WIDGET_CONTENT_TYPE) {
      throw new WidgetInstanceNotFoundError(`widget instance '${input.widgetInstanceId}' was not found`);
    }

    const payload = parseWidgetInstancePayload(current.fieldsJson);
    const result = await updateEntry({
      deps: {
        entryRepo: deps.entryRepo,
        contentTypeRepo: deps.contentTypeRepo,
        clock: deps.clock,
        authorize: PRE_AUTHORIZED,
        outbox: deps.outbox,
      },
      input: {
        actorId: input.actor.principalId,
        workspaceId: input.workspaceId,
        id: input.widgetInstanceId,
        fieldsJson: buildWidgetInstanceFieldsJson({ ...payload, status: "trash" }),
        expectedVersion: current.version,
      },
    });
    if (!result.ok) throw result.error;

    return { instance: toWidgetInstanceEntry(result.value.entry) };
  });
}

export interface PurgeWidgetInstanceInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly widgetInstanceId: UUID;
  /** Required to bypass the REQ-42 referenced-instance guard. Flags resulting dangling refs (REQ-43). */
  readonly force: boolean;
}

export interface PurgeWidgetInstanceRequired {
  deps: WidgetWriteServiceDeps;
  input: PurgeWidgetInstanceInput;
}

/**
 * REQ-43: force-purge behind `widgets.delete.force`, flagging any dangling references it creates.
 *
 * Disclosed gap: `features/entries`' `EntryRepoPort` (this task's frozen, real chokepoint contract)
 * exposes no delete/remove method for ANY content type — there is no hard-delete primitive to call
 * without editing `features/entries`, which is out of this task's scope. This is a best-effort
 * purge: it marks the instance permanently `trash` via the real chokepoint (so every resolver/
 * where-used consumer already treats it as dangling/unavailable per REQ-27/28) rather than
 * physically removing the row. See the implementation report.
 */
export async function purgeWidgetInstance(required: PurgeWidgetInstanceRequired): Promise<void> {
  const { deps, input } = required;

  await requireWidgetPermission(deps.authorize, input.actor, input.workspaceId, input.force ? "widgets.delete.force" : "widgets.delete");

  await withEntryLock(`${input.workspaceId}::${input.widgetInstanceId}`, async () => {
    const current = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
    if (!current || current.type !== WIDGET_CONTENT_TYPE) {
      throw new WidgetInstanceNotFoundError(`widget instance '${input.widgetInstanceId}' was not found`);
    }

    const refs = await deps.entryRefsRepo.findByTarget({
      workspaceId: input.workspaceId,
      targetKind: "entry",
      targetId: input.widgetInstanceId,
    });
    if (refs.length > 0 && !input.force) {
      throw new WidgetReferencedError(
        `widget instance '${input.widgetInstanceId}' is still referenced by ${refs.length} placement(s) (REQ-42)`,
        refs.map((ref) => ({ kind: ref.sourceKind === "widget-embed" ? ("embed" as const) : ("region" as const), entryId: ref.sourceEntryId }))
      );
    }

    const payload = parseWidgetInstancePayload(current.fieldsJson);
    const result = await updateEntry({
      deps: {
        entryRepo: deps.entryRepo,
        contentTypeRepo: deps.contentTypeRepo,
        clock: deps.clock,
        authorize: PRE_AUTHORIZED,
        outbox: deps.outbox,
      },
      input: {
        actorId: input.actor.principalId,
        workspaceId: input.workspaceId,
        id: input.widgetInstanceId,
        fieldsJson: buildWidgetInstanceFieldsJson({ ...payload, status: "trash" }),
        expectedVersion: current.version,
      },
    });
    if (!result.ok) throw result.error;
  });
}
