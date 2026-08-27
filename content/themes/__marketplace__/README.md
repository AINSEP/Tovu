# `__marketplace__` — local marketplace fixture

This folder is a **local stand-in for a remote theme marketplace**. It is not a real marketplace: there
is no network call, no remote catalog, no search, and no version negotiation. It exists so the
download flow (`src/features/theme/marketplace.ts`, `POST .../marketplace/themes/:themeId/download`)
has something real to copy from and can be exercised end-to-end without a backend service.

Laid out exactly like `__original-themes__` (the originals catalog): `<tier>/<id>/` per the
`ENGINE_SUBFOLDERS` tiers (`declarative`, `templated`, `handlebars`, `static`). Excluded from theme
discovery the same way `__original-themes__` is (`theme.ts`'s `discoverAllBuiltInThemes` exclude list)
— nothing in here is ever runnable or listed as an installed theme; it only becomes real by being
downloaded, which copies it into both the originals catalog and a live tier folder under a freshly
assigned id.

## `static/basic`

A copy of `src/themes/static/portfolite`, republished under id `basic` and name `"Basic"`. This is
deliberate: an installed `basic` theme already exists (`src/themes/static/basic`), so downloading this
fixture always collides and exercises `nextAvailableThemeId`'s `-1`/`-2`/… suffixing for real, rather
than only in a unit test.

## What a real marketplace would need

- A remote catalog service (listing, search, categories) instead of a folder scan.
- Versioning and update checks — this fixture has no notion of "a newer version is available".
- Integrity/signature verification before a downloaded theme is written to disk.
- Pagination/rate limits on listing, and a real download transport (not a local `fs.cpSync`).
