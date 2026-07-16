import type { ClockPort } from "../../core/ports";
import {
  ContentTypeNotActiveError,
  ContentTypeNotFoundError,
  EntryFieldValidationError,
  EntryNotFoundError,
  EntrySlugConflictError,
  ForbiddenError,
  VersionConflictError,
} from "./errors";
import { validateFieldsAgainstSchema } from "./field-validation";
import type { ActorIdentityInput, EntryRecord, OwningContentType, Result } from "./types";

/**
 * @file REQ-13/14/19/28 (SPEC-020) — the `entries` write chokepoint: `createEntry`,
 * `updateEntry`, `publishEntry`, `unpublishEntry` (ADR-022 §1/§2/§4, ADR-043 §4).
 *
 * Purpose:
 * The ONLY path that creates or mutates an `entries` row. `createEntry` validates the owning
 * content type exists IN THIS WORKSPACE (INV-01 — a soft polymorphic reference, so a same-key type
 * owned by a different workspace must never be silently accepted), is `active` (REQ-10 — new-entry
 * creation is blocked for both `deprecated` and `tombstone` owning types), and that `(workspaceId,
 * type, slug)` is unique (AC-21) before writing.
 *
 * `updateEntry`/`publishEntry`/`unpublishEntry` invert REQ-10's rule per REQ-28: only a
 * `tombstone` owning type blocks these (AC-44/AC-45); `deprecated` blocks none of them (AC-46) —
 * deprecation only ever stops NEW entries, never touches entries that already exist.
 *
 * How it relates to the project:
 * `deps.watermark` (SPEC-016 REQ-01/INV-08) and the actor-identity delegation fields mirror
 * `features/content-types/write-service.ts`'s identical optional/additive shape —
 * `watermark-stamping.integration.test.ts` exercises both packages side by side to prove they
 * share the same chokepoint discipline.
 *
 * Architectural role:
 * `features/entries` domain logic. Depends only on `core/ports` and this package's own
 * `errors.ts`/`field-validation.ts`/`types.ts` — never on `features/content-types`' write path,
 * only its read-only `OwningContentType` type shape.
 */

export type AuthorizeFn = (params: {
  principalId: string;
  permission: string;
  workspaceId: string;
}) => Promise<{ allowed: boolean; reason: string }>;

export interface EntryRevisionInput {
  entryId: string;
  workspaceId: string;
  op: "create" | "update" | "publish" | "unpublish";
  stateJson: EntryRecord;
  actorId: string;
  delegatedByWorkspaceId: string | null;
  delegatedById: string | null;
  recordedAt: string;
}

