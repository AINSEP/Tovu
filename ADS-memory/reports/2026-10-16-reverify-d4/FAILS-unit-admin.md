## unit-admin--1: FAIL (rc=1, 334s)
```
cd /Users/la/Programming/Tovu/apps/admin && npx vitest run --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=/Users/la/Programming/Tovu/ADS-memory/reports/2026-10-16-reverify-d4/logs/tovu-admin.json src/__tests__/unit/app-agent-page-identity.unit.test.tsx src/__tests__/unit/app-confirm-dialog-i18n.unit.test.tsx src/__tests__/unit/app-logout-confirm.unit.test.tsx src/__tests__/unit/app-route-prototype-keys.unit.test.tsx src/__tests__/unit/app-sites-section-visibility.unit.test.tsx src/components/__tests__/WidgetPickerDialog.hooks.unit.test.tsx src/features/auth/__tests__/login-default-credential.unit.test.tsx src/features/collections/__tests__/CollectionEntries.unit.test.tsx src/features/collections/__tests__/collections-agent-drive.unit.test.tsx src/features/members/__tests__/Members.unit.test.tsx src/features/members/__tests__/use-members.hooks.unit.test.ts src/features/menus/__tests__/MenuEditor.unit.test.tsx src/features/menus/__tests__/use-menus.hooks.unit.test.tsx src/features/sites/__tests__/AllSitesTab.unit.test.tsx src/features/source-control/__tests__/SourceControl.unit.test.tsx src/features/themes/__tests__/theme-preview-dirty.unit.test.tsx src/features/users/__tests__/users-agent-drive.unit.test.tsx src/hooks/__tests__/admin-locale-dependencies.hooks.test.ts src/hooks/__tests__/content-refresh-coverage.unit.test.ts src/hooks/__tests__/use-admin-appearance.unit.test.ts src/hooks/__tests__/use-admin-document-locale.unit.test.ts src/hooks/__tests__/use-admin-locale.hooks.test.ts src/integrations/jini-admin/__tests__/widgets-swap.unit.test.tsx src/lib/__tests__/assistant-transport.run-status.unit.test.ts src/lib/__tests__/dictionary-lookup-sinks.unit.test.ts src/lib/fetch-query/__tests__/devtools-bundle.unit.test.ts src/lib/fetch-query/__tests__/provider.unit.test.tsx
```
```
7:Error: An error occurred while trying to read the map file at typescript.js.map
8:Error: ENOENT: no such file or directory, open '/Users/la/Programming/Tovu/apps/admin/node_modules/typescript/lib/typescript.js.map'
77:     × keeps vendor tooling out of the static '../../../features/observability/queri…' bundle 5636ms
85:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
92:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
99:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
106:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
113:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
120:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
127:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
134:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
141:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
148:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
155:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
169:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
206:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
213:[AssistantDock] failed to load execution config Error: getSettingsEffective response missing data
220:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
227:[AssistantDock] failed to load execution config Error: getSettingsEffective response missing data
234:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
241:[AssistantDock] failed to load execution config Error: getSettingsEffective response missing data
248:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
255:[AssistantDock] failed to load execution config Error: getSettingsEffective response missing data
267:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
280:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
287:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
294:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
301:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
322:[AssistantDock] failed to load stored BYOK credential state Error: getAdminExecutionCredential response missing data
347: FAIL  src/lib/fetch-query/__tests__/devtools-bundle.unit.test.ts > Observability tools bundle isolation > keeps vendor tooling out of the static '../../../features/observability/queri…' bundle
348:Error: Test timed out in 5000ms.
349:If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
```
full log: /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-16-reverify-d4/logs/unit-admin--1.log

