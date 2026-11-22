# P9K — the 1942 formerly blocked files, each assigned under K1–K5

Re-measured with the old rules on Tovu merge-12 + ex-sh/ex-core/ex-export (`plan.mjs`), then re-planned with `planK.mjs`. **old reason**: tovu-dep / xp3 / via X (as before). **K work**: the mechanisms its own imports need (K1 route spec, K2 kit, K3 copy arg, K4 type → core / local slice / i18n split, K5 injected collaborator, SH shell repoint); "verbatim" = none of its own, it only waited on its deps. **step**: the sheet in `plans/P9-steps/` that moves it, or STAYS with the reason.

## adm-deployment (26)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/features/deployment/api/deployment-api.ts` | 88 | via `lib/admin-http/request.ts` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/api/deployment-api.types.ts` | 173 | via `features/security/api/security-api.types.ts` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/deployment-i18n.tsx` | 2562 | tovu-dep | K4i | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/deployment-visuals.tsx` | 164 | xp3 | K2 | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/Deployment.tsx` | 138 | xp3 | K2 | `A-K2-deployment-2` |
| `apps/admin/src/features/deployment/DockerfileTab.tsx` | 431 | via `features/deployment/api/deployment-api.types.ts` | verbatim | `A-K2-deployment-2` |
| `apps/admin/src/features/deployment/HistoryTab.tsx` | 63 | via `hooks/use-admin-locale.hooks.ts` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/hooks/deployment-overview-dependencies.hooks.ts` | 24 | via `features/deployment/api/deployment-api.types.ts` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/hooks/deployment-overview-port.hooks.ts` | 11 | via `features/deployment/api/deployment-api.types.ts` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/hooks/dockerfile-source-dependencies.hooks.ts` | 41 | via `features/deployment/api/deployment-api.types.ts` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/hooks/dockerfile-source-port.hooks.ts` | 25 | via `features/deployment/api/deployment-api.types.ts` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/hooks/publish-credentials-dependencies.hooks.ts` | 47 | via `features/security/api/security-api.types.ts` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/hooks/publish-credentials-port.hooks.ts` | 35 | via `features/security/api/security-api.types.ts` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/hooks/static-export-dependencies.hooks.ts` | 30 | via `features/import-export/api/import-export-api.ts` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/hooks/static-publish-dependencies.hooks.ts` | 43 | via `features/deployment/api/deployment-api.types.ts` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/hooks/static-publish-port.hooks.ts` | 23 | via `features/deployment/api/deployment-api.types.ts` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/hooks/use-deployment-overview.hooks.ts` | 61 | xp3 | K2 | `A-K2-deployment-2` |
| `apps/admin/src/features/deployment/hooks/use-dockerfile-source.hooks.ts` | 312 | xp3 | K2 | `A-K2-deployment-2` |
| `apps/admin/src/features/deployment/hooks/use-publish-credentials.hooks.ts` | 462 | tovu-dep | K3 K2 | `A-K2-deployment-2` |
| `apps/admin/src/features/deployment/hooks/use-static-export.hooks.ts` | 271 | xp3 | K2 | `A-K2-deployment-2` |
| `apps/admin/src/features/deployment/hooks/use-static-publish.hooks.ts` | 412 | tovu-dep | K3 K2 | `A-K2-deployment-2` |
| `apps/admin/src/features/deployment/index.ts` | 8 | via `features/deployment/Deployment.tsx` | verbatim | `A-K2-deployment-2` |
| `apps/admin/src/features/deployment/OverviewTab.tsx` | 311 | via `features/deployment/api/deployment-api.types.ts` | verbatim | `A-K2-deployment-2` |
| `apps/admin/src/features/deployment/rules.ts` | 444 | via `lib/credential-submit-error.ts` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/StaticSiteTab.hooks.ts` | 8 | via `features/deployment/deployment-i18n.tsx` | verbatim | `A-K2-deployment-1` |
| `apps/admin/src/features/deployment/StaticSiteTab.tsx` | 1423 | xp3 | K2 K5j | `A-K2-deployment-2` |

## adm-members (7)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/features/members/api/members-api.ts` | 21 | via `lib/admin-http/request.ts` | verbatim | `A-K2-members-1` |
| `apps/admin/src/features/members/hooks/members-controller.hooks.ts` | 39 | xp3 | K5j | `A-K2-members-1` |
| `apps/admin/src/features/members/hooks/members-dependencies.hooks.ts` | 24 | xp3 | K4j | `A-K2-members-1` |
| `apps/admin/src/features/members/index.ts` | 10 | via `features/members/MembersPanel.tsx` | verbatim | `A-K2-members-1` |
| `apps/admin/src/features/members/members-i18n.ts` | 626 | tovu-dep | K4i | `A-K2-members-1` |
| `apps/admin/src/features/members/MembersPanel.hooks.ts` | 12 | xp3 | K4j | `A-K2-members-1` |
| `apps/admin/src/features/members/MembersPanel.tsx` | 28 | xp3 | K5j | `A-K2-members-1` |

## adm-other (329)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/features/admin-themes/admin-themes-i18n.ts` | 307 | tovu-dep | K4i | `A-K2-admin-themes-1` |
| `apps/admin/src/features/admin-themes/AdminThemes.tsx` | 145 | tovu-dep | K2 K5 K5hook | `A-K2-admin-themes-1` |
| `apps/admin/src/features/admin-themes/index.ts` | 6 | via `features/admin-themes/AdminThemes.tsx` | verbatim | `A-K2-admin-themes-1` |
| `apps/admin/src/features/analytics/analytics-i18n.ts` | 377 | tovu-dep | K4i | `A-K2-analytics-1` |
| `apps/admin/src/features/analytics/Analytics.tsx` | 86 | via `features/analytics/hooks/use-analytics.hooks.ts` | verbatim | `A-K2-analytics-1` |
| `apps/admin/src/features/analytics/api/analytics-api.ts` | 13 | via `lib/admin-http/request.ts` | verbatim | `A-K2-analytics-1` |
| `apps/admin/src/features/analytics/hooks/analytics-dependencies.hooks.ts` | 36 | via `features/analytics/api/analytics-api.ts` | verbatim | `A-K2-analytics-1` |
| `apps/admin/src/features/analytics/hooks/use-analytics.hooks.ts` | 70 | xp3 | K2 | `A-K2-analytics-1` |
| `apps/admin/src/features/analytics/index.ts` | 10 | via `features/analytics/Analytics.tsx` | verbatim | `A-K2-analytics-1` |
| `apps/admin/src/features/auth/api/auth-api.ts` | 48 | via `lib/admin-http/request.ts` | verbatim | `A-K2-auth-1` |
| `apps/admin/src/features/auth/auth-i18n.ts` | 59 | tovu-dep | K4i | `A-K2-auth-1` |
| `apps/admin/src/features/auth/hooks/login-dependencies.hooks.ts` | 14 | via `features/auth/api/auth-api.ts` | verbatim | `A-K2-auth-1` |
| `apps/admin/src/features/auth/hooks/use-login.hooks.ts` | 86 | xp3 | K5j | `A-K2-auth-1` |
| `apps/admin/src/features/auth/index.ts` | 9 | via `features/auth/Login.tsx` | verbatim | `A-K2-auth-1` |
| `apps/admin/src/features/auth/Login.hooks.ts` | 7 | via `features/auth/auth-i18n.ts` | verbatim | `A-K2-auth-1` |
| `apps/admin/src/features/auth/Login.tsx` | 62 | xp3 | K5j K2 | `A-K2-auth-1` |
| `apps/admin/src/features/auth/OwnerRecoverySignIn.hooks.ts` | 19 | xp3 | K5j | `A-K2-auth-1` |
| `apps/admin/src/features/auth/OwnerRecoverySignIn.tsx` | 30 | xp3 | K2 | `A-K2-auth-1` |
| `apps/admin/src/features/authentication/authentication-i18n.ts` | 58 | tovu-dep | K4i | `A-K2-authentication-1` |
| `apps/admin/src/features/authentication/Authentication.hooks.ts` | 7 | via `features/authentication/authentication-i18n.ts` | verbatim | `A-K2-authentication-1` |
| `apps/admin/src/features/authentication/Authentication.tsx` | 209 | tovu-dep | K5hook K2 | `A-K2-authentication-1` |
| `apps/admin/src/features/authentication/index.ts` | 6 | via `features/authentication/Authentication.tsx` | verbatim | `A-K2-authentication-1` |
| `apps/admin/src/features/collections/api/collections-api.ts` | 63 | via `lib/admin-http/request.ts` | verbatim | `A-K2-collections-1` |
| `apps/admin/src/features/collections/CollectionEntries.tsx` | 151 | via `features/collections/hooks/use-collection-entries.hooks.ts` | verbatim | `A-K2-collections-2` |
| `apps/admin/src/features/collections/CollectionEntryEditor.tsx` | 495 | via `lib/widget-embed-extension.tsx` | verbatim | `A-K2-collections-2` |
| `apps/admin/src/features/collections/collections-i18n.ts` | 1305 | tovu-dep | K4i | `A-K2-collections-1` |
| `apps/admin/src/features/collections/Collections.tsx` | 324 | tovu-dep | K5css | `A-K2-collections-2` |
| `apps/admin/src/features/collections/ContentTypeFieldsSection.tsx` | 154 | via `features/collections/rules.ts` | verbatim | `A-K2-collections-1` |
| `apps/admin/src/features/collections/EditFieldsDialog.tsx` | 87 | tovu-dep | K2 K5css | `A-K2-collections-1` |
| `apps/admin/src/features/collections/hooks/collection-entries-dependencies.hooks.ts` | 49 | via `features/collections/api/collections-api.ts` | verbatim | `A-K2-collections-1` |
| `apps/admin/src/features/collections/hooks/collection-entry-editor-dependencies.hooks.ts` | 109 | via `features/collections/api/collections-api.ts` | verbatim | `A-K2-collections-1` |
| `apps/admin/src/features/collections/hooks/collections-dependencies.hooks.ts` | 56 | via `features/collections/api/collections-api.ts` | verbatim | `A-K2-collections-1` |
| `apps/admin/src/features/collections/hooks/edit-fields-dialog-dependencies.hooks.ts` | 55 | via `features/collections/api/collections-api.ts` | verbatim | `A-K2-collections-1` |
| `apps/admin/src/features/collections/hooks/new-content-type-dialog-dependencies.hooks.ts` | 55 | via `features/collections/api/collections-api.ts` | verbatim | `A-K2-collections-1` |
| `apps/admin/src/features/collections/hooks/use-collection-entries.hooks.ts` | 93 | xp3 | K2 | `A-K2-collections-1` |
| `apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts` | 490 | xp3 | K2 | `A-K2-collections-2` |
| `apps/admin/src/features/collections/hooks/use-collections.hooks.ts` | 179 | xp3 | K2 | `A-K2-collections-1` |
| `apps/admin/src/features/collections/hooks/use-edit-fields-dialog.hooks.ts` | 144 | xp3 | K2 | `A-K2-collections-1` |
| `apps/admin/src/features/collections/hooks/use-lifecycle-confirm-dialog.hooks.ts` | 29 | via `features/collections/rules.ts` | verbatim | `A-K2-collections-1` |
| `apps/admin/src/features/collections/hooks/use-new-content-type-dialog.hooks.ts` | 147 | xp3 | K2 | `A-K2-collections-1` |
| `apps/admin/src/features/collections/index.ts` | 12 | via `features/collections/Collections.tsx` | verbatim | `A-K2-collections-2` |
| `apps/admin/src/features/collections/LifecycleConfirmDialog.tsx` | 69 | tovu-dep | K2 K5css | `A-K2-collections-1` |
| `apps/admin/src/features/collections/NewContentTypeDialog.tsx` | 118 | tovu-dep | K2 K5css | `A-K2-collections-2` |
| `apps/admin/src/features/collections/rules.ts` | 347 | xp3 | K5j | `A-K2-collections-1` |
| `apps/admin/src/features/comments/api/comments-api.ts` | 19 | via `lib/admin-http/request.ts` | verbatim | `A-K2-comments-1` |
| `apps/admin/src/features/comments/comments-i18n.ts` | 944 | tovu-dep | K4i | `A-K2-comments-1` |
| `apps/admin/src/features/comments/index.ts` | 18 | tovu-dep | K5hook | `A-K2-comments-1` |
| `apps/admin/src/features/consent/consent-autosave.ts` | 88 | xp3 | K4j | `A-K2-consent-1` |
| `apps/admin/src/features/consent/consent-dictionary.ts` | 1948 | tovu-dep | K4i | `A-K2-consent-1` |
| `apps/admin/src/features/consent/consent-i18n.ts` | 25 | via `hooks/use-admin-locale.hooks.ts` | verbatim | `A-K2-consent-1` |
| `apps/admin/src/features/consent/ConsentOverviewTab.tsx` | 92 | via `features/consent/rules.ts` | verbatim | `A-K2-consent-1` |
| `apps/admin/src/features/consent/CookieConsent.tsx` | 200 | tovu-dep | K5j K2 K5 | `A-K2-consent-1` |
| `apps/admin/src/features/consent/index.ts` | 6 | via `features/consent/CookieConsent.tsx` | verbatim | `A-K2-consent-1` |
| `apps/admin/src/features/consent/rules.ts` | 71 | xp3 | K4j | `A-K2-consent-1` |
| `apps/admin/src/features/consent/settings.hooks.ts` | 100 | xp3 | K4j | `A-K2-consent-1` |
| `apps/admin/src/features/consent/use-consent-page.hooks.ts` | 259 | xp3 | K4j K5j | `A-K2-consent-1` |
| `apps/admin/src/features/content-analysis/content-analysis-i18n.ts` | 713 | tovu-dep | K4i | `A-K2-content-analysis-1` |
| `apps/admin/src/features/content-analysis/ContentAnalysisCard.tsx` | 109 | via `features/content-analysis/hooks/use-content-analysis.hooks.ts` | verbatim | `A-K2-content-analysis-1` |
| `apps/admin/src/features/content-analysis/hooks/content-analysis-dependencies.hooks.ts` | 68 | via `lib/admin-http/request.ts` | verbatim | `A-K2-content-analysis-1` |
| `apps/admin/src/features/content-analysis/hooks/content-analysis-port.hooks.ts` | 28 | via `features/content-analysis/rules.ts` | verbatim | `A-K2-content-analysis-1` |
| `apps/admin/src/features/content-analysis/hooks/use-content-analysis.hooks.ts` | 119 | xp3 | K2 | `A-K2-content-analysis-1` |
| `apps/admin/src/features/content-analysis/rules.ts` | 400 | via `lib/admin-http/request.ts` | verbatim | `A-K2-content-analysis-1` |
| `apps/admin/src/features/database/api/database-api.ts` | 61 | via `lib/admin-http/request.ts` | verbatim | `A-K2-database-1` |
| `apps/admin/src/features/database/database-i18n.tsx` | 1232 | tovu-dep | K4i | `A-K2-database-1` |
| `apps/admin/src/features/database/Database.tsx` | 536 | xp3 | K2 | `A-K2-database-1` |
| `apps/admin/src/features/database/hooks/migrate-forward-section-dependencies.hooks.ts` | 61 | via `features/database/api/database-api.ts` | verbatim | `A-K2-database-1` |
| `apps/admin/src/features/database/hooks/schema-state-section-dependencies.hooks.ts` | 36 | via `features/database/api/database-api.ts` | verbatim | `A-K2-database-1` |
| `apps/admin/src/features/database/hooks/timeline-section-dependencies.hooks.ts` | 47 | via `features/database/api/database-api.ts` | verbatim | `A-K2-database-1` |
| `apps/admin/src/features/database/hooks/use-migrate-forward-section.hooks.ts` | 194 | xp3 | K2 | `A-K2-database-1` |
| `apps/admin/src/features/database/hooks/use-schema-state-section.hooks.ts` | 80 | xp3 | K2 | `A-K2-database-1` |
| `apps/admin/src/features/database/hooks/use-timeline-section.hooks.ts` | 192 | xp3 | K2 | `A-K2-database-1` |
| `apps/admin/src/features/database/index.ts` | 10 | via `features/database/Database.tsx` | verbatim | `A-K2-database-1` |
| `apps/admin/src/features/database/rules.ts` | 173 | via `features/database/database-i18n.tsx` | verbatim | `A-K2-database-1` |
| `apps/admin/src/features/email/api/mail-status-api.ts` | 10 | via `lib/admin-http/request.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/email-api.ts` | 276 | via `lib/admin-http/request.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/email-i18n.ts` | 754 | tovu-dep | K4i | `A-K2-email-1` |
| `apps/admin/src/features/email/Email.hooks.ts` | 7 | via `features/email/email-i18n.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/Email.tsx` | 241 | tovu-dep | K2 K5hook K5css | `A-K2-email-2` |
| `apps/admin/src/features/email/EmailActivityTab.tsx` | 275 | via `features/email/email-i18n.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/EmailOverviewTab.tsx` | 132 | via `features/email/email-i18n.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/EmailParts.tsx` | 103 | xp3 | K2 | `A-K2-email-1` |
| `apps/admin/src/features/email/EmailProviderTab.hooks.ts` | 13 | via `features/email/email-i18n.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/EmailProviderTab.tsx` | 274 | via `features/email/EmailProviderTab.hooks.ts` | verbatim | `A-K2-email-2` |
| `apps/admin/src/features/email/EmailSenderTab.tsx` | 195 | via `features/email/email-i18n.ts` | verbatim | `A-K2-email-2` |
| `apps/admin/src/features/email/EmailTemplateEditor.hooks.ts` | 7 | via `features/pages/page-editor-i18n.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/EmailTemplateEditor.tsx` | 306 | xp3 | K2 | `A-K2-email-2` |
| `apps/admin/src/features/email/EmailTemplatesTab.tsx` | 114 | via `features/email/email-i18n.ts` | verbatim | `A-K2-email-2` |
| `apps/admin/src/features/email/hooks/email-load.hooks.ts` | 51 | via `lib/admin-http/request.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/hooks/use-email-activity.hooks.ts` | 182 | via `features/email/email-api.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/hooks/use-email-overview.hooks.ts` | 67 | via `lib/admin-http/request.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/hooks/use-email-provider.hooks.ts` | 172 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/hooks/use-email-sender.hooks.ts` | 128 | via `features/email/email-api.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/hooks/use-email-template-editor.hooks.ts` | 191 | via `lib/admin-http/request.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/hooks/use-email-templates.hooks.ts` | 115 | via `features/email/email-api.ts` | verbatim | `A-K2-email-1` |
| `apps/admin/src/features/email/hooks/use-email.hooks.ts` | 84 | via `features/email/api/mail-status-api.ts` | verbatim | `A-K2-email-2` |
| `apps/admin/src/features/email/index.ts` | 7 | via `features/email/Email.tsx` | verbatim | `A-K2-email-2` |
| `apps/admin/src/features/forms/api/forms-api.ts` | 10 | via `lib/admin-http/request.ts` | verbatim | `A-K2-forms-1` |
| `apps/admin/src/features/forms/forms-i18n.ts` | 1430 | tovu-dep | K4i | `A-K2-forms-1` |
| `apps/admin/src/features/forms/index.ts` | 28 | tovu-dep | K5css K5hook | `A-K2-forms-1` |
| `apps/admin/src/features/fs-files/api/fs-files-api.ts` | 22 | via `lib/admin-http/request.ts` | verbatim | `A-K2-fs-files-1` |
| `apps/admin/src/features/fs-files/folder-drop-port.ts` | 45 | xp3 | K2 | `A-K2-fs-files-1` |
| `apps/admin/src/features/fs-files/hooks/use-folder-drop.hooks.ts` | 311 | xp3 | K2 | `A-K2-fs-files-1` |
| `apps/admin/src/features/fs-files/hooks/use-native-folder-picker.hooks.ts` | 75 | via `features/fs-files/api/fs-files-api.ts` | verbatim | `A-K2-fs-files-1` |
| `apps/admin/src/features/import-export/api/import-export-api.ts` | 22 | via `lib/admin-http/request.ts` | verbatim | `A-K2-import-export-1` |
| `apps/admin/src/features/import-export/git-backup-rules.ts` | 65 | via `features/source-control/api/source-control-api.types.ts` | verbatim | `A-K2-import-export-1` |
| `apps/admin/src/features/import-export/GitBackupCard.tsx` | 142 | via `features/import-export/hooks/use-git-backup.hooks.ts` | verbatim | `A-K2-import-export-1` |
| `apps/admin/src/features/import-export/hooks/git-backup-port.hooks.ts` | 81 | via `features/source-control/api/source-control-api.types.ts` | verbatim | `A-K2-import-export-1` |
| `apps/admin/src/features/import-export/hooks/use-git-backup.hooks.ts` | 140 | xp3 | K2 | `A-K2-import-export-1` |
| `apps/admin/src/features/import-export/hooks/use-import-export.hooks.ts` | 41 | tovu-dep | K5 | `A-K2-import-export-1` |
| `apps/admin/src/features/import-export/import-export-i18n.ts` | 36 | tovu-dep | K4i | `A-K2-import-export-1` |
| `apps/admin/src/features/import-export/import-export-tabs.tsx` | 57 | xp3 | K2 | `A-K2-import-export-1` |
| `apps/admin/src/features/import-export/ImportExport.tsx` | 122 | tovu-dep | K2 K5 | `A-K2-import-export-1` |
| `apps/admin/src/features/import-export/index.ts` | 6 | via `features/import-export/ImportExport.tsx` | verbatim | `A-K2-import-export-1` |
| `apps/admin/src/features/integrations/api/integrations-api.ts` | 224 | via `lib/admin-http/request.ts` | verbatim | `A-K2-integrations-1` |
| `apps/admin/src/features/integrations/api/integrations-api.types.ts` | 363 | xp3 | K4j | `A-K2-integrations-1` |
| `apps/admin/src/features/integrations/hooks/integration-deliveries-dependencies.hooks.ts` | 38 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-integrations-1` |
| `apps/admin/src/features/integrations/hooks/integration-deliveries-port.hooks.ts` | 16 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-integrations-1` |
| `apps/admin/src/features/integrations/hooks/integrations-dependencies.hooks.ts` | 77 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-integrations-1` |
| `apps/admin/src/features/integrations/hooks/integrations-port.hooks.ts` | 31 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-integrations-1` |
| `apps/admin/src/features/integrations/hooks/use-integration-deliveries.hooks.ts` | 74 | xp3 | K2 | `A-K2-integrations-1` |
| `apps/admin/src/features/integrations/hooks/use-integrations.hooks.ts` | 237 | xp3 | K2 | `A-K2-integrations-1` |
| `apps/admin/src/features/integrations/index.ts` | 24 | via `features/integrations/IntegrationDeliveries.tsx` | verbatim | `A-K2-integrations-1` |
| `apps/admin/src/features/integrations/IntegrationDeliveries.tsx` | 77 | via `components/status-labels.ts` | verbatim | `A-K2-integrations-1` |
| `apps/admin/src/features/integrations/integrations-i18n.tsx` | 848 | tovu-dep | K4i | `A-K2-integrations-1` |
| `apps/admin/src/features/integrations/Integrations.tsx` | 341 | via `features/integrations/rules.ts` | verbatim | `A-K2-integrations-1` |
| `apps/admin/src/features/integrations/rules.ts` | 131 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-integrations-1` |
| `apps/admin/src/features/library/hooks/library-dependencies.hooks.ts` | 144 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-library-1` |
| `apps/admin/src/features/library/hooks/library-port.hooks.ts` | 23 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-library-1` |
| `apps/admin/src/features/library/hooks/use-library.hooks.ts` | 347 | xp3 | K2 | `A-K2-library-1` |
| `apps/admin/src/features/library/index.ts` | 3 | via `features/library/Library.tsx` | verbatim | `A-K2-library-1` |
| `apps/admin/src/features/library/library-i18n.ts` | 455 | tovu-dep | K4i | `A-K2-library-1` |
| `apps/admin/src/features/library/Library.hooks.tsx` | 68 | xp3 | K2 | `A-K2-library-1` |
| `apps/admin/src/features/library/Library.tsx` | 372 | xp3 | K2 | `A-K2-library-1` |
| `apps/admin/src/features/library/rules.ts` | 116 | xp3 | K2 | `A-K2-library-1` |
| `apps/admin/src/features/media/api/media-api.ts` | 103 | via `lib/admin-http/request.ts` | verbatim | `A-K2-media-1` |
| `apps/admin/src/features/media/api/media-api.types.ts` | 79 | xp3 | K2 K4j | `A-K2-media-1` |
| `apps/admin/src/features/media/hooks/media-dependencies.hooks.ts` | 131 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-media-1` |
| `apps/admin/src/features/media/hooks/media-import-dependencies.hooks.ts` | 12 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-media-1` |
| `apps/admin/src/features/media/hooks/media-port.hooks.ts` | 71 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-media-1` |
| `apps/admin/src/features/media/hooks/use-edit-media-modal.hooks.ts` | 67 | xp3 | K2 | `A-K2-media-1` |
| `apps/admin/src/features/media/hooks/use-edit-media-panel.hooks.ts` | 313 | tovu-dep | K5j K2 K5 | `A-K2-media-2` |
| `apps/admin/src/features/media/hooks/use-media-card-details.hooks.ts` | 27 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-media-1` |
| `apps/admin/src/features/media/hooks/use-media-card-metadata.hooks.ts` | 43 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-media-1` |
| `apps/admin/src/features/media/hooks/use-media-grid-size.hooks.ts` | 15 | via `features/media/rules.ts` | verbatim | `A-K2-media-1` |
| `apps/admin/src/features/media/hooks/use-media-item-link.hooks.ts` | 60 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-media-1` |
| `apps/admin/src/features/media/hooks/use-media-preview.hooks.ts` | 105 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-media-2` |
| `apps/admin/src/features/media/hooks/use-media.hooks.ts` | 350 | xp3 | K2 | `A-K2-media-2` |
| `apps/admin/src/features/media/hooks/use-remote-image-import.hooks.ts` | 67 | xp3 | K5j K2 | `A-K2-media-2` |
| `apps/admin/src/features/media/index.ts` | 10 | via `features/media/Media.tsx` | verbatim | `A-K2-media-2` |
| `apps/admin/src/features/media/media-i18n.ts` | 1889 | tovu-dep | K4i | `A-K2-media-1` |
| `apps/admin/src/features/media/media-provider-catalog.ts` | 88 | xp3 | K5j K2 | `A-K2-media-1` |
| `apps/admin/src/features/media/media-providers-port.ts` | 55 | xp3 | K2 | `A-K2-media-2` |
| `apps/admin/src/features/media/Media.hooks.tsx` | 71 | xp3 | K2 | `A-K2-media-1` |
| `apps/admin/src/features/media/Media.tsx` | 1579 | tovu-dep | K5hook K2 K5j K5css | `A-K2-media-2` |
| `apps/admin/src/features/media/RemoteImageImport.tsx` | 51 | tovu-dep | K2 K5css | `A-K2-media-2` |
| `apps/admin/src/features/media/rules.ts` | 498 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-media-1` |
| `apps/admin/src/features/menus/api/menus-api.ts` | 28 | via `lib/admin-http/request.ts` | verbatim | `A-K2-menus-1` |
| `apps/admin/src/features/menus/hooks/menus-dependencies.hooks.ts` | 102 | via `features/pages/api/pages-api.ts` | verbatim | `A-K2-menus-1` |
| `apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts` | 461 | xp3 | K2 K5x | `A-K2-menus-1` |
| `apps/admin/src/features/menus/hooks/use-menus.hooks.ts` | 159 | xp3 | K2 | `A-K2-menus-1` |
| `apps/admin/src/features/menus/index.ts` | 11 | via `features/menus/Menus.tsx` | verbatim | `A-K2-menus-1` |
| `apps/admin/src/features/menus/MenuEditor.tsx` | 529 | xp3 | K2 | `A-K2-menus-1` |
| `apps/admin/src/features/menus/menus-i18n.ts` | 1273 | tovu-dep | K4i | `A-K2-menus-1` |
| `apps/admin/src/features/menus/Menus.tsx` | 79 | via `features/menus/hooks/use-menus.hooks.ts` | verbatim | `A-K2-menus-1` |
| `apps/admin/src/features/observability/api/observability-api.ts` | 25 | xp3 | K5j | `A-K2-observability-1` |
| `apps/admin/src/features/observability/hooks/observability-status-dependencies.hooks.ts` | 38 | via `features/observability/api/observability-api.ts` | verbatim | `A-K2-observability-1` |
| `apps/admin/src/features/observability/hooks/recent-server-errors-dependencies.hooks.ts` | 41 | xp3 | K2 | `A-K2-observability-1` |
| `apps/admin/src/features/observability/hooks/use-observability-status.hooks.ts` | 83 | xp3 | K2 | `A-K2-observability-1` |
| `apps/admin/src/features/observability/hooks/use-observability-tab.hooks.ts` | 29 | xp3 | K2 | `A-K2-observability-1` |
| `apps/admin/src/features/observability/hooks/use-queries-tab.hooks.ts` | 41 | xp3 | K2 | `A-K2-observability-1` |
| `apps/admin/src/features/observability/hooks/use-recent-error-item.hooks.ts` | 39 | xp3 | K2 | `A-K2-observability-1` |
| `apps/admin/src/features/observability/hooks/use-recent-server-errors.hooks.ts` | 129 | xp3 | K2 | `A-K2-observability-1` |
| `apps/admin/src/features/observability/index.ts` | 8 | via `features/observability/Observability.tsx` | verbatim | `A-K2-observability-1` |
| `apps/admin/src/features/observability/observability-i18n.ts` | 1155 | tovu-dep | K4i | `A-K2-observability-1` |
| `apps/admin/src/features/observability/Observability.tsx` | 291 | tovu-dep | K5hook K2 | `A-K2-observability-1` |
| `apps/admin/src/features/observability/recent-errors-panel.tsx` | 149 | via `features/observability/hooks/use-recent-error-item.hooks.ts` | verbatim | `A-K2-observability-1` |
| `apps/admin/src/features/observability/tool-gaps-panel.tsx` | 23 | xp3 | K2 | `A-K2-observability-1` |
| `apps/admin/src/features/plugins/add-plugin-tab-soon.ts` | 38 | via `lib/admin-nav-i18n.ts` | verbatim | `A-K2-plugins-1` |
| `apps/admin/src/features/plugins/AddAgentPluginPanel.tsx` | 121 | via `features/plugins/agent-plugins-visuals.tsx` | verbatim | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/AddPluginPanel.tsx` | 111 | via `features/plugins/agent-plugins-visuals.tsx` | verbatim | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/admin-surface-theme.ts` | 74 | xp3 | K5j | `A-K2-plugins-1` |
| `apps/admin/src/features/plugins/agent-plugins-visuals.tsx` | 168 | xp3 | K2 | `A-K2-plugins-1` |
| `apps/admin/src/features/plugins/AgentPluginDetailsModal.tsx` | 74 | via `features/plugins/AgentPluginMemoryPanel.tsx` | verbatim | `A-K2-plugins-4` |
| `apps/admin/src/features/plugins/AgentPluginDisableConfirmDialog.tsx` | 97 | via `features/plugins/hooks/use-agent-plugin-disable-confirm.hooks.ts` | verbatim | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/AgentPluginLinkedLock.tsx` | 36 | xp3 | K2 | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/AgentPluginManageButton.tsx` | 42 | via `features/plugins/hooks/agent-plugin-surfaces-dependencies.hooks.ts` | verbatim | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/AgentPluginMaturity.tsx` | 24 | xp3 | K2 | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/AgentPluginMemoryPanel.tsx` | 31 | via `features/plugins/hooks/use-agent-plugin-memory.hooks.ts` | verbatim | `A-K2-plugins-4` |
| `apps/admin/src/features/plugins/AgentPluginRow.tsx` | 414 | xp3 | K2 | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/AgentPlugins.hooks.ts` | 43 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-plugins-4` |
| `apps/admin/src/features/plugins/AgentPlugins.tsx` | 516 | tovu-dep | K5hook K2 | `A-K2-plugins-4` |
| `apps/admin/src/features/plugins/AgentPluginSurfaceFrame.tsx` | 51 | xp3 | K5j | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/AgentPluginUpdateControl.tsx` | 49 | via `features/plugins/AddAgentPluginPanel.tsx` | verbatim | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/api/plugins-api.ts` | 35 | via `lib/admin-http/request.ts` | verbatim | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/composer-capabilities.ts` | 414 | xp3 | K2 | `A-K2-plugins-1` |
| `apps/admin/src/features/plugins/hooks/agent-plugin-install-dependencies.hooks.ts` | 37 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/hooks/agent-plugin-install-port.hooks.ts` | 21 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/hooks/agent-plugin-memory-dependencies.hooks.ts` | 11 | via `lib/admin-http/request.ts` | verbatim | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/hooks/agent-plugin-surfaces-dependencies.hooks.ts` | 20 | xp3 | K4j | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/hooks/agent-plugin-surfaces-port.hooks.ts` | 34 | xp3 | K4j | `A-K2-plugins-1` |
| `apps/admin/src/features/plugins/hooks/agent-plugins-dependencies.hooks.ts` | 69 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/hooks/agent-plugins-port.hooks.ts` | 21 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/hooks/plugin-install-dependencies.hooks.ts` | 29 | via `lib/admin-http/request.ts` | verbatim | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/hooks/plugins-dependencies.hooks.ts` | 180 | via `features/plugins/api/plugins-api.ts` | verbatim | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/hooks/use-admin-surface-frame.hooks.ts` | 154 | xp3 | K5j | `A-K2-plugins-1` |
| `apps/admin/src/features/plugins/hooks/use-agent-plugin-details-modal.hooks.ts` | 65 | via `hooks/use-admin-locale.hooks.ts` | verbatim | `A-K2-plugins-4` |
| `apps/admin/src/features/plugins/hooks/use-agent-plugin-disable-confirm.hooks.ts` | 54 | xp3 | K2 | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/hooks/use-agent-plugin-install.hooks.ts` | 223 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/hooks/use-agent-plugin-memory.hooks.ts` | 92 | xp3 | K2 | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/hooks/use-agent-plugin-surfaces.hooks.ts` | 26 | via `features/plugins/hooks/agent-plugin-surfaces-port.hooks.ts` | verbatim | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/hooks/use-agent-plugin-update.hooks.ts` | 28 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/hooks/use-agent-plugins.hooks.ts` | 223 | xp3 | K2 | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/hooks/use-linked-lock-tip.hooks.ts` | 52 | xp3 | K2 | `A-K2-plugins-1` |
| `apps/admin/src/features/plugins/hooks/use-plugin-install.hooks.ts` | 128 | via `lib/admin-http/request.ts` | verbatim | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/hooks/use-plugin-package-files.hooks.ts` | 88 | xp3 | K2 | `A-K2-plugins-4` |
| `apps/admin/src/features/plugins/hooks/use-plugin-provider-settings.hooks.ts` | 100 | via `hooks/use-admin-locale.hooks.ts` | verbatim | `A-K2-plugins-4` |
| `apps/admin/src/features/plugins/hooks/use-plugin-remove-confirm.hooks.ts` | 51 | xp3 | K2 | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/hooks/use-plugins.hooks.ts` | 285 | xp3 | K2 | `A-K2-plugins-4` |
| `apps/admin/src/features/plugins/index.ts` | 11 | via `features/plugins/Plugins.tsx` | verbatim | `A-K2-plugins-4` |
| `apps/admin/src/features/plugins/installed-skills-composer-source.ts` | 145 | via `lib/admin-http/request.ts` | verbatim | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/PackageFilesModal.tsx` | 319 | xp3 | K2 | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/PluginPackageFilesModal.tsx` | 36 | via `features/plugins/PackageFilesModal.tsx` | verbatim | `A-K2-plugins-4` |
| `apps/admin/src/features/plugins/PluginProviderSettingField.tsx` | 76 | via `components/SecretInput/SecretInput.tsx` | verbatim | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/PluginProviderSettingsDialog.tsx` | 121 | tovu-dep | K2 K5css | `A-K2-plugins-4` |
| `apps/admin/src/features/plugins/PluginRemoveConfirmDialog.tsx` | 54 | via `features/plugins/hooks/use-plugin-remove-confirm.hooks.ts` | verbatim | `A-K2-plugins-3` |
| `apps/admin/src/features/plugins/PluginRow.tsx` | 186 | via `features/plugins/plugins-visuals.tsx` | verbatim | `A-K2-plugins-4` |
| `apps/admin/src/features/plugins/plugins-i18n.ts` | 4707 | tovu-dep | K4i | `A-K2-plugins-1` |
| `apps/admin/src/features/plugins/plugins-memory-i18n.ts` | 428 | tovu-dep | K4i | `A-K2-plugins-1` |
| `apps/admin/src/features/plugins/plugins-visuals.tsx` | 79 | xp3 | K2 | `A-K2-plugins-2` |
| `apps/admin/src/features/plugins/Plugins.tsx` | 444 | xp3 | K2 | `A-K2-plugins-4` |
| `apps/admin/src/features/plugins/rules.ts` | 737 | xp3 | K5j | `A-K2-plugins-2` |
| `apps/admin/src/features/providers/always-allow-rules.ts` | 63 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-providers-1` |
| `apps/admin/src/features/providers/AlwaysAllowPanel.tsx` | 80 | via `features/providers/hooks/use-always-allow.hooks.ts` | verbatim | `A-K2-providers-1` |
| `apps/admin/src/features/providers/api/providers-api.ts` | 9 | via `lib/admin-http/request.ts` | verbatim | `A-K2-providers-1` |
| `apps/admin/src/features/providers/hooks/always-allow-dependencies.hooks.ts` | 44 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-providers-1` |
| `apps/admin/src/features/providers/hooks/always-allow-port.hooks.ts` | 13 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-providers-1` |
| `apps/admin/src/features/providers/hooks/use-always-allow.hooks.ts` | 105 | xp3 | K2 | `A-K2-providers-1` |
| `apps/admin/src/features/providers/hooks/use-providers.hooks.ts` | 48 | via `features/settings/hooks/use-external-mcp.hooks.ts` | verbatim | `A-K2-providers-1` |
| `apps/admin/src/features/providers/index.ts` | 10 | via `features/providers/Providers.tsx` | verbatim | `A-K2-providers-1` |
| `apps/admin/src/features/providers/providers-i18n.ts` | 324 | tovu-dep | K4i | `A-K2-providers-1` |
| `apps/admin/src/features/providers/Providers.tsx` | 318 | tovu-dep | K5hook K2 | `A-K2-providers-1` |
| `apps/admin/src/features/redirects/index.ts` | 18 | tovu-dep | K5hook | `A-K2-redirects-1` |
| `apps/admin/src/features/redirects/redirects-i18n.tsx` | 935 | tovu-dep | K4i K2 | `A-K2-redirects-1` |
| `apps/admin/src/features/seo/index.ts` | 20 | tovu-dep | K5hook | `A-K2-seo-1` |
| `apps/admin/src/features/seo/seo-i18n.ts` | 1607 | tovu-dep | K4i | `A-K2-seo-1` |
| `apps/admin/src/features/settings/AdminAppearance.tsx` | 115 | tovu-dep | K2 K4 K5hook K5 | `A-K2-settings-3` |
| `apps/admin/src/features/settings/ai-agent-presentation.ts` | 61 | tovu-dep | K2 K5 | `A-K2-settings-2` |
| `apps/admin/src/features/settings/api/settings-api.ts` | 29 | via `lib/admin-http/request.ts` | verbatim | `A-K2-settings-1` |
| `apps/admin/src/features/settings/external-mcp-admissions-rules.ts` | 632 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-settings-1` |
| `apps/admin/src/features/settings/external-mcp-i18n.ts` | 1118 | tovu-dep | K4i | `A-K2-settings-1` |
| `apps/admin/src/features/settings/external-mcp-tool-picker-rules.ts` | 425 | via `features/integrations/api/integrations-api.types.ts` | verbatim | `A-K2-settings-1` |
| `apps/admin/src/features/settings/ExternalMcpAdmissionsBanner.tsx` | 184 | via `features/settings/external-mcp-admissions-rules.ts` | verbatim | `A-K2-settings-3` |
| `apps/admin/src/features/settings/ExternalMcpRemoveConfirmDialog.tsx` | 78 | xp3 | K2 | `A-K2-settings-2` |
| `apps/admin/src/features/settings/ExternalMcpSettingsPanel.hooks.tsx` | 175 | xp3 | K2 | `A-K2-settings-2` |
| `apps/admin/src/features/settings/ExternalMcpSettingsPanel.tsx` | 612 | xp3 | K2 | `A-K2-settings-4` |
| `apps/admin/src/features/settings/ExternalMcpSharedChoice.hooks.ts` | 39 | via `features/integrations/api/integrations-api.ts` | verbatim | `A-K2-settings-1` |
| `apps/admin/src/features/settings/ExternalMcpSharedChoice.tsx` | 33 | via `features/settings/ExternalMcpSharedChoice.hooks.ts` | verbatim | `A-K2-settings-1` |
| `apps/admin/src/features/settings/ExternalMcpToolPicker.hooks.tsx` | 162 | via `features/settings/external-mcp-tool-picker-rules.ts` | verbatim | `A-K2-settings-1` |
| `apps/admin/src/features/settings/ExternalMcpToolPicker.tsx` | 390 | xp3 | K2 | `A-K2-settings-3` |
| `apps/admin/src/features/settings/ExternalMcpToolsModal.hooks.ts` | 72 | xp3 | K2 | `A-K2-settings-1` |
| `apps/admin/src/features/settings/ExternalMcpToolsModal.tsx` | 121 | xp3 | K2 | `A-K2-settings-3` |
| `apps/admin/src/features/settings/hooks/use-admin-appearance-settings.hooks.ts` | 22 | tovu-dep | K5hook | `A-K2-settings-2` |
| `apps/admin/src/features/settings/hooks/use-ai-agent-presentation.hooks.ts` | 29 | xp3 | K2 | `A-K2-settings-2` |
| `apps/admin/src/features/settings/hooks/use-external-mcp-admissions.hooks.ts` | 327 | tovu-dep | K5 K2 | `A-K2-settings-3` |
| `apps/admin/src/features/settings/hooks/use-external-mcp-oauth-connect.hooks.ts` | 151 | via `features/integrations/api/integrations-api.ts` | verbatim | `A-K2-settings-1` |
| `apps/admin/src/features/settings/hooks/use-external-mcp-remove-confirm.hooks.ts` | 53 | xp3 | K2 | `A-K2-settings-2` |
| `apps/admin/src/features/settings/hooks/use-external-mcp-tool-picker.hooks.ts` | 208 | xp3 | K2 | `A-K2-settings-1` |
| `apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts` | 438 | tovu-dep | K3 K2 | `A-K2-settings-3` |
| `apps/admin/src/features/settings/hooks/use-settings-locale-sync.hooks.ts` | 54 | xp3 | K2 | `A-K2-settings-1` |
| `apps/admin/src/features/settings/hooks/use-settings-ui.hooks.ts` | 184 | xp3 | K2 | `A-K2-settings-2` |
| `apps/admin/src/features/settings/hooks/use-user-interface-tab.hooks.ts` | 34 | via `lib/settings-tabs.ts` | verbatim | `A-K2-settings-2` |
| `apps/admin/src/features/settings/index.ts` | 11 | via `features/settings/SettingsUi.tsx` | verbatim | `A-K2-settings-4` |
| `apps/admin/src/features/settings/rules.ts` | 503 | xp3 | K2 | `A-K2-settings-2` |
| `apps/admin/src/features/settings/settings-capabilities-i18n.ts` | 205 | tovu-dep | K4i | `A-K2-settings-1` |
| `apps/admin/src/features/settings/settings-execution-i18n.ts` | 335 | tovu-dep | K4i | `A-K2-settings-2` |
| `apps/admin/src/features/settings/settings-i18n.ts` | 62 | tovu-dep | K4i | `A-K2-settings-1` |
| `apps/admin/src/features/settings/settings-interface-i18n.ts` | 30 | tovu-dep | K4i | `A-K2-settings-1` |
| `apps/admin/src/features/settings/settings-memory-i18n.ts` | 870 | tovu-dep | K4i | `A-K2-settings-1` |
| `apps/admin/src/features/settings/SettingsUi.hooks.ts` | 67 | tovu-dep | K2 K3 | `A-K2-settings-2` |
| `apps/admin/src/features/settings/SettingsUi.tsx` | 760 | tovu-dep | K5hook K2 K5j K5 K3 | `A-K2-settings-4` |
| `apps/admin/src/features/settings/UserInterfaceSettingsPanel.hooks.ts` | 7 | via `features/settings/settings-interface-i18n.ts` | verbatim | `A-K2-settings-1` |
| `apps/admin/src/features/settings/UserInterfaceSettingsPanel.tsx` | 74 | via `features/settings/UserInterfaceSettingsPanel.hooks.ts` | verbatim | `A-K2-settings-2` |
| `apps/admin/src/features/skills/api.ts` | 25 | via `lib/admin-http/request.ts` | verbatim | `A-K2-skills-1` |
| `apps/admin/src/features/skills/skill-failure.ts` | 22 | tovu-dep | K3 | `A-K2-skills-1` |
| `apps/admin/src/features/skills/skill-upload.ts` | 21 | via `features/skills/api.ts` | verbatim | `A-K2-skills-1` |
| `apps/admin/src/features/skills/SkillInstallConfirmation.hooks.ts` | 7 | via `features/skills/skills-i18n.ts` | verbatim | `A-K2-skills-1` |
| `apps/admin/src/features/skills/SkillInstallConfirmation.tsx` | 38 | xp3 | K2 | `A-K2-skills-1` |
| `apps/admin/src/features/skills/SkillRemoveConfirmDialog.tsx` | 20 | xp3 | K2 | `A-K2-skills-1` |
| `apps/admin/src/features/skills/SkillRow.tsx` | 46 | xp3 | K2 | `A-K2-skills-1` |
| `apps/admin/src/features/skills/skills-i18n.ts` | 40 | tovu-dep | K4i | `A-K2-skills-1` |
| `apps/admin/src/features/skills/skills-visuals.tsx` | 5 | xp3 | K2 | `A-K2-skills-1` |
| `apps/admin/src/features/skills/Skills.hooks.ts` | 8 | via `features/skills/skills-i18n.ts` | verbatim | `A-K2-skills-1` |
| `apps/admin/src/features/skills/Skills.tsx` | 114 | tovu-dep | K5hook K2 | `A-K2-skills-1` |
| `apps/admin/src/features/skills/use-skill-confirmation.hooks.ts` | 35 | xp3 | K2 | `A-K2-skills-1` |
| `apps/admin/src/features/skills/use-skill-files.hooks.ts` | 64 | xp3 | K2 | `A-K2-skills-1` |
| `apps/admin/src/features/skills/use-skill-install.hooks.ts` | 39 | via `features/skills/skill-failure.ts` | verbatim | `A-K2-skills-1` |
| `apps/admin/src/features/skills/use-skills.hooks.ts` | 201 | xp3 | K2 | `A-K2-skills-1` |
| `apps/admin/src/features/taxonomy/api/taxonomy-api.ts` | 68 | via `lib/admin-http/request.ts` | verbatim | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/hooks/merge-term-section-dependencies.hooks.ts` | 67 | via `features/taxonomy/api/taxonomy-api.ts` | verbatim | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/hooks/new-taxonomy-form-dependencies.hooks.ts` | 57 | via `features/taxonomy/api/taxonomy-api.ts` | verbatim | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/hooks/new-term-form-dependencies.hooks.ts` | 60 | via `features/taxonomy/api/taxonomy-api.ts` | verbatim | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/hooks/taxonomy-dependencies.hooks.ts` | 95 | via `features/taxonomy/api/taxonomy-api.ts` | verbatim | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/hooks/term-picker-dependencies.hooks.ts` | 84 | via `features/taxonomy/api/taxonomy-api.ts` | verbatim | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/hooks/use-merge-term-section.hooks.ts` | 220 | xp3 | K2 | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/hooks/use-new-taxonomy-form.hooks.ts` | 91 | xp3 | K2 | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/hooks/use-new-term-form.hooks.ts` | 105 | xp3 | K2 | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/hooks/use-taxonomy-html-embed.hooks.ts` | 30 | via `lib/admin-failure-channel.ts` | verbatim | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/hooks/use-taxonomy.hooks.ts` | 310 | xp3 | K2 | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/hooks/use-term-detail-panel.hooks.ts` | 122 | xp3 | K2 | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/hooks/use-term-list-reveal.hooks.ts` | 45 | via `features/taxonomy/rules.ts` | verbatim | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/hooks/use-term-picker.hooks.ts` | 335 | xp3 | K2 | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/index.ts` | 10 | via `features/taxonomy/Taxonomy.tsx` | verbatim | `A-K2-taxonomy-2` |
| `apps/admin/src/features/taxonomy/rules.ts` | 292 | via `lib/admin-http/request.ts` | verbatim | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/taxonomy-i18n.ts` | 1283 | tovu-dep | K4i | `A-K2-taxonomy-1` |
| `apps/admin/src/features/taxonomy/Taxonomy.tsx` | 900 | via `features/taxonomy/rules.ts` | verbatim | `A-K2-taxonomy-2` |
| `apps/admin/src/features/taxonomy/TermPicker.tsx` | 244 | xp3 | K2 | `A-K2-taxonomy-2` |
| `apps/admin/src/features/trash/api/trash-api.ts` | 34 | via `lib/admin-http/request.ts` | verbatim | `A-K2-trash-1` |
| `apps/admin/src/features/trash/hooks/trash-dependencies.hooks.ts` | 97 | via `features/users/api/users-api.ts` | verbatim | `A-K2-trash-1` |
| `apps/admin/src/features/trash/hooks/use-trash.hooks.ts` | 308 | xp3 | K2 | `A-K2-trash-1` |
| `apps/admin/src/features/trash/index.ts` | 9 | via `features/trash/Trash.tsx` | verbatim | `A-K2-trash-1` |
| `apps/admin/src/features/trash/rules.ts` | 248 | via `features/trash/trash-i18n.ts` | verbatim | `A-K2-trash-1` |
| `apps/admin/src/features/trash/trash-i18n.ts` | 1243 | tovu-dep | K4i | `A-K2-trash-1` |
| `apps/admin/src/features/trash/Trash.tsx` | 291 | xp3 | K2 | `A-K2-trash-1` |
| `apps/admin/src/features/webmcp/admin-page-tools.ts` | 81 | xp3 | K5j | `A-K2-webmcp-1` |
| `apps/admin/src/features/webmcp/BrowserAgentSettingsPanel.tsx` | 36 | via `features/webmcp/webmcp-i18n.ts` | verbatim | `A-K2-webmcp-1` |
| `apps/admin/src/features/webmcp/webmcp-i18n.ts` | 65 | tovu-dep | K4i | `A-K2-webmcp-1` |
| `apps/admin/src/features/widgets/api/widgets-api.ts` | 28 | via `lib/admin-http/request.ts` | verbatim | `A-K2-widgets-1` |
| `apps/admin/src/features/widgets/index.ts` | 35 | tovu-dep | K5hook | `A-K2-widgets-1` |
| `apps/admin/src/features/widgets/widgets-i18n.ts` | 1450 | tovu-dep | K4i | `A-K2-widgets-1` |

## adm-pages (24)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/features/pages/api/pages-api.ts` | 39 | via `lib/admin-http/request.ts` | verbatim | `A-K2-pages-1` |
| `apps/admin/src/features/pages/hooks/page-editor-dependencies.hooks.ts` | 264 | via `features/themes/api/themes-api.ts` | verbatim | `A-K2-pages-2` |
| `apps/admin/src/features/pages/hooks/page-editor-port.hooks.ts` | 64 | via `hooks/use-standing-draft-autosave.hooks.ts` | verbatim | `A-K2-pages-1` |
| `apps/admin/src/features/pages/hooks/page-editor-save.ts` | 167 | via `lib/version-conflict.ts` | verbatim | `A-K2-pages-2` |
| `apps/admin/src/features/pages/hooks/pages-dependencies.hooks.ts` | 114 | via `features/posts/api/posts-api.ts` | verbatim | `A-K2-pages-2` |
| `apps/admin/src/features/pages/hooks/theme-canvas-wrapper.ts` | 97 | xp3 | K2 | `A-K2-pages-1` |
| `apps/admin/src/features/pages/hooks/theme-pages-dependencies.hooks.ts` | 71 | via `features/themes/api/themes-api.ts` | verbatim | `A-K2-pages-2` |
| `apps/admin/src/features/pages/hooks/use-editor-html-jump.hooks.ts` | 105 | xp3 | K2 | `A-K2-pages-1` |
| `apps/admin/src/features/pages/hooks/use-interactive-flush.hooks.ts` | 104 | xp3 | K2 K5j | `A-K2-pages-1` |
| `apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts` | 1241 | xp3 | K2 | `A-K2-pages-2` |
| `apps/admin/src/features/pages/hooks/use-pages.hooks.ts` | 292 | xp3 | K2 | `A-K2-pages-2` |
| `apps/admin/src/features/pages/hooks/use-theme-canvas-styling.hooks.ts` | 363 | xp3 | K2 K5j | `A-K2-pages-1` |
| `apps/admin/src/features/pages/hooks/use-theme-pages.hooks.ts` | 248 | xp3 | K2 | `A-K2-pages-2` |
| `apps/admin/src/features/pages/index.ts` | 11 | via `features/pages/Pages.tsx` | verbatim | `A-K2-pages-3` |
| `apps/admin/src/features/pages/lib/embed-placeholder.ts` | 168 | xp3 | K2 K5j | `A-K2-pages-1` |
| `apps/admin/src/features/pages/lib/theme-page-publish-state.ts` | 196 | via `features/pages/hooks/use-theme-pages.hooks.ts` | verbatim | `A-K2-pages-1` |
| `apps/admin/src/features/pages/page-editor-i18n.ts` | 429 | tovu-dep | K4i | `A-K2-pages-1` |
| `apps/admin/src/features/pages/PageEditor.tsx` | 1443 | xp3 | K2 | `A-K2-pages-3` |
| `apps/admin/src/features/pages/pages-i18n.ts` | 1461 | tovu-dep | K4i | `A-K2-pages-1` |
| `apps/admin/src/features/pages/Pages.tsx` | 306 | xp3 | K2 | `A-K2-pages-3` |
| `apps/admin/src/features/pages/rules.ts` | 615 | xp3 | K2 | `A-K2-pages-2` |
| `apps/admin/src/features/pages/ThemePageDetailsModal.hooks.tsx` | 61 | xp3 | K2 | `A-K2-pages-1` |
| `apps/admin/src/features/pages/ThemePageDetailsModal.tsx` | 274 | via `features/pages/hooks/use-theme-pages.hooks.ts` | verbatim | `A-K2-pages-2` |
| `apps/admin/src/features/pages/ThemePagesTab.tsx` | 397 | tovu-dep | K5css K2 | `A-K2-pages-2` |

