/** Tovu route policy; Jini owns the taxonomy, status defaults and wire serialization. */
import type { Response } from 'express';
import { createApiError, type GenericErrorCode, type JsonValue } from '@jini-ai/protocol';
import { sendApiError, statusForError } from '@jini-ai/http-kit';

/** Reply with reviewed caller-safe copy and the request tracker's existing correlation id.
 * @complexity O(1); sends one JSON response, never serializes a raw exception.
 */
export function respondToApiError(
  { res, code, message }: { res: Response; code: GenericErrorCode; message: string },
  { details }: { details?: JsonValue } = {},
): void {
  const requestId: unknown = res.locals.requestId;
  const error = createApiError({ code, message }, { ...(typeof requestId === 'string' ? { requestId } : {}), ...(details === undefined ? {} : { details }) });
  sendApiError({ res, status: statusForError({ error }), error });
}
