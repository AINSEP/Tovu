/**
 * @file The shared admin failure lifecycle (redact, log, report, correlated reply). Lives under
 * `inbound/shared/` rather than `admin-http/` because the agent daemon's tool-access route uses it
 * and the daemon's runtime graph may not reach `admin-http/` (ADR-070, agent-daemon-import-graph).
 * Every caller imports from here; the share-specific failure mapping lives in `admin-http/routes/system/site-share-password.ts`.
 */
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { ADMIN_FAILURE_VOCABULARY } from "@tovu/contracts/admin-failure-copy";
import { randomBytes } from "node:crypto";
import { mintToolErrorId } from "@jini-ai/core/errors/error-id";
import type { Response } from "express";
import type { Tracker } from "@jini-ai/core/contracts/site/diagnostics-observability";
import { UNAVAILABLE_ERROR_ID, type ErrorReporter } from "@jini-ai/core/errors/reporter";
import { describeRequestFailure, formatErrorForLog, formatUserFacingError, type UserFacingError, type UserFacingErrorOptions } from "@jini-ai/core";
import { DatabaseDiskSpaceError } from "@jini-ai/db/sqlite";
import { wasAdmittedInRequest } from "#src/server/inbound/shared/request-admissions";


export interface FailureOptions {
  status?: 503 | 507;
  operation?: string;
  code?: string;
  message?: string;
  field?: "error" | "message";
  details?: Record<string, unknown>;
  method?: string;
  route?: string;
  /** The HTTP boundary disables details before an authenticated principal is established. */
  discloseDetails?: boolean;
  /** Only the export pilot may supply its authorized, redacted cause. */
  failure?: { action: string; step: string; cause?: unknown; metadata?: UserFacingErrorOptions };
}

export interface AdminFailurePorts {
  /** Legacy sink for callers the composition has not bound a reporter for yet. */
  tracker?: Pick<Tracker, "error">;
  /** The site's one incident path. When bound it alone writes the host record and the tracker report. */
  reporter?: Pick<ErrorReporter, "record">;
  /** True only when this request's tracker already admitted THIS error object (`request-admissions.ts`). */
  trackerAlreadyReported?: boolean;
}

const UNEXPECTED_CAUSE = "The error ID identifies the server report.";

function mintErrorId(): string {
  return mintToolErrorId({ randomHex: ({ bytes }) => randomBytes(bytes).toString("hex") });
}
interface FailureResponse {
  status(code: number): { json(body: unknown): unknown };
  locals?: Response["locals"];
  req?: Pick<Response["req"], "method" | "route">;
}

/** Preserve an exception's stack while redacting before either diagnostic sink receives it. */
function adminDiagnostic({ error }: { error: unknown }, _options = {}): string {
  return formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS);
}

/** Log one server incident (redacted message + stack) to the local log and the tracker under one
 * error ID, and return that ID for the reply. The one server-side incident sink: admin routes reach
 * it through `sendAdminFailure`; a public/visitor route, whose caller must never see the cause,
 * calls it directly and puts only `errorId` in its own visitor-safe reply.
 * Expected refusals (bad input, not found, refused link) are NOT incidents and must not call it.
 * @param required.operation - `<area>:<step>` naming what failed, e.g. `mail-feedback:record`.
 * With a bound `reporter` the reporter is the only sink: one host record and (unless skipped) one
 * tracker report, under the ID it returns. Unbound callers keep the console + tracker pair below.
 * @param optional.errorId - Reuse an ID the reply already carries; otherwise a new one.
 * @complexity Core redaction over the diagnostic plus one log line and one tracker report.
 * @example const { errorId } = reportServerFailure({ error, operation: "mail-feedback:record" }, { tracker: res.locals.adminFailureTracker, reporter: res.locals.failureReporter });
 */
export function reportServerFailure(
  { error, operation }: { error: unknown; operation: string },
  { tracker, reporter, errorId, trackerAlreadyReported = false }: AdminFailurePorts & { errorId?: string } = {},
): { errorId: string } {
  if (reporter) return recordWithReporter({ error, operation }, { reporter, errorId, trackerAlreadyReported });
  return reportToLegacySinks({ error, operation }, { tracker, errorId: errorId ?? mintErrorId() });
}

/** The bound arm. Never falls back to the legacy sinks: they would be a second, separately minted record.
 * @complexity The reporter's own cost; O(1) here.
 */