## adm-posts (43)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/features/posts/api/posts-api.ts` | 130 | via `lib/admin-http/request.ts` | verbatim | `A-K2-posts-1` |
| `apps/admin/src/features/posts/editor/bubble-menu/BubbleFormattingMenu.tsx` | 48 | via `features/posts/rules.ts` | verbatim | `A-K2-posts-1` |
| `apps/admin/src/features/posts/editor/header/PostEditorActions.tsx` | 190 | xp3 | K2 | `A-K2-posts-1` |
| `apps/admin/src/features/posts/editor/header/PostEditorHeader.tsx` | 176 | xp3 | K2 | `A-K2-posts-1` |
| `apps/admin/src/features/posts/editor/header/PostEditorToolbarEnd.tsx` | 26 | via `features/themes/ThemePreviewReloadButton.tsx` | verbatim | `A-K2-posts-3` |
| `apps/admin/src/features/posts/editor/notices/PostAutosaveRecoveryBanner.tsx` | 63 | xp3 | K2 | `A-K2-posts-1` |
| `apps/admin/src/features/posts/editor/notices/PostAutosaveStaleBanner.tsx` | 49 | via `hooks/use-standing-draft-autosave.hooks.ts` | verbatim | `A-K2-posts-1` |
| `apps/admin/src/features/posts/editor/notices/PostEditorNotices.tsx` | 85 | via `hooks/use-standing-draft-autosave.hooks.ts` | verbatim | `A-K2-posts-3` |
| `apps/admin/src/features/posts/editor/notices/PostEditorSlugCollisionWarning.tsx` | 73 | via `features/posts/rules.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/editor/notices/PostVersionConflictBanner.tsx` | 68 | via `features/posts/rules.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/editor/PostEditorBody.tsx` | 82 | via `features/posts/PostUrlDialog.tsx` | verbatim | `A-K2-posts-3` |
| `apps/admin/src/features/posts/editor/PostSavedPanels.tsx` | 18 | via `features/content-analysis/ContentAnalysisCard.tsx` | verbatim | `A-K2-posts-3` |
| `apps/admin/src/features/posts/editor/preview/PostPreview.tsx` | 252 | via `features/posts/editor/preview/PostPreviewFrame.tsx` | verbatim | `A-K2-posts-3` |
| `apps/admin/src/features/posts/editor/preview/PostPreviewFrame.tsx` | 98 | via `features/pages/rules.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/editor/template/PostEditorTemplateModalGate.tsx` | 49 | via `components/TemplateSource/TemplateSourceModal.tsx` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/editor/toolbar/insert-controls.tsx` | 105 | via `components/EmbedInsertControl/EmbedInsertControl.tsx` | verbatim | `A-K2-posts-3` |
| `apps/admin/src/features/posts/editor/toolbar/Toolbar.tsx` | 58 | via `features/posts/editor/toolbar/ToolbarColorGroup.tsx` | verbatim | `A-K2-posts-3` |
| `apps/admin/src/features/posts/editor/toolbar/ToolbarColorGroup.tsx` | 53 | via `features/posts/rules.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/editor/toolbar/ToolbarFormattingGroup.tsx` | 167 | via `features/posts/rules.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/editor/toolbar/ToolbarTypographyGroup.tsx` | 86 | via `features/posts/rules.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/editor/view-bar/PostEditorViewBar.tsx` | 88 | xp3 | K2 | `A-K2-posts-3` |
| `apps/admin/src/features/posts/editor/view-bar/view-tabs.ts` | 26 | via `features/posts/hooks/use-post-editor.hooks.ts` | verbatim | `A-K2-posts-3` |
| `apps/admin/src/features/posts/hooks/post-editor-dependencies.hooks.ts` | 290 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/hooks/post-editor-file-upload.ts` | 156 | via `features/posts/rules.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/hooks/post-editor-messages.ts` | 87 | via `lib/admin-http/request.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/hooks/post-editor-port.hooks.ts` | 93 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-posts-1` |
| `apps/admin/src/features/posts/hooks/post-editor-save.rules.ts` | 110 | via `features/posts/hooks/post-editor-port.hooks.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/hooks/post-editor-state.rules.ts` | 175 | via `features/posts/rules.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/hooks/posts-list-dependencies.hooks.ts` | 87 | via `features/posts/api/posts-api.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/hooks/use-loaded-post-apply.hooks.ts` | 96 | via `features/posts/hooks/post-editor-messages.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/hooks/use-post-editor-screen.hooks.ts` | 257 | xp3 | K2 | `A-K2-posts-3` |
| `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts` | 1259 | xp3 | K2 | `A-K2-posts-3` |
| `apps/admin/src/features/posts/hooks/use-post-featured-image.hooks.ts` | 80 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-posts-2` |
| `apps/admin/src/features/posts/hooks/use-posts.hooks.ts` | 250 | xp3 | K2 | `A-K2-posts-2` |
| `apps/admin/src/features/posts/index.ts` | 11 | via `features/posts/Posts.tsx` | verbatim | `A-K2-posts-3` |
| `apps/admin/src/features/posts/PostCoverImage.tsx` | 111 | xp3 | K2 | `A-K2-posts-3` |
| `apps/admin/src/features/posts/PostEditor.tsx` | 108 | via `features/posts/editor/header/PostEditorActions.tsx` | verbatim | `A-K2-posts-3` |
| `apps/admin/src/features/posts/posts-i18n.ts` | 3306 | tovu-dep | K4i | `A-K2-posts-1` |
| `apps/admin/src/features/posts/Posts.hooks.ts` | 7 | via `features/posts/posts-i18n.ts` | verbatim | `A-K2-posts-1` |
| `apps/admin/src/features/posts/Posts.tsx` | 216 | via `features/posts/Posts.hooks.ts` | verbatim | `A-K2-posts-3` |
| `apps/admin/src/features/posts/PostSettingsDialog.tsx` | 86 | tovu-dep | K2 K5css | `A-K2-posts-1` |
| `apps/admin/src/features/posts/PostUrlDialog.tsx` | 26 | tovu-dep | K2 K5css | `A-K2-posts-1` |
| `apps/admin/src/features/posts/rules.ts` | 563 | xp3 | K5x | `A-K2-posts-1` |

## adm-publish-content (12)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/features/publish-content/api/publish-content-api.ts` | 106 | via `features/publish-content/ui/index.ts` | verbatim | `A-K2-publish-content-1` |
| `apps/admin/src/features/publish-content/api/publish-content-api.types.ts` | 19 | via `features/publish-content/ui/index.ts` | verbatim | `A-K2-publish-content-1` |
| `apps/admin/src/features/publish-content/hooks/criteria-publish-result.ts` | 60 | via `features/publish-content/ui/index.ts` | verbatim | `A-K2-publish-content-1` |
| `apps/admin/src/features/publish-content/hooks/publish-content-dependencies.hooks.ts` | 238 | via `features/publish-content/ui/index.ts` | verbatim | `A-K2-publish-content-1` |
| `apps/admin/src/features/publish-content/hooks/publish-content-port.hooks.ts` | 95 | via `features/publish-content/ui/index.ts` | verbatim | `A-K2-publish-content-1` |
| `apps/admin/src/features/publish-content/hooks/publish-request.store.ts` | 154 | via `features/publish-content/ui/index.ts` | verbatim | `A-K2-publish-content-1` |
| `apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts` | 1320 | via `features/publish-content/ui/index.ts` | verbatim | `A-K2-publish-content-1` |
| `apps/admin/src/features/publish-content/hooks/use-publish-section-button.hooks.ts` | 52 | tovu-dep | K3 | `A-K2-publish-content-1` |
| `apps/admin/src/features/publish-content/publish-scope.ts` | 63 | via `features/publish-content/ui/index.ts` | verbatim | `A-K2-publish-content-1` |
| `apps/admin/src/features/publish-content/PublishContentDialog.hooks.tsx` | 83 | via `features/publish-content/ui/index.ts` | verbatim | `A-K2-publish-content-1` |
| `apps/admin/src/features/publish-content/PublishContentDialog.tsx` | 440 | tovu-dep | K2 K5css | `A-K2-publish-content-1` |
| `apps/admin/src/features/publish-content/PublishSectionButton.tsx` | 41 | via `features/publish-content/hooks/use-publish-section-button.hooks.ts` | verbatim | `A-K2-publish-content-1` |

## adm-recovery (9)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/features/recovery/api/recovery-api.ts` | 47 | via `lib/admin-http/request.ts` | verbatim | `A-K2-recovery-1` |
| `apps/admin/src/features/recovery/hooks/recovery-dependencies.hooks.ts` | 93 | via `features/recovery/api/recovery-api.ts` | verbatim | `A-K2-recovery-1` |
| `apps/admin/src/features/recovery/hooks/restore-flow-dependencies.hooks.ts` | 68 | via `features/recovery/api/recovery-api.ts` | verbatim | `A-K2-recovery-1` |
| `apps/admin/src/features/recovery/hooks/use-recovery.hooks.ts` | 178 | xp3 | K2 | `A-K2-recovery-1` |
| `apps/admin/src/features/recovery/hooks/use-restore-flow.hooks.ts` | 213 | via `lib/admin-http/request.ts` | verbatim | `A-K2-recovery-1` |
| `apps/admin/src/features/recovery/index.ts` | 10 | via `features/recovery/Recovery.tsx` | verbatim | `A-K2-recovery-1` |
| `apps/admin/src/features/recovery/recovery-i18n.tsx` | 1401 | tovu-dep | K4i | `A-K2-recovery-1` |
| `apps/admin/src/features/recovery/Recovery.tsx` | 575 | xp3 | K2 | `A-K2-recovery-1` |
| `apps/admin/src/features/recovery/rules.ts` | 164 | via `features/recovery/recovery-i18n.tsx` | verbatim | `A-K2-recovery-1` |

## adm-roles (18)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/features/roles/api/roles-api.ts` | 39 | via `lib/admin-http/request.ts` | verbatim | `A-K2-roles-1` |
| `apps/admin/src/features/roles/hooks/roles-controller.ts` | 112 | via `features/roles/hooks/use-roles.hooks.ts` | verbatim | `A-K2-roles-1` |
| `apps/admin/src/features/roles/hooks/roles-dependencies.hooks.ts` | 33 | xp3 | K4j | `A-K2-roles-1` |
| `apps/admin/src/features/roles/hooks/roles-permission-actions.ts` | 152 | via `features/roles/rules.ts` | verbatim | `A-K2-roles-1` |
| `apps/admin/src/features/roles/hooks/roles-row-actions.ts` | 188 | via `features/roles/rules.ts` | verbatim | `A-K2-roles-1` |
| `apps/admin/src/features/roles/hooks/use-roles-mutations.hooks.ts` | 58 | xp3 | K2 | `A-K2-roles-1` |
| `apps/admin/src/features/roles/hooks/use-roles-state.hooks.ts` | 89 | xp3 | K2 | `A-K2-roles-1` |
| `apps/admin/src/features/roles/hooks/use-roles.hooks.ts` | 231 | xp3 | K4j | `A-K2-roles-1` |
| `apps/admin/src/features/roles/index.ts` | 10 | via `features/roles/Roles.tsx` | verbatim | `A-K2-roles-2` |
| `apps/admin/src/features/roles/PoliciesSection.tsx` | 104 | via `features/roles/PolicyRow.tsx` | verbatim | `A-K2-roles-1` |
| `apps/admin/src/features/roles/PolicyPermissionForm.tsx` | 94 | via `features/roles/PolicyRow.tsx` | verbatim | `A-K2-roles-1` |
| `apps/admin/src/features/roles/PolicyRow.tsx` | 161 | via `features/roles/rules.ts` | verbatim | `A-K2-roles-1` |
| `apps/admin/src/features/roles/RoleConfirmDialogs.tsx` | 125 | via `features/roles/hooks/use-roles.hooks.ts` | verbatim | `A-K2-roles-1` |
| `apps/admin/src/features/roles/roles-i18n.ts` | 1524 | tovu-dep | K4i | `A-K2-roles-1` |
| `apps/admin/src/features/roles/Roles.hooks.tsx` | 115 | xp3 | K2 | `A-K2-roles-1` |
| `apps/admin/src/features/roles/Roles.tsx` | 264 | xp3 | K2 | `A-K2-roles-2` |
| `apps/admin/src/features/roles/RolesSection.tsx` | 179 | via `features/roles/rules.ts` | verbatim | `A-K2-roles-1` |
| `apps/admin/src/features/roles/rules.ts` | 117 | via `lib/admin-http/request.ts` | verbatim | `A-K2-roles-1` |

## adm-security (35)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/features/security/access-token-forms.ts` | 171 | via `features/security/custom-credential-forms.ts` | verbatim | `A-K2-security-2` |
| `apps/admin/src/features/security/access-token-providers.ts` | 226 | via `features/deployment/api/deployment-api.types.ts` | verbatim | `A-K2-security-1` |
| `apps/admin/src/features/security/access-token-rows.ts` | 208 | xp3 | K4j | `A-K2-security-1` |
| `apps/admin/src/features/security/AccessTokensTab.hooks.tsx` | 198 | via `features/security/access-token-rows.ts` | verbatim | `A-K2-security-3` |
| `apps/admin/src/features/security/AccessTokensTab.tsx` | 1065 | xp3 | K2 | `A-K2-security-3` |
| `apps/admin/src/features/security/api/security-api.ts` | 117 | via `lib/admin-http/request.ts` | verbatim | `A-K2-security-1` |
| `apps/admin/src/features/security/api/security-api.types.ts` | 167 | xp3 | K4j | `A-K2-security-1` |
| `apps/admin/src/features/security/CopyKeysDialog.tsx` | 35 | tovu-dep | K2 K5css | `A-K2-security-2` |
| `apps/admin/src/features/security/custom-credential-forms.ts` | 188 | via `features/security/api/security-api.types.ts` | verbatim | `A-K2-security-2` |
| `apps/admin/src/features/security/hooks/access-tokens-dependencies.hooks.ts` | 101 | via `features/security/api/security-api.types.ts` | verbatim | `A-K2-security-1` |
| `apps/admin/src/features/security/hooks/access-tokens-port.hooks.ts` | 80 | via `features/security/api/security-api.types.ts` | verbatim | `A-K2-security-1` |
| `apps/admin/src/features/security/hooks/other-credentials-dependencies.hooks.ts` | 97 | tovu-dep | K5 | `A-K2-security-1` |
| `apps/admin/src/features/security/hooks/other-credentials-port.hooks.ts` | 37 | tovu-dep | K4 | `A-K2-security-1` |
| `apps/admin/src/features/security/hooks/security-permissions-dependencies.hooks.ts` | 14 | via `features/auth/api/auth-api.ts` | verbatim | `A-K2-security-1` |
| `apps/admin/src/features/security/hooks/site-key-dependencies.hooks.ts` | 15 | tovu-dep | K5 | `A-K2-security-1` |
| `apps/admin/src/features/security/hooks/site-key-port.hooks.ts` | 22 | tovu-dep | K4 | `A-K2-security-1` |
| `apps/admin/src/features/security/hooks/site-key-status.rules.ts` | 14 | tovu-dep | K4 | `A-K2-security-1` |
| `apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts` | 914 | tovu-dep | K3 K5j K2 | `A-K2-security-3` |
| `apps/admin/src/features/security/hooks/use-copy-keys.hooks.ts` | 84 | via `features/security/api/security-api.types.ts` | verbatim | `A-K2-security-2` |
| `apps/admin/src/features/security/hooks/use-other-credentials.hooks.ts` | 448 | tovu-dep | K3 K2 | `A-K2-security-2` |
| `apps/admin/src/features/security/hooks/use-security-permissions.hooks.ts` | 44 | xp3 | K2 | `A-K2-security-2` |
| `apps/admin/src/features/security/hooks/use-site-key-recovery.hooks.ts` | 184 | tovu-dep | K4 | `A-K2-security-3` |
| `apps/admin/src/features/security/hooks/use-site-key.hooks.ts` | 164 | tovu-dep | K2 K4 | `A-K2-security-2` |
| `apps/admin/src/features/security/index.ts` | 8 | via `features/security/Security.tsx` | verbatim | `A-K2-security-3` |
| `apps/admin/src/features/security/other-credential-stores.ts` | 170 | via `features/media/media-provider-catalog.ts` | verbatim | `A-K2-security-2` |
| `apps/admin/src/features/security/OtherCredentialsSection.hooks.tsx` | 52 | via `features/security/hooks/use-other-credentials.hooks.ts` | verbatim | `A-K2-security-3` |
| `apps/admin/src/features/security/OtherCredentialsSection.tsx` | 269 | via `hooks/use-admin-locale.hooks.ts` | verbatim | `A-K2-security-3` |
| `apps/admin/src/features/security/RecoveryCodesCard.hooks.ts` | 37 | xp3 | K5j | `A-K2-security-1` |
| `apps/admin/src/features/security/RecoveryCodesCard.tsx` | 91 | xp3 | K2 | `A-K2-security-1` |
| `apps/admin/src/features/security/rules.ts` | 178 | via `features/security/access-token-providers.ts` | verbatim | `A-K2-security-1` |
| `apps/admin/src/features/security/security-i18n.ts` | 2395 | tovu-dep | K4i | `A-K2-security-2` |
| `apps/admin/src/features/security/security-visuals.tsx` | 67 | xp3 | K2 | `A-K2-security-1` |
| `apps/admin/src/features/security/Security.tsx` | 197 | xp3 | K5j K2 | `A-K2-security-3` |
| `apps/admin/src/features/security/SiteKeyRecoveryCard.tsx` | 109 | via `components/SecretInput/SecretInput.tsx` | verbatim | `A-K2-security-3` |
| `apps/admin/src/features/security/SiteKeyTab.tsx` | 291 | via `features/security/hooks/site-key-status.rules.ts` | verbatim | `A-K2-security-3` |

