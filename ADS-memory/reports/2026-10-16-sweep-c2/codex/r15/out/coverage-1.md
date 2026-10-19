TDD(Execution): TDD persona selected for behavior-focused coverage gap tests. Extended eight existing suites; production code unchanged.

**CHANGED FILES:**

```text
/Users/la/Programming/Tovu/apps/admin/src/features/posts/__tests__/use-posts.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/features/recovery/__tests__/use-restore-flow.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/features/roles/__tests__/Roles.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/security/__tests__/rules.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/features/security/hooks/__tests__/use-access-tokens.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/security/hooks/__tests__/use-other-credentials.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/sites/__tests__/rules.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/features/source-control/__tests__/use-source-control-credentials.unit.test.tsx
```

**PER FILE:** Source paths below are relative to `apps/admin/src/features`. Added cases target:

- `posts/hooks/use-posts.hooks.ts`: non-Error create/publish/unpublish/delete failures; successful mutations before the initial list resolves; null-cache update branches.
- `recovery/hooks/restore-flow-dependencies.hooks.ts`: omitted options, all default results, and plan/confirm/execute rejection options.
- `roles/hooks/use-roles.hooks.ts`: overlapping renames/deletes/writes, replaced or dismissed confirmations, current permission-load failure and retry, omitted policy description.
- `security/rules.ts`: token-hint preservation, missing token-field metadata, custom metadata defaults, default connection spec, legacy error markers, missing/non-string validation details.
- `security/hooks/use-access-tokens.hooks.ts`: invalid-token guards and correction, existing add-form state, promotion before inventory loads, and seed-once behavior after query refreshes.
- `security/hooks/use-other-credentials.hooks.ts`: hint precedence, built-in MCP exclusion, label fallback, invalid-token correction, removal without a draft, and replacing a media provider removed elsewhere.
- `sites/rules.ts`: all seven missing site-write error-code outcomes at lines 187–193.
- `source-control/hooks/use-source-control-credentials.hooks.ts`: unknown provider, sibling preservation, save before inventory loads, seed-once behavior, and wired API/locale execution at lines 211–213.

**UNREACHABLE:** Preserved for owner disposition, under current typed contracts:

- `security/rules.ts:140,668`: missing category lookup/rank fallbacks; the fixed table contains every permitted category.
- `security/hooks/use-access-tokens.hooks.ts:719`: custom-row category fallback; custom summaries require a category.
- `security/hooks/use-other-credentials.hooks.ts:119`: null value-fact fallback; both callers supply strings.
- Same file, lines `135,148,161`: private locale defaults; callers always supply the required locale.
- Same file, lines `284,285,289,293,295`: absent-store guards; initialization creates every store entry. Line 289’s empty-items fallback is additionally excluded by `allSettled`.
- Same file, line `363`: non-media fallthrough cannot occur through catalog-produced rows; external MCP replacement is rejected earlier.

**NOT DONE:** Tests, typecheck, builds, coverage, and package scripts were not run, as instructed. Actual 100% coverage remains unverified. Whitespace checks passed. No commits or git-state mutations were performed.
