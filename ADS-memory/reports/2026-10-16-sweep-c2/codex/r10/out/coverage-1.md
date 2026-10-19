TDD(Direct): Loaded the TDD persona for behavior-focused coverage tests.

**CHANGED FILES:**

- [resolve-by-label.unit.test.ts](/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/resolve-by-label.unit.test.ts)
- [data-module.test.ts](/Users/la/Programming/Tovu/apps/website/src/features/plugins/__tests__/data-module.test.ts)
- [data-module.ts](/Users/la/Programming/Tovu/apps/website/src/features/plugins/data-module.ts)

**PER FILE:**

- `custom-credentials/store.ts`: Added tests for validation failures, missing/legacy hints, scoped reads and deletion, repository errors, concurrent deletion/rotation, and missing or malformed payloads. Targets current lines 47–48, 64–86, 110–253, 366, 378–379, and 400–407.
- `plugins/data-module.ts`: Added tests for declaration validation, explicit false flags, missing-table verification rollback, and disk-headroom refusal with known/unknown free space. Added an injectable headroom check; existing callers retain the default adapter.

**UNREACHABLE:**

- `apps/website/src/features/custom-credentials/store.ts:238,242`: The non-`CredentialInputError` rethrow branches are unreachable under the current validators’ contracts. Left intact for owner disposition.

**NOT DONE:**

Tests, typecheck, builds, coverage, and package scripts were not run, as instructed. The locked verifier must confirm results and remaining coverage gaps; 100% is not yet verified. No git mutations were made.
