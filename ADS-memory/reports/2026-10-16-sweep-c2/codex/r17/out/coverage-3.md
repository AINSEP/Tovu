TDD(Direct): Loaded the TDD persona for behavior-focused test design. Added 25 test cases across seven files; checks were not run.

**CHANGED FILES:**

- [/Users/la/Programming/Tovu/apps/admin/src/features/observability/__tests__/use-recent-server-errors.hooks.unit.test.ts](/Users/la/Programming/Tovu/apps/admin/src/features/observability/__tests__/use-recent-server-errors.hooks.unit.test.ts)
- [/Users/la/Programming/Tovu/apps/admin/src/features/observability/__tests__/use-observability-tab.hooks.unit.test.ts](/Users/la/Programming/Tovu/apps/admin/src/features/observability/__tests__/use-observability-tab.hooks.unit.test.ts)
- [/Users/la/Programming/Tovu/apps/admin/src/features/pages/__tests__/editor-html-jump.unit.test.ts](/Users/la/Programming/Tovu/apps/admin/src/features/pages/__tests__/editor-html-jump.unit.test.ts)
- [/Users/la/Programming/Tovu/apps/admin/src/features/providers/__tests__/always-allow.unit.test.tsx](/Users/la/Programming/Tovu/apps/admin/src/features/providers/__tests__/always-allow.unit.test.tsx)
- [/Users/la/Programming/Tovu/apps/admin/src/features/settings/__tests__/ai-agent-presentation.unit.test.ts](/Users/la/Programming/Tovu/apps/admin/src/features/settings/__tests__/ai-agent-presentation.unit.test.ts)
- [/Users/la/Programming/Tovu/apps/admin/src/features/taxonomy/__tests__/use-merge-term-section.stale-failures.unit.test.tsx](/Users/la/Programming/Tovu/apps/admin/src/features/taxonomy/__tests__/use-merge-term-section.stale-failures.unit.test.tsx)
- [/Users/la/Programming/Tovu/apps/admin/src/features/voice-input/hooks/__tests__/use-push-to-talk.hooks.unit.test.ts](/Users/la/Programming/Tovu/apps/admin/src/features/voice-input/hooks/__tests__/use-push-to-talk.hooks.unit.test.ts)

**PER FILE:**

| Source file | Added test paths |
|---|---|
| `recent-server-errors-dependencies.hooks.ts` | Browser clipboard forwarding, default empty logs, explicit failed-copy result. Existing wired test exercises line 11. |
| `use-observability-tab.hooks.ts` | Empty tab list, unavailable subtitle, permissions restoring/removing tabs. Replaced router module mock with real URL/history assertions. |
| `use-editor-html-jump.hooks.ts` | Undefined flush result, null ref, revision reset, numeric line height, document without a window, positive mirror geometry and cleanup. |
| `always-allow-dependencies.hooks.ts` | Lines 10–12 through real API client: list approvals, list servers, revoke with encoded identifiers, read back removal. |
| `use-ai-agent-presentation.hooks.ts` | Default options, null config, identical detection results, changed authentication, detection finishing after unmount. |
| `use-merge-term-section.hooks.ts` | Stale rejection guards for plan, confirm and execute. Separate suite preserves the other worker’s modified file. |
| `users-i18n.ts` | No additions: remaining gaps are unreachable static-table fallbacks below. |
| `use-push-to-talk.hooks.ts` | Default bridge resolution, cancelled probe success/failure, duplicate starts, discarded-capture failure recovery, both unmount cleanup failures. |

**UNREACHABLE:**

- [users-i18n.ts:1547](/Users/la/Programming/Tovu/apps/admin/src/features/users/users-i18n.ts:1547), lines **1547–1549**: all iterated locales exist in each companion table; the three `??` fallbacks cannot execute.
- [use-editor-html-jump.hooks.ts:49](/Users/la/Programming/Tovu/apps/admin/src/features/pages/hooks/use-editor-html-jump.hooks.ts:49): a non-null jump cannot have a stale revision; rendering a new revision clears it.
- [use-push-to-talk.hooks.ts:155](/Users/la/Programming/Tovu/apps/admin/src/features/voice-input/hooks/use-push-to-talk.hooks.ts:155): `!voicePort` cannot be true after `canStart` succeeds.
- [use-push-to-talk.hooks.ts:192](/Users/la/Programming/Tovu/apps/admin/src/features/voice-input/hooks/use-push-to-talk.hooks.ts:192): recording requires an assigned capture, and that ref is never cleared.

These six branch paths remain unchanged for the owner’s delete-or-keep decision.

**NOT DONE:**

Tests, typecheck, builds and coverage were not run, as instructed. Therefore 100% coverage is not verified. No production files or git state were changed.
