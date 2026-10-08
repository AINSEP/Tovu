/**
 * @file `write-service.ts` — the admin-CRUD write chokepoint (SPEC-010 REQ-01..04, ADR-PIPE-010).
 *
 * Purpose:
 * `createFormDefinition`/`updateFormDefinition`/`setFormDefinitionStatus`, each wrapping the
 * existing core/commands `executeCommand` gateway (mirrors `posts/create.ts`'s pattern — the
 * gateway captures the auditable change-set record, authorizes `admin.forms.manage`, and enqueues
 * `change-set.applied` onto the outbox). Never exposes a delete: a form definition is removed
 * permanently only by a Trash purge (owner ruling 2026-09-21, superseding the original INV-08
 * "never deleted" wording) — the repo port itself has no delete method for this file to call.
 *
 * Slug-uniqueness relies on the DB unique index (`db/schema.sqlite.ts`), not an app-level check
 * (behavior.spec.md §6.1) — `repo.memory.ts`/`repo.ts` both map a conflicting insert to
 * `FormSlugConflictError`, which this file lets propagate unchanged out of `mutation.execute()`.
 */
/**
 * @file `submit-service.ts` — the sole public submission write path (SPEC-010 REQ-05..09/16,
 * ADR-PIPE-010 C-008).
 *
 * Purpose:
 * `submitForm` deliberately bypasses `executeCommand` (no actor/permission fits an anonymous
 * visitor — ADR-PIPE-010 Pattern Evaluation); mirrors `routes/site/analytics-ingest.ts`'s
 * `ingestHit` shape. Order: resolve slug -> honeypot check -> validate -> rate-limit -> persist ->
 * enqueue `form.submission.received` -> return, WITHOUT awaiting outbox drainage.
 *
 * CRITICAL (INV-05/REQ-16/AC-24, tasks.md T023): the package kicks off the bound dispatcher without
 * awaiting it. An inline route drain may await delivery when its subscribers are cheap; that is
 * directly unacceptable here, where a subscriber calls `MailerPort.send()`. Copying that pattern
 * verbatim would silently reintroduce the exact response-blocking bug REQ-16/INV-05 forbid.
 * Do not await the dispatcher at the submission boundary — see T023/T049 for the standing
 * Code Review gate on this exact line.
 *
 * Double submit (2026-10-05): a double-clicked Send posts the same form twice and the rendered form
 * ships no script, so the dedupe is server-side — see `submission-attempts.ts` for the attempt token,
 * its cached/static fallback and why it lives in process memory. Ids are random; the submission row
 * and its event are written in one transaction, so a failed enqueue leaves nothing a retry could
 * mistake for a finished submission.
 */
/** Tovu forms wiring. Domain rules, records, rendering and persistence live in @jini-ai/cms/forms. */
import { createHash } from "node:crypto";
import type { Logger } from "@jini-ai/core/primitives";
import type { EventBusPort, OutboxPort } from "@jini-ai/cms/core";
import {
  createFormDefinition as createPackageFormDefinition,
  updateFormDefinition as updatePackageFormDefinition,
  setFormDefinitionStatus as setPackageFormDefinitionStatus,
  submitForm as submitPackageForm,
  createSubmissionAttempts,
  FormFieldValidationError,
  type FormWriteServiceDeps as PackageWriteDeps,
  type CreateFormDefinitionRequired as PackageCreateRequired,
  type UpdateFormDefinitionRequired as PackageUpdateRequired,
  type SetFormDefinitionStatusRequired as PackageStatusRequired,
  type SubmitFormDeps as PackageSubmitDeps,
  type SubmitFormInput,
  type NotifyConfig,
  type SubmissionAttempts,
} from "@jini-ai/cms/forms";
import { createFormAuthoring, htmlSubmissionDefinition } from "@jini-ai/cms/forms/html";
import { processOutbox } from "../../contracts/core/events/index.js";
import { toSlug } from "../../platform/html/slug.js";
import { MAX_SUFFIX_ATTEMPTS } from "../content-duplication/derive-available-name.js";

export { FORMS_SUBMIT_PROFILE } from "./rate-limit-profile.js";

/** The admin editor uses this slug for its create screen. */
// The editor's formId === "new" guard would render a blank create form at a saved form's own URL.
// Reserve it at the shared write boundary so agent-tool creation cannot bypass a UI-only check.
// Slugs are immutable after creation; updates retain the existing slug rather than choose a new one.
const RESERVED_SLUGS = new Set(["new"]);
const FORMS_PERMISSION = "admin.forms.manage";
const authoring = createFormAuthoring({ permission: "pages.edit_html" }, {});
export const formSlugPolicy = { slugify: toSlug, maxAttempts: MAX_SUFFIX_ATTEMPTS, reservedSlugs: RESERVED_SLUGS };

