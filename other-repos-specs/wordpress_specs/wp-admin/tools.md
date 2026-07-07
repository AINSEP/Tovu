# WordPress Admin Tools — TypeScript Rewrite Specification

**Source files analyzed:**
- `wp-admin/tools.php`
- `wp-admin/import.php`
- `wp-admin/export.php`
- `wp-admin/site-health.php`
- `wp-admin/includes/class-wp-site-health.php`
- `wp-admin/includes/export.php`
- `wp-admin/erase-personal-data.php`
- `wp-admin/export-personal-data.php`

---

## Section 1: Overview — The Tools Menu Group

The Tools menu group in the WordPress admin (`/wp-admin/tools.php`) is a collection of utility screens. The menu slug is `tools.php`. The group contains the following items accessible from the admin sidebar:

| Screen           | Slug / URL                          | Required Capability                              |
|------------------|-------------------------------------|--------------------------------------------------|
| Tools (hub)      | `tools.php`                         | varies per tool shown                            |
| Import           | `import.php`                        | `import`                                         |
| Export           | `export.php`                        | `export`                                         |
| Site Health      | `site-health.php`                   | `view_site_health_checks`                        |
| Export Personal Data | `export-personal-data.php`      | `export_others_personal_data`                    |
| Erase Personal Data | `erase-personal-data.php`        | `erase_others_personal_data` AND `delete_users`  |

All screens load the full admin bootstrap (authentication, menus, scripts, styles, header/footer wrappers). Every screen has a contextual help tab registered via `get_current_screen()->add_help_tab()` and a help sidebar with documentation links.

### Legacy URL Redirects in tools.php

`tools.php` handles several legacy URL patterns from before WordPress 5.3 and redirects them with HTTP 301:

- `GET tools.php?wp-privacy-policy-guide` → redirect to `options-privacy.php?tab=policyguide`
- `GET tools.php?page=export_personal_data` → redirect to `export-personal-data.php`
- `GET tools.php?page=remove_personal_data` → redirect to `erase-personal-data.php`
- `POST tools.php?page=export_personal_data` → include `export-personal-data.php` and return
- `POST tools.php?page=remove_personal_data` → include `erase-personal-data.php` and return

---

## Section 2: Available Tools (tools.php)

The tools.php page is a simple hub that conditionally renders tool cards and fires a hook.

### Categories and Tags Converter Card

Displayed only when:
1. The current user has the `import` capability.
2. AND the current user has either `manage_terms` for the `category` taxonomy OR `manage_terms` for the `post_tag` taxonomy.

The card renders a heading "Categories and Tags Converter" and a paragraph linking to `import.php` describing how to navigate to the importer screen to install the converter plugin.

### Extensibility Hook

After the converter card (or in its place if the user lacks permissions), the action hook `tool_box` fires. This allows plugins to add their own tool cards to this screen.

```
do_action('tool_box')
```

### Help Tab

One help tab is registered:
- **ID:** `converter`
- **Title:** "Categories and Tags Converter"
- **Content:** Explains the difference between categories (hierarchical) and tags (flat), and describes how to use the converter via the Import screen.

---

## Section 3: Import (import.php)

### Bootstrap

- Defines the constant `WP_LOAD_IMPORTERS` as `true` before loading WordPress. This constant signals the importer system that importers should be registered.
- Requires `import` capability; dies with error if not met.
- Title: "Import"

### Popular Importers from WordPress.org API

If the current user has `install_plugins` capability, the function `wp_get_popular_importers()` is called. This function fetches a list of popular importer plugins from the WordPress.org API. The returned array is keyed by an importer slug and each value contains:

```typescript
interface PopularImporter {
  name: string;          // Display name, e.g. "WordPress"
  description: string;   // Short description
  'plugin-slug': string; // WordPress.org plugin slug for installation
  'importer-id': string; // The importer ID (may differ from slug, e.g. 'movabletype' → 'mt')
}
```

### Importer Registry

Installed (activated) importers are stored in the global `$wp_importers` array, keyed by importer ID. Each registered importer is a numerically-indexed array with:
- Index 0: Display name (string)
- Index 1: Description (string)
- Index 2 OR key `'install'`: Either a callable or a plugin slug. If the key `'install'` exists, the importer is not yet installed and needs to be downloaded.

The function `get_importers()` returns this global array.

### Registration Flow

1. Retrieve registered importers via `get_importers()`.
2. Retrieve popular importers from WordPress.org API via `wp_get_popular_importers()` (if user can `install_plugins`).
3. For each popular importer not already in the registry, add a dummy entry with `'install' => plugin-slug`.
4. Sort all importers alphabetically by display name using `uasort` with `_usort_by_first_member`.

### Importer Table Rendering

For each importer in the merged list:

**Case A: Importer plugin is registered (installed and active)**
- No `'install'` key present.
- Action link: `<a href="/wp-admin/admin.php?import={importer_id}">Run Importer</a>`

**Case B: Plugin directory exists but plugin is not active**
- `file_exists(WP_PLUGIN_DIR . '/' . plugin_slug)` is true.
- `get_plugins('/' . plugin_slug)` returns at least one plugin.
- Action link: `<a href="/wp-admin/plugins.php?action=activate&plugin={file}&from=import" (nonce)>Run Importer</a>` — activates the plugin.

**Case C: Plugin not installed, on main site**
- Action link: `<a href="/wp-admin/update.php?action=install-plugin&plugin={slug}&from=import" (nonce) class="install-now" data-slug data-name>Install Now</a>`
- Additionally appended: `| <a href="{plugin-install.php thickbox URL}" class="thickbox open-plugin-details-modal">Details</a>`

**Case D: Plugin not installed, on a sub-site in a multisite network**
- Text: "This importer is not installed. Please install importers from <a href="{main_site_admin_url}/import.php">the main site</a>."

The rendered HTML table has class `widefat importers striped` with rows having class `importer-item`. Each row has two cells:
- `.import-system`: contains `.importer-title` (name) and `.importer-action` (action link)
- `.desc`: contains `.importer-desc` (description)

### Invalid Importer Redirect

If `$_GET['invalid']` is present and matches a key in `$popular_importers` whose `'importer-id'` differs from the given slug, redirect to `admin.php?import={importer_id}`. This handles legacy slugs like `movabletype` → `mt`.

### Scripts Loaded

- `plugin-install` (for the AJAX install modal)
- `updates` (for the update mechanism)
- Thickbox (the lightbox library)

### Hooks

- `import_filters` — fires at the end of the Import screen (since 6.8.0), allowing plugins to add additional filter UI.

---

## Section 4: Export (export.php)

### Access Control

Requires `export` capability.

### Export Form

The form uses `method="get"` and has `id="export-filters"`. A hidden field `download=true` is included. When the form is submitted, the `download` parameter triggers the WXR generation.

#### Export Choices (radio buttons, `name="content"`)

