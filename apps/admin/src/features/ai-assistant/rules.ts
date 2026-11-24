import type { SiteAssistantCredential } from "@jini-ai/core/contracts/site/api-ai-assistant-api-types";
import type { VisitorCredentialFormController } from "@jini-ai/admin/screens/assistant-settings/visitor-credential-form-port";
import { type Translate } from "@jini-ai/core/text";
import { ApiError, describeApiError as describeApiErrorDefault } from "../../lib/admin-http/request";
import { storedCredentialHint } from "../../lib/credential-copy";
import { STORED_KEY_OTHER_PROVIDER_COPY } from "../../lib/stored-credential-endpoint";

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
export function describeApiError({ e, fallback }: { e: unknown; fallback: string }, _optional = {}): string {
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
  return describeApiErrorDefault({ e, fallback });
}

// The stored-key endpoint rules (`storedKeyIsForOtherEndpoint`, `hasUsableKey`, `storedKeyBlocksProbe`,
// `describeProbeError` and their two copy constants) live in `lib/stored-credential-endpoint.ts`, shared
// with the admin's own key screen.

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
  { stored }: { stored: SiteAssistantCredential | null },
  { storedKeyIsForOtherEndpoint = false }: { storedKeyIsForOtherEndpoint?: boolean } = {},
): string | undefined {
  return storedCredentialHint({ stored, storedKeyIsForOtherEndpoint });
}

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

/** The preset the Visitor tab starts on when nothing is saved: Anthropic (owner, 2026-10-09). Bound
 *  into the form by `hooks/visitor-credential-form-dependencies.hooks.ts`. */
export const DEFAULT_VISITOR_PRESET_ID = "anthropic";

/**
 * Save key's status line — whether the KEY reached the server, and nothing else. One of four
 * mutually exclusive messages keyed on `saveState.status` (plus `stored` for the two "idle"
 * variants), pulled to a top-level pure function for the same reason as `AiAssistant.tsx`'s
 * `visitorCredentialKeyStatusMessage`.
 *
 * `dirty` is deliberately NOT read here any more (two-button split, 2026-09-02). It means "settings
 * changed since they were last written", which is {@link visitorCredentialSettingsStatusMessage}'s
 * question — under the KEY field it would have announced an unsaved model change as though the key
 * were the thing left unsaved.
 *
 * The "WHICH key is stored" question lives in the field's own masked placeholder
 * (`visitorCredentialApiKeyPlaceholder`, `AiAssistant.tsx`), which is where an operator looks for it.
 * That mask went through a full round trip of being removed and restored during design, so the
 * conclusion is worth recording here too: it is a deliberate, bounded disclosure — without it the
 * field is blank and cannot distinguish "nothing was ever saved" from "a key is saved and working",
 * an ambiguity worse than four characters.
 *
 * @param optional.t - Defaults to English passthrough for `VisitorCredentialForm.unit.test.tsx`'s direct,
 *   locale-unaware calls, which keep asserting the exact English strings they always have.
 * @param optional.storedKeyIsForOtherEndpoint - The controller's flag of the same name. When set, the idle line
 *   asks for this provider's key instead of reporting a stored key this provider cannot use.
 */
export function visitorCredentialSaveStatusMessage(
  { saveState, stored }: { saveState: VisitorCredentialFormController["saveState"]; stored: VisitorCredentialFormController["stored"] },
  { t = (key) => key, storedKeyIsForOtherEndpoint = false }: { t?: Translate; storedKeyIsForOtherEndpoint?: boolean } = {},
): string | null {
  if (saveState.status === "saving") return t("Saving…");
  if (saveState.status === "saved") return t("Saved to the server, encrypted.");
  if (saveState.status !== "idle") return null;
  return visitorCredentialSaveIdleMessage({ stored, t, storedKeyIsForOtherEndpoint });
}

/** {@link visitorCredentialSaveStatusMessage}'s idle line on its own: always a string, so the Save
 *  key ⓘ (`VisitorCredentialKeyActions`) reads it without a null fallback that could never apply. */
export function visitorCredentialSaveIdleMessage(
  { stored, t, storedKeyIsForOtherEndpoint }: {
    stored: VisitorCredentialFormController["stored"];
    t: Translate;
    storedKeyIsForOtherEndpoint: boolean;
  },
  _optional: Record<string, never> = {},
): string {
  if (storedKeyIsForOtherEndpoint) return t(STORED_KEY_OTHER_PROVIDER_COPY);
  if (stored?.isSet) return t("Stored on the server, encrypted. Paste a new key to replace it.");
  return t("Paste your key, check it with Show, then press Save key.");
}

/**
 * Save settings' own status line.
 *
 * Says "Settings saved." and never anything about encryption or the server holding a key: this
 * button sends no `apiKey`, so borrowing {@link visitorCredentialSaveStatusMessage}'s "Saved to the
 * server, encrypted." would recreate — under a new button — the exact false confirmation the split
 * exists to remove.
 *
 * @param t - Same seam as its sibling above.
 */
export function visitorCredentialSettingsStatusMessage(
  settingsSaveState: VisitorCredentialFormController["settingsSaveState"],
  t: Translate = (key) => key,
): string | null {
  if (settingsSaveState.status === "saving") return t("Saving…");
  if (settingsSaveState.status === "saved") return t("Settings saved.");
  return null;
}
