---
name: deploy
description: Put the site online on a hosting service, using the workspace's own saved credentials. Covers picking a host, getting a token, previewing before publishing, and explaining failures in plain words. Hosts this plugin currently runs itself - Netlify.
---

# Deploy the site to a host

## Scope

This plugin owns **publishing the site's static export to a hosting service**. Tovu renders the whole
site to plain files, and the chosen host serves them. The host code ships inside this plugin; Tovu runs
it only because Tovu shipped it.

Hosts this plugin runs today: **Netlify** (see `references/netlify.md`). The other hosts Tovu offers
(GitHub Pages, Vercel, Cloudflare Pages, S3-compatible buckets) still publish through Tovu's older
built-in path and move in here one at a time. The tools below work the same for every host.

## The procedure

1. **Check what is ready.** Call `deployment_get_static_publish_capabilities`. It lists every host and
   whether a credential is saved for it. Do not guess from memory.
2. **Pick the host with the person.** Use what they already have: "my Netlify" means Netlify. With no
   account yet, Netlify is the quickest free start (one token, no config fields).
3. **No credential saved?** The person saves the token themselves in **Admin, Deployment, Static site**.
   Never ask them to paste a token into chat, and never put one in a tool argument.
4. **Preview first, always.** Call `deployment_preview_static_publish` and tell the person what will be
   published and where. A preview publishes nothing.
5. **Publish.** Call `deployment_execute_static_publish`. It shows the person a confirmation card; nothing
   is uploaded until they confirm.
6. **Report honestly.** `ok: true` means the public URL answered. `ok: "partial"` means the host accepted
   the files but the URL is not reachable yet (usually DNS or CDN catching up): say so, give the URL, and
   suggest checking again in a minute. Do not call it failed, and do not call it live.

## Security headers

Tovu hands every host the live site's security headers. Netlify gets them as a `_headers` file this
plugin writes; a `_headers` file in the site itself is replaced by it.

## When it fails

Explain the cause in one plain sentence and the one next step. See `references/netlify.md` for Netlify's
own messages.