| Value | Label | Sub-filters |
|-------|-------|-------------|
| `all` | All content | None |
| `posts` | Posts | Category, Author, Start Date, End Date, Status |
| `pages` | Pages | Author, Start Date, End Date, Status |
| `{custom_post_type}` | {Post type label} | None (for each non-built-in post type with `can_export: true`) |
| `attachment` | Media | Start Date, End Date |

The "All content" radio is checked by default and its description is: "This will contain all of your posts, pages, comments, custom fields, terms, navigation menus, and custom posts."

#### Date Options (`export_date_options(post_type)`)

A SQL query retrieves distinct `YEAR(post_date)` and `MONTH(post_date)` for the given post type where `post_status != 'auto-draft'`, ordered `DESC`. The result populates `<option value="YYYY-MM">Month YYYY</option>` entries.

#### Post Filters (shown when `content=posts`)

- **Categories:** `wp_dropdown_categories` with "All" option (`id="export-filters"` context)
- **Authors:** `wp_dropdown_users` showing only users who have authored at least one post; `name="post_author"`, `show="display_name_with_login"`
- **Start Date:** `<select name="post_start_date">` populated by `export_date_options('post')`
- **End Date:** `<select name="post_end_date">` populated by `export_date_options('post')`
- **Status:** `<select name="post_status">` with all non-internal post statuses plus "All"

#### Page Filters (shown when `content=pages`)

- **Authors:** `wp_dropdown_users` showing only page authors; `name="page_author"`
- **Start Date:** `<select name="page_start_date">`
- **End Date:** `<select name="page_end_date">`
- **Status:** `<select name="page_status">`

#### Attachment Filters (shown when `content=attachment`)

- **Start Date:** `<select name="attachment_start_date">`
- **End Date:** `<select name="attachment_end_date">`

#### JavaScript Behavior

The filter sub-sections (`.export-filters`) are hidden by default. When a radio button changes, all `.export-filters` sections slide up, then the relevant section slides down:
- `attachment` → `#attachment-filters`
- `posts` → `#post-filters`
- `pages` → `#page-filters`

### Export Download Trigger

When `$_GET['download']` is set, `export_wp($args)` is called and the process exits. The `$args` array is assembled from GET parameters:

```typescript
interface ExportArgs {
  content: 'all' | 'post' | 'page' | 'attachment' | string; // custom post type slug
  author?: number;       // user ID; only for post/page/attachment
  category?: number;     // term ID; only for post
  start_date?: string;   // 'YYYY-MM' format
  end_date?: string;     // 'YYYY-MM' format
  status?: string;       // post status slug; only for post/page
}
```

The `export_args` filter is applied to `$args` before export, allowing modifications.

### Hook

- `export_filters` — fires at the end of the export form fieldset, before the submit button.

---

## Section 4a: The WXR Format (WordPress eXtended RSS)

### Version

`WXR_VERSION = '1.2'`

### HTTP Response Headers

```
Content-Description: File Transfer
Content-Disposition: attachment; filename={sitename}.WordPress.{YYYY-MM-DD}.xml
Content-Type: text/xml; charset={blog_charset}
```

Filename format: `{sanitized_sitename}.WordPress.{YYYY-MM-DD}.xml`. The `export_wp_filename` filter allows customizing the filename.

### XML Document Structure

```xml
<?xml version="1.0" encoding="{charset}" ?>
<!-- comments explaining how to import -->
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/"
>
<channel>
  <!-- Channel-level elements -->
  <!-- Author declarations -->
  <!-- Category declarations -->
  <!-- Tag declarations -->
  <!-- Custom term declarations -->
  <!-- Nav menu term declarations (when content=all) -->
  <!-- rss2_head hook fires here -->
  <!-- Item elements (one per post) -->
</channel>
</rss>
```

### Channel-Level Elements

| Element | Content |
|---------|---------|
| `<title>` | Site name (RSS-escaped) |
| `<link>` | Site URL (RSS-escaped) |
| `<description>` | Site tagline (RSS-escaped) |
| `<pubDate>` | Current UTC time in RFC 2822 format |
| `<language>` | Site language |
| `<wp:wxr_version>` | `1.2` |
| `<wp:base_site_url>` | Network home URL (multisite) or site URL (single site) |
| `<wp:base_blog_url>` | Site URL |

### Author Declarations (`<wp:author>`)

One block per distinct author who has posts (excluding `auto-draft`). Queried in batches of 20 post IDs.

```xml
<wp:author>
  <wp:author_id>{integer}</wp:author_id>
  <wp:author_login><![CDATA[{login}]]></wp:author_login>
  <wp:author_email><![CDATA[{email}]]></wp:author_email>
  <wp:author_display_name><![CDATA[{display_name}]]></wp:author_display_name>
  <wp:author_first_name><![CDATA[{first_name}]]></wp:author_first_name>
  <wp:author_last_name><![CDATA[{last_name}]]></wp:author_last_name>
</wp:author>
```

### Category Declarations (`<wp:category>`)

All categories, ordered so no child appears before its parent (topological sort). Only emitted when `content=all` or when filtering by a specific category.

```xml
<wp:category>
  <wp:term_id>{integer}</wp:term_id>
  <wp:category_nicename><![CDATA[{slug}]]></wp:category_nicename>
  <wp:category_parent><![CDATA[{parent_slug_or_empty}]]></wp:category_parent>
  <wp:cat_name><![CDATA[{name}]]></wp:cat_name>
  <!-- Optional: -->
  <wp:category_description><![CDATA[{description}]]></wp:category_description>
  <!-- Zero or more: -->
  <wp:termmeta>
    <wp:meta_key><![CDATA[{key}]]></wp:meta_key>
    <wp:meta_value><![CDATA[{value}]]></wp:meta_value>
  </wp:termmeta>
</wp:category>
```

### Tag Declarations (`<wp:tag>`)

All tags (when `content=all`).

```xml
<wp:tag>
  <wp:term_id>{integer}</wp:term_id>
  <wp:tag_slug><![CDATA[{slug}]]></wp:tag_slug>
  <wp:tag_name><![CDATA[{name}]]></wp:tag_name>
  <!-- Optional: -->
  <wp:tag_description><![CDATA[{description}]]></wp:tag_description>
  <!-- Zero or more wp:termmeta blocks -->
</wp:tag>
```

### Custom Taxonomy Term Declarations (`<wp:term>`)

All terms from all non-built-in taxonomies (when `content=all`). Topologically sorted (parents before children).

```xml
<wp:term>
  <wp:term_id>{integer}</wp:term_id>
  <wp:term_taxonomy><![CDATA[{taxonomy_slug}]]></wp:term_taxonomy>
  <wp:term_slug><![CDATA[{slug}]]></wp:term_slug>
  <wp:term_parent><![CDATA[{parent_slug_or_empty}]]></wp:term_parent>
  <wp:term_name><![CDATA[{name}]]></wp:term_name>
  <!-- Optional: -->
  <wp:term_description><![CDATA[{description}]]></wp:term_description>
  <!-- Zero or more wp:termmeta blocks -->
</wp:term>
```

