import type { ClockPort, IdGeneratorPort, UUID } from "@jini-ai/cms/core";
import {
  executeCommand,
  type AuthorizeFn,
  type CommandActor,
  type ChangeSetRepoPort,
} from "../../contracts/core/commands/index.js";
import { FormDefinitionNotFoundError, FormFieldValidationError } from "./errors.js";
import { validateFieldDescriptors } from "./forms.js";
import type { FormDefinitionRepoPort } from "./ports.js";
import type {
  FieldDescriptor,
  FormDefinitionRecord,
  FormDefinitionStatus,
  NotifyConfig,
} from "./types.js";

/**
 * @file `write-service.ts` — the admin-CRUD write chokepoint (SPEC-010 REQ-01..04, ADR-PIPE-010).
 *
 * Purpose:
 * `createFormDefinition`/`updateFormDefinition`/`setFormDefinitionStatus`, each wrapping the
 * existing core/commands `executeCommand` gateway (mirrors `posts/create.ts`'s pattern — the
 * gateway captures the auditable change-set record, authorizes `admin.forms.manage`, and enqueues
 * `change-set.applied` onto the outbox). Never exposes a delete (INV-08) — the repo port itself
 * has no delete method to call.
 *
 * Slug-uniqueness relies on the DB unique index (`db/schema.ts`), not an app-level check
 * (behavior.spec.md §6.1) — `repo.memory.ts`/`repo.sqlite.ts` both map a conflicting insert to
 * `FormSlugConflictError`, which this file lets propagate unchanged out of `mutation.execute()`.
 */

export interface FormWriteServiceDeps {
  repo: FormDefinitionRepoPort;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  changeSets: ChangeSetRepoPort;
  outbox?: import("@jini-ai/cms/core").OutboxPort;
  authorize: AuthorizeFn;
}

// See `agent-tools.ts` — exported so the published tool schemas cannot drift from these bounds.
export const MAX_NOTIFY_RECIPIENTS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MIN_NAME_LENGTH = 1;
export const MAX_NAME_LENGTH = 200;

/** Route sentinel the admin Forms editor reserves for its create-mode URL (`panels.tsx`'s forms
 *  route; `FormEditor.tsx`'s `formId === "new"` guard). Once the admin GET route resolves a form
 *  by slug before falling back to id (ui-fixes-backlog.md #8, `get-by-id.ts`), a form actually
 *  slugged "new" would be permanently unreachable at its own URL — it would always render the
 *  blank create form instead of loading the saved one. Rejected here, the one place a slug is
 *  ever chosen (creation only; slug is immutable after — see `updateFormDefinition` below, which
 *  never re-validates a slug against this set since it always re-passes back `existing.slug`),
 *  rather than guarded in the admin UI alone — `agent-tools.ts`'s `createForm` tool writes through
 *  this same function and has no UI layer to catch it first. */
const RESERVED_SLUGS = new Set(["new"]);

function defaultNotify(): NotifyConfig {
  return { enabled: false, recipients: [] };
}

function validateNotify(notify: NotifyConfig | undefined): NotifyConfig {
  const resolved = notify ?? defaultNotify();
  if (resolved.recipients.length > MAX_NOTIFY_RECIPIENTS) {
    throw new FormFieldValidationError(
      `notify.recipients may not exceed ${MAX_NOTIFY_RECIPIENTS} addresses`,
      [{ field: "notify.recipients", reason: `at most ${MAX_NOTIFY_RECIPIENTS} recipients are allowed` }]
    );
  }
  for (const recipient of resolved.recipients) {
    if (!EMAIL_PATTERN.test(recipient)) {
      throw new FormFieldValidationError(`'${recipient}' is not a valid email address`, [
        { field: "notify.recipients", reason: `'${recipient}' is not a valid email address` },
      ]);
    }
  }
  return resolved;
}

function validateNameAndSlug(name: string, slug: string): void {
  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    throw new FormFieldValidationError(`name must be ${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} characters`, [
      { field: "name", reason: `must be ${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} characters` },
    ]);
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new FormFieldValidationError("slug must match ^[a-z0-9][a-z0-9-]{0,63}$", [
      { field: "slug", reason: "must match ^[a-z0-9][a-z0-9-]{0,63}$" },
    ]);
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new FormFieldValidationError(`slug '${slug}' is reserved`, [
      { field: "slug", reason: `'${slug}' is reserved for the admin editor's own URL` },
    ]);
  }
}

function assertValidFields(fields: FieldDescriptor[]): void {
  const validation = validateFieldDescriptors(fields);
  if (!validation.valid) {
    throw new FormFieldValidationError("one or more field descriptors are invalid", validation.fieldErrors);
  }
}

export interface CreateFormDefinitionRequired {
  deps: FormWriteServiceDeps;
  input: {
    workspaceId: UUID;
    actor: CommandActor;
    name: string;
    slug: string;
    fields: FieldDescriptor[];
    notify?: NotifyConfig;
    idempotencyKey?: string;
  };
}