## adm-shell-components (101)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/components/AdminByokKeyPanel.hooks.ts` | 7 | via `components/shared-components-i18n.ts` | verbatim | `A-K2-shell-components-3` |
| `apps/admin/src/components/AdminByokKeyPanel.tsx` | 229 | via `components/AdminByokKeyPanel.hooks.ts` | verbatim | `A-K2-shell-components-8` |
| `apps/admin/src/components/AdminFailureNotice/AdminFailureNotice.tsx` | 23 | xp3 | K2 | `A-K2-shell-components-4` |
| `apps/admin/src/components/AssistantDock/agent-failure-hints.ts` | 14 | via `components/AssistantDock/agent-failure.ts` | verbatim | `A-K2-shell-components-4` |
| `apps/admin/src/components/AssistantDock/agent-failure.ts` | 209 | xp3 | K2 | `A-K2-shell-components-3` |
| `apps/admin/src/components/AssistantDock/AgentFailureCard.hooks.ts` | 82 | xp3 | K2 | `A-K2-shell-components-5` |
| `apps/admin/src/components/AssistantDock/AgentFailureCard.tsx` | 30 | tovu-dep | K3 K2 | `A-K2-shell-components-5` |
| `apps/admin/src/components/AssistantDock/assistant-dock-i18n.ts` | 2198 | tovu-dep | K2 K4i | `A-K2-shell-components-1` |
| `apps/admin/src/components/AssistantDock/assistant-dock-props.tsx` | 130 | tovu-dep | K2 K5 | `A-K2-shell-components-8` |
| `apps/admin/src/components/AssistantDock/assistant-runtime-preferences.adapter.ts` | 28 | via `lib/ledger-slice.ts` | verbatim | `A-K2-shell-components-8` |
| `apps/admin/src/components/AssistantDock/assistant-runtime-preferences.ts` | 80 | via `components/AssistantDock/chat-display-preferences.ts` | verbatim | `A-K2-shell-components-7` |
| `apps/admin/src/components/AssistantDock/AssistantDock.state.hooks.ts` | 296 | tovu-dep | K5hook K2 | `A-K2-shell-components-11` |
| `apps/admin/src/components/AssistantDock/AssistantDock.tsx` | 230 | tovu-dep | K2 K5css | `A-K2-shell-components-10` |
| `apps/admin/src/components/AssistantDock/chat-agent-plugin-preferences.adapter.ts` | 45 | via `lib/ledger-slice.ts` | verbatim | `A-K2-shell-components-8` |
| `apps/admin/src/components/AssistantDock/chat-agent-plugin-preferences.ts` | 28 | via `components/AssistantDock/chat-display-preferences.ts` | verbatim | `A-K2-shell-components-7` |
| `apps/admin/src/components/AssistantDock/chat-display-preferences.adapter.ts` | 25 | via `lib/ledger-slice.ts` | verbatim | `A-K2-shell-components-8` |
| `apps/admin/src/components/AssistantDock/chat-display-preferences.ts` | 110 | via `lib/settings-tabs.ts` | verbatim | `A-K2-shell-components-6` |
| `apps/admin/src/components/AssistantDock/dock-header-rules.ts` | 221 | via `components/AssistantDock/chat-display-preferences.ts` | verbatim | `A-K2-shell-components-8` |
| `apps/admin/src/components/AssistantDock/DockChatPane.tsx` | 263 | tovu-dep | K2 K5 K5css | `A-K2-shell-components-10` |
| `apps/admin/src/components/AssistantDock/DockHeader.tsx` | 119 | tovu-dep | K2 K3 | `A-K2-shell-components-9` |
| `apps/admin/src/components/AssistantDock/DockHeaderTip.hooks.ts` | 47 | xp3 | K2 | `A-K2-shell-components-9` |
| `apps/admin/src/components/AssistantDock/DockHeaderTip.tsx` | 32 | xp3 | K2 | `A-K2-shell-components-9` |
| `apps/admin/src/components/AssistantDock/DockLeadingAccessory.tsx` | 75 | xp3 | K2 | `A-K2-shell-components-7` |
| `apps/admin/src/components/AssistantDock/DockSettingsMenu.tsx` | 142 | xp3 | K2 | `A-K2-shell-components-9` |
| `apps/admin/src/components/AssistantDock/execution-config-write.ts` | 92 | xp3 | K2 | `A-K2-shell-components-6` |
| `apps/admin/src/components/AssistantDock/FolderDropConfirmation.tsx` | 56 | xp3 | K2 | `A-K2-shell-components-1` |
| `apps/admin/src/components/AssistantDock/FolderDropError.tsx` | 67 | xp3 | K2 | `A-K2-shell-components-1` |
| `apps/admin/src/components/AssistantDock/FolderDropNotice.tsx` | 39 | via `components/AssistantDock/FolderDropConfirmation.tsx` | verbatim | `A-K2-shell-components-6` |
| `apps/admin/src/components/AssistantDock/FolderDropPathHint.tsx` | 42 | xp3 | K2 | `A-K2-shell-components-1` |
| `apps/admin/src/components/AssistantDock/FolderPathButton.tsx` | 29 | xp3 | K2 | `A-K2-shell-components-1` |
| `apps/admin/src/components/AssistantDock/hooks/agents-inventory.hooks.ts` | 249 | xp3 | K2 | `A-K2-shell-components-5` |
| `apps/admin/src/components/AssistantDock/hooks/assistant-mcp-ui.ts` | 74 | xp3 | K2 | `A-K2-shell-components-1` |
| `apps/admin/src/components/AssistantDock/hooks/assistant-transport.hooks.ts` | 221 | xp3 | K2 | `A-K2-shell-components-7` |
| `apps/admin/src/components/AssistantDock/hooks/byok-runtime.hooks.ts` | 173 | xp3 | K5j K2 | `A-K2-shell-components-7` |
| `apps/admin/src/components/AssistantDock/hooks/composer-discovery.hooks.ts` | 177 | xp3 | K2 | `A-K2-shell-components-6` |
| `apps/admin/src/components/AssistantDock/hooks/composer-files.hooks.ts` | 190 | xp3 | K2 | `A-K2-shell-components-6` |
| `apps/admin/src/components/AssistantDock/hooks/composer-skills.hooks.ts` | 82 | xp3 | K2 | `A-K2-shell-components-3` |
| `apps/admin/src/components/AssistantDock/hooks/conversation-refresh.hooks.ts` | 12 | via `hooks/assistant-chats-dependencies.hooks.ts` | verbatim | `A-K2-shell-components-7` |
| `apps/admin/src/components/AssistantDock/hooks/dock-chrome.hooks.ts` | 141 | xp3 | K2 | `A-K2-shell-components-8` |
| `apps/admin/src/components/AssistantDock/hooks/execution-config-ledger.hooks.ts` | 204 | xp3 | K2 | `A-K2-shell-components-6` |
| `apps/admin/src/components/AssistantDock/hooks/execution-config.hooks.ts` | 227 | xp3 | K2 | `A-K2-shell-components-7` |
| `apps/admin/src/components/AssistantDock/hooks/local-cli-selection.hooks.ts` | 174 | xp3 | K2 | `A-K2-shell-components-7` |
| `apps/admin/src/components/AssistantDock/hooks/messages-change.hooks.ts` | 174 | xp3 | K2 | `A-K2-shell-components-7` |
| `apps/admin/src/components/AssistantDock/hooks/resolve-composer-discovery-outcome.ts` | 117 | xp3 | K2 | `A-K2-shell-components-5` |
| `apps/admin/src/components/AssistantDock/hooks/run-context.hooks.ts` | 171 | xp3 | K2 | `A-K2-shell-components-4` |
| `apps/admin/src/components/AssistantDock/hooks/runtime-access.hooks.ts` | 88 | xp3 | K2 | `A-K2-shell-components-5` |
| `apps/admin/src/components/AssistantDock/hooks/selected-agent-plugins.hooks.ts` | 87 | via `features/plugins/composer-capabilities.ts` | verbatim | `A-K2-shell-components-4` |
| `apps/admin/src/components/AssistantDock/hooks/use-assistant-empty-state.hooks.ts` | 29 | xp3 | K2 | `A-K2-shell-components-1` |
| `apps/admin/src/components/AssistantDock/hooks/use-assistant-runtime-preferences.hooks.ts` | 77 | xp3 | K2 | `A-K2-shell-components-8` |
| `apps/admin/src/components/AssistantDock/hooks/use-chat-agent-plugins.hooks.ts` | 70 | xp3 | K2 | `A-K2-shell-components-8` |
| `apps/admin/src/components/AssistantDock/hooks/use-chat-display-preferences.hooks.ts` | 77 | xp3 | K2 | `A-K2-shell-components-7` |
| `apps/admin/src/components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts` | 195 | xp3 | K2 K5j | `A-K2-shell-components-6` |
| `apps/admin/src/components/AssistantDock/hooks/use-routed-a2ui-surface-card.hooks.ts` | 148 | xp3 | K2 | `A-K2-shell-components-3` |
| `apps/admin/src/components/AssistantDock/hooks/use-selected-agent-auth-warning.hooks.ts` | 73 | xp3 | K2 | `A-K2-shell-components-8` |
| `apps/admin/src/components/AssistantDock/local-cli-selection-echo.ts` | 44 | xp3 | K2 | `A-K2-shell-components-2` |
| `apps/admin/src/components/AssistantDock/MessageOverflowModal.hooks.tsx` | 60 | xp3 | K2 | `A-K2-shell-components-2` |
| `apps/admin/src/components/AssistantDock/MessageOverflowModal.tsx` | 82 | xp3 | K2 | `A-K2-shell-components-3` |
| `apps/admin/src/components/AssistantDock/OverflowAwareMcpUiSurfaceCard.tsx` | 74 | xp3 | K2 | `A-K2-shell-components-4` |
| `apps/admin/src/components/AssistantDock/RoutedA2uiSurfaceCard.tsx` | 111 | tovu-dep | K2 K5 | `A-K2-shell-components-4` |
| `apps/admin/src/components/AssistantDock/SelectedAgentPluginTray.tsx` | 91 | xp3 | K2 | `A-K2-shell-components-3` |
| `apps/admin/src/components/AssistantDock/SlowRunNoticeCard.hooks.ts` | 64 | xp3 | K2 | `A-K2-shell-components-2` |
| `apps/admin/src/components/AssistantDock/SlowRunNoticeCard.tsx` | 44 | xp3 | K2 | `A-K2-shell-components-3` |
| `apps/admin/src/components/AssistantDock/SubagentsIndicator.tsx` | 22 | tovu-dep | K5hook K2 | `A-K2-shell-components-2` |
| `apps/admin/src/components/ChatFab/ChatFab.hooks.tsx` | 11 | xp3 | K2 | `A-K2-shell-components-2` |
| `apps/admin/src/components/ChatFab/ChatFab.tsx` | 139 | via `components/ChatFab/ChatFab.hooks.tsx` | verbatim | `A-K2-shell-components-7` |
| `apps/admin/src/components/CodeView/preview-modal-icons.tsx` | 13 | xp3 | K2 | `A-K2-shell-components-2` |
| `apps/admin/src/components/CredentialHint.tsx` | 10 | xp3 | K4j | `A-K2-shell-components-9` |
| `apps/admin/src/components/EmbedInsertControl/EmbedInsertControl.hooks.tsx` | 77 | via `components/shared-components-i18n.ts` | verbatim | `A-K2-shell-components-11` |
| `apps/admin/src/components/EmbedInsertControl/EmbedInsertControl.tsx` | 302 | via `components/EmbedInsertControl/EmbedInsertControl.hooks.tsx` | verbatim | `A-K2-shell-components-11` |
| `apps/admin/src/components/InstallTabCard/use-folder-upload.hooks.ts` | 69 | xp3 | K5j | `A-K2-shell-components-2` |
| `apps/admin/src/components/MailStatusBanner/MailStatusBanner.tsx` | 44 | xp3 | K2 | `A-K2-shell-components-4` |
| `apps/admin/src/components/MediaEditDialog/MediaEditDialog.hooks.tsx` | 134 | tovu-dep | K5 | `A-K2-shell-components-8` |
| `apps/admin/src/components/MediaEditDialog/MediaEditDialog.tsx` | 144 | tovu-dep | K2 K5css | `A-K2-shell-components-9` |
| `apps/admin/src/components/MediaPickerDialog/JiniMediaPicker.hooks.ts` | 42 | tovu-dep | K3 K2 K5 | `A-K2-shell-components-6` |
| `apps/admin/src/components/MediaPickerDialog/media-picker-dependencies.hooks.ts` | 41 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-shell-components-5` |
| `apps/admin/src/components/MediaPickerDialog/media-picker-port.hooks.ts` | 34 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-shell-components-3` |
| `apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.hooks.tsx` | 156 | xp3 | K2 | `A-K2-shell-components-8` |
| `apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.tsx` | 157 | tovu-dep | K2 K5css | `A-K2-shell-components-9` |
| `apps/admin/src/components/Placeholder.tsx` | 200 | tovu-dep | K5 | `A-K2-shell-components-8` |
| `apps/admin/src/components/SecretInput/SecretInput.tsx` | 50 | xp3 | K2 | `A-K2-shell-components-3` |
| `apps/admin/src/components/Select/Select.hooks.tsx` | 185 | xp3 | K2 | `A-K2-shell-components-2` |
| `apps/admin/src/components/Select/Select.tsx` | 26 | tovu-dep | K5css K2 | `A-K2-shell-components-4` |
| `apps/admin/src/components/shared-components-i18n.ts` | 3450 | tovu-dep | K4i | `A-K2-shell-components-3` |
| `apps/admin/src/components/SitesSidebarNav.tsx` | 23 | tovu-dep | K4 | `A-K2-shell-components-4` |
| `apps/admin/src/components/status-labels.ts` | 49 | via `components/shared-components-i18n.ts` | verbatim | `A-K2-shell-components-8` |
| `apps/admin/src/components/TemplateSource/TemplateSourceModal.hooks.ts` | 18 | via `components/TemplateSource/use-template-source.hooks.ts` | verbatim | `A-K2-shell-components-5` |
| `apps/admin/src/components/TemplateSource/TemplateSourceModal.tsx` | 167 | xp3 | K2 | `A-K2-shell-components-5` |
| `apps/admin/src/components/TemplateSource/use-template-source.hooks.ts` | 142 | xp3 | K2 K5j | `A-K2-shell-components-5` |
| `apps/admin/src/components/WidgetConfigFields/HtmlAttributeRows.hooks.ts` | 50 | via `components/WidgetConfigFields/media-content-rules.ts` | verbatim | `A-K2-shell-components-5` |
| `apps/admin/src/components/WidgetConfigFields/HtmlAttributeRows.tsx` | 57 | tovu-dep | K2 K5css | `A-K2-shell-components-9` |
| `apps/admin/src/components/WidgetConfigFields/media-content-rules.ts` | 402 | tovu-dep | K5 | `A-K2-shell-components-4` |
| `apps/admin/src/components/WidgetConfigFields/MediaContentEditor.hooks.ts` | 316 | via `features/media/api/media-api.types.ts` | verbatim | `A-K2-shell-components-9` |
| `apps/admin/src/components/WidgetConfigFields/MediaContentEditor.tsx` | 380 | tovu-dep | K2 K5css | `A-K2-shell-components-10` |
| `apps/admin/src/components/WidgetConfigFields/PlacementContentFields.tsx` | 42 | tovu-dep | K5css | `A-K2-shell-components-10` |
| `apps/admin/src/components/WidgetConfigFields/widget-config-fields-dependencies.hooks.ts` | 71 | via `features/collections/api/collections-api.ts` | verbatim | `A-K2-shell-components-5` |
| `apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.hooks.tsx` | 355 | xp3 | K2 | `A-K2-shell-components-4` |
| `apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx` | 603 | via `components/WidgetConfigFields/MediaContentEditor.tsx` | verbatim | `A-K2-shell-components-10` |
| `apps/admin/src/components/WidgetConfigFields/WidgetPreview.hooks.ts` | 16 | xp3 | K2 | `A-K2-shell-components-6` |
| `apps/admin/src/components/WidgetPickerDialog/widget-picker-dependencies.hooks.ts` | 58 | via `features/widgets/api/widgets-api.ts` | verbatim | `A-K2-shell-components-5` |
| `apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.hooks.tsx` | 298 | xp3 | K2 | `A-K2-shell-components-11` |
| `apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.tsx` | 324 | tovu-dep | K2 K5css | `A-K2-shell-components-11` |

## adm-shell-hooks (19)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/hooks/admin-execution-credential-dependencies.hooks.ts` | 92 | tovu-dep | K4 | `A-K2-shell-hooks-1` |
| `apps/admin/src/hooks/admin-execution-credential-port.hooks.ts` | 36 | tovu-dep | K4 | `A-K2-shell-hooks-1` |
| `apps/admin/src/hooks/admin-locale-dependencies.hooks.ts` | 82 | via `lib/settings-tabs.ts` | verbatim | `A-K2-shell-hooks-1` |
| `apps/admin/src/hooks/assistant-chats-dependencies.hooks.ts` | 231 | tovu-dep | K3 K2 | `A-K2-shell-hooks-1` |
| `apps/admin/src/hooks/assistant-chats-port.hooks.ts` | 50 | xp3 | K2 | `A-K2-shell-hooks-1` |
| `apps/admin/src/hooks/use-admin-appearance-snapshot.hooks.ts` | 36 | xp3 | K2 | `A-K2-shell-hooks-2` |
| `apps/admin/src/hooks/use-admin-appearance.hooks.ts` | 101 | tovu-dep | K2 K5hook | `A-K2-shell-hooks-2` |
| `apps/admin/src/hooks/use-admin-execution-credential.hooks.ts` | 126 | tovu-dep | K2 K4 | `A-K2-shell-hooks-3` |
| `apps/admin/src/hooks/use-admin-locale.hooks.ts` | 79 | xp3 | K2 | `A-K2-shell-hooks-3` |
| `apps/admin/src/hooks/use-admin-telemetry.hooks.ts` | 21 | via `lib/browser-telemetry.ts` | verbatim | `A-K2-shell-hooks-1` |
| `apps/admin/src/hooks/use-assistant-chats.hooks.ts` | 101 | xp3 | K2 | `A-K2-shell-hooks-2` |
| `apps/admin/src/hooks/use-credential-hint.hooks.ts` | 16 | tovu-dep | K3 K4j | `A-K2-shell-hooks-3` |
| `apps/admin/src/hooks/use-external-entry-refresh.hooks.ts` | 220 | xp3 | K2 | `A-K2-shell-hooks-1` |
| `apps/admin/src/hooks/use-interface-preferences.hooks.ts` | 61 | xp3 | K2 | `A-K2-shell-hooks-2` |
| `apps/admin/src/hooks/use-settings-slice.hooks.ts` | 35 | xp3 | K2 | `A-K2-shell-hooks-1` |
| `apps/admin/src/hooks/use-sites-sidebar-nav.hooks.ts` | 103 | tovu-dep | K4 K5hook | `A-K2-shell-hooks-1` |
| `apps/admin/src/hooks/use-standing-draft-autosave.hooks.ts` | 27 | xp3 | K2 | `A-K2-shell-hooks-1` |
| `apps/admin/src/hooks/use-tovu-execution-adapters.hooks.ts` | 70 | tovu-dep | K2 K5 | `A-K2-shell-hooks-4` |
| `apps/admin/src/hooks/use-tovu-execution-policy.hooks.ts` | 52 | tovu-dep | K2 K5 K5css | `A-K2-shell-hooks-4` |

## adm-shell-lib (48)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/lib/a2ui-action-poster.ts` | 10 | xp3 | K2 | `A-K2-shell-lib-1` |
| `apps/admin/src/lib/admin-failure-channel.ts` | 180 | tovu-dep | K2 K5j K3 | `A-K2-shell-lib-2` |
| `apps/admin/src/lib/admin-http/request.ts` | 487 | tovu-dep | K5j K3 | `A-K2-shell-lib-4` |
| `apps/admin/src/lib/admin-nav-i18n.ts` | 1407 | tovu-dep | K4i | `A-K2-shell-lib-1` |
| `apps/admin/src/lib/agent-navigation-entities.ts` | 42 | xp3 | K4j | `A-K2-shell-lib-6` |
| `apps/admin/src/lib/agent-pages.ts` | 120 | tovu-dep | K5j K4j K5 | `A-K2-shell-lib-6` |
| `apps/admin/src/lib/assistant-agents-snapshot.ts` | 38 | xp3 | K2 | `A-K2-shell-lib-1` |
| `apps/admin/src/lib/assistant-chats.ts` | 106 | xp3 | K2 | `A-K2-shell-lib-5` |
| `apps/admin/src/lib/assistant-daemon-activation.ts` | 65 | xp3 | K2 | `A-K2-shell-lib-1` |
| `apps/admin/src/lib/assistant-permanent-deletes.ts` | 16 | via `lib/admin-http/request.ts` | verbatim | `A-K2-shell-lib-6` |
| `apps/admin/src/lib/assistant-prompt-bus.ts` | 64 | xp3 | K2 | `A-K2-shell-lib-2` |
| `apps/admin/src/lib/assistant-subagents.ts` | 31 | tovu-dep | K3 | `A-K2-shell-lib-5` |
| `apps/admin/src/lib/assistant-transport-ag-ui.ts` | 74 | xp3 | K2 | `A-K2-shell-lib-2` |
| `apps/admin/src/lib/assistant-transport.ts` | 160 | xp3 | K2 | `A-K2-shell-lib-5` |
| `apps/admin/src/lib/browser-stream.ts` | 226 | xp3 | K2 | `A-K2-shell-lib-2` |
| `apps/admin/src/lib/browser-telemetry.ts` | 65 | via `lib/admin-http/request.ts` | verbatim | `A-K2-shell-lib-5` |
| `apps/admin/src/lib/browser-working-directory-access.ts` | 134 | xp3 | K2 | `A-K2-shell-lib-1` |
| `apps/admin/src/lib/chat-attachment-liveness.ts` | 14 | xp3 | K2 | `A-K2-shell-lib-1` |
| `apps/admin/src/lib/credential-card-guidance.ts` | 25 | xp3 | K2 | `A-K2-shell-lib-1` |
| `apps/admin/src/lib/credential-copy.ts` | 29 | tovu-dep | K5j K3 | `A-K2-shell-lib-1` |
| `apps/admin/src/lib/credential-submit-error.ts` | 28 | via `lib/admin-http/request.ts` | verbatim | `A-K2-shell-lib-5` |
| `apps/admin/src/lib/descriptor-i18n.ts` | 95 | via `features/deployment/api/deployment-api.types.ts` | verbatim | `A-K2-shell-lib-5` |
| `apps/admin/src/lib/durable-run-subscription.ts` | 90 | xp3 | K2 | `A-K2-shell-lib-3` |
| `apps/admin/src/lib/execution-settings.ts` | 549 | tovu-dep | K5j K4 K5 K2 | `A-K2-shell-lib-6` |
| `apps/admin/src/lib/fetch-query/provider.tsx` | 36 | xp3 | K2 | `A-K2-shell-lib-3` |
| `apps/admin/src/lib/ledger-slice.ts` | 32 | via `features/settings/api/settings-api.ts` | verbatim | `A-K2-shell-lib-6` |
| `apps/admin/src/lib/local-owner-signin.ts` | 32 | xp3 | K5j | `A-K2-shell-lib-5` |
| `apps/admin/src/lib/media-embed-extension.hooks.ts` | 165 | via `features/media/api/media-api.ts` | verbatim | `A-K2-shell-lib-7` |
| `apps/admin/src/lib/media-embed-extension.tsx` | 173 | via `components/MediaPickerDialog/MediaPickerDialog.tsx` | verbatim | `A-K2-shell-lib-7` |
| `apps/admin/src/lib/media-image-extension.hooks.ts` | 16 | tovu-dep | K3 | `A-K2-shell-lib-2` |
| `apps/admin/src/lib/media-image-extension.tsx` | 118 | via `lib/media-image-extension.hooks.ts` | verbatim | `A-K2-shell-lib-7` |
| `apps/admin/src/lib/owner-mfa-api.ts` | 18 | xp3 | K4j | `A-K2-shell-lib-5` |
| `apps/admin/src/lib/owner-passkey-api.ts` | 16 | xp3 | K4j | `A-K2-shell-lib-5` |
| `apps/admin/src/lib/owner-recovery-api.ts` | 42 | tovu-dep | K3 | `A-K2-shell-lib-5` |
| `apps/admin/src/lib/publish-criteria-deep-link.ts` | 58 | via `features/publish-content/ui/index.ts` | verbatim | `A-K2-shell-lib-6` |
| `apps/admin/src/lib/retry-unreachable.ts` | 35 | xp3 | K2 | `A-K2-shell-lib-5` |
| `apps/admin/src/lib/settings-events.ts` | 131 | via `features/themes/theme-preview-refresh.ts` | verbatim | `A-K2-shell-lib-6` |
| `apps/admin/src/lib/settings-tabs.ts` | 369 | tovu-dep | K2 K3 | `A-K2-shell-lib-7` |
| `apps/admin/src/lib/sse-frames.ts` | 5 | via `contracts/core/assistant-run-events.ts` | verbatim | `A-K2-shell-lib-3` |
| `apps/admin/src/lib/standing-draft-local-backup.ts` | 18 | xp3 | K2 | `A-K2-shell-lib-2` |
| `apps/admin/src/lib/stored-credential-endpoint.ts` | 101 | via `lib/admin-http/request.ts` | verbatim | `A-K2-shell-lib-6` |
| `apps/admin/src/lib/stream-activity.ts` | 69 | xp3 | K2 | `A-K2-shell-lib-2` |
| `apps/admin/src/lib/tab-event-source.ts` | 82 | via `lib/browser-stream.ts` | verbatim | `A-K2-shell-lib-5` |
| `apps/admin/src/lib/typed-answer-poster.ts` | 39 | xp3 | K2 | `A-K2-shell-lib-3` |
| `apps/admin/src/lib/version-conflict.ts` | 69 | via `lib/admin-http/request.ts` | verbatim | `A-K2-shell-lib-6` |
| `apps/admin/src/lib/visitor-tools.ts` | 54 | via `lib/admin-http/request.ts` | verbatim | `A-K2-shell-lib-6` |
| `apps/admin/src/lib/widget-embed-extension.hooks.ts` | 234 | tovu-dep | K3 | `A-K2-shell-lib-7` |
| `apps/admin/src/lib/widget-embed-extension.tsx` | 233 | via `lib/widget-embed-extension.hooks.ts` | verbatim | `A-K2-shell-lib-7` |

## adm-source-control (11)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/features/source-control/api/source-control-api.ts` | 46 | via `lib/admin-http/request.ts` | verbatim | `A-K2-source-control-1` |
| `apps/admin/src/features/source-control/api/source-control-api.types.ts` | 65 | xp3 | K4j | `A-K2-source-control-1` |
| `apps/admin/src/features/source-control/hooks/source-control-credentials-dependencies.hooks.ts` | 54 | via `features/source-control/api/source-control-api.types.ts` | verbatim | `A-K2-source-control-1` |
| `apps/admin/src/features/source-control/hooks/source-control-credentials-port.hooks.ts` | 32 | via `features/source-control/api/source-control-api.types.ts` | verbatim | `A-K2-source-control-1` |
| `apps/admin/src/features/source-control/hooks/use-source-control-credentials.hooks.ts` | 216 | tovu-dep | K3 K2 | `A-K2-source-control-1` |
| `apps/admin/src/features/source-control/index.ts` | 8 | via `features/source-control/SourceControl.tsx` | verbatim | `A-K2-source-control-1` |
| `apps/admin/src/features/source-control/ProvidersTab.tsx` | 464 | via `components/CredentialHint.tsx` | verbatim | `A-K2-source-control-1` |
| `apps/admin/src/features/source-control/rules.ts` | 161 | via `lib/credential-submit-error.ts` | verbatim | `A-K2-source-control-1` |
| `apps/admin/src/features/source-control/source-control-i18n.ts` | 601 | tovu-dep | K4i | `A-K2-source-control-1` |
| `apps/admin/src/features/source-control/source-control-visuals.tsx` | 64 | xp3 | K2 | `A-K2-source-control-1` |
| `apps/admin/src/features/source-control/SourceControl.tsx` | 121 | xp3 | K2 | `A-K2-source-control-1` |

## adm-themes (16)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/features/themes/api/themes-api.ts` | 202 | via `lib/admin-http/request.ts` | verbatim | `A-K2-themes-1` |
| `apps/admin/src/features/themes/hooks/theme-explore-dependencies.hooks.ts` | 119 | via `features/themes/api/themes-api.ts` | verbatim | `A-K2-themes-1` |
| `apps/admin/src/features/themes/hooks/themes-dependencies.hooks.ts` | 80 | via `features/themes/api/themes-api.ts` | verbatim | `A-K2-themes-1` |
| `apps/admin/src/features/themes/hooks/use-theme-explore-file-groups.hooks.ts` | 158 | via `features/themes/hooks/use-theme-explore.hooks.ts` | verbatim | `A-K2-themes-1` |
| `apps/admin/src/features/themes/hooks/use-theme-explore-preview.hooks.ts` | 112 | via `features/themes/hooks/use-theme-explore.hooks.ts` | verbatim | `A-K2-themes-1` |
| `apps/admin/src/features/themes/hooks/use-theme-explore-theme.hooks.ts` | 46 | via `hooks/use-admin-locale.hooks.ts` | verbatim | `A-K2-themes-1` |
| `apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts` | 1717 | xp3 | K2 K5j | `A-K2-themes-1` |
| `apps/admin/src/features/themes/hooks/use-theme-preview-refresh.hooks.ts` | 80 | via `hooks/use-admin-locale.hooks.ts` | verbatim | `A-K2-themes-1` |
| `apps/admin/src/features/themes/hooks/use-themes.hooks.ts` | 359 | xp3 | K2 | `A-K2-themes-1` |
| `apps/admin/src/features/themes/index.ts` | 11 | via `features/themes/Themes.tsx` | verbatim | `A-K2-themes-2` |
| `apps/admin/src/features/themes/theme-preview-refresh.ts` | 67 | via `lib/admin-http/request.ts` | verbatim | `A-K2-themes-1` |
| `apps/admin/src/features/themes/ThemeExplore.hooks.tsx` | 120 | via `features/themes/hooks/use-theme-explore.hooks.ts` | verbatim | `A-K2-themes-2` |
| `apps/admin/src/features/themes/ThemeExplore.tsx` | 1495 | xp3 | K2 | `A-K2-themes-2` |
| `apps/admin/src/features/themes/ThemePreviewReloadButton.tsx` | 16 | via `features/themes/hooks/use-theme-preview-refresh.hooks.ts` | verbatim | `A-K2-themes-2` |
| `apps/admin/src/features/themes/themes-i18n.ts` | 3656 | tovu-dep | K4i | `A-K2-themes-1` |
| `apps/admin/src/features/themes/Themes.tsx` | 669 | xp3 | K2 | `A-K2-themes-2` |

## adm-users (7)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/admin/src/features/users/api/users-api.ts` | 62 | via `lib/admin-http/request.ts` | verbatim | `A-K2-users-1` |
| `apps/admin/src/features/users/hooks/users-controller.hooks.ts` | 56 | xp3 | K5j | `A-K2-users-1` |
| `apps/admin/src/features/users/hooks/users-dependencies.hooks.ts` | 39 | xp3 | K4j | `A-K2-users-1` |
| `apps/admin/src/features/users/index.ts` | 10 | via `features/users/UsersPanel.tsx` | verbatim | `A-K2-users-1` |
| `apps/admin/src/features/users/users-i18n.ts` | 1585 | tovu-dep | K4i | `A-K2-users-1` |
| `apps/admin/src/features/users/UsersPanel.hooks.ts` | 12 | xp3 | K4j | `A-K2-users-1` |
| `apps/admin/src/features/users/UsersPanel.tsx` | 30 | xp3 | K5j K4j | `A-K2-users-1` |

