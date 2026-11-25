import { useMemo } from "react";
import { resolveByokFooterStatusLine, type AdminByokSaveState } from "@jini-ai/integrations/react/admin-credentials/byok-footer-status";
import { useExecutionCredential, type UseExecutionCredentialInput, type ExecutionCredentialController, type ExecutionCredentialPort, type ExecutionCredentialEffects } from "@jini-ai/ui";

import type { AdminExecutionCredential } from "@jini-ai/core/contracts/site/api-ai-assistant-api-types";
import { ApiError, describeApiError as describeApiErrorDefault } from "../lib/admin-http/request";
import { clearLegacyLocalCredential, readLegacyLocalCredential } from "../lib/execution-settings";
import { EXECUTION_NAMESPACE, hasTypedAdminKey } from "@jini-ai/admin/shell/lib/execution-settings-ledger";

import { publishSettingsRefresh, subscribeToSettingsRefresh } from "@jini-ai/admin/shell/lib/settings-refresh-bus";
import { STORED_KEY_OTHER_PROVIDER_COPY, hasUsableKey, storedKeyBlocksProbe, storedKeyIsForOtherEndpoint as storedKeyIsForOtherEndpointRule } from "@jini-ai/admin/shell/lib/stored-credential-endpoint";
import { defaultAdminExecutionCredentialPort } from "./admin-execution-credential-dependencies.hooks";
import type { AdminExecutionCredentialPort } from "@jini-ai/admin/shell/hooks/admin-execution-credential-port.hooks";
import { storedCredentialHint } from "../lib/credential-copy";
import { useAdminLocale } from "./use-admin-locale.hooks";

/** Host adapter for the shared write-only credential controller; footer/error copy remains product-owned. */

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
function describeAdminExecutionCredentialError({ e, fallback }: { e: unknown; fallback: string }, _options = {}): string {
  if (e instanceof ApiError) {
    if (e.code === "EXECUTION_CREDENTIAL_VALIDATION_ERROR") return e.message || "That value was rejected.";
    // Same fail-closed translation `features/ai-assistant/rules.ts`'s `describeApiError` gives the
    // sibling site-credential code — the server has no site key to encrypt under, and that is
    // an operator-actionable server fact, not a problem with the key that was just typed.
    if (e.code === "SECRET_STORE_UNCONFIGURED")
      return "The server can't store keys yet: it has no site key. Set TOVU_SITE_KEY (hex) and restart. Your key was not saved.";
  }
  return describeApiErrorDefault({ e, fallback });
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
  describeError: ({ error, fallback }) => describeAdminExecutionCredentialError({ e: error, fallback }),
  hasTypedKey: ({ apiKey }) => hasTypedAdminKey({ apiKey }),
  storedKeyIsForOtherEndpoint: ({ stored, baseUrl }) => storedKeyIsForOtherEndpointRule({ stored, baseUrl }),
  hasUsableKey: ({ apiKey, stored, baseUrl }) => hasUsableKey({ apiKey, stored, baseUrl }),
  storedKeyBlocksProbe: ({ apiKey, stored, baseUrl }) => storedKeyBlocksProbe({ apiKey, stored, baseUrl }),
  credentialHint: ({ stored, storedKeyIsForOtherEndpoint }, options = {}) => storedCredentialHint({ stored, storedKeyIsForOtherEndpoint }, options),
};
/** Bind host policy and migration; the package owns save/refresh ordering and draft clearing. */
export function useAdminExecutionCredential(
  { input, port, useExecutionCredentialHook }: {
    input: UseAdminExecutionCredentialInput;
    port: AdminExecutionCredentialPort;
    useExecutionCredentialHook: typeof useExecutionCredential<AdminExecutionCredential>;
  },
  _optional: Record<string, never> = {},
): AdminExecutionCredentialController {
  // Stable identity prevents a render from restarting the stored-view GET/subscription effect.
  const adapted = useMemo<ExecutionCredentialPort<AdminExecutionCredential>>(() => ({
    loadAdminExecutionCredential: () => port.loadAdminExecutionCredential(),
    saveAdminExecutionCredential: ({ patch }) => port.saveAdminExecutionCredential({ patch }),
  }), [port]);
  return useExecutionCredentialHook({ ...input, port: adapted, effects: executionCredentialEffects }, {});
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
  _optional: Record<string, never> = {},
): AdminExecutionCredentialController {
  const locale = useAdminLocale();
  return useAdminExecutionCredential({ input: { ...input, locale }, port: defaultAdminExecutionCredentialPort, useExecutionCredentialHook: useExecutionCredential }, {});
}

/**
 * The admin's binding of the neutral footer status rule to Jini's `AdminByokKeyFooter`
 * `resolveByokFooterStatusLine` port: the port hands the screen's `t`, the rule takes copy, so
 * the admin's English copy is translated here once per render.
 *
 * @complexity Time/space: O(1).
 */
export function resolveAdminByokFooterStatusLine(
  { status, isStored }: { status: AdminByokSaveState["status"]; isStored: boolean },
  { storedKeyIsForOtherEndpoint = false, t = (key: string) => key }: { storedKeyIsForOtherEndpoint?: boolean; t?: (key: string) => string } = {},
): string | null {
  const copy = {
    saving: t("Saving…"),
    saved: t("Saved to the server, encrypted."),
    otherEndpoint: t(STORED_KEY_OTHER_PROVIDER_COPY),
    stored: t("Stored on the server, encrypted. Paste a new key to replace it."),
    enterKey: t("Paste your key, then press Save key."),
  };
  return resolveByokFooterStatusLine({ status, isStored, copy }, { storedKeyIsForOtherEndpoint });
}