### Navigation Menu Term Declarations

When `content=all`, nav menus are emitted as `<wp:term>` with `<wp:term_taxonomy>nav_menu</wp:term_taxonomy>`.

### Item Elements (`<item>`)

Posts are fetched in batches of 20 to avoid memory exhaustion. The export processes only posts with `post_status != 'auto-draft'`. Each post generates one `<item>` block.

When `content` is not `all` or `attachment`, the export also queries and appends attachment children (`post_type='attachment'`, `post_parent IN (...)`) and featured image IDs (`_thumbnail_id` meta) in batches of 20.

```xml
<item>
  <title><![CDATA[{post_title}]]></title>
  <link>{permalink}</link>
  <pubDate>{post_date_gmt in RFC 2822 format}</pubDate>
  <dc:creator><![CDATA[{author_login}]]></dc:creator>
  <guid isPermaLink="false">{post_guid}</guid>
  <description></description>
  <content:encoded><![CDATA[{post_content}]]></content:encoded>
  <excerpt:encoded><![CDATA[{post_excerpt}]]></excerpt:encoded>
  <wp:post_id>{integer}</wp:post_id>
  <wp:post_date><![CDATA[{YYYY-MM-DD HH:MM:SS local}]]></wp:post_date>
  <wp:post_date_gmt><![CDATA[{YYYY-MM-DD HH:MM:SS UTC}]]></wp:post_date_gmt>
  <wp:post_modified><![CDATA[{YYYY-MM-DD HH:MM:SS local}]]></wp:post_modified>
  <wp:post_modified_gmt><![CDATA[{YYYY-MM-DD HH:MM:SS UTC}]]></wp:post_modified_gmt>
  <wp:comment_status><![CDATA[open|closed]]></wp:comment_status>
  <wp:ping_status><![CDATA[open|closed]]></wp:ping_status>
  <wp:post_name><![CDATA[{slug}]]></wp:post_name>
  <wp:status><![CDATA[{post_status}]]></wp:status>
  <wp:post_parent>{integer}</wp:post_parent>
  <wp:menu_order>{integer}</wp:menu_order>
  <wp:post_type><![CDATA[{post_type}]]></wp:post_type>
  <wp:post_password><![CDATA[{password_or_empty}]]></wp:post_password>
  <wp:is_sticky>{0|1}</wp:is_sticky>

  <!-- Only for post_type='attachment': -->
  <wp:attachment_url><![CDATA[{full_url}]]></wp:attachment_url>

  <!-- Zero or more taxonomy term assignments: -->
  <category domain="{taxonomy}" nicename="{slug}"><![CDATA[{name}]]></category>

  <!-- Zero or more post meta entries (excluding filtered ones): -->
  <wp:postmeta>
    <wp:meta_key><![CDATA[{key}]]></wp:meta_key>
    <wp:meta_value><![CDATA[{value}]]></wp:meta_value>
  </wp:postmeta>

  <!-- Zero or more comments (excluding spam): -->
  <wp:comment>
    <wp:comment_id>{integer}</wp:comment_id>
    <wp:comment_author><![CDATA[{author}]]></wp:comment_author>
    <wp:comment_author_email><![CDATA[{email}]]></wp:comment_author_email>
    <wp:comment_author_url>{sanitized_url}</wp:comment_author_url>
    <wp:comment_author_IP><![CDATA[{ip}]]></wp:comment_author_IP>
    <wp:comment_date><![CDATA[{YYYY-MM-DD HH:MM:SS local}]]></wp:comment_date>
    <wp:comment_date_gmt><![CDATA[{YYYY-MM-DD HH:MM:SS UTC}]]></wp:comment_date_gmt>
    <wp:comment_content><![CDATA[{content}]]></wp:comment_content>
    <wp:comment_approved><![CDATA[{0|1|trash|post-trashed}]]></wp:comment_approved>
    <wp:comment_type><![CDATA[{comment|pingback|trackback}]]></wp:comment_type>
    <wp:comment_parent>{integer}</wp:comment_parent>
    <wp:comment_user_id>{integer}</wp:comment_user_id>
    <!-- Zero or more comment meta: -->
    <wp:commentmeta>
      <wp:meta_key><![CDATA[{key}]]></wp:meta_key>
      <wp:meta_value><![CDATA[{value}]]></wp:meta_value>
    </wp:commentmeta>
  </wp:comment>
</item>
```

### Content Filters Applied During Export

| Filter | Applied To |
|--------|-----------|
| `the_title_export` | `post_title` |
| `the_content_export` | `post_content` |
| `the_excerpt_export` | `post_excerpt` |
| `wxr_export_skip_postmeta` | Each post meta row — return `true` to skip |
| `wxr_export_skip_commentmeta` | Each comment meta row — return `true` to skip |
| `wxr_export_skip_termmeta` | Each term meta row — return `true` to skip |

The built-in `wxr_filter_postmeta` callback skips the `_edit_lock` meta key.

### CDATA Encoding

All string values in the WXR file are wrapped in `<![CDATA[...]]>`. If the string contains `]]>`, it is split as `]]]]><![CDATA[>`. Invalid UTF-8 is encoded with `utf8_encode()` before wrapping.

### Export Query Logic

The export selects post IDs first (snapshot), then loads post data in batches of 20 using `SELECT * FROM wp_posts WHERE ID IN (...)`. This prevents memory issues on large datasets.

**Date filtering:**
- `start_date` adds `AND post_date >= '{YYYY-MM-DD}'` (first day of selected month)
- `end_date` adds `AND post_date < '{YYYY-MM-DD}'` (first day of the month AFTER the selected month — i.e., `+1 month` from the end date)

---

## Section 5: Site Health (site-health.php)

### Access and Bootstrap

- Requires `view_site_health_checks` capability (403 if denied).
- Enqueues `site-health` style and `site-health` script.
- Instantiates `WP_Site_Health::get_instance()` (singleton).
- Calls `$health_check_site_status->check_wp_version_check_exists()` to detect blocked update checks.
- The page title dynamically includes the active tab name.

### Tabs

Default tabs:
- `''` (empty slug) → "Status"
- `'debug'` → "Info"

Additional tabs can be added via the `site_health_navigation_tabs` filter (since 5.8.0). The nav bar displays up to 4 tabs inline; any beyond 3 are collapsed into an overflow dropdown triggered by a button with `aria-haspopup="true"`.

If `$_GET['tab']` is set and non-empty, the `site_health_tab_content` action is fired with the tab slug. The `WP_Site_Health` class listens for the `debug` tab to include `site-health-info.php`.

### HTTPS Update Action

`POST site-health.php?action=update_https`:
1. Verify nonce `wp_update_https`.
2. Verify `update_https` capability.
3. Verify `wp_is_https_supported()`.
4. Call `wp_update_urls_to_https()`.
5. Redirect back with `?https_updated=1` (success) or `?https_updated=0` (failure).

### JavaScript Variables Passed to `SiteHealth` Object