/** REQ-01/AC-01/AC-02 — validate -> executeCommand(authorize admin.forms.manage) -> insert. */
export async function createFormDefinition(
  required: CreateFormDefinitionRequired
): Promise<{ definition: FormDefinitionRecord }> {
  const { deps, input } = required;
  validateNameAndSlug(input.name, input.slug);
  assertValidFields(input.fields);
  const notify = validateNotify(input.notify);

  const definitionId = deps.idGen.newId();

  const { result } = await executeCommand({
    deps: {
      clock: deps.clock,
      idGen: deps.idGen,
      changeSets: deps.changeSets,
      outbox: deps.outbox,
      authorize: deps.authorize,
    },
    command: {
      workspaceId: input.workspaceId,
      actor: input.actor,
      summary: `Create form definition '${input.slug}'`,
      idempotencyKey: input.idempotencyKey,
      permission: "admin.forms.manage",
    },
    mutation: {
      entityType: "form_definition",
      entityId: definitionId,
      operation: "create",
      captureInverse: async () => null,
      execute: async () => {
        const now = deps.clock.nowIso();
        const definition: FormDefinitionRecord = {
          id: definitionId,
          workspaceId: input.workspaceId,
          name: input.name,
          slug: input.slug,
          fields: input.fields,
          notify,
          status: "active",
          createdAt: now,
          updatedAt: now,
        };
        await deps.repo.create(definition);
        return { definition };
      },
    },
  });

  return result;
}

export interface UpdateFormDefinitionRequired {
  deps: FormWriteServiceDeps;
  input: {
    workspaceId: UUID;
    actor: CommandActor;
    formId: UUID;
    /**
     * `slug` is deliberately typed loosely (`Record<string, unknown>`-compatible) so a caller
     * that (in violation of the API contract) still sends `slug` is silently ignored rather than
     * accepted — behavior.spec.md §1.1 requires this to never change the stored slug, and picks
     * "ignored" over "rejected" (either is constitution-compliant; this file documents the choice).
     */
    patch: {
      name?: string;
      fields?: FieldDescriptor[];
      notify?: NotifyConfig;
      slug?: string;
    };
    idempotencyKey?: string;
  };
}

/** REQ-04, behavior.spec.md §1.1/§1.2 — slug is immutable; field-id removal is rejected. */
export async function updateFormDefinition(
  required: UpdateFormDefinitionRequired
): Promise<{ definition: FormDefinitionRecord }> {
  const { deps, input } = required;

  const { result } = await executeCommand({
    deps: {
      clock: deps.clock,
      idGen: deps.idGen,
      changeSets: deps.changeSets,
      outbox: deps.outbox,
      authorize: deps.authorize,
    },
    command: {
      workspaceId: input.workspaceId,
      actor: input.actor,
      summary: `Update form definition '${input.formId}'`,
      idempotencyKey: input.idempotencyKey,
      permission: "admin.forms.manage",
    },
    mutation: {
      entityType: "form_definition",
      entityId: input.formId,
      operation: "update",
      captureInverse: async () => null,
      execute: async () => {
        const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.formId });
        if (!existing) {
          throw new FormDefinitionNotFoundError(`form definition '${input.formId}' was not found`);
        }

        const name = input.patch.name !== undefined ? input.patch.name : existing.name;
        if (input.patch.name !== undefined) {
          validateNameAndSlug(name, existing.slug);
        }

        let fields = existing.fields;
        if (input.patch.fields !== undefined) {
          assertValidFields(input.patch.fields);
          const existingIds = new Set(existing.fields.map((f) => f.id));
          const newIds = new Set(input.patch.fields.map((f) => f.id));
          const missing = [...existingIds].filter((id) => !newIds.has(id));
          if (missing.length > 0) {
            throw new FormFieldValidationError(
              `patch omits existing field id(s): ${missing.join(", ")} (behavior.spec.md §1.2)`,
              missing.map((id) => ({ field: id, reason: "existing field ids cannot be removed" }))
            );
          }
          fields = input.patch.fields;
        }

        const notify = input.patch.notify !== undefined ? validateNotify(input.patch.notify) : existing.notify;

        // behavior.spec.md §1.1 — `slug` is never accepted from a patch; it is always ignored.
        const definition: FormDefinitionRecord = {
          ...existing,
          name,
          fields,
          notify,
          slug: existing.slug,
          updatedAt: deps.clock.nowIso(),
        };
        await deps.repo.update(definition);
        return { definition };
      },
    },
  });

  return result;
}

export interface SetFormDefinitionStatusRequired {
  deps: FormWriteServiceDeps;
  input: {
    workspaceId: UUID;
    actor: CommandActor;
    formId: UUID;
    status: FormDefinitionStatus;
    idempotencyKey?: string;
  };
}

/** REQ-04/INV-08 — flips `active` ⇄ `disabled`; never deletes the row. */
export async function setFormDefinitionStatus(
  required: SetFormDefinitionStatusRequired
): Promise<{ definition: FormDefinitionRecord }> {
  const { deps, input } = required;

  const { result } = await executeCommand({
    deps: {
      clock: deps.clock,
      idGen: deps.idGen,
      changeSets: deps.changeSets,
      outbox: deps.outbox,
      authorize: deps.authorize,
    },
    command: {
      workspaceId: input.workspaceId,
      actor: input.actor,
      summary: `Set form definition '${input.formId}' status to '${input.status}'`,
      idempotencyKey: input.idempotencyKey,
      permission: "admin.forms.manage",
    },
    mutation: {
      entityType: "form_definition",
      entityId: input.formId,
      operation: "update",
      captureInverse: async () => null,
      execute: async () => {
        const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.formId });
        if (!existing) {
          throw new FormDefinitionNotFoundError(`form definition '${input.formId}' was not found`);
        }
        const definition: FormDefinitionRecord = {
          ...existing,
          status: input.status,
          updatedAt: deps.clock.nowIso(),
        };
        await deps.repo.update(definition);
        return { definition };
      },
    },
  });

  return result;
}
