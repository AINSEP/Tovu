/**
 * @file Tovu's card identity for the credential tools (`CredentialCardIdentity`).
 *
 * Every credential card URI starts `ui://tovu/`, and each card keeps the app name it has always
 * reported, so saved cards, answer routing and the goldens stay byte-identical. Bound once here and
 * passed in by the old entries of `tool-registrations.ts` and `credential-copy-tool.ts`.
 */
import type { CredentialCardIdentity } from './credential-tool-host.js';

export const tovuCredentialCardIdentity: CredentialCardIdentity = {
  uriNamespace: "tovu",
  appNames: {
    create: { appName: "tovu-custom-credential-create", appVersion: "1" },
    createOutcome: { appName: "tovu-custom-credential-create-outcome", appVersion: "1" },
    setToken: { appName: "tovu-custom-credential-set-token", appVersion: "1" },
    setTokenOutcome: { appName: "tovu-custom-credential-set-token-outcome", appVersion: "1" },
  },
};