function recordWithReporter(
  { error, operation }: { error: unknown; operation: string },
  { reporter, errorId, trackerAlreadyReported }: { reporter: Pick<ErrorReporter, "record">; errorId: string | undefined; trackerAlreadyReported: boolean },
): { errorId: string } {
  try {
    // Skip the tracker copy only when this request's tracker already admitted this very error (a tracked
    // operation reported it before passing it on). Any other earlier report in the request is a
    // different incident and must not silence this one's report.
    return reporter.record({ error, step: operation, operation }, {
      ...(errorId === undefined ? {} : { errorId }),
      ...(trackerAlreadyReported ? { tracker: "skip" as const } : {}),
    });
  } catch {
    // A reporter breach answers with the fixed unavailable ID: no fallback mint (an ID nothing recorded
    // would send the owner looking for a missing incident) and no raw console line in its place.
    return { errorId: UNAVAILABLE_ERROR_ID };
  }
}

/** The pre-reporter pair for unbound callers: one redacted console line and one tracker report.
 * @complexity Core redaction over the diagnostic plus one log line and one tracker report.
 */
function reportToLegacySinks(
  { error, operation }: { error: unknown; operation: string },
  { tracker, errorId }: { tracker: Pick<Tracker, "error"> | undefined; errorId: string },
): { errorId: string } {
  const diagnostic = adminDiagnostic({ error });
  // Never hand raw backend/provider errors to a log sink: they may contain saved credentials.
  // Diagnostic sinks are independent: either may fail, but neither may suppress the HTTP reply.
  try { console.error(`[${operation}]`, { errorId, diagnostic }); } catch { /* The tracker still gets the incident. */ }
  try { tracker?.error({ error: new Error(diagnostic) }, { context: { operation, attributes: { errorId } } }); } catch { /* The local log still carries the ID. */ }
  return { errorId };
}

/** The shared admin failure lifecycle: redact before either sink, then correlate a safe reply.
 * Ports stay request-scoped; no global tracker is retained. Expected refusals belong to callers,
 * except the typed disk-space refusal, which every admin route returns as-is (no incident).
 * @complexity Core redaction over the diagnostic/explanation plus fixed log/report/envelope work.
 */
export function adminFailureResponse(
  { error, tracker, reporter, trackerAlreadyReported }: { error: unknown } & AdminFailurePorts,
  options: FailureOptions = {},
): { status: number; body: { error: string; code: string; errorId?: string; details?: { failure: UserFacingError } } } {
  // C115: a full disk is the owner's to fix, not a server incident. Classify it before anything is
  // logged or reported; the backup owner's closed, human-safe message is the whole reply, with no
  // error ID because no incident carries one.
  // It stays ahead of the reporter too: asking the reporter first would write a host record and spend
  // an ERR ID for a refusal the owner fixes by freeing space.
  // The backup owner supplies this closed, human-safe refusal. Preserve it for every admin route.
  if (options.status === undefined && error instanceof DatabaseDiskSpaceError) return { status: error.status, body: { code: error.code, error: error.message } };
  const { operation = "admin-route" } = options;
  // Classify, then record, then build the reply from the recorded ID. An approved disclosure cause may
  // already carry the ERR ID of an incident another path wrote (a tool failure); the formatter's own
  // rule finds it, and the record is offered that ID instead of minting a second one.
  // The shared formatter preserves a cause's existing ERR ID. Use it for both sinks and reply.
  const causeErrorId = formatApprovedFailure({ options }, {}).failure.errorId;
  const { errorId } = reportServerFailure({ error, operation }, { tracker, reporter, errorId: causeErrorId, trackerAlreadyReported });
  return { status: options.status ?? 500, body: unexpectedAdminBody({ errorId, options }) };
}

/** Only the export pilot opts into its authorized, redacted cause. Other routes retain the
 * private-diagnostic policy and disclose an approved explanation plus its report ID.
 * @complexity Core redaction over one bounded explanation; no I/O beyond the boundary's timestamp.
 */
function unexpectedAdminBody({ errorId, options }: { errorId: string; options: FailureOptions }) {
  const { code = "INTERNAL_ERROR", discloseDetails = true } = options;
  const first = formatApprovedFailure({ options }, { errorId });
  // The recorded ID wins. The shared formatter prefers an ERR ID found in the cause, but when the
  // reporter already held a different ID for this error (it recorded it earlier), the owner must see the
  // ID the host record and tracker carry, in the reply AND in Copy details. So the competing ID is
  // suppressed for this formatting pass instead of being allowed to replace the recorded one.
  const { failure: formatted, includeAction } = first.failure.errorId === undefined || first.failure.errorId === errorId
    ? first
    : formatApprovedFailure({ options }, { errorId, cause: first.failure.cause.replace(ERR_ID_IN_TEXT, "[earlier error ID]") });
  const failure = pinRecordedId({ failure: formatted, errorId });
  const correlatedId = failure.errorId ?? errorId;
  const explanation = includeAction ? `${failure.message} ${failure.action}` : failure.message;
  return { code, errorId: correlatedId, error: `${explanation} (error ${correlatedId})`, ...(discloseDetails ? { details: { failure } } : {}) };
}

