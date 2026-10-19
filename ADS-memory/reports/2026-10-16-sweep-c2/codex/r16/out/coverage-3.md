TDD(Execution): Loaded the TDD persona for test design; added 29 cases across seven existing suites.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/admin/src/features/collections/__tests__/use-collections.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/dashboard/__tests__/use-dashboard-port.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/fs-files/hooks/__tests__/use-folder-drop.hooks.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/observability/__tests__/use-recent-server-errors.hooks.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/pages/__tests__/rules.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/pages/__tests__/use-theme-pages.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/recovery/__tests__/use-recovery.unit.test.ts

**PER FILE:**

| Source file | Added scenarios targeting measured gaps |
|---|---|
| `collections-dependencies.hooks.ts` | Lines 34, 44–45: empty seed, unknown key, reactivation, tombstoning and persisted versions. |
| `dashboard-dependencies.hooks.ts` | Lines 69, 73, 77, 85: independent posts, pages, media and presentation failures. |
| `use-folder-drop.hooks.ts` | Lines 133, 163, 227: missing/nontext error bodies, replacement timer and dismissal without a timer. |
| `media-i18n.ts` | No tests added; all four missing branches are unreachable below. |
| `use-recent-server-errors.hooks.ts` | Lines 93, 124–126: invalid timestamp fallback and real API/locale composition. |
| `pages/rules.ts` | Lines 492, 494–495, 515: missing/malformed conflict details and unknown-version copy. Also empty-error fallback. |
| `use-theme-pages.hooks.ts` | Lines 161, 171, 199, 201: non-Error failures and publishing before detail cache population. |
| `recovery-dependencies.hooks.ts` | Lines 81, 89–90: omitted creation options, rejected deep link and default not-found result. |

**UNREACHABLE:**

- `apps/admin/src/features/media/media-i18n.ts:1692`: four `?? {}` fallbacks; all four constant dictionaries contain every locale iterated from `MEDIA_TRANSLATIONS`.
- `apps/admin/src/features/recovery/hooks/recovery-dependencies.hooks.ts:26`: default ID; the private helper’s only caller always supplies a generated ID.
- `apps/admin/src/features/fs-files/hooks/use-folder-drop.hooks.ts:165`: timer callback’s unmounted case; unmount synchronously clears the pending timer.

These six branches remain unchanged for the owner’s delete-or-keep decision.

**NOT DONE:**

Tests, typecheck, builds and coverage were not run, as instructed. Therefore, 100% coverage remains unverified. The whitespace check passed. No production files, commits or staging were changed.
