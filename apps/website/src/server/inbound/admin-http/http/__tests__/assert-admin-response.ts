import assert from "node:assert/strict";

/** Preserve exact route snapshots while asserting the new, nondeterministic incident contract.
 * Only the generated UUID comes from the response; the public text, code and all other fields
 * are still specified by the expected snapshot. Typed refusals keep exact deep equality.
 * @complexity O(expected response size).
 */
export function assertAdminResponse(
  { actual, expected }: { actual: unknown; expected: unknown },
  { message }: { message?: string | Error } = {},
): void {
  assert.deepEqual(actual, expectedWithIncidentIds({ actual, expected }), message);
}

function expectedWithIncidentIds({ actual, expected }: { actual: unknown; expected: unknown }, _options = {}): unknown {
  if (Array.isArray(expected)) return expected.map((value, index) => expectedWithIncidentIds({ actual: (actual as unknown[])?.[index], expected: value }));
  if (!expected || typeof expected !== "object" || Object.getPrototypeOf(expected) !== Object.prototype) return expected;
  const row = expected as Record<string, unknown>;
  const received = actual as Record<string, unknown> | undefined;
  const field = typeof row.error === "string" ? "error" : "message";
  const publicText = row[field];
  if (isIncidentSnapshot(row)) {
    assert.match(String(received?.errorId), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    return { ...row, code: row.code ?? "INTERNAL_ERROR", errorId: received!.errorId, [field]: `${publicText} (error ${received!.errorId})` };
  }
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, expectedWithIncidentIds({ actual: received?.[key], expected: value })]));
}

function isIncidentSnapshot(row: Record<string, unknown>): boolean {
  if (row.errorId !== undefined) return false;
  const publicText = row.error ?? row.message;
  if (typeof publicText !== "string") return false;
  return publicText === "internal error" || ["INTERNAL_ERROR", "BACKUP_FAILED", "IMPORT_FAILED"].includes(String(row.code));
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
