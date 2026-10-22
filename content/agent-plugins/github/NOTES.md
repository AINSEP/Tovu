# GitHub plugin notes

## Why this plugin is seeded enabled (moved from core `bundled-catalog.ts`)
`github` hosts the only git-host provider (`features/source-control/provider-registry.ts`), moved out of
core 2026-09-29: with it off, committing the site, `custom_credential_write_files`, site backups and the
Source Control form's account-name check would all stop. It opts in with
`extensions.tovu.seededEnabled: true` in its own `plugin.json` (2026-10-22).
