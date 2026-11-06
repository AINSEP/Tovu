# Tovu: deploying the Tovu server to fly.io

The Fly plugin deploys the Tovu server itself (app, admin, database), not the site's static
export. Static hosts are their own plugins: **Vercel** (`vercel`), **Netlify** (`netlify`),
**Cloudflare Workers or Pages** (`cloudflare`), **GitHub Pages** (`github-pages`) and
**S3-compatible storage** (`s3-compatible`). The publish procedure every host shares is the site
guide's `how-tovu-works-deploy` topic.

Read `host/fly-server.md` (this plugin's tool, `file: "host/fly-server.md"`) before any step. It has
the five rules generic fly.io advice gets wrong for Tovu (one machine only, the volume shadowing
`sites/`, secrets never in `fly.toml`, `TOVU_SITE_KEY` before the first deploy, migrations apply
themselves), the procedure, and Tovu's values for the plugin's two templates. Every GitHub step
belongs to the bundled `github` plugin. The CLI-free Machines API path is `host/machines-api-path.md`:
documented, not available.

For a coding agent or the operator's terminal: `tovu deploy config --target fly --region <region>
--out fly.toml` writes `fly.toml`, and `content/agent-plugin-overlays/fly/fly-build.sh` runs
`flyctl deploy` from the repo root.


## Host details for skills/fly/SKILL.md

Open **Connect Fly.io** with `credential_save {kind:"plugin-provider",target:"fly"}` for a new key. The card explains app-scoped deploy tokens and saves the `fly.io` credential with both API origins. In the Fly dashboard select the real app or organization, then **Tokens**; there is no universal app token-creation URL to guess. Only if the person explicitly asks to replace the saved key, rotate the existing row through `credential_save {kind:"api",target:"fly.io"}`.
