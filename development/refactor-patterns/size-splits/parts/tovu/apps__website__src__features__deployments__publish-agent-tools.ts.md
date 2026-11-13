### tovu:apps/website/src/features/deployments/publish-agent-tools.ts
- **Over:** file 763 lines · `buildStaticPublishRegistrations` 155
- **Phase:** after-move (MIXED: catalog copy, capabilit…) · **Batch:** size-48
- **Tests:** `apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts`, `apps/website/src/features/deployments/__tests__/publish-agent-tools.abort-guard.unit.test.ts`, `apps/website/src/features/deployments/static-publish/__tests__/domain-publish-tool.unit.test.ts`, `apps/website/src/assistant/__tests__/moved-tools.credential-cards.golden.test.ts`, `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | re-exports, `AgentToolDefinition`, `NO_INPUT_SCHEMA`, the 3 schemas, `DEPLOYMENTS_READ_PERMISSION`, `SITE_PUBLISH_ENTITY`, `staticPublishAgentToolCatalog`, `CATALOG_BY_ID`, `staticPublishDerivedRisk`, `planToolPublish`, `PUBLISH_REQUEST_KEYS`, `toolCredentialChoice`, `requireOnlyDeclaredFields`, `configDetailRows`, `EXECUTE_STATIC_PUBLISH_TOOL_ID`, `buildStaticPublishPreviewResult`, `trackBlockedToolPublish`, `MissingHost`, `hostsMissingSavedKey`, `buildStaticPublishRegistrations`, `contributeStaticPublishTools` | catalog + publish tool handlers (stays) |
| B | `buildCapabilityGuidance`, `ProviderCapabilityContext`, `mapSavedCredentials`, `buildProviderCapabilityResult`, `buildProviderCapability`, `buildInstalledProviderCapability` | per-provider capability answers |
| C | `DetailRow`, `publishConfirmationUri`, `buildPublishOutcomeResource`, `PublishConfirmationContext`, `mapPublishOutcomeToToolResult` | publish confirmation/outcome cards |
| D | `deployTargetsLoader`, `CUSTOM_PROVIDER_CREDENTIAL_ROW_LABEL`, `requireStaticPublishTarget`, `requireCredentialTarget`, `readCredentialHints`, `readCredentialHint`, `buildProposeCredentialForm`, `publishConnectionValues`, `publishCredentialToUpdate`, `saveProposedCredential`, `checkPublishReplacement`, `saveProposeCredential`, `credentialConnectionStatus`, `buildPublishHostCredentialHandler` | propose/save a host credential from chat |

- **Splits:**
  1. NEW `publish-agent-tools-capabilities.ts` — Moves unit B. Exports `ProviderCapabilityContext`, `buildInstalledProviderCapability`.
  2. NEW `publish-agent-tools-outcome.ts` — Moves unit C (+ the long outcome-card doc). Exports `DetailRow`, `mapPublishOutcomeToToolResult`.
  3. NEW `publish-agent-tools-credential.ts` — Moves unit D (+ the `ui://` form-URI comment above `requireStaticPublishTarget`). Exports `deployTargetsLoader`, `requireStaticPublishTarget`, `buildPublishHostCredentialHandler`. Needs `SITE_PUBLISH_ENTITY`: move that 1-line const here too and import it back in the original (new never imports original).
  4. HANDLER FACTORIES in the original, above `buildStaticPublishRegistrations`: `previewStaticPublishHandler({ deps, credentialSource })`, `staticPublishCapabilitiesHandler({ deps, credentialSource })`, `staticPublishStatusHandler({ deps, historyStore })`, `executeStaticPublishHandler({ deps, credentialSource, historyStore, surfaces })`, `bucketHostingSetupHandler({ deps })` — each `(…): ToolHandler` ← the value of the same-named key in `const handlers: Record<string, ToolHandler> = {` (exact inputs = what each body reads). `handlers` keeps the same keys in order.
- **Importers to update:** `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`, `apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts`, `apps/website/src/assistant/__tests__/moved-tools.credential-cards.golden.test.ts` (`buildPublishHostCredentialHandler` → `publish-agent-tools-credential`); `publish-agent-tools.unit.test.ts` if it imports `requireStaticPublishTarget`.
- **After:** original ~400; `buildStaticPublishRegistrations` ~20; `executeStaticPublishHandler` ~80; new files ~95 / ~95 / ~200.
- **Risks / notes:** no `mock.module` of this path found. `executeStaticPublishHandler` takes `(inputCtx, optional = {})` — keep that two-arg handler signature exactly.
