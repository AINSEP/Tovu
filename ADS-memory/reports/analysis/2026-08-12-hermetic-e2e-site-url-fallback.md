# Hermetic e2e configs leak `siteUrl()` iframes to the owner's real :3000 (2026-08-12)

## Status: mechanism CONFIRMED empirically, live. No currently-committed test is known to be
## silently passing because of it — the risk is structural, not (yet) an observed false-green.

## The mechanism

`apps/admin/src/lib/site-url.ts`'s `siteUrl()`:

```ts
export function siteUrl(path: string): string {
  if (import.meta.env.DEV) {
    const origin = import.meta.env.VITE_TOVU_SITE_URL ?? "http://localhost:3000";
    return `${origin}${path}`;
  }
  return path;
}
```

In dev, any iframe built with `siteUrl()` points at `VITE_TOVU_SITE_URL` if set, otherwise
**hardcodes `http://localhost:3000`** — which, on a developer's own machine, is that developer's
real, currently-running site server, not the hermetic one the e2e config just booted.

Two call sites use this unconditionally or near-unconditionally:
- `ThemeExplore.tsx`'s `previewSrcFor` — every `page`/`partial`-kind file preview, no branch to dodge it.
- `PageEditor.tsx:546` — the "published, not dirty" preview branch (the "draft" branch uses
  `SrcDocSandbox`/`srcDoc` instead, which is unaffected).

## Evidence (today, live)

Booted `playwright.theme-liquid-preview.config.ts`'s own `webServer` commands verbatim (ports
7861 API / 7862 admin / 7863 daemon, `TOVU_DB=memory`, **no** `VITE_TOVU_SITE_URL` override — the
config doesn't set one). Logged into the real admin UI, opened Explore for the `basic` theme
(static tier, has a real `pages/index.html`, so `previewSrcFor`'s unconditional `page` branch
fires), and read the live `<iframe title="Theme preview">`:

```
Live iframe src attribute: http://localhost:3000/theme-explore/basic/index?v=0
Resolved origin: http://localhost:3000
Matches hermetic API port (7861)? false
Matches the OWNER'S REAL site (3000)? true
```

The owner's real dev server (`:3000`, confirmed running throughout, untouched by this check) was
still up. The iframe did not error, go blank, or 404 — it rendered **real content from the wrong
database**:

```
What the iframe ACTUALLY rendered (first 300 chars):
"Basic\nPricing\nDocs\nBlog\nChangelog\nAbout\nDownload\nMenu\nSign in\nGet started\nAll sites
live\nBeautiful websites from Leon, shipped in minutes\n\nBasic turns a blank canvas into a
polished, on-brand site — premium templates, one-click customization..."
```

Direct fetch of the identical path against both origins:

```
http://localhost:7861/theme-explore/basic/index?v=0  -> 200  (the hermetic boot's own theme)
http://localhost:3000/theme-explore/basic/index?v=0  -> 200  (the owner's real theme)
```

**This is the specific failure mode, named as asked:** it is not "the test never loads the
iframe" (it loads, and loads real content) and it is not "content assertion happens to pass by
literal accident" in the sense of garbage matching garbage — it's that **the wrong server returns
a legitimate 200 with plausible, similarly-worded content for the same stock theme id**, because
`basic` is the same built-in theme shipped in both databases. Any e2e assertion that checks
"the preview iframe rendered something Basic-shaped" would pass identically whether the hermetic
server answered or the owner's real one did. A hermetic server that was **broken, or not even
running**, would go undetected the same way, because the owner's always-on dev instance quietly
stands in with no error signal.

No currently-committed spec is known to hit this today — grepped every `development/e2e/*.spec.ts`
for anything that opens ThemeExplore's Preview tab for a `page`/`partial` file or reaches
`PageEditor`'s published/non-dirty branch; the only Explore-preview spec
(`theme-liquid-preview.spec.ts`) asserts the OPPOSITE (that no iframe renders for a `.liquid`
file), and `pages-editor.spec.ts`'s one iframe test targets the `SrcDocSandbox` draft branch only
(asserted via its `sandbox` attribute, which is the tell). So this is a latent risk for any
**future** test or manual check against those two screens, not an observed false-green today.

## Affected configs

Of the 10 `development/playwright.*.config.ts` files that boot `apps/admin`'s own Vite dev
server, **9 do not set `VITE_TOVU_SITE_URL`**: `playwright.admin-fab.config.ts`,
`playwright.connectors.config.ts`, `playwright.admin.config.ts`,
`playwright.login-api-down.config.ts`, `playwright.placeholder-tabs.config.ts`,
`playwright.media-providers.config.ts`, `playwright.visual-parity.config.ts`,
`playwright.pages.config.ts`, `playwright.theme-liquid-preview.config.ts`.

One already does it correctly and can serve as the reference pattern —
`playwright.post-editor.config.ts`:

```
TOVU_API_URL=${API_BASE_URL} VITE_TOVU_SITE_URL=${API_BASE_URL} npx vite --port ${ADMIN_PORT} --strictPort
```

## One-line fix (not applied — owner's call per team-lead)

Add `VITE_TOVU_SITE_URL=${API_BASE_URL}` alongside the existing `TOVU_API_URL=${API_BASE_URL}` in
each affected config's admin `webServer.command`, matching `playwright.post-editor.config.ts`'s
existing line exactly. Nine files, one line each, no test-logic changes.
