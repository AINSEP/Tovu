import { DEFAULT_PROVIDER_PRESETS } from "@jini-ai/integrations/media-providers/catalog";
import { groupPresets, isProviderConfigured, type ApiProtocol, type ByokConfig, type ProviderPreset } from "@jini-ai/ui/core";

import { ApiError, describeApiError as describeApiErrorDefault, type SiteAssistantCredential } from "../../lib/api";
import { storedCredentialHint } from "../../lib/credential-copy";

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
    // the variable, but it names it in server-operator language ("set TOVU_SITE_KEY (a
    // hex-encoded site key) in the server environment") arriving in a UI where the reader has just
    // pasted a key and been told it did not save. The distinction that matters to them is that
    // NOTHING IS WRONG WITH THEIR KEY — the server has no site key to encrypt it under.
    if (e.code === "SECRET_STORE_UNCONFIGURED")
      return "The server can't store keys yet: it has no site key. Set TOVU_SITE_KEY (hex) and restart. Your key was not saved.";
    if (e.code === "SITE_CREDENTIAL_VALIDATION_ERROR") return e.message || "That value was rejected.";
  }
  return describeApiErrorDefault(e, fallback);
}

// The stored-key endpoint rules (`storedKeyIsForOtherEndpoint`, `hasUsableKey`, `storedKeyBlocksProbe`,
// `describeProbeError` and their two copy constants) live in `lib/stored-credential-endpoint.ts`, shared
// with the admin's own key screen.

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
  const trimmed = baseUrl.trim();
  // Azure OpenAI's preset ships `baseUrl: ''` as a placeholder, so without this guard a cleared
  // field "matches" it and authorizes key-bearing discovery with no destination at all (F4.4/F6.2).
  if (trimmed === "") return false;
  return DEFAULT_PROVIDER_PRESETS.some((p) => !p.custom && p.baseUrl === trimmed);
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

/**
 * The form's config after hydration from the server's stored view — `protocol`/`providerId` as well as
 * `baseUrl`/`model`.
 *
 * `saveVisitorSettings` writes `provider: config.protocol`, so a hydration that skipped the provider
 * left an Anthropic (or any non-Google) credential under the form's Google default, and the next
 * model-only "Save settings" relabelled the stored row Google. The server keeps no preset id, so
 * `providerId` is recovered from the endpoint: the preset whose protocol and base URL both match, else
 * the preset of that protocol whose URL the operator supplies (Azure), else `null` — the custom
 * endpoint, which is what an endpoint no preset owns is. A `provider` string that is not a protocol
 * this form knows leaves protocol and preset as they were rather than guessing.
 *
 * @complexity Time: O(p) in the number of provider presets; space: O(1).
 */
export function hydrateVisitorCredentialConfig(current: ByokConfig, stored: SiteAssistantCredential): ByokConfig {
  // Nothing saved yet: the server still answers with its own default `provider`, which would
  // override the form's Anthropic default with a provider the operator never chose (2026-10-09).
  if (!hasSavedVisitorCredential(stored)) return current;
  const baseUrl = stored.baseUrl ?? current.baseUrl;
  const model = stored.model ?? current.model;
  const protocol = knownProtocol(stored.provider);
  if (protocol === null) return { ...current, baseUrl, model };
  const presets = DEFAULT_PROVIDER_PRESETS.filter((p) => !p.custom && p.protocol === protocol);
  const preset = presets.find((p) => p.baseUrl === baseUrl) ?? presets.find((p) => p.baseUrl === "");
  return { ...current, protocol, providerId: preset?.id ?? null, baseUrl, model };
}

/** `provider` as an {@link ApiProtocol} when some preset speaks it, else `null`.
 *  @complexity Time: O(p) in the number of provider presets; space: O(1). */
function knownProtocol(provider: string): ApiProtocol | null {
  return DEFAULT_PROVIDER_PRESETS.find((p) => p.protocol === provider)?.protocol ?? null;
}

/** The server's `••••<last 4>` shown IN the key field — which key is stored, answered where the
 *  operator is already looking, instead of in a sentence underneath. `undefined` (no placeholder)
 *  whenever nothing is stored or the server didn't send a mask.
 *
 *  Safe precisely BECAUSE it is a placeholder: `config.apiKey` stays empty, so `saveKey`
 *  sends nothing at all and the stored key is left alone. A pre-filled value here would be a
 *  real value the save path would persist AS the key. Pulled to a top-level pure function per the
 *  complexity-pass extraction rule — one of the few remaining branch points in
 *  `VisitorCredentialForm` itself once {@link VisitorCredentialKeyFooter} moved out.
 *
 *  Also `undefined` when the stored key belongs to another endpoint: after a provider switch the mask
 *  would read as a key saved for the provider now selected. */
