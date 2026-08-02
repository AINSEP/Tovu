# WordPress Specs Index

**Repo snapshot inspected:** `other-repos/wordpress/`

This corpus tracks WordPress by runtime surface rather than by raw directory listing. The goal is source-grounded coverage of the major root entry points, admin subsystems, `wp-includes` runtime layers, and operational infrastructure.

## Current Files

### Top level

- `overview.md`
- `headless.md`
- `plugin-theme-authoring.md`
- `coverage-audit.md`

### `wp-root/`

- `wp-root/bootstrap.md`
- `wp-root/auth-and-signup.md`
- `wp-root/integrations.md`
- `xmlrpc.md`

### `wp-admin/`

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

### `wp-includes/`

- `wp-includes/abilities-api.md`
- `wp-includes/assets-and-dependencies.md`
- `wp-includes/blocks.md`
- `wp-includes/comments.md`
- `wp-includes/cron.md`
- `wp-includes/database.md`
- `wp-includes/error-protection-and-recovery.md`
- `wp-includes/feeds-and-syndication.md`
- `wp-includes/formatting.md`
- `wp-includes/hook-engine.md`
- `wp-includes/html-api.md`
- `wp-includes/http.md`
- `wp-includes/l10n.md`
- `wp-includes/media.md`
- `wp-includes/meta.md`
- `wp-includes/multisite.md`
- `wp-includes/object-cache.md`
- `wp-includes/oembed-and-embeds.md`
- `wp-includes/options.md`
- `wp-includes/query-and-posts.md`
- `wp-includes/rest-api.md`
- `wp-includes/rest-api-modern-controllers.md`
- `wp-includes/rewrite-and-routing.md`
- `wp-includes/script-modules-and-interactivity.md`
- `wp-includes/shortcodes.md`
- `wp-includes/sitemaps.md`
- `wp-includes/style-engine-and-fonts.md`
- `wp-includes/taxonomy.md`
- `wp-includes/template-canvas-and-theme-previews.md`
- `wp-includes/theme-and-templates.md`
- `wp-includes/theme-json-and-global-styles.md`
- `wp-includes/users-and-auth.md`
- `wp-includes/widgets-and-menus.md`

### `wp-content/`

- `wp-content/overview.md`

### Legacy per-file appendix

The `wp-root-original-specs/` directory is now an explicitly archival appendix.

Start with `wp-root-original-specs/index.md` if you need the old per-file notes, but treat the canonical coverage as the consolidated runtime docs under `wp-root/`, `wp-admin/`, and `wp-includes/`.

Archived files:

- `wp-root-original-specs/index.md`
- `wp-root-original-specs/wp-activate.md`
- `wp-root-original-specs/wp-blog-header.md`
- `wp-root-original-specs/wp-comments-post.md`
- `wp-root-original-specs/wp-config.md`
- `wp-root-original-specs/wp-cron.md`
- `wp-root-original-specs/wp-links-opml.md`
- `wp-root-original-specs/wp-load.md`
- `wp-root-original-specs/wp-login.md`
- `wp-root-original-specs/wp-mail.md`
- `wp-root-original-specs/wp-settings.md`
- `wp-root-original-specs/wp-signup.md`
- `wp-root-original-specs/wp-trackback.md`

## Coverage Status

The tracked backlog from the previous audit is now covered, including:

- install / setup / updater / filesystem
- site editor and theme.json / global styles
- style engine / fonts / template canvas / theme previews
- asset pipeline and admin concatenation endpoints
- script modules / interactivity / speculation rules
- HTML API
- sitemaps
- embeds / oEmbed
- feeds / syndication
- error protection / recovery
- application authorization
- revisions / repair
- privacy / personal data
- abilities API
- shortcode runtime
- modern REST controller families

Cleanup status:

- stray macOS metadata removed from the corpus
- legacy root-entry notes retained as an archival appendix with their own index

See [coverage-audit.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/coverage-audit.md) for the current audit summary.

---

## Tovu Reconstruction Notes

### Why this exists

This file exists as the navigation contract for the WordPress corpus. It tells us which docs are canonical, which ones are archival, and which subsystems have already been decomposed enough to guide Tovu work.

### What Tovu should preserve

- One explicit index for canonical subsystem docs
- A clear distinction between summary/navigation docs and source-of-truth subsystem docs
- An archival boundary so historical notes do not get mistaken for active backlog

### What Tovu can simplify

- Once the corpus stabilizes, some of this index could be generated from a manifest instead of maintained manually
- Tovu does not need many layers of overlapping navigation if the canonical docs stay easy to traverse

### Possible Tovu seams

- `docs/research/wordpress/` as a structured reverse-engineering corpus
- a small docs manifest or generator that tracks canonical vs archival documents

### Suggested priority

- `V1`: keep the canonical-vs-archival distinction explicit
- `Later`: automate index generation if maintenance overhead grows
