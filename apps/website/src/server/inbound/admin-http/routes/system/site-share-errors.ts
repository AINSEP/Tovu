import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";

/** Share and password failures must remain diagnosable even when telemetry is disabled.
 * Expected refusals keep their safe public diagnosis; unexpected details stay in redacted logs.
 * @complexity O(diagnostic length) redaction, with one local log and one tracker report.
 */
export function sendSiteShareFailure(
  { res, error, tracker }: { res: Response; error: unknown; tracker?: Pick<Tracker, "error"> },
  { password = false }: { password?: boolean } = {},
): void {
  const message = password ? "Export password is unavailable for this site." : "Share operation failed. Check storage configuration and retry.";
  if (error instanceof SiteShareRefusal) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
    res.status(status).json({ code: error.code, message: password ? message : error.message });
    return;
  }
  const errorId = randomUUID();
  const diagnostic = redactSecretShapes({ text: error instanceof Error ? error.stack ?? error.message : String(error) }).text;
  // Never hand raw backend/provider errors to a log sink: they may contain saved credentials.
  console.error("[site-share]", { errorId, diagnostic });
  tracker?.error({ error: new Error(diagnostic) }, { context: { operation: "site-share", attributes: { errorId } } });
  res.status(500).json({ code: "SHARE_FAILED", errorId, message: `${message} (error ${errorId})` });
}
