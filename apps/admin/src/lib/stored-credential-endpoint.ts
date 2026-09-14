import { ApiError } from "./api";

/**
 * @file Rules for a BYOK key the server holds write-only and will only send to the endpoint it was saved
 * for — the endpoint pin in the server's `stored-credential-probe.ts`.
 *
 * Shared by the admin's two key screens so both answer "can this stored key be probed here?" the same
 * way: the visitor key (`features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts`) and the
 * admin's own key (`hooks/use-admin-execution-credential.hooks.ts`). Moved here from
 * `features/ai-assistant/rules.ts` when the second screen needed them (owner repro 2026-09-13).
 */

/** The two fields of a stored-credential view these rules read. `SiteAssistantCredential` and
 *  `AdminExecutionCredential` both carry them. */
export interface StoredCredentialEndpoint {
  isSet: boolean;
  baseUrl: string | null;
}

/** The ask shown when the stored key belongs to another endpoint: the key line's status and, through
 *  {@link describeProbeError}, a probe the server refused for that reason. One constant so the two
 *  cannot drift. Also a dictionary key in `features/ai-assistant/ai-assistant-i18n.ts`. */
export const STORED_KEY_OTHER_PROVIDER_COPY = "Your saved key is for a different provider. Paste a key for this one.";

/** {@link describeProbeError}'s copy for a stored key with no saved endpoint. Also a dictionary key. */
export const STORED_KEY_NO_ENDPOINT_COPY = "Your saved key has no provider saved with it. Paste the key again to test it.";

/** Mirrors `normalizeEndpoint` in the server's `stored-credential-probe.ts` (trim, strip trailing
 *  slashes, no case folding). The two must agree, or a screen and the server disagree about which
 *  endpoint a stored key belongs to. */
function normalizeEndpoint(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/**
 * True when a key is stored and the server recorded a DIFFERENT endpoint for it than the form's —
 * the provider-switch case. The server only lets a key it holds go to the endpoint it was saved for,
 * so a stored-key probe against the form's endpoint can only be refused.
 *
 * An unknown stored endpoint (`null` or blank) is `false`: it is not provably another endpoint, so the
 * server's own answer stands, translated by {@link describeProbeError}. So is a view that has not
 * loaded yet (`null`).
 *
 * @complexity Time/space: O(n) in the two URL lengths.
 */
export function storedKeyIsForOtherEndpoint(stored: StoredCredentialEndpoint | null, baseUrl: string): boolean {
  const storedBaseUrl = stored?.isSet ? stored.baseUrl?.trim() : "";
  if (!storedBaseUrl) return false;
  return normalizeEndpoint(storedBaseUrl) !== normalizeEndpoint(baseUrl);
}

/** A key a probe can use HERE — typed into the field, or stored on the server for this endpoint. A
 *  key stored for another endpoint does not count; see {@link storedKeyIsForOtherEndpoint}.
 *
 * @complexity Time/space: O(n) in the two URL lengths.
 */
export function hasUsableKey(apiKey: string, stored: StoredCredentialEndpoint | null, baseUrl: string): boolean {
  if (apiKey.trim()) return true;
  return stored?.isSet === true && !storedKeyIsForOtherEndpoint(stored, baseUrl);
}

/**
 * True when a probe from this form could only offer the stored key to an endpoint the server did not
 * save it for: nothing is typed, and the stored key belongs to another endpoint. The server refuses
 * that probe, so a screen sends nothing and its key line asks for this provider's key instead.
 *
 * @complexity Time/space: O(n) in the key and URL lengths.
 */
export function storedKeyBlocksProbe(apiKey: string, stored: StoredCredentialEndpoint | null, baseUrl: string): boolean {
  return !apiKey.trim() && storedKeyIsForOtherEndpoint(stored, baseUrl);
}

/**
 * The message a failed probe (model list, Test Key, Test connection) shows. The server's two
 * endpoint-pin refusals are written for API callers ("supply an apiKey in this request"), so they are
 * replaced with plain language. Anything else keeps the thrown message, usually the provider's own.
 *
 * @complexity Time/space: O(1).
 */
export function describeProbeError(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.code === "STORED_CREDENTIAL_ENDPOINT_MISMATCH") return STORED_KEY_OTHER_PROVIDER_COPY;
  if (e instanceof ApiError && e.code === "STORED_CREDENTIAL_ENDPOINT_UNSET") return STORED_KEY_NO_ENDPOINT_COPY;
  return e instanceof Error ? e.message : fallback;
}
