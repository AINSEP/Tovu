import assert from "node:assert/strict";

/** Explicit route-owned copy: expected text never comes from the production formatter or response. */
export interface ExpectedAdminFailure {
  message: string;
  action: string;
  step: string;
  includeAction?: boolean;
  discloseDetails?: boolean;
}

/** Preserve exact route snapshots while validating the nondeterministic UUID and ISO timestamp.
 * Every other failure field, including the complete copy block, is independently expected.
 * @complexity O(expected response size).
 */
export function assertAdminResponse(
  { actual, expected }: { actual: unknown; expected: unknown },
  { message, failure }: { message?: string | Error; failure?: ExpectedAdminFailure } = {},
): void {
  assert.deepEqual(actual, expectedWithIncidentIds({ actual, expected }, { failure }), message);
}

function expectedWithIncidentIds(
  { actual, expected }: { actual: unknown; expected: unknown },
  { failure }: { failure?: ExpectedAdminFailure } = {},
): unknown {
  if (Array.isArray(expected)) return expected.map((value, index) => expectedWithIncidentIds({ actual: (actual as unknown[])?.[index], expected: value }, { failure }));
  if (!expected || typeof expected !== "object" || Object.getPrototypeOf(expected) !== Object.prototype) return expected;
  const row = expected as Record<string, unknown>;
  const received = actual as Record<string, unknown> | undefined;
  if (isIncidentSnapshot(row)) return expectedIncident({ row, received }, { failure });
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, expectedWithIncidentIds({ actual: received?.[key], expected: value }, { failure })]));
}

function expectedIncident(
  { row, received }: { row: Record<string, unknown>; received?: Record<string, unknown> },
  { failure }: { failure?: ExpectedAdminFailure },
): Record<string, unknown> {
  assert.match(String(received?.errorId), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const field = typeof row.error === "string" ? "error" : "message";
  const publicText = row[field];
  const fallback = "The admin request could not finish. Check whether your change was saved, then copy the error ID and report this problem.";
  const text = publicText === "internal error" ? failure?.message ?? fallback : publicText;
  const withAction = failure && (failure.includeAction ?? publicText === "internal error") ? `${text} ${failure.action}` : text;
  const incident = { ...row, code: row.code ?? "INTERNAL_ERROR", errorId: received!.errorId, [field]: `${withAction} (error ${received!.errorId})` };
  if (!failure || failure.discloseDetails === false) return incident;
  return { ...incident, details: { ...(row.details as Record<string, unknown> | undefined), failure: expectedFailure({ received: received!, failure }) } };
}

function expectedFailure({ received, failure }: { received: Record<string, unknown>; failure: ExpectedAdminFailure }) {
  const time = ((received.details as { failure?: { time?: unknown } } | undefined)?.failure)?.time;
  assert.equal(typeof time, "string");
  assert.match(time as string, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(new Date(time as string).toISOString(), time);
  const cause = "The error ID identifies the server report.";
  const { message, action, step } = failure;
  const errorId = received.errorId;
  const copyText = [
    `Message: ${message}`, `Next action: ${action}`, `Error ID: ${errorId}`, `Step: ${step}`,
    `Cause: ${cause}`, "App version: Unavailable", "Jini version: Unavailable", `Time: ${time}`,
  ].join("\n");
  return { message, action, step, cause, errorId, time, copyText };
}

function isIncidentSnapshot(row: Record<string, unknown>): boolean {
  if (row.errorId !== undefined) return false;
  const publicText = row.error ?? row.message;
  if (typeof publicText !== "string") return false;
  return publicText === "internal error" || ["INTERNAL_ERROR", "BACKUP_FAILED", "IMPORT_FAILED", "SHARE_FAILED"].includes(String(row.code));
}

/** Assert the exact diagnostic envelope, retaining the cause while excluding raw Error objects. */
export function assertAdminDiagnostics(
  { calls, operation, diagnostics }: { calls: readonly (readonly unknown[])[]; operation: string; diagnostics: readonly RegExp[] },
  _options = {},
): void {
  assert.equal(calls.length, diagnostics.length);
  calls.forEach((call, index) => {
    const detail = call[1] as { errorId: string; diagnostic: string };
    assert.match(detail?.errorId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.match(detail?.diagnostic, diagnostics[index]!);
    assert.deepEqual(Object.keys(detail).sort(), ["diagnostic", "errorId"]);
    assert.deepEqual(call, [operation, detail]);
  });
}