## admin-http (329)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/server/inbound/admin-http/authorize-guard.ts` | 90 | tovu-dep | — | STAYS: K1 host port: Express auth/session/static helper the host turns into JsonRoutePorts (stays as composition) |
| `apps/website/src/server/inbound/admin-http/dev-auth.ts` | 877 | tovu-dep | — | STAYS: K1 host port: Express auth/session/static helper the host turns into JsonRoutePorts (stays as composition) |
| `apps/website/src/server/inbound/admin-http/http/api-keys.ts` | 68 | xp3 | K4j K4x | `RT-K1-adm-api-keys-1` |
| `apps/website/src/server/inbound/admin-http/http/change-sets.ts` | 26 | via `features/change-sets/tool-registrations.ts` | verbatim | `RT-K1-adm-change-sets-1` |
| `apps/website/src/server/inbound/admin-http/http/integrations.ts` | 119 | xp3 | K4x K5j | `RT-K1-adm-integrations-1` |
| `apps/website/src/server/inbound/admin-http/http/media.ts` | 153 | via `features/media/index.ts` | verbatim | `RT-K1-adm-media-1` |
| `apps/website/src/server/inbound/admin-http/http/members.ts` | 61 | xp3 | K4x | `RT-K1-adm-members-1` |
| `apps/website/src/server/inbound/admin-http/http/menus.ts` | 186 | tovu-dep | K1 | `RT-K1-adm-menus-1` |
| `apps/website/src/server/inbound/admin-http/http/newsletter.ts` | 154 | tovu-dep | K1 K4j K5x | `RT-K1-adm-newsletter-1` |
| `apps/website/src/server/inbound/admin-http/http/plugin-hook-error.ts` | 56 | tovu-dep | K5j K3 | `RT-K1-adm-plugin-hook-error-1` |
| `apps/website/src/server/inbound/admin-http/http/posts.ts` | 10 | via `features/post/index.ts` | verbatim | `RT-K1-adm-posts-1` |
| `apps/website/src/server/inbound/admin-http/http/presentation.ts` | 24 | via `features/presentation/index.ts` | verbatim | `RT-K1-adm-presentation-1` |
| `apps/website/src/server/inbound/admin-http/http/redirects.ts` | 135 | tovu-dep | K1 | `RT-K1-adm-redirects-1` |
| `apps/website/src/server/inbound/admin-http/http/users.ts` | 94 | xp3 | K4j | `RT-K1-adm-users-1` |
| `apps/website/src/server/inbound/admin-http/http/widgets.ts` | 162 | tovu-dep | K1 K4j K5j | `RT-K1-adm-widgets-1` |
| `apps/website/src/server/inbound/admin-http/http/workspace.ts` | 27 | via `features/workspace/index.ts` | verbatim | `RT-K1-adm-workspace-1` |
| `apps/website/src/server/inbound/admin-http/local-admin-request.ts` | 28 | tovu-dep | — | STAYS: K1 host port: Express auth/session/static helper the host turns into JsonRoutePorts (stays as composition) |
| `apps/website/src/server/inbound/admin-http/owner-mfa-deps.ts` | 34 | tovu-dep | K5j K1 | `RT-K1-adm-owner-mfa-deps-1` |
| `apps/website/src/server/inbound/admin-http/owner-mfa-routes.ts` | 107 | tovu-dep | K1 K5j | `RT-K1-adm-owner-mfa-routes-1` |
| `apps/website/src/server/inbound/admin-http/owner-passkey-routes.ts` | 114 | tovu-dep | K1 K5j | `RT-K1-adm-owner-passkey-routes-1` |
| `apps/website/src/server/inbound/admin-http/owner-recovery-routes.ts` | 120 | tovu-dep | K1 K5j | `RT-K1-adm-owner-recovery-routes-1` |
| `apps/website/src/server/inbound/admin-http/publish-trust-auth.ts` | 473 | xp3 | — | STAYS: K1 host port: Express auth/session/static helper the host turns into JsonRoutePorts (stays as composition) |
| `apps/website/src/server/inbound/admin-http/routes/agent-plugins/admin-surfaces.ts` | 137 | tovu-dep | K1 K5j K5x | `RT-K1-adm-agent-plugins-2` |
| `apps/website/src/server/inbound/admin-http/routes/agent-plugins/connection-sign-in.ts` | 27 | xp3 | K4x K5x K1 | `RT-K1-adm-agent-plugins-2` |
| `apps/website/src/server/inbound/admin-http/routes/agent-plugins/deps.ts` | 63 | tovu-dep | K1 K5j K5x | `RT-K1-adm-agent-plugins-1` |
| `apps/website/src/server/inbound/admin-http/routes/agent-plugins/files.ts` | 65 | tovu-dep | K1 K5x K5j | `RT-K1-adm-agent-plugins-3` |
| `apps/website/src/server/inbound/admin-http/routes/agent-plugins/install-response.ts` | 155 | tovu-dep | K1 K5j K5x K4j | `RT-K1-adm-agent-plugins-1` |
| `apps/website/src/server/inbound/admin-http/routes/agent-plugins/install.ts` | 130 | tovu-dep | K1 K5x K5j | `RT-K1-adm-agent-plugins-4` |
| `apps/website/src/server/inbound/admin-http/routes/agent-plugins/list.ts` | 81 | tovu-dep | K1 K5x | `RT-K1-adm-agent-plugins-4` |
| `apps/website/src/server/inbound/admin-http/routes/agent-plugins/memory.ts` | 80 | tovu-dep | K1 K5x K5j | `RT-K1-adm-agent-plugins-3` |
| `apps/website/src/server/inbound/admin-http/routes/agent-plugins/set-enabled.ts` | 309 | tovu-dep | K1 K5 K5j K5x | `RT-K1-adm-agent-plugins-5` |
| `apps/website/src/server/inbound/admin-http/routes/analytics/recent-hits.ts` | 113 | tovu-dep | K1 K4x K4j | `RT-K1-adm-analytics-1` |
| `apps/website/src/server/inbound/admin-http/routes/api-keys/create-principal.ts` | 47 | xp3 | K5x K1 | `RT-K1-adm-api-keys-1` |
| `apps/website/src/server/inbound/admin-http/routes/api-keys/deps.ts` | 133 | tovu-dep | K1 K5j K4x | `RT-K1-adm-api-keys-1` |
| `apps/website/src/server/inbound/admin-http/routes/api-keys/issue.ts` | 47 | xp3 | K5x K1 | `RT-K1-adm-api-keys-1` |
| `apps/website/src/server/inbound/admin-http/routes/api-keys/revoke.ts` | 41 | xp3 | K5x K1 | `RT-K1-adm-api-keys-2` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/delete-execution-credential.ts` | 30 | tovu-dep | K1 K5 | `RT-K1-adm-assistant-1` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/delete-site-credential.ts` | 34 | tovu-dep | K1 K5 | `RT-K1-adm-assistant-2` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/deps.ts` | 64 | tovu-dep | K1 | `RT-K1-adm-assistant-1` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/detect-agents.ts` | 187 | tovu-dep | K1 K4j K5 | `RT-K1-adm-assistant-2` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/execution-deps.ts` | 65 | tovu-dep | K4j K1 | `RT-K1-adm-assistant-1` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/get-chat-attachment.ts` | 109 | tovu-dep | K1 K5j | `RT-K1-adm-assistant-6` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/get-execution-credential.ts` | 31 | tovu-dep | K1 K5 | `RT-K1-adm-assistant-2` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/get-settings.ts` | 43 | tovu-dep | K1 K5 | `RT-K1-adm-assistant-3` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/get-site-credential.ts` | 34 | tovu-dep | K1 K5 | `RT-K1-adm-assistant-3` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/list-models.ts` | 141 | tovu-dep | K1 K5j K5 | `RT-K1-adm-assistant-5` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/put-execution-credential.ts` | 112 | tovu-dep | K1 K5 | `RT-K1-adm-assistant-3` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/put-settings.ts` | 52 | tovu-dep | K1 K5 | `RT-K1-adm-assistant-5` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/put-site-credential.ts` | 97 | tovu-dep | K1 K5 | `RT-K1-adm-assistant-4` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/resolve-test-agent-outcome.ts` | 75 | xp3 | K4j | `RT-K1-adm-assistant-1` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/stored-credential-probe.ts` | 216 | tovu-dep | K5 | `RT-K1-adm-assistant-4` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/test-agent.ts` | 87 | tovu-dep | K1 K5j K5 | `RT-K1-adm-assistant-4` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/test-connection.ts` | 134 | tovu-dep | K1 K5j K5 | `RT-K1-adm-assistant-5` |
| `apps/website/src/server/inbound/admin-http/routes/assistant/visitor-tools.ts` | 58 | tovu-dep | K1 K5 K4 | `RT-K1-adm-assistant-6` |
| `apps/website/src/server/inbound/admin-http/routes/change-sets/get.ts` | 45 | tovu-dep | K1 | `RT-K1-adm-change-sets-1` |
| `apps/website/src/server/inbound/admin-http/routes/change-sets/list.ts` | 29 | tovu-dep | K1 | `RT-K1-adm-change-sets-1` |
| `apps/website/src/server/inbound/admin-http/routes/change-sets/revert.ts` | 101 | tovu-dep | K1 | `RT-K1-adm-change-sets-1` |
| `apps/website/src/server/inbound/admin-http/routes/comments/deps.ts` | 39 | tovu-dep | K1 | `RT-K1-adm-comments-1` |
| `apps/website/src/server/inbound/admin-http/routes/comments/get-settings.ts` | 33 | tovu-dep | K1 | `RT-K1-adm-comments-1` |
| `apps/website/src/server/inbound/admin-http/routes/comments/moderate.ts` | 132 | tovu-dep | K1 | `RT-K1-adm-comments-1` |
| `apps/website/src/server/inbound/admin-http/routes/comments/moderation-queue.ts` | 58 | tovu-dep | K1 | `RT-K1-adm-comments-1` |
| `apps/website/src/server/inbound/admin-http/routes/comments/put-settings.ts` | 46 | tovu-dep | K1 | `RT-K1-adm-comments-2` |
| `apps/website/src/server/inbound/admin-http/routes/commerce/status.ts` | 52 | tovu-dep | K1 K5j K4j | `RT-K1-adm-commerce-1` |
| `apps/website/src/server/inbound/admin-http/routes/consent/routes.ts` | 65 | tovu-dep | K1 K4x K5x | `RT-K1-adm-consent-1` |
| `apps/website/src/server/inbound/admin-http/routes/content-types/deps.ts` | 42 | tovu-dep | K1 | `RT-K1-adm-content-types-1` |
| `apps/website/src/server/inbound/admin-http/routes/content-types/lifecycle.ts` | 83 | tovu-dep | K1 | `RT-K1-adm-content-types-1` |
| `apps/website/src/server/inbound/admin-http/routes/content-types/list.ts` | 30 | tovu-dep | K1 | `RT-K1-adm-content-types-1` |
| `apps/website/src/server/inbound/admin-http/routes/content-types/register.ts` | 77 | tovu-dep | K1 | `RT-K1-adm-content-types-1` |
| `apps/website/src/server/inbound/admin-http/routes/content-types/update-fields.ts` | 74 | tovu-dep | K1 | `RT-K1-adm-content-types-2` |
| `apps/website/src/server/inbound/admin-http/routes/content/deps.ts` | 133 | tovu-dep | K1 | `RT-K1-adm-content-1` |
| `apps/website/src/server/inbound/admin-http/routes/database-recovery/deps.ts` | 17 | tovu-dep | K1 | `RT-K1-adm-database-recovery-1` |
| `apps/website/src/server/inbound/admin-http/routes/database/migrate-forward.ts` | 187 | tovu-dep | K1 K5 K5j K5x | `RT-K1-adm-database-1` |
| `apps/website/src/server/inbound/admin-http/routes/database/restore-points.ts` | 189 | tovu-dep | K1 K5j | `RT-K1-adm-database-2` |
| `apps/website/src/server/inbound/admin-http/routes/database/schema-state.ts` | 56 | tovu-dep | K1 | `RT-K1-adm-database-2` |
| `apps/website/src/server/inbound/admin-http/routes/database/timeline.ts` | 73 | tovu-dep | K1 K5j | `RT-K1-adm-database-2` |
| `apps/website/src/server/inbound/admin-http/routes/email-templates/routes.ts` | 111 | tovu-dep | K1 K5j K5x | `RT-K1-adm-email-templates-1` |
| `apps/website/src/server/inbound/admin-http/routes/entries/create.ts` | 76 | tovu-dep | K1 | `RT-K1-adm-entries-1` |
| `apps/website/src/server/inbound/admin-http/routes/entries/lifecycle.ts` | 67 | tovu-dep | K1 | `RT-K1-adm-entries-1` |
| `apps/website/src/server/inbound/admin-http/routes/entries/list.ts` | 28 | tovu-dep | K1 | `RT-K1-adm-entries-1` |
| `apps/website/src/server/inbound/admin-http/routes/entries/update.ts` | 70 | tovu-dep | K1 | `RT-K1-adm-entries-1` |
| `apps/website/src/server/inbound/admin-http/routes/external-mcp/admissions.ts` | 31 | tovu-dep | K1 K5x | `RT-K1-adm-external-mcp-5` |
| `apps/website/src/server/inbound/admin-http/routes/external-mcp/delete.ts` | 44 | tovu-dep | K1 K5x | `RT-K1-adm-external-mcp-1` |
| `apps/website/src/server/inbound/admin-http/routes/external-mcp/deps.ts` | 23 | tovu-dep | K1 | `RT-K1-adm-external-mcp-1` |
| `apps/website/src/server/inbound/admin-http/routes/external-mcp/guard.ts` | 45 | via `server/inbound/admin-http/authorize-guard.ts` | K1 | `RT-K1-adm-external-mcp-1` |
| `apps/website/src/server/inbound/admin-http/routes/external-mcp/list.ts` | 31 | tovu-dep | K1 K5x | `RT-K1-adm-external-mcp-2` |
| `apps/website/src/server/inbound/admin-http/routes/external-mcp/oauth.ts` | 275 | tovu-dep | K1 K5j K5x K4x | `RT-K1-adm-external-mcp-4` |
| `apps/website/src/server/inbound/admin-http/routes/external-mcp/probe.ts` | 89 | tovu-dep | K1 K5x | `RT-K1-adm-external-mcp-5` |
| `apps/website/src/server/inbound/admin-http/routes/external-mcp/put.ts` | 206 | tovu-dep | K5 K1 K5x K4x | `RT-K1-adm-external-mcp-2` |
| `apps/website/src/server/inbound/admin-http/routes/external-mcp/tool-approvals.ts` | 52 | tovu-dep | K1 | `RT-K1-adm-external-mcp-3` |
| `apps/website/src/server/inbound/admin-http/routes/forms/authoring.ts` | 61 | tovu-dep | K1 | `RT-K1-adm-forms-3` |
| `apps/website/src/server/inbound/admin-http/routes/forms/create.ts` | 74 | tovu-dep | K1 | `RT-K1-adm-forms-3` |
| `apps/website/src/server/inbound/admin-http/routes/forms/delete-submission.ts` | 64 | tovu-dep | K1 | `RT-K1-adm-forms-2` |
| `apps/website/src/server/inbound/admin-http/routes/forms/deps.ts` | 22 | tovu-dep | K1 | `RT-K1-adm-forms-1` |
| `apps/website/src/server/inbound/admin-http/routes/forms/get-by-id.ts` | 40 | tovu-dep | K1 | `RT-K1-adm-forms-2` |
| `apps/website/src/server/inbound/admin-http/routes/forms/get-submission.ts` | 67 | tovu-dep | K1 | `RT-K1-adm-forms-2` |
| `apps/website/src/server/inbound/admin-http/routes/forms/list-submissions.ts` | 85 | tovu-dep | K1 | `RT-K1-adm-forms-2` |
| `apps/website/src/server/inbound/admin-http/routes/forms/list.ts` | 25 | tovu-dep | K1 | `RT-K1-adm-forms-1` |
| `apps/website/src/server/inbound/admin-http/routes/forms/providers.ts` | 26 | tovu-dep | K1 | `RT-K1-adm-forms-1` |
| `apps/website/src/server/inbound/admin-http/routes/forms/pull-submissions.ts` | 68 | tovu-dep | K1 | `RT-K1-adm-forms-1` |
| `apps/website/src/server/inbound/admin-http/routes/forms/resolve-definition.ts` | 28 | via `server/inbound/admin-http/routes/forms/deps.ts` | verbatim | `RT-K1-adm-forms-1` |
| `apps/website/src/server/inbound/admin-http/routes/forms/update.ts` | 119 | tovu-dep | K1 | `RT-K1-adm-forms-3` |
| `apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts` | 113 | tovu-dep | K1 | `RT-K1-adm-fs-files-1` |
| `apps/website/src/server/inbound/admin-http/routes/fs-files/folder-picker.ts` | 70 | tovu-dep | K1 | `RT-K1-adm-fs-files-1` |
| `apps/website/src/server/inbound/admin-http/routes/integrations/create.ts` | 71 | tovu-dep | K1 K5x | `RT-K1-adm-integrations-1` |
| `apps/website/src/server/inbound/admin-http/routes/integrations/delete.ts` | 56 | tovu-dep | K1 K5x | `RT-K1-adm-integrations-1` |
| `apps/website/src/server/inbound/admin-http/routes/integrations/deliveries.ts` | 66 | tovu-dep | K1 | `RT-K1-adm-integrations-2` |
| `apps/website/src/server/inbound/admin-http/routes/integrations/deps.ts` | 37 | tovu-dep | K4x K1 | `RT-K1-adm-integrations-1` |
| `apps/website/src/server/inbound/admin-http/routes/integrations/list.ts` | 73 | tovu-dep | K1 K4x | `RT-K1-adm-integrations-2` |
| `apps/website/src/server/inbound/admin-http/routes/integrations/pause.ts` | 84 | tovu-dep | K1 K5x | `RT-K1-adm-integrations-2` |
| `apps/website/src/server/inbound/admin-http/routes/media/byte-size.ts` | 49 | via `features/media/index.ts` | verbatim | `RT-K1-adm-media-1` |
| `apps/website/src/server/inbound/admin-http/routes/media/content-type.ts` | 3 | via `features/media/index.ts` | verbatim | `RT-K1-adm-media-1` |
| `apps/website/src/server/inbound/admin-http/routes/media/delete.ts` | 70 | tovu-dep | K1 | `RT-K1-adm-media-2` |
| `apps/website/src/server/inbound/admin-http/routes/media/deps.ts` | 66 | tovu-dep | K1 | `RT-K1-adm-media-1` |
| `apps/website/src/server/inbound/admin-http/routes/media/get-providers.ts` | 39 | tovu-dep | K1 | `RT-K1-adm-media-2` |
| `apps/website/src/server/inbound/admin-http/routes/media/import-url.ts` | 83 | tovu-dep | K1 K5 | `RT-K1-adm-media-3` |
| `apps/website/src/server/inbound/admin-http/routes/media/list.ts` | 44 | tovu-dep | K1 | `RT-K1-adm-media-3` |
| `apps/website/src/server/inbound/admin-http/routes/media/original.ts` | 271 | tovu-dep | K1 K5j | `RT-K1-adm-media-1` |
| `apps/website/src/server/inbound/admin-http/routes/media/put-providers.ts` | 68 | tovu-dep | K1 | `RT-K1-adm-media-2` |
| `apps/website/src/server/inbound/admin-http/routes/media/replace.ts` | 85 | tovu-dep | K1 | `RT-K1-adm-media-4` |
| `apps/website/src/server/inbound/admin-http/routes/media/route-guards.ts` | 32 | tovu-dep | K1 | `RT-K1-adm-media-1` |
| `apps/website/src/server/inbound/admin-http/routes/media/stored-media-response.ts` | 26 | via `features/media/index.ts` | verbatim | `RT-K1-adm-media-3` |
| `apps/website/src/server/inbound/admin-http/routes/media/text.ts` | 50 | tovu-dep | K1 | `RT-K1-adm-media-1` |
| `apps/website/src/server/inbound/admin-http/routes/media/trash.ts` | 94 | tovu-dep | K1 | `RT-K1-adm-media-3` |
| `apps/website/src/server/inbound/admin-http/routes/media/update.ts` | 126 | tovu-dep | K1 | `RT-K1-adm-media-3` |
| `apps/website/src/server/inbound/admin-http/routes/media/upload.ts` | 227 | tovu-dep | K1 | `RT-K1-adm-media-4` |
| `apps/website/src/server/inbound/admin-http/routes/media/where-used.ts` | 27 | tovu-dep | K1 | `RT-K1-adm-media-2` |
| `apps/website/src/server/inbound/admin-http/routes/members/delete.ts` | 32 | tovu-dep | K1 K5x | `RT-K1-adm-members-1` |
| `apps/website/src/server/inbound/admin-http/routes/members/deps.ts` | 38 | tovu-dep | K4x K5x K1 | `RT-K1-adm-members-1` |
| `apps/website/src/server/inbound/admin-http/routes/members/disable.ts` | 66 | tovu-dep | K1 K5x | `RT-K1-adm-members-1` |
| `apps/website/src/server/inbound/admin-http/routes/members/get-by-id.ts` | 55 | tovu-dep | K1 K5x | `RT-K1-adm-members-2` |
| `apps/website/src/server/inbound/admin-http/routes/members/list.ts` | 74 | tovu-dep | K1 | `RT-K1-adm-members-2` |
| `apps/website/src/server/inbound/admin-http/routes/members/request-magic-link.ts` | 102 | tovu-dep | K1 K5x | `RT-K1-adm-members-2` |
| `apps/website/src/server/inbound/admin-http/routes/menus/assign-location.ts` | 94 | tovu-dep | K1 | `RT-K1-adm-menus-1` |
| `apps/website/src/server/inbound/admin-http/routes/menus/create.ts` | 87 | tovu-dep | K1 | `RT-K1-adm-menus-1` |
| `apps/website/src/server/inbound/admin-http/routes/menus/delete.ts` | 43 | tovu-dep | K1 | `RT-K1-adm-menus-1` |
| `apps/website/src/server/inbound/admin-http/routes/menus/get-by-id.ts` | 40 | tovu-dep | K1 | `RT-K1-adm-menus-2` |
| `apps/website/src/server/inbound/admin-http/routes/menus/list.ts` | 37 | tovu-dep | K1 | `RT-K1-adm-menus-2` |
| `apps/website/src/server/inbound/admin-http/routes/menus/update-tree.ts` | 134 | tovu-dep | K1 | `RT-K1-adm-menus-2` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/archive-list.ts` | 29 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-2` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/cancel-campaign.ts` | 34 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-2` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/create-campaign.ts` | 86 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-2` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/create-list.ts` | 35 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-3` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/create-subscription.ts` | 51 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-3` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/deps.ts` | 131 | tovu-dep | K5x K4x K4j K1 | `RT-K1-adm-newsletter-1` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/get-campaign.ts` | 27 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-3` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/import-subscriptions.ts` | 47 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-4` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/list-campaigns.ts` | 40 | tovu-dep | K1 | `RT-K1-adm-newsletter-4` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/list-lists.ts` | 25 | tovu-dep | K1 | `RT-K1-adm-newsletter-4` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/list-send-log.ts` | 40 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-4` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/list-subscriptions.ts` | 35 | tovu-dep | K1 | `RT-K1-adm-newsletter-5` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/pause-campaign.ts` | 29 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-5` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/remove-subscription.ts` | 46 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-5` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/resend-confirmation.ts` | 50 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-6` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/resume-campaign.ts` | 29 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-6` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/schedule-campaign.ts` | 58 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-6` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/send-campaign.ts` | 80 | tovu-dep | K5x K4x K1 | `RT-K1-adm-newsletter-7` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/send-test-campaign.ts` | 42 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-7` |
| `apps/website/src/server/inbound/admin-http/routes/newsletter/update-campaign.ts` | 157 | tovu-dep | K5x K1 | `RT-K1-adm-newsletter-7` |
| `apps/website/src/server/inbound/admin-http/routes/pages/create.ts` | 128 | tovu-dep | K1 | `RT-K1-adm-pages-1` |
| `apps/website/src/server/inbound/admin-http/routes/pages/delete.ts` | 158 | tovu-dep | K1 | `RT-K1-adm-pages-1` |
| `apps/website/src/server/inbound/admin-http/routes/pages/get-by-id.ts` | 93 | tovu-dep | K1 K4x | `RT-K1-adm-pages-1` |
| `apps/website/src/server/inbound/admin-http/routes/pages/list.ts` | 41 | tovu-dep | K1 | `RT-K1-adm-pages-1` |
| `apps/website/src/server/inbound/admin-http/routes/pages/update-html.ts` | 212 | tovu-dep | K1 K5x | `RT-K1-adm-pages-2` |
| `apps/website/src/server/inbound/admin-http/routes/pages/update.ts` | 248 | tovu-dep | K1 | `RT-K1-adm-pages-2` |
| `apps/website/src/server/inbound/admin-http/routes/plugins/chart-providers.ts` | 52 | tovu-dep | K1 K5j K5 | `RT-K1-adm-plugins-1` |
| `apps/website/src/server/inbound/admin-http/routes/plugins/deps.ts` | 59 | xp3 | K4j K4x K5x K5j | `RT-K1-adm-plugins-1` |
| `apps/website/src/server/inbound/admin-http/routes/plugins/files.ts` | 70 | tovu-dep | K1 K5j | `RT-K1-adm-plugins-2` |
| `apps/website/src/server/inbound/admin-http/routes/plugins/install.ts` | 125 | tovu-dep | K1 K5j | `RT-K1-adm-plugins-5` |
| `apps/website/src/server/inbound/admin-http/routes/plugins/list.ts` | 66 | tovu-dep | K1 K5j | `RT-K1-adm-plugins-5` |
| `apps/website/src/server/inbound/admin-http/routes/plugins/local-installer.ts` | 19 | tovu-dep | K5 K4j K5x | `RT-K1-adm-plugins-2` |
| `apps/website/src/server/inbound/admin-http/routes/plugins/preview.ts` | 168 | tovu-dep | K1 K5j | `RT-K1-adm-plugins-2` |
| `apps/website/src/server/inbound/admin-http/routes/plugins/provider-settings.ts` | 153 | tovu-dep | K1 K4 K5 K5j K5x | `RT-K1-adm-plugins-3` |
| `apps/website/src/server/inbound/admin-http/routes/plugins/set-enabled.ts` | 204 | tovu-dep | K5x K1 K5j | `RT-K1-adm-plugins-4` |
| `apps/website/src/server/inbound/admin-http/routes/plugins/uninstall.ts` | 84 | tovu-dep | K1 K5j K5 | `RT-K1-adm-plugins-4` |
| `apps/website/src/server/inbound/admin-http/routes/posts/autosave.ts` | 218 | tovu-dep | K1 | `RT-K1-adm-posts-1` |
| `apps/website/src/server/inbound/admin-http/routes/posts/create.ts` | 160 | tovu-dep | K1 | `RT-K1-adm-posts-1` |
| `apps/website/src/server/inbound/admin-http/routes/posts/delete.ts` | 183 | tovu-dep | K1 | `RT-K1-adm-posts-1` |
| `apps/website/src/server/inbound/admin-http/routes/posts/get-by-id.ts` | 45 | tovu-dep | K1 | `RT-K1-adm-posts-1` |
| `apps/website/src/server/inbound/admin-http/routes/posts/list.ts` | 36 | tovu-dep | K1 | `RT-K1-adm-posts-2` |
| `apps/website/src/server/inbound/admin-http/routes/posts/template-preview-render.ts` | 212 | xp3 | K5x K5 | `RT-K1-adm-posts-2` |
| `apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts` | 246 | tovu-dep | K1 | `RT-K1-adm-posts-2` |
| `apps/website/src/server/inbound/admin-http/routes/posts/update.ts` | 301 | tovu-dep | K1 | `RT-K1-adm-posts-2` |
| `apps/website/src/server/inbound/admin-http/routes/presentation/get.ts` | 126 | tovu-dep | K1 K5 | `RT-K1-adm-presentation-1` |
| `apps/website/src/server/inbound/admin-http/routes/presentation/patch-active-theme.ts` | 112 | tovu-dep | K1 | `RT-K1-adm-presentation-1` |
| `apps/website/src/server/inbound/admin-http/routes/presentation/rescan-themes.ts` | 52 | tovu-dep | K1 | `RT-K1-adm-presentation-1` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/apply-report.ts` | 39 | via `features/publish-content/plan-rows.ts` | verbatim | `RT-K1-adm-publish-content-2` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/backstop.ts` | 311 | tovu-dep | K1 | `RT-K1-adm-publish-content-6` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/blob-get.ts` | 125 | tovu-dep | K1 | `RT-K1-adm-publish-content-4` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/blob-put.ts` | 91 | tovu-dep | K1 | `RT-K1-adm-publish-content-5` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/blobs-probe.ts` | 87 | tovu-dep | K1 | `RT-K1-adm-publish-content-1` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/bundle-create.ts` | 238 | tovu-dep | K1 K5 | `RT-K1-adm-publish-content-2` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/capabilities.ts` | 79 | tovu-dep | K1 | `RT-K1-adm-publish-content-1` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/deps.ts` | 155 | tovu-dep | K5 K1 | `RT-K1-adm-publish-content-1` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/destination.ts` | 298 | tovu-dep | K1 | `RT-K1-adm-publish-content-4` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/export.ts` | 136 | tovu-dep | K1 | `RT-K1-adm-publish-content-2` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/import-errors.ts` | 43 | tovu-dep | K1 K5 | `RT-K1-adm-publish-content-3` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/import.ts` | 325 | tovu-dep | K5 K1 | `RT-K1-adm-publish-content-3` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/peer-transport.ts` | 383 | tovu-dep | K4x K1 | `RT-K1-adm-publish-content-5` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/peers.ts` | 178 | tovu-dep | K1 | `RT-K1-adm-publish-content-4` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/report-dto.ts` | 44 | via `features/publish-content/plan-rows.ts` | verbatim | `RT-K1-adm-publish-content-1` |
| `apps/website/src/server/inbound/admin-http/routes/publish-content/route-helpers.ts` | 107 | tovu-dep | K1 | `RT-K1-adm-publish-content-2` |
| `apps/website/src/server/inbound/admin-http/routes/recovery/deep-link.ts` | 39 | tovu-dep | K1 K5j | `RT-K1-adm-recovery-1` |
| `apps/website/src/server/inbound/admin-http/routes/recovery/disclosure.ts` | 49 | tovu-dep | K1 K5j | `RT-K1-adm-recovery-1` |
| `apps/website/src/server/inbound/admin-http/routes/recovery/restore-points.ts` | 31 | tovu-dep | K1 K5j | `RT-K1-adm-recovery-1` |
| `apps/website/src/server/inbound/admin-http/routes/recovery/restore.ts` | 261 | tovu-dep | K1 K5 K5j K5x | `RT-K1-adm-recovery-2` |
| `apps/website/src/server/inbound/admin-http/routes/recovery/status.ts` | 60 | tovu-dep | K1 K5j | `RT-K1-adm-recovery-2` |
| `apps/website/src/server/inbound/admin-http/routes/redirects/create.ts` | 93 | tovu-dep | K1 | `RT-K1-adm-redirects-1` |
| `apps/website/src/server/inbound/admin-http/routes/redirects/get-by-id.ts` | 30 | tovu-dep | K1 | `RT-K1-adm-redirects-1` |
| `apps/website/src/server/inbound/admin-http/routes/redirects/hits.ts` | 38 | tovu-dep | K1 | `RT-K1-adm-redirects-2` |
| `apps/website/src/server/inbound/admin-http/routes/redirects/import.ts` | 47 | tovu-dep | K1 | `RT-K1-adm-redirects-2` |
| `apps/website/src/server/inbound/admin-http/routes/redirects/list.ts` | 44 | tovu-dep | K1 | `RT-K1-adm-redirects-2` |
| `apps/website/src/server/inbound/admin-http/routes/redirects/shared.ts` | 53 | tovu-dep | K1 | `RT-K1-adm-redirects-1` |
| `apps/website/src/server/inbound/admin-http/routes/redirects/tombstone.ts` | 41 | tovu-dep | K1 | `RT-K1-adm-redirects-2` |
| `apps/website/src/server/inbound/admin-http/routes/redirects/update.ts` | 51 | tovu-dep | K1 | `RT-K1-adm-redirects-2` |
| `apps/website/src/server/inbound/admin-http/routes/seo/deps.ts` | 55 | tovu-dep | K1 | `RT-K1-adm-seo-1` |
| `apps/website/src/server/inbound/admin-http/routes/seo/get-entry-analyze.ts` | 36 | tovu-dep | K1 | `RT-K1-adm-seo-1` |
| `apps/website/src/server/inbound/admin-http/routes/seo/get-entry.ts` | 39 | tovu-dep | K1 | `RT-K1-adm-seo-1` |
| `apps/website/src/server/inbound/admin-http/routes/seo/get-settings.ts` | 26 | tovu-dep | K1 | `RT-K1-adm-seo-2` |
| `apps/website/src/server/inbound/admin-http/routes/seo/post-sitemap-regenerate.ts` | 25 | tovu-dep | K1 | `RT-K1-adm-seo-1` |
| `apps/website/src/server/inbound/admin-http/routes/seo/put-entry.ts` | 99 | tovu-dep | K1 | `RT-K1-adm-seo-1` |
| `apps/website/src/server/inbound/admin-http/routes/seo/put-settings.ts` | 42 | tovu-dep | K1 | `RT-K1-adm-seo-2` |
| `apps/website/src/server/inbound/admin-http/routes/settings/assistant-subagents-access.ts` | 89 | tovu-dep | K3 | `RT-K1-adm-settings-1` |
| `apps/website/src/server/inbound/admin-http/routes/settings/clear.ts` | 101 | xp3 | K4j | `RT-K1-adm-settings-2` |
| `apps/website/src/server/inbound/admin-http/routes/settings/deps.ts` | 34 | tovu-dep | K1 | `RT-K1-adm-settings-1` |
| `apps/website/src/server/inbound/admin-http/routes/settings/events.ts` | 421 | tovu-dep | K1 | `RT-K1-adm-settings-1` |
| `apps/website/src/server/inbound/admin-http/routes/settings/get-effective.ts` | 96 | via `server/inbound/admin-http/routes/settings/deps.ts` | verbatim | `RT-K1-adm-settings-2` |
| `apps/website/src/server/inbound/admin-http/routes/settings/get-raw.ts` | 83 | via `server/inbound/admin-http/routes/settings/deps.ts` | verbatim | `RT-K1-adm-settings-2` |
| `apps/website/src/server/inbound/admin-http/routes/settings/list-definitions.ts` | 44 | via `server/inbound/admin-http/routes/settings/deps.ts` | verbatim | `RT-K1-adm-settings-2` |
| `apps/website/src/server/inbound/admin-http/routes/settings/register-definitions.ts` | 168 | xp3 | K4j | `RT-K1-adm-settings-2` |
| `apps/website/src/server/inbound/admin-http/routes/settings/reset.ts` | 83 | via `features/settings/index.ts` | verbatim | `RT-K1-adm-settings-2` |
| `apps/website/src/server/inbound/admin-http/routes/settings/set.ts` | 139 | xp3 | K4j | `RT-K1-adm-settings-2` |
| `apps/website/src/server/inbound/admin-http/routes/settings/shared.ts` | 232 | tovu-dep | K1 K5j K3 | `RT-K1-adm-settings-1` |
| `apps/website/src/server/inbound/admin-http/routes/site/profile.ts` | 195 | tovu-dep | K1 | `RT-K1-adm-site-1` |
| `apps/website/src/server/inbound/admin-http/routes/sites/local-sites.ts` | 73 | tovu-dep | K1 K5 | `RT-K1-adm-sites-1` |
| `apps/website/src/server/inbound/admin-http/routes/sites/site-previews.ts` | 79 | tovu-dep | K1 K5 | `RT-K1-adm-sites-1` |
| `apps/website/src/server/inbound/admin-http/routes/sites/sites-home.ts` | 95 | tovu-dep | K1 K5 K5j | `RT-K1-adm-sites-2` |
| `apps/website/src/server/inbound/admin-http/routes/sites/warm-site-control.ts` | 67 | tovu-dep | K5j K1 K4 K5 | `RT-K1-adm-sites-2` |
| `apps/website/src/server/inbound/admin-http/routes/skills/deps.ts` | 19 | tovu-dep | K1 | `RT-K1-adm-skills-1` |
| `apps/website/src/server/inbound/admin-http/routes/skills/files.ts` | 44 | tovu-dep | K1 K5x K5j | `RT-K1-adm-skills-1` |
| `apps/website/src/server/inbound/admin-http/routes/skills/list.ts` | 57 | tovu-dep | K1 K5x | `RT-K1-adm-skills-1` |
| `apps/website/src/server/inbound/admin-http/routes/skills/manage.ts` | 81 | tovu-dep | K1 K4j K5x | `RT-K1-adm-skills-2` |
| `apps/website/src/server/inbound/admin-http/routes/system/assistant-daemon.ts` | 79 | tovu-dep | K1 K5 | `RT-K1-adm-system-1` |
| `apps/website/src/server/inbound/admin-http/routes/system/assistant-owner-grant.ts` | 84 | tovu-dep | K1 | `RT-K1-adm-system-5` |
| `apps/website/src/server/inbound/admin-http/routes/system/assistant-permanent-deletes.ts` | 31 | tovu-dep | K5 | `RT-K1-adm-system-6` |
| `apps/website/src/server/inbound/admin-http/routes/system/assistant-subagents.ts` | 75 | tovu-dep | K5 K5j K3 | `RT-K1-adm-system-7` |
| `apps/website/src/server/inbound/admin-http/routes/system/browser-telemetry.ts` | 159 | tovu-dep | K1 | `RT-K1-adm-system-2` |
| `apps/website/src/server/inbound/admin-http/routes/system/credential-copy.ts` | 77 | tovu-dep | K1 | `RT-K1-adm-system-1` |
| `apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts` | 257 | tovu-dep | K1 K5x | `RT-K1-adm-system-10` |
| `apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts` | 191 | tovu-dep | K5 K1 K5x | `RT-K1-adm-system-5` |
| `apps/website/src/server/inbound/admin-http/routes/system/dockerfile-source.ts` | 150 | tovu-dep | K1 K5x | `RT-K1-adm-system-7` |
| `apps/website/src/server/inbound/admin-http/routes/system/export-site.ts` | 157 | tovu-dep | K1 K5x | `RT-K1-adm-system-8` |
| `apps/website/src/server/inbound/admin-http/routes/system/mail-activity.ts` | 120 | tovu-dep | K1 K5j K4x K5x | `RT-K1-adm-system-9` |
| `apps/website/src/server/inbound/admin-http/routes/system/mail-dns.ts` | 54 | tovu-dep | K1 K5x | `RT-K1-adm-system-6` |
| `apps/website/src/server/inbound/admin-http/routes/system/mail-providers.ts` | 121 | tovu-dep | K1 K5x | `RT-K1-adm-system-6` |
| `apps/website/src/server/inbound/admin-http/routes/system/mail-status.ts` | 53 | tovu-dep | K1 K5x | `RT-K1-adm-system-2` |
| `apps/website/src/server/inbound/admin-http/routes/system/mail-test-send.ts` | 80 | tovu-dep | K1 K5x | `RT-K1-adm-system-3` |
| `apps/website/src/server/inbound/admin-http/routes/system/module-status.ts` | 44 | tovu-dep | K1 K5 | `RT-K1-adm-system-1` |
| `apps/website/src/server/inbound/admin-http/routes/system/observability-status.ts` | 69 | tovu-dep | K1 | `RT-K1-adm-system-2` |
| `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts` | 405 | tovu-dep | K1 K5x | `RT-K1-adm-system-11` |
| `apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts` | 469 | tovu-dep | K1 K5 K5x K4x | `RT-K1-adm-system-12` |
| `apps/website/src/server/inbound/admin-http/routes/system/server-logs.ts` | 46 | tovu-dep | K1 K5x | `RT-K1-adm-system-3` |
| `apps/website/src/server/inbound/admin-http/routes/system/site-backups.ts` | 56 | tovu-dep | K1 K5x | `RT-K1-adm-system-15` |
| `apps/website/src/server/inbound/admin-http/routes/system/site-imports.ts` | 184 | tovu-dep | K1 K5x | `RT-K1-adm-system-15` |
| `apps/website/src/server/inbound/admin-http/routes/system/site-key.ts` | 622 | tovu-dep | K1 K5x K5 K4 K5j | `RT-K1-adm-system-4` |
| `apps/website/src/server/inbound/admin-http/routes/system/site-share-password.ts` | 94 | tovu-dep | K4x K4j K1 K5x | `RT-K1-adm-system-11` |
| `apps/website/src/server/inbound/admin-http/routes/system/site-shares.ts` | 195 | tovu-dep | K1 K5x | `RT-K1-adm-system-13` |
| `apps/website/src/server/inbound/admin-http/routes/system/sites.ts` | 480 | tovu-dep | K1 K5 K4 K5x K4x | `RT-K1-adm-system-14` |
| `apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts` | 221 | tovu-dep | K1 K5x | `RT-K1-adm-system-10` |
| `apps/website/src/server/inbound/admin-http/routes/system/tool-gaps.ts` | 21 | tovu-dep | K1 K4 | `RT-K1-adm-system-2` |
| `apps/website/src/server/inbound/admin-http/routes/taxonomy/assign-terms.ts` | 144 | tovu-dep | K1 | `RT-K1-adm-taxonomy-1` |
| `apps/website/src/server/inbound/admin-http/routes/taxonomy/create-taxonomy.ts` | 53 | tovu-dep | K1 | `RT-K1-adm-taxonomy-1` |
| `apps/website/src/server/inbound/admin-http/routes/taxonomy/create-term.ts` | 75 | tovu-dep | K1 | `RT-K1-adm-taxonomy-1` |
| `apps/website/src/server/inbound/admin-http/routes/taxonomy/delete-taxonomy.ts` | 54 | tovu-dep | K1 | `RT-K1-adm-taxonomy-2` |
| `apps/website/src/server/inbound/admin-http/routes/taxonomy/delete-term.ts` | 56 | tovu-dep | K1 | `RT-K1-adm-taxonomy-2` |
| `apps/website/src/server/inbound/admin-http/routes/taxonomy/deps.ts` | 42 | tovu-dep | K1 | `RT-K1-adm-taxonomy-1` |
| `apps/website/src/server/inbound/admin-http/routes/taxonomy/list.ts` | 29 | tovu-dep | K1 | `RT-K1-adm-taxonomy-2` |
| `apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts` | 173 | tovu-dep | K1 K5 | `RT-K1-adm-taxonomy-3` |
| `apps/website/src/server/inbound/admin-http/routes/taxonomy/rename-term.ts` | 58 | tovu-dep | K1 | `RT-K1-adm-taxonomy-3` |
| `apps/website/src/server/inbound/admin-http/routes/themes/duplicate.ts` | 77 | tovu-dep | K1 | `RT-K1-adm-themes-2` |
| `apps/website/src/server/inbound/admin-http/routes/themes/explore.ts` | 1245 | tovu-dep | K1 | `RT-K1-adm-themes-1` |
| `apps/website/src/server/inbound/admin-http/routes/themes/list.ts` | 89 | tovu-dep | K1 | `RT-K1-adm-themes-2` |
| `apps/website/src/server/inbound/admin-http/routes/themes/preview.ts` | 136 | tovu-dep | K1 K5 | `RT-K1-adm-themes-2` |
| `apps/website/src/server/inbound/admin-http/routes/trash/deps.ts` | 47 | xp3 | K4j | `RT-K1-adm-trash-1` |
| `apps/website/src/server/inbound/admin-http/routes/trash/items.ts` | 108 | tovu-dep | K1 | `RT-K1-adm-trash-1` |
| `apps/website/src/server/inbound/admin-http/routes/trash/list.ts` | 144 | tovu-dep | K1 | `RT-K1-adm-trash-1` |
| `apps/website/src/server/inbound/admin-http/routes/trash/purge.ts` | 86 | tovu-dep | K1 | `RT-K1-adm-trash-1` |
| `apps/website/src/server/inbound/admin-http/routes/trash/restore.ts` | 99 | tovu-dep | K1 | `RT-K1-adm-trash-1` |
| `apps/website/src/server/inbound/admin-http/routes/users/assign-role.ts` | 64 | tovu-dep | K1 K5j | `RT-K1-adm-users-1` |
| `apps/website/src/server/inbound/admin-http/routes/users/attach-policy.ts` | 65 | tovu-dep | K1 K5j | `RT-K1-adm-users-2` |
| `apps/website/src/server/inbound/admin-http/routes/users/create-policy.ts` | 61 | tovu-dep | K1 K5j | `RT-K1-adm-users-2` |
| `apps/website/src/server/inbound/admin-http/routes/users/create-role.ts` | 46 | tovu-dep | K1 K5j | `RT-K1-adm-users-2` |
| `apps/website/src/server/inbound/admin-http/routes/users/create.ts` | 111 | tovu-dep | K1 K5j K5x | `RT-K1-adm-users-3` |
| `apps/website/src/server/inbound/admin-http/routes/users/delete-policy.ts` | 58 | tovu-dep | K1 K5j | `RT-K1-adm-users-3` |
| `apps/website/src/server/inbound/admin-http/routes/users/delete-role.ts` | 58 | tovu-dep | K1 K5j | `RT-K1-adm-users-4` |
| `apps/website/src/server/inbound/admin-http/routes/users/delete.ts` | 73 | tovu-dep | K1 K5j K5x | `RT-K1-adm-users-4` |
| `apps/website/src/server/inbound/admin-http/routes/users/deps.ts` | 109 | tovu-dep | K4j K1 K4x K5x | `RT-K1-adm-users-1` |
| `apps/website/src/server/inbound/admin-http/routes/users/disable.ts` | 103 | tovu-dep | K1 K5x K5j | `RT-K1-adm-users-5` |
| `apps/website/src/server/inbound/admin-http/routes/users/enable.ts` | 98 | tovu-dep | K1 K5j K5x | `RT-K1-adm-users-5` |
| `apps/website/src/server/inbound/admin-http/routes/users/list-policies.ts` | 36 | tovu-dep | K1 | `RT-K1-adm-users-5` |
| `apps/website/src/server/inbound/admin-http/routes/users/list-policy-permissions.ts` | 52 | tovu-dep | K1 | `RT-K1-adm-users-6` |
| `apps/website/src/server/inbound/admin-http/routes/users/list-roles.ts` | 36 | tovu-dep | K1 | `RT-K1-adm-users-6` |
| `apps/website/src/server/inbound/admin-http/routes/users/list.ts` | 104 | tovu-dep | K1 K5x | `RT-K1-adm-users-6` |
| `apps/website/src/server/inbound/admin-http/routes/users/remove-policy-permission.ts` | 89 | tovu-dep | K1 K5x K5j | `RT-K1-adm-users-7` |
| `apps/website/src/server/inbound/admin-http/routes/users/reset-password.ts` | 92 | tovu-dep | K1 K5x K5j | `RT-K1-adm-users-7` |
| `apps/website/src/server/inbound/admin-http/routes/users/update-policy.ts` | 58 | tovu-dep | K1 K5j | `RT-K1-adm-users-8` |
| `apps/website/src/server/inbound/admin-http/routes/users/update-role.ts` | 56 | tovu-dep | K1 K5j | `RT-K1-adm-users-8` |
| `apps/website/src/server/inbound/admin-http/routes/users/update.ts` | 116 | tovu-dep | K1 K5j K5x | `RT-K1-adm-users-9` |
| `apps/website/src/server/inbound/admin-http/routes/users/write-policy-permission.ts` | 98 | tovu-dep | K1 K5j | `RT-K1-adm-users-9` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/agent-tools.ts` | 289 | tovu-dep | K1 | `RT-K1-adm-widgets-2` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/create.ts` | 62 | tovu-dep | K1 | `RT-K1-adm-widgets-2` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/embed-insert.ts` | 40 | tovu-dep | K1 | `RT-K1-adm-widgets-3` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/embed-remove.ts` | 37 | tovu-dep | K1 | `RT-K1-adm-widgets-3` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/embed-reorder.ts` | 45 | tovu-dep | K1 | `RT-K1-adm-widgets-3` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/get-by-id.ts` | 30 | tovu-dep | K1 | `RT-K1-adm-widgets-1` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/list.ts` | 39 | tovu-dep | K1 | `RT-K1-adm-widgets-1` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/preview-render.ts` | 45 | tovu-dep | K5 K1 | `RT-K1-adm-widgets-4` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/preview.ts` | 38 | tovu-dep | K1 | `RT-K1-adm-widgets-4` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/region-bind.ts` | 37 | tovu-dep | K1 | `RT-K1-adm-widgets-3` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/region-get.ts` | 52 | tovu-dep | K1 | `RT-K1-adm-widgets-1` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/region-mutate-placements.ts` | 85 | tovu-dep | K1 | `RT-K1-adm-widgets-3` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/regions-list.ts` | 35 | tovu-dep | K1 | `RT-K1-adm-widgets-2` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/trash.ts` | 27 | tovu-dep | K1 | `RT-K1-adm-widgets-4` |
| `apps/website/src/server/inbound/admin-http/routes/widgets/update.ts` | 42 | tovu-dep | K1 | `RT-K1-adm-widgets-4` |
| `apps/website/src/server/inbound/admin-http/routes/workspace/create.ts` | 49 | tovu-dep | K1 | `RT-K1-adm-workspace-1` |
| `apps/website/src/server/inbound/admin-http/routes/workspace/delete.ts` | 122 | tovu-dep | K1 | `RT-K1-adm-workspace-1` |
| `apps/website/src/server/inbound/admin-http/routes/workspace/deps.ts` | 18 | tovu-dep | K1 | `RT-K1-adm-workspace-1` |
| `apps/website/src/server/inbound/admin-http/routes/workspace/get.ts` | 42 | tovu-dep | K1 | `RT-K1-adm-workspace-1` |
| `apps/website/src/server/inbound/admin-http/routes/workspace/list.ts` | 36 | tovu-dep | K1 | `RT-K1-adm-workspace-2` |
| `apps/website/src/server/inbound/admin-http/routes/workspace/update.ts` | 72 | tovu-dep | K1 | `RT-K1-adm-workspace-2` |

## agent-plugins (53)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/agent-plugins/access-token-tool.ts` | 133 | tovu-dep | K3 K5j K4j | `K5-agent-plugins-8` |
| `apps/website/src/features/agent-plugins/activation-effects.ts` | 41 | via `features/agent-plugins/lifecycle.ts` | verbatim | `K5-agent-plugins-5` |
| `apps/website/src/features/agent-plugins/admin-surfaces/delivery-bindings.ts` | 226 | xp3 | K4j K5j | `K5-agent-plugins-1` |
| `apps/website/src/features/agent-plugins/admin-surfaces/handlers.ts` | 71 | via `features/agent-plugins/admin-surfaces/surfaces.ts` | verbatim | `K5-agent-plugins-5` |
| `apps/website/src/features/agent-plugins/admin-surfaces/issued-sign-ins.ts` | 15 | tovu-dep | K3 | `K5-agent-plugins-1` |
| `apps/website/src/features/agent-plugins/admin-surfaces/surfaces.ts` | 120 | via `features/agent-plugins/lifecycle.ts` | verbatim | `K5-agent-plugins-5` |
| `apps/website/src/features/agent-plugins/analytics-provider-registry.ts` | 135 | xp3 | K5j | `K5-agent-plugins-5` |
| `apps/website/src/features/agent-plugins/apply-connect-defaults.ts` | 79 | via `features/agent-plugins/enable-access.ts` | verbatim | `K5-agent-plugins-7` |
| `apps/website/src/features/agent-plugins/apply-tool-renames.ts` | 37 | via `features/agent-plugins/service-ports.ts` | verbatim | `K5-agent-plugins-8` |
| `apps/website/src/features/agent-plugins/auth-schemes.ts` | 124 | xp3 | K5j K4j | `K5-agent-plugins-5` |
| `apps/website/src/features/agent-plugins/automatic-agent-plugins.ts` | 231 | xp3 | K4j | `K5-agent-plugins-8` |
| `apps/website/src/features/agent-plugins/bundled-contribution-sources.ts` | 18 | via `features/agent-plugins/lifecycle.ts` | verbatim | `K5-agent-plugins-5` |
| `apps/website/src/features/agent-plugins/capability-projection.ts` | 138 | via `features/agent-plugins/lifecycle.ts` | verbatim | `K5-agent-plugins-5` |
| `apps/website/src/features/agent-plugins/card-host-bindings.ts` | 15 | xp3 | K5j | `K5-agent-plugins-1` |
| `apps/website/src/features/agent-plugins/connect-card-ui.ts` | 36 | via `features/agent-plugins/service-ports.ts` | verbatim | `K5-agent-plugins-6` |
| `apps/website/src/features/agent-plugins/connect-destination.ts` | 22 | xp3 | K4j | `K5-agent-plugins-1` |
| `apps/website/src/features/agent-plugins/connect-sign-in-wait.ts` | 36 | xp3 | K4j | `K5-agent-plugins-7` |
| `apps/website/src/features/agent-plugins/connect-tool.ts` | 211 | xp3 | K4j K4x | `K5-agent-plugins-7` |
| `apps/website/src/features/agent-plugins/connection-status.ts` | 16 | via `features/agent-plugins/mcp-host-bindings.ts` | verbatim | `K5-agent-plugins-7` |
| `apps/website/src/features/agent-plugins/customize-tool.ts` | 47 | via `features/agent-plugins/lifecycle.ts` | verbatim | `K5-agent-plugins-8` |
| `apps/website/src/features/agent-plugins/enable-access.ts` | 35 | via `features/agent-plugins/mcp-host-bindings.ts` | verbatim | `K5-agent-plugins-7` |
| `apps/website/src/features/agent-plugins/executable-tools/host-bindings.ts` | 96 | xp3 | K5j | `K5-agent-plugins-6` |
| `apps/website/src/features/agent-plugins/executable-tools/register.ts` | 10 | via `features/agent-plugins/executable-tools/host-bindings.ts` | verbatim | `K5-agent-plugins-7` |
| `apps/website/src/features/agent-plugins/exports/diagnostics.ts` | 56 | via `features/agent-plugins/exports/source.ts` | verbatim | `K5-agent-plugins-6` |
| `apps/website/src/features/agent-plugins/exports/runtime.ts` | 219 | xp3 | K5j K4j | `K5-agent-plugins-6` |
| `apps/website/src/features/agent-plugins/exports/source.ts` | 74 | via `features/agent-plugins/lifecycle.ts` | verbatim | `K5-agent-plugins-5` |
| `apps/website/src/features/agent-plugins/federate-mcp.ts` | 68 | via `features/agent-plugins/mcp-host-bindings.ts` | verbatim | `K5-agent-plugins-7` |
| `apps/website/src/features/agent-plugins/grant-signed-in-defaults.ts` | 64 | via `features/agent-plugins/enable-access.ts` | verbatim | `K5-agent-plugins-8` |
| `apps/website/src/features/agent-plugins/host-plugin-guidance.ts` | 267 | tovu-dep | K5 | `K5-agent-plugins-1` |
| `apps/website/src/features/agent-plugins/host-signals.ts` | 96 | tovu-dep | K3 | `K5-agent-plugins-6` |
| `apps/website/src/features/agent-plugins/host-tool-ports.ts` | 71 | tovu-dep | K5 | `K5-agent-plugins-6` |
| `apps/website/src/features/agent-plugins/import-access-token.ts` | 62 | via `features/agent-plugins/access-token-tool.ts` | verbatim | `K5-agent-plugins-8` |
| `apps/website/src/features/agent-plugins/install-tool.ts` | 250 | xp3 | K5j | `K5-agent-plugins-8` |
| `apps/website/src/features/agent-plugins/install-upload.ts` | 387 | tovu-dep | K3 | `K5-agent-plugins-6` |
| `apps/website/src/features/agent-plugins/layout.ts` | 110 | via `features/agent-plugins/service-ports.ts` | verbatim | `V-agent-plugins-2` |
| `apps/website/src/features/agent-plugins/lifecycle.ts` | 344 | xp3 | K4j K5j | `K5-agent-plugins-4` |
| `apps/website/src/features/agent-plugins/mail-adapter-registry.ts` | 41 | xp3 | K5j | `K5-agent-plugins-6` |
| `apps/website/src/features/agent-plugins/mcp-host-bindings.ts` | 45 | tovu-dep | K5j K5 | `K5-agent-plugins-7` |
| `apps/website/src/features/agent-plugins/memory-tools.ts` | 18 | via `contracts/headless/assistant-tool-approval-policy.ts` | verbatim | `K5-agent-plugins-7` |
| `apps/website/src/features/agent-plugins/memory.ts` | 72 | tovu-dep | K3 K5j | `K5-agent-plugins-3` |
| `apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts` | 139 | via `features/agent-plugins/service-ports.ts` | verbatim | `K5-agent-plugins-8` |
| `apps/website/src/features/agent-plugins/provider-plugin-link.ts` | 132 | xp3 | K4j | `K5-agent-plugins-6` |
| `apps/website/src/features/agent-plugins/search-provider-registry.ts` | 54 | xp3 | K4j K5j | `K5-agent-plugins-5` |
| `apps/website/src/features/agent-plugins/service-ports.ts` | 62 | xp3 | K4x K4j | `K5-agent-plugins-6` |
| `apps/website/src/features/agent-plugins/set-enabled.ts` | 94 | via `contracts/core/tool-access-change.ts` | verbatim | `K5-agent-plugins-7` |
| `apps/website/src/features/agent-plugins/supersession.ts` | 142 | via `features/agent-plugins/service-ports.ts` | verbatim | `K5-agent-plugins-1` |
| `apps/website/src/features/agent-plugins/switch-on-saved-token.ts` | 56 | via `features/agent-plugins/mcp-host-bindings.ts` | verbatim | `K5-agent-plugins-8` |
| `apps/website/src/features/agent-plugins/token-sign-in.ts` | 32 | via `features/agent-plugins/service-ports.ts` | verbatim | `K5-agent-plugins-8` |
| `apps/website/src/features/agent-plugins/tool-registrations.ts` | 176 | xp3 | K5j K4j | `K5-agent-plugins-8` |
| `apps/website/src/features/agent-plugins/uninstall-confirmation-ui.ts` | 57 | via `contracts/core/human-confirm.ts` | verbatim | `K5-agent-plugins-5` |
| `apps/website/src/features/agent-plugins/uninstall-tool.ts` | 272 | xp3 | K5j K4j | `K5-agent-plugins-7` |
| `apps/website/src/features/agent-plugins/update-effects.ts` | 77 | via `features/agent-plugins/federate-mcp.ts` | verbatim | `K5-agent-plugins-7` |
| `apps/website/src/features/agent-plugins/write-note-tool.ts` | 29 | xp3 | K5j K4j | `K5-agent-plugins-8` |