```typescript
interface SiteHealthJSVariables {
  screen: string; // 'site-health' or 'dashboard'
  nonce: {
    site_status: string;
    site_status_result: string;
  };
  site_status: {
    direct: SiteHealthTestResult[];  // Results of synchronous tests, pre-computed on page load
    async: AsyncTestDescriptor[];    // Descriptors for async tests to run via REST/AJAX
    issues: {
      good: number;
      recommended: number;
      critical: number;
    };
  };
}

interface AsyncTestDescriptor {
  test: string;       // REST API URL or test name
  has_rest: boolean;
  completed: boolean;
  headers: Record<string, string>;
}
```

Issue counts are cached in the `health-check-site-status-result` transient (as JSON) and pre-populated if available.

### Status Tab HTML Structure

- `.site-status-all-clear` — shown when there are zero issues (initially hidden)
- `.site-status-has-issues` — shown when there are issues
  - `#health-check-issues-critical` — accordion container for critical issues
  - `#health-check-issues-recommended` — accordion container for recommended improvements
- `#health-check-issues-good` — accordion for passed tests (toggled by "Passed tests" button)

Each issue is rendered from a Underscore.js template `#tmpl-health-check-issue`:
- `data.label` — heading text
- `data.badge.color` and `data.badge.label` — colored badge (e.g., Security/blue)
- `data.description` — HTML description (rendered unescaped with `{{{ }}}`)
- `data.actions` — HTML action links (rendered unescaped)
- `data.test` — unique test name (used as element ID)

A circular SVG progress indicator with `id="bar"` is shown while tests are loading.

---

## Section 5a: WP_Site_Health Class

**File:** `wp-admin/includes/class-wp-site-health.php`
**Since:** 5.2.0
**Pattern:** Singleton via `WP_Site_Health::get_instance()`

### Constructor Behavior

1. Calls `$this->maybe_create_scheduled_event()` — schedules the `wp_site_health_scheduled_check` daily cron event if it doesn't exist.
2. Saves `ini_get('memory_limit')` to `$this->php_memory_limit` (before admin memory boost).
3. Sets cron timeout thresholds:
   - Normal: `timeout_late_cron = 0`, `timeout_missed_cron = -5 minutes`
   - With `DISABLE_WP_CRON`: `timeout_late_cron = -15 minutes`, `timeout_missed_cron = -1 hour`
4. Registers hooks:
   - `admin_body_class` → `$this->admin_body_class`
   - `admin_enqueue_scripts` → `$this->enqueue_scripts`
   - `wp_site_health_scheduled_check` → `$this->wp_cron_scheduled_check`
   - `site_health_tab_content` → `$this->show_site_health_tab`

### Test Execution Model

**Direct tests** run synchronously on page load (server-side) and are serialized into the `SiteHealth.site_status.direct` JavaScript array.

**Async tests** are described in the `SiteHealth.site_status.async` array. The JavaScript engine makes REST API requests (or admin-ajax fallback) for each, updating the UI as results arrive.

Each test result passes through the `site_status_test_result` filter before being returned.

### `get_tests()` — Full Test Registry

```typescript
interface TestDefinition {
  label: string;
  test: string | URL;  // method name for direct, REST URL for async
  has_rest?: boolean;
  async_direct_test?: [WP_Site_Health, string]; // fallback for no-JS
  skip_cron?: boolean;
  headers?: Record<string, string>; // for authorization_header test
}

interface TestRegistry {
  direct: Record<string, TestDefinition>;
  async: Record<string, TestDefinition>;
}
```

**Direct tests (always run):**

| Key | Test Method | Label |
|-----|-------------|-------|
| `wordpress_version` | `get_test_wordpress_version` | WordPress Version |
| `plugin_version` | `get_test_plugin_version` | Plugin Versions |
| `theme_version` | `get_test_theme_version` | Theme Versions |
| `php_version` | `get_test_php_version` | PHP Version |
| `php_extensions` | `get_test_php_extensions` | PHP Extensions |
| `php_default_timezone` | `get_test_php_default_timezone` | PHP Default Timezone |
| `php_sessions` | `get_test_php_sessions` | PHP Sessions |
| `sql_server` | `get_test_sql_server` | Database Server version |
| `ssl_support` | `get_test_ssl_support` | Secure communication |
| `scheduled_events` | `get_test_scheduled_events` | Scheduled events |
| `http_requests` | `get_test_http_requests` | HTTP Requests |
| `rest_availability` | `get_test_rest_availability` | REST API availability |
| `debug_enabled` | `get_test_is_in_debug_mode` | Debugging enabled |
| `file_uploads` | `get_test_file_uploads` | File uploads |
| `plugin_theme_auto_updates` | `get_test_plugin_theme_auto_updates` | Plugin and theme auto-updates |
| `update_temp_backup_writable` | `get_test_update_temp_backup_writable` | Plugin and theme temporary backup directory access |
| `available_updates_disk_space` | `get_test_available_updates_disk_space` | Available disk space |
| `autoloaded_options` | `get_test_autoloaded_options` | Autoloaded options |
| `search_engine_visibility` | `get_test_search_engine_visibility` | Search Engine Visibility |

**Direct tests (production only — when `wp_get_environment_type() === 'production'`):**

| Key | Test Method | Label |
|-----|-------------|-------|
| `persistent_object_cache` | `get_test_persistent_object_cache` | Persistent object cache |

**Async tests (always run, unless on development environment):**

| Key | REST URL | Label |
|-----|---------|-------|
| `dotorg_communication` | `wp-site-health/v1/tests/dotorg-communication` | Communication with WordPress.org |
| `background_updates` | `wp-site-health/v1/tests/background-updates` | Background updates |
| `loopback_requests` | `wp-site-health/v1/tests/loopback-requests` | Loopback request |
| `https_status` | `wp-site-health/v1/tests/https-status` | HTTPS status (skipped on development) |
| `authorization_header` | `wp-site-health/v1/tests/authorization-header` | Authorization header (added only when site NOT protected by Basic Auth) |

**Async tests (production only):**

| Key | REST URL | Label |
|-----|---------|-------|
| `page_cache` | `wp-site-health/v1/tests/page-cache` | Page cache |

**Extensibility:** The `site_status_tests` filter receives the complete `$tests` array and can add, remove, or modify any test entry.

### Test Result Structure

```typescript
interface SiteHealthTestResult {
  label: string;          // Human-readable result heading
  status: 'good' | 'recommended' | 'critical';
  badge: {
    label: string;        // Category name: 'Security', 'Performance', 'Requirements'
    color: string;        // CSS color class: 'blue', 'orange', 'red'
  };
  description: string;    // HTML string with detailed explanation
  actions: string;        // HTML string with action links
  test: string;           // Unique test identifier/slug
}
```

### Individual Test Behaviors

#### `get_test_wordpress_version`

- Badge: Performance / blue
- Calls `wp_get_wp_version()` and `get_core_updates()`.
- `good` if up to date.
- `recommended` if major update available.
- `critical` + badge "Security" if minor/security update available.
- `recommended` if update check failed (unable to reach WordPress.org).

