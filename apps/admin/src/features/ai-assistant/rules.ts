import { DEFAULT_PROVIDER_PRESETS, isProviderConfigured, type ByokConfig } from "@jini-ai/ui";

import { ApiError, describeApiError as describeApiErrorDefault, type SiteAssistantCredential } from "../../lib/api";

/**
 * @file Pure logic for the `ai-assistant` feature — everything that computes a value rather than
 * rendering one.
 *
 * Follows the same convention `features/posts/rules.ts` establishes for this app: the bar for
 * landing here is "does it compute something", not "is it rendered". Several of these were plain
 * `const`s or inline expressions inside `VisitorCredentialForm`'s body — reachable only by
 * rendering the whole tab and driving state through it — and are exported here so each can be
 * asserted directly.
 */

/** Overrides layered on the shared default (`lib/api.ts`'s `describeApiError`) — this screen's
 *  `FORBIDDEN` copy names the specific setting, unlike the generic "You do not have permission to
 *  do that." most other screens use for the same code (audit cross-cutting finding #2).
 *
 * @complexity Time/space: O(1) — a fixed number of code checks, no iteration.
 * @overallScore 100
 */
export function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === "FORBIDDEN") return "You do not have permission to change the AI assistant's settings.";
    if (e.code === "ASSISTANT_SETTINGS_VALIDATION_ERROR") return e.message || "That value was rejected.";
    // ADR-058's fail-closed branch, translated rather than shown raw. The server's own message names
    // the variable, but it names it in server-operator language ("set TOVU_INTEGRATIONS_ROOT_KEY (a
    // hex-encoded root key) in the server environment") arriving in a UI where the reader has just
    // pasted a key and been told it did not save. The distinction that matters to them is that
    // NOTHING IS WRONG WITH THEIR KEY — the server has no master secret to encrypt it under.
    if (e.code === "SECRET_STORE_UNCONFIGURED")
      return "The server cannot store keys yet: it has no encryption master key. Set TOVU_INTEGRATIONS_ROOT_KEY (hex) in the server environment and restart. Your key was not saved, and nothing is wrong with it.";
    if (e.code === "SITE_CREDENTIAL_VALIDATION_ERROR") return e.message || "That value was rejected.";
  }
  return describeApiErrorDefault(e, fallback);
}

/** The ask shown when the stored key belongs to another endpoint: the key line's status and, through
 *  {@link describeProbeError}, a probe the server refused for that reason. One constant so the two
 *  cannot drift. Also a dictionary key in `ai-assistant-i18n.ts`. */
export const STORED_KEY_OTHER_PROVIDER_COPY = "Your saved key is for a different provider. Paste a key for this one.";

/** {@link describeProbeError}'s copy for a stored key with no saved endpoint. Also a dictionary key. */
export const STORED_KEY_NO_ENDPOINT_COPY = "Your saved key has no provider saved with it. Paste the key again to test it.";

/** Mirrors `normalizeEndpoint` in the server's `stored-credential-probe.ts` (trim, strip trailing
 *  slashes, no case folding). The two must agree, or this screen and the server disagree about which
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
 * server's own answer stands, translated by {@link describeProbeError}.
 *
 * @complexity Time/space: O(n) in the two URL lengths.
 */
export function storedKeyIsForOtherEndpoint(stored: SiteAssistantCredential | null, baseUrl: string): boolean {
  const storedBaseUrl = stored?.isSet ? stored.baseUrl?.trim() : "";
  if (!storedBaseUrl) return false;
  return normalizeEndpoint(storedBaseUrl) !== normalizeEndpoint(baseUrl);
}

/** A key a probe can use HERE — typed into the field, or stored on the server for this endpoint. A
 *  key stored for another endpoint does not count; see {@link storedKeyIsForOtherEndpoint}.
 *
 * @complexity Time/space: O(n) in the two URL lengths.
 */
export function hasUsableKey(apiKey: string, stored: SiteAssistantCredential | null, baseUrl: string): boolean {
  if (apiKey.trim()) return true;
  return stored?.isSet === true && !storedKeyIsForOtherEndpoint(stored, baseUrl);
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

/** Whether the server currently has a credential stored for this site — the "leave the stored key
 *  alone" case `saveVisitorSettings` relies on when it writes a patch with no `apiKey`.
 *
 * @complexity Time/space: O(1).
 * @overallScore 100
 */
export function hasStoredCredential(stored: SiteAssistantCredential | null): boolean {
  return stored?.isSet === true;
}

/**
 * SECURITY GATE on automatic discovery — `true` only when the endpoint is one a PRESET supplied,
 * never one the operator typed.
 *
 * This closes a confirmed credential-transmission bug rather than avoiding a hypothetical one. See
 * `ADS-memory/reports/findings/2026-08-04-byok-discovery-keystroke-key-leak.md`: Jini's
 * `ExecutionTab` lists `config.byok.baseUrl` as a discovery dependency and passes the whole
 * `ByokConfig` — which carries `apiKey` — with no debounce. Consequence, measured live by another
 * session: with a key already present, typing an endpoint transmits that live key to every
 * intermediate prefix of the hostname. `https://api.example.com` sends it to `https://a`,
 * `https://ap`, `https://api`, and so on — each prefix that resolves is a third party receiving a
 * credential the operator never meant to give it. It composes badly with the SSRF guard's
 * deliberate allowance of loopback on any port, which turns a typed `http://localhost:NNNN` into a
 * key-bearing walk of local ports.
 *
 * A debounce alone does NOT fix this, which is why this gate exists in addition to one: debouncing
 * cuts ~30 requests to a handful, but any pause mid-typing still fires, and a pause mid-typing is
 * exactly when the URL is a partial hostname. The number of unintended recipients goes down; it
 * does not go to zero.
 *
 * So the rule here is about the DESTINATION, not the timing: auto-discovery may only ever send the
 * key somewhere a preset already vouched for. A custom or hand-typed endpoint still works — it just
 * requires the operator to press "Test connection", which is an explicit, deliberate act of
 * pointing a credential at a host they chose. That is the "gate the effect on a committed baseUrl"
 * option the finding lists, tightened to "committed by an explicit action".
 *
 * @complexity Time: O(p) in the number of provider presets (a small, fixed constant); space: O(1).
 * @overallScore 100
 */
export function isPresetSuppliedEndpoint(baseUrl: string): boolean {
  return DEFAULT_PROVIDER_PRESETS.some((p) => !p.custom && p.baseUrl === baseUrl.trim());
}

/** Which provider presets this form's current credentials already satisfy — the filled/unfilled
 *  dot each `ProviderChipGroup` chip renders. Reads the per-provider drafts, so a chip's filled dot
 *  means "this provider has complete credentials in this form", not "this one is saved on the
 *  server"; only the save line under the key field makes the second claim.
 *
 * @complexity Time: O(p) in the number of provider presets; space: O(k) for the k configured ids.
 * @overallScore 100
 */
export function configuredPresetIds(config: ByokConfig): Set<string> {
  return new Set(DEFAULT_PROVIDER_PRESETS.filter((p) => isProviderConfigured(config, p)).map((p) => p.id));
}
