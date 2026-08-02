# WordPress Install, Setup, And Upgrade

**Source files analyzed:**
- `wp-admin/install.php`
- `wp-admin/setup-config.php`
- `wp-admin/upgrade.php`
- `wp-admin/install-helper.php`
- `wp-admin/includes/upgrade.php`
- `wp-admin/includes/schema.php`

---

## Section 1: Overview

The WordPress install / setup / upgrade pipeline is split across three user-facing entry points and a deeper helper layer:

| File | Role |
|---|---|
| `setup-config.php` | Collect database credentials and generate `wp-config.php` |
| `install.php` | Create the schema, populate options/roles/default content, and create the initial admin user |
| `upgrade.php` | Upgrade an existing site's database schema and options after code has been updated |
| `install-helper.php` | Low-level schema/column helper functions for plugins and installers |
| `includes/upgrade.php` | Install/upgrade engine, schema diffing, option population, upgrade runners |
| `includes/schema.php` | Canonical SQL schema and default option / role population |

This is one of the most operationally important parts of WordPress. It owns:

- first-time database bootstrap
- config-file generation
- schema creation
- upgrade sequencing
- default content insertion
- role population
- schema diff application through `dbDelta()`

The existing corpus previously mentioned these layers only indirectly through bootstrap summaries. This file exists to make them first-class.

---

## Section 2: `setup-config.php`

### 2.1 Purpose

`setup-config.php` is the pre-install configuration wizard. It does not install WordPress itself. Its job is to:

1. collect DB connection inputs
2. validate them
3. generate salts/keys
4. write `wp-config.php` if possible
5. otherwise show the exact config text for manual creation
6. hand off to `install.php`

### 2.2 Boot flags

It defines:

- `WP_INSTALLING = true`
- `WP_SETUP_CONFIG = true`

It also suppresses error reporting with `error_reporting(0)`.

### 2.3 Early guards

Before rendering anything, it:

- loads `wp-settings.php`
- loads `wp-admin/includes/upgrade.php`
- loads translation-install helpers
- reads `wp-config-sample.php`
- refuses to continue if:
  - no sample config exists
  - `wp-config.php` already exists in root
  - `wp-config.php` exists one directory above and is not part of another installation

Failures use `wp_die(...)` with HTTP `409` where appropriate.

### 2.4 Step model

`setup-config.php` uses a multi-step switch on `$_GET['step']`:

#### Step `-1`

- if language packs can be installed and no language is chosen, show a language chooser
- otherwise fall through to step `0`

#### Step `0`

- optionally download and load the selected language pack
- explain the prerequisites:
  - database name
  - database username
  - database password
  - database host
  - table prefix
- provide the "Let's go!" handoff to step `1`

#### Step `1`

- render the database connection form
- collect:
  - DB name
  - username
  - password
  - host
  - table prefix

#### Step `2`

This is the real execution step.

It:

1. reloads locale
2. reads submitted DB credentials and prefix
3. validates table prefix:
   - must not be empty
   - may contain only letters, digits, underscores