/** Tovu's command-gateway adapter. Policy stays here; validation and audited writes live in Jini. */
export interface FormWriteServiceDeps extends Omit<PackageWriteDeps, "permission" | "reservedSlugs"> {
  outbox?: OutboxPort;
}
export interface CreateFormDefinitionRequired {
  deps: FormWriteServiceDeps;
  input: PackageCreateRequired["input"] & { notify?: NotifyConfig; idempotencyKey?: string };
}
export interface UpdateFormDefinitionRequired {
  deps: FormWriteServiceDeps;
  input: PackageUpdateRequired["input"] & { idempotencyKey?: string };
}
export interface SetFormDefinitionStatusRequired {
  deps: FormWriteServiceDeps;
  input: PackageStatusRequired["input"] & { idempotencyKey?: string };
}

/** Binds the Forms permission and reserved route slug to the supplied host command executor. */
function packageDeps(deps: FormWriteServiceDeps): PackageWriteDeps {
  return { ...deps, permission: FORMS_PERMISSION, reservedSlugs: RESERVED_SLUGS };
}

/** Bind host authoring/options and preserve the editor-specific reserved-slug explanation. */
export async function createFormDefinition({ deps, input }: CreateFormDefinitionRequired, _optional = {}) {
  const { notify, idempotencyKey, ...values } = input;
  try {
    return await createPackageFormDefinition({ deps: packageDeps(deps), input: values }, {
      authoring, notify, idempotencyKey, outbox: deps.outbox,
    });
  } catch (error) {
    if (error instanceof FormFieldValidationError && RESERVED_SLUGS.has(input.slug)) {
      throw new FormFieldValidationError({
        message: error.message,
        fieldErrors: error.fieldErrors.map((detail) =>
          detail.field === "slug" && detail.reason === `'${input.slug}' is reserved by the host`
            ? { ...detail, reason: `'${input.slug}' is reserved for the admin editor's own URL` }
            : detail,
        ),
      });
    }
    throw error;
  }
}

/** Authoring authorization/pre-read ordering and the single gateway decision belong to Jini. */
export function updateFormDefinition({ deps, input }: UpdateFormDefinitionRequired, _optional = {}) {
  const { idempotencyKey, ...values } = input;
  return updatePackageFormDefinition({ deps: packageDeps(deps), input: values }, {
    authoring, idempotencyKey, outbox: deps.outbox,
  });
}

/** Status changes go through the audited gateway; permanent removal belongs to Trash purge. */
export function setFormDefinitionStatus({ deps, input }: SetFormDefinitionStatusRequired, _optional = {}) {
  const { idempotencyKey, ...values } = input;
  return setPackageFormDefinitionStatus({ deps: packageDeps(deps), input: values }, { idempotencyKey, outbox: deps.outbox });
}

export interface SubmitFormDeps extends Omit<PackageSubmitDeps, "dispatcher" | "logger" | "transaction"> {
  outbox: OutboxPort;
  bus: EventBusPort;
}
export interface SubmitFormRequired { deps: SubmitFormDeps; input: SubmitFormInput; }

/** One attempt store per submission store: the same process-lifetime scope the store has. */
const attemptsByStore = new WeakMap<SubmitFormDeps["submissionRepo"], SubmissionAttempts>();
function attemptsFor(store: SubmitFormDeps["submissionRepo"]): SubmissionAttempts {
  let attempts = attemptsByStore.get(store);
  if (!attempts) {
    attempts = createSubmissionAttempts({ hash: (input) => createHash("sha256").update(input).digest("hex") }, {});
    attemptsByStore.set(store, attempts);
  }
  return attempts;
}

/** Bind HTML/email validation, same-store persistence and background outbox delivery. */
export function submitForm(
  { deps, input }: SubmitFormRequired,
  { logger = { warn: ({ message }, { error } = {}) => console.warn(message, error) }, attempts = attemptsFor(deps.submissionRepo) }:
    { logger?: Pick<Logger, "warn">; attempts?: SubmissionAttempts } = {},
) {
  // INV-05/REQ-16: Jini invokes this dispatcher without awaiting delivery. The await here
  // belongs inside the background task; submitForm must never wait for mail subscribers.
  const dispatch = async () => { await processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock }); };
  return submitPackageForm({ deps: {
    ...deps, transaction: (work) => deps.submissionRepo.transaction!(work), dispatcher: { dispatch }, logger,
  }, input }, { definitionView: htmlSubmissionDefinition, validateEmails: true, dispatch, attempts });
}
