import type { Clock, IdGenerator } from "@jini-ai/core/primitives";
import { validateSubmissionPayload, type FieldError, type FormAnswer, type FormDefinitionRecord, type FormDefinitionRepoPort, type FormOutboxPort, type FormSubmissionRepoPort } from "@jini-ai/cms/forms";
import { htmlSubmissionDefinition } from "@jini-ai/cms/forms/html";

/**
 * @file Imports submissions a form destination stored where Tovu's server does not run (a static
 * export), into the same submissions store the live endpoint writes. Generic: no host is named here.
 * Each row is validated with the live endpoint's own validator. The store has no status column, so
 * an invalid row is still imported (its declared fields only) and listed in the result with its
 * field errors rather than dropped. A receipt keyed by (workspace, destination, remote id) makes the
 * import idempotent, and it outlives Trash and purge, so a retried pull never resurrects a deleted row.
 */

/** One stored remote submission, before validation. Structurally the deploy target's row shape. */
export interface RemoteSubmissionInput {
  readonly id: string;
  readonly formSlug: string;
  readonly answers: Readonly<Record<string, unknown>>;
  readonly submittedAt: string;
  readonly ip: string | null;
}

/** The dedupe receipt store. `claim` is atomic: false means this remote row was already imported. */
export interface FormSubmissionReceiptPort {
  claim(required: { workspaceId: string; destinationKey: string; remoteId: string; submissionId: string; importedAt: string }, optional?: Record<string, never>): Promise<boolean>;
}

export interface ImportRemoteSubmissionsDeps {
  readonly definitionRepo: Pick<FormDefinitionRepoPort, "findBySlug">;
  /** `transaction` must be the store's own: the receipt, the row and its event commit together. */
  readonly submissionRepo: Pick<FormSubmissionRepoPort, "create" | "transaction">;
  readonly receipts: FormSubmissionReceiptPort;
  readonly outbox: FormOutboxPort;
  readonly clock: Clock;
  readonly idGen: IdGenerator;
}

export interface RemoteImportResult {
  /** Remote ids now durably in Tovu (new or already imported): safe to acknowledge at the host. */
  readonly committedIds: string[];
  readonly imported: number;
  readonly duplicates: number;
  /** Imported, but the live validator rejected them; review these in the admin. */
  readonly invalid: { remoteId: string; formSlug: string; submissionId: string; fieldErrors: FieldError[] }[];
  /** Not imported and not acknowledged (the form no longer exists); they stay at the host. */
  readonly skipped: { remoteId: string; formSlug: string; reason: "unknown_form" }[];
}

/**
 * Imports one page of remote rows. A failure on one row propagates: rows committed earlier in the
 * page stay committed but are not acknowledged, so the next pull fetches them again and their
 * receipts count them as duplicates.
 * @complexity O(rows * fields), with one definition read and one transaction per row.
 */
export async function importRemoteFormSubmissions(
  required: { deps: ImportRemoteSubmissionsDeps; workspaceId: string; destinationKey: string; items: readonly RemoteSubmissionInput[] },
  _optional: Record<string, never> = {},
): Promise<RemoteImportResult> {
  const { deps, workspaceId, destinationKey, items } = required;
  const result: { -readonly [K in keyof RemoteImportResult]: RemoteImportResult[K] } = { committedIds: [], imported: 0, duplicates: 0, invalid: [], skipped: [] };
  const definitions = new Map<string, FormDefinitionRecord | null>();
  for (const item of items) {
    if (!definitions.has(item.formSlug)) definitions.set(item.formSlug, await deps.definitionRepo.findBySlug({ workspaceId, slug: item.formSlug }));
    const definition = definitions.get(item.formSlug);
    if (!definition) { result.skipped.push({ remoteId: item.id, formSlug: item.formSlug, reason: "unknown_form" }); continue; }
    const outcome = await importOne({ deps, workspaceId, destinationKey, item, definition });
    result.committedIds.push(item.id);
    if (outcome.kind === "duplicate") { result.duplicates += 1; continue; }
    result.imported += 1;
    if (outcome.fieldErrors) result.invalid.push({ remoteId: item.id, formSlug: item.formSlug, submissionId: outcome.submissionId, fieldErrors: outcome.fieldErrors });
  }
  return result;
}

