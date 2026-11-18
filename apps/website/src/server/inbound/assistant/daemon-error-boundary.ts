import type { ErrorRequestHandler } from "express";
import { createApiError, createApiErrorResponse, type ApiError } from "@jini-ai/protocol";

/**
 * @file The last handler of the daemon scope app. Every failure a route or a middleware raises ends here as
 * one JSON envelope, so the MCP client reads the words instead of Express's HTML page (which says nothing the
 * model can use and is never shown to it). Mounted after every route and every gate: an unauthenticated
 * caller is refused before the parser runs, so no body-parser failure of theirs can reach it.
 */
export interface DaemonErrorBoundaryPorts {
  /** One error ID in core's `ERR-XXXX-XXXX-XXXX-XXXX` format, the same one the MCP client shows. */
  readonly mintErrorId: () => string;
  /** Records the original error once, with that ID. A throwing sink never replaces the answer. */
  readonly onInternalError: (required: { error: unknown; errorId: string }) => void;
}

const INTERNAL_MESSAGE = "The tool service hit an internal problem before the tool ran. Do not retry the same call; give the user the error ID.";

function bodyParserRefusal({ error }: { error: unknown }): { status: number; error: Pick<ApiError, "code" | "message"> } | undefined {
  const fields = error !== null && typeof error === "object" ? error as { status?: unknown; type?: unknown } : {};
  if (fields.status === 413) return { status: 413, error: { code: "PAYLOAD_TOO_LARGE", message: "This tool call's input is larger than 6 MB. Send less content per call." } };
  if (fields.type === "entity.parse.failed") return { status: 400, error: { code: "BAD_REQUEST", message: "The request body was not valid JSON." } };
  return undefined;
}

/**
 * Builds the scope app's error handler.
 * @param required.mintErrorId - Mints the ID shown in the answer and handed to the sink.
 * @param required.onInternalError - The incident sink.
 * @returns An Express error handler. A body the parser refused (too large, not JSON) is a plain refusal with no incident;
 *   anything else is a 500 whose body holds fixed words and the ID, never the error's text. Once headers are sent the
 *   error goes on to Express's own handler and nothing is written.
 */
export function createDaemonErrorBoundary(required: DaemonErrorBoundaryPorts, _optional: Record<string, never> = {}): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) { next(error); return; }
    const refusal = bodyParserRefusal({ error });
    if (refusal) { res.status(refusal.status).json(createApiErrorResponse({ error: createApiError(refusal.error) })); return; }
    const errorId = required.mintErrorId();
    try { required.onInternalError({ error, errorId }); }
    catch (sinkError) { console.error(`[daemon:app-boundary] error ${errorId}: the incident sink failed (${sinkError instanceof Error ? sinkError.name : typeof sinkError})`); }
    res.status(500).json(createApiErrorResponse({ error: createApiError({ code: "INTERNAL_ERROR", message: INTERNAL_MESSAGE }, { requestId: errorId }) }));
  };
}