#### `get_test_plugin_version`

- Badge: Security / blue
- Iterates all installed plugins via `get_plugins()` and `get_plugin_updates()`.
- `good` if all active plugins are up to date.
- `critical` if any plugin has an available update.
- `recommended` if inactive plugins exist (on single-site only).

#### `get_test_theme_version`

- Badge: Security / blue
- Compares installed themes against `get_theme_updates()`.
- `critical` if any theme needs an update.
- `recommended` if inactive themes exceed allowed count (1 + 1 for default theme + 1 for parent theme if child theme).
- `recommended` if no default Twenty* theme is installed.

#### `get_test_php_version`

- Badge: Performance / blue (changes to Requirements if near future minimum)
- Calls `wp_check_php_version()` against WordPress.org Serve Happy API.
- `good` if at or above recommended version.
- `recommended` if supported but below recommended.
- `critical` if below future minimum (soon unsupported by WordPress).
- `critical` with Security badge if receiving no security updates.

#### `get_test_php_extensions`

- Badge: Performance / blue
- Checks a fixed list of PHP modules:
  - **Required** (`required: true`): `hash`, `json`
  - **Recommended** (`required: false`): `curl`, `dom`, `exif`, `fileinfo`, `imagick` (or fallback `gd`), `mbstring`, `mysqli`, `libsodium` (or fallback `mcrypt`), `openssl`, `pcre`, `mod_xml` (or fallback `simplexml`, `xmlreader`), `zip` (or fallback `zlib`), `filter`, `iconv`, `intl`
- For modules with `fallback_for`: if the primary module fails, the fallback becomes required.
- `critical` if any required module is missing.
- `recommended` if any optional module is missing.
- Filterable via `site_status_test_php_modules`.

#### `get_test_php_default_timezone`

- `good` if `date_default_timezone_get() === 'UTC'`
- `critical` if any plugin/theme called `date_default_timezone_set()` after WordPress loaded.

#### `get_test_php_sessions`

- `good` if no active PHP session.
- `critical` if `session_status() === PHP_SESSION_ACTIVE`.

#### `get_test_sql_server`

- Badge: Performance / blue (changes to Security if critically outdated)
- Required version: MySQL 5.5 / MariaDB (auto-detected via `SHOW VARIABLES` / `db_server_info()`).
- Recommended version: MySQL 8.0, MariaDB 10.6.
- `good` if at or above recommended.
- `recommended` if below recommended but above required.
- `critical` + Security badge if below required.
- Notes presence of `wp-content/db.php` drop-in.

#### `get_test_ssl_support`

- Tests `wp_http_supports(['ssl'])`.
- `good` if SSL is supported.
- `critical` if not.

#### `get_test_scheduled_events`

- Badge: Performance / blue
- Calls `$this->wp_schedule_test_init()` to populate cron schedule data.
- Checks `has_missed_cron()` and `has_late_cron()`.
- `critical` if schedule check returned a WP_Error.
- `recommended` if a cron event missed or is late.
- `good` otherwise.

#### `get_test_background_updates`

- Badge: Security / blue
- Delegates to `WP_Site_Health_Auto_Updates->run_tests()`.
- `critical` if any sub-test has severity `'fail'`.
- `recommended` if any sub-test has severity `'warning'`.

#### `get_test_plugin_theme_auto_updates`

- Badge: Security / blue
- Calls `$this->detect_plugin_theme_auto_update_issues()`.
- Returns the status from that method (good/recommended/critical).

#### `get_test_available_updates_disk_space`

- Badge: Security / blue
- Calls `disk_free_space(WP_CONTENT_DIR)`.
- `critical` if < 20 MB.
- `recommended` if < 100 MB or if check failed.
- `good` otherwise.

#### `get_test_update_temp_backup_writable`

- Badge: Security / blue
- Uses WP_Filesystem to check `wp-content/upgrade-temp-backup/plugins` and `wp-content/upgrade-temp-backup/themes` directories.
- `critical` if either required directory exists but is not writable.
- `critical` if `wp-content/upgrade` is not writable (needed to create backup dir).

#### `get_test_loopback_requests`

- Badge: Performance / blue
- Calls `$this->can_perform_loopback()` which makes an HTTP request to `admin-ajax.php`.
- `good` if loopback succeeds.
- `critical` if it fails.

#### `get_test_http_requests`

- Badge: Performance / blue
- Checks `WP_HTTP_BLOCK_EXTERNAL` constant.
- `critical` if blocked with no allowed hosts.
- `recommended` if blocked with some allowed hosts (`WP_ACCESSIBLE_HOSTS`).
- `good` otherwise.

#### `get_test_rest_availability`

- Badge: Performance / blue
- Makes loopback HTTP GET to `{rest_url}/wp/v2/types/post?context=edit` with nonce header.
- `good` if response is 200 and JSON has `capabilities` field.
- `critical` if WP_Error.
- `recommended` if non-200 HTTP status.
- `recommended` if 200 but JSON lacks `capabilities`.

#### `get_test_file_uploads`

- Badge: Performance / blue
- Checks `ini_get('file_uploads')`.
- `critical` if disabled.
- `recommended` if `post_max_size < upload_max_filesize`.

#### `get_test_authorization_header`

- Badge: Security / blue
- Makes HTTP request with `Authorization: Basic base64(user:pwd)` header.
- Tests presence and correctness of `$_SERVER['PHP_AUTH_USER']` and `$_SERVER['PHP_AUTH_PW']`.
- `good` if values match `user` and `pwd`.
- `recommended` otherwise, with link to flush permalinks (if mod_rewrite available) or docs.

#### `get_test_https_status` (async)

- Badge: Security / blue
- Calls `wp_is_using_https()`. If false:
  - `recommended` with description explaining which URLs need updating.
  - If HTTPS is supported (`wp_is_https_supported()`), shows an "Update your site to use HTTPS" button.
  - If not supported, links to hosting provider guidance.
- Skipped entirely on development environments.

#### `get_test_dotorg_communication` (async)

- Badge: Security / blue
- Makes HTTP GET to `https://api.wordpress.org` with 10-second timeout.
- `good` if response is not a WP_Error.
- `critical` if WP_Error, reporting the IP address WordPress.org resolves to and the error message.

#### `get_test_page_cache` (async, production only)

- Badge: Performance / blue
- Makes 3 HTTP requests to homepage, looks for cache-related response headers.
- Also checks for presence of advanced-cache drop-in.
- `good` if cache headers present AND response time below threshold.
- `recommended` if response time OK but no cache headers.
- `critical` if response time exceeds threshold and no cache found.

#### `get_test_persistent_object_cache` (direct, production only)

- Badge: Performance / blue
- Calls `wp_using_ext_object_cache()`.
- `good` if external object cache is active.
- `good` (label: "not required") if `should_suggest_persistent_object_cache()` returns false.
- `recommended` otherwise, listing available object cache services (Memcache, Memcached, Redis, etc.).

