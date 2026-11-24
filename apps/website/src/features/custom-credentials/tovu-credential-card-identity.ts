/**
 * @file Tovu's card identity for the credential tools (`CredentialCardIdentity`).
 *
 * Every credential card URI starts `ui://tovu/`, and each card keeps the app name it has always
 * reported, so saved cards, answer routing and the goldens stay byte-identical. Bound once here and
 * passed in by the old entries of `tool-registrations.ts` and `credential-copy-tool.ts`.
 */
import type { CredentialCardIdentity } from '@jini-ai/integrations/credentialed-http/tools';
import type { ProviderSettingsCardIdentity } from '@jini-ai/integrations/custom-credentials/provider-settings-card';
import { CREDENTIAL_SAVE_TOOL_ID } from '../../contracts/headless/index.js';

export const tovuCredentialCardIdentity: CredentialCardIdentity = {
  uriNamespace: "tovu",
  appNames: {
    create: { appName: "tovu-custom-credential-create", appVersion: "1" },
    createOutcome: { appName: "tovu-custom-credential-create-outcome", appVersion: "1" },
    setToken: { appName: "tovu-custom-credential-set-token", appVersion: "1" },
    setTokenOutcome: { appName: "tovu-custom-credential-set-token-outcome", appVersion: "1" },
  },
};

/** Tovu's identity for the provider-settings key card (`@jini-ai/integrations/custom-credentials/provider-settings-card`):
 *  it answers as `credential_save` under `ui://tovu/` with the app names its form and outcome have always reported. */
export const tovuProviderSettingsCardIdentity: ProviderSettingsCardIdentity = {
  toolId: CREDENTIAL_SAVE_TOOL_ID,
  uriNamespace: "tovu",
  formApp: { appName: "tovu-provider-settings-card", appVersion: "1" },
  outcomeApp: { appName: "tovu-provider-settings-outcome", appVersion: "1" },
};
