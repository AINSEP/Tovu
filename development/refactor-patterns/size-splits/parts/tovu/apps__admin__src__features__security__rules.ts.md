### tovu:apps/admin/src/features/security/rules.ts
- **Over:** file 516 lines (no function over 100)
- **Phase:** after-move (MIXED — credential-row and form rules) · **Batch:** size-51
- **Tests:** `apps/admin/src/features/security/__tests__/rules.unit.test.ts`, `apps/admin/src/features/security/__tests__/OtherCredentialsSection.unit.test.tsx`, `apps/admin/src/features/security/hooks/__tests__/use-other-credentials.unit.test.tsx`, `apps/admin/src/features/security/__tests__/AccessTokensTab.hooks.unit.test.tsx`, `apps/admin/src/features/security/__tests__/AccessTokensTab.credential-flows.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `ACCESS_TOKENS_RESOURCE` … `accessTokenExistingRowReadyToSave`, `buildCustomProviderConnectionInput`, `buildCustomCredentialUpdatePatch`, `buildAdditionalHostsInput`, `accessTokensCountText` | Access Tokens (Tier-1) rows, providers, form gates (stays) |
| B | `OtherCredentialStoreId`, `OtherCredentialStoreInfo`, `OTHER_CREDENTIAL_STORES`, `otherCredentialStoreInfo`, `otherCredentialMatchesQuery`, `mediaProviderLabel`, `maskedTailFact`, `envNamesFact` | Tier-2 "other credential" store registry + value facts |

- **Splits:**
  1. NEW `apps/admin/src/features/security/rules-types.ts` — job: the category id types both rule modules share. Moves `AccessTokenCategoryId` and `AccessTokenRowCategoryId` (with their comments). `rules.ts` imports them (type-only).
  2. NEW `apps/admin/src/features/security/rules-other-credentials.ts` — job: Tier-2 credential store registry and its display facts. Moves unit B verbatim with every doc comment (the OTHER_CREDENTIAL_STORES ordering rationale). Imports the category type from `./rules-types` (never from `./rules`). Exports all 8 names.
- **Importers to update:** unit B names → `features/security/hooks/use-other-credentials.hooks.ts`, `features/security/hooks/other-credentials-port.hooks.ts`, `features/security/OtherCredentialsSection.tsx`, `features/security/Security.tsx`, `features/security/AccessTokensTab.tsx`, `features/security/AccessTokensTab.hooks.tsx`, `features/security/security-i18n.ts` (may be comment-only), tests `__tests__/rules.unit.test.ts`, `__tests__/OtherCredentialsSection.unit.test.tsx`, `__tests__/AccessTokensTab.hooks.unit.test.tsx`, `__tests__/AccessTokensTab.credential-flows.unit.test.tsx`, `hooks/__tests__/use-other-credentials.unit.test.tsx`. Category types → `apps/admin/src/lib/api.ts` (check: comment or import), `features/security/hooks/use-access-tokens.hooks.ts`, `features/security/hooks/use-other-credentials.hooks.ts`, `features/security/AccessTokensTab.tsx`, `features/security/__tests__/rules.unit.test.ts`.
- **After:** `rules.ts` ~445; new files ~70 / ~10.
- **Risks / notes:** if `lib/api.ts` truly imports `AccessTokenRowCategoryId` from `features/security/rules`, repoint it to `rules-types` (lib→feature import already existed). No `vi.mock` of `rules` found. Only 16 lines over: if the owner prefers fewer files, the coordinator may mark this an exception instead.