#### `get_test_is_in_debug_mode`

- Badge: Security / blue
- `good` if `WP_DEBUG` is false or undefined.
- `critical` (or `recommended` on dev) if `WP_DEBUG_DISPLAY` is true.
- `critical` if `WP_DEBUG_LOG` is true and log file is within ABSPATH (publicly accessible); `recommended` if log file is outside ABSPATH.

---

## Section 6: Site Health Info Tab

The Info tab (`?tab=debug`) is handled by `site-health-info.php` (included via the `site_health_tab_content` hook). It uses `WP_Debug_Data::check_for_updates()` and `WP_Debug_Data::debug_data()` to gather all system information, then renders it as collapsible sections.

A "Copy site info to clipboard" button serializes all field values into a plain-text format.

### Info Sections and Fields

Each section has a `label`, optional `description`, and a `fields` array of named field entries. Each field has `label`, `value`, and optionally `private: true` (redacted in copy-to-clipboard export) and `debug` (alternative value for the clipboard export).

**WordPress Section (`wp-core`):**
- WordPress version, site language, site URL, home URL, permalink structure, HTTPS in use, user registration enabled, default comment status, environment type, user count, multisite status.

**Directories and Sizes Section (`wp-paths-sizes`):**
- WordPress directory path and size, uploads directory path and size, themes directory path and size, plugins directory path and size, total size of all WordPress files.

**Drop-ins Section (`wp-dropins`):**
- Lists any active drop-in files (`advanced-cache.php`, `db.php`, `db-error.php`, `install.php`, `maintenance.php`, `object-cache.php`, `sunrise.php`, `blog-deleted.php`, `blog-inactive.php`, `blog-suspended.php`).

**Active Theme Section (`wp-active-theme`):**
- Theme name, version, author, author website, parent theme (if child theme), theme features, theme directory path.

**Parent Theme Section (`wp-parent-theme`):**
- Same fields as active theme but for the parent.

**Inactive Themes Section (`wp-themes-inactive`):**
- List of inactive themes with name, version, author.

**Must-Use Plugins (`wp-mu-plugins`):**
- Name, version, author for each mu-plugin.

**Active Plugins (`wp-plugins-active`):**
- Plugin name, version, author, auto-update status for each active plugin.

**Inactive Plugins (`wp-plugins-inactive`):**
- Same fields for inactive plugins.

**Media Handling Section (`wp-media`):**
- Active editor (Imagick or GD), Imagick module version, Imagick installed, GD installed, GD version, Ghostscript installed.

**Server Section (`wp-server`):**
- PHP version, PHP SAPI, PHP max input variables, PHP time limit, PHP memory limit, max input time, upload max filesize, PHP post max size, cURL version, SUHOSIN installed, Imagick loaded, htaccess extra rules, server architecture, web server info, PHP extensions list.

**Database Section (`wp-database`):**
- Extension (mysqli or mysql), server version, client version, database host, database name, database prefix, table prefix max length status.

**WordPress Constants Section (`wp-constants`):**
- Values of: `ABSPATH`, `WP_HOME`, `WP_SITEURL`, `WP_CONTENT_DIR`, `WP_PLUGIN_DIR`, `WP_MAX_MEMORY_LIMIT`, `WP_DEBUG`, `WP_DEBUG_DISPLAY`, `WP_DEBUG_LOG`, `SCRIPT_DEBUG`, `WP_CACHE`, `CONCATENATE_SCRIPTS`, `COMPRESS_SCRIPTS`, `COMPRESS_CSS`, `WP_ENVIRONMENT_TYPE`, `DB_CHARSET`, `DB_COLLATE`.

**Filesystem Permissions Section (`wp-filesystem`):**
- WordPress directory writable, wp-content directory writable, uploads directory writable, plugins directory writable, themes directory writable.

The `debug_information` filter allows modifying this entire sections array.

---

## Section 7: Privacy Tools

### Export Personal Data (export-personal-data.php)

**Capability required:** `export_others_personal_data`

**Purpose:** GDPR/privacy law compliance. Allows site admins to generate and email a ZIP file containing all personal data associated with a given email address.

#### Request Flow

1. Admin enters a username or email address in the "Add Data Export Request" form.
2. A confirmation email is sent to the data subject (user) with a unique confirmation link (unless the checkbox to send confirmation is unchecked, in which case admin confirms directly).
3. Once confirmed, the request status moves to `confirmed`.
4. Admin clicks "Send Export Link" from the list table.
5. WordPress gathers personal data from all registered exporters.
6. A ZIP file is generated and placed in the private exports directory.
7. An email with a download link is sent to the data subject.
8. Download link expires after a configurable period.

#### Privacy Exports Directory

The exports directory is stored at `{uploads_dir}/wp-personal-data-exports/` with an `.htaccess` file preventing direct access. The path is filtered via `wp_privacy_exports_dir` and the URL via `wp_privacy_exports_url`.

#### Request Post Type

Privacy requests are stored as `user_request` custom posts:
- `post_title`: The email address of the requester
- `post_status`: `request-pending` | `request-confirmed` | `request-failed` | `request-completed`
- `post_type`: `user_request`
- `post_name`: Unique key for confirmation links
- Meta: `_wp_user_request_type` = `'export_personal_data'`

#### List Table (`WP_Privacy_Data_Export_Requests_List_Table`)

Columns: Requester (email), Status, Requested, Next Steps (action buttons: Resend confirmation email / Send Export Link / Download Export File).

Bulk actions: Resend confirmation email, Delete requests.

Status filter views: All, Pending, Confirmed, Failed, Completed.

#### Data Collection

The function `wp_privacy_generate_personal_data_export_file($request_id)` iterates all registered exporters in order:

```typescript
interface PersonalDataExporter {
  exporter_friendly_name: string;
  callback: (email: string, page: number) => {
    data: Array<{
      group_id: string;
      group_label: string;
      group_description?: string;
      item_id: string;
      data: Array<{ name: string; value: string }>;
    }>;
    done: boolean;
  };
}
```

Exporters are registered via the `wp_privacy_personal_data_exporters` filter. Built-in exporters handle:
- User profile data (name, email, username, registration date, bio)
- Community events location (IP address stored in user meta)
- Session tokens
- Comments (email, IP, user agent, content, URL, date)
- Media file URLs

The collected data is written to an `index.html` file (human-readable) and a `{email-address}_{hash}.json` file, both compressed into a ZIP archive named `{email-address}_{hash}.zip`.

---

### Erase Personal Data (erase-personal-data.php)

**Capability required:** `erase_others_personal_data` AND `delete_users`

**Purpose:** Allows site admins to delete or anonymize personal data for a given email address (GDPR "Right to be Forgotten").

#### Erasure Flow

1. Admin submits a username or email in the "Add Data Erasure Request" form.
2. Confirmation email is sent to the data subject.
3. Once confirmed, status becomes `confirmed`.
4. Admin clicks "Erase Personal Data" from the list table.
5. WordPress calls all registered erasure handlers.
6. A confirmation email is sent to the data subject (if configured).

