# features/plugins

The installed-plugins list behind the sidebar's **Design & System → Plugins** entry.

| file | what it is |
|---|---|
| `Plugins.tsx` | List of installed plugins, enable/disable. |
| `InstallPluginDialog.tsx` | Local folder/ZIP review and explicit install consent. |
| `hooks/use-plugin-install.hooks.ts` | Preview invalidation, install requests and modal lifecycle. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- The plugin runtime itself (`src/features/plugin-runtime` at the app level) — this screen only
  lists and toggles plugins, and sends reviewed folder/ZIP installs to the server's installer port.

## Notes for anyone editing here

`Plugins.tsx` has a unit test (`__tests__/Plugins.unit.test.tsx`).

## Local folder and ZIP installs

Start the server with `TOVU_PLUGIN_LOCAL_INSTALL=1` to expose **Install plugin** on the Plugins
page. Choose **Upload .zip (max 32 MiB)** for a package on your computer, or enter a folder on the
**server**. The ZIP must contain `tovu.plugin.json` and `server/index.mjs` at its root. Preview it, review the full
machine access warning, then choose **Install (stays off)**. Installed packages appear on
Downloaded; use Enable there when ready. Installing never evaluates the plugin's code and
never writes an activation row. The route reuses `admin.plugins.enable`.

CLI: `tovu plugin install /path/to/package --site /path/to/site` asks for consent;
`--yes` explicitly accepts it for automation, and `--replace` permits replacing the same version
while disabled in every workspace. `tovu plugin integrity /path/to/package --write` generates
the complete `tovu.plugin.json` integrity map. Folder packages must declare `tier-3`, contain
`server/index.mjs`, and cover every non-manifest file with its SHA-256 hash.

Packages in Trash must be restored or purged there first. Upgrade and replacement refuse any
enabled workspace. Same-version replacement refreshes all packaged modules on the next enable,
including nested/dynamic ESM imports and CommonJS helpers. Dev links and URL sources remain deferred.

ZIP review and confirmation each send the selected archive through the authenticated API. The
server verifies the reviewed digest again before installation; changing the file, folder or
replacement option clears consent. Uploads are limited to 32 MiB compressed, 4096 entries,
16 MiB per file and 64 MiB expanded. Links, absolute/traversal paths, duplicates, case aliases and
file/directory conflicts are rejected. Installation still never executes code.

Enabled site plugins run from verified snapshots in `<plugins-dir>-runtime`, outside discovery,
so Node receives a fresh identity for the whole package. Keep these snapshots while the server is
running: late dynamic imports may still use them. They may be removed with the server stopped;
automatic cleanup is not implemented in this slice.

Install staging and the directory lock sit beside the plugin install root. A failed operation
cleans both. After an abrupt process termination, stop all installers before removing an abandoned
`<plugins-dir>-install-lock`; inspect `<plugins-dir>-staging` for a parked old version before
discarding it. Never remove a lock belonging to an active install.
If restoring a replaced version fails, the installer retains its old bytes in staging and returns
`PLUGIN_INSTALL_RECOVERY_REQUIRED` with their location rather than deleting the remaining copy.

Implementation reference: `ADS-memory/.local-artifacts/terra-runs/sol/plugin-install-plan.md`
(owner-approved 2026-09-22; SHA-256 `568b1fd6ddc9bbab348e89931baa976eda51fa11432de5c54f3abb319424c608`).
Tests were written but not executed in the dispatched worker; validation belongs to the coordinator.
