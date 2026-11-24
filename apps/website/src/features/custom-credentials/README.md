# custom-credentials (host)

Tovu's binding of the custom credential store, cards and credentialed requests to
`@jini-ai/integrations` (`credentialed-http`, `credentialed-http/sets`, `credentialed-http/tools`,
`custom-credentials/*`).

## Wiring

- `cleanCardToken` comes from `@jini-ai/integrations/custom-credentials/card-token`; `tool-registrations.ts` imports it directly.
- `withCustomCredentialSetup` comes from `@jini-ai/integrations/custom-credentials/credential-recovery`.
  The host injects `issueCredentialSetup` (the daemon issuer bound to Tovu's credential-free-field and
  redaction checks, `contracts/core/tool-failure-diagnostics.ts`) at `tool-registrations.ts`'s
  `recovery.withSetup` binding.
- `custom-credential-repo.ts` (`SqlCustomCredentialSetRepo`) binds the content kernel and Tovu's vault
  owner key; `server/runtime/composition/site-deps/provider-config.ts` constructs it directly.
- `repo.memory.ts`, `tovu-credential-card-identity.ts` and `publish-compatibility-port.ts` stay host-side
  (Tovu fixtures, Tovu card URI namespace/app names, and the workspace-scoped publish port).
- The create / set-token card builders come from `@jini-ai/integrations/custom-credentials/custom-credential-{create,set-token}-ui`;
  `tool-registrations.ts`'s `credentialCardForms` binding passes `tovuCredentialCardIdentity.appNames.*`,
  `CUSTOM_CREDENTIAL_CATEGORIES` (`contracts/core/custom-credential-categories.ts`) and the
  `credential_save` secret marker (`SECRET_FORM_CARD_DEFINITIONS`).
- The provider-settings card comes from `@jini-ai/integrations/custom-credentials/provider-settings-card`;
  `server/runtime/composition/tool-catalog-manifest.ts` passes `cards: { defineSecretCardTool, askThenReport }`
  and `identity: tovuProviderSettingsCardIdentity` (`tovu-credential-card-identity.ts`).
- `bindCredentialedRequestPort` / `classifyCredentialedRequestError` come from
  `@jini-ai/integrations/custom-credentials/credential-ports`; `tool-registrations.ts` passes
  `TOVU_CREDENTIALED_REQUEST_OPERATIONS` (this folder's `credentialed-request.ts` functions) as `operations`.