#### List Table (`WP_Privacy_Data_Removal_Requests_List_Table`)

Columns: Requester (email), Status, Requested, Next Steps (Resend confirmation / Erase Personal Data buttons).

Bulk actions: Resend confirmation email, Delete requests.

#### Data Erasure Handlers

```typescript
interface PersonalDataEraser {
  eraser_friendly_name: string;
  callback: (email: string, page: number) => {
    items_removed: boolean;
    items_retained: boolean;
    messages: string[];
    done: boolean;
  };
}
```

Erasers are registered via the `wp_privacy_personal_data_erasers` filter. Built-in erasers handle:
- Profile data: user account is deleted or anonymized
- Community events location: meta removed
- Session tokens: all sessions terminated
- Comments: anonymizes author email, IP, and user agent fields (content is not deleted)
- Media: lists URLs but does NOT automatically delete files

#### Shared Infrastructure

Both export and erase screens use `_wp_personal_data_handle_actions()` to process form submissions and `_wp_personal_data_cleanup_requests()` to remove failed/expired requests before display.

Per-page screen option defaults: 20 requests per page (`export_personal_data_requests_per_page` / `remove_personal_data_requests_per_page` user meta).

---

### Privacy Policy Guide

The Privacy Policy Guide is accessible at `options-privacy.php?tab=policyguide`. It shows guidance text contributed by plugins via the `wp_add_privacy_policy_content()` function. The guide explains what personal data each plugin collects.

---

## Section 8: Key Hooks and Filters

### Hooks (actions)

| Hook | Location | Description |
|------|----------|-------------|
| `tool_box` | `tools.php` | Fires at end of Tools screen. Plugins add tool cards here. |
| `export_wp` | `includes/export.php` | Fires before export begins; receives `$args` array. |
| `rss2_head` | `includes/export.php` | Fires inside `<channel>` before items; used for WXR head extensions. |
| `import_filters` | `import.php` | Fires at end of Import screen (since 6.8.0). |
| `wp_site_health_scheduled_check` | WP_Site_Health | Daily cron event for background health checks. |
| `site_health_tab_content` | `site-health.php` | Fires for custom tab content; receives `$tab` slug. |
| `site_health_navigation_tabs` | `site-health.php` | Filter to add custom navigation tabs to Site Health. |
| `wpmu_options` | `network/settings.php` | Fires at end of Network Settings form. |
| `update_wpmu_options` | `network/settings.php` | Fires after network options are saved. |
| `network_site_new_form` | `network/site-new.php` | Fires at end of Add Site form. |
| `pre_network_site_new_created_user` | `network/site-new.php` | Fires before a new user is created for a new site. |
| `network_site_new_created_user` | `network/site-new.php` | Fires after a new user is created for a new site. |

### Filters

| Filter | Description | Signature |
|--------|-------------|-----------|
| `export_args` | Modify export arguments before generating WXR | `(args: ExportArgs) => ExportArgs` |
| `export_wp_filename` | Modify the export filename | `(filename: string, sitename: string, date: string) => string` |
| `the_title_export` | Modify post title in WXR output | `(title: string) => string` |
| `the_content_export` | Modify post content in WXR output | `(content: string) => string` |
| `the_excerpt_export` | Modify post excerpt in WXR output | `(excerpt: string) => string` |
| `wxr_export_skip_postmeta` | Return `true` to skip a post meta row | `(skip: boolean, meta_key: string, meta: object) => boolean` |
| `wxr_export_skip_commentmeta` | Return `true` to skip a comment meta row | `(skip: boolean, meta_key: string, meta: object) => boolean` |
| `wxr_export_skip_termmeta` | Return `true` to skip a term meta row | `(skip: boolean, meta_key: string, meta: object) => boolean` |
| `site_status_tests` | Add/remove/modify Site Health test registry | `(tests: TestRegistry) => TestRegistry` |
| `site_status_test_result` | Modify a completed test result | `(result: SiteHealthTestResult) => SiteHealthTestResult` |
| `site_status_test_php_modules` | Modify the PHP modules test list | `(modules: Record<string, ModuleDefinition>) => Record<string, ModuleDefinition>` |
| `site_status_persistent_object_cache_url` | Modify the persistent cache learn-more URL | `(url: string) => string` |
| `site_status_persistent_object_cache_notes` | Modify the persistent cache recommendation note | `(notes: string, services: string[]) => string` |
| `site_health_navigation_tabs` | Add custom tabs to Site Health navigation | `(tabs: Record<string, string>) => Record<string, string>` |
| `debug_information` | Modify all Site Health Info sections | `(sections: Record<string, DebugSection>) => Record<string, DebugSection>` |
| `wp_privacy_personal_data_exporters` | Register personal data exporters | `(exporters: PersonalDataExporter[]) => PersonalDataExporter[]` |
| `wp_privacy_personal_data_erasers` | Register personal data erasers | `(erasers: PersonalDataEraser[]) => PersonalDataEraser[]` |
| `wp_privacy_exports_dir` | Customize the exports directory path | `(path: string) => string` |
| `wp_privacy_exports_url` | Customize the exports directory URL | `(url: string) => string` |
| `mu_menu_items` | Add menu items to network menu settings | `(items: Record<string, string>) => Record<string, string>` |

---

## Section 9: TypeScript Interface Sketch

