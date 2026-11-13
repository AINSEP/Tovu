### tovu:apps/admin/src/features/security/AccessTokensTab.tsx
- **Over:** file 847 lines · `AddCustomCredentialDialog` 119 · `TokenInputFields` 114
- **Phase:** after-move (DELETE-AFTER-PARITY) · **Batch:** size-51
- **Tests:** `apps/admin/src/features/security/__tests__/AccessTokensTab.unit.test.tsx`, `apps/admin/src/features/security/__tests__/AccessTokensTab.credential-flows.unit.test.tsx`, `apps/admin/src/features/security/__tests__/access-tokens-revoke-copy.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `AccessTokensTabProps`, `acceptsAnotherToken`, `resolve*Hook`, `SHOW_COPY_KEYS_ENTRY`, `AccessTokensTab`, `AccessTokensBody`, `HostingPluginsHint`, `AccessTokensCategoryFilter`, `AccessTokensSearch`, `ProviderGroup`, `AddAnotherButton`, `NotConnectedRow`, `TokenRow`, `CustomKeyUsage`, `TokenRowDefaultIndicator`, `RemoveConfirmDialog` | tab, list, rows (stays) |
| B | `REMOVE_FROM_TOVU`, `TokenInputFields`, `ExtraFieldInputs`, `ExtraFieldInput`, `WorksForField`, `ExistingTokenFields`, `SharedKeyReplaceNote`, `AddTokenForm` | token entry/replace fields |
| C | `RequiredFieldMarker`, `AdditionalHostsField`, `CustomKeyStorageChoice`, `AddCustomCredentialDialog` | "Add custom provider" dialog |

- **Splits:**
  1. NEW `AccessTokensTab-token-fields.tsx` — Moves unit B (with the "Remove from Tovu, never Revoke" comment on `REMOVE_FROM_TOVU`). Exports `REMOVE_FROM_TOVU`, `WorksForField`, `ExistingTokenFields`, `AddTokenForm`. In it, SUB-COMPONENT `TokenSecretField({ idPrefix, translate, info, token, onTokenChange, connected }): ReactNode` above `TokenInputFields` ← the second `<div className="field">` (the token input, ~50 lines).
  2. NEW `AccessTokensTab-custom-credential.tsx` — Moves unit C; imports `WorksForField` from step 1. Exports `AddCustomCredentialDialog`. In it, SUB-COMPONENT `CustomCredentialFields({ form, controller, translate, baseUrlInvalid }): ReactNode` above the dialog ← the five `<div className="field">` blocks (Name … storage choice), with the `RequiredFieldMarker` / hosts comments. `controller` is the dialog's own prop (not the hook result).
- **Importers to update:** none outside the file (moved names were private); `AccessTokensTab.tsx` imports `REMOVE_FROM_TOVU`, `ExistingTokenFields`, `AddTokenForm`, `AddCustomCredentialDialog`.
- **After:** `AccessTokensTab.tsx` ~395; `TokenInputFields` ~65; `AddCustomCredentialDialog` ~50; new files ~300 / ~165.
- **Risks / notes:** `AddCustomCredentialDialog` is a `forwardRef` const — keep it a `forwardRef` with the same display name; `useAddCustomCredentialDialog` import moves with it. DELETE-AFTER-PARITY.
