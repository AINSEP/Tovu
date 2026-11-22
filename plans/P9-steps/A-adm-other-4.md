# A-adm-other-4 — adm-other → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:32 T:33. Depends on: A-adm-other-1, A-adm-shell-lib-3, A-adm-other-3, A-adm-shell-components-1, A-adm-shell-lib-1. Est: J 72 min, T 38 min.

## J — move verbatim into Jini (14 files, 643 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/auth/hooks/login-port.hooks.ts` | `packages/admin/src/screens/auth/hooks/login-port.hooks.ts` | 17 |  |
| `apps/admin/src/features/collections/hooks/collection-entries-port.hooks.ts` | `packages/admin/src/screens/collections/hooks/collection-entries-port.hooks.ts` | 12 |  |
| `apps/admin/src/features/collections/hooks/collection-entry-editor-port.hooks.ts` | `packages/admin/src/screens/collections/hooks/collection-entry-editor-port.hooks.ts` | 25 |  |
| `apps/admin/src/features/collections/hooks/collections-port.hooks.ts` | `packages/admin/src/screens/collections/hooks/collections-port.hooks.ts` | 16 |  |
| `apps/admin/src/features/collections/hooks/edit-fields-dialog-port.hooks.ts` | `packages/admin/src/screens/collections/hooks/edit-fields-dialog-port.hooks.ts` | 19 |  |
| `apps/admin/src/features/collections/hooks/new-content-type-dialog-port.hooks.ts` | `packages/admin/src/screens/collections/hooks/new-content-type-dialog-port.hooks.ts` | 15 |  |
| `apps/admin/src/features/database/Database.hooks.ts` | `packages/admin/src/screens/database/Database.hooks.ts` | 7 |  |
| `apps/admin/src/features/database/hooks/migrate-forward-section-port.hooks.ts` | `packages/admin/src/screens/database/hooks/migrate-forward-section-port.hooks.ts` | 14 |  |
| `apps/admin/src/features/database/hooks/schema-state-section-port.hooks.ts` | `packages/admin/src/screens/database/hooks/schema-state-section-port.hooks.ts` | 19 |  |
| `apps/admin/src/features/database/hooks/timeline-section-port.hooks.ts` | `packages/admin/src/screens/database/hooks/timeline-section-port.hooks.ts` | 20 |  |
| `apps/admin/src/features/email/hooks/use-email-template-view.hooks.ts` | `packages/admin/src/screens/email/hooks/use-email-template-view.hooks.ts` | 39 |  |
| `apps/admin/src/features/forms/forms-field-settings-i18n.ts` | `packages/admin/src/screens/forms/forms-field-settings-i18n.ts` | 332 |  |
| `apps/admin/src/features/forms/forms-leave-guard-i18n.ts` | `packages/admin/src/screens/forms/forms-leave-guard-i18n.ts` | 62 |  |
| `apps/admin/src/features/integrations/hooks/use-integrations-redirect.hooks.ts` | `packages/admin/src/screens/integrations/hooks/use-integrations-redirect.hooks.ts` | 46 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./screens/auth/hooks/login-port.hooks"]
- "@jini-ai/admin" exports["./screens/collections/hooks/collection-entries-port.hooks"]
- "@jini-ai/admin" exports["./screens/collections/hooks/collection-entry-editor-port.hooks"]
- "@jini-ai/admin" exports["./screens/collections/hooks/collections-port.hooks"]
- "@jini-ai/admin" exports["./screens/collections/hooks/edit-fields-dialog-port.hooks"]
- "@jini-ai/admin" exports["./screens/collections/hooks/new-content-type-dialog-port.hooks"]
- "@jini-ai/admin" exports["./screens/database/Database.hooks"]
- "@jini-ai/admin" exports["./screens/database/hooks/migrate-forward-section-port.hooks"]
- "@jini-ai/admin" exports["./screens/database/hooks/schema-state-section-port.hooks"]
- "@jini-ai/admin" exports["./screens/database/hooks/timeline-section-port.hooks"]
- "@jini-ai/admin" exports["./screens/email/hooks/use-email-template-view.hooks"]
- "@jini-ai/admin" exports["./screens/forms/forms-field-settings-i18n"]
- "@jini-ai/admin" exports["./screens/forms/forms-leave-guard-i18n"]
- "@jini-ai/admin" exports["./screens/integrations/hooks/use-integrations-redirect.hooks"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (1, 26 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/features/forms/__tests__/index-aligned-translations.unit.test.ts`


## T — Tovu repoint: delete the 14 sources, rewrite every importer (29 lines)

```
apps/admin/src/features/auth/__tests__/use-login.hooks.unit.test.ts:7  '../hooks/login-port.hooks' -> '@jini-ai/admin/screens/auth/hooks/login-port.hooks'
apps/admin/src/features/auth/hooks/login-dependencies.hooks.ts:2  './login-port.hooks' -> '@jini-ai/admin/screens/auth/hooks/login-port.hooks'
apps/admin/src/features/auth/hooks/use-login.hooks.ts:8  './login-port.hooks' -> '@jini-ai/admin/screens/auth/hooks/login-port.hooks'
apps/admin/src/features/collections/hooks/collection-entries-dependencies.hooks.ts:3  './collection-entries-port.hooks' -> '@jini-ai/admin/screens/collections/hooks/collection-entries-port.hooks'
apps/admin/src/features/collections/hooks/use-collection-entries.hooks.ts:8  './collection-entries-port.hooks' -> '@jini-ai/admin/screens/collections/hooks/collection-entries-port.hooks'
apps/admin/src/features/collections/hooks/collection-entry-editor-dependencies.hooks.ts:3  './collection-entry-editor-port.hooks' -> '@jini-ai/admin/screens/collections/hooks/collection-entry-editor-port.hooks'
apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts:15  './collection-entry-editor-port.hooks' -> '@jini-ai/admin/screens/collections/hooks/collection-entry-editor-port.hooks'
apps/admin/src/features/collections/hooks/collections-dependencies.hooks.ts:3  './collections-port.hooks' -> '@jini-ai/admin/screens/collections/hooks/collections-port.hooks'
apps/admin/src/features/collections/hooks/use-collections.hooks.ts:10  './collections-port.hooks' -> '@jini-ai/admin/screens/collections/hooks/collections-port.hooks'
apps/admin/src/features/collections/__tests__/use-edit-fields-dialog.unit.test.tsx:9  '../hooks/edit-fields-dialog-port.hooks' -> '@jini-ai/admin/screens/collections/hooks/edit-fields-dialog-port.hooks'
apps/admin/src/features/collections/hooks/edit-fields-dialog-dependencies.hooks.ts:3  './edit-fields-dialog-port.hooks' -> '@jini-ai/admin/screens/collections/hooks/edit-fields-dialog-port.hooks'
apps/admin/src/features/collections/hooks/use-edit-fields-dialog.hooks.ts:19  './edit-fields-dialog-port.hooks' -> '@jini-ai/admin/screens/collections/hooks/edit-fields-dialog-port.hooks'
apps/admin/src/features/collections/__tests__/use-new-content-type-dialog.unit.test.tsx:10  '../hooks/new-content-type-dialog-port.hooks' -> '@jini-ai/admin/screens/collections/hooks/new-content-type-dialog-port.hooks'
apps/admin/src/features/collections/hooks/new-content-type-dialog-dependencies.hooks.ts:3  './new-content-type-dialog-port.hooks' -> '@jini-ai/admin/screens/collections/hooks/new-content-type-dialog-port.hooks'
apps/admin/src/features/collections/hooks/use-new-content-type-dialog.hooks.ts:18  './new-content-type-dialog-port.hooks' -> '@jini-ai/admin/screens/collections/hooks/new-content-type-dialog-port.hooks'
apps/admin/src/features/database/Database.tsx:1  './Database.hooks' -> '@jini-ai/admin/screens/database/Database.hooks'
apps/admin/src/features/database/hooks/migrate-forward-section-dependencies.hooks.ts:4  './migrate-forward-section-port.hooks' -> '@jini-ai/admin/screens/database/hooks/migrate-forward-section-port.hooks'
apps/admin/src/features/database/hooks/use-migrate-forward-section.hooks.ts:9  './migrate-forward-section-port.hooks' -> '@jini-ai/admin/screens/database/hooks/migrate-forward-section-port.hooks'
apps/admin/src/features/database/hooks/schema-state-section-dependencies.hooks.ts:3  './schema-state-section-port.hooks' -> '@jini-ai/admin/screens/database/hooks/schema-state-section-port.hooks'
apps/admin/src/features/database/hooks/use-schema-state-section.hooks.ts:7  './schema-state-section-port.hooks' -> '@jini-ai/admin/screens/database/hooks/schema-state-section-port.hooks'
apps/admin/src/features/database/hooks/timeline-section-dependencies.hooks.ts:3  './timeline-section-port.hooks' -> '@jini-ai/admin/screens/database/hooks/timeline-section-port.hooks'
apps/admin/src/features/database/hooks/use-timeline-section.hooks.ts:10  './timeline-section-port.hooks' -> '@jini-ai/admin/screens/database/hooks/timeline-section-port.hooks'
apps/admin/src/features/email/EmailTemplateEditor.tsx:19  './hooks/use-email-template-view.hooks' -> '@jini-ai/admin/screens/email/hooks/use-email-template-view.hooks'
apps/admin/src/features/forms/__tests__/forms-field-settings-i18n.unit.test.ts:3  '../forms-field-settings-i18n' -> '@jini-ai/admin/screens/forms/forms-field-settings-i18n'
apps/admin/src/features/forms/forms-i18n.ts:12  './forms-field-settings-i18n' -> '@jini-ai/admin/screens/forms/forms-field-settings-i18n'
apps/admin/src/features/forms/__tests__/forms-leave-guard-i18n.unit.test.ts:3  '../forms-leave-guard-i18n' -> '@jini-ai/admin/screens/forms/forms-leave-guard-i18n'
apps/admin/src/features/forms/forms-i18n.ts:13  './forms-leave-guard-i18n' -> '@jini-ai/admin/screens/forms/forms-leave-guard-i18n'
apps/admin/src/features/integrations/IntegrationsRedirect.tsx:1  './hooks/use-integrations-redirect.hooks' -> '@jini-ai/admin/screens/integrations/hooks/use-integrations-redirect.hooks'
apps/admin/src/features/integrations/__tests__/IntegrationsRedirect.unit.test.tsx:5  '../hooks/use-integrations-redirect.hooks' -> '@jini-ai/admin/screens/integrations/hooks/use-integrations-redirect.hooks'
```

## Tovu tests that must stay green (6; import lines are repointed above, assertions untouched)
- `apps/admin/src/features/auth/__tests__/use-login.hooks.unit.test.ts`
- `apps/admin/src/features/collections/__tests__/use-edit-fields-dialog.unit.test.tsx`
- `apps/admin/src/features/collections/__tests__/use-new-content-type-dialog.unit.test.tsx`
- `apps/admin/src/features/forms/__tests__/forms-field-settings-i18n.unit.test.ts`
- `apps/admin/src/features/forms/__tests__/forms-leave-guard-i18n.unit.test.ts`
- `apps/admin/src/features/integrations/__tests__/IntegrationsRedirect.unit.test.tsx`

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/features/database/hooks/migrate-forward-section-port.hooks.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/features/database/hooks/schema-state-section-port.hooks.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/features/database/hooks/timeline-section-port.hooks.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `forms-field-settings-i18n.ts`, negate the first `if (` condition of its first exported function; `index-aligned-translations.unit.test.ts` must go red, then revert