export interface EntryRepoPort {
  findBySlug(params: { workspaceId: string; type: string; slug: string }): Promise<EntryRecord | null>;
  findById(params: { workspaceId: string; id: string }): Promise<EntryRecord | null>;
  save(row: EntryRecord): Promise<void>;
  appendRevision(revision: EntryRevisionInput): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

export interface ContentTypeLookupPort {
  findByKey(params: { workspaceId: string; key: string }): Promise<OwningContentType | null>;
}

export interface OutboxPort {
  enqueue(event: { name: string; payload: Record<string, unknown> }): Promise<void>;
}

/** Optional (SPEC-016 REQ-01/INV-08) — advances `storage_write_watermark` by exactly 1 when supplied. */
export interface WatermarkPort {
  stampWatermark(input: { workspaceId: string }): Promise<number>;
}

function delegationFields(input: ActorIdentityInput): { delegatedByWorkspaceId: string | null; delegatedById: string | null } {
  return {
    delegatedByWorkspaceId: input.delegatedByWorkspaceId ?? null,
    delegatedById: input.delegatedById ?? null,
  };
}

export interface CreateEntryRequired {
  deps: {
    entryRepo: EntryRepoPort;
    contentTypeRepo: ContentTypeLookupPort;
    clock: ClockPort;
    ids: { newId: () => string };
    authorize: AuthorizeFn;
    outbox: OutboxPort;
    watermark?: WatermarkPort;
  };
  input: ActorIdentityInput & {
    workspaceId: string;
    type: string;
    slug: string;
    title: string;
    fieldsJson: unknown;
    bodyJson?: unknown;
  };
}

/**
 * REQ-13/14/19 — creates a new entry. Order: authorize -> owning-type exists AND is owned by this
 * workspace (INV-01) -> owning-type is `active` (REQ-10) -> `fieldsJson` validates against the
 * type's current schema -> `(workspaceId, type, slug)` uniqueness (AC-21) -> same-tx write +
 * revision (+ watermark) -> `entry.created` outbox event (AC-27).
 *
 * @complexity O(1) plus one content-type read, one field-validation pass, one slug lookup, and one
 * same-tx write pair.
 * @overallScore 100
 */
export async function createEntry(required: CreateEntryRequired): Promise<Result<{ entry: EntryRecord }, Error>> {
  const { deps, input } = required;

  const authResult = await deps.authorize({ principalId: input.actorId, permission: "admin.collections.manage", workspaceId: input.workspaceId });
  if (!authResult.allowed) {
    return { ok: false, error: new ForbiddenError(`principal '${input.actorId}' cannot create an entry (${authResult.reason})`) };
  }

  const contentType = await deps.contentTypeRepo.findByKey({ workspaceId: input.workspaceId, key: input.type });
  if (!contentType || contentType.workspaceId !== input.workspaceId) {
    return { ok: false, error: new ContentTypeNotFoundError(`content type '${input.type}' was not found in workspace '${input.workspaceId}'`) };
  }
  if (contentType.status !== "active") {
    return { ok: false, error: new ContentTypeNotActiveError(`content type '${input.type}' is not active; new entries cannot be created (REQ-10)`) };
  }

  const validation = validateFieldsAgainstSchema({ schema: contentType.fields, fieldsJson: input.fieldsJson });
  if (!validation.valid) {
    return { ok: false, error: new EntryFieldValidationError(validation.fieldErrors) };
  }

  const existing = await deps.entryRepo.findBySlug({ workspaceId: input.workspaceId, type: input.type, slug: input.slug });
  if (existing) {
    return { ok: false, error: new EntrySlugConflictError(`an entry with slug '${input.slug}' already exists for type '${input.type}' in workspace '${input.workspaceId}'`) };
  }

  const now = deps.clock.nowIso();
  const entry: EntryRecord = {
    id: deps.ids.newId(),
    workspaceId: input.workspaceId,
    type: input.type,
    slug: input.slug,
    status: "draft",
    title: input.title,
    bodyJson: input.bodyJson ?? null,
    fieldsJson: input.fieldsJson,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };

  await deps.entryRepo.transaction(async () => {
    await deps.entryRepo.save(entry);
    await deps.entryRepo.appendRevision({
      entryId: entry.id,
      workspaceId: input.workspaceId,
      op: "create",
      stateJson: entry,
      actorId: input.actorId,
      ...delegationFields(input),
      recordedAt: now,
    });
    if (deps.watermark) await deps.watermark.stampWatermark({ workspaceId: input.workspaceId });
  });

  await deps.outbox.enqueue({ name: "entry.created", payload: { workspaceId: input.workspaceId, entryId: entry.id, type: input.type, slug: input.slug } });

  return { ok: true, value: { entry } };
}

interface ExistingEntryTransitionDeps {
  entryRepo: EntryRepoPort;
  contentTypeRepo: ContentTypeLookupPort;
  clock: ClockPort;
  authorize: AuthorizeFn;
  outbox: OutboxPort;
  watermark?: WatermarkPort;
}

/**
 * REQ-28's shared resolve step for `updateEntry`/`publishEntry`/`unpublishEntry`: authorize ->
 * find the entry -> find its owning type -> reject ONLY if that type is `tombstone`
 * (`deprecated` blocks nothing here, unlike `createEntry`'s REQ-10 rule) -> `expectedVersion`
 * check.
 *
 * @complexity O(1) plus one entry read and one content-type read.
 * @overallScore 100
 */
async function resolveExistingEntryForTransition(
  deps: ExistingEntryTransitionDeps,
  input: { workspaceId: string; actorId: string; id: string; expectedVersion: number }
): Promise<Result<{ entry: EntryRecord; contentType: OwningContentType | null }, Error>> {
  const authResult = await deps.authorize({ principalId: input.actorId, permission: "admin.collections.manage", workspaceId: input.workspaceId });
  if (!authResult.allowed) {
    return { ok: false, error: new ForbiddenError(`principal '${input.actorId}' cannot modify entry '${input.id}' (${authResult.reason})`) };
  }

  const entry = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!entry) {
    return { ok: false, error: new EntryNotFoundError(`entry '${input.id}' was not found in workspace '${input.workspaceId}'`) };
  }

  const contentType = await deps.contentTypeRepo.findByKey({ workspaceId: input.workspaceId, key: entry.type });
  if (contentType && contentType.status === "tombstone") {
    return { ok: false, error: new ContentTypeNotActiveError(`content type '${entry.type}' is tombstoned; existing entries cannot be updated/published/unpublished (REQ-28)`) };
  }

  if (input.expectedVersion !== entry.version) {
    return { ok: false, error: new VersionConflictError(`expected version ${input.expectedVersion} for entry '${input.id}', found ${entry.version}`) };
  }

  return { ok: true, value: { entry, contentType } };
}

export interface UpdateEntryRequired {
  deps: ExistingEntryTransitionDeps;
  input: ActorIdentityInput & {
    workspaceId: string;
    id: string;
    title?: string;
    fieldsJson?: unknown;
    expectedVersion: number;
  };
}

