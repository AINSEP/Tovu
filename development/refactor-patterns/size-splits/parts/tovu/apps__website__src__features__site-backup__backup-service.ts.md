### tovu:apps/website/src/features/site-backup/backup-service.ts
- **Over:** file 535 lines (no function over 100)
- **Phase:** after-move (MIXED) · **Batch:** size-57
- **Tests:** `apps/website/src/features/site-backup/__tests__/tool-registrations.unit.test.ts`, `apps/website/src/features/site-backup/__tests__/tool-registrations-host-connection.unit.test.ts`, `apps/website/src/features/source-control/__tests__/github-backup-secrets.integration.test.ts`, `apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-backups.integration.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `SITE_BACKUP_DOMAIN`, `DOMAIN`, `PLAN_TOOL_ID`, `SITE_BACKUP_PUSH_TOOL_ID`, `PUSH_PERMISSION`, `CREDENTIAL_WRITE_PERMISSION`, `SNAPSHOT_SCOPE_ID`, `SiteBackupCall`, `SiteBackupToolDeps`, `Refusal`, `failureLog`, `logFailureDetail` | ids, deps, refusal shape (stay) |
| B | `ResolvedBackupCredential` … `resolveBackupCredential`, `INSPECT_CODES`, `providerRefusal`, `inspect` | credential + provider resolution (stays: needs A's types) |
| C | `ParsedPlanInput`, `optionalString`, `parseInclude`, `requireIncludeRecord`, `readIncludeSwitches`, `parseFolder`, `requireUnreservedFolder`, `parsePlanInput` | parse/validate `site_backup_plan` input (self-contained leaf) |
| D | `requireBackupPermissions`, `UNAVAILABLE`, `readSiteName`, `planResult`, `planSiteBackup`, `savePlan`, `PreparedContent`, `captureBackupDatabase`, `prepareContent` | plan tool (stay) |
| E | `PushResult`, `pushRefusal`, `pushPlannedBackup`, `PLAN_TAKE_MESSAGES`, `PUSH_WAIT_MS`, `DEFAULT_PUSH_JOBS`, `inProgressResult`, `pushWaitBudget`, `pushSiteBackup` | push tool (stay) |

- **Splits:**
  1. NEW `apps/website/src/features/site-backup/backup-service-plan-input.ts` — job: parse and validate the `site_backup_plan` tool input (fields, include switches, backup folder). Moves unit C in source order with every doc comment (`parsePlanInput`'s `@throws` doc, `requireUnreservedFolder`'s reserved-folder doc). The `// site_backup_plan` banner (~L398-400) stays in the original, now directly above `requireBackupPermissions`. Exports: `ParsedPlanInput` (type), `parsePlanInput`, `requireUnreservedFolder`. Takes only the imports those bodies use (validation error class, include-scope constants, host-facts type); imports nothing from `backup-service.ts`.
  2. `backup-service.ts` imports `{ parsePlanInput, requireUnreservedFolder, type ParsedPlanInput }` from `./backup-service-plan-input.js`; drop imports only the moved code used.
- **Importers to update:** none (all moved names were module-private).
- **After:** `backup-service.ts` ~477; `backup-service-plan-input.ts` ~65.
- **Risks / notes:** Copy the file-header paragraph about plan-input validation order ("malformed field — before any permission check") into the new file's header if the `@file` block has one. Pure move — no ordering effects. Survey label MIXED: whichever part later moves to Jini, unit C is plain input parsing and stays usable from either side.
