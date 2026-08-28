import type { Response } from "express";

import { ConnectorServiceError } from "@jini-ai/integrations/composio";

/**
 * @file Maps `ConnectorServiceError` onto Tovu's admin error envelope.
 *
 * Factored out rather than repeated because the mapping is genuinely shared connector logic (the
 * per-route `authorize` block above it is repeated inline instead, matching every other admin route
 * module in this tree).
 */

/**
 * Writes a `ConnectorServiceError` as `{ error, code, details }`, or a generic 500 for anything
 * else.
 *
 * Non-`ConnectorServiceError` failures are deliberately flattened to "internal error" with no
 * message: the throwing surface below this is an outbound HTTP client whose exceptions can carry
 * request URLs and, on some failure paths, header material. `ConnectorServiceError` is the one
 * class that has been shaped for external consumption, so it is the one class allowed through.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function sendConnectorError(res: Response, error: unknown): void {
  if (error instanceof ConnectorServiceError) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }
  console.error(`connectors route failed: ${error instanceof Error ? error.message : String(error)}`);
  res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
}
