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
import type { Logger } from "@jini-ai/core/primitives";
// Anonymous submission invariants: Jini/packages/cms/forms/src/submit-service.ts (SPEC-010, ADR-PIPE-010).
import {
  submitForm as submitPackageForm,
  type SubmitFormInput,
  type RateLimiterPort,
  type FormDefinitionRepoPort,
} from "@jini-ai/cms-forms";
import type { Clock as ClockPort, IdGenerator as IdGeneratorPort } from "@jini-ai/core/primitives";
import type { EventBusPort, OutboxPort } from "@jini-ai/cms/core";
import { processOutbox } from "../../contracts/core/events/index.js";
import { adaptFormSubmissionRepo, type FormSubmissionRepoPort } from "./ports.js";
import { assertSubmissionEmails } from "./submission-email-validation.js";
import { htmlSubmissionDefinition } from "./html-submission-adapter.js";
import {
  createSubmissionAttempts,
  DUPLICATE_ATTEMPT,
  FORM_ATTEMPT_FIELD,
  submissionAttemptKey,
  type SubmissionAttempts,
} from "./submission-attempts.js";

/** Existing host ports; the package receives an explicitly bound background dispatcher. */
export interface SubmitFormDeps {
  definitionRepo: FormDefinitionRepoPort;
  submissionRepo: FormSubmissionRepoPort;
  outbox: OutboxPort;
  bus: EventBusPort;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  rateLimiter: RateLimiterPort;
}
export interface SubmitFormRequired { deps: SubmitFormDeps; input: SubmitFormInput; }

/** Thrown out of the package's transaction hook to stop it before anything is written or dispatched. */
class DuplicateFormSubmission extends Error {}

/** One attempt store per submission store: the same process-lifetime scope the store has. */
const attemptsByStore = new WeakMap<FormSubmissionRepoPort, SubmissionAttempts>();

function attemptsFor(store: FormSubmissionRepoPort): SubmissionAttempts {
  let attempts = attemptsByStore.get(store);
  if (!attempts) attemptsByStore.set(store, (attempts = createSubmissionAttempts()));
  return attempts;
}

/**
 * Binds Tovu's outbox delivery to Jini's anonymous submission service. The package awaits the
 * object-shaped limiter check and queues delivery without awaiting notifications.
 *
 * A repeat of an attempt accepted within the window (same token, or for a request without one the
 * same IP and body) is answered exactly like the original — `accepted` — with no row, no event and
 * no notification. It still passes the slug, honeypot, validation and rate checks first (and so
 * consumes a rate-limit slot, as any request does): the attempt is claimed only where the package
 * opens its persistence transaction, and a copy that must wait for the first copy waits there,
 * outside any database transaction. The `_attempt` field is removed from the body before
 * validation; it is never stored.
 * @returns Accepted for a valid submission, a duplicate, or a honeypot discard; package errors propagate.
 * @complexity O(f + k) package validation plus O(b log b) attempt hashing; fixed-count persistence
 * effects, background dispatch.
 * @example await submitForm({ deps, input: { workspaceId, slug, body, sourceIp } });
 */
export async function submitForm(
  { deps, input }: SubmitFormRequired,
  {
    logger = { warn: ({ message }, { error } = {}) => console.warn(message, error) },
    attempts = attemptsFor(deps.submissionRepo),
  }: { logger?: Pick<Logger, "warn">; attempts?: SubmissionAttempts } = {},
): Promise<{ status: "accepted" }> {
  const { [FORM_ATTEMPT_FIELD]: attemptToken, ...body } = input.body;
  const submission = { ...input, body };
  try {
    return await submitPackageForm({
      deps: {
        definitionRepo: {
          findById: (target) => deps.definitionRepo.findById(target),
          findBySlug: async (target) => {
            const definition = await deps.definitionRepo.findBySlug(target);
            if (!definition) return null;
            const adapted = htmlSubmissionDefinition({ definition, body });
            assertSubmissionEmails({ definition: adapted, body }, {});
            return adapted;
          },
          list: (target) => deps.definitionRepo.list(target),
          isSlugTaken: (target) => deps.definitionRepo.isSlugTaken(target),
          create: (record) => deps.definitionRepo.create(record),
          update: (record) => deps.definitionRepo.update(record),
        },
        submissionRepo: adaptFormSubmissionRepo({ repo: deps.submissionRepo }),
        outbox: deps.outbox,
        transaction: async (work) => {
          const outcome = await attempts.once({
            key: submissionAttemptKey({ input: submission, attemptToken }),
            nowMs: () => deps.clock.nowMs(),
            submit: () => deps.submissionRepo.transaction(work),
          });
          if (outcome === DUPLICATE_ATTEMPT) throw new DuplicateFormSubmission();
          return outcome;
        },
        clock: deps.clock,
        idGen: deps.idGen,
        rateLimiter: deps.rateLimiter,
        dispatcher: {
          // INV-05/REQ-16: Jini invokes this dispatcher without awaiting delivery. The await here
          // belongs inside the background task; submitForm must never wait for mail subscribers.
          dispatch: async () => {
            await processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock });
          },
        },
        logger,
      },
      input: submission,
    });
  } catch (error) {
    if (error instanceof DuplicateFormSubmission) return { status: "accepted" };
    throw error;
  }
}
