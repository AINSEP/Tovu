# A-adm-other-1 — adm-other → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:25 T:26. Depends on: none (only already-Jini code). Est: J 76 min, T 96 min.

## J — move verbatim into Jini (14 files, 936 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/admin-themes/admin-themes.css` | `packages/admin/src/screens/admin-themes/admin-themes.css` | 42 |  |
| `apps/admin/src/features/analytics/api/analytics-api.types.ts` | `packages/admin/src/screens/analytics/api/analytics-api.types.ts` | 10 |  |
| `apps/admin/src/features/auth/api/auth-api.types.ts` | `packages/admin/src/screens/auth/api/auth-api.types.ts` | 5 |  |
| `apps/admin/src/features/authentication/model/provider-schemas.ts` | `packages/admin/src/screens/authentication/model/provider-schemas.ts` | 100 | W1 |
| `apps/admin/src/features/collections/api/collections-api.types.ts` | `packages/admin/src/screens/collections/api/collections-api.types.ts` | 65 |  |
| `apps/admin/src/features/collections/hooks/use-json-field-control.hooks.ts` | `packages/admin/src/screens/collections/hooks/use-json-field-control.hooks.ts` | 79 |  |
| `apps/admin/src/features/comments/api/comments-api.types.ts` | `packages/admin/src/screens/comments/api/comments-api.types.ts` | 48 |  |
| `apps/admin/src/features/consent/consent-settings.css` | `packages/admin/src/screens/consent/consent-settings.css` | 146 |  |
| `apps/admin/src/features/database/api/database-api.types.ts` | `packages/admin/src/screens/database/api/database-api.types.ts` | 41 |  |
| `apps/admin/src/features/email/api/mail-status-api.types.ts` | `packages/admin/src/screens/email/api/mail-status-api.types.ts` | 21 |  |
| `apps/admin/src/features/email/email-tabs-i18n.ts` | `packages/admin/src/screens/email/email-tabs-i18n.ts` | 196 |  |
| `apps/admin/src/features/email/email.css` | `packages/admin/src/screens/email/email.css` | 115 | W1 |
| `apps/admin/src/features/forms/api/forms-api.types.ts` | `packages/admin/src/screens/forms/api/forms-api.types.ts` | 43 |  |
| `apps/admin/src/features/forms/index-aligned-translations.ts` | `packages/admin/src/screens/forms/index-aligned-translations.ts` | 25 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./screens/admin-themes/admin-themes"]
- "@jini-ai/admin" exports["./screens/analytics/api/analytics-api.types"]
- "@jini-ai/admin" exports["./screens/auth/api/auth-api.types"]
- "@jini-ai/admin" exports["./screens/authentication/model/provider-schemas"]
- "@jini-ai/admin" exports["./screens/collections/api/collections-api.types"]
- "@jini-ai/admin" exports["./screens/collections/hooks/use-json-field-control.hooks"]
- "@jini-ai/admin" exports["./screens/comments/api/comments-api.types"]
- "@jini-ai/admin" exports["./screens/consent/consent-settings"]
- "@jini-ai/admin" exports["./screens/database/api/database-api.types"]
- "@jini-ai/admin" exports["./screens/email/api/mail-status-api.types"]
- "@jini-ai/admin" exports["./screens/email/email"]
- "@jini-ai/admin" exports["./screens/email/email-tabs-i18n"]
- "@jini-ai/admin" exports["./screens/forms/api/forms-api.types"]
- "@jini-ai/admin" exports["./screens/forms/index-aligned-translations"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 114 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/features/authentication/__tests__/provider-schemas.unit.test.ts`
- `apps/admin/src/features/collections/__tests__/use-json-field-control.unit.test.ts`


## T — Tovu repoint: delete the 14 sources, rewrite every importer (95 lines)

```
apps/admin/src/features/admin-themes/AdminThemes.tsx:11  './admin-themes.css' -> '@jini-ai/admin/screens/admin-themes/admin-themes'
apps/admin/src/features/analytics/api/analytics-api.ts:4  './analytics-api.types' -> '@jini-ai/admin/screens/analytics/api/analytics-api.types'
apps/admin/src/features/analytics/hooks/analytics-dependencies.hooks.ts:1  '@/features/analytics/api/analytics-api.types' -> '@jini-ai/admin/screens/analytics/api/analytics-api.types'
apps/admin/src/features/analytics/hooks/analytics-port.hooks.ts:1  '@/features/analytics/api/analytics-api.types' -> '@jini-ai/admin/screens/analytics/api/analytics-api.types'
apps/admin/src/features/analytics/hooks/use-analytics.hooks.ts:4  '@/features/analytics/api/analytics-api.types' -> '@jini-ai/admin/screens/analytics/api/analytics-api.types'
apps/admin/src/App.hooks.ts:26  './features/auth/api/auth-api.types' -> '@jini-ai/admin/screens/auth/api/auth-api.types'
apps/admin/src/App.session.ts:4  './features/auth/api/auth-api.types' -> '@jini-ai/admin/screens/auth/api/auth-api.types'
apps/admin/src/App.tsx:10  './features/auth/api/auth-api.types' -> '@jini-ai/admin/screens/auth/api/auth-api.types'
apps/admin/src/__tests__/unit/app-sites-section-visibility.unit.test.tsx:18  '../../features/auth/api/auth-api.types' -> '@jini-ai/admin/screens/auth/api/auth-api.types'
apps/admin/src/features/auth/Login.tsx:7  './api/auth-api.types' -> '@jini-ai/admin/screens/auth/api/auth-api.types'
apps/admin/src/features/auth/api/auth-api.ts:2  './auth-api.types' -> '@jini-ai/admin/screens/auth/api/auth-api.types'
apps/admin/src/features/auth/hooks/login-port.hooks.ts:1  '@/features/auth/api/auth-api.types' -> '@jini-ai/admin/screens/auth/api/auth-api.types'
apps/admin/src/features/auth/hooks/use-login.hooks.ts:6  '@/features/auth/api/auth-api.types' -> '@jini-ai/admin/screens/auth/api/auth-api.types'
apps/admin/src/site-section-availability.hooks.ts:4  './features/auth/api/auth-api.types' -> '@jini-ai/admin/screens/auth/api/auth-api.types'
apps/admin/src/features/authentication/Authentication.tsx:21  './model/provider-schemas' -> '@jini-ai/admin/screens/authentication/model/provider-schemas'
apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.hooks.tsx:5  '../../features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx:4  '../../features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/components/WidgetConfigFields/widget-config-fields-dependencies.hooks.ts:1  '../../features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/components/WidgetConfigFields/widget-config-fields-port.hooks.ts:1  '../../features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/CollectionEntryEditor.tsx:3  './api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/Collections.tsx:1  './api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/ContentTypeFieldsSection.tsx:1  './api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/EditFieldsDialog.tsx:1  './api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/LifecycleConfirmDialog.tsx:1  './api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/__tests__/CollectionEntryEditor.dynamic-field.unit.test.tsx:7  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/__tests__/Collections.unit.test.tsx:10  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/__tests__/collections-agent-drive.unit.test.tsx:11  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/__tests__/rules.unit.test.ts:26  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/__tests__/use-collection-entries.unit.test.tsx:4  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/__tests__/use-collection-entry-editor.unit.test.tsx:4  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/__tests__/use-collections.unit.test.tsx:4  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/__tests__/use-edit-fields-dialog.unit.test.tsx:4  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/__tests__/use-lifecycle-confirm-dialog.unit.test.tsx:5  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/__tests__/use-new-content-type-dialog.unit.test.tsx:4  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/api/collections-api.ts:3  './collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/collection-entries-dependencies.hooks.ts:1  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/collection-entries-port.hooks.ts:1  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/collection-entry-editor-dependencies.hooks.ts:1  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/collection-entry-editor-port.hooks.ts:1  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/collections-dependencies.hooks.ts:1  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/collections-port.hooks.ts:1  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/edit-fields-dialog-dependencies.hooks.ts:1  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/edit-fields-dialog-port.hooks.ts:1  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/new-content-type-dialog-dependencies.hooks.ts:1  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/new-content-type-dialog-port.hooks.ts:1  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/use-collection-entries.hooks.ts:1  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts:4  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/use-collections.hooks.ts:3  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/hooks/use-edit-fields-dialog.hooks.ts:3  '@/features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/rules.ts:4  './api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/lib/__tests__/content-type-field-kind.sync.test.ts:4  '../../features/collections/api/collections-api.types' -> '@jini-ai/admin/screens/collections/api/collections-api.types'
apps/admin/src/features/collections/CollectionEntryEditor.tsx:8  './hooks/use-json-field-control.hooks' -> '@jini-ai/admin/screens/collections/hooks/use-json-field-control.hooks'
apps/admin/src/features/comments/api/comments-api.ts:4  './comments-api.types' -> '@jini-ai/admin/screens/comments/api/comments-api.types'
apps/admin/src/features/consent/CookieConsent.tsx:14  './consent-settings.css' -> '@jini-ai/admin/screens/consent/consent-settings'
apps/admin/src/features/database/Database.tsx:3  './api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/__tests__/Database.unit.test.tsx:11  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/__tests__/database-i18n.unit.test.tsx:4  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/__tests__/schema-state-rules.unit.test.ts:4  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/__tests__/use-migrate-forward-section.unit.test.tsx:5  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/__tests__/use-schema-state-section.unit.test.tsx:5  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/__tests__/use-timeline-section.unit.test.tsx:4  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/api/database-api.ts:4  './database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/hooks/migrate-forward-section-dependencies.hooks.ts:2  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/hooks/migrate-forward-section-port.hooks.ts:2  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/hooks/schema-state-section-dependencies.hooks.ts:1  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/hooks/schema-state-section-port.hooks.ts:1  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/hooks/timeline-section-dependencies.hooks.ts:1  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/hooks/timeline-section-port.hooks.ts:1  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/hooks/use-timeline-section.hooks.ts:2  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/database/rules.ts:1  './api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/recovery/api/recovery-api.types.ts:1  '../../database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/recovery/hooks/recovery-dependencies.hooks.ts:3  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/features/recovery/hooks/recovery-port.hooks.ts:2  '@/features/database/api/database-api.types' -> '@jini-ai/admin/screens/database/api/database-api.types'
apps/admin/src/components/MailStatusBanner/MailStatusBanner.tsx:3  '@/features/email/api/mail-status-api.types' -> '@jini-ai/admin/screens/email/api/mail-status-api.types'
apps/admin/src/components/MailStatusBanner/hooks/use-mail-status-banner.hooks.ts:4  '@/features/email/api/mail-status-api.types' -> '@jini-ai/admin/screens/email/api/mail-status-api.types'
apps/admin/src/features/email/EmailProviderTab.tsx:7  './api/mail-status-api.types' -> '@jini-ai/admin/screens/email/api/mail-status-api.types'
apps/admin/src/features/email/__tests__/Email.unit.test.tsx:4  '@/features/email/api/mail-status-api.types' -> '@jini-ai/admin/screens/email/api/mail-status-api.types'
apps/admin/src/features/email/__tests__/use-email.unit.test.ts:4  '@/features/email/api/mail-status-api.types' -> '@jini-ai/admin/screens/email/api/mail-status-api.types'
apps/admin/src/features/email/api/mail-status-api.ts:3  './mail-status-api.types' -> '@jini-ai/admin/screens/email/api/mail-status-api.types'
apps/admin/src/features/email/email-api.ts:1  '@/features/email/api/mail-status-api.types' -> '@jini-ai/admin/screens/email/api/mail-status-api.types'
apps/admin/src/features/email/email-api.ts:75  '@/features/email/api/mail-status-api.types' -> '@jini-ai/admin/screens/email/api/mail-status-api.types'
apps/admin/src/features/email/hooks/use-email.hooks.ts:3  '@/features/email/api/mail-status-api.types' -> '@jini-ai/admin/screens/email/api/mail-status-api.types'
apps/admin/src/features/email/__tests__/email-i18n.unit.test.ts:5  '../email-tabs-i18n' -> '@jini-ai/admin/screens/email/email-tabs-i18n'
apps/admin/src/features/email/email-i18n.ts:1  './email-tabs-i18n' -> '@jini-ai/admin/screens/email/email-tabs-i18n'
apps/admin/src/features/email/Email.tsx:27  './email.css' -> '@jini-ai/admin/screens/email/email'
apps/admin/src/features/email/EmailTemplateEditor.tsx:20  './email.css' -> '@jini-ai/admin/screens/email/email'
apps/admin/src/__measurements__/request-volume.measurement.test.tsx:10  '../features/forms/api/forms-api.types' -> '@jini-ai/admin/screens/forms/api/forms-api.types'
apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx:7  '../../features/forms/api/forms-api.types' -> '@jini-ai/admin/screens/forms/api/forms-api.types'
apps/admin/src/components/WidgetConfigFields/widget-config-fields-dependencies.hooks.ts:5  '../../features/forms/api/forms-api.types' -> '@jini-ai/admin/screens/forms/api/forms-api.types'
apps/admin/src/components/WidgetConfigFields/widget-config-fields-port.hooks.ts:3  '../../features/forms/api/forms-api.types' -> '@jini-ai/admin/screens/forms/api/forms-api.types'
apps/admin/src/features/forms/__tests__/rules.unit.test.ts:2  '@/features/forms/api/forms-api.types' -> '@jini-ai/admin/screens/forms/api/forms-api.types'
apps/admin/src/features/forms/api/forms-api.ts:3  './forms-api.types' -> '@jini-ai/admin/screens/forms/api/forms-api.types'
apps/admin/src/features/forms/__tests__/index-aligned-translations.unit.test.ts:3  '../index-aligned-translations' -> '@jini-ai/admin/screens/forms/index-aligned-translations'
apps/admin/src/features/forms/forms-field-settings-i18n.ts:10  './index-aligned-translations' -> '@jini-ai/admin/screens/forms/index-aligned-translations'
apps/admin/src/features/forms/forms-leave-guard-i18n.ts:6  './index-aligned-translations' -> '@jini-ai/admin/screens/forms/index-aligned-translations'
```

## Tovu tests that must stay green (24; import lines are repointed above, assertions untouched)
- `apps/admin/src/__measurements__/request-volume.measurement.test.tsx`
- `apps/admin/src/__tests__/unit/app-sites-section-visibility.unit.test.tsx`
- `apps/admin/src/features/collections/__tests__/CollectionEntryEditor.dynamic-field.unit.test.tsx`
- `apps/admin/src/features/collections/__tests__/Collections.unit.test.tsx`
- `apps/admin/src/features/collections/__tests__/collections-agent-drive.unit.test.tsx`
- `apps/admin/src/features/collections/__tests__/rules.unit.test.ts`
- `apps/admin/src/features/collections/__tests__/use-collection-entries.unit.test.tsx`
- `apps/admin/src/features/collections/__tests__/use-collection-entry-editor.unit.test.tsx`
- `apps/admin/src/features/collections/__tests__/use-collections.unit.test.tsx`
- `apps/admin/src/features/collections/__tests__/use-edit-fields-dialog.unit.test.tsx`
- `apps/admin/src/features/collections/__tests__/use-lifecycle-confirm-dialog.unit.test.tsx`
- `apps/admin/src/features/collections/__tests__/use-new-content-type-dialog.unit.test.tsx`
- `apps/admin/src/features/database/__tests__/Database.unit.test.tsx`
- `apps/admin/src/features/database/__tests__/database-i18n.unit.test.tsx`
- `apps/admin/src/features/database/__tests__/schema-state-rules.unit.test.ts`
- `apps/admin/src/features/database/__tests__/use-migrate-forward-section.unit.test.tsx`
- `apps/admin/src/features/database/__tests__/use-schema-state-section.unit.test.tsx`
- `apps/admin/src/features/database/__tests__/use-timeline-section.unit.test.tsx`
- `apps/admin/src/features/email/__tests__/Email.unit.test.tsx`
- `apps/admin/src/features/email/__tests__/email-i18n.unit.test.ts`
- `apps/admin/src/features/email/__tests__/use-email.unit.test.ts`
- `apps/admin/src/features/forms/__tests__/index-aligned-translations.unit.test.ts`
- `apps/admin/src/features/forms/__tests__/rules.unit.test.ts`
- `apps/admin/src/lib/__tests__/content-type-field-kind.sync.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/features/authentication/model/provider-schemas.ts` (1)
- `apps/admin/src/features/email/email.css` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/features/email/api/mail-status-api.types.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/features/forms/api/forms-api.types.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/admin/src/features/email/email.css:72: .email-template-preview .page-preview-frame { background: var(--tovu-site-preview-bg, #fff); }
```

## Named mutation
in the Jini copy of `email-tabs-i18n.ts`, negate the first `if (` condition of its first exported function; `provider-schemas.unit.test.ts` must go red, then revert