/** Validate, then claim the receipt, write the row and enqueue `form.submission.received` in one
 * transaction, the same event shape the live submit path emits, so notifications fire once.
 * @complexity O(fields). */
async function importOne(
  required: { deps: ImportRemoteSubmissionsDeps; workspaceId: string; destinationKey: string; item: RemoteSubmissionInput; definition: FormDefinitionRecord },
  _optional: Record<string, never> = {},
): Promise<{ kind: "duplicate" } | { kind: "imported"; submissionId: string; fieldErrors?: FieldError[] }> {
  const { deps, workspaceId, destinationKey, item } = required;
  const definition = htmlSubmissionDefinition({ definition: required.definition, body: { ...item.answers } });
  const validation = validateSubmissionPayload({ definition, body: { ...item.answers } });
  const data = validation.valid ? validation.data : declaredAnswers({ definition, answers: item.answers });
  const now = new Date(deps.clock.nowMs()).toISOString();
  const submissionId = deps.idGen.newId();
  const write = async (): Promise<boolean> => {
    if (!await deps.receipts.claim({ workspaceId, destinationKey, remoteId: item.id, submissionId, importedAt: now })) return false;
    await deps.submissionRepo.create({ id: submissionId, workspaceId, formDefinitionId: definition.id, data, sourceIp: item.ip, submittedAt: submittedAt({ value: item.submittedAt, now }) });
    await deps.outbox.enqueue({ id: deps.idGen.newId(), name: "form.submission.received", occurredAt: now, workspaceId, aggregateId: submissionId,
      payload: { workspaceId, formDefinitionId: definition.id, submissionId } });
    return true;
  };
  // Called as a method, never detached: the SQL store's `transaction` reads `this.kernel`.
  const claimed = deps.submissionRepo.transaction ? await deps.submissionRepo.transaction(write) : await write();
  if (!claimed) return { kind: "duplicate" };
  return { kind: "imported", submissionId, ...(validation.valid ? {} : { fieldErrors: validation.fieldErrors }) };
}

/** An invalid row keeps only declared fields with text values, so stored answers never gain keys
 * the form does not define. @complexity O(fields). */
function declaredAnswers({ definition, answers }: { definition: FormDefinitionRecord; answers: Readonly<Record<string, unknown>> }, _optional = {}): Record<string, FormAnswer> {
  const data: Record<string, FormAnswer> = {};
  for (const field of definition.fields) {
    const value = answers[field.id];
    if (typeof value === "string" || (Array.isArray(value) && value.every((entry) => typeof entry === "string"))) data[field.id] = value as FormAnswer;
  }
  return data;
}

/** The host's receive time when it is a real timestamp; otherwise the import time. @complexity O(1). */
function submittedAt({ value, now }: { value: string; now: string }, _optional = {}): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : now;
}

/** One destination's outcome in a pull. `error` is a person-facing reason without any key. */
export interface FormDestinationPullReport {
  readonly targetId: string;
  readonly url: string;
  readonly pulled: number;
  readonly imported: number;
  readonly duplicates: number;
  readonly acknowledged: number;
  /** More rows are waiting at the host than one pull reads. */
  readonly hasMore: boolean;
  readonly invalid: RemoteImportResult["invalid"];
  readonly skipped: RemoteImportResult["skipped"];
  readonly error?: string;
}

/** Pulls every published destination's pending submissions (or one target's) into this site. The
 * agent tool and the admin route both call this one composed port. */
export interface FormSubmissionsPullPort {
  pull(required: { workspaceId: string }, optional?: { targetId?: string }): Promise<{ readonly message: string; readonly destinations: readonly FormDestinationPullReport[] }>;
}
