# `sites/` — one folder per site

Everything in here is **site data**, not source. A Tovu upgrade replaces `src/`, `apps/` and
`packages/`; it must never touch this directory. That separation is the entire reason this folder
exists (2026-08-27, replacing the old `infra/`).

Only this README is tracked. Every `sites/<name>/` folder is gitignored — see the `sites/*` block in
`.gitignore`. The README is tracked so the directory survives a fresh clone: `openContentDb` does
not create its parent, so an absent `sites/` fails boot with `SQLITE_CANTOPEN`.

## What one site holds

```
sites/<name>/
  content.db              this site's content (+ -wal / -shm sidecars)
  uploads/                blob store; ws/<workspaceId>/blobs/<aa>/<sha256>
  themes/                 THIS SITE'S themes — its own copy, safe to edit
    static/ templated/ declarative/
    __original-themes__/  what each theme looked like when installed ("reset to original")
    __marketplace__/      the theme store fixture
  skills/                 installed standalone Agent Skills, ws/<workspaceId>/
  agent-plugins/          installed Agent Plugins, ws/<workspaceId>/, frozen read-only per digest
  plugins/                installed site plugins
  ops/                    ADR-041 sidecar journals (database-journal.db, storage-journal.db)
  out/                    BUILD OUTPUT — regenerable, safe to delete
    export/ publish/ publish-history/ source-control-export/
  restore-point-*.db      captured restore points
```

`out/` is grouped separately on purpose: it is the only part of a site that can be thrown away and
rebuilt. Everything beside it is irreplaceable.

## Why `themes/` lives here and not in `src/`

Until 2026-08-27 a site's themes lived at `src/themes/` — inside the package. Upgrading Tovu
replaced that directory and destroyed both the installed themes and `__original-themes__`, the
backups those themes reset to. Editing a site's homepage also showed up as a diff on the product's
own source tree.

Now `src/themes/` is read-only **stock**: the catalog shipped with the product, and the seed source
only. On first boot `seedSiteThemes` copies it into `<site>/themes/`, and from then on the site
serves and writes its own copy. Two sites can edit the same theme without drifting into each other.

## Choosing which site to serve

Resolution lives in `src/site-dir/site-root.ts` (`resolveSiteRoot`), in precedence order:

| | |
|---|---|
| `TOVU_SITE_DIR` | absolute path to a site folder — what a container volume or Tovu-Runner passes |
| `TOVU_SITE` | just the folder name under `<cwd>/sites/` |
| default | `<cwd>/sites/tovu-com` |

`tovu serve <dir>` / `tovu init <dir>` take the directory directly and ignore both variables — the
CLI is the same model with the path passed explicitly.

Each `TOVU_*_DIR` variable still overrides its own subpath independently (`TOVU_MEDIA_UPLOADS_DIR`,
`TOVU_THEMES_DIR`, `TOVU_SKILLS_DIR`, `TOVU_AGENT_PLUGINS_DIR`, `TOVU_EXPORT_DIR`,
`TOVU_PUBLISH_DIR`, `TOVU_CONTENT_DB`, …), so a deployment that relocates one directory — a large
uploads volume, say — does not have to move the rest.

## Backing a site up

Stop the server first: `content.db` runs in WAL mode, and copying it live can capture a torn state.
With the process down, the whole `sites/<name>/` folder is the backup. Copy it, zip it, hand it to
someone else — it is self-contained.

## Docker

`sites/` is the container's one persistent volume (`tovu-sites` in `docker-compose.yml`). The image
`rm -rf`s it during the build so a developer's real data can never ship inside a published image.
Lose the volume and you lose the site.
