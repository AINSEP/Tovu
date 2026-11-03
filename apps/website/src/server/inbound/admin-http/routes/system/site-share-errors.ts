import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { DatabaseDiskSpaceError } from "@jini-ai/db/sqlite";

interface FailureOptions {
  operation?: string;
  code?: string;
  message?: string;
  field?: "error" | "message";
  details?: Record<string, unknown>;
}

export interface AdminFailurePorts { tracker?: Pick<Tracker, "error"> }

/** Preserve an exception's stack while redacting before either diagnostic sink receives it. */
function adminDiagnostic({ error }: { error: unknown }, _options = {}): string {
  return redactSecretShapes({ text: error instanceof Error ? error.stack ?? error.message : String(error) }).text;
}

/** The shared admin failure lifecycle: redact before either sink, then correlate a safe reply.
 * Ports stay request-scoped; no global tracker is retained. Expected refusals belong to callers.
 * @complexity One shared redaction pass plus O(1) log/report/envelope work.
 */
export function adminFailureResponse(
  { error, tracker }: { error: unknown } & AdminFailurePorts,
  { operation = "admin-route", code = "INTERNAL_ERROR", message = "internal error" }: FailureOptions = {},
): { status: number; body: { error: string; code: string; errorId: string } } {
  const errorId = randomUUID();
  const diagnostic = adminDiagnostic({ error });
  // Never hand raw backend/provider errors to a log sink: they may contain saved credentials.
  // Diagnostic sinks are independent: either may fail, but neither may suppress the HTTP reply.
  try { console.error(`[${operation}]`, { errorId, diagnostic }); } catch { /* The tracker still gets the incident. */ }
  try { tracker?.error({ error: new Error(diagnostic) }, { context: { operation, attributes: { errorId } } }); } catch { /* The local log still carries the ID. */ }
  // The backup owner supplies this closed, human-safe refusal. Preserve it for every admin route.
  if (error instanceof DatabaseDiskSpaceError) return { status: error.status, body: { code: error.code, errorId, error: error.message } };
  return { status: 500, body: { code, errorId, error: `${message} (error ${errorId})` } };
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
 * Expected refusals keep their safe public diagnosis; unexpected details stay in redacted logs.
 * @complexity The shared redaction cost, with one local log and one tracker report.
 */
export function sendSiteShareFailure(
  { res, error, tracker }: { res: Response; error: unknown; tracker?: Pick<Tracker, "error"> },
  { password = false, step }: { password?: boolean; step?: string } = {},
): void {
  const message = step ? `${step} failed. Check storage configuration and retry.` : password ? "Export password is unavailable for this site." : "Share operation failed. Check storage configuration and retry.";
  if (error instanceof SiteShareRefusal) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
    res.status(status).json({ code: error.code, message: password ? message : step ? `${step} failed: ${error.message}` : error.message });
    return;
  }
  if (sendShareUploadRefusal({ res, error }, { step })) return;
  sendAdminFailure({ res, error, tracker }, { operation: step ? `site-share:${step}` : "site-share", code: "SHARE_FAILED", message, field: "message" });
}

/** Parser errors describe a failed upload, while unexpected storage faults remain incidents. */
function sendShareUploadRefusal({ res, error }: { res: Response; error: unknown }, { step = "Share artifact upload" }: { step?: string } = {}): boolean {
  const type = (error as { type?: string } | null)?.type;
  if (!type || !["entity.too.large", "encoding.unsupported", "entity.parse.failed", "request.aborted", "request.size.invalid"].includes(type)) return false;
  res.status(type === "entity.too.large" ? 413 : 400).json({ code: type === "entity.too.large" ? "LIMIT_EXCEEDED" : "INVALID_INPUT", message: `${step} failed: upload raw application/zip bytes within the 300 MiB cap.` });
  return true;
}