/**
 * REQ-28 — updates an existing entry's `title`/`fieldsJson` (only the fields supplied are
 * changed). Rejected `ContentTypeNotActiveError` only if the owning type is `tombstone`
 * (AC-44/EC-13); a `deprecated` owning type is fine (AC-46).
 *
 * @complexity O(1) plus the shared resolve step and, when `fieldsJson` is supplied, one
 * field-validation pass.
 * @overallScore 100
 */
export async function updateEntry(required: UpdateEntryRequired): Promise<Result<{ entry: EntryRecord }, Error>> {
  const { deps, input } = required;

  const resolved = await resolveExistingEntryForTransition(deps, input);
  if (!resolved.ok) return resolved;
  const { entry: current, contentType } = resolved.value;

  let fieldsJson = current.fieldsJson;
  if (input.fieldsJson !== undefined) {
    const validation = validateFieldsAgainstSchema({ schema: contentType?.fields ?? [], fieldsJson: input.fieldsJson });
    if (!validation.valid) {
      return { ok: false, error: new EntryFieldValidationError(validation.fieldErrors) };
    }
    fieldsJson = input.fieldsJson;
  }

  const now = deps.clock.nowIso();
  const updated: EntryRecord = {
    ...current,
    title: input.title ?? current.title,
    fieldsJson,
    updatedAt: now,
    version: current.version + 1,
  };

  await deps.entryRepo.transaction(async () => {
    await deps.entryRepo.save(updated);
    await deps.entryRepo.appendRevision({
      entryId: current.id,
      workspaceId: input.workspaceId,
      op: "update",
      stateJson: updated,
      actorId: input.actorId,
      ...delegationFields(input),
      recordedAt: now,
    });
    if (deps.watermark) await deps.watermark.stampWatermark({ workspaceId: input.workspaceId });
  });

  await deps.outbox.enqueue({ name: "entry.updated", payload: { workspaceId: input.workspaceId, entryId: current.id } });

  return { ok: true, value: { entry: updated } };
}

export interface PublishUnpublishEntryRequired {
  deps: ExistingEntryTransitionDeps;
  input: ActorIdentityInput & { workspaceId: string; id: string; expectedVersion: number };
}

async function transitionEntryStatus(
  required: PublishUnpublishEntryRequired,
  target: { status: "published" | "unpublished"; op: "publish" | "unpublish"; eventName: "entry.published" | "entry.unpublished" }
): Promise<Result<{ entry: EntryRecord }, Error>> {
  const { deps, input } = required;

  const resolved = await resolveExistingEntryForTransition(deps, input);
  if (!resolved.ok) return resolved;
  const { entry: current } = resolved.value;

  const now = deps.clock.nowIso();
  const updated: EntryRecord = {
    ...current,
    status: target.status,
    publishedAt: target.status === "published" ? now : current.publishedAt,
    updatedAt: now,
    version: current.version + 1,
  };

  await deps.entryRepo.transaction(async () => {
    await deps.entryRepo.save(updated);
    await deps.entryRepo.appendRevision({
      entryId: current.id,
      workspaceId: input.workspaceId,
      op: target.op,
      stateJson: updated,
      actorId: input.actorId,
      ...delegationFields(input),
      recordedAt: now,
    });
    if (deps.watermark) await deps.watermark.stampWatermark({ workspaceId: input.workspaceId });
  });

  await deps.outbox.enqueue({ name: target.eventName, payload: { workspaceId: input.workspaceId, entryId: current.id } });

  return { ok: true, value: { entry: updated } };
}

/**
 * REQ-28 — flips an entry to `published`. Rejected `ContentTypeNotActiveError` only if the owning
 * type is `tombstone` (AC-45), with NO outbox event enqueued on rejection.
 *
 * @complexity O(1) plus the shared resolve step and one same-tx write pair.
 * @overallScore 100
 */
export async function publishEntry(required: PublishUnpublishEntryRequired): Promise<Result<{ entry: EntryRecord }, Error>> {
  return transitionEntryStatus(required, { status: "published", op: "publish", eventName: "entry.published" });
}

/**
 * REQ-28 — flips an entry to `unpublished`. Rejected `ContentTypeNotActiveError` only if the
 * owning type is `tombstone` (AC-45), with NO outbox event enqueued on rejection.
 *
 * @complexity O(1) plus the shared resolve step and one same-tx write pair.
 * @overallScore 100
 */
export async function unpublishEntry(required: PublishUnpublishEntryRequired): Promise<Result<{ entry: EntryRecord }, Error>> {
  return transitionEntryStatus(required, { status: "unpublished", op: "unpublish", eventName: "entry.unpublished" });
}