## analytics (7)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/analytics/config.settings.ts` | 224 | xp3 | K5x | `K5-analytics-1` |
| `apps/website/src/features/analytics/contracts.ts` | 17 | xp3 | K4j | `K5-analytics-1` |
| `apps/website/src/features/analytics/forwarding.ts` | 123 | via `contracts/core/model-facing-tool-errors.ts` | verbatim | `K5-analytics-1` |
| `apps/website/src/features/analytics/index.ts` | 58 | via `features/analytics/contracts.ts` | verbatim | `K5-analytics-1` |
| `apps/website/src/features/analytics/jini-adapters.ts` | 114 | via `features/analytics/contracts.ts` | verbatim | `K5-analytics-1` |
| `apps/website/src/features/analytics/salt.ts` | 62 | via `features/analytics/jini-adapters.ts` | verbatim | `K5-analytics-1` |
| `apps/website/src/features/analytics/tool-registrations.ts` | 74 | xp3 | K5j | `K5-analytics-1` |

## api-connections (17)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/api-connections/browser-binding.ts` | 70 | via `features/api-connections/oauth-bindings.ts` | verbatim | `K5-api-connections-1` |
| `apps/website/src/features/api-connections/budgets.ts` | 37 | via `contracts/core/rate-limit/rate-limit.ts` | verbatim | `K5-api-connections-1` |
| `apps/website/src/features/api-connections/byo-client.ts` | 37 | via `features/custom-credentials/index.ts` | verbatim | `K5-api-connections-2` |
| `apps/website/src/features/api-connections/connect-bindings.ts` | 12 | via `features/api-connections/browser-binding.ts` | verbatim | `K5-api-connections-1` |
| `apps/website/src/features/api-connections/connect.ts` | 17 | via `features/api-connections/host.ts` | verbatim | `K5-api-connections-2` |
| `apps/website/src/features/api-connections/contribution.ts` | 87 | xp3 | K5x | `K5-api-connections-1` |
| `apps/website/src/features/api-connections/form-delivery-connection.ts` | 120 | xp3 | K5j K4j | `K5-api-connections-2` |
| `apps/website/src/features/api-connections/host-bindings.ts` | 86 | xp3 | K5j K4x | `K5-api-connections-2` |
| `apps/website/src/features/api-connections/host.ts` | 15 | via `features/api-connections/host-bindings.ts` | verbatim | `K5-api-connections-2` |
| `apps/website/src/features/api-connections/oauth-bindings.ts` | 20 | xp3 | K5j | `K5-api-connections-1` |
| `apps/website/src/features/api-connections/plugin-state-bindings.ts` | 15 | tovu-dep | K4j K5 | `K5-api-connections-1` |
| `apps/website/src/features/api-connections/plugin-state.ts` | 12 | xp3 | K5j K4j | `K5-api-connections-1` |
| `apps/website/src/features/api-connections/shared-api.ts` | 150 | xp3 | K4x | `K5-api-connections-2` |
| `apps/website/src/features/api-connections/shared-owner.ts` | 93 | tovu-dep | K4j K5 | `K5-api-connections-1` |
| `apps/website/src/features/api-connections/surface-connection-bindings.ts` | 45 | xp3 | K4j K5j | `K5-api-connections-2` |
| `apps/website/src/features/api-connections/surface-connections.ts` | 15 | xp3 | K5j K4j | `K5-api-connections-2` |
| `apps/website/src/features/api-connections/vault-stores.ts` | 256 | tovu-dep | K5j K5 | `K5-api-connections-1` |

## asset-transfer (3)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/asset-transfer/asset-destinations.ts` | 136 | via `contracts/core/human-confirm.ts` | verbatim | `K4-asset-transfer-1` |
| `apps/website/src/features/asset-transfer/asset-sources.ts` | 66 | via `contracts/core/human-confirm.ts` | verbatim | `K4-asset-transfer-1` |
| `apps/website/src/features/asset-transfer/copy-tool.ts` | 169 | xp3 | K4j | `K4-asset-transfer-1` |

## change-sets (1)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/change-sets/tool-registrations.ts` | 202 | via `contracts/core/commands/index.ts` | verbatim | `V-change-sets-1` |

## comments (9)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/comments/builtin-provider.ts` | 124 | xp3 | K4j | `K5-comments-1` |
| `apps/website/src/features/comments/data-module-install.ts` | 21 | xp3 | K5j | `K5-comments-1` |
| `apps/website/src/features/comments/index.ts` | 64 | xp3 | K5j | `K5-comments-1` |
| `apps/website/src/features/comments/provider-selection.ts` | 113 | xp3 | K4j K5j | `K5-comments-1` |
| `apps/website/src/features/comments/public-markers.ts` | 36 | xp3 | K4j | `K5-comments-1` |
| `apps/website/src/features/comments/repo.sqlite.ts` | 23 | tovu-dep | K5 K4db | `K5-comments-1` |
| `apps/website/src/features/comments/settings.ts` | 279 | xp3 | K4j | `K5-comments-1` |
| `apps/website/src/features/comments/tool-registrations.ts` | 94 | xp3 | K4j K5j | `K5-comments-2` |
| `apps/website/src/features/comments/types.ts` | 69 | xp3 | K4j | `K5-comments-1` |

## consent (7)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/consent/ensure-privacy-defaults.ts` | 54 | xp3 | K5x | `K5-consent-1` |
| `apps/website/src/features/consent/region-plugins.ts` | 91 | tovu-dep | K3 K4x | `K5-consent-1` |
| `apps/website/src/features/consent/request.ts` | 27 | xp3 | K5x | `K5-consent-1` |
| `apps/website/src/features/consent/revisions.repo.ts` | 52 | xp3 | K4j | `K5-consent-1` |
| `apps/website/src/features/consent/service.ts` | 219 | tovu-dep | K5j K3 K5 | `K5-consent-1` |
| `apps/website/src/features/consent/settings.ts` | 106 | tovu-dep | K3 | `K5-consent-1` |
| `apps/website/src/features/consent/tool-registrations.ts` | 74 | xp3 | K4j | `K5-consent-1` |

## content-duplication (1)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/content-duplication/tool-registrations.ts` | 195 | tovu-dep | K4 | `K4-content-duplication-1` |

## content-types (2)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/content-types/publish-content.ts` | 86 | tovu-dep | K4 | `K5-content-types-1` |
| `apps/website/src/features/content-types/repo.sqlite.ts` | 21 | tovu-dep | K5 K4db | `K5-content-types-1` |

## contracts-core (35)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/contracts/core/admin-locales.ts` | 2 | tovu-dep | — | STAYS: K3: imports product copy and has no args object to carry it (owner K3: stays) |
| `apps/website/src/contracts/core/agent-permission-mode.ts` | 43 | tovu-dep | K5 K3 | `K5-contracts-core-1` |
| `apps/website/src/contracts/core/assistant-run-events.ts` | 64 | xp3 | K5j K4j | `K5-contracts-core-1` |
| `apps/website/src/contracts/core/chat-delete-grant.ts` | 30 | xp3 | K4j | `K5-contracts-core-10` |
| `apps/website/src/contracts/core/commands/appliers.ts` | 7 | xp3 | K5j K4j | `K5-contracts-core-1` |
| `apps/website/src/contracts/core/commands/index.ts` | 3 | xp3 | K5j | `K5-contracts-core-6` |
| `apps/website/src/contracts/core/credential-token.ts` | 10 | tovu-dep | K5j K3 | `K5-contracts-core-1` |
| `apps/website/src/contracts/core/declared-content-type-owners.ts` | 28 | xp3 | K5j | `K5-contracts-core-1` |
| `apps/website/src/contracts/core/entry-refs/extractor.ts` | 19 | xp3 | K5j | `K5-contracts-core-1` |
| `apps/website/src/contracts/core/events/enqueue-only-outbox.ts` | 34 | xp3 | K5j | `K5-contracts-core-7` |
| `apps/website/src/contracts/core/events/index.ts` | 8 | via `contracts/core/events/memory-bus.ts` | verbatim | `V-contracts-core-9` |
| `apps/website/src/contracts/core/events/jini-outbox-adapter.ts` | 60 | xp3 | K5j | `K5-contracts-core-1` |
| `apps/website/src/contracts/core/events/memory-bus.ts` | 162 | via `contracts/core/events/outbox-worker.ts` | verbatim | `K5-contracts-core-8` |
| `apps/website/src/contracts/core/events/outbox-drainer.ts` | 74 | xp3 | K5j K4j | `K5-contracts-core-7` |
| `apps/website/src/contracts/core/events/outbox-retry-policies.ts` | 24 | xp3 | K5j K4j | `K5-contracts-core-2` |
| `apps/website/src/contracts/core/events/outbox-worker.ts` | 99 | xp3 | K5j | `K5-contracts-core-7` |
| `apps/website/src/contracts/core/export-report.ts` | 16 | xp3 | K4j | `K5-contracts-core-2` |
| `apps/website/src/contracts/core/human-confirm.ts` | 320 | xp3 | K5j K4j K5 | `K5-contracts-core-10` |
| `apps/website/src/contracts/core/index.ts` | 7 | xp3 | K5j | `K5-contracts-core-10` |
| `apps/website/src/contracts/core/model-facing-tool-errors.ts` | 62 | xp3 | K5j | `K5-contracts-core-2` |
| `apps/website/src/contracts/core/native-approval-memory.ts` | 37 | tovu-dep | K4 | `K5-contracts-core-2` |
| `apps/website/src/contracts/core/operation-lock.ts` | 7 | xp3 | K5j K4j | `K5-contracts-core-2` |
| `apps/website/src/contracts/core/operator-locale.ts` | 42 | via `contracts/headless/index.ts` | verbatim | `K5-contracts-core-10` |
| `apps/website/src/contracts/core/page-html.ts` | 152 | xp3 | K5j | `K5-contracts-core-2` |
| `apps/website/src/contracts/core/plugin-credential-card.ts` | 12 | xp3 | K5j K4j | `K5-contracts-core-2` |
| `apps/website/src/contracts/core/plugin-hook-failed-error.ts` | 71 | xp3 | K5j | `K5-contracts-core-2` |
| `apps/website/src/contracts/core/post-kind.ts` | 11 | xp3 | K4j | `K5-contracts-core-3` |
| `apps/website/src/contracts/core/rate-limit/rate-limit.ts` | 223 | xp3 | K5j K4j | `K5-contracts-core-3` |
| `apps/website/src/contracts/core/secret-redaction.ts` | 2 | tovu-dep | — | STAYS: K3: imports product copy and has no args object to carry it (owner K3: stays) |
| `apps/website/src/contracts/core/secret-scan.ts` | 28 | xp3 | K5j | `K5-contracts-core-3` |
| `apps/website/src/contracts/core/system-content-types.ts` | 7 | xp3 | K5j | `K5-contracts-core-3` |
| `apps/website/src/contracts/core/tool-access-change.ts` | 12 | xp3 | K4j | `K5-contracts-core-3` |
| `apps/website/src/contracts/core/tool-failure-diagnostics.ts` | 11 | xp3 | K5j K4j | `K5-contracts-core-7` |
| `apps/website/src/contracts/core/tool-metadata/assistant.ts` | 59 | xp3 | K5j K4 | `K5-contracts-core-4` |
| `apps/website/src/contracts/core/tool-metadata/index.ts` | 132 | xp3 | K4 K5x K5 | `K5-contracts-core-8` |

## contracts-headless (8)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/contracts/headless/assistant-tool-approval-policy.ts` | 63 | via `contracts/core/tool-metadata/index.ts` | K4 | `K4-contracts-headless-1` |
| `apps/website/src/contracts/headless/form-delivery-status.ts` | 25 | xp3 | K4j | `K4-contracts-headless-1` |
| `apps/website/src/contracts/headless/index.ts` | 19 | via `contracts/headless/plugin-export-catalog.ts` | K4 K5 | `K5-contracts-headless-2` |
| `apps/website/src/contracts/headless/operator-locale.ts` | 8 | via `contracts/headless/plugin-host.ts` | verbatim | `K4-contracts-headless-1` |
| `apps/website/src/contracts/headless/plugin-export-catalog.ts` | 21 | xp3 | K4j | `K4-contracts-headless-1` |
| `apps/website/src/contracts/headless/plugin-host.ts` | 97 | xp3 | K4j | `K4-contracts-headless-1` |
| `apps/website/src/contracts/headless/secret-form-cards.ts` | 12 | via `contracts/core/tool-metadata/index.ts` | verbatim | `K4-contracts-headless-1` |
| `apps/website/src/contracts/headless/site-cookie-consent.ts` | 25 | xp3 | K4j | `K4-contracts-headless-1` |

## custom-credentials (20)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/custom-credentials/agent-tools.ts` | 191 | via `features/custom-credentials/write-files-validation.ts` | verbatim | `K5-custom-credentials-2` |
| `apps/website/src/features/custom-credentials/card-token.ts` | 36 | via `features/custom-credentials/store.ts` | verbatim | `K5-custom-credentials-1` |
| `apps/website/src/features/custom-credentials/credential-copy-tool.ts` | 71 | tovu-dep | K5j K4j K4x K5 | `K5-custom-credentials-2` |
| `apps/website/src/features/custom-credentials/credential-ports.ts` | 57 | tovu-dep | K5 | `K5-custom-credentials-2` |
| `apps/website/src/features/custom-credentials/credential-recovery.ts` | 30 | via `contracts/core/tool-failure-diagnostics.ts` | verbatim | `K5-custom-credentials-1` |
| `apps/website/src/features/custom-credentials/credential-save-tool.ts` | 13 | xp3 | K5j K5 K4j | `K5-custom-credentials-3` |
| `apps/website/src/features/custom-credentials/credentialed-request.ts` | 769 | tovu-dep | K5 | `K5-custom-credentials-1` |
| `apps/website/src/features/custom-credentials/custom-credential-create-ui.ts` | 189 | xp3 | K5j K4j K5 | `K5-custom-credentials-1` |
| `apps/website/src/features/custom-credentials/custom-credential-repo.sqlite.ts` | 11 | via `features/custom-credentials/custom-credential-repo.ts` | verbatim | `K5-custom-credentials-3` |
| `apps/website/src/features/custom-credentials/custom-credential-repo.ts` | 21 | tovu-dep | K5j K4j K4db | `K5-custom-credentials-2` |
| `apps/website/src/features/custom-credentials/custom-credential-set-token-ui.ts` | 110 | xp3 | K4j | `K5-custom-credentials-3` |
| `apps/website/src/features/custom-credentials/delete-request-confirmation-ui.ts` | 41 | via `contracts/core/human-confirm.ts` | verbatim | `K5-custom-credentials-3` |
| `apps/website/src/features/custom-credentials/index.ts` | 54 | via `features/custom-credentials/store.ts` | K5 | `K5-custom-credentials-3` |
| `apps/website/src/features/custom-credentials/plugin-credential-card.ts` | 7 | xp3 | K5j K4j | `K5-custom-credentials-1` |
| `apps/website/src/features/custom-credentials/provider-settings-card.ts` | 191 | xp3 | K4x K5j K4j | `K5-custom-credentials-3` |
| `apps/website/src/features/custom-credentials/repo.memory.ts` | 8 | xp3 | K5j | `K5-custom-credentials-2` |
| `apps/website/src/features/custom-credentials/store.ts` | 136 | tovu-dep | K5 | `K5-custom-credentials-1` |
| `apps/website/src/features/custom-credentials/tool-registrations.ts` | 506 | tovu-dep | K5j K4x K3 K4j K4 K5 | `K5-custom-credentials-4` |
| `apps/website/src/features/custom-credentials/vault-repo.ts` | 39 | tovu-dep | K4x K4 K5 | `K5-custom-credentials-2` |
| `apps/website/src/features/custom-credentials/write-files-validation.ts` | 244 | xp3 | K4x K5j | `K5-custom-credentials-2` |

