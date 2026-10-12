# Shared sites home

Web, dev selection, CLI and desktop derive the default through Jini's directory workspace:
`<OS Documents>/Tovu/sites/<site>/` (`~/Documents/Tovu/sites/<site>/` on macOS).
Windows uses the redirected Personal folder; Linux uses XDG user-dirs. The sync warning's
local alternative is `~/Tovu/sites`. Environment overrides and custom homes remain supported.

Discovery also scans the existing former-level parent of the selected nested home.
It does not scan another old home or move local `~/Tovu` sites into synced Documents.
Only valid site markers count; shared plugins, templates and other siblings are ignored.
Old-level cards offer **Move into sites/** once stopped. Clicking the action invokes the same
verified relocation as the CLI. No startup scan moves a site.

The coordinator must obtain the owner's OK before moving each actual site. Preview from the
repository with `npm run sites:move-home -- --site <folder-name>`, then add `--apply` after approval.
The command moves only former-level siblings into the selected nested home
(by default `Documents/Tovu/sites`). Checkout compatibility roots remain discovery sources. A mixed batch reports/skips running sites; selecting
only a running site refuses the move. No migration signals or forces a running server to stop.

Relocation reserves both identities, verifies directory bytes and SQLite integrity/table counts,
preserves existing in-site database paths without copying them during a same-disk folder rename,
keeps uniquely named recovery backups when copying or changing database placement is necessary,
and commits shared `sites.json`, desktop `desktop-projects.json`
(installed, source and selected profiles), and saved `config.json` roots under their existing
locks with atomic file replacement. A write failure restores the prior JSON values and rolls
back the relocation. A second completed run finds no old-level source and performs no move.
Existing `.home2-backup` files travel with their site untouched. Environment home overrides
are never saved into configuration during relocation.
Desktop uses `tovu sites move-home <dir>` in the installed/source CLI rather than importing
website internals or native SQLite into Electron.
