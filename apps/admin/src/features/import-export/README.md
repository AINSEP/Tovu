# import-export

Operations → Import & Export (`/admin/import-export`). The screen itself — `ImportExport`, its tabs,
the Other tab's cards, the Git backup card (`GitBackupCard`), its state hook (`useGitBackup`), rules,
port contract (`GitBackupPort`, `createFakeGitBackupPort`) and dictionary — lives in
`@jini-ai/admin/screens/import-export`. This folder keeps the host wiring and the parts that read
this app's admin HTTP client, locale and Sites feature.

What stays here:

- `ImportExportPanel.tsx` — the mount (`panel-pages.ts` lazy-loads it).
- `hooks/use-import-export.hooks.ts` — `useImportExportTranslate` (this app's locale over the Jini
  dictionary), `useSiteTransferTranslate` (the Sites dictionary) and `useSitesSectionAvailable`
  (Sites availability: desktop shell, `switchingEnabled`).
- `hooks/use-git-backup.hooks.ts` — `defaultGitBackupPort` (Source Control list + `site-backups`
  plan/push over `authenticatedAdminRequest`) and `useWiredGitBackup`.
- `api/import-export-api.ts` (+ `.types.ts`) — the static-export trigger/poll calls over this app's
  `request`; used by Deployment, not by the moved screen.

## Wiring

`ImportExportPanel` renders `ImportExport` with these required props (each overridable, for tests):

| prop | host value |
|---|---|
| `useTranslate` | `useImportExportTranslate` |
| `useGitBackup` | `useWiredGitBackup` → `useGitBackup({ port: defaultGitBackupPort, t, describeApiError })` |
| `useTransferTranslate` | `useSiteTransferTranslate` |
| `useSitesAvailable` | `useSitesSectionAvailable` |
| `SiteExportTab`, `SiteImportTab` | the Sites feature's own tabs (`features/sites`) |
| `navigate` | `navigate` from `@jini-ai/admin/shell/lib/router` |
| `handleLabels` | `IMPORT_EXPORT_HANDLE_LABELS` — the Export/Import tabs' agent labels; product copy (`.tovu.zip`) |

`useGitBackup` takes the port and `describeApiError` (from `lib/admin-http/request`) as fields of
its required args.

Stylesheet: no side-effect CSS import; the rules live in `styles.css` (`---- Import & Export`). The
screen renders `jini-*` classes only: the generic `jini-page*`, `jini-card*`, `jini-btn-*`,
`jini-field*`, `jini-notice*` aliases, plus `jini-import-export-{grid,card,card-wide,page}` and
`jini-import-export-git-backup-{note,facts,actions}`, aliased beside the old
`import-export-*` / `git-backup-*` selectors.