## database (3)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/database/adapter.sqlite.ts` | 78 | tovu-dep | K4db | `K5-database-1` |
| `apps/website/src/features/database/repo.memory.ts` | 218 | via `features/database/adapter.sqlite.ts` | K4 | `K5-database-1` |
| `apps/website/src/features/database/tool-registrations.ts` | 281 | xp3 | K5j K5 K4 | `K5-database-1` |

## database-transfer (6)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/database-transfer/confirmation-ui.ts` | 46 | via `contracts/core/human-confirm.ts` | verbatim | `K5-database-transfer-1` |
| `apps/website/src/features/database-transfer/destination-exchange.ts` | 50 | tovu-dep | K5j K3 | `K5-database-transfer-1` |
| `apps/website/src/features/database-transfer/destination-repo.ts` | 11 | tovu-dep | K4db | `K5-database-transfer-1` |
| `apps/website/src/features/database-transfer/destination-store.ts` | 148 | tovu-dep | K5j K4j K5 K5x | `K5-database-transfer-1` |
| `apps/website/src/features/database-transfer/destination-ui.ts` | 60 | xp3 | K5j K4j | `K5-database-transfer-1` |
| `apps/website/src/features/database-transfer/tool-registrations.ts` | 128 | tovu-dep | K5j K4 K4db | `K5-database-transfer-2` |

## deployments (36)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/deployments/capability-card.ts` | 35 | xp3 | K4j | `K5-deployments-1` |
| `apps/website/src/features/deployments/contracts.ts` | 8 | via `features/deployments/deploy-targets/types.ts` | verbatim | `K5-deployments-1` |
| `apps/website/src/features/deployments/deploy-config-registry.ts` | 175 | xp3 | K5x | `K5-deployments-3` |
| `apps/website/src/features/deployments/deploy-config.ts` | 319 | tovu-dep | K5 | `K5-deployments-1` |
| `apps/website/src/features/deployments/deploy-ops/agent-tools.ts` | 81 | tovu-dep | K5 | `K5-deployments-4` |
| `apps/website/src/features/deployments/deploy-ops/registry.ts` | 113 | tovu-dep | K3 K5 K5x | `K5-deployments-3` |
| `apps/website/src/features/deployments/deploy-ops/run-ops.ts` | 98 | xp3 | K5 K5x | `K5-deployments-2` |
| `apps/website/src/features/deployments/deploy-ops/secrets.ts` | 9 | via `features/deployments/deploy-ops/run-ops.ts` | verbatim | `K5-deployments-2` |
| `apps/website/src/features/deployments/deploy-ops/tool-registrations.ts` | 66 | xp3 | K5x | `K5-deployments-4` |
| `apps/website/src/features/deployments/deploy-ops/typed-secret-card.ts` | 25 | tovu-dep | K3 K5j | `K5-deployments-2` |
| `apps/website/src/features/deployments/deploy-targets/host-kit.ts` | 155 | xp3 | K5j | `K5-deployments-1` |
| `apps/website/src/features/deployments/deploy-targets/registry.ts` | 164 | xp3 | K5x K4j | `K5-deployments-3` |
| `apps/website/src/features/deployments/deploy-targets/types.ts` | 51 | xp3 | K4j | `K5-deployments-1` |
| `apps/website/src/features/deployments/export-run.ts` | 277 | xp3 | K4j | `K5-deployments-1` |
| `apps/website/src/features/deployments/index.ts` | 92 | via `features/deployments/ports.ts` | verbatim | `K5-deployments-4` |
| `apps/website/src/features/deployments/ports.ts` | 126 | tovu-dep | K4 | `K5-deployments-1` |
| `apps/website/src/features/deployments/publish-agent-tools.ts` | 1219 | tovu-dep | K5x K4 K5j K4j K3 K4x | `K5-deployments-7` |
| `apps/website/src/features/deployments/publish-credentials/account-label-heal-scheduler.ts` | 129 | via `features/deployments/publish-credentials/types.ts` | verbatim | `K5-deployments-2` |
| `apps/website/src/features/deployments/publish-credentials/compatibility-port.ts` | 28 | via `features/deployments/contracts.ts` | verbatim | `K5-deployments-4` |
| `apps/website/src/features/deployments/publish-credentials/index.ts` | 46 | via `features/deployments/publish-credentials/types.ts` | verbatim | `K5-deployments-4` |
| `apps/website/src/features/deployments/publish-credentials/repo.memory.ts` | 2 | xp3 | K5x | `K5-deployments-2` |
| `apps/website/src/features/deployments/publish-credentials/store.ts` | 732 | tovu-dep | K5j K5 K4j K5x K4x | `K5-deployments-4` |
| `apps/website/src/features/deployments/publish-credentials/types.ts` | 91 | xp3 | K4j | `K5-deployments-1` |
| `apps/website/src/features/deployments/publish-tool-deps.ts` | 88 | xp3 | K4x K4 K4j K5j | `K5-deployments-5` |
| `apps/website/src/features/deployments/static-publish/adapter.ts` | 697 | xp3 | K5x K5j K4j K5 | `K5-deployments-5` |
| `apps/website/src/features/deployments/static-publish/credentials.ts` | 349 | xp3 | K4j K4x | `K5-deployments-4` |
| `apps/website/src/features/deployments/static-publish/domain-publish-rows.ts` | 48 | via `features/deployments/deploy-targets/types.ts` | verbatim | `K5-deployments-1` |
| `apps/website/src/features/deployments/static-publish/domain-publish-tool.ts` | 130 | xp3 | K5j K4j K5 | `K5-deployments-6` |
| `apps/website/src/features/deployments/static-publish/index.ts` | 58 | via `features/deployments/static-publish/types.ts` | verbatim | `K5-deployments-5` |
| `apps/website/src/features/deployments/static-publish/inspection.ts` | 79 | xp3 | K4j | `K5-deployments-5` |
| `apps/website/src/features/deployments/static-publish/publish-consent.ts` | 12 | via `features/deployments/publish-tool-deps.ts` | K5 | `K5-deployments-6` |
| `apps/website/src/features/deployments/static-publish/publish-history.ts` | 305 | xp3 | K5 K4x | `K5-deployments-2` |
| `apps/website/src/features/deployments/static-publish/publish-run.ts` | 290 | tovu-dep | K3 | `K5-deployments-5` |
| `apps/website/src/features/deployments/static-publish/types.ts` | 155 | via `features/deployments/deploy-targets/types.ts` | verbatim | `K5-deployments-2` |
| `apps/website/src/features/deployments/static-publish/verify.ts` | 358 | tovu-dep | K5j K3 K4j K4x | `K5-deployments-5` |
| `apps/website/src/features/deployments/tool-registrations.ts` | 199 | xp3 | K4j K5j | `K5-deployments-2` |

## desktop (5)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/desktop/src/app-version-ipc.ts` | 53 | tovu-dep | K5j K5 | `K5-desktop-1` |
| `apps/desktop/src/asar-verify.ts` | 133 | xp3 | K5j K4j | `K5-desktop-1` |
| `apps/desktop/src/desktop-memory-sampler.ts` | 55 | tovu-dep | K4j K4 | `K5-desktop-1` |
| `apps/desktop/src/durable-json-file.ts` | 57 | xp3 | K5j K4j | `K5-desktop-1` |
| `apps/desktop/src/find-in-page-ipc.ts` | 74 | tovu-dep | K5 | `K5-desktop-1` |

## domain-dns (8)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/domain-dns/binding.repo.ts` | 90 | xp3 | K4j | `K5-domain-dns-1` |
| `apps/website/src/features/domain-dns/dns-changes.ts` | 379 | via `features/domain-dns/binding.repo.ts` | verbatim | `K5-domain-dns-1` |
| `apps/website/src/features/domain-dns/dns-tools.ts` | 230 | xp3 | K5j | `K5-domain-dns-1` |
| `apps/website/src/features/domain-dns/index.ts` | 15 | via `features/domain-dns/tools.ts` | verbatim | `K5-domain-dns-1` |
| `apps/website/src/features/domain-dns/mail-dns-status.ts` | 293 | xp3 | K4x | `K5-domain-dns-1` |
| `apps/website/src/features/domain-dns/mail-dns-tools.ts` | 69 | xp3 | K5j | `K5-domain-dns-1` |
| `apps/website/src/features/domain-dns/tool-deps.ts` | 23 | xp3 | K4x | `K5-domain-dns-1` |
| `apps/website/src/features/domain-dns/tools.ts` | 170 | xp3 | K5j K4j | `K5-domain-dns-1` |

## email-templates (4)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/email-templates/agent-tools.ts` | 73 | xp3 | K5x | `K5-email-templates-1` |
| `apps/website/src/features/email-templates/index.ts` | 13 | via `features/email-templates/operations.ts` | verbatim | `K5-email-templates-1` |
| `apps/website/src/features/email-templates/operations.ts` | 143 | xp3 | K5j K4x K5x | `K5-email-templates-1` |
| `apps/website/src/features/email-templates/tool-registrations.ts` | 90 | xp3 | K5j K5x | `K5-email-templates-1` |

## entries (5)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/entries/public-list.ts` | 368 | via `contracts/core/system-content-types.ts` | verbatim | `K5-entries-1` |
| `apps/website/src/features/entries/public-read.ts` | 4 | via `features/entries/public-list.ts` | verbatim | `K5-entries-1` |
| `apps/website/src/features/entries/publish-content.ts` | 178 | tovu-dep | K4 | `K5-entries-1` |
| `apps/website/src/features/entries/repo.sqlite.ts` | 31 | tovu-dep | K5j K5 K4db | `K5-entries-1` |
| `apps/website/src/features/entries/unreadable-owner-entries-repair.ts` | 210 | tovu-dep | K5 K4db | `K5-entries-1` |

## external-mcp (15)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/external-mcp/contracts.ts` | 24 | xp3 | K4j | `K5-external-mcp-1` |
| `apps/website/src/features/external-mcp/deps.ts` | 79 | xp3 | K4j | `K5-external-mcp-3` |
| `apps/website/src/features/external-mcp/external-mcp-admissions.ts` | 36 | via `contracts/core/model-facing-tool-errors.ts` | verbatim | `K5-external-mcp-3` |
| `apps/website/src/features/external-mcp/external-mcp-oauth.ts` | 173 | tovu-dep | K5 K5x K5j | `K5-external-mcp-2` |
| `apps/website/src/features/external-mcp/external-mcp-probe.ts` | 98 | tovu-dep | K3 K5 | `K5-external-mcp-3` |
| `apps/website/src/features/external-mcp/external-mcp-repo.sqlite.ts` | 16 | tovu-dep | K5 K4db | `K5-external-mcp-3` |
| `apps/website/src/features/external-mcp/external-mcp-repo.ts` | 243 | tovu-dep | K5j K4j K4db | `K5-external-mcp-3` |
| `apps/website/src/features/external-mcp/external-mcp-repo.writes.ts` | 134 | tovu-dep | K4j K4db | `K5-external-mcp-1` |
| `apps/website/src/features/external-mcp/external-mcp-revocation.ts` | 39 | via `features/external-mcp/contracts.ts` | verbatim | `K5-external-mcp-1` |
| `apps/website/src/features/external-mcp/external-mcp-store.memory.ts` | 11 | via `features/external-mcp/external-mcp-vault.ts` | verbatim | `K5-external-mcp-1` |
| `apps/website/src/features/external-mcp/external-mcp-store.ts` | 75 | xp3 | K5j K4j | `K5-external-mcp-2` |
| `apps/website/src/features/external-mcp/external-mcp-vault.ts` | 52 | tovu-dep | K5j K4j K5 | `K5-external-mcp-1` |
| `apps/website/src/features/external-mcp/operations-tools.ts` | 109 | xp3 | K5j | `K5-external-mcp-3` |
| `apps/website/src/features/external-mcp/save-form.ts` | 308 | xp3 | K4j | `K5-external-mcp-3` |
| `apps/website/src/features/external-mcp/tool-registrations.ts` | 794 | tovu-dep | K5j K3 K5 | `K5-external-mcp-4` |

## form-destinations (7)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/form-destinations/connection-port.ts` | 37 | xp3 | K5x | `K5-form-destinations-1` |
| `apps/website/src/features/form-destinations/deliver.ts` | 71 | xp3 | K5j | `K5-form-destinations-1` |
| `apps/website/src/features/form-destinations/index.ts` | 13 | via `features/form-destinations/registry.ts` | verbatim | `K5-form-destinations-1` |
| `apps/website/src/features/form-destinations/key-store.ts` | 70 | xp3 | K5x | `K5-form-destinations-1` |
| `apps/website/src/features/form-destinations/port.ts` | 124 | xp3 | K5x | `K5-form-destinations-1` |
| `apps/website/src/features/form-destinations/registry.ts` | 57 | xp3 | K5x | `K5-form-destinations-1` |
| `apps/website/src/features/form-destinations/rewrite-actions.ts` | 51 | xp3 | K4j | `K5-form-destinations-1` |

## forms (13)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/forms/analytics-provenance.ts` | 3 | xp3 | K5j | `K5-forms-1` |
| `apps/website/src/features/forms/capability-card.ts` | 30 | xp3 | K4j | `K5-forms-1` |
| `apps/website/src/features/forms/delivery-status.ts` | 2 | via `contracts/headless/index.ts` | verbatim | `K5-forms-1` |
| `apps/website/src/features/forms/form-file-maintenance.ts` | 146 | tovu-dep | K4db | `K5-forms-1` |
| `apps/website/src/features/forms/form-file-purge.ts` | 94 | tovu-dep | K4db | `K5-forms-1` |
| `apps/website/src/features/forms/form-file-storage.ts` | 46 | via `features/media/index.ts` | verbatim | `K5-forms-1` |
| `apps/website/src/features/forms/index.ts` | 198 | via `features/forms/form-file-storage.ts` | verbatim | `K5-forms-1` |
| `apps/website/src/features/forms/protect-existing-files.ts` | 60 | tovu-dep | K4db | `K5-forms-1` |
| `apps/website/src/features/forms/publish-content.ts` | 83 | tovu-dep | K4 | `K5-forms-1` |
| `apps/website/src/features/forms/rate-limit-profile.ts` | 19 | via `contracts/core/rate-limit/rate-limit.ts` | verbatim | `K5-forms-1` |
| `apps/website/src/features/forms/repo.sqlite.ts` | 36 | tovu-dep | K5 K4db K5j | `K5-forms-1` |
| `apps/website/src/features/forms/submission-ip-expiry-sweep.ts` | 55 | tovu-dep | K4db | `K5-forms-1` |
| `apps/website/src/features/forms/tool-registrations.ts` | 123 | tovu-dep | K4 | `K5-forms-1` |

## fs-files (7)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/fs-files/agent-tools.ts` | 196 | via `features/fs-files/custom-root-permission.ts` | verbatim | `K5-fs-files-1` |
| `apps/website/src/features/fs-files/custom-root-permission.ts` | 89 | xp3 | K4x | `K5-fs-files-1` |
| `apps/website/src/features/fs-files/fs-files.ts` | 226 | xp3 | K5j | `K5-fs-files-1` |
| `apps/website/src/features/fs-files/layout.ts` | 160 | tovu-dep | K5 | `K5-fs-files-1` |
| `apps/website/src/features/fs-files/site-file-request.ts` | 87 | via `features/fs-files/fs-files.ts` | K5 | `K5-fs-files-1` |
| `apps/website/src/features/fs-files/tool-registrations.ts` | 230 | xp3 | K5j | `K5-fs-files-1` |
| `apps/website/src/features/fs-files/write-files.ts` | 140 | via `features/fs-files/fs-files.ts` | verbatim | `K5-fs-files-1` |

## identity (14)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/identity/default-credential-exposure.ts` | 165 | via `features/identity/wiring.ts` | verbatim | `K5-identity-2` |
| `apps/website/src/features/identity/mfa.repo.ts` | 57 | tovu-dep | K4db | `K5-identity-1` |
| `apps/website/src/features/identity/passkeys.repo.ts` | 35 | tovu-dep | K4db | `K5-identity-1` |
| `apps/website/src/features/identity/permission-list-tool.ts` | 51 | xp3 | K5j | `K5-identity-1` |
| `apps/website/src/features/identity/recovery-codes.repo.ts` | 35 | tovu-dep | K4db | `K5-identity-1` |
| `apps/website/src/features/identity/repo.assignments.ts` | 160 | tovu-dep | K4db | `K5-identity-1` |
| `apps/website/src/features/identity/repo.authentication.ts` | 188 | tovu-dep | K4db K5 | `K5-identity-1` |
| `apps/website/src/features/identity/repo.authorization.ts` | 210 | tovu-dep | K4db | `K5-identity-1` |
| `apps/website/src/features/identity/repo.sqlite.ts` | 91 | tovu-dep | K5 K4db | `K5-identity-2` |
| `apps/website/src/features/identity/repo.ts` | 168 | tovu-dep | K4db | `K5-identity-1` |
| `apps/website/src/features/identity/tool-registrations.ts` | 297 | xp3 | K5j | `K5-identity-2` |
| `apps/website/src/features/identity/user-purge.sqlite.ts` | 9 | via `features/identity/user-purge.ts` | verbatim | `K5-identity-2` |
| `apps/website/src/features/identity/user-purge.ts` | 93 | tovu-dep | K4db K4j | `K5-identity-1` |
| `apps/website/src/features/identity/wiring.ts` | 387 | tovu-dep | K4db K5 | `K5-identity-2` |

## image-transform (1)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/image-transform/tool.ts` | 94 | xp3 | K4j | `K4-image-transform-1` |

## mail (12)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/mail/activity.repo.ts` | 148 | xp3 | K4j | `K5-mail-1` |
| `apps/website/src/features/mail/attempts.repo.ts` | 38 | xp3 | K5j K4 | `K5-mail-1` |
| `apps/website/src/features/mail/capture.repo.ts` | 94 | xp3 | K4j | `K5-mail-1` |
| `apps/website/src/features/mail/feedback-inbox.repo.ts` | 34 | xp3 | K4j | `K5-mail-1` |
| `apps/website/src/features/mail/feedback-route.ts` | 78 | xp3 | K5j | `K5-mail-1` |
| `apps/website/src/features/mail/feedback-sources.ts` | 67 | xp3 | K4j K5x | `K5-mail-1` |
| `apps/website/src/features/mail/index.ts` | 12 | via `features/mail/ledger.repo.ts` | verbatim | `K5-mail-1` |
| `apps/website/src/features/mail/ledger.repo.ts` | 78 | xp3 | K4j | `K5-mail-1` |
| `apps/website/src/features/mail/retention.ts` | 46 | via `features/mail/ledger.repo.ts` | verbatim | `K5-mail-1` |
| `apps/website/src/features/mail/site-feedback-route.ts` | 29 | xp3 | K4x K4j | `K5-mail-1` |
| `apps/website/src/features/mail/suppression-admin.repo.ts` | 79 | xp3 | K4j | `K5-mail-1` |
| `apps/website/src/features/mail/suppression.repo.ts` | 38 | xp3 | K4j | `K5-mail-1` |

## mail-status (8)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/mail-status/delivery-tool-registrations.ts` | 105 | xp3 | K5j K4j | `K5-mail-status-1` |
| `apps/website/src/features/mail-status/domain-deps.ts` | 36 | xp3 | K4j | `K5-mail-status-1` |
| `apps/website/src/features/mail-status/feedback-setup.ts` | 109 | xp3 | K4x K5x K4j | `K5-mail-status-1` |
| `apps/website/src/features/mail-status/provider-operations.ts` | 168 | xp3 | K5x | `K5-mail-status-1` |
| `apps/website/src/features/mail-status/provider-tool-registrations.ts` | 131 | xp3 | K5j K4j K5x | `K5-mail-status-2` |
| `apps/website/src/features/mail-status/test-send.ts` | 259 | xp3 | K5j K4 | `K5-mail-status-1` |
| `apps/website/src/features/mail-status/tool-registrations.ts` | 143 | xp3 | K5j K4j | `K5-mail-status-2` |
| `apps/website/src/features/mail-status/use-readiness.ts` | 198 | xp3 | K5j K4j | `K5-mail-status-1` |

## media (22)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/media/analytics.ts` | 22 | xp3 | K4j | `K5-media-1` |
| `apps/website/src/features/media/contracts.ts` | 39 | xp3 | K4j | `K5-media-1` |
| `apps/website/src/features/media/document-archive.ts` | 38 | xp3 | K5j | `K5-media-1` |
| `apps/website/src/features/media/duplicate-asset.ts` | 286 | tovu-dep | K4 | `K5-media-1` |
| `apps/website/src/features/media/import-media-entity.ts` | 453 | via `features/media/index.ts` | verbatim | `K5-media-4` |
| `apps/website/src/features/media/index.ts` | 152 | via `features/media/provider-credential-store.ts` | verbatim | `V-media-3` |
| `apps/website/src/features/media/library-save-attachment.ts` | 86 | xp3 | K4j | `K5-media-1` |
| `apps/website/src/features/media/list-pending-chat-attachments.ts` | 116 | xp3 | K4j | `K5-media-1` |
| `apps/website/src/features/media/media-provider-credential-repo.sqlite.ts` | 10 | via `features/media/media-provider-credential-repo.ts` | verbatim | `K5-media-4` |
| `apps/website/src/features/media/media-provider-credential-repo.ts` | 22 | tovu-dep | K5j K4j K4db | `K5-media-1` |
| `apps/website/src/features/media/promote-chat-attachment.ts` | 214 | xp3 | K5j | `K5-media-1` |
| `apps/website/src/features/media/provider-credential-contracts.ts` | 113 | xp3 | K4x | `K5-media-1` |
| `apps/website/src/features/media/provider-credential-store.memory.ts` | 25 | xp3 | K5j | `K5-media-2` |
| `apps/website/src/features/media/provider-credential-store.ts` | 359 | tovu-dep | K5j K4x K4j K5 | `K5-media-2` |
| `apps/website/src/features/media/provider-credential-vault.ts` | 129 | tovu-dep | K5 | `K5-media-1` |
| `apps/website/src/features/media/public-urls.ts` | 2 | via `features/media/tool-registrations.ts` | verbatim | `K5-media-4` |
| `apps/website/src/features/media/publish-content.ts` | 288 | tovu-dep | K4 | `K5-media-4` |
| `apps/website/src/features/media/read-chat-attachment.ts` | 371 | xp3 | K5j | `K5-media-1` |
| `apps/website/src/features/media/tool-registrations.ts` | 264 | xp3 | K4j | `K5-media-4` |
| `apps/website/src/features/media/verify-published-media.ts` | 99 | tovu-dep | K4 | `K5-media-4` |
| `apps/website/src/features/media/view-image-tool.ts` | 222 | via `features/media/index.ts` | verbatim | `K5-media-4` |
| `apps/website/src/features/media/view-video-tool.ts` | 224 | xp3 | K5j | `K5-media-4` |

## media-generation (5)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/media-generation/agent-tools.ts` | 93 | xp3 | K5j | `K5-media-generation-1` |
| `apps/website/src/features/media-generation/media-provider-registry.ts` | 161 | xp3 | K5j K4x | `K5-media-generation-1` |
| `apps/website/src/features/media-generation/provider-credential-save.ts` | 36 | xp3 | K4j | `K5-media-generation-1` |
| `apps/website/src/features/media-generation/providers-tools.ts` | 218 | tovu-dep | K5j K3 K4j | `K5-media-generation-1` |
| `apps/website/src/features/media-generation/tool-registrations.ts` | 496 | xp3 | K4j K5j | `K5-media-generation-1` |

## media-import (3)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/media-import/agent-tools.ts` | 134 | via `features/fs-files/layout.ts` | K5 | `K5-media-import-1` |
| `apps/website/src/features/media-import/fetch-image.ts` | 192 | tovu-dep | K4 | `K5-media-import-1` |
| `apps/website/src/features/media-import/tool-registrations.ts` | 423 | tovu-dep | K4j K5 | `K5-media-import-1` |

## member-login (7)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/member-login/credentials.ts` | 34 | xp3 | K5x K4j | `K5-member-login-1` |
| `apps/website/src/features/member-login/index.ts` | 10 | via `features/member-login/providers.ts` | verbatim | `K5-member-login-1` |
| `apps/website/src/features/member-login/link-service.ts` | 175 | tovu-dep | K4db | `K5-member-login-1` |
| `apps/website/src/features/member-login/oidc-login.ts` | 239 | xp3 | K5j K4j | `K5-member-login-1` |
| `apps/website/src/features/member-login/providers.ts` | 66 | xp3 | K5j K5x | `K5-member-login-1` |
| `apps/website/src/features/member-login/public-path.ts` | 2 | via `contracts/headless/index.ts` | verbatim | `K5-member-login-1` |
| `apps/website/src/features/member-login/ready-providers.ts` | 22 | xp3 | K4x | `K5-member-login-1` |

## members (20)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/members/access-resolver.ts` | 238 | via `features/members/ports.ts` | verbatim | `K5-members-1` |
| `apps/website/src/features/members/auth-mail.ts` | 26 | xp3 | K5j | `K5-members-1` |
| `apps/website/src/features/members/capability-card.ts` | 30 | xp3 | K4j | `K5-members-1` |
| `apps/website/src/features/members/consent-service.ts` | 271 | via `features/members/ports.ts` | verbatim | `K5-members-1` |
| `apps/website/src/features/members/index.ts` | 129 | via `features/members/ports.ts` | verbatim | `V-members-3` |
| `apps/website/src/features/members/member-admin-writes.ts` | 187 | via `features/members/ports.ts` | verbatim | `K5-members-1` |
| `apps/website/src/features/members/member-challenge-request.ts` | 152 | via `platform/mail/index.ts` | verbatim | `K5-members-2` |
| `apps/website/src/features/members/member-challenge.ts` | 94 | via `features/members/ports.ts` | verbatim | `K5-members-2` |
| `apps/website/src/features/members/member-credentials.ts` | 71 | via `features/members/ports.ts` | verbatim | `K5-members-1` |
| `apps/website/src/features/members/member-sign-in.ts` | 152 | via `features/members/ports.ts` | verbatim | `K5-members-2` |
| `apps/website/src/features/members/password-auth.ts` | 191 | via `features/members/ports.ts` | verbatim | `K5-members-2` |
| `apps/website/src/features/members/ports.ts` | 367 | xp3 | K4j | `K5-members-1` |
| `apps/website/src/features/members/repo.memory.ts` | 510 | via `features/members/ports.ts` | verbatim | `K5-members-1` |
| `apps/website/src/features/members/repo.rows.ts` | 302 | tovu-dep | K4db | `K5-members-1` |
| `apps/website/src/features/members/repo.sqlite.ts` | 70 | tovu-dep | K5 K4db | `K5-members-2` |
| `apps/website/src/features/members/repo.ts` | 607 | tovu-dep | K4db K5 | `K5-members-2` |
| `apps/website/src/features/members/subscriber-directory.ts` | 134 | via `features/newsletter/index.ts` | verbatim | `K5-members-2` |
| `apps/website/src/features/members/tool-registrations.ts` | 336 | xp3 | K4j K5j | `K5-members-2` |
| `apps/website/src/features/members/trash-member.ts` | 25 | xp3 | K4j | `K5-members-2` |
| `apps/website/src/features/members/write-service.ts` | 28 | via `features/members/ports.ts` | verbatim | `K5-members-2` |

## navigation (8)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/navigation/import-menu.ts` | 266 | via `features/navigation/index.ts` | verbatim | `K5-navigation-1` |
| `apps/website/src/features/navigation/index.ts` | 162 | via `features/navigation/reverters.ts` | verbatim | `K5-navigation-1` |
| `apps/website/src/features/navigation/migrate-footer-page-links.ts` | 98 | tovu-dep | K4db | `K5-navigation-1` |
| `apps/website/src/features/navigation/page-target-resolver.ts` | 28 | via `features/post/index.ts` | verbatim | `K5-navigation-1` |
| `apps/website/src/features/navigation/publish-content.ts` | 348 | tovu-dep | K4 | `K5-navigation-1` |
| `apps/website/src/features/navigation/repo.sqlite.ts` | 27 | tovu-dep | K5 K4db | `K5-navigation-1` |
| `apps/website/src/features/navigation/repoint-menu-refs.ts` | 138 | via `features/navigation/index.ts` | verbatim | `K5-navigation-1` |
| `apps/website/src/features/navigation/reverters.ts` | 94 | via `contracts/core/commands/index.ts` | verbatim | `K5-navigation-1` |

## newsletter (23)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/newsletter/agent-tools.ts` | 266 | via `features/newsletter/campaign-write-service.ts` | verbatim | `K5-newsletter-2` |
| `apps/website/src/features/newsletter/campaign-write-service.ts` | 264 | via `features/newsletter/campaign.ts` | verbatim | `K5-newsletter-1` |
| `apps/website/src/features/newsletter/campaign.ts` | 141 | via `features/newsletter/types.ts` | verbatim | `K5-newsletter-1` |
| `apps/website/src/features/newsletter/confirmation.ts` | 193 | via `platform/mail/index.ts` | verbatim | `K5-newsletter-1` |
| `apps/website/src/features/newsletter/data-module-manifest.ts` | 151 | xp3 | K5j | `K5-newsletter-1` |
| `apps/website/src/features/newsletter/delivery/tool-registrations.ts` | 232 | xp3 | K5j | `K5-newsletter-3` |
| `apps/website/src/features/newsletter/deps-builders.ts` | 72 | via `features/newsletter/confirmation.ts` | verbatim | `K5-newsletter-2` |
| `apps/website/src/features/newsletter/hooks.ts` | 99 | via `platform/mail/index.ts` | verbatim | `K5-newsletter-1` |
| `apps/website/src/features/newsletter/index.ts` | 43 | via `features/newsletter/ports.ts` | verbatim | `K5-newsletter-2` |
| `apps/website/src/features/newsletter/launch-gate.ts` | 88 | via `platform/mail/index.ts` | verbatim | `K5-newsletter-1` |
| `apps/website/src/features/newsletter/lists.ts` | 116 | via `features/newsletter/ports.ts` | verbatim | `K5-newsletter-1` |
| `apps/website/src/features/newsletter/ports.ts` | 233 | via `features/newsletter/types.ts` | verbatim | `K5-newsletter-1` |
| `apps/website/src/features/newsletter/repo-sends.ts` | 220 | tovu-dep | K4db | `K5-newsletter-2` |
| `apps/website/src/features/newsletter/repo-subscribers.ts` | 241 | tovu-dep | K4db | `K5-newsletter-1` |
| `apps/website/src/features/newsletter/repo.memory.ts` | 355 | via `features/newsletter/types.ts` | verbatim | `K5-newsletter-2` |
| `apps/website/src/features/newsletter/repo.rows.ts` | 366 | tovu-dep | K4db | `K5-newsletter-1` |
| `apps/website/src/features/newsletter/repo.sqlite.ts` | 56 | tovu-dep | K5 K4db | `K5-newsletter-2` |
| `apps/website/src/features/newsletter/repo.ts` | 166 | tovu-dep | K4db | `K5-newsletter-2` |
| `apps/website/src/features/newsletter/send-pipeline.ts` | 622 | xp3 | K5j | `K5-newsletter-2` |
| `apps/website/src/features/newsletter/subscriptions.ts` | 176 | via `features/newsletter/confirmation.ts` | verbatim | `K5-newsletter-2` |
| `apps/website/src/features/newsletter/tool-registrations.ts` | 570 | xp3 | K5j K4j | `K5-newsletter-2` |
| `apps/website/src/features/newsletter/types.ts` | 380 | xp3 | K4j | `K5-newsletter-1` |
| `apps/website/src/features/newsletter/unsubscribe.ts` | 143 | xp3 | K4j | `K5-newsletter-2` |

## object-storage (4)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/object-storage/artifact-provider.ts` | 67 | xp3 | K4j | `K5-object-storage-1` |
| `apps/website/src/features/object-storage/index.ts` | 5 | via `features/object-storage/media-store.ts` | verbatim | `K5-object-storage-1` |
| `apps/website/src/features/object-storage/media-store.ts` | 45 | xp3 | K5j | `K5-object-storage-1` |
| `apps/website/src/features/object-storage/registry.ts` | 114 | xp3 | K5j K5x K4j | `K5-object-storage-1` |

## observability (1)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/observability/tool-registrations.ts` | 45 | xp3 | K5j | `K5-observability-1` |

## pages (8)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/pages/agent-tools.ts` | 217 | via `features/pages/permissions.ts` | K5 | `K5-pages-1` |
| `apps/website/src/features/pages/html-document-store.memory.ts` | 231 | xp3 | K4x | `K5-pages-1` |
| `apps/website/src/features/pages/html-document-store.sqlite.ts` | 32 | tovu-dep | K5 K4db | `K5-pages-1` |
| `apps/website/src/features/pages/html-document-store.ts` | 607 | tovu-dep | K4x K4db | `K5-pages-1` |
| `apps/website/src/features/pages/index.ts` | 35 | via `features/pages/html-document-store.sqlite.ts` | verbatim | `K5-pages-1` |
| `apps/website/src/features/pages/permissions.ts` | 155 | xp3 | K4x | `K5-pages-1` |
| `apps/website/src/features/pages/skeleton.ts` | 62 | via `contracts/core/page-html.ts` | verbatim | `K5-pages-1` |
| `apps/website/src/features/pages/tool-registrations.ts` | 759 | xp3 | K5 K5j | `K5-pages-1` |

## permanent-delete (1)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/permanent-delete/tool-registrations.ts` | 107 | tovu-dep | K4j K4x K5 | `K5-permanent-delete-1` |

## platform-mail (8)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/platform/mail/adapter-module.ts` | 25 | tovu-dep | K4j K4 | `K5-platform-mail-1` |
| `apps/website/src/platform/mail/adapters/smtp.nodemailer.ts` | 33 | xp3 | K5j | `K5-platform-mail-1` |
| `apps/website/src/platform/mail/delivery-availability.ts` | 15 | xp3 | K5j K4j | `K5-platform-mail-1` |
| `apps/website/src/platform/mail/index.ts` | 35 | xp3 | K4j K5j | `K5-platform-mail-2` |
| `apps/website/src/platform/mail/mail-status.ts` | 18 | xp3 | K4j | `K5-platform-mail-1` |
| `apps/website/src/platform/mail/purpose-gate-probe.ts` | 26 | xp3 | K5j K4 | `K5-platform-mail-1` |
| `apps/website/src/platform/mail/purpose-scoped-mailer.ts` | 31 | xp3 | K5j K4j K4 | `K5-platform-mail-1` |
| `apps/website/src/platform/mail/sender-identity.ts` | 63 | xp3 | K5j K4j | `K5-platform-mail-1` |

