import assert from "node:assert/strict";
import { assertAdminResponse } from "../../inbound/admin-http/http/__tests__/assert-admin-response.js";

/** Validate the complete analytics wrapper before adapting its nested incident ID to the shared assertion. */
export function assertAnalyticsFailure(
  { body, requestId }: { body: unknown; requestId: unknown },
  _options: Record<string, never> = {},
): string {
  assert.equal(typeof requestId, "string");
  assert.ok(requestId);
  assert.deepEqual(Object.keys(body as object), ["error"]);
  const { error } = body as { error: Record<string, unknown> };
  assert.deepEqual(Object.keys(error).sort(), ["code", "details", "message", "requestId"]);
  const details = error.details as Record<string, unknown>;
  assert.deepEqual(Object.keys(details).sort(), ["errorId", "failure"]);
  const { errorId, ...failureDetails } = details;
  assertAdminResponse({
    actual: { ...error, errorId, details: failureDetails },
    expected: { code: "INTERNAL_ERROR", message: "internal error", requestId },
  }, { failure: {
    message: "The analytics reports could not be loaded.",
    action: "Try loading them again. If it still fails, copy details and report this problem.",
    step: "Load analytics reports",
  } });
  return String(errorId);
}