```typescript
// ---- Export System ----

interface ExportArgs {
  content: 'all' | 'post' | 'page' | 'attachment' | string;
  author?: number | false;
  category?: number | false;
  start_date?: string | false;  // 'YYYY-MM'
  end_date?: string | false;    // 'YYYY-MM'
  status?: string | false;
}

interface WXRAuthor {
  id: number;
  login: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
}

interface WXRCategory {
  termId: number;
  nicename: string;  // slug
  parent: string;    // parent slug or empty string
  name: string;
  description?: string;
  termMeta: WXRMeta[];
}

interface WXRTag {
  termId: number;
  slug: string;
  name: string;
  description?: string;
  termMeta: WXRMeta[];
}

interface WXRTerm {
  termId: number;
  taxonomy: string;
  slug: string;
  parent: string;
  name: string;
  description?: string;
  termMeta: WXRMeta[];
}

interface WXRMeta {
  key: string;
  value: string;
}

interface WXRComment {
  commentId: number;
  author: string;
  authorEmail: string;
  authorUrl: string;
  authorIp: string;
  date: string;          // 'YYYY-MM-DD HH:MM:SS'
  dateGmt: string;
  content: string;
  approved: string;      // '0' | '1' | 'trash' | 'post-trashed'
  type: string;          // 'comment' | 'pingback' | 'trackback'
  parent: number;
  userId: number;
  meta: WXRMeta[];
}

interface WXRItem {
  title: string;
  link: string;
  pubDate: string;       // RFC 2822
  creator: string;       // author login
  guid: string;
  description: '';
  contentEncoded: string;
  excerptEncoded: string;
  postId: number;
  postDate: string;
  postDateGmt: string;
  postModified: string;
  postModifiedGmt: string;
  commentStatus: 'open' | 'closed';
  pingStatus: 'open' | 'closed';
  postName: string;      // slug
  status: string;        // post_status
  postParent: number;
  menuOrder: number;
  postType: string;
  postPassword: string;
  isSticky: 0 | 1;
  attachmentUrl?: string; // only for post_type='attachment'
  categories: Array<{ domain: string; nicename: string; name: string }>;
  postMeta: WXRMeta[];
  comments: WXRComment[];
}

interface WXRDocument {
  version: '1.2';
  channel: {
    title: string;
    link: string;
    description: string;
    pubDate: string;
    language: string;
    wxrVersion: '1.2';
    baseSiteUrl: string;
    baseBlogUrl: string;
  };
  authors: WXRAuthor[];
  categories: WXRCategory[];
  tags: WXRTag[];
  terms: WXRTerm[];
  items: WXRItem[];
}

// ---- Site Health ----

type SiteHealthStatus = 'good' | 'recommended' | 'critical';

interface SiteHealthBadge {
  label: string;   // 'Security' | 'Performance' | 'Requirements'
  color: string;   // 'blue' | 'orange' | 'red'
}

interface SiteHealthTestResult {
  label: string;
  status: SiteHealthStatus;
  badge: SiteHealthBadge;
  description: string;  // HTML
  actions: string;      // HTML
  test: string;         // unique test identifier
}

interface SiteHealthTestDefinition {
  label: string;
  test: string;
  has_rest?: boolean;
  async_direct_test?: Function;
  skip_cron?: boolean;
  headers?: Record<string, string>;
}

interface SiteHealthTestRegistry {
  direct: Record<string, SiteHealthTestDefinition>;
  async: Record<string, SiteHealthTestDefinition>;
}

// ---- Privacy ----

interface PersonalDataExporterResult {
  data: Array<{
    group_id: string;
    group_label: string;
    group_description?: string;
    item_id: string;
    data: Array<{ name: string; value: string }>;
  }>;
  done: boolean;
}

interface PersonalDataEraserResult {
  items_removed: boolean;
  items_retained: boolean;
  messages: string[];
  done: boolean;
}

interface PersonalDataExporter {
  exporter_friendly_name: string;
  callback: (email: string, page: number) => PersonalDataExporterResult;
}

interface PersonalDataEraser {
  eraser_friendly_name: string;
  callback: (email: string, page: number) => PersonalDataEraserResult;
}

type PrivacyRequestStatus =
  | 'request-pending'
  | 'request-confirmed'
  | 'request-failed'
  | 'request-completed';

type PrivacyRequestType = 'export_personal_data' | 'remove_personal_data';

interface PrivacyRequest {
  id: number;              // post ID
  email: string;           // post_title
  status: PrivacyRequestStatus;
  type: PrivacyRequestType;
  requestedAt: Date;       // post_date
  confirmedAt?: Date;
  completedAt?: Date;
  confirmationKey: string; // post_name
}

// ---- Importer Registry ----

interface RegisteredImporter {
  id: string;
  name: string;
  description: string;
  callback?: Function;    // if installed and active
  pluginSlug?: string;    // if needs installation
}

// ---- Site Health Info ----

interface DebugField {
  label: string;
  value: string | boolean | null;
  debug?: string;   // alternative value for clipboard export
  private?: boolean; // redact in clipboard export
}

interface DebugSection {
  label: string;
  description?: string;
  fields: Record<string, DebugField>;
}
```

---

## Section 10: Design Patterns

### Capability-Based Access Control

Every screen checks capabilities at the top using `current_user_can()` and calls `wp_die()` with an appropriate message if the check fails. The pattern is consistent: check → die or proceed. Never render any output before the capability check.

### Singleton Pattern (WP_Site_Health)

`WP_Site_Health::get_instance()` implements a static singleton. The single instance is created on first call and reused. This ensures hooks are registered exactly once and shared state (MySQL version, cron data) is computed once per request.

### Streaming / Batched Output (export_wp)

The WXR export function streams XML directly to output rather than building a string. Posts are loaded in batches of 20 using `array_splice` to avoid loading the full database into memory. The attachment/thumbnail ID collection also processes in batches of 20. This pattern should be replicated: use streaming responses and paginated database queries.

### Async Test Architecture

Site Health separates tests into:
- **Direct**: run synchronously on page load, results embedded in JS variables
- **Async**: run after page load via REST API calls, results injected into the UI as they arrive

The client-side JavaScript polls each async test URL sequentially or in parallel (depending on implementation) and renders each result into the accordion UI. The last result updates a cached transient `health-check-site-status-result` for the dashboard widget.

### Request-Confirm-Action Pattern (Privacy)

Both privacy tools use a three-step pattern:
1. Admin creates a request
2. Data subject confirms via emailed link
3. Admin executes the action (export or erase)

This ensures the data subject consents before data is disclosed or deleted. The confirmation key is stored as the `post_name` of a `user_request` post.

### Filter-Based Extension Points

Exporters and erasers are registered exclusively through filters (`wp_privacy_personal_data_exporters`, `wp_privacy_personal_data_erasers`). This means plugins never need to modify core files, and the core never calls plugin functions directly — it only calls the callbacks registered via filters.

### Post-Processing on Every Batch

Both export (personal data) and site health tests process their registered handlers in pages (page number passed to callbacks). Each callback returns `done: false` until it has no more data to return. This supports arbitrarily large datasets without memory issues.

### WXR CDATA Escaping

All string values in WXR are CDATA-wrapped. The escaping rule: any occurrence of `]]>` within content is split as `]]]]><![CDATA[>`. This is the only safe way to embed arbitrary text content in CDATA sections.

### Legacy Redirect Compatibility

`tools.php` handles multiple generations of URL patterns (pre-5.3 query param style and post-5.3 dedicated file style) by detecting them early and issuing redirects before loading the full admin bootstrap where possible, or by proxying requests to the appropriate handler.

---

## Tovu Reconstruction Notes

### Why this exists

The tools area exists as a catch-all operator surface for exports, site health, privacy workflows, and other maintenance utilities that are important but not part of daily content editing.

### What Tovu should preserve

- Capability-gated operator tools with explicit boundaries from the main authoring/admin flows
- Async or batched execution for heavy diagnostics and export work
- Filter/registry-driven extension points for exporters, erasers, and health checks

### What Tovu can simplify

- Tovu does not need one grab-bag menu if these capabilities are better grouped into clearer operational modules
- Legacy redirect compatibility should not shape the new design unless compatibility is a real goal

### Possible Tovu seams

- `src/features/site-health/`
- `src/features/export/`
- `src/features/privacy/`
- `src/admin/tools/`

### Suggested priority

- `V1`: health, export, and privacy tools only where they map to real operator needs
- `Later`: WordPress-style catch-all tools navigation
