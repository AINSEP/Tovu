### jini:packages/agent-plugins/src/connect/credential-save-tool.ts
- **Over:** `createCredentialSaveTools` 119
- **Phase:** now · **Batch:** size-27
- **Tests:** `packages/agent-plugins/src/connect/__tests__/host-tool-inputs.unit.test.ts`; also `rg -l "createCredentialSaveTools" packages --glob '*.test.*'` (pkg `@jini-ai/agent-plugins`)
- **Responsibility map:** A = `routeSave`, `selectProviderSettingsSave`, `selectProviderSave`, `selectApiSave`, `selectPublishSave`, `invokeSaveAdapter` — closure-free routing of a selected kind to its domain adapter (outline: no `uses` of factory locals); B = `KINDS`, `CredentialKind`, `credentialSaveCatalog`, `credentialSaveDerivedRisk`, `selectSave`, `buildCredentialSaveRegistrations`, `routePluginCard`, return — tool definition + registration (read the factory params).
- **Splits:**
  1. MOVE unit A verbatim to module level directly above `createCredentialSaveTools`, in the same order, with their why-comments. They are existing functions (signatures unchanged). If any of their signatures names `CredentialKind` or reads `KINDS`, move `const KINDS = [...] as const` and `type CredentialKind` to module level too (they read no params).
  2. Before moving each, `rg` its body for any factory param (`messages`, `toolMetadata`, `CREDENTIAL_SAVE_TOOL_ID`, `_optional`) — `invokeSaveAdapter` lists `_optional`: if it really reads it, leave `invokeSaveAdapter` inside.
- **Importers to update:** none.
- **After:** `createCredentialSaveTools` ~75; file ~140.
- **Risks / notes:** `@agent-note` comments stay where they are.
