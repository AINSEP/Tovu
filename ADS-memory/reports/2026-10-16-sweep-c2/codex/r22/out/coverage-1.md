TDD(Direct): Selected TDD for coverage test design. Added six tests to existing suites; production code unchanged.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/admin/src/features/deployment/__tests__/rules.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/fs-files/__tests__/folder-drop-port.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/media/__tests__/use-media-card-details.hooks.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/menus/__tests__/menu-html-mode.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/observability/__tests__/use-observability-status.hooks.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/pages/hooks/__tests__/page-editor-dependencies.unit.test.ts

**PER FILE:**

Source paths below are relative to `/Users/la/Programming/Tovu/apps/admin/src/features/`.

| Source | Branch targeted |
|---|---|
| `deployment/rules.ts:231` | Missing token omitted from connection |
| `forms/forms-field-settings-i18n.ts:332` | Unreachable fallback; unchanged |
| `forms/forms-leave-guard-i18n.ts:63` | Unreachable fallback; unchanged |
| `fs-files/folder-drop-port.ts:43` | No global window returns null |
| `media/hooks/use-media-card-details.hooks.ts:6` | Server rendering without window |
| `menus/html-rules.ts:22` | Missing label produces empty link text |
| `observability/hooks/observability-status-dependencies.hooks.ts:32` | Unseeded status defaults to disabled |
| `pages/hooks/page-editor-dependencies.hooks.ts:203` | Wrong autosave ID rejects and preserves stored state |

**UNREACHABLE:**

- `forms/forms-field-settings-i18n.ts:332`
- `forms/forms-leave-guard-i18n.ts:63`

Both `values[index] ?? key` fallbacks execute during module initialization against complete literal arrays: all 21 locales contain every entry. No fabricated missing translations or deletions added. Owner decides retention.

**NOT DONE:**

Tests, typecheck, builds, package scripts and coverage were not run, as instructed. Coverage attainment remains unverified. No git state changed.
