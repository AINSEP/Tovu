# storage Overview

Read-only measurement of one website folder in the categories and classes the owner sees
(P11 storage budget). Nothing here opens a database, writes, cleans or asks for approval.

## Wiring

- `measure.ts` — `measureSiteStorage({ siteDir, paths }, { fs })` (ST-14). Callers pass paths they
  already resolved; the walk is Jini's `measureStorageTree` (`@jini-ai/platform/retention`).
- `cli/commands/storage-report.ts` — `tovu storage report <dir> [--json]` (ST-16, report half) is the
  first caller. `resolveSiteStorageLocations` derives each location from the same resolvers the server
  uses (`mediaUploadsDir`, `siteThemesDir`, `pluginsInstallDir`, the database's `ops/` folder) and
  resolves databases with `reserveIdentity: false`, so the command reserves no registry identity and
  creates no folder (the share folder is derived, never made). Databases kept outside the website
  folder (app-data placement) are listed apart with their sizes.
- Not wired yet: the Storage HTTP route and agent tools (ST-15), the admin screen (ST-17), and the
  CLI `clean` / `compact` subcommands (ST-6, ST-7b).
