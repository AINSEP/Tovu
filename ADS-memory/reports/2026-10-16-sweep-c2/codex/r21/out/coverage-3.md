TDD(Direct): Used the TDD persona for behavior-focused coverage tests. Added 13 tests across six existing suites.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/website/src/features/newsletter/__tests__/send-pipeline.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/plugins/__tests__/plugin-identity.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/plugins/store/__tests__/store-plugin.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/sites/__tests__/served-site-binding.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/web-screenshot/__tests__/tool-registrations.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/platform/html/__tests__/escape.test.ts

**PER FILE:**

| Source file | Added or existing coverage |
|---|---|
| `newsletter/send-pipeline.ts` | Added missing snapshot recovery, already-sent receipt preservation, both non-null preheader paths, terminal-row skipping, and campaign disappearance before dispatch. |
| `plugins/plugin-identity.ts` | Added identical signed provenance and unsigned-to-signed refusal, with identity preservation assertions. |
| `presentation/active-theme-id.ts` | Existing tests already exercise success, missing settings, and propagation of other errors; unchanged. |
| `sites/deps.ts` | Added both real dependency defaults and served-binding base assertions. |
| `web-screenshot/tool-registrations.ts` | Added cancellation and live signal forwarding through registered handlers. |
| `platform/html/escape.ts` | Added empty/plain Unicode XML input. Current source contains only adapters; escaping branches now belong to Jini. |
| `contracts/core/native-approval-memory.ts` | Existing tests already exercise successful grants, identity isolation, actor mismatch, missing conversation, and unavailable identity lookup; unchanged. |
| `plugins/store/store-plugin.ts` | Added real namespace-adoption failure, exact error, and assertions that tables remain absent and provenance remains intact. Reported line 13 is now a comment. |

**UNREACHABLE:**

- `/Users/la/Programming/Tovu/apps/website/src/features/plugins/store/store-plugin.ts:29`: both `result.error?.` absent-error branches. Every `declareDataModule` failure supplies an error object. Left unchanged for the owner’s decision.

**NOT DONE:**

Tests, typecheck, builds, coverage, and package scripts were not run, as instructed. Achieved percentages remain unverified. No production code, Jini files, or git state changed.