## plugin-runtime (27)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/plugin-runtime/agent-plugin-tool-binding.ts` | 63 | xp3 | K5j K4j | `K5-plugin-runtime-3` |
| `apps/website/src/features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts` | 14 | xp3 | K5j K5x | `K5-plugin-runtime-2` |
| `apps/website/src/features/plugin-runtime/built-ins/content-analyzer/plugin.ts` | 62 | tovu-dep | K5 K5j | `K5-plugin-runtime-2` |
| `apps/website/src/features/plugin-runtime/built-ins/content-analyzer/tiptap-blocks.ts` | 129 | xp3 | K4j | `K5-plugin-runtime-1` |
| `apps/website/src/features/plugin-runtime/built-ins/word-count/index.ts` | 111 | tovu-dep | K5 | `K5-plugin-runtime-1` |
| `apps/website/src/features/plugin-runtime/capability-card.ts` | 30 | xp3 | K4j | `K5-plugin-runtime-1` |
| `apps/website/src/features/plugin-runtime/capability-tool-registrations.ts` | 130 | tovu-dep | K5 K4x | `K5-plugin-runtime-3` |
| `apps/website/src/features/plugin-runtime/declarative-content-types.ts` | 90 | xp3 | K5j | `K5-plugin-runtime-2` |
| `apps/website/src/features/plugin-runtime/enable-confirmation-ui.ts` | 81 | via `contracts/core/human-confirm.ts` | verbatim | `K5-plugin-runtime-2` |
| `apps/website/src/features/plugin-runtime/host-binding.ts` | 88 | tovu-dep | K5 | `K5-plugin-runtime-2` |
| `apps/website/src/features/plugin-runtime/host-tool-binding.ts` | 81 | xp3 | K4j K5j | `K5-plugin-runtime-2` |
| `apps/website/src/features/plugin-runtime/install-archive.ts` | 46 | xp3 | K5j K4j | `K5-plugin-runtime-1` |
| `apps/website/src/features/plugin-runtime/install-source.ts` | 64 | via `contracts/headless/index.ts` | verbatim | `K5-plugin-runtime-2` |
| `apps/website/src/features/plugin-runtime/install-tool-binding.ts` | 29 | via `features/plugin-runtime/install.ts` | verbatim | `K5-plugin-runtime-3` |
| `apps/website/src/features/plugin-runtime/install-tool-catalog.ts` | 28 | via `contracts/headless/index.ts` | verbatim | `K5-plugin-runtime-2` |
| `apps/website/src/features/plugin-runtime/install-tool.ts` | 45 | tovu-dep | K3 | `K5-plugin-runtime-3` |
| `apps/website/src/features/plugin-runtime/install.ts` | 24 | via `features/plugin-runtime/service-ports.ts` | verbatim | `K5-plugin-runtime-2` |
| `apps/website/src/features/plugin-runtime/invocation-core-deps.ts` | 53 | tovu-dep | K5 | `K5-plugin-runtime-1` |
| `apps/website/src/features/plugin-runtime/lower-tool-access.ts` | 15 | via `contracts/core/tool-access-change.ts` | verbatim | `K5-plugin-runtime-2` |
| `apps/website/src/features/plugin-runtime/plugin-export.ts` | 19 | tovu-dep | K4 | `K5-plugin-runtime-1` |
| `apps/website/src/features/plugin-runtime/provider-status-tool.ts` | 13 | xp3 | K5j K4j | `K5-plugin-runtime-2` |
| `apps/website/src/features/plugin-runtime/repo.sqlite.ts` | 21 | tovu-dep | K5 K4db | `K5-plugin-runtime-1` |
| `apps/website/src/features/plugin-runtime/service-ports.ts` | 26 | tovu-dep | K3 | `K5-plugin-runtime-1` |
| `apps/website/src/features/plugin-runtime/source-tools.ts` | 17 | xp3 | K4j | `K5-plugin-runtime-3` |
| `apps/website/src/features/plugin-runtime/tool-registrations.ts` | 73 | xp3 | K4j | `K5-plugin-runtime-3` |
| `apps/website/src/features/plugin-runtime/uninstall-confirmation-ui.ts` | 44 | via `contracts/core/human-confirm.ts` | verbatim | `K5-plugin-runtime-2` |
| `apps/website/src/features/plugin-runtime/widget-partials.ts` | 21 | xp3 | K5j K5 | `K5-plugin-runtime-1` |

## plugins (2)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/plugins/lipay/manifest.ts` | 89 | xp3 | K4j | `K4-plugins-1` |
| `apps/website/src/features/plugins/store/manifest.ts` | 30 | xp3 | K4j | `K4-plugins-1` |

## post (43)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/post/agent-tools.ts` | 429 | via `features/post/post-read.ts` | K5 | `K5-post-3` |
| `apps/website/src/features/post/capability-card.ts` | 30 | xp3 | K4j | `K5-post-1` |
| `apps/website/src/features/post/content-stats-tool.ts` | 174 | via `features/post/post.ts` | K5 | `K5-post-4` |
| `apps/website/src/features/post/contracts.ts` | 4 | via `features/post/post.ts` | verbatim | `K5-post-3` |
| `apps/website/src/features/post/expected-version.ts` | 92 | via `features/post/post.ts` | verbatim | `K5-post-1` |
| `apps/website/src/features/post/featured-image.ts` | 80 | via `features/media/index.ts` | verbatim | `K5-post-4` |
| `apps/website/src/features/post/go-live-sweep.ts` | 91 | xp3 | K4j | `K5-post-1` |
| `apps/website/src/features/post/index.ts` | 47 | via `features/post/post-write-effects.ts` | verbatim | `V-post-5` |
| `apps/website/src/features/post/post-create.ts` | 302 | via `features/post/post.ts` | verbatim | `K5-post-3` |
| `apps/website/src/features/post/post-import.ts` | 198 | via `features/post/post.ts` | verbatim | `K5-post-3` |
| `apps/website/src/features/post/post-read.ts` | 247 | via `features/post/post.ts` | K5 | `K5-post-1` |
| `apps/website/src/features/post/post-retire.ts` | 154 | via `features/post/post.ts` | verbatim | `K5-post-3` |
| `apps/website/src/features/post/post-slugs.ts` | 208 | via `features/post/post.ts` | verbatim | `K5-post-1` |
| `apps/website/src/features/post/post-tool-delete.ts` | 51 | via `features/post/post.ts` | verbatim | `K5-post-6` |
| `apps/website/src/features/post/post-tool-deps.ts` | 93 | via `features/post/post-trash.ts` | K4 | `K5-post-6` |
| `apps/website/src/features/post/post-tool-duplicate.ts` | 237 | tovu-dep | K4 | `K5-post-6` |
| `apps/website/src/features/post/post-tool-errors.ts` | 72 | via `features/post/post.ts` | verbatim | `K5-post-3` |
| `apps/website/src/features/post/post-tool-input.ts` | 107 | via `features/post/post-write-fields.ts` | verbatim | `K5-post-6` |
| `apps/website/src/features/post/post-tool-list.ts` | 127 | via `features/post/post-read.ts` | verbatim | `K5-post-6` |
| `apps/website/src/features/post/post-tool-policy.ts` | 109 | via `features/post/agent-tools.ts` | verbatim | `K5-post-6` |
| `apps/website/src/features/post/post-tool-update.ts` | 145 | via `features/post/post-write-fields.ts` | verbatim | `K5-post-6` |
| `apps/website/src/features/post/post-tool-views.ts` | 185 | via `features/post/post.ts` | K5 | `K5-post-6` |
| `apps/website/src/features/post/post-trash.ts` | 267 | via `features/post/post.ts` | verbatim | `K5-post-3` |
| `apps/website/src/features/post/post-update.ts` | 299 | via `features/post/post.ts` | verbatim | `K5-post-3` |
| `apps/website/src/features/post/post-write-effects.ts` | 211 | via `features/post/post.ts` | K5 | `K5-post-2` |
| `apps/website/src/features/post/post-write-fields.ts` | 209 | via `features/post/post.ts` | verbatim | `K5-post-2` |
| `apps/website/src/features/post/post.ts` | 500 | via `contracts/core/post-kind.ts` | verbatim | `K5-post-1` |
| `apps/website/src/features/post/preview-tool.ts` | 85 | via `features/post/post-read.ts` | K5 | `K5-post-6` |
| `apps/website/src/features/post/publish-content.ts` | 616 | tovu-dep | K4 | `K5-post-4` |
| `apps/website/src/features/post/read-model.ts` | 3 | via `features/post/repo.rows.ts` | verbatim | `K5-post-3` |
| `apps/website/src/features/post/repo.memory.ts` | 261 | tovu-dep | K5 | `K5-post-2` |
| `apps/website/src/features/post/repo.rows.ts` | 251 | tovu-dep | K4db | `K5-post-3` |
| `apps/website/src/features/post/repo.sqlite.ts` | 18 | tovu-dep | K5 K4db | `K5-post-4` |
| `apps/website/src/features/post/repo.ts` | 363 | tovu-dep | K5 K4db | `K5-post-4` |
| `apps/website/src/features/post/reverters.ts` | 333 | via `contracts/core/commands/index.ts` | verbatim | `K5-post-3` |
| `apps/website/src/features/post/search-index.contract.ts` | 51 | tovu-dep | K4db | `K5-post-3` |
| `apps/website/src/features/post/search-index.memory.ts` | 92 | tovu-dep | K5 | `K5-post-4` |
| `apps/website/src/features/post/search-index.postgres.ts` | 111 | tovu-dep | K4db | `K5-post-3` |
| `apps/website/src/features/post/search-index.sqlite.ts` | 139 | tovu-dep | K4db | `K5-post-3` |
| `apps/website/src/features/post/search-index.ts` | 275 | tovu-dep | K4db | `K5-post-4` |
| `apps/website/src/features/post/search.ts` | 282 | via `features/post/post.ts` | verbatim | `K5-post-2` |
| `apps/website/src/features/post/template-options.ts` | 34 | via `features/presentation/index.ts` | K5 | `K5-post-6` |
| `apps/website/src/features/post/tool-registrations.ts` | 508 | xp3 | K5 K4j | `K5-post-6` |

## presentation (3)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/presentation/index.ts` | 26 | via `features/presentation/repo.sqlite.ts` | verbatim | `K5-presentation-1` |
| `apps/website/src/features/presentation/repo.sqlite.ts` | 20 | tovu-dep | K5 K4db | `K5-presentation-1` |
| `apps/website/src/features/presentation/set-active-theme.ts` | 24 | xp3 | K4j | `K5-presentation-1` |

## project-keys (8)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/project-keys/attached-vault.ts` | 75 | via `contracts/core/model-facing-tool-errors.ts` | verbatim | `K5-project-keys-1` |
| `apps/website/src/features/project-keys/attachments.ts` | 62 | xp3 | K5j | `K5-project-keys-1` |
| `apps/website/src/features/project-keys/create-vault.ts` | 28 | via `features/project-keys/attachments.ts` | K5 | `K5-project-keys-1` |
| `apps/website/src/features/project-keys/service.ts` | 175 | xp3 | K4j K5j | `K5-project-keys-1` |
| `apps/website/src/features/project-keys/shared-oauth-disconnect.ts` | 53 | xp3 | K5j K4x | `K5-project-keys-1` |
| `apps/website/src/features/project-keys/site-references.ts` | 87 | tovu-dep | K4j K5 | `K5-project-keys-1` |
| `apps/website/src/features/project-keys/site-sealer.ts` | 60 | xp3 | K4j | `K5-project-keys-1` |
| `apps/website/src/features/project-keys/tools.ts` | 65 | tovu-dep | K4j K4 | `K5-project-keys-1` |

## public-http (112)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/server/inbound/public-http/http/content/posts.ts` | 19 | via `features/post/index.ts` | verbatim | `RT-K1-pub-http-1` |
| `apps/website/src/server/inbound/public-http/http/members.ts` | 43 | xp3 | K4x | `RT-K1-pub-members-1` |
| `apps/website/src/server/inbound/public-http/http/shared/post.ts` | 83 | via `features/post/post.ts` | verbatim | `RT-K1-pub-http-1` |
| `apps/website/src/server/inbound/public-http/http/site/bare-page.ts` | 100 | via `features/post/index.ts` | verbatim | `RT-K1-pub-site-bare-page-1` |
| `apps/website/src/server/inbound/public-http/http/site/handlebars-render.ts` | 184 | via `server/inbound/public-http/http/site/render-context.ts` | verbatim | `RT-K1-pub-site-handlebars-render-1` |
| `apps/website/src/server/inbound/public-http/http/site/handlebars-sandbox.ts` | 75 | via `server/inbound/public-http/http/site/worker-sandbox.ts` | verbatim | `RT-K1-pub-site-handlebars-sandbox-1` |
| `apps/website/src/server/inbound/public-http/http/site/handlebars-worker.ts` | 32 | via `server/inbound/public-http/http/site/handlebars-render.ts` | verbatim | `RT-K1-pub-site-handlebars-worker-1` |
| `apps/website/src/server/inbound/public-http/http/site/liquid-render.ts` | 168 | via `server/inbound/public-http/http/site/render-context.ts` | verbatim | `RT-K1-pub-site-liquid-render-1` |
| `apps/website/src/server/inbound/public-http/http/site/liquid-sandbox.ts` | 56 | via `server/inbound/public-http/http/site/worker-sandbox.ts` | verbatim | `RT-K1-pub-site-liquid-sandbox-1` |
| `apps/website/src/server/inbound/public-http/http/site/liquid-worker.ts` | 22 | via `server/inbound/public-http/http/site/liquid-render.ts` | verbatim | `RT-K1-pub-site-liquid-worker-1` |
| `apps/website/src/server/inbound/public-http/http/site/render-context.ts` | 181 | via `features/post/contracts.ts` | verbatim | `RT-K1-pub-site-render-context-1` |
| `apps/website/src/server/inbound/public-http/http/site/render-site.ts` | 348 | xp3 | K4j K5j | `RT-K1-pub-site-render-site-1` |
| `apps/website/src/server/inbound/public-http/http/site/render/blocks.ts` | 99 | via `server/inbound/public-http/http/site/render-context.ts` | verbatim | `RT-K1-pub-site-render-3` |
| `apps/website/src/server/inbound/public-http/http/site/render/components/entry-lists.ts` | 75 | via `server/inbound/public-http/http/site/render-context.ts` | K5 | `RT-K1-pub-site-render-2` |
| `apps/website/src/server/inbound/public-http/http/site/render/components/layout.ts` | 95 | via `server/inbound/public-http/http/site/render-context.ts` | verbatim | `RT-K1-pub-site-render-1` |
| `apps/website/src/server/inbound/public-http/http/site/render/components/marketing.ts` | 85 | via `server/inbound/public-http/http/site/render-context.ts` | verbatim | `RT-K1-pub-site-render-1` |
| `apps/website/src/server/inbound/public-http/http/site/render/components/registry.ts` | 37 | via `server/inbound/public-http/http/site/render-context.ts` | verbatim | `RT-K1-pub-site-render-3` |
| `apps/website/src/server/inbound/public-http/http/site/render/content-html.ts` | 109 | via `server/inbound/public-http/http/site/render/doc/doc-render-contract.ts` | verbatim | `RT-K1-pub-site-render-2` |
| `apps/website/src/server/inbound/public-http/http/site/render/doc/doc-nodes.ts` | 404 | via `server/inbound/public-http/http/site/render-context.ts` | verbatim | `RT-K1-pub-site-render-1` |
| `apps/website/src/server/inbound/public-http/http/site/render/doc/doc-render-contract.ts` | 50 | via `server/inbound/public-http/http/site/render-context.ts` | verbatim | `RT-K1-pub-site-render-1` |
| `apps/website/src/server/inbound/public-http/http/site/render/doc/media-ref.ts` | 91 | via `server/inbound/public-http/http/site/render-context.ts` | verbatim | `RT-K1-pub-site-render-1` |
| `apps/website/src/server/inbound/public-http/http/site/render/doc/nodes-media.ts` | 183 | via `server/inbound/public-http/http/site/render/doc/doc-render-contract.ts` | K5 | `RT-K1-pub-site-render-1` |
| `apps/website/src/server/inbound/public-http/http/site/render/document-shell.ts` | 72 | via `features/theme/token-aliases.ts` | verbatim | `RT-K1-pub-site-render-2` |
| `apps/website/src/server/inbound/public-http/http/site/render/page-body.ts` | 211 | via `features/post/contracts.ts` | verbatim | `RT-K1-pub-site-render-2` |
| `apps/website/src/server/inbound/public-http/http/site/render/post-body.ts` | 106 | via `server/inbound/public-http/http/site/render-context.ts` | K5 | `RT-K1-pub-site-render-2` |
| `apps/website/src/server/inbound/public-http/http/site/render/site-assistant-mount.ts` | 81 | tovu-dep | K5 | `RT-K1-pub-site-render-1` |
| `apps/website/src/server/inbound/public-http/http/site/render/template-render-data.ts` | 115 | xp3 | K5j K5 | `RT-K1-pub-site-render-2` |
| `apps/website/src/server/inbound/public-http/http/site/render/widgets/media.ts` | 145 | via `server/inbound/public-http/http/site/render/doc/doc-render-contract.ts` | verbatim | `RT-K1-pub-site-render-1` |
| `apps/website/src/server/inbound/public-http/http/site/render/widgets/post-content.ts` | 214 | via `server/inbound/public-http/http/site/render/doc/doc-render-contract.ts` | K5 | `RT-K1-pub-site-render-1` |
| `apps/website/src/server/inbound/public-http/http/site/seo-render-context.ts` | 24 | via `features/seo/index.ts` | verbatim | `RT-K1-pub-site-seo-render-context-1` |
| `apps/website/src/server/inbound/public-http/http/site/site-chat-markup.ts` | 42 | xp3 | K5j | `RT-K1-pub-site-site-chat-markup-1` |
| `apps/website/src/server/inbound/public-http/http/site/worker-sandbox.ts` | 163 | tovu-dep | K5j K5 K4j | `RT-K1-pub-site-worker-sandbox-1` |
| `apps/website/src/server/inbound/public-http/middleware/public-page-security-headers.ts` | 59 | via `features/theme/public-page-security-headers.ts` | verbatim | `RT-K1-pub-middleware-1` |
| `apps/website/src/server/inbound/public-http/middleware/published-webmcp.ts` | 45 | via `features/theme/visitor-publication.ts` | verbatim | `RT-K1-pub-middleware-1` |
| `apps/website/src/server/inbound/public-http/middleware/site-consent.ts` | 64 | tovu-dep | K4j K5x K1 | `RT-K1-pub-middleware-1` |
| `apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts` | 461 | tovu-dep | K4j K5j K3 K1 K5 K5x | `RT-K1-pub-middleware-2` |
| `apps/website/src/server/inbound/public-http/middleware/site-serving-gate.ts` | 76 | xp3 | K4j | `RT-K1-pub-middleware-1` |
| `apps/website/src/server/inbound/public-http/middleware/theme-asset-dirs.ts` | 72 | xp3 | K5j K5 | `RT-K1-pub-middleware-1` |
| `apps/website/src/server/inbound/public-http/middleware/theme-page-preview.ts` | 270 | tovu-dep | K1 | `RT-K1-pub-middleware-3` |
| `apps/website/src/server/inbound/public-http/middleware/theme-preview-refresh.ts` | 120 | tovu-dep | K1 | `RT-K1-pub-middleware-3` |
| `apps/website/src/server/inbound/public-http/middleware/theme-preview-switcher.ts` | 95 | tovu-dep | K1 | `RT-K1-pub-middleware-3` |
| `apps/website/src/server/inbound/public-http/middleware/theme-static-assets.ts` | 192 | xp3 | K5j | `RT-K1-pub-middleware-3` |
| `apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/export-files.ts` | 80 | xp3 | K4x K5x K4j | `RT-K1-pub-agent-plugin-surfaces-1` |
| `apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/files.ts` | 70 | xp3 | K5x K4x | `RT-K1-pub-agent-plugin-surfaces-1` |
| `apps/website/src/server/inbound/public-http/routes/api-connections/oauth-callback.ts` | 127 | tovu-dep | K5j K5x K1 | `RT-K1-pub-api-connections-1` |
| `apps/website/src/server/inbound/public-http/routes/commerce/purchase.ts` | 194 | tovu-dep | K5j K5x K1 | `RT-K1-pub-commerce-1` |
| `apps/website/src/server/inbound/public-http/routes/content/posts/get-by-slug.ts` | 85 | tovu-dep | K1 K5x K4x | `RT-K1-pub-content-1` |
| `apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback-url.ts` | 36 | tovu-dep | K1 | `RT-K1-pub-external-mcp-1` |
| `apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback.ts` | 179 | tovu-dep | K5x K5 K4x K5j K1 | `RT-K1-pub-external-mcp-1` |
| `apps/website/src/server/inbound/public-http/routes/mail-feedback.ts` | 43 | tovu-dep | K4x K1 | `RT-K1-pub-mail-feedback-1` |
| `apps/website/src/server/inbound/public-http/routes/members/analytics.ts` | 33 | xp3 | K4x | `RT-K1-pub-members-1` |
| `apps/website/src/server/inbound/public-http/routes/members/complete-sign-in.ts` | 95 | tovu-dep | K1 K5x | `RT-K1-pub-members-1` |
| `apps/website/src/server/inbound/public-http/routes/members/deps.ts` | 180 | tovu-dep | K4x K4j K1 | `RT-K1-pub-members-1` |
| `apps/website/src/server/inbound/public-http/routes/members/forgot-password.ts` | 23 | xp3 | K5x | `RT-K1-pub-members-3` |
| `apps/website/src/server/inbound/public-http/routes/members/me.ts` | 45 | xp3 | K5x K5j | `RT-K1-pub-members-4` |
| `apps/website/src/server/inbound/public-http/routes/members/oidc-callback.ts` | 104 | xp3 | K5x K5j | `RT-K1-pub-members-4` |
| `apps/website/src/server/inbound/public-http/routes/members/oidc-deps.ts` | 107 | xp3 | K4x K5j K5x | `RT-K1-pub-members-3` |
| `apps/website/src/server/inbound/public-http/routes/members/oidc-start.ts` | 48 | xp3 | K5x K5j | `RT-K1-pub-members-5` |
| `apps/website/src/server/inbound/public-http/routes/members/oidc-verify-email.ts` | 56 | xp3 | K5x K5j | `RT-K1-pub-members-6` |
| `apps/website/src/server/inbound/public-http/routes/members/password-sign-in.ts` | 31 | xp3 | K5x | `RT-K1-pub-members-1` |
| `apps/website/src/server/inbound/public-http/routes/members/reset-password.ts` | 19 | xp3 | K5x | `RT-K1-pub-members-2` |
| `apps/website/src/server/inbound/public-http/routes/members/set-password.ts` | 29 | tovu-dep | K5x K1 | `RT-K1-pub-members-2` |
| `apps/website/src/server/inbound/public-http/routes/members/sign-in.ts` | 73 | tovu-dep | K1 K5x | `RT-K1-pub-members-2` |
| `apps/website/src/server/inbound/public-http/routes/members/sign-out.ts` | 24 | tovu-dep | K5j K1 | `RT-K1-pub-members-3` |
| `apps/website/src/server/inbound/public-http/routes/members/unlink-identity.ts` | 81 | xp3 | K5j K5x | `RT-K1-pub-members-5` |
| `apps/website/src/server/inbound/public-http/routes/oauth/callback-page.ts` | 76 | xp3 | K5j | `RT-K1-pub-oauth-1` |
| `apps/website/src/server/inbound/public-http/routes/ops/health.ts` | 64 | tovu-dep | K4 K5 | `RT-K1-pub-ops-1` |
| `apps/website/src/server/inbound/public-http/routes/plugin-contributions.ts` | 137 | tovu-dep | K4j K1 K5x | `RT-K1-pub-plugin-contributions-1` |
| `apps/website/src/server/inbound/public-http/routes/publish-trust/handshake.ts` | 287 | tovu-dep | K3 K5x K4j | `RT-K1-pub-publish-trust-1` |
| `apps/website/src/server/inbound/public-http/routes/site-assistant-confirm.ts` | 59 | tovu-dep | K4j K5 K1 | `RT-K1-pub-site-assistant-confirm-1` |
| `apps/website/src/server/inbound/public-http/routes/site-share.ts` | 28 | xp3 | K5x K4x | `RT-K1-pub-site-share-1` |
| `apps/website/src/server/inbound/public-http/routes/site/analytics-ingest.ts` | 123 | xp3 | K5j K5x K4j | `RT-K1-pub-site-2` |
| `apps/website/src/server/inbound/public-http/routes/site/chat-comparison.ts` | 37 | tovu-dep | K5 K1 | `RT-K1-pub-site-1` |
| `apps/website/src/server/inbound/public-http/routes/site/comments-submit.ts` | 121 | tovu-dep | K4j K1 | `RT-K1-pub-site-2` |
| `apps/website/src/server/inbound/public-http/routes/site/feed.ts` | 34 | tovu-dep | K1 | `RT-K1-pub-site-6` |
| `apps/website/src/server/inbound/public-http/routes/site/forms-admission.ts` | 25 | via `contracts/core/rate-limit/rate-limit.ts` | verbatim | `RT-K1-pub-site-1` |
| `apps/website/src/server/inbound/public-http/routes/site/forms-multipart.ts` | 15 | xp3 | K5j | `RT-K1-pub-site-1` |
| `apps/website/src/server/inbound/public-http/routes/site/forms-submit.ts` | 105 | tovu-dep | K1 | `RT-K1-pub-site-6` |
| `apps/website/src/server/inbound/public-http/routes/site/llms.ts` | 51 | tovu-dep | K1 | `RT-K1-pub-site-6` |
| `apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts` | 761 | tovu-dep | K5 K1 K5x K4x K5j | `RT-K1-pub-site-4` |
| `apps/website/src/server/inbound/public-http/routes/site/member-pages.ts` | 201 | tovu-dep | K5x K1 | `RT-K1-pub-site-10` |
| `apps/website/src/server/inbound/public-http/routes/site/newsletter-confirm.ts` | 57 | tovu-dep | K1 K5x | `RT-K1-pub-site-3` |
| `apps/website/src/server/inbound/public-http/routes/site/newsletter-deps.ts` | 57 | xp3 | K4j K4x K5x | `RT-K1-pub-site-3` |
| `apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts` | 58 | tovu-dep | K1 K5x | `RT-K1-pub-site-3` |
| `apps/website/src/server/inbound/public-http/routes/site/pages.ts` | 18 | tovu-dep | K1 | `RT-K1-pub-site-11` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/extra-head.ts` | 71 | tovu-dep | K1 | `RT-K1-pub-site-2` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/home.ts` | 180 | tovu-dep | K5x K4x K5 K1 | `RT-K1-pub-site-10` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/listing.ts` | 57 | tovu-dep | K1 | `RT-K1-pub-site-1` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/marketing.ts` | 129 | tovu-dep | K4x K1 | `RT-K1-pub-site-8` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/post-not-found.ts` | 98 | tovu-dep | K1 | `RT-K1-pub-site-10` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/post.ts` | 161 | tovu-dep | K4x K1 | `RT-K1-pub-site-9` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/slug-routes.ts` | 127 | tovu-dep | K5x K5 K1 | `RT-K1-pub-site-11` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/handlers/virtual-page.ts` | 90 | tovu-dep | K5 K1 | `RT-K1-pub-site-9` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/listing/listing-batch.ts` | 30 | tovu-dep | K1 K5j | `RT-K1-pub-site-7` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/render-context/collection-lists.ts` | 209 | via `features/entries/public-read.ts` | verbatim | `RT-K1-pub-site-8` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/render-context/content-marker-ports.ts` | 40 | via `features/widgets/deps.ts` | verbatim | `RT-K1-pub-site-7` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/render-context/deps.ts` | 74 | tovu-dep | K4x K1 | `RT-K1-pub-site-4` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/render-context/media-metadata.ts` | 196 | via `features/post/contracts.ts` | verbatim | `RT-K1-pub-site-7` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/render-context/member-access.ts` | 65 | tovu-dep | K1 K5x K4x | `RT-K1-pub-site-5` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/render-context/post-previews.ts` | 193 | tovu-dep | K4x K5 K1 | `RT-K1-pub-site-8` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/render-context/site-title.ts` | 59 | tovu-dep | K1 | `RT-K1-pub-site-1` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/render-context/static-menus.ts` | 325 | via `features/theme/static-render-menus.ts` | verbatim | `RT-K1-pub-site-5` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/render-context/taxonomy.ts` | 51 | via `features/post/contracts.ts` | verbatim | `RT-K1-pub-site-2` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/render-context/widgets.ts` | 108 | tovu-dep | K5 K1 | `RT-K1-pub-site-5` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/response.ts` | 156 | tovu-dep | K5x K1 | `RT-K1-pub-site-5` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/static-tier.ts` | 190 | xp3 | K4x K5 K5j | `RT-K1-pub-site-8` |
| `apps/website/src/server/inbound/public-http/routes/site/pages/template-render.ts` | 242 | xp3 | K4x K5 | `RT-K1-pub-site-8` |
| `apps/website/src/server/inbound/public-http/routes/site/products.ts` | 132 | tovu-dep | K1 K5 | `RT-K1-pub-site-9` |
| `apps/website/src/server/inbound/public-http/routes/site/robots.ts` | 39 | tovu-dep | K1 | `RT-K1-pub-site-7` |
| `apps/website/src/server/inbound/public-http/routes/site/search.ts` | 119 | tovu-dep | K1 K4j K5j K4 | `RT-K1-pub-site-6` |
| `apps/website/src/server/inbound/public-http/routes/site/sitemap.ts` | 29 | tovu-dep | K1 | `RT-K1-pub-site-7` |
| `apps/website/src/server/inbound/public-http/visitor-analytics.ts` | 44 | xp3 | K4j K4x | `RT-K1-pub-visitor-analytics-1` |

## publish-content (39)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/publish-content/apply-failure.ts` | 72 | via `contracts/core/plugin-hook-failed-error.ts` | verbatim | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/apply-port.ts` | 58 | tovu-dep | K4 | `K5-publish-content-5` |
| `apps/website/src/features/publish-content/apply-report.ts` | 555 | via `features/publish-content/apply-failure.ts` | verbatim | `K5-publish-content-4` |
| `apps/website/src/features/publish-content/apply-retire.ts` | 96 | via `features/publish-content/apply-failure.ts` | verbatim | `K5-publish-content-4` |
| `apps/website/src/features/publish-content/apply-row.ts` | 203 | via `features/publish-content/apply-failure.ts` | verbatim | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/apply-run.ts` | 141 | via `features/publish-content/plan-rows.ts` | verbatim | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/backstop-policy.ts` | 124 | via `features/publish-content/file-tree-policy.ts` | verbatim | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/backstop-preview.ts` | 76 | via `contracts/core/model-facing-tool-errors.ts` | verbatim | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/backstop-service.ts` | 118 | tovu-dep | K3 | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/composite-blob-source.ts` | 110 | via `features/publish-content/peer-transport.ts` | verbatim | `K5-publish-content-5` |
| `apps/website/src/features/publish-content/connect-destination.ts` | 196 | via `features/publish-content/peers.ts` | verbatim | `K5-publish-content-4` |
| `apps/website/src/features/publish-content/content-references.ts` | 79 | via `features/publish-content/type-registry.ts` | verbatim | `K4-publish-content-2` |
| `apps/website/src/features/publish-content/destination-credential.ts` | 99 | tovu-dep | K4 K4j | `K5-publish-content-4` |
| `apps/website/src/features/publish-content/disconnect-tool.ts` | 58 | via `features/publish-trust/connect.ts` | verbatim | `K5-publish-content-6` |
| `apps/website/src/features/publish-content/export-bundle.ts` | 353 | xp3 | K4x | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/file-tree-policy.ts` | 507 | via `contracts/core/secret-scan.ts` | verbatim | `K4-publish-content-2` |
| `apps/website/src/features/publish-content/gated-hooks.ts` | 366 | via `features/publish-content/planner.ts` | K4 K5 | `K5-publish-content-4` |
| `apps/website/src/features/publish-content/idempotency.ts` | 25 | via `features/publish-content/plan-rows.ts` | verbatim | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/peer-transport.ts` | 907 | tovu-dep | K3 K5 | `K5-publish-content-5` |
| `apps/website/src/features/publish-content/peers.ts` | 662 | tovu-dep | K5j K5 K4x K4j | `K5-publish-content-4` |
| `apps/website/src/features/publish-content/permissions.ts` | 108 | xp3 | K4x K5j | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/plan-rows.ts` | 147 | via `features/publish-content/type-registry.ts` | verbatim | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/planner.ts` | 455 | via `features/publish-content/plan-rows.ts` | verbatim | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/publish-backstop-file.ts` | 174 | via `features/publish-content/backstop-policy.ts` | verbatim | `K5-publish-content-4` |
| `apps/website/src/features/publish-content/publish-backstop-row.sqlite.ts` | 103 | tovu-dep | K4db K4j | `K5-publish-content-4` |
| `apps/website/src/features/publish-content/publish-content-peer-repo.sqlite.ts` | 9 | via `features/publish-content/publish-content-peer-repo.ts` | verbatim | `K5-publish-content-5` |
| `apps/website/src/features/publish-content/publish-content-peer-repo.ts` | 13 | tovu-dep | K5j K4db K4j | `K5-publish-content-5` |
| `apps/website/src/features/publish-content/publish-tool.ts` | 228 | xp3 | K5x K4x | `K5-publish-content-5` |
| `apps/website/src/features/publish-content/pull.ts` | 97 | via `features/publish-content/destination-credential.ts` | verbatim | `K5-publish-content-5` |
| `apps/website/src/features/publish-content/push-plan.ts` | 199 | xp3 | K4x | `K5-publish-content-5` |
| `apps/website/src/features/publish-content/raw-file-contributor.ts` | 298 | via `features/publish-content/backstop-policy.ts` | verbatim | `K5-publish-content-4` |
| `apps/website/src/features/publish-content/raw-row-contributor.ts` | 279 | via `features/publish-content/backstop-policy.ts` | verbatim | `K5-publish-content-4` |
| `apps/website/src/features/publish-content/repo-handler.ts` | 435 | via `features/publish-content/type-registry.ts` | verbatim | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/report-labels.ts` | 189 | via `features/publish-content/plan-rows.ts` | verbatim | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/run-repo.ts` | 146 | via `features/publish-content/plan-rows.ts` | verbatim | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/seed-hash.ts` | 70 | via `features/publish-content/type-registry.ts` | verbatim | `K5-publish-content-3` |
| `apps/website/src/features/publish-content/tool-deps.ts` | 81 | tovu-dep | K4 | `K5-publish-content-5` |
| `apps/website/src/features/publish-content/tool-registrations.ts` | 517 | tovu-dep | K5 K4j K4 | `K5-publish-content-6` |
| `apps/website/src/features/publish-content/type-registry.ts` | 558 | tovu-dep | K4 | `K4-publish-content-2` |

## publish-content-ui (7)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/publish-content/ui/contract.ts` | 136 | xp3 | K4x | `K5-publish-content-ui-1` |
| `apps/website/src/features/publish-content/ui/criteria.ts` | 318 | via `features/publish-content/ui/report-rows.ts` | verbatim | `K5-publish-content-ui-1` |
| `apps/website/src/features/publish-content/ui/index.ts` | 71 | via `features/publish-content/ui/contract.ts` | K4 K5 | `K5-publish-content-ui-1` |
| `apps/website/src/features/publish-content/ui/phase.ts` | 105 | via `features/publish-content/ui/contract.ts` | verbatim | `K5-publish-content-ui-1` |
| `apps/website/src/features/publish-content/ui/publish-order.ts` | 85 | via `features/publish-content/ui/report-rows.ts` | verbatim | `K5-publish-content-ui-1` |
| `apps/website/src/features/publish-content/ui/replan.ts` | 104 | via `features/publish-content/ui/contract.ts` | verbatim | `K5-publish-content-ui-1` |
| `apps/website/src/features/publish-content/ui/report-rows.ts` | 638 | xp3 | K5 K5x | `K5-publish-content-ui-1` |

