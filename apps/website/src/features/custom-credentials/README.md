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
- `tool-registrations.ts` passes the platform `EgressRefusedError` to `bindCredentialedRequestPort`
  (`deployments/deploy-ops/run-ops.ts` passes it to `classifyCredentialedRequestError`) and the Base URL
  field hint (`baseUrlHint`) to `buildCreateForm`.
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
- Those request functions are `@jini-ai/integrations/custom-credentials/credentialed-request`'s
  `bindCustomCredentialRequestOperations`, bound once in `credentialed-request.ts` with `host`: `describe`/`resolve`
  (`store.ts`'s `describeCredentialByLabel`/`resolveCustomCredentialByLabel`), `send` (the positional
  `HttpClientPort.send(request, options)`), `EgressRefusedError` (`platform/http`), `defaultAudit`
  (`ConsoleCredentialedRequestAuditLog`, the `[custom-credentials]` prefix) and `savedHostRemedy` (the Access Tokens wording).
- The agent-tool schema shapes come from `@jini-ai/integrations/custom-credentials/agent-tools`'s
  `buildCustomCredentialsAgentToolCatalog`; `agent-tools.ts` passes Tovu's tool `ids` (incl.
  `WRITE_FILES_TOOL_ID`), `permissions`, every description sentence (`copy`) and `WRITE_FILES_LIMITS`
  (`write-files-validation.ts`), so the catalog stays byte-identical.
- Self-describing token scheme rules (`loadAuthSchemes`) come from `@jini-ai/agent-plugins/site/auth-schemes`; tests and
  `__tests__/fixture-auth-schemes.fixture.ts` inject `parseCredentialSchemesFile` plus the lifecycle's contribution
  loader (see `features/agent-plugins/README.md` `## Wiring`).
## Wiring

- `credential-copy-tool.ts` binds the host (`TOVU_CREDENTIAL_COPY_HOST`, card identity, tool metadata) into
  `createCredentialCopyRegistrations` from `@jini-ai/integrations/credentialed-http/tools` and re-exports nothing:
  callers import `createCredentialCopyRegistrations` and `CredentialCopyRequired` from that owner subpath.
- `plugin-credential-card.ts` binds the validation error and the credential-free field check into
  `createPluginCredentialCardOperations` (`@jini-ai/agent-plugins/connect`). It still re-exports
  `LoadPluginCredentialCards` and `loadPluginCredentialCardsSafely` only because the mail-status provider tool
  registration (a different lane) imports them from here; every other caller takes them, and
  `findPluginCredentialCard`, from `@jini-ai/agent-plugins/connect` directly.
