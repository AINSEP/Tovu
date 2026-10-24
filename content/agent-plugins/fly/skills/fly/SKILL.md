---
name: fly
description: Deploy the Tovu server itself to fly.io with no CLI installed (flyctl runs on GitHub's runner) - one machine only (SQLite), the volume shadowing sites/, secrets never in fly.toml, the sealed-credential site key, and deploying ships code, not content. Publishing the site's static export to a host is not this plugin's job - each host is its own plugin.
---

# Deploy the Tovu server

## Connection card

Choose the card yourself from its `usedFor` list. Reuse a saved key or working sign-in for that
task. Never offer a replacement unless the person asks.

Open **Connect Fly.io** with `credential_save {kind:"plugin-provider",target:"fly"}` for a new key. The card explains app-scoped deploy tokens and saves the `fly.io` credential with both API origins. In the Fly dashboard select the real app or organization, then **Tokens**; there is no universal app token-creation URL to guess. Only if the person explicitly asks to replace the saved key, rotate the existing row through `credential_save {kind:"api",target:"fly.io"}`.

## Scope

This plugin owns **deploying the Tovu server itself** (app, admin, database), not publishing the site's
static export. Static hosts are their own plugins: **Vercel** (`vercel`), **Netlify** (`netlify`),
**Cloudflare Workers or Pages** (`cloudflare`), **GitHub Pages** (`github-pages`) and **S3-compatible storage**
(`s3-compatible`). The publish procedure every host shares is the site guide's `how-tovu-works-deploy`
topic.

## Deploying the Tovu server to fly.io

A different job from publishing the static export: this puts the Tovu server itself (app, admin,
database) on one fly.io machine, through a GitHub Actions workflow, so nobody installs flyctl or
Docker. Read `references/fly-server.md` before any step: it has the five Fly rules generic fly.io
advice gets wrong (one machine only, the volume shadowing `sites/`, secrets never in `fly.toml`,
`TOVU_SITE_KEY` before the first deploy, migrations apply themselves), the procedure, and
the two templates it writes (`references/fly.template.toml`, `references/fly-deploy.template.yml`).
Say first: deploying ships code, not content. Every GitHub step belongs to the bundled `github`
plugin.

## When it fails

Explain the cause in one plain sentence and the one next step. See `references/fly-server.md` for its
own messages.
