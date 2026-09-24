# Tovu

Tovu is a content platform you actually own. The database, your uploads, themes, and plugins live in one directory on a machine you control — copy it, back it up, put it in git, or hand it to someone else. No hosted plan, no lock-in, no per-seat pricing. It ships with a built-in AI assistant that can edit pages, write content, and reshape the site on request.

Tovu is at MVP. Everything runs on your own machine.

## Layout

- `apps/website` — the CMS runtime: the public site, the per-site admin API, the content model. This is the main package (see root `package.json`).
- `apps/admin` — the admin UI (React + Vite) served at `/admin`.
- `apps/desktop` — the Electron desktop app. An additive shell around the same server the web mode runs.
- `apps/site-chat` — the assistant chat UI embedded in the site.
- `packages/sdk` — `@tovu/sdk`, the public SDK for plugin authors (the only supported import surface for plugin `server/index.mjs` entries).
- `sites/` — site data, not source: `sites/<name>/` holds one site's `content.db`, uploads, themes, plugins, and build output. Gitignored per-site; upgrading Tovu never touches this directory.

Tovu is built on [Jini](https://github.com/jini-ai) (`@jini-ai/*` packages) — the agent/runtime framework underneath the CMS and assistant.

## What it does

Pages, posts, media, menus, forms, and collections. Themes you can switch without touching content, since content and presentation are separate. Plugins and agent plugins. A built-in assistant you can ask to write or restyle content. Publishing to a live site, plus static export/deploy.

Full docs: **https://tovu.fly.dev/docs**

## Quick start

Easiest: download the desktop app (no terminal) — `/download` on the site, or [GitHub Releases](https://github.com/AINSEP/Tovu/releases). Open it; you're taken straight to your site's admin.

From source:

```
npm install
npm start
```

`npm start` builds whatever a fresh checkout is missing and prints one line: the URL your site is running on.

Other useful commands:

- `npm run dev` — development mode (watches and rebuilds).
- `npm run desktop` — run the desktop (Electron) app from source.

## Requirements

- Node >= 24.0.0 (see `engines` in `package.json`).

## License

Apache-2.0 (see `LICENSE`).
