# Shared sites home

Web, dev selection, CLI and desktop derive the default through Jini's directory workspace:
`<OS Documents>/Tovu/<site>/` (`~/Documents/Tovu/<site>/` on macOS).
Windows uses the redirected Personal folder; Linux uses XDG user-dirs. Environment overrides
and saved custom homes retain their existing contracts. `~/.tovu/sites-home.json` remains a
legacy catalog-import source, never a home override.

Desktop startup reverses 59a036e49's released 0.1.14 nesting automatically, before opening any
site: eligible stopped sites in the implicit `Documents/Tovu/sites` move up to `Documents/Tovu`.
The existing `tovu sites move-home <dir>` CLI owns admission and verified relocation.
Running or locked sites and colliding names stay in place and retry on later launches; no server
is signalled or forced to stop, no existing destination is overwritten. Saved home selections
are untouched. Local `~/Tovu` and checkout sites remain outside this migration.

While valid skipped sites remain, both hosts scan the nested folder as a transient read-only
fallback. Nothing saves it as another home or extra root. Desktop removes the container with
non-recursive `rmdir` only when empty; unrelated files and skipped sites keep it intact. The
regenerable 0.1.14 thumbnail cache (`sites/.tovu/{site,theme}-previews`, `.DS_Store`) does not
count: it is deleted first. Anything else in `sites/.tovu` keeps the container.
The old desktop/admin manual nesting action is retired.

Relocation reserves both identities, verifies directory bytes and SQLite integrity/table counts,
preserves existing in-site database paths without copying them during a same-disk folder rename,
keeps uniquely named recovery backups when copying or changing database placement is necessary,
and commits shared `sites.json`, desktop `desktop-projects.json`
(installed, source and selected profiles), and saved `config.json` roots under their existing
locks with atomic file replacement. A write failure restores the prior JSON values and rolls
back the relocation. A second completed run finds no nested source and performs no move.
Existing `.home2-backup` files travel with their site untouched. Environment home overrides
are never saved into configuration during relocation.
Desktop uses `tovu sites move-home <dir>` in the installed/source CLI rather than importing
the native SQLite mover into Electron.
