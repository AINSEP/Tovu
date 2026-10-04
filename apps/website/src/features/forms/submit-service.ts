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
import { htmlSubmissionDefinition } from "./html-submission-adapter.js";

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

/**
 * Binds Tovu's outbox delivery to Jini's anonymous submission service. The package awaits the
 * object-shaped limiter check and queues delivery without awaiting notifications.
 * @returns Accepted for a valid submission or honeypot discard; package errors propagate.
 * @complexity O(f + k) package validation; fixed-count persistence effects, background dispatch.
 * @example await submitForm({ deps, input: { workspaceId, slug, body, sourceIp } });
 */
export function submitForm(
  { deps, input }: SubmitFormRequired,
  { logger = { warn: ({ message }, { error } = {}) => console.warn(message, error) } }: { logger?: Pick<Logger, "warn"> } = {},
): Promise<{ status: "accepted" }> {
  return submitPackageForm({
    deps: {
      definitionRepo: {
        findById: (target) => deps.definitionRepo.findById(target),
        findBySlug: async (target) => {
          const definition = await deps.definitionRepo.findBySlug(target);
          return definition ? htmlSubmissionDefinition({ definition, body: input.body }) : null;
        },
        list: (target) => deps.definitionRepo.list(target),
        isSlugTaken: (target) => deps.definitionRepo.isSlugTaken(target),
        create: (record) => deps.definitionRepo.create(record),
        update: (record) => deps.definitionRepo.update(record),
      },
      submissionRepo: adaptFormSubmissionRepo({ repo: deps.submissionRepo }),
      outbox: deps.outbox,
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
    input,
  });
}
