# WordPress Root Entry Points — Overview & Hierarchy

**Source directory:** `wordpress/` (root PHP files only)

---

## File Inventory

| File | Role | Multisite only |
|---|---|---|
| `index.php` | Front-end entry point | No |
| `wp-blog-header.php` | Bootstrap + query + template dispatch | No |
| `wp-load.php` | Locate and load `wp-config.php` | No |
| `wp-config-sample.php` | Configuration template (not loaded at runtime) | No |
| `wp-settings.php` | Full framework bootstrap | No |
| `wp-login.php` | Authentication: login, logout, register, password reset | No |
| `wp-signup.php` | Front-end multisite signup | Yes |
| `wp-activate.php` | Multisite signup activation | Yes |
| `wp-comments-post.php` | Comment submission endpoint | No |
| `wp-cron.php` | Pseudo-cron job runner | No |
| `wp-mail.php` | Post-by-email via POP3 | No |
| `wp-links-opml.php` | OPML export of bookmarks/links | No |
| `wp-trackback.php` | Incoming trackback/pingback receiver | No |
| `xmlrpc.php` | XML-RPC API + RSD discovery | No |

---

## Boot Hierarchy

Every public request ultimately flows through this chain:

```
Browser request
  │
  ▼
index.php                          (sets WP_USE_THEMES=true)
  │
  ▼
wp-blog-header.php                 (guard: runs only once via $wp_did_header)
  ├── wp-load.php                  (find & load wp-config.php)
  │     ├── wp-config.php          (user-created: DB creds, salts, constants)
  │     │     └── wp-settings.php  (loads all of WordPress core)
  │     └── [fallback: redirect to setup-config.php]
  ├── wp()                         (parse request, run query)
  └── template-loader.php          (select and include theme template)
```

Other entry points each load `wp-load.php` directly (bypassing `index.php`):

```
wp-login.php      → wp-load.php
wp-signup.php     → wp-load.php → wp-blog-header.php
wp-activate.php   → wp-load.php → wp-blog-header.php
wp-comments-post  → wp-load.php
wp-cron.php       → wp-load.php (conditional)
wp-mail.php       → wp-load.php
wp-links-opml.php → wp-load.php
wp-trackback.php  → wp-load.php (conditional, or via wp())
xmlrpc.php        → wp-load.php
```

---

## Boot Sequence Inside `wp-settings.php`

`wp-settings.php` is the heart of WordPress. It runs in this order:

1. Define `WPINC` constant
2. Load version info (`version.php`)
3. Load minimal compat + UTF-8 shims
4. Load `load.php` (defines `wp_check_php_mysql_versions`, `wp_fix_server_vars`, etc.)
5. Check PHP/MySQL versions
6. Load error protection classes (fatal error handler, recovery mode)
7. Set initial constants (`WP_MEMORY_LIMIT`, `WP_DEBUG`, etc.)
8. Register fatal error handler
9. Set timezone to UTC
10. Fix `$_SERVER` vars
11. Check maintenance mode
12. Start timer
13. Load advanced-cache drop-in if `WP_CACHE` is on
14. Set language dir
15. Load core utility classes (formatting, meta, functions, WP_Error, etc.)
16. Initialize database (`wpdb`)
17. Set table prefix
18. Start object cache
19. Load default filters
20. Load multisite files if `is_multisite()`
21. Register `shutdown_action_hook`
22. *(bail here if `SHORTINIT` is set)*
23. Load L10n library and locale classes
24. Run installer if WordPress is not installed
25. Load the bulk of WordPress (queries, posts, users, comments, taxonomies, REST API, blocks, etc.)
26. Load multisite-specific functions if multisite
27. Define plugin directory constants
28. Load must-use plugins
29. Load network-activated plugins (multisite)
30. Fire `muplugins_loaded`
31. Set cookie/SSL constants
32. Create common globals (`wp_query`, `wp_rewrite`, `$wp`, etc.)
33. Create initial taxonomies and post types
34. Register theme directory
35. Initialize recovery mode (single-site)
36. Load active plugins
37. Load pluggable functions
38. Fire `plugins_loaded`
39. Set magic quotes
40. Fire `sanitize_comment_cookies`
41. Create `WP_Query`, `WP_Rewrite`, `WP` globals
42. Create `WP_Roles` global
43. Fire `setup_theme`
44. Set template constants and globals
45. Load default text domain
46. Load locale file
47. Create `WP_Locale` and `WP_Locale_Switcher`
48. Load active theme `functions.php` (parent then child)
49. Fire `after_setup_theme`
50. Initialize `WP_Site_Health`
51. Call `$wp->init()` (sets up current user)
52. Fire `init`
53. Check multisite site status
54. Fire `wp_loaded`

---

## Entry Point Taxonomy