/** PII redaction reads an all-decimal ERR ID (the reporter's unavailable ID) as a card number and blanks
 * it in the metadata field. A boundary-shaped ERR ID is a public reference, so restore the recorded one
 * in both the field and the Copy details line; anything not of that exact shape stays as redacted.
 * @complexity O(copy text length).
 */
function pinRecordedId({ failure, errorId }: { failure: UserFacingError; errorId: string }): UserFacingError {
  if (failure.errorId === errorId || failure.errorId === undefined || !ERR_ID_SHAPE.test(errorId)) return failure;
  return { ...failure, errorId, copyText: failure.copyText.replace(`Error ID: ${failure.errorId}`, `Error ID: ${errorId}`) };
}

const ERR_ID_SHAPE = /^ERR-[A-Fa-f0-9]{4}(?:-[A-Fa-f0-9]{4}){3}$/;

/** The formatter's own ERR ID shape, used only to blank a competing ID in an already-formatted approved cause. */
const ERR_ID_IN_TEXT = /\bERR-[A-Fa-f0-9]{4}(?:-[A-Fa-f0-9]{4}){3}\b/g;

/** Format the approved copy for this route. Without `errorId` the result's ID is only one the approved
 * cause already carries (the formatter's rule), which is how a caller finds an eligible existing ID.
 * @complexity Core redaction over one bounded explanation.
 */
function formatApprovedFailure(
  { options }: { options: FailureOptions },
  { errorId, cause }: { errorId?: string; cause?: string },
): { failure: UserFacingError; includeAction: boolean } {
  const { message, context, includeAction } = approvedFailureCopy({ options });
  const failure = formatUserFacingError({ message, action: context.action, step: context.step, cause: cause ?? context.cause ?? UNEXPECTED_CAUSE },
    { ...context.metadata, ...TOVU_ERROR_REDACTION_OPTIONS, ...(errorId === undefined ? {} : { errorId }), time: context.metadata?.time ?? new Date().toISOString() });
  return { failure, includeAction };
}

/** Anonymous boundaries use only approved vocabulary, even if an override contains private facts.
 * @complexity O(route tokens) through the pure descriptor; no I/O or retained state.
 */
function approvedFailureCopy({ options }: { options: FailureOptions }): { message: string; context: NonNullable<FailureOptions["failure"]>; includeAction: boolean } {
  const copy = describeRequestFailure({ method: options.method, route: options.route, operation: options.operation, vocabulary: ADMIN_FAILURE_VOCABULARY });
  if (options.discloseDetails === false) return {
    message: copy.message,
    context: { ...copy, action: copy.action.replace(/copy details and report this problem\./i, 'Report this error ID.') },
    includeAction: true,
  };
  return { message: options.message ?? copy.message, context: options.failure ?? copy, includeAction: !!options.failure || options.message === undefined };
}

/** Only the registered template is safe: req.path, query and a mounted baseUrl may contain IDs.
 * @complexity O(1); reads request-owned metadata only.
 */
function httpFailureOptions({ res, options }: { res: FailureResponse; options: FailureOptions }): FailureOptions {
  const discloseDetails = !res.req || !!res.locals?.principal;
  const route = typeof res.req?.route?.path === "string" ? res.req.route.path : undefined;
  return { ...options, method: res.req?.method, route, discloseDetails };
}

/** Send the shared failure envelope using the reporter and tracker injected by the HTTP composition root.
 * The legacy tracker default (skip after any report) applies only to unbound requests; a bound reporter
 * skips its tracker copy only for a failure this request already admitted.
 * @complexity The shared redaction cost plus O(1) envelope construction.
 */
export function sendAdminFailure(
  {
    res, error,
    tracker = res.locals?.adminFailureReportScope?.reported ? undefined : res.locals?.adminFailureTracker,
    reporter = res.locals?.failureReporter,
  }: { res: FailureResponse; error: unknown; tracker?: Pick<Tracker, "error">; reporter?: Pick<ErrorReporter, "record"> },
  options: FailureOptions = {},
): void {
  const resolved = httpFailureOptions({ res, options });
  const trackerAlreadyReported = wasAdmittedInRequest({ scope: res.locals?.adminFailureReportScope, error });
  const { status, body } = adminFailureResponse({ error, tracker, reporter, trackerAlreadyReported }, resolved);
  const { error: message, ...identity } = body;
  res.status(status).json({ ...(resolved.discloseDetails ? options.details : {}), ...identity, [options.field ?? "error"]: message });
}
