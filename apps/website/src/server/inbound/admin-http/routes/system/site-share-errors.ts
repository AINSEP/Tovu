import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import { formatErrorForLog, formatUserFacingError, type UserFacingError, type UserFacingErrorOptions } from "@jini-ai/core";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { SiteShareExportFailure, SITE_EXPORT_FAILURE_MESSAGES } from "#src/features/site-backup/share-export-failure";
import { DatabaseDiskSpaceError } from "@jini-ai/db/sqlite";

interface FailureOptions {
  operation?: string;
  code?: string;
  message?: string;
  field?: "error" | "message";
  details?: Record<string, unknown>;
  /** Opt-in disclosure at a migrated call site; other envelopes keep their existing shape. */
  failure?: { action: string; step: string; cause?: unknown; metadata?: UserFacingErrorOptions };
}

export interface AdminFailurePorts { tracker?: Pick<Tracker, "error"> }

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
  { operation = "admin-route", code = "INTERNAL_ERROR", message = "The admin request could not finish. Check whether your change was saved, then copy the error ID and report this problem.", failure: context }: FailureOptions = {},
): { status: number; body: { error: string; code: string; errorId: string; details?: { failure: UserFacingError } } } {
  const diagnostic = adminDiagnostic({ error });
  const errorId = randomUUID();
  // Never hand raw backend/provider errors to a log sink: they may contain saved credentials.
  // Diagnostic sinks are independent: either may fail, but neither may suppress the HTTP reply.
  try { console.error(`[${operation}]`, { errorId, diagnostic }); } catch { /* The tracker still gets the incident. */ }
  try { tracker?.error({ error: new Error(diagnostic) }, { context: { operation, attributes: { errorId } } }); } catch { /* The local log still carries the ID. */ }
  // The backup owner supplies this closed, human-safe refusal. Preserve it for every admin route.
  if (error instanceof DatabaseDiskSpaceError) return { status: error.status, body: { code: error.code, errorId, error: error.message } };
  return { status: 500, body: unexpectedAdminBody({ message, code, errorId, context }) };
}

/** Only the export pilot opts into its authorized, redacted cause. Other migrated routes retain
 * the existing private-diagnostic policy and disclose an approved explanation plus its report ID.
 * @complexity Core redaction over one bounded explanation; no I/O beyond the boundary's timestamp.
 */
function unexpectedAdminBody({ message, code, errorId, context }: {
  message: string; code: string; errorId: string; context: FailureOptions["failure"];
}) {
  if (!context) return { code, errorId, error: `${message} (error ${errorId})` };
  const failure = formatUserFacingError({ message, action: context.action, step: context.step,
    cause: context.cause ?? "The server could not complete this operation. Its error ID identifies the server report." },
  { ...context.metadata, ...TOVU_ERROR_REDACTION_OPTIONS, errorId, time: context.metadata?.time ?? new Date().toISOString() });
  return { code, errorId, error: `${failure.message} ${failure.action} (error ${errorId})`, details: { failure } };
}

/** Send the shared failure envelope using the tracker injected by the HTTP composition root.
 * @complexity The shared redaction cost plus O(1) envelope construction.
 */
export function sendAdminFailure(
  { res, error, tracker = res.locals?.adminFailureTracker }: { res: { status(code: number): { json(body: unknown): unknown }; locals?: Response["locals"] }; error: unknown; tracker?: Pick<Tracker, "error"> },
  options: FailureOptions = {},
): void {
  const { status, body } = adminFailureResponse({ error, tracker }, options);
  const { error: message, ...identity } = body;
  res.status(status).json({ ...options.details, ...identity, [options.field ?? "error"]: message });
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
