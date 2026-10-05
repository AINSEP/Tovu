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
 * Double submit (2026-10-04): a double-clicked Send posts the same body twice, and nothing else
 * stops it — the rate limit allows 5 per minute, the honeypot only catches bots, and the rendered
 * form ships no script. The submission id is therefore DERIVED from the submission itself (see
 * {@link duplicateSubmissionId}) and written with `createOnce`, so the store's primary key drops the
 * second copy atomically, with JS disabled, on every form surface and every dialect, with no new
 * column. A per-render nonce was rejected: rendered pages are cached and statically exported, so
 * visitors would share one nonce and silently swallow each other's submissions.
 */
import { createHash } from "node:crypto";
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

/** How long an identical body from the same visitor counts as the same submission. */
export const DUPLICATE_SUBMISSION_WINDOW_MS = 60_000;

/** Thrown out of the package's `create` call to stop it before the event is enqueued. */
class DuplicateFormSubmission extends Error {}

/**
 * The id a submission is stored under: a UUID-shaped SHA-256 of workspace, slug, source IP, the
 * fixed time window and the body. Same visitor + same body + same window = same id, which is what
 * lets the primary key reject a double submit. Two visitors on one cached page differ by IP and,
 * in practice, by body; one visitor's deliberately repeated identical message within the window is
 * answered as accepted without a second row, which is the intended behavior.
 * @complexity O(b log b) for b body keys (sorted so key order cannot change the id).
 */
export function duplicateSubmissionId(
  { input, windowIndex }: { input: SubmitFormInput; windowIndex: number },
  _optional: Record<string, never> = {},
): string {
  // Object keys are unique, so the comparator never sees a tie.
  const body = Object.entries(input.body).sort(([a], [b]) => (a < b ? -1 : 1));
  const hex = createHash("sha256")
    .update(JSON.stringify([input.workspaceId, input.slug, input.sourceIp, windowIndex, body]))
    .digest("hex");
  // RFC 9562 version 8 (custom) with the RFC variant bits, so it reads as any other UUID id.
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Binds Tovu's outbox delivery to Jini's anonymous submission service. The package awaits the
 * object-shaped limiter check and queues delivery without awaiting notifications.
 *
 * A duplicate of a submission stored in this window or the previous one (so a double click across
 * a window boundary is still caught) is answered exactly like the original — `accepted` — with no
 * row, no event and no notification. It still consumes a rate-limit slot, as any request does.
 * @returns Accepted for a valid submission, a duplicate, or a honeypot discard; package errors propagate.
 * @complexity O(f + k) package validation; fixed-count persistence effects, background dispatch.
 * @example await submitForm({ deps, input: { workspaceId, slug, body, sourceIp } });
 */
export async function submitForm(
  { deps, input }: SubmitFormRequired,
  {
    logger = { warn: ({ message }, { error } = {}) => console.warn(message, error) },
    duplicateWindowMs = DUPLICATE_SUBMISSION_WINDOW_MS,
  }: { logger?: Pick<Logger, "warn">; duplicateWindowMs?: number } = {},
): Promise<{ status: "accepted" }> {
  // The package draws the submission id first, then the event id (pinned by the dedupe tests), and
  // only after the slug, honeypot, validation and rate checks passed — so a refused request never
  // reads the clock or hashes its body here.
  let previousWindowId: string | null = null;
  const newSubmissionId = (): string => {
    const windowIndex = Math.floor(deps.clock.nowMs() / duplicateWindowMs);
    previousWindowId = duplicateSubmissionId({ input, windowIndex: windowIndex - 1 });
    return duplicateSubmissionId({ input, windowIndex });
  };
  const submissionRepo = adaptFormSubmissionRepo({ repo: deps.submissionRepo });
  try {
    return await submitPackageForm({
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
        submissionRepo: {
          ...submissionRepo,
          create: async (record) => {
            if (await deps.submissionRepo.findById({ workspaceId: record.workspaceId, id: previousWindowId! })) throw new DuplicateFormSubmission();
            if (!(await deps.submissionRepo.createOnce(record)).created) throw new DuplicateFormSubmission();
          },
        },
        outbox: deps.outbox,
        clock: deps.clock,
        idGen: {
          newId: () => (previousWindowId === null ? newSubmissionId() : deps.idGen.newId()),
        },
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
  } catch (error) {
    if (error instanceof DuplicateFormSubmission) return { status: "accepted" };
    throw error;
  }
}
