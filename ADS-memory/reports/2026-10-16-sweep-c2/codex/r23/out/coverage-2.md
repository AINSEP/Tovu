TDD(Direct): Loaded the TDD persona for behavior-focused coverage tests. Added six tests across five existing suites.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/website/src/features/database-transfer/__tests__/exclusions.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/entries/__tests__/unit/repo.rows.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/media-generation/__tests__/provider-credential-save.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/newsletter/__tests__/data-module-manifest.failure-rollback.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/consent/__tests__/adapters.test.ts

**PER FILE:** Written test targets; execution remains pending.

| Source | Coverage addressed |
|---|---|
| `database-transfer/copy-engine.ts` | Lines 23–24: skips absent settings tables while correctly counting secret rows in present tables. |
| `entries/repo.rows.ts` | Line 41: maps an undefined body to SQL null. |
| `media-generation/provider-credential-save.ts` | Line 34: returns a null hint for a preserved legacy credential with unknown token length. |
| `newsletter/data-module-manifest.ts` | Repeated installation preserves schema, newsletter rows, and core data; exercises explicit options. |
| `presentation/repo.ts` | No additions: existing suites exercise hit/miss, insert/upsert, listing, and rollback. |
| `publish-trust/provisioning.node-io.ts` | No additions: existing tests exercise environment defaults, missing/present files, other read errors, and replacement. |
| `platform/observability/index.ts` | No additions: existing tests exercise disabled and enabled factory paths. |
| `consent/host.ts` | Lines 18 and 22: absent configured region header and missing receipt cookie. |

**UNREACHABLE:**

- `newsletter/data-module-manifest.ts:141`: missing `result.error` on failure; every failure return in `declareDataModule` supplies an error object.
- `media-generation/provider-credential-save.ts:34`: missing/unconfigured saved provider after success; the real store requires a sealed key and returns the written provider.

Both remain intact for the owner’s decision.

**NOT DONE:** Tests, typecheck, builds, and coverage were not run, as instructed. Exact 100% remains unverified. No production code, Jini files, or git state was changed.
