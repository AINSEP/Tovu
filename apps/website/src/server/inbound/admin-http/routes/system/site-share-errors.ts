import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { ADMIN_FAILURE_VOCABULARY } from "@tovu/contracts/admin-failure-copy";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import { describeRequestFailure, formatErrorForLog, formatUserFacingError, type UserFacingError, type UserFacingErrorOptions } from "@jini-ai/core";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { SiteShareExportFailure, SITE_EXPORT_FAILURE_MESSAGES } from "#src/features/site-backup/share-export-failure";
import { DatabaseDiskSpaceError } from "@jini-ai/db/sqlite";

interface FailureOptions {
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

/** The shared admin failure lifecycle: redact before either sink, then correlate a safe reply.
 * Ports stay request-scoped; no global tracker is retained. Expected refusals belong to callers.
 * @complexity Core redaction over the diagnostic/explanation plus fixed log/report/envelope work.
 */
export function adminFailureResponse(
  { error, tracker }: { error: unknown } & AdminFailurePorts,
  options: FailureOptions = {},
): { status: number; body: { error: string; code: string; errorId: string; details?: { failure: UserFacingError } } } {
  const { operation = "admin-route" } = options;
  const diagnostic = adminDiagnostic({ error });
  const generatedId = randomUUID();
  const body = unexpectedAdminBody({ errorId: generatedId, options });
  const errorId = body.errorId;
  // Never hand raw backend/provider errors to a log sink: they may contain saved credentials.
  // Diagnostic sinks are independent: either may fail, but neither may suppress the HTTP reply.
  try { console.error(`[${operation}]`, { errorId, diagnostic }); } catch { /* The tracker still gets the incident. */ }
  try { tracker?.error({ error: new Error(diagnostic) }, { context: { operation, attributes: { errorId } } }); } catch { /* The local log still carries the ID. */ }
  // The backup owner supplies this closed, human-safe refusal. Preserve it for every admin route.
  if (error instanceof DatabaseDiskSpaceError) return { status: error.status, body: { code: error.code, errorId, error: error.message } };
  return { status: 500, body };
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
  if (options.discloseDetails === false) return { message: copy.message, context: copy, includeAction: true };
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

/** Share and password failures must remain diagnosable even when telemetry is disabled.
 * Expected refusals keep their safe public diagnosis. The authorized export pilot discloses its
 * redacted cause; other unexpected details stay in redacted logs.
 * @complexity The shared redaction cost, with one local log and one tracker report.
 */
export function sendSiteShareFailure(
  { res, error, tracker }: { res: Response; error: unknown; tracker?: Pick<Tracker, "error"> },
  { password = false, step }: { password?: boolean; step?: string } = {},
): void {
  if (sendShareRefusal({ res, error }, { password, step })) return;
  if (sendShareUploadRefusal({ res, error }, { step })) return;
  sendAdminFailure({ res, error, tracker }, shareFailureOptions({ error, step, password }));
}

function shareFailureMessage({ step, password }: { step: string | undefined; password: boolean }): string {
  if (step) return `${step} could not finish.`;
  return password ? "Export password is unavailable for this site." : "The share operation could not finish.";
}

/** Preserve safe refusals and their established status codes without generating an incident. */
function sendShareRefusal({ res, error }: { res: Response; error: unknown }, { password, step }: { password: boolean; step: string | undefined }): boolean {
  if (!(error instanceof SiteShareRefusal)) return false;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
  const message = password ? shareFailureMessage({ step, password }) : step ? `${step} failed: ${error.message}` : error.message;
  res.status(status).json({ code: error.code, message });
  return true;
}

/** Map only export-owned stages to public explanations; never guess a provider-specific remedy. */
function shareFailureOptions({ error, step, password }: { error: unknown; step: string | undefined; password: boolean }): FailureOptions {
  const common = { operation: step ? `site-share:${step}` : "site-share", code: "SHARE_FAILED", field: "message" as const };
  const action = "Copy details and report this problem. Check export history before starting another export.";
  if (error instanceof SiteShareExportFailure) {
    const metadata = Object.fromEntries(Object.entries({ appVersion: error.appVersion, jiniVersion: error.jiniVersion, time: error.time }).filter(([, value]) => value !== undefined));
    return { ...common, message: SITE_EXPORT_FAILURE_MESSAGES[error.step], failure: { action, step: error.step, cause: error.cause, metadata } };
  }
  return { ...common, message: shareFailureMessage({ step, password }), failure: { action, step: step ?? "site-share" } };
}

/** Parser errors describe a failed upload, while unexpected storage faults remain incidents. */
function sendShareUploadRefusal({ res, error }: { res: Response; error: unknown }, { step = "Share artifact upload" }: { step?: string } = {}): boolean {
  const type = (error as { type?: string } | null)?.type;
  if (!type || !["entity.too.large", "encoding.unsupported", "entity.parse.failed", "request.aborted", "request.size.invalid"].includes(type)) return false;
  res.status(type === "entity.too.large" ? 413 : 400).json({ code: type === "entity.too.large" ? "LIMIT_EXCEEDED" : "INVALID_INPUT", message: `${step} failed: upload raw application/zip bytes within the 300 MiB cap.` });
  return true;
}
