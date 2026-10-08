import { useMemo } from "react";
import { useExecutionCredential, type UseExecutionCredentialInput, type ExecutionCredentialController, type ExecutionCredentialPort, type ExecutionCredentialEffects, type ExecutionCredentialSaveState } from "@jini-ai/ui";

import { ApiError, type AdminExecutionCredential, describeApiError as describeApiErrorDefault } from "../lib/api";
import {
  EXECUTION_NAMESPACE,
  clearLegacyLocalCredential,
  hasTypedAdminKey,
  readLegacyLocalCredential,
} from "../lib/execution-settings";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { publishSettingsRefresh, subscribeToSettingsRefresh } from "../lib/settings-refresh-bus";
import {
  STORED_KEY_OTHER_PROVIDER_COPY,
  hasUsableKey,
  storedKeyBlocksProbe,
  storedKeyIsForOtherEndpoint as storedKeyIsForOtherEndpointRule,
} from "../lib/stored-credential-endpoint";
import { defaultAdminExecutionCredentialPort } from "./admin-execution-credential-dependencies.hooks";
import type { AdminExecutionCredentialPort } from "./admin-execution-credential-port.hooks";
import { storedCredentialHint } from "../lib/credential-copy";
import { useAdminLocale } from "./use-admin-locale.hooks";

/** Host adapter for the shared write-only credential controller; footer/error copy remains product-owned. */

export type AdminByokSaveState = ExecutionCredentialSaveState;

/**
 * {@link AdminByokKeyFooter}'s status line, as a single string (or `null` to render nothing) — the
 * four mutually-exclusive `saveState.status` checks that used to sit directly in
 * `AdminByokKeyFooter`'s JSX (`components/AdminByokKeyPanel.tsx`), pulled out as a top-level pure
 * function per the complexity-ceiling brief. `isStored` takes the already-narrowed boolean rather
 * than the full `stored` record, so this function has no dependency on
 * `AdminExecutionCredentialController`'s shape beyond the one field it reads.
 *
 * @param storedKeyIsForOtherEndpoint - The controller's flag of the same name. While idle, the line
 *   then asks for this provider's key instead of reporting a stored key this provider cannot use —
 *   the same ask, and the same dictionary key, as the visitor screen's key line.
 * @param t - The host screen's translator. Defaults to English passthrough.
 * @complexity O(1).
 */
export function resolveByokFooterStatusLine(
  status: AdminByokSaveState["status"],
  isStored: boolean,
  storedKeyIsForOtherEndpoint = false,
  t: Translate = (key) => key,
): string | null {
  if (status === "saving") return t("Saving…");
  if (status === "saved") return t("Saved to the server, encrypted.");
  if (status !== "idle") return null;
  if (storedKeyIsForOtherEndpoint) return t(STORED_KEY_OTHER_PROVIDER_COPY);
  return t(isStored ? "Stored on the server, encrypted. Paste a new key to replace it." : "Paste your key, then press Save key.");
}

/**
 * The key field's placeholder: the server's mask for a key stored for the form's endpoint, otherwise
 * `undefined`. Under another provider the mask would read as a key saved for that provider — the owner's
 * report showed the Google key's `••••mw4w` in OpenAI's field. Same rule as the visitor screen's
 * `visitorCredentialApiKeyPlaceholder`.
 *
 * @param stored - The server's view, or `null` before it loads.
 * @param storedKeyIsForOtherEndpoint - The controller's flag of the same name.
 * @returns The mask, or `undefined` for an empty placeholder.
 * @complexity O(1).
 */

/** Overrides layered on the shared default (`lib/api.ts`'s `describeApiError`), mirroring
 *  `features/ai-assistant/rules.ts`'s identical pattern for the sibling site-credential codes.
 *
 * @complexity Time/space: O(1).
 * @overallScore 100
 */
function describeAdminExecutionCredentialError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === "EXECUTION_CREDENTIAL_VALIDATION_ERROR") return e.message || "That value was rejected.";
    // Same fail-closed translation `features/ai-assistant/rules.ts`'s `describeApiError` gives the
    // sibling site-credential code — the server has no site key to encrypt under, and that is
    // an operator-actionable server fact, not a problem with the key that was just typed.
    if (e.code === "SECRET_STORE_UNCONFIGURED")
      return "The server can't store keys yet: it has no site key. Set TOVU_SITE_KEY (hex) and restart. Your key was not saved.";
  }
  return describeApiErrorDefault(e, fallback);
}

export type UseAdminExecutionCredentialInput = UseExecutionCredentialInput;
export type AdminExecutionCredentialController = ExecutionCredentialController<AdminExecutionCredential>;
const executionCredentialEffects: ExecutionCredentialEffects<AdminExecutionCredential> = {
  namespace: EXECUTION_NAMESPACE,
  refreshPort: {
    publish: ({ namespaces }) => publishSettingsRefresh(namespaces),
    subscribe: ({ listener }) => subscribeToSettingsRefresh(listener),
  },
  readLegacyCredential: () => readLegacyLocalCredential(),
  clearLegacyCredential: () => clearLegacyLocalCredential(),
  describeError: ({ error, fallback }) => describeAdminExecutionCredentialError(error, fallback),
  hasTypedKey: ({ apiKey }) => hasTypedAdminKey(apiKey),
  storedKeyIsForOtherEndpoint: ({ stored, baseUrl }) => storedKeyIsForOtherEndpointRule(stored, baseUrl),
  hasUsableKey: ({ apiKey, stored, baseUrl }) => hasUsableKey(apiKey, stored, baseUrl),
  storedKeyBlocksProbe: ({ apiKey, stored, baseUrl }) => storedKeyBlocksProbe(apiKey, stored, baseUrl),
  credentialHint: ({ stored, storedKeyIsForOtherEndpoint }, options) => storedCredentialHint({ stored, storedKeyIsForOtherEndpoint }, options),
};
/** Bind host policy and migration; the package owns save/refresh ordering and draft clearing. */
export function useAdminExecutionCredential(input: UseAdminExecutionCredentialInput, port: AdminExecutionCredentialPort): AdminExecutionCredentialController {
  // Stable identity prevents a render from restarting the stored-view GET/subscription effect.
  const adapted = useMemo<ExecutionCredentialPort<AdminExecutionCredential>>(() => ({
    loadAdminExecutionCredential: () => port.loadAdminExecutionCredential(),
    saveAdminExecutionCredential: ({ patch }) => port.saveAdminExecutionCredential(patch),
  }), [port]);
  return useExecutionCredential({ ...input, port: adapted, effects: executionCredentialEffects }, {});
}

/**
 * Binds the real `loadAdminExecutionCredential`/`saveAdminExecutionCredential` — see
 * `admin-execution-credential-dependencies.hooks.ts`.
 *
 * The zero-argument-port half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `SettingsUi.tsx`/`AiAssistant.tsx` compose this and a test composes {@link useAdminExecutionCredential}
 * with `createFakeAdminExecutionCredentialPort`.
 */
export function useWiredAdminExecutionCredential(
  input: UseAdminExecutionCredentialInput,
): AdminExecutionCredentialController {
  const locale = useAdminLocale();
  return useAdminExecutionCredential({ ...input, locale }, defaultAdminExecutionCredentialPort);
}
