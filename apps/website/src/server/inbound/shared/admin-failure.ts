/**
 * @file The shared admin failure lifecycle (redact, log, report, correlated reply). Lives under
 * `inbound/shared/` rather than `admin-http/` because the agent daemon's tool-access route uses it
 * and the daemon's runtime graph may not reach `admin-http/` (ADR-070, agent-daemon-import-graph).
 * Every caller imports from here; the share-specific failure mapping lives in `admin-http/routes/system/site-share-password.ts`.
 */
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { ADMIN_FAILURE_VOCABULARY } from "@tovu/contracts/admin-failure-copy";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import { describeRequestFailure, formatErrorForLog, formatUserFacingError, type UserFacingError, type UserFacingErrorOptions } from "@jini-ai/core";
import { DatabaseDiskSpaceError } from "@jini-ai/db/sqlite";


export interface FailureOptions {
  status?: 503;
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

export interface AdminFailurePorts { tracker?: Pick<Tracker, "error"> }
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
 * @param optional.errorId - Reuse an ID the reply already carries; otherwise a new UUID.
 * @complexity Core redaction over the diagnostic plus one log line and one tracker report.
 * @example const { errorId } = reportServerFailure({ error, operation: "mail-feedback:record" }, { tracker: res.locals.adminFailureTracker });
 */
export function reportServerFailure(
  { error, operation }: { error: unknown; operation: string },
  { tracker, errorId = randomUUID() }: AdminFailurePorts & { errorId?: string } = {},
): { errorId: string } {
  const diagnostic = adminDiagnostic({ error });
  // Never hand raw backend/provider errors to a log sink: they may contain saved credentials.
  // Diagnostic sinks are independent: either may fail, but neither may suppress the HTTP reply.
  try { console.error(`[${operation}]`, { errorId, diagnostic }); } catch { /* The tracker still gets the incident. */ }
  try { tracker?.error({ error: new Error(diagnostic) }, { context: { operation, attributes: { errorId } } }); } catch { /* The local log still carries the ID. */ }
  return { errorId };
}

/** The shared admin failure lifecycle: redact before either sink, then correlate a safe reply.
 * Ports stay request-scoped; no global tracker is retained. Expected refusals belong to callers.
 * @complexity Core redaction over the diagnostic/explanation plus fixed log/report/envelope work.
 */
export function adminFailureResponse(
  { error, tracker }: { error: unknown } & AdminFailurePorts,
  options: FailureOptions = {},
): { status: number; body: { error: string; code: string; errorId: string; details?: { failure: UserFacingError } } } {
  const { operation = "admin-route" } = options;
  const body = unexpectedAdminBody({ errorId: randomUUID(), options });
  const { errorId } = reportServerFailure({ error, operation }, { tracker, errorId: body.errorId });
  // The backup owner supplies this closed, human-safe refusal. Preserve it for every admin route.
  if (options.status === undefined && error instanceof DatabaseDiskSpaceError) return { status: error.status, body: { code: error.code, errorId, error: error.message } };
  return { status: options.status ?? 500, body };
}

/** Only the export pilot opts into its authorized, redacted cause. Other routes retain the
 * private-diagnostic policy and disclose an approved explanation plus its report ID.
 * @complexity Core redaction over one bounded explanation; no I/O beyond the boundary's timestamp.
 */
function unexpectedAdminBody({ errorId, options }: { errorId: string; options: FailureOptions }) {
  const { code = "INTERNAL_ERROR", discloseDetails = true } = options;
  const { message, context, includeAction } = approvedFailureCopy({ options });
  const failure = formatUserFacingError({ message, action: context.action, step: context.step,
    cause: context.cause ?? "The error ID identifies the server report." },
  { ...context.metadata, ...TOVU_ERROR_REDACTION_OPTIONS, errorId, time: context.metadata?.time ?? new Date().toISOString() });
  // The shared formatter preserves a cause's existing ERR ID. Use it for both sinks and reply.
  const correlatedId = failure.errorId ?? errorId;
  const explanation = includeAction ? `${failure.message} ${failure.action}` : failure.message;
  return { code, errorId: correlatedId, error: `${explanation} (error ${correlatedId})`, ...(discloseDetails ? { details: { failure } } : {}) };
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

/** Send the shared failure envelope using the tracker injected by the HTTP composition root.
 * @complexity The shared redaction cost plus O(1) envelope construction.
 */
export function sendAdminFailure(
  { res, error, tracker = res.locals?.adminFailureReportScope?.reported ? undefined : res.locals?.adminFailureTracker }: { res: FailureResponse; error: unknown; tracker?: Pick<Tracker, "error"> },
  options: FailureOptions = {},
): void {
  const resolved = httpFailureOptions({ res, options });
  const { status, body } = adminFailureResponse({ error, tracker }, resolved);
  const { error: message, ...identity } = body;
  res.status(status).json({ ...(resolved.discloseDetails ? options.details : {}), ...identity, [options.field ?? "error"]: message });
}