4. defines:
   - `DB_NAME`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_HOST`
5. rebuilds `wpdb` via `require_wp_db()`
6. calls `$wpdb->db_connect()`
7. dies on DB connection failure
8. deliberately tests whether the prefix can be parsed as a SQL value, and dies if it can
9. generates the eight WordPress auth keys and salts:
   - first preference: secure `random_int()`
   - fallback: WordPress secret-key API
   - final fallback: `wp_generate_password()`
10. rewrites the sample config lines for:
   - DB constants
   - charset
   - salts / keys
   - `$table_prefix`
11. either:
   - writes `wp-config.php`, then shows "Run the installation"
   - or shows the full generated config for manual copy/paste

### 2.5 File-writing behavior

If the target directory or file is not writable:

- WordPress does not stop the flow permanently
- it shows the generated config contents in a readonly textarea
- the user can still continue manually to `install.php`

So config generation is "best effort" rather than "hard blocker if not writable."

---

## Section 3: `install.php`

### 3.1 Purpose

`install.php` performs the actual site installation after config exists and DB access is possible.

It is responsible for:

- environment compatibility checks
- locale selection
- setup form rendering
- validating initial site/user inputs
- calling `wp_install(...)`

### 3.2 Early boot

The file:

- defines `WP_INSTALLING = true`
- loads `wp-load.php`
- loads `wp-admin/includes/upgrade.php`
- loads translation install API
- loads `class-wpdb.php`
- sends no-cache headers

### 3.3 Hard guards

Before showing the install flow, `install.php` dies if:

- WordPress is already installed
- PHP version is too low
- MySQL version is too low
- required PHP extensions are missing
- `$wpdb->base_prefix` is empty or invalid
- `DO_NOT_UPGRADE_GLOBAL_TABLES` is defined

These are treated as configuration or requirements errors.

### 3.4 Step model

#### Step `0`

- optional language chooser if no language is selected and translations are reachable

#### Step `1`

- optional language pack download/load
- render the install form
- collect:
  - site title
  - username
  - password
  - repeated password
  - email
  - search engine visibility / site visibility

#### Step `2`

This is the install execution step.

It:

1. reloads locale
2. aborts if `$wpdb` already contains an error
3. reads submitted values
4. validates:
   - username exists and is valid
   - passwords match
   - email exists
   - email format is valid
5. if validation fails, re-renders the setup form with an inline error
6. if validation succeeds:
   - enables `wpdb` error display
   - calls `wp_install(...)`
   - renders success page
   - shows username
   - shows generated password when appropriate
   - provides login link

### 3.5 Already-installed behavior

If `is_blog_installed()` returns true:

- WordPress shows an "Already Installed" screen
- provides a login link
- instructs the operator to clear old database tables before reinstalling

So `install.php` is not a reinstall or repair tool. It assumes a clean database target.

---

## Section 4: `wp_install(...)`

`wp_install(...)` in `wp-admin/includes/upgrade.php` is the core install engine.

### 4.1 Main sequence

The inspected function runs in this order:

1. `wp_check_mysql_version()`
2. `wp_cache_flush()`
3. `make_db_current_silent()`
4. unschedule update hooks
5. reschedule version/plugin/theme update checks later
6. `populate_options()`
7. `populate_roles()`
8. set key options:
   - `blogname`
   - `admin_email`
   - `blog_public`
   - `fresh_site`
   - `WPLANG` when present
   - `siteurl`
   - `default_pingback_flag` when site is private
9. create or reuse the admin user
10. force that user to administrator role
11. update user URL if the user was newly created
12. `wp_install_defaults($user_id)`
13. `wp_install_maybe_enable_pretty_permalinks()`
14. `flush_rewrite_rules()`
15. `wp_new_blog_notification(...)`
16. `wp_cache_flush()`
17. fire `do_action('wp_install', $user)`

### 4.2 Admin user behavior

`wp_install(...)` does not always create a brand-new user.

Cases:

- user does not exist and password blank:
  - generate a random password
  - create the user
  - enable password nag
  - include generated password in return payload/message
- user does not exist and password supplied:
  - create user with supplied password
- user already exists:
  - reuse that user
  - report that password is inherited

In all cases:

- resulting user is assigned administrator role

### 4.3 Default content

`wp_install_defaults(...)` inserts the initial site content, including:

- default category
- first post
- first page and related starter content
- default widgets and related install defaults

The first post differs slightly for multisite vs single-site paths.

### 4.4 Pretty permalinks probe

`wp_install_maybe_enable_pretty_permalinks()`:

1. bails if permalink structure already exists
2. tries a rewrite-based pretty structure
3. tries a PATHINFO-style structure
4. flushes rewrite rules hard
5. requests a real post URL
6. checks the returned `X-Pingback` header to confirm rewriting worked
7. falls back to query-string permalinks if all pretty structures fail

This means permalink enablement is not optimistic. It is probe-based.

### 4.5 Notification email

`wp_new_blog_notification(...)` sends the site-owner email with:

- site URL
- username
- password or password placeholder
- login URL

The email payload is filterable through `wp_installed_email`.

---

## Section 5: `upgrade.php`

### 5.1 Purpose

`upgrade.php` upgrades an existing site's database after WordPress code has already been updated.

It is not the automatic updater UI. It is the explicit DB-upgrade screen / endpoint.

### 5.2 Step model

If `?step=upgrade_db` is passed:

- call `wp_upgrade()`
- output `0`
- no HTML UI

Otherwise, WordPress renders a UI flow with three main states:

1. no update required
2. requirements not met
3. database update required
4. update complete

### 5.3 `wp_upgrade()`

`wp_upgrade()` performs:

1. read current `db_version`
2. bail if already current
3. bail if site is not installed
4. `wp_check_mysql_version()`
5. `wp_cache_flush()`
6. `pre_schema_upgrade()`
7. `make_db_current_silent()`
8. `upgrade_all()`
9. if multisite main site:
   - `upgrade_network()`
10. `wp_cache_flush()`
11. update site meta for DB version / last updated in multisite
12. delete transient `wp_core_block_css_files`
13. fire `do_action('wp_upgrade', new, old)`

### 5.4 `upgrade_all()`

`upgrade_all()` is the conditional upgrade runner.

It:

- infers a DB version when one is missing
- populates options
- runs a long sequence of version-specific upgrade functions based on numeric thresholds

This is the historical compatibility engine that lets WordPress upgrade very old installations in-place.

---

## Section 6: Schema Engine

### 6.1 `wp_get_db_schema(...)`

Defined in `wp-admin/includes/schema.php`, this is the canonical SQL generator for:

- blog tables
- single-site users table
- multisite users table
- usermeta
- global tables
- multisite global tables

The schema includes all major core tables such as:

- terms / term_taxonomy / term_relationships / termmeta
- comments / commentmeta
- links
- options
- posts / postmeta
- users / usermeta
- multisite tables when appropriate

### 6.2 `dbDelta(...)`

`dbDelta()` is the schema diff and apply engine.

At a high level it:

1. expands symbolic inputs like `all`, `blog`, `global`, `ms_global`
2. splits SQL into creation and insertion/update buckets
3. filters the queries through hooks
4. inspects live table structure with `DESCRIBE`
5. parses desired fields and indexes from SQL
6. computes:
   - column type changes
   - default changes
   - missing column additions
   - missing index additions
7. executes resulting ALTER/CREATE/INSERT/UPDATE queries when `$execute` is true
8. returns a list of human-readable changes

It is conservative in several places, for example:

- ignores some text/blob "downgrades"
- ignores integer display width differences on newer MySQL versions where width is irrelevant

### 6.3 `make_db_current()` and `make_db_current_silent()`

- `make_db_current()` runs `dbDelta()` and prints a human-readable list of alterations
- `make_db_current_silent()` runs `dbDelta()` with no output

Install and upgrade flows use the silent version.

---

## Section 7: `install-helper.php`

This file exposes low-level helper functions for plugins or installers:

- `maybe_create_table(...)`
- `maybe_add_column(...)`
- `maybe_drop_column(...)`
- `check_column(...)`

These helpers:

- inspect live tables/columns
- run a DDL statement only when needed
- re-check after mutation to infer success

They are explicitly described in source as convenience helpers rather than optimized bulk mechanisms.

---

## Section 8: Architectural Implications

This subsystem shows several important WordPress characteristics:

1. installation is split into config generation and schema/content bootstrap
2. the schema definition lives in PHP, not migrations
3. schema diffing is handled by `dbDelta()` rather than a formal migration history
4. upgrades are cumulative and version-threshold-based
5. first-run content and roles are part of installation, not a separate seed system
6. permalink activation is verified with a live HTTP probe
7. operational resilience is biased toward "continue with manual fallback" instead of hard failure where possible

---

## Section 9: TypeScript Architecture Implications

A TypeScript rewrite would likely split this into separate modules:

- `config-writer`
- `installer`
- `schema-catalog`
- `schema-diff-engine`
- `upgrade-runner`
- `seed-content`
- `operational-compatibility-checker`

Key design lesson:

WordPress treats install and upgrade as runtime application behavior, not as external deployment scripts. Any Tovu-equivalent platform should decide explicitly whether to preserve or reject that model.

## 10. Tovu Reconstruction Notes

### 10.1 Why this exists

This workflow exists to turn a blank install into a runnable site and to apply schema or configuration upgrades safely across version boundaries. It is the bootstrap layer that makes the rest of the system real.

### 10.2 What Tovu should preserve

- A clear first-run path that writes configuration, initializes schema, and seeds required defaults
- Upgrade steps that are version-aware and resumable
- Environment checks that fail early when the platform cannot support the requested installation mode
- Explicit permalink or route verification before declaring the system ready

### 10.3 What Tovu can simplify

- Tovu does not need WordPress-style interactive setup pages if it already has a stronger provisioning flow
- Schema diffing can be backed by migrations rather than runtime PHP introspection
- Seed content and role creation can be separated from the installer UI if desired

### 10.4 Possible Tovu seams

- `src/features/install/` for config generation and first-run setup
- `src/features/upgrade/` for version-threshold migrations and post-upgrade checks
- `src/core/ports/SchemaCatalogPort.ts` for schema discovery and diffing
- `src/core/ports/RouteVerificationPort.ts` for post-install reachability checks

### 10.5 Suggested priority

- `V1`: first-run config and schema bootstrap
- `Later`: interactive installer UX and legacy upgrade compatibility paths