## publish-trust (6)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/publish-trust/challenge.ts` | 317 | via `features/publish-trust/keys.ts` | verbatim | `K5-publish-trust-1` |
| `apps/website/src/features/publish-trust/connect.ts` | 201 | xp3 | K5j K4j | `K5-publish-trust-1` |
| `apps/website/src/features/publish-trust/handshake-client.ts` | 327 | tovu-dep | K4 K4j | `K5-publish-trust-1` |
| `apps/website/src/features/publish-trust/keys.ts` | 206 | xp3 | K4j | `K5-publish-trust-1` |
| `apps/website/src/features/publish-trust/publish-trust-revocations.ts` | 142 | tovu-dep | K4db | `K5-publish-trust-1` |
| `apps/website/src/features/publish-trust/session.ts` | 219 | xp3 | K4j | `K5-publish-trust-1` |

## recovery (2)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/recovery/capability-card.ts` | 28 | xp3 | K4j | `K5-recovery-1` |
| `apps/website/src/features/recovery/tool-registrations.ts` | 447 | xp3 | K5j K4 K5 | `K5-recovery-1` |

## redirects (4)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/redirects/index.ts` | 5 | via `features/redirects/repo.sqlite.ts` | verbatim | `K5-redirects-1` |
| `apps/website/src/features/redirects/publish-content.ts` | 158 | via `features/publish-content/repo-handler.ts` | K5 | `K5-redirects-1` |
| `apps/website/src/features/redirects/repo.sqlite.ts` | 27 | tovu-dep | K5 K4db | `K5-redirects-1` |
| `apps/website/src/features/redirects/tool-registrations.ts` | 55 | xp3 | K5j | `K5-redirects-1` |

## seo (4)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/seo/capability-card.ts` | 30 | xp3 | K4j | `K5-seo-1` |
| `apps/website/src/features/seo/index.ts` | 128 | xp3 | K5x K5 | `K5-seo-1` |
| `apps/website/src/features/seo/settings.ts` | 400 | xp3 | K4j | `K5-seo-1` |
| `apps/website/src/features/seo/tool-registrations.ts` | 109 | xp3 | K4j | `K5-seo-1` |

## server-logs (4)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/server-logs/agent-tools.ts` | 20 | via `features/server-logs/read-server-logs.ts` | verbatim | `K5-server-logs-1` |
| `apps/website/src/features/server-logs/process-source.ts` | 8 | tovu-dep | K5 | `K5-server-logs-1` |
| `apps/website/src/features/server-logs/read-server-logs.ts` | 117 | tovu-dep | K4 | `K5-server-logs-1` |
| `apps/website/src/features/server-logs/tool-registrations.ts` | 52 | xp3 | K5j | `K5-server-logs-1` |

## settings (18)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/settings/chat-execution-write.ts` | 82 | xp3 | K5j | `K5-settings-2` |
| `apps/website/src/features/settings/form-delivery-write.ts` | 61 | via `features/settings/site-title-write.ts` | verbatim | `K5-settings-1` |
| `apps/website/src/features/settings/index.ts` | 162 | xp3 | K4j | `K5-settings-3` |
| `apps/website/src/features/settings/mail-provider.ts` | 127 | xp3 | K4 K4j | `K5-settings-1` |
| `apps/website/src/features/settings/publish-content.ts` | 158 | tovu-dep | K5 K4 | `K5-settings-3` |
| `apps/website/src/features/settings/repo.sqlite.ts` | 25 | tovu-dep | K5 K4db K5j | `K5-settings-1` |
| `apps/website/src/features/settings/site-title-preservation.sqlite.ts` | 10 | via `features/settings/site-title-preservation.ts` | verbatim | `K5-settings-1` |
| `apps/website/src/features/settings/site-title-preservation.ts` | 53 | tovu-dep | K4db | `K5-settings-1` |
| `apps/website/src/features/settings/site-title-write.ts` | 202 | tovu-dep | K5 | `K5-settings-1` |
| `apps/website/src/features/settings/tool-deps.ts` | 15 | tovu-dep | K4 | `K5-settings-1` |
| `apps/website/src/features/settings/tool-registrations.ts` | 149 | tovu-dep | K3 K4j | `K5-settings-4` |
| `apps/website/src/features/settings/ui-locales-tool.ts` | 83 | tovu-dep | K3 | `K5-settings-1` |
| `apps/website/src/features/settings/visitor-tools-agent-tools.ts` | 26 | tovu-dep | K5 | `K5-settings-1` |
| `apps/website/src/features/settings/visitor-tools-configure.ts` | 56 | tovu-dep | K5 K4 | `K5-settings-1` |
| `apps/website/src/features/settings/visitor-tools-permissions.ts` | 15 | tovu-dep | K5j K4x K5 | `K5-settings-2` |
| `apps/website/src/features/settings/visitor-tools-registrations.ts` | 99 | tovu-dep | K4j K5 K4 | `K5-settings-4` |
| `apps/website/src/features/settings/visitor-tools-service.ts` | 136 | tovu-dep | K5 K4 | `K5-settings-3` |
| `apps/website/src/features/settings/visitor-tools-write.ts` | 105 | tovu-dep | K5 | `K5-settings-2` |

## site-backup (42)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/site-backup/archive-extensions.ts` | 127 | xp3 | K5j K5x | `K5-site-backup-4` |
| `apps/website/src/features/site-backup/archive-manifest.ts` | 182 | tovu-dep | K5 | `K5-site-backup-3` |
| `apps/website/src/features/site-backup/archive-media.ts` | 94 | xp3 | K5x | `K5-site-backup-4` |
| `apps/website/src/features/site-backup/archive-paths.ts` | 91 | via `features/site-backup/share-policy.ts` | verbatim | `K5-site-backup-3` |
| `apps/website/src/features/site-backup/backup-service.ts` | 783 | tovu-dep | K5j K4 K5 K5x K4j | `K5-site-backup-8` |
| `apps/website/src/features/site-backup/bundled-export-file-policy.ts` | 43 | xp3 | K5j K5x | `K5-site-backup-1` |
| `apps/website/src/features/site-backup/credential-warnings.ts` | 52 | tovu-dep | K3 | `K5-site-backup-1` |
| `apps/website/src/features/site-backup/import-archive-reader.ts` | 86 | xp3 | K5j | `K5-site-backup-2` |
| `apps/website/src/features/site-backup/import-backend-steps.ts` | 175 | tovu-dep | K3 K5j K4 K5 | `K5-site-backup-3` |
| `apps/website/src/features/site-backup/import-backend.ts` | 220 | tovu-dep | K4j K4 K5 | `K5-site-backup-7` |
| `apps/website/src/features/site-backup/import-database.ts` | 140 | tovu-dep | K5j K3 | `K5-site-backup-2` |
| `apps/website/src/features/site-backup/import-keep-off.ts` | 193 | tovu-dep | K4j K4db K5 K5j | `K5-site-backup-1` |
| `apps/website/src/features/site-backup/import-plugin-state.ts` | 83 | tovu-dep | K5x K4x K5 | `K5-site-backup-5` |
| `apps/website/src/features/site-backup/import-registry.ts` | 163 | tovu-dep | K5j K4 | `K5-site-backup-2` |
| `apps/website/src/features/site-backup/import-restore-placement.ts` | 123 | xp3 | K5x | `K5-site-backup-4` |
| `apps/website/src/features/site-backup/import-restore.ts` | 105 | tovu-dep | K4j K4db K5 | `K5-site-backup-7` |
| `apps/website/src/features/site-backup/import-verifier-inventory.ts` | 265 | xp3 | K4j | `K5-site-backup-4` |
| `apps/website/src/features/site-backup/import-verifier-projection.ts` | 100 | xp3 | K5x | `K5-site-backup-5` |
| `apps/website/src/features/site-backup/import-verifier.ts` | 70 | xp3 | K4j | `K5-site-backup-7` |
| `apps/website/src/features/site-backup/package-file-inventory.ts` | 71 | tovu-dep | K5x K5 | `K5-site-backup-7` |
| `apps/website/src/features/site-backup/plan-content.ts` | 56 | xp3 | K5j | `K5-site-backup-4` |
| `apps/website/src/features/site-backup/push-content.ts` | 83 | via `features/source-control/provider-module.ts` | verbatim | `K5-site-backup-4` |
| `apps/website/src/features/site-backup/saved-keys-port.ts` | 19 | xp3 | K4j | `K5-site-backup-1` |
| `apps/website/src/features/site-backup/saved-keys.ts` | 44 | via `features/site-backup/share-policy.ts` | verbatim | `K5-site-backup-2` |
| `apps/website/src/features/site-backup/share-backend.ts` | 284 | tovu-dep | K5j K3 K4j K5 | `K5-site-backup-7` |
| `apps/website/src/features/site-backup/share-database/repo.sqlite.ts` | 446 | tovu-dep | K5 K3 K5x K5j K4j | `K5-site-backup-6` |
| `apps/website/src/features/site-backup/share-file-policy.ts` | 147 | tovu-dep | K5x K3 | `K5-site-backup-2` |
| `apps/website/src/features/site-backup/share-hosting.ts` | 138 | xp3 | K5x | `K5-site-backup-3` |
| `apps/website/src/features/site-backup/share-policy.ts` | 79 | tovu-dep | K4j K3 | `K5-site-backup-1` |
| `apps/website/src/features/site-backup/share-preparation-steps.ts` | 113 | xp3 | K5x K4 | `K5-site-backup-4` |
| `apps/website/src/features/site-backup/share-preparation.ts` | 53 | tovu-dep | K4x K4 K5 | `K5-site-backup-6` |
| `apps/website/src/features/site-backup/share-registry.ts` | 152 | xp3 | K5j | `K5-site-backup-2` |
| `apps/website/src/features/site-backup/share-service.ts` | 154 | via `features/site-backup/credential-warnings.ts` | verbatim | `K5-site-backup-3` |
| `apps/website/src/features/site-backup/share-zip.ts` | 152 | xp3 | K4j | `K5-site-backup-4` |
| `apps/website/src/features/site-backup/sources.ts` | 727 | xp3 | K5j K4 K4x | `K5-site-backup-3` |
| `apps/website/src/features/site-backup/static-copy.ts` | 172 | via `contracts/core/export-report.ts` | verbatim | `K5-site-backup-3` |
| `apps/website/src/features/site-backup/static-download-html.ts` | 137 | xp3 | K5x | `K5-site-backup-1` |
| `apps/website/src/features/site-backup/static-download-landing.ts` | 109 | xp3 | K5x K5j | `K5-site-backup-2` |
| `apps/website/src/features/site-backup/static-download-layout.ts` | 320 | via `features/site-backup/static-download-html.ts` | verbatim | `K5-site-backup-3` |
| `apps/website/src/features/site-backup/static-export-selection.ts` | 78 | via `features/site-backup/share-file-policy.ts` | verbatim | `K5-site-backup-3` |
| `apps/website/src/features/site-backup/static-site-packager.ts` | 43 | via `contracts/core/export-report.ts` | verbatim | `K5-site-backup-5` |
| `apps/website/src/features/site-backup/tool-registrations.ts` | 251 | xp3 | K5j K4j K5x | `K5-site-backup-8` |

## site-export (8)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/site-export/export-html-policy.ts` | 82 | xp3 | K5x K5 | `K5-site-export-1` |
| `apps/website/src/features/site-export/index.ts` | 17 | via `features/site-export/route-manifest.ts` | verbatim | `K5-site-export-2` |
| `apps/website/src/features/site-export/media-original-urls.ts` | 101 | xp3 | K4j K5j K5x | `K5-site-export-1` |
| `apps/website/src/features/site-export/route-manifest.ts` | 340 | xp3 | K4x K5 K5x K4j | `K5-site-export-1` |
| `apps/website/src/features/site-export/site-exporter.ts` | 638 | xp3 | K5j K5 | `K5-site-export-2` |
| `apps/website/src/features/site-export/static-security-headers.ts` | 49 | xp3 | K5x | `K5-site-export-1` |
| `apps/website/src/features/site-export/theme-preview-manifest.ts` | 33 | xp3 | K5x | `K5-site-export-2` |
| `apps/website/src/features/site-export/theme-preview-report.ts` | 27 | via `contracts/core/export-report.ts` | verbatim | `K5-site-export-1` |

## site-inspection (8)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/site-inspection/admin-screens.generated.ts` | 64 | xp3 | K4j | `K5-site-inspection-1` |
| `apps/website/src/features/site-inspection/agent-tools.ts` | 191 | xp3 | K5j | `K5-site-inspection-1` |
| `apps/website/src/features/site-inspection/deps.ts` | 166 | via `features/site-inspection/live-url.ts` | verbatim | `K5-site-inspection-1` |
| `apps/website/src/features/site-inspection/index.ts` | 90 | via `features/site-inspection/published-page.ts` | verbatim | `K5-site-inspection-2` |
| `apps/website/src/features/site-inspection/live-url.ts` | 191 | tovu-dep | K5 K4x K5j | `K5-site-inspection-1` |
| `apps/website/src/features/site-inspection/published-page.ts` | 253 | xp3 | K5j | `K5-site-inspection-1` |
| `apps/website/src/features/site-inspection/site-path-policy.ts` | 53 | xp3 | K5j | `K5-site-inspection-1` |
| `apps/website/src/features/site-inspection/tool-registrations.ts` | 207 | tovu-dep | K4 K5j | `K5-site-inspection-2` |

## site-search (3)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/site-search/access.ts` | 79 | tovu-dep | K4db | `K5-site-search-1` |
| `apps/website/src/features/site-search/cms-document-source.ts` | 174 | tovu-dep | K4db K5 K5x | `K5-site-search-1` |
| `apps/website/src/features/site-search/index-state-store.ts` | 265 | xp3 | K4j | `K5-site-search-1` |

## skills (4)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/skills/install-service.ts` | 56 | via `features/skills/layout.ts` | verbatim | `K5-skills-1` |
| `apps/website/src/features/skills/install-tool.ts` | 111 | xp3 | K5j | `K5-skills-1` |
| `apps/website/src/features/skills/layout.ts` | 91 | tovu-dep | K5 | `K5-skills-1` |
| `apps/website/src/features/skills/tool-registrations.ts` | 159 | tovu-dep | K5j K5 | `K5-skills-1` |

## source-control (15)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/source-control/commit-site.ts` | 155 | xp3 | K5j K4j | `K5-source-control-2` |
| `apps/website/src/features/source-control/commit-target.ts` | 61 | via `features/source-control/provider-module.ts` | verbatim | `K5-source-control-1` |
| `apps/website/src/features/source-control/credential-setup.ts` | 256 | tovu-dep | K5x K5j K3 | `K5-source-control-3` |
| `apps/website/src/features/source-control/index.ts` | 36 | via `features/source-control/types.ts` | verbatim | `K5-source-control-3` |
| `apps/website/src/features/source-control/provider-kit.ts` | 52 | tovu-dep | K5 K5j | `K5-source-control-1` |
| `apps/website/src/features/source-control/provider-module.ts` | 219 | tovu-dep | K4 | `K5-source-control-1` |
| `apps/website/src/features/source-control/provider-registry.ts` | 319 | tovu-dep | K3 K5x K4 | `K5-source-control-2` |
| `apps/website/src/features/source-control/repo.memory.ts` | 16 | xp3 | K5j K5x K4x | `K5-source-control-1` |
| `apps/website/src/features/source-control/source-control-credential-repo.sqlite.ts` | 11 | via `features/source-control/source-control-credential-repo.ts` | verbatim | `K5-source-control-1` |
| `apps/website/src/features/source-control/source-control-credential-repo.ts` | 19 | tovu-dep | K5j K4j K5x K4x K4db | `K5-source-control-1` |
| `apps/website/src/features/source-control/static-site-packager-port.ts` | 33 | via `contracts/core/export-report.ts` | verbatim | `K5-source-control-1` |
| `apps/website/src/features/source-control/store.ts` | 581 | tovu-dep | K5 K5j K4j K5x K4 | `K5-source-control-2` |
| `apps/website/src/features/source-control/tool-registrations.ts` | 518 | tovu-dep | K4x K5x K5j K4j K4 | `K5-source-control-3` |
| `apps/website/src/features/source-control/types.ts` | 108 | xp3 | K4j K4x | `K5-source-control-1` |
| `apps/website/src/features/source-control/write-port.ts` | 36 | tovu-dep | K4 K5x | `K5-source-control-2` |

## taxonomy (5)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/taxonomy/publish-content.ts` | 118 | tovu-dep | K4 | `K5-taxonomy-1` |
| `apps/website/src/features/taxonomy/publish-term-ids.ts` | 118 | tovu-dep | K4 | `K5-taxonomy-1` |
| `apps/website/src/features/taxonomy/repo.sqlite.ts` | 51 | tovu-dep | K5 K4db | `K5-taxonomy-1` |
| `apps/website/src/features/taxonomy/term-sync.ts` | 3 | via `features/taxonomy/publish-term-ids.ts` | verbatim | `K5-taxonomy-1` |
| `apps/website/src/features/taxonomy/tool-registrations.ts` | 167 | xp3 | K5 K5j | `K5-taxonomy-1` |

## theme (68)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/theme/active-theme-publish-content.ts` | 112 | tovu-dep | K4 K5 | `K5-theme-4` |
| `apps/website/src/features/theme/active-theme.ts` | 202 | via `features/theme/theme-discovery.ts` | K5 | `K5-theme-4` |
| `apps/website/src/features/theme/asset-operations.ts` | 240 | via `features/theme/theme-file-policy.ts` | verbatim | `K5-theme-5` |
| `apps/website/src/features/theme/asset-path-rewrites.ts` | 24 | via `features/theme/migration/theme-migration-plan.ts` | verbatim | `K5-theme-2` |
| `apps/website/src/features/theme/build-conformance.ts` | 543 | via `features/theme/static-asset-contract.ts` | verbatim | `K5-theme-3` |
| `apps/website/src/features/theme/capability-card.ts` | 30 | xp3 | K4j | `K5-theme-1` |
| `apps/website/src/features/theme/catalog.ts` | 4 | via `features/theme/theme.ts` | verbatim | `K5-theme-3` |
| `apps/website/src/features/theme/code-tier-asset-normalizer.ts` | 419 | via `features/theme/static-asset-contract.ts` | verbatim | `K5-theme-3` |
| `apps/website/src/features/theme/duplicate-theme-tool.ts` | 178 | via `features/theme/duplicate-theme.ts` | verbatim | `K5-theme-5` |
| `apps/website/src/features/theme/duplicate-theme.ts` | 421 | via `features/theme/asset-path-rewrites.ts` | verbatim | `K5-theme-5` |
| `apps/website/src/features/theme/file-identity-lock.ts` | 283 | via `features/theme/theme-file-policy.ts` | verbatim | `K5-theme-2` |
| `apps/website/src/features/theme/file-mutation-tools.ts` | 75 | via `features/theme/asset-operations.ts` | verbatim | `K5-theme-5` |
| `apps/website/src/features/theme/font-links.ts` | 37 | via `features/theme/render-contract.ts` | K4 | `K5-theme-1` |
| `apps/website/src/features/theme/import-theme-file-tool.ts` | 180 | xp3 | K5j | `K5-theme-7` |
| `apps/website/src/features/theme/index.ts` | 172 | via `features/theme/theme-discovery.ts` | verbatim | `V-theme-6` |
| `apps/website/src/features/theme/migration/migrate-theme.ts` | 373 | via `features/theme/asset-path-rewrites.ts` | verbatim | `K5-theme-4` |
| `apps/website/src/features/theme/migration/theme-migration-plan.ts` | 281 | via `features/theme/render-contract.ts` | verbatim | `K5-theme-1` |
| `apps/website/src/features/theme/page-publication.ts` | 65 | via `features/theme/theme-discovery.ts` | verbatim | `K5-theme-4` |
| `apps/website/src/features/theme/page-publish-tool.ts` | 58 | via `features/theme/theme.ts` | verbatim | `K5-theme-4` |
| `apps/website/src/features/theme/preview-switcher-html.ts` | 128 | via `features/theme/preview-switcher.ts` | verbatim | `K5-theme-4` |
| `apps/website/src/features/theme/preview-switcher-tools.ts` | 82 | via `features/theme/preview-switcher.ts` | verbatim | `K5-theme-7` |
| `apps/website/src/features/theme/preview-switcher.ts` | 128 | via `features/theme/theme.ts` | verbatim | `K5-theme-3` |
| `apps/website/src/features/theme/public-page-security-headers.ts` | 28 | via `features/theme/public-theme-resources.ts` | K5 | `K5-theme-1` |
| `apps/website/src/features/theme/public-theme-resources.ts` | 38 | tovu-dep | K5 K4 | `K5-theme-1` |
| `apps/website/src/features/theme/publish-content.ts` | 818 | via `features/media/index.ts` | verbatim | `K5-theme-4` |
| `apps/website/src/features/theme/render-contract.ts` | 301 | xp3 | K4j K4 | `K5-theme-1` |
| `apps/website/src/features/theme/rendering.ts` | 10 | via `features/theme/static-render.ts` | verbatim | `K5-theme-2` |
| `apps/website/src/features/theme/save-theme-original.ts` | 56 | via `features/theme/sync-originals.ts` | verbatim | `K5-theme-4` |
| `apps/website/src/features/theme/set-active-theme-tool.ts` | 196 | xp3 | K4j | `K5-theme-5` |
| `apps/website/src/features/theme/static-asset-contract.ts` | 116 | via `features/theme/static-render.ts` | verbatim | `K5-theme-3` |
| `apps/website/src/features/theme/static-page-shell.ts` | 168 | via `features/theme/theme.ts` | verbatim | `K5-theme-3` |
| `apps/website/src/features/theme/static-portability-index.ts` | 235 | via `features/theme/theme.ts` | K5 | `K5-theme-3` |
| `apps/website/src/features/theme/static-render-menus.ts` | 271 | via `features/theme/theme.ts` | K5 | `K5-theme-1` |
| `apps/website/src/features/theme/static-render.ts` | 257 | via `features/theme/theme.ts` | K5 | `K5-theme-2` |
| `apps/website/src/features/theme/static-template-choice.ts` | 188 | via `features/theme/theme.ts` | verbatim | `K5-theme-4` |
| `apps/website/src/features/theme/static-template-resolution.ts` | 140 | via `features/theme/theme.ts` | verbatim | `K5-theme-3` |
| `apps/website/src/features/theme/structure-only-theme.ts` | 55 | xp3 | K5j | `K5-theme-5` |
| `apps/website/src/features/theme/sync-originals.ts` | 200 | via `features/theme/theme-discovery.ts` | verbatim | `K5-theme-4` |
| `apps/website/src/features/theme/theme-discovery.ts` | 230 | via `features/theme/render-contract.ts` | K5 | `K5-theme-4` |
| `apps/website/src/features/theme/theme-file-identity-tools.ts` | 178 | via `features/theme/asset-operations.ts` | verbatim | `K5-theme-7` |
| `apps/website/src/features/theme/theme-file-import.ts` | 181 | tovu-dep | K4 | `K5-theme-5` |
| `apps/website/src/features/theme/theme-file-policy.ts` | 201 | via `features/theme/render-contract.ts` | verbatim | `K5-theme-2` |
| `apps/website/src/features/theme/theme-file-trash-tools.ts` | 140 | via `features/theme/asset-operations.ts` | verbatim | `K5-theme-7` |
| `apps/website/src/features/theme/theme-file-write-ports.ts` | 45 | xp3 | K5j | `K5-theme-1` |
| `apps/website/src/features/theme/theme-file-writing.ts` | 105 | via `features/theme/theme-file-write-ports.ts` | verbatim | `K5-theme-2` |
| `apps/website/src/features/theme/theme-generated-restore.ts` | 68 | via `features/theme/render-contract.ts` | verbatim | `K5-theme-2` |
| `apps/website/src/features/theme/theme-manifest-fields.ts` | 110 | xp3 | K4j | `K5-theme-2` |
| `apps/website/src/features/theme/theme-manifest.ts` | 175 | xp3 | K5j K4 | `K5-theme-2` |
| `apps/website/src/features/theme/theme-page-eligibility.ts` | 77 | via `features/theme/theme.ts` | verbatim | `K5-theme-4` |
| `apps/website/src/features/theme/theme-preview-image.ts` | 117 | via `features/theme/theme-file-policy.ts` | verbatim | `K5-theme-2` |
| `apps/website/src/features/theme/theme-read-tools.ts` | 125 | via `features/theme/asset-operations.ts` | K5 | `K5-theme-7` |
| `apps/website/src/features/theme/theme-reset-file-tool.ts` | 121 | via `features/theme/asset-operations.ts` | verbatim | `K5-theme-7` |
| `apps/website/src/features/theme/theme-roster-ports.ts` | 5 | via `features/theme/theme-discovery.ts` | verbatim | `K5-theme-4` |
| `apps/website/src/features/theme/theme-static-assets.ts` | 237 | via `features/theme/render-contract.ts` | K5 | `K5-theme-2` |
| `apps/website/src/features/theme/theme-template-sources.ts` | 139 | via `features/theme/render-contract.ts` | verbatim | `K5-theme-2` |
| `apps/website/src/features/theme/theme-tool-editing.ts` | 69 | via `features/theme/asset-operations.ts` | verbatim | `K5-theme-7` |
| `apps/website/src/features/theme/theme-tool-view.ts` | 42 | via `features/theme/theme.ts` | verbatim | `K5-theme-4` |
| `apps/website/src/features/theme/theme-trash-binding.ts` | 45 | via `features/trash/index.ts` | verbatim | `K5-theme-4` |
| `apps/website/src/features/theme/theme-watch-bindings.ts` | 19 | via `features/theme/theme-roster-ports.ts` | verbatim | `K5-theme-5` |
| `apps/website/src/features/theme/theme-write-tools.ts` | 101 | via `features/theme/asset-operations.ts` | verbatim | `K5-theme-7` |
| `apps/website/src/features/theme/theme.ts` | 238 | tovu-dep | K5 | `K5-theme-3` |
| `apps/website/src/features/theme/token-aliases.ts` | 54 | via `features/theme/theme.ts` | verbatim | `K5-theme-1` |
| `apps/website/src/features/theme/tool-registrations.ts` | 141 | xp3 | K5j | `K5-theme-7` |
| `apps/website/src/features/theme/trash-theme-tool.ts` | 194 | via `features/trash/index.ts` | verbatim | `K5-theme-7` |
| `apps/website/src/features/theme/validation/structure.ts` | 315 | via `features/theme/theme-file-policy.ts` | verbatim | `K5-theme-2` |
| `apps/website/src/features/theme/validation/validate-theme-package.ts` | 259 | xp3 | K5j | `K5-theme-4` |
| `apps/website/src/features/theme/verify-active-theme.ts` | 73 | via `features/presentation/index.ts` | K5 | `K5-theme-5` |
| `apps/website/src/features/theme/visitor-publication.ts` | 157 | xp3 | K4j | `K5-theme-2` |

## tool-audit (5)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/tool-audit/repo.memory.ts` | 44 | xp3 | K4j | `K5-tool-audit-1` |
| `apps/website/src/features/tool-audit/repo.sqlite.ts` | 18 | tovu-dep | K5 K4db | `K5-tool-audit-1` |
| `apps/website/src/features/tool-audit/repo.ts` | 160 | tovu-dep | K4db K4j | `K5-tool-audit-1` |
| `apps/website/src/features/tool-audit/tool-gaps.repo.ts` | 25 | tovu-dep | K5j K4db | `K5-tool-audit-1` |
| `apps/website/src/features/tool-audit/tool-gaps.ts` | 7 | xp3 | K4j | `K5-tool-audit-1` |

## trash (16)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/trash/adapters/comment.ts` | 75 | via `features/trash/adapters/marker-sql.ts` | verbatim | `K5-trash-1` |
| `apps/website/src/features/trash/adapters/marker-sql.ts` | 148 | tovu-dep | K4db | `K5-trash-1` |
| `apps/website/src/features/trash/adapters/media.ts` | 96 | via `features/trash/adapters/marker-sql.ts` | verbatim | `K5-trash-1` |
| `apps/website/src/features/trash/adapters/member.ts` | 65 | via `features/trash/db-port.ts` | verbatim | `K5-trash-1` |
| `apps/website/src/features/trash/adapters/post.ts` | 92 | xp3 | K5j | `K5-trash-1` |
| `apps/website/src/features/trash/adapters/redirect.ts` | 74 | via `features/trash/adapters/marker-sql.ts` | K5 | `K5-trash-1` |
| `apps/website/src/features/trash/adapters/user.ts` | 250 | tovu-dep | K4x K4db K4j | `K5-trash-1` |
| `apps/website/src/features/trash/agent-delete-policy.ts` | 6 | via `contracts/headless/index.ts` | verbatim | `K5-trash-1` |
| `apps/website/src/features/trash/db-port.ts` | 20 | tovu-dep | K4db | `K5-trash-1` |
| `apps/website/src/features/trash/index.ts` | 89 | via `features/trash/repo.sqlite.ts` | verbatim | `K4-trash-2` |
| `apps/website/src/features/trash/move-to-trash.ts` | 167 | via `features/trash/permissions.ts` | verbatim | `K5-trash-1` |
| `apps/website/src/features/trash/permissions.ts` | 147 | via `features/trash/adapters/comment.ts` | verbatim | `K5-trash-1` |
| `apps/website/src/features/trash/repo.sqlite.ts` | 38 | tovu-dep | K5 K4db | `K5-trash-1` |
| `apps/website/src/features/trash/tool-kinds.ts` | 41 | via `features/trash/adapters/comment.ts` | verbatim | `K5-trash-1` |
| `apps/website/src/features/trash/tool-registrations.ts` | 77 | xp3 | K4j | `K4-trash-2` |
| `apps/website/src/features/trash/trash-item-tool.ts` | 292 | via `features/trash/adapters/comment.ts` | verbatim | `K4-trash-2` |

## vendor-credentials (6)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/vendor-credentials/index.ts` | 13 | via `features/vendor-credentials/types.ts` | verbatim | `K5-vendor-credentials-1` |
| `apps/website/src/features/vendor-credentials/repo.memory.ts` | 10 | xp3 | K5j | `K5-vendor-credentials-1` |
| `apps/website/src/features/vendor-credentials/types.ts` | 67 | xp3 | K4j | `K5-vendor-credentials-1` |
| `apps/website/src/features/vendor-credentials/vault-adapter.ts` | 176 | tovu-dep | K5j K4x K5 | `K5-vendor-credentials-1` |
| `apps/website/src/features/vendor-credentials/vendor-credential-repo.sqlite.ts` | 11 | via `features/vendor-credentials/vendor-credential-repo.ts` | verbatim | `K5-vendor-credentials-1` |
| `apps/website/src/features/vendor-credentials/vendor-credential-repo.ts` | 12 | tovu-dep | K5j K4j K4db | `K5-vendor-credentials-1` |

## web (3)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/web/agent-tools.ts` | 25 | xp3 | K5j | `K5-web-1` |
| `apps/website/src/features/web/tool-registrations.ts` | 83 | xp3 | K5j K5x | `K5-web-1` |
| `apps/website/src/features/web/web-page.ts` | 32 | tovu-dep | K5j K4 | `K5-web-1` |

## web-screenshot (9)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/web-screenshot/agent-tools.ts` | 52 | via `features/web-screenshot/web-screenshot.ts` | verbatim | `K5-web-screenshot-1` |
| `apps/website/src/features/web-screenshot/capture-files.ts` | 48 | via `features/web-screenshot/web-screenshot.ts` | verbatim | `K5-web-screenshot-1` |
| `apps/website/src/features/web-screenshot/desktop-page-capture.ts` | 75 | tovu-dep | K5j K5 K4 | `K5-web-screenshot-1` |
| `apps/website/src/features/web-screenshot/own-site-opener.ts` | 50 | via `features/web-screenshot/web-screenshot.ts` | verbatim | `K5-web-screenshot-1` |
| `apps/website/src/features/web-screenshot/playwright-page-capture.ts` | 323 | tovu-dep | K5j K5 K4 | `K5-web-screenshot-1` |
| `apps/website/src/features/web-screenshot/request-guard.ts` | 16 | tovu-dep | K5j K4 K4j | `K5-web-screenshot-1` |
| `apps/website/src/features/web-screenshot/screenshot-image.ts` | 15 | xp3 | K4j | `K5-web-screenshot-1` |
| `apps/website/src/features/web-screenshot/tool-registrations.ts` | 70 | xp3 | K5j | `K5-web-screenshot-2` |
| `apps/website/src/features/web-screenshot/web-screenshot.ts` | 448 | xp3 | K4j | `K5-web-screenshot-1` |

## webhooks (12)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/webhooks/delivery.ts` | 74 | via `features/webhooks/ports.ts` | verbatim | `K5-webhooks-1` |
| `apps/website/src/features/webhooks/http.memory.ts` | 68 | via `features/webhooks/ports.ts` | verbatim | `K5-webhooks-1` |
| `apps/website/src/features/webhooks/index.ts` | 94 | xp3 | K4j | `K5-webhooks-4` |
| `apps/website/src/features/webhooks/keyring.env.ts` | 482 | via `features/webhooks/site-key-sources.ts` | verbatim | `K5-webhooks-1` |
| `apps/website/src/features/webhooks/keyring.memory.ts` | 38 | xp3 | K5j | `K5-webhooks-3` |
| `apps/website/src/features/webhooks/ports.ts` | 29 | tovu-dep | K4 | `K5-webhooks-1` |
| `apps/website/src/features/webhooks/repo.memory.ts` | 287 | via `features/webhooks/ports.ts` | verbatim | `K5-webhooks-1` |
| `apps/website/src/features/webhooks/secret-scan-guard.ts` | 452 | xp3 | K5j | `K5-webhooks-1` |
| `apps/website/src/features/webhooks/secret-sealer.aesgcm.ts` | 158 | xp3 | K5j K4j | `K5-webhooks-2` |
| `apps/website/src/features/webhooks/site-key-ensure.ts` | 842 | tovu-dep | K5 K5j | `K5-webhooks-4` |
| `apps/website/src/features/webhooks/site-key-sources.ts` | 297 | tovu-dep | K4 K5 | `K5-webhooks-1` |
| `apps/website/src/features/webhooks/tool-registrations.ts` | 124 | xp3 | K5j | `K5-webhooks-4` |

## webmcp (1)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/webmcp/published-html.ts` | 18 | xp3 | K5j K5 | `K5-webmcp-1` |

## widgets (5)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/widgets/capability-card.ts` | 35 | xp3 | K4j | `K5-widgets-1` |
| `apps/website/src/features/widgets/deps.ts` | 146 | via `features/post/post-update.ts` | verbatim | `K5-widgets-1` |
| `apps/website/src/features/widgets/publish-content.ts` | 263 | tovu-dep | K5 K4 | `K5-widgets-1` |
| `apps/website/src/features/widgets/repo.sqlite.ts` | 20 | tovu-dep | K5 K4j K4db | `K5-widgets-1` |
| `apps/website/src/features/widgets/tool-registrations.ts` | 65 | xp3 | K5j | `K5-widgets-1` |

## workspace (2)

| file | LOC | old reason | K work | step |
|---|---|---|---|---|
| `apps/website/src/features/workspace/index.ts` | 42 | via `features/workspace/repo.sqlite.ts` | verbatim | `K5-workspace-1` |
| `apps/website/src/features/workspace/repo.sqlite.ts` | 18 | tovu-dep | K5 K4db | `K5-workspace-1` |
