# WordPress Spec Coverage Audit

**Audit date:** 2026-04-17

**Audit baseline:**
- Source tree: `other-repos/wordpress/`
- Spec corpus: `other-repos/wordpress_specs/`

This file records the current corpus state after the WordPress decomposition pass that filled the previously-audited subsystem gaps.

---

## 1. Working Conclusion

The prior backlog of major missing subsystems is now covered.

The corpus now includes dedicated specs for the previously missing operational and modern-runtime surfaces:

- install / setup / upgrade
- updater / filesystem / background updates
- site editor
- theme.json / global styles
- style engine / fonts
- template canvas / theme previews
- asset pipeline and admin concatenation endpoints
- script modules / interactivity / speculation rules
- HTML API
- sitemaps
- embeds / oEmbed
- feeds / syndication
- error protection / recovery mode
- application authorization
- privacy / personal-data tooling
- revisions / repair mode
- abilities API
- shortcode runtime
- modern REST controller families

That closes the gaps identified in the earlier audit. The remaining broad docs are no longer blockers for subsystem coverage; they are umbrella summaries with dedicated lower-level companions.

---

## 2. Area Matrix

### Root

Status: `Covered`

Covered by:

- `wp-root/bootstrap.md`
- `wp-root/auth-and-signup.md`
- `wp-root/integrations.md`
- `wp-admin/install-and-setup.md`
- `xmlrpc.md`

### `wp-admin/`

Status: `Covered`

Covered by:

- `wp-admin/admin-bootstrap.md`
- `wp-admin/application-authorization.md`
- `wp-admin/automatic-updater-and-debug-data.md`
- `wp-admin/comments-admin.md`
- `wp-admin/dashboard.md`
- `wp-admin/install-and-setup.md`
- `wp-admin/load-assets.md`
- `wp-admin/media-library.md`
- `wp-admin/menus-and-widgets-admin.md`
- `wp-admin/network-admin.md`
- `wp-admin/network-operations.md`
- `wp-admin/plugins-management.md`
- `wp-admin/post-editor.md`
- `wp-admin/press-this-and-image-editing.md`
- `wp-admin/privacy-and-personal-data.md`
- `wp-admin/revisions-and-repair.md`
- `wp-admin/settings.md`
- `wp-admin/site-editor.md`
- `wp-admin/themes-management.md`
- `wp-admin/tools.md`
- `wp-admin/updater-and-filesystem.md`
- `wp-admin/wp-admin-users.md`

### `wp-admin/includes/`

Status: `Covered`

The major operational subsystems from `wp-admin/includes/` are represented through their owning docs:

- updater / filesystem / auto-updates
- debug data and Site Health diagnostics
- privacy request tooling and list tables
- revisions diff helpers
- image editing flow

### `wp-admin/network/`

Status: `Covered`

Covered by:

- `wp-admin/network-admin.md`
- `wp-admin/network-operations.md`
- `wp-admin/privacy-and-personal-data.md`

### `wp-admin/maint/`

Status: `Covered`

Covered by:

- `wp-admin/revisions-and-repair.md`

### `wp-content/`

Status: `Covered`

Covered by:

- `wp-content/overview.md`
- `plugin-theme-authoring.md`

### `wp-includes/` classic core runtime

Status: `Covered`

Covered by the existing database/options/meta/query/comments/taxonomy/users/http/media/l10n/multisite/object-cache/cron/widgets/hooks/routing docs.

### `wp-includes/` theme and block runtime

Status: `Covered`

Covered by:

- `wp-includes/theme-and-templates.md`
- `wp-includes/theme-json-and-global-styles.md`
- `wp-includes/style-engine-and-fonts.md`
- `wp-includes/template-canvas-and-theme-previews.md`
- `wp-admin/site-editor.md`

### `wp-includes/rest-api/`

Status: `Covered`

Covered by:

- `wp-includes/rest-api.md`
- `wp-includes/rest-api-modern-controllers.md`

### Asset pipeline

Status: `Covered`

Covered by:

- `wp-includes/assets-and-dependencies.md`
- `wp-admin/load-assets.md`

### Script modules / interactivity / speculation

Status: `Covered`

Covered by:

- `wp-includes/script-modules-and-interactivity.md`

### HTML API

Status: `Covered`

Covered by:

- `wp-includes/html-api.md`

### Sitemaps

Status: `Covered`

Covered by:

- `wp-includes/sitemaps.md`

### Embeds / oEmbed

Status: `Covered`

Covered by:

- `wp-includes/oembed-and-embeds.md`

### Feeds / syndication

Status: `Covered`

Covered by:

- `wp-includes/feeds-and-syndication.md`

### Error protection / recovery

Status: `Covered`

Covered by:

- `wp-includes/error-protection-and-recovery.md`

### Shortcodes / abilities

Status: `Covered`

Covered by:

- `wp-includes/shortcodes.md`
- `wp-includes/abilities-api.md`

---

## 3. Residual Notes

- Some older umbrella docs remain intentionally broad, especially `wp-root/bootstrap.md`, `wp-includes/rest-api.md`, `wp-includes/theme-and-templates.md`, and `plugin-theme-authoring.md`.
- Those files should now be treated as summary or cross-reference docs, not as evidence of missing subsystem coverage.
- The `wp-root-original-specs/` directory is retained as an archival appendix with its own `index.md`. It is preserved for reference and does not represent an open coverage gap.
- Non-source metadata noise has been removed from the corpus tree.

---

## 4. Current Assessment

The tracked WordPress coverage backlog is cleared.

If further work is desired later, it would be optional refinement:

- further consolidating the archival `wp-root-original-specs/` appendix if the team decides it no longer needs per-file provenance
- splitting large umbrella docs into smaller navigation-only reference pages
- adding deeper niche docs for ancillary admin screens that are already indirectly covered

---

## Tovu Reconstruction Notes

### Why this exists

This audit exists to prevent false confidence. The corpus is only useful for Tovu if it is honest about which WordPress surfaces are actually covered, which docs are summary-only, and which gaps are still real.

### What Tovu should preserve

- A live audit that distinguishes missing coverage from optional refinement
- Explicit statements about which docs are canonical versus archival or umbrella summaries
- A habit of re-auditing after major documentation passes instead of assuming completeness

### What Tovu can simplify

- The audit format can stay lightweight; it does not need to become a large process artifact
- Once the corpus reaches steady state, updates can be driven by concrete Tovu implementation discoveries rather than broad source sweeps

### Possible Tovu seams

- `docs/research/wordpress/coverage-audit.md` as the current status ledger
- future Tovu implementation planning can reference the audit instead of re-scanning the whole corpus first

### Suggested priority

- `V1`: keep the audit current while the Tovu rebuild plan is still being derived
- `Later`: downgrade it to maintenance mode once the research corpus stops moving quickly
