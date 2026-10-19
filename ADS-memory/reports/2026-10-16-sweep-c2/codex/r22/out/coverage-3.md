TDD(Direct): Selected TDD for branch-focused test design. Added 13 cases across seven existing test files; production code unchanged.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/admin/src/features/recovery/__tests__/rules.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/roles/__tests__/rules.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/security/__tests__/site-key-status.rules.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/settings/__tests__/ExternalMcpToolsModal.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/sites/__tests__/create-site-plugin-tokens.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/features/sites/__tests__/sites-home-setting.unit.test.tsx
- /Users/la/Programming/Tovu/apps/admin/src/lib/__tests__/audit-admin-request-regressions.unit.test.ts

PER FILE:

| Source | Added coverage scenarios |
|---|---|
| `recovery/rules.ts:79` | Unknown cost-class fallback preserves server text. |
| `roles/roles-i18n.ts:1286` | No change; unreachable fallback below. |
| `roles/rules.ts:57` | Missing and empty API error codes. |
| `security/hooks/site-key-status.rules.ts:11–12` | Active file key; omitted environment-variable name. |
| `settings/ExternalMcpToolsModal.hooks.ts:58` | Non-HTML opener using real SVG focus. Null Close-ref path remains unexercised. |
| `sites/hooks/use-create-site-plugin-tokens.hooks.ts:49` | Display-name fallback before plugins load, then resolved names. |
| `sites/hooks/use-sites-home.hooks.ts:8,15` | Default API/options; non-Error rejection; successful retry. |
| `skills/api.ts:21` | Independently malformed name, guidance, and bundled-files fields. |

UNREACHABLE:

- [roles-i18n.ts:1286](/Users/la/Programming/Tovu/apps/admin/src/features/roles/roles-i18n.ts:1286): `?? {}` cannot execute with the current tables; all 21 translation locales have audit entries.
- [ExternalMcpToolsModal.hooks.ts:56](/Users/la/Programming/Tovu/apps/admin/src/features/settings/ExternalMcpToolsModal.hooks.ts:56): null-ref fallback is unreachable through the current modal consumer, which unconditionally attaches Close before the effect. Guard retained.

NOT DONE:

Tests and coverage remain unverified, as instructed; 100% is not claimed. No prohibited commands or git mutations were performed. `git diff --check` passed. Owner decisions remain for the guards above.
