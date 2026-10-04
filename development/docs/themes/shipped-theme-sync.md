# Shipped Tovu Theme and the repository reference

`content/themes/static/tovu-theme/` is the canonical release source. New sites and
reinstalls seed from it. `sites/tovu-dev/themes/static/tovu-theme/` is the tracked
reference used to develop Tovu's own site. Its load-bearing changes must reach the
release source before an upgrade ships. Existing installations retain their own
themes: first-boot seeding refuses to overwrite any existing `themes/` directory.

The dedicated CI gate compares the stock file set and runtime bytes with the
reference's **tracked** file set. It deliberately excludes untracked local drafts,
such as `posts-2-sidebars.html`; review and track a new reference file before
promoting it to stock. NOTICE prose and HTML comments may differ, retaining newer
package provenance notes and the stock fix for literal body tags in comments.
All runtime markup, scripts, styles, tokens, assets and manifest must match.
The gate also checks stock against its generated reset catalog, pins the explicit
publication/template policy, and renders nested navigation and menu-owned footers.
It does not compare or synchronize other sites or user installations.

When changing the reference theme, review the diff against stock, then promote the
intended tracked changes to `content/themes/static/tovu-theme/`. Preserve newer
package fixes and explanatory comments; a blind copy can discard them. When
changing stock first, reflect its runtime changes in the tracked reference. Never
copy stock over a user's installed theme as part of an upgrade. A dirty reference
requires review of the author's edits before any synchronization.

Derive the reset catalog from the canonical source with the existing command:

```sh
node --import tsx apps/website/src/cli/main.ts theme sync-originals content/themes
```

Run the release drift checks from the repository root:

```sh
node --import tsx --test \
  apps/website/src/features/theme/__tests__/shipped-site-theme-drift.canary.test.ts \
  apps/website/src/features/theme/__tests__/shipped-theme-original-drift.canary.test.ts
```

The 2026-10-04 reconciliation carries the reference's `posts-*`, `pages-*` and
`listing-default.html` templates, `publishedPages: []`, tree header marker, menu-owned
footer, mobile drawer, documentation TOC and supporting assets into stock/reset.
Legacy stored template choices still resolve through the existing renderer aliases.
