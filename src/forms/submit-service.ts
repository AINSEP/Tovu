import { processOutbox } from "../core/events";
import type { ClockPort, EventBusPort, IdGeneratorPort, OutboxPort, UUID } from "../core/ports";
import { buildFormsRateLimitKey } from "./rate-limit-profile";
import type { RateLimiter } from "../server/middleware/rate-limit";
import {
  FormDefinitionNotFoundError,
  FormRateLimitExceededError,
  FormSubmissionValidationError,
} from "./errors";
import { isHoneypotTripped, validateSubmissionPayload } from "./forms";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "./ports";
import type { FormSubmissionRecord } from "./types";

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
 * CRITICAL (INV-05/REQ-16/AC-24, tasks.md T023): the call below is `void processOutbox(...)`, not
 * `await processOutbox(...)`. The only other extant caller of `processOutbox` in this codebase
 * (`POST /workspaces` in `server/app.ts`) awaits it — acceptable there because its one subscriber
 * is a `console.log`, but directly unacceptable here, where a subscriber calls
 * `MailerPort.send()`. Copying that pattern verbatim would silently reintroduce the exact
 * response-blocking bug REQ-16/INV-05 forbid. Do not change this to `await` — see T023/T049 for
 * the standing Code Review gate on this exact line.
 */

const HONEYPOT_KEY = "_hp";

export interface SubmitFormDeps {
  definitionRepo: FormDefinitionRepoPort;
  submissionRepo: FormSubmissionRepoPort;
  outbox: OutboxPort;
  bus: EventBusPort;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  rateLimiter: RateLimiter;
}

export interface SubmitFormInput {
  workspaceId: UUID;
  slug: string;
  body: Record<string, unknown>;
  sourceIp: string;
}

export interface SubmitFormRequired {
  deps: SubmitFormDeps;
  input: SubmitFormInput;
}

/**
 * REQ-05..09/16, INV-01/04/05/07 — see file header for the exact control-flow order and the
 * fire-and-forget requirement.
 *
 * @complexity O(1) plus `validateSubmissionPayload`'s O(n) over declared fields.
 * @overallScore 100
 */
export async function submitForm(required: SubmitFormRequired): Promise<{ status: "accepted" }> {
  const { deps, input } = required;

  // REQ-07/AC-11/AC-12/EC-03 — nonexistent and disabled slugs are indistinguishable.
  const definition = await deps.definitionRepo.findBySlug({ workspaceId: input.workspaceId, slug: input.slug });
  if (!definition || definition.status !== "active") {
    throw new FormDefinitionNotFoundError(`form '${input.slug}' was not found`);
  }

  // REQ-08/INV-04/AC-13 — honeypot check runs before validation/rate-limit/persistence; a trip
  // returns the identical accepted response with zero side effects.
  if (isHoneypotTripped({ hp: input.body[HONEYPOT_KEY] })) {
    return { status: "accepted" };
  }

  const validation = validateSubmissionPayload({ definition, body: input.body });
  if (!validation.valid) {
    throw new FormSubmissionValidationError(
      "submission failed field validation",
      validation.fieldErrors
    );
  }

  // REQ-09/INV-09 — composite (ip, formId) key so two different forms from the same IP are never
  // cross-throttled.
  const rateLimitKey = buildFormsRateLimitKey({ sourceIp: input.sourceIp, formDefinitionId: definition.id });
  const rateLimitResult = deps.rateLimiter.check(rateLimitKey);
  if (!rateLimitResult.allowed) {
    throw new FormRateLimitExceededError(
      `rate limit exceeded for form '${definition.id}'`,
      rateLimitResult.retryAfterSeconds
    );
  }

  const now = deps.clock.nowIso();
  const submissionId = deps.idGen.newId();
  const submission: FormSubmissionRecord = {
    id: submissionId,
    workspaceId: input.workspaceId,
    formDefinitionId: definition.id,
    data: validation.data,
    sourceIp: input.sourceIp,
    submittedAt: now,
  };
  await deps.submissionRepo.create(submission);

  // REQ-11/INV-07 — emitted for every accepted submission, and only for such submissions.
  await deps.outbox.enqueue({
    id: deps.idGen.newId(),
    name: "form.submission.received",
    occurredAt: now,
    workspaceId: input.workspaceId,
    aggregateId: submissionId,
    payload: { workspaceId: input.workspaceId, formDefinitionId: definition.id, submissionId },
  });

  // REQ-16/INV-05/AC-24 — fire-and-forget. See file header: this MUST stay `void`, never `await`.
  void processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock });

  return { status: "accepted" };
}
