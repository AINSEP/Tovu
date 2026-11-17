import { ApiError } from "./admin-http/request";

/** A dictionary-key-shaped result; callers translate it and handle generic errors themselves. */
export type CredentialSubmitFailure = { kind: "duplicate-label" } | { kind: "validation"; detail: string } | { kind: "generic" };

/**
 * Classifies a rejected `createCredential`/`updateCredential` call. Reads `error.code`, falling back
 * to `error.message`, for the two known markers (`DUPLICATE_LABEL`, `VALIDATION`):
 * this app's usual server shape is `{ error: <human message>, code: <MACHINE_CODE> }` (see
 * `workspace/rules.ts`'s own `describeApiError` override for the precedent), but the dispatched API
 * contract for this route writes `409 -> { error: "DUPLICATE_LABEL" }` and
 * `400 -> { error: "VALIDATION", detail }` with no separate `code` field at all — `request()`
 * (`lib/api.ts`) puts `body.error` into `error.message` and `body.code` into `error.code`, so
 * either server shape can carry the marker. A present code takes precedence over the message.
 * Source-control's backend slice follows the same 409/400 contract.
 * @complexity O(1).
 */
export function classifyCredentialSubmitError({ error }: { error: unknown }, _optional: Record<string, never> = {}): CredentialSubmitFailure {
  if (!(error instanceof ApiError)) return { kind: "generic" };
  const marker = error.code ?? error.message;
  if (marker === "DUPLICATE_LABEL") return { kind: "duplicate-label" };
  if (marker === "VALIDATION") {
    const detail = typeof error.body?.detail === "string" ? error.body.detail : error.message;
    return { kind: "validation", detail };
  }
  return { kind: "generic" };
}