export function visitorCredentialApiKeyPlaceholder(
  stored: SiteAssistantCredential | null,
  storedKeyIsForOtherEndpoint = false,
): string | undefined {
  return storedCredentialHint({ stored, storedKeyIsForOtherEndpoint });
}

/** The Visitor tab's status pill: what visitors get right now. */
export type VisitorAssistantStatus = "on" | "off" | "needs-key";

/**
 * The Visitor tab's status pill and enable-switch gate (2026-10-09 redesign).
 *
 * "Needs a key" wins over the switch's own value: an enabled assistant with no stored key is
 * mounted but cannot answer, which is exactly the silent failure this tab exists to surface.
 * The switch can always be turned OFF; it can only be turned ON once a key is saved.
 *
 * @complexity Time/space: O(1).
 */
export function visitorAssistantStatus(required: { publicEnabled: boolean; hasStoredKey: boolean }, _optional = {}): {
  status: VisitorAssistantStatus; canEnable: boolean;
} {
  const status: VisitorAssistantStatus = !required.hasStoredKey ? "needs-key" : required.publicEnabled ? "on" : "off";
  return { status, canEnable: required.hasStoredKey || required.publicEnabled };
}

/** The pill's label and its one short hint line, per status (English keys; the view runs `t`). */
export const VISITOR_STATUS_COPY: Record<VisitorAssistantStatus, { label: string; hint: string }> = {
  on: { label: "On", hint: "Visitors can chat with it on every public page." },
  off: { label: "Off", hint: "Visitors see no assistant." },
  "needs-key": { label: "Needs a key", hint: "Save a key in step 1 first." },
};

/**
 * Which status lines show under the visitor key field (2026-10-09 redesign). The two IDLE lines are
 * instructions, not results ("Checks the key against the provider…", "Paste your key…"), so they
 * live in the ⓘ tips beside Test key / Save key; a line shows only once there is something to report.
 * The other-provider warning is the exception: it is idle, but it is a fact the operator must see.
 *
 * @complexity Time/space: O(1).
 */
export function visitorKeyFooterLines(required: {
  discoveryStatus: string; saveStatus: string; storedKeyIsForOtherEndpoint: boolean;
}, _optional = {}): { keyStatus: boolean; saveLine: boolean } {
  return {
    keyStatus: required.discoveryStatus !== "idle",
    saveLine: required.saveStatus !== "idle" || required.storedKeyIsForOtherEndpoint,
  };
}

/** The preset the Visitor tab starts on when nothing is saved: Anthropic (owner, 2026-10-09). */
export const DEFAULT_VISITOR_PRESET_ID = "anthropic";

/**
 * The form's starting config: the default preset's protocol and endpoint, an empty key and an empty
 * model. The model stays empty on purpose: the model list is a property of the key, so it waits
 * for one (see the hook's `discovery`). Hydration replaces this when something is saved.
 *
 * @complexity Time: O(p) in the number of provider presets; space: O(1).
 */
export function defaultVisitorCredentialConfig(
  _required: Record<string, never> = {},
  { presets = DEFAULT_PROVIDER_PRESETS }: { presets?: typeof DEFAULT_PROVIDER_PRESETS } = {},
): ByokConfig {
  const preset = presets.find((p) => p.id === DEFAULT_VISITOR_PRESET_ID) ?? presets[0];
  return { protocol: preset.protocol, providerId: preset.id, apiKey: "", baseUrl: preset.baseUrl, model: "" };
}

/** True once the server holds anything for this site: a key, or saved provider settings. A row with
 *  none of these is the server's empty default, not the operator's choice.
 *  @complexity Time/space: O(1). */
export function hasSavedVisitorCredential(stored: SiteAssistantCredential): boolean {
  return stored.isSet === true || stored.baseUrl !== null || stored.model !== null || stored.updatedAt !== null;
}

/** One `<optgroup>` of the Visitor tab's Provider select. */
export interface VisitorProviderGroup {
  label: "Protocols" | "Gateways";
  options: { preset: ProviderPreset; configured: boolean }[];
}

/**
 * The Provider select's two optgroups, protocols then gateways (`groupPresets`' order), each option
 * flagged when this form already holds complete credentials for it (the old chips' filled dot).
 *
 * @complexity Time: O(p) in the number of provider presets; space: O(p).
 */
export function visitorProviderGroups(configuredIds: ReadonlySet<string>): VisitorProviderGroup[] {
  const { protocols, gateways } = groupPresets(DEFAULT_PROVIDER_PRESETS);
  const toOptions = (presets: readonly ProviderPreset[]) => presets.map((preset) => ({ preset, configured: configuredIds.has(preset.id) }));
  return [
    { label: "Protocols", options: toOptions(protocols) },
    { label: "Gateways", options: toOptions(gateways) },
  ];
}
