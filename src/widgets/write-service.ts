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
import type { EntryRefsRepoPort } from "../core/entry-refs/ports.js";
import { extractEntryRefs } from "../core/entry-refs/extractor.js";
import type { ContentTypeRepoPort } from "../features/content-types/index.js";
import {
  VersionConflictError,
  toEntryOutbox,
  createEntry,
  updateEntry,
  type EntryListPort,
  type EntryRecord,
  type EntryRepoPort,
} from "../features/entries/index.js";
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
  WidgetReferencedError,
  WidgetTypeUnregisteredError,
  WidgetVersionConflictError,
} from "./errors.js";
import { getWidgetTypeRegistration } from "./registry.js";
import { WIDGET_CONTENT_TYPE, WIDGET_FIELD_NAMESPACE } from "./types.js";
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
        ...entriesWriteDeps(deps, input.workspaceId),
        onWritten: (entry) => extractAndStoreInstanceRefs(deps, input.workspaceId, entry),
      },
      input: {
        actorId: input.actor.principalId,
        workspaceId: input.workspaceId,
        id: input.widgetInstanceId,
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

  await requireWidgetPermission({
    authorize: deps.authorize,
    actor: input.actor,
    workspaceId: input.workspaceId,
    permission: "widgets.delete",
  });

  return withEntryLock(`${input.workspaceId}::${input.widgetInstanceId}`, async () => {
    const current = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
    if (!current || current.type !== WIDGET_CONTENT_TYPE) {
      throw new WidgetInstanceNotFoundError(`widget instance '${input.widgetInstanceId}' was not found`);
    }

    const payload = parseWidgetInstancePayload(current.fieldsJson);
    const result = await updateEntry({
      deps: entriesWriteDeps(deps, input.workspaceId),
      input: {
        actorId: input.actor.principalId,
        workspaceId: input.workspaceId,
        id: input.widgetInstanceId,
        fieldsJson: buildWidgetInstanceFieldsJson({ ...payload, status: "trash" }),
        expectedVersion: current.version,
        owner: WIDGET_FIELD_NAMESPACE,
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
 * without editing `features/entries`, which is out of this task's scope, and this codebase's other
 * deletion ladders (e.g. Forms definitions, ADR-047 Amendment 4: "never deleted, only
 * active⇄disabled") show that's a deliberate house style, not an oversight specific to widgets. This
 * is a best-effort purge: it marks the instance permanently `purged` via the real chokepoint — a
 * status every resolver/where-used consumer treats identically to `trash` (dangling/unavailable per
 * REQ-27/28) but which stays observably distinct from an ordinary `trash`, so stored state alone can
 * tell "just trashed" apart from "force-purged past a known reference" — rather than physically
 * removing the row. See the implementation report.
 */
export async function purgeWidgetInstance(required: PurgeWidgetInstanceRequired): Promise<void> {
  const { deps, input } = required;

  await requireWidgetPermission({
    authorize: deps.authorize,
    actor: input.actor,
    workspaceId: input.workspaceId,
    permission: input.force ? "widgets.delete.force" : "widgets.delete",
  });

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
        ...entriesWriteDeps(deps, input.workspaceId),
        // Audit finding (2026-07-21, external /audit-work on ADR-047): a force-purged instance's
        // own OUTGOING refs (e.g. a Contact Form's `formDefinitionId`, a Menu widget's `menuRef`)
        // must be retracted, same transaction as the purge write — purge is the permanent step
        // (REQ-43), so a config field that used to reference something should stop counting as a
        // live reference once the instance holding it is gone. Deliberately an EMPTY
        // `replaceForSource` call, not a re-extraction from `config` (the config is unchanged by a
        // status transition, so re-running the normal extractor would just re-derive the SAME rows
        // — it's the retraction itself, not a re-derivation, that's the fix here).
        //
        // `trashWidgetInstance` deliberately does NOT do this: trash is soft/reversible (EC-07 — a
        // trashed target's placements degrade to the REQ-28 placeholder and recover automatically
        // if the instance is restored), so its own outgoing refs must stay intact for that restore
        // to be meaningful. Only the permanent step retracts.
        onWritten: (entry) => deps.entryRefsRepo.replaceForSource({ workspaceId: input.workspaceId, sourceEntryId: entry.id, refs: [] }),
      },
      input: {
        actorId: input.actor.principalId,
        workspaceId: input.workspaceId,
        id: input.widgetInstanceId,
        fieldsJson: buildWidgetInstanceFieldsJson({ ...payload, status: "purged" }),
        expectedVersion: current.version,
        owner: WIDGET_FIELD_NAMESPACE,
      },
    });
    if (!result.ok) throw result.error;
  });
}