### Front-end rendering
- `index.php` → `wp-blog-header.php` → theme template

### Authentication & registration
- `wp-login.php` — all auth actions (login, logout, register, lost/reset password, admin email confirm, post-password, privacy confirmaction)
- `wp-signup.php` — multisite front-end signup (new user + new site)
- `wp-activate.php` — multisite signup activation via email key

### Data submission
- `wp-comments-post.php` — POST only; delegates to `wp_handle_comment_submission()`
- `wp-trackback.php` — receives incoming trackback pings; responds with XML

### Background / scheduled
- `wp-cron.php` — spawned by normal page loads or external cron; uses transient lock to prevent double-execution

### External integrations
- `xmlrpc.php` — XML-RPC protocol (MetaWeblog, MovableType, WordPress API); also serves RSD discovery at `?rsd`
- `wp-mail.php` — polls a POP3 mailbox, creates posts from email content

### Exports
- `wp-links-opml.php` — serves bookmarks/links as OPML XML

### Configuration (not a runtime entry point)
- `wp-config-sample.php` — template for the user-created `wp-config.php`

---

## Key Constants Set by the Boot Chain

| Constant | Set in | Purpose |
|---|---|---|
| `ABSPATH` | `wp-load.php` | Absolute path to WordPress root |
| `WPINC` | `wp-settings.php` | Relative path to `wp-includes` |
| `WP_CONTENT_DIR` | `wp-config.php` (default-constants.php) | Path to `wp-content` |
| `WP_DEBUG` | `wp-config.php` | Enable debug output |
| `WP_CACHE` | `wp-config.php` | Enable object/page caching |
| `MULTISITE` | `wp-config.php` | Whether multisite is active |
| `WP_USE_THEMES` | `index.php` | Whether to load theme templates |
| `DOING_CRON` | `wp-cron.php` | Suppress normal page output |
| `XMLRPC_REQUEST` | `xmlrpc.php` | Identify XML-RPC context |
| `WP_INSTALLING` | `wp-activate.php` | Suppress some init checks |
| `SHORTINIT` | user-set | Abort settings bootstrap early |
| `DISABLE_WP_CRON` | `wp-config.php` | Prevent automatic cron spawn |
| `WP_CRON_LOCK_TIMEOUT` | `wp-cron.php` / constants | Lock TTL for cron mutex |

---

## Drop-in Extension Points

WordPress allows overriding core behaviour via "drop-in" files placed in `WP_CONTENT_DIR`:

| File | Replaces |
|---|---|
| `advanced-cache.php` | Page/object caching layer (loaded if `WP_CACHE=true`) |
| `db.php` | Database abstraction layer (replaces `wpdb`) |
| `object-cache.php` | Object cache backend |
| `maintenance.php` | Custom maintenance mode page |
| `sunrise.php` | Multisite domain mapping (loaded before ms-settings) |

---

## TypeScript Architecture Implications

When reimplementing in TypeScript, this hierarchy maps to:

```
Application bootstrap (equivalent of wp-settings.php)
  ├── Config loader (wp-load.php / wp-config.php)
  ├── Database adapter (wpdb)
  ├── Object cache
  ├── Plugin/extension loader
  ├── Theme/template engine
  └── Request router → dispatches to:
        ├── FrontController (index.php / wp-blog-header.php)
        ├── AuthController (wp-login.php)
        ├── SignupController (wp-signup.php + wp-activate.php)
        ├── CommentController (wp-comments-post.php)
        ├── CronRunner (wp-cron.php)
        ├── MailIngester (wp-mail.php)
        ├── OpmlExporter (wp-links-opml.php)
        ├── TrackbackReceiver (wp-trackback.php)
        └── XmlRpcHandler (xmlrpc.php)
```

---

## Tovu Reconstruction Notes

### Why this exists

This overview exists to show how WordPress is actually entered and composed at runtime. It is the map that keeps the subsystem docs anchored to the real request/bootstrap surfaces instead of drifting into disconnected feature notes.

### What Tovu should preserve

- A clear map from runtime entry points to the subsystems they activate
- Separation between bootstrap, interactive web requests, and machine/background entry points
- One canonical view of how low-level services support the higher-level product surfaces

### What Tovu can simplify

- Tovu does not need to mirror WordPress's root-file layout one for one
- Legacy entry points can be collapsed into cleaner controllers and adapters as long as the same responsibilities are still owned somewhere explicit

### Possible Tovu seams

- `src/core/bootstrap/` for application startup and environment wiring
- `src/features/*/web/` for user-facing request entry points
- `src/features/*/integration/` for protocol and background adapters

### Suggested priority

- `V1`: keep this as a canonical architecture/navigation map while rebuilding WordPress-equivalent surfaces in Tovu
- `Later`: generate or refine it from the finalized Tovu module graph
