# Spec: `wp-settings.php`

**Source:** `wordpress/wp-settings.php`
**Lines:** 764
**Role:** Full WordPress framework bootstrap

---

## Purpose

This is the largest and most important root file. It initialises every subsystem of WordPress in a precise order. No request can be served until this file completes (unless `SHORTINIT` is set).

---

## Complete Boot Sequence

### Phase 1: Core constants and minimal libs

1. `define('WPINC', 'wp-includes')` — sets the includes directory name
2. Declare and load version globals: `$wp_version`, `$wp_db_version`, `$tinymce_version`, `$required_php_version`, `$required_php_extensions`, `$required_mysql_version`, `$wp_local_package`
3. `require version.php` — populates version globals
4. `require compat-utf8.php` — UTF-8 compatibility
5. `require compat.php` — PHP function compatibility shims
6. `require load.php` — defines foundational functions: `wp_check_php_mysql_versions`, `wp_fix_server_vars`, `wp_maintenance`, `wp_debug_mode`, etc.

### Phase 2: Pre-bootstrap checks

7. `wp_check_php_mysql_versions()` — die with error if PHP or MySQL version is insufficient
8. Load error protection classes:
   - `class-wp-paused-extensions-storage.php`
   - `class-wp-exception.php`
   - `class-wp-fatal-error-handler.php`
   - `class-wp-recovery-mode-*.php` (5 files: cookie-service, key-service, link-service, email-service, recovery-mode)
   - `error-protection.php`
9. `require default-constants.php` — defines `wp_initial_constants()`, `wp_functionality_constants()`, etc.
10. `require plugin.php` — defines the hook system (`add_action`, `add_filter`, `do_action`, `apply_filters`, etc.)

### Phase 3: Early initialisation

11. `wp_initial_constants()` — sets `WP_MEMORY_LIMIT`, `WP_MAX_MEMORY_LIMIT`, `WP_DEBUG`, `SCRIPT_DEBUG`, `WP_CONTENT_DIR`, `WP_CACHE`, `WP_LANG_DIR`
12. `wp_register_fatal_error_handler()` — register shutdown handler for fatal errors
13. `date_default_timezone_set('UTC')` — all dates are UTC internally
14. `wp_fix_server_vars()` — normalise `$_SERVER` across server configurations
15. `wp_maintenance()` — if `.maintenance` file exists and is fresh, serve maintenance page and die
16. `timer_start()` — begin load timer
17. `wp_debug_mode()` — configure error reporting based on `WP_DEBUG`

### Phase 4: Caching layer

18. If `WP_CACHE && enable_loading_advanced_cache_dropin filter`:
    - Load `WP_CONTENT_DIR/advanced-cache.php` if it exists
    - Re-initialise any pre-built hooks from that file

### Phase 5: Language dir

19. `wp_set_lang_dir()` — define `WP_LANG_DIR`

### Phase 6: Core utility classes

20. Load in order:
    - `class-wp-list-util.php`
    - `class-wp-token-map.php`
    - `utf8.php`
    - `formatting.php` (sanitize, escape, wpautop, etc.)
    - `meta.php` (metadata API)
    - `functions.php` (general functions)
    - `class-wp-meta-query.php`
    - `class-wp-matchesmapregex.php`
    - `class-wp.php` (the `WP` class — main request parser)
    - `class-wp-error.php`
    - `pomo/mo.php` + l10n translation classes (6 files)

### Phase 7: Database

21. `require_wp_db()` — load `wpdb` class and optionally `wp-content/db.php` drop-in
22. `$GLOBALS['table_prefix'] = $table_prefix` — apply prefix from config
23. `wp_set_wpdb_vars()` — configure `$wpdb` table names

### Phase 8: Object cache

24. `wp_start_object_cache()` — start WordPress object cache; load `wp-content/object-cache.php` drop-in if present

### Phase 9: Default filters

25. `require default-filters.php` — register all core action/filter hooks

### Phase 10: Multisite

26. If `is_multisite()`:
    - Load `class-wp-site-query.php`
    - Load `class-wp-network-query.php`
    - Load `ms-blogs.php`
    - Load `ms-settings.php` (sets `$blog_id`, `$wpdb` table names for current site)
27. Else if `MULTISITE` not defined: `define('MULTISITE', false)`

28. `register_shutdown_function('shutdown_action_hook')` — fires `shutdown` action on exit

### Phase 11: SHORTINIT bail point

29. If `SHORTINIT` is defined and truthy: `return false` — stops here, no plugins, no theme, no full WP

### Phase 12: Localisation

30. `require l10n.php`
31. `require class-wp-textdomain-registry.php`
32. `require class-wp-locale.php`
33. `require class-wp-locale-switcher.php`

### Phase 13: Installation check

34. `wp_not_installed()` — if WordPress is not installed (no options table), redirect to install.php

### Phase 14: Bulk core library load

35. Load ~100 core files in order (classes and function libraries):
    - Walker classes
    - AJAX response
    - Capabilities system
    - Roles/users
    - Query system (`WP_Query`, `WP_Date_Query`, query helpers)
    - Theme system (`WP_Theme`, theme JSON, global styles, block templates)
    - Template system
    - HTTPS detection/migration
    - User/session management
    - General template, link template, author template
    - Post system (post CRUD, revisions, formats, thumbnails)
    - Taxonomy system
    - Comment system
    - Rewrite system (`WP_Rewrite`)
    - Feeds
    - Bookmarks/links
    - KSES (HTML filtering)
    - Cron API
    - Deprecated functions
    - Script/style loader
    - Update API
    - Canonical URLs
    - Shortcodes
    - Embed/oEmbed
    - Media
    - HTTP API (`WP_Http`, curl, streams, proxy, cookies)
    - HTML API (tag processor, HTML5 parser)
    - Widgets
    - Nav menus
    - Admin bar
    - Application passwords
    - Abilities API (new)
    - REST API (server, request, response, all endpoint controllers, meta fields, search handlers)
    - Sitemaps
    - Block bindings
    - Block editor (types, patterns, styles, registry, parser, supports)
    - Style engine
    - Font system
    - Script modules
    - Interactivity API
    - Plugin dependencies
    - URL pattern prefixer
    - Speculation rules / speculative loading

### Phase 15: Singletons

36. `$GLOBALS['wp_embed'] = new WP_Embed()`
37. `$GLOBALS['wp_textdomain_registry'] = new WP_Textdomain_Registry(); ->init()`

### Phase 16: Multisite functions

38. If multisite:
    - `require ms-functions.php`
    - `require ms-default-filters.php`
    - `require ms-deprecated.php`

### Phase 17: Plugin directory constants and paths

39. `wp_plugin_directory_constants()`
40. `$GLOBALS['wp_plugin_paths'] = []`

### Phase 18: Must-use plugins

41. `foreach wp_get_mu_plugins() as $mu_plugin`:
    - `include_once $mu_plugin`
    - `do_action('mu_plugin_loaded', $mu_plugin)`
42. If multisite: load network-activated plugins similarly, firing `network_plugin_loaded` per plugin
43. `do_action('muplugins_loaded')`

### Phase 19: Cookie and SSL constants

44. If multisite: `ms_cookie_constants()`
45. `wp_cookie_constants()`
46. `wp_ssl_constants()`

### Phase 20: Common globals

47. `require vars.php` — sets `$pagenow`, `$is_*` browser globals, etc.

### Phase 21: Initial registrations

48. `create_initial_taxonomies()` — register `category`, `post_tag`, `nav_menu`, `link_category`, `post_format`
49. `create_initial_post_types()` — register `post`, `page`, `attachment`, `revision`, `nav_menu_item`, `custom_css`, `customize_changeset`, `oembed_cache`, `user_request`, `wp_block`, `wp_template`, etc.
50. `wp_start_scraping_edited_file_errors()` — detect fatal errors in edited files
51. `register_theme_directory(get_theme_root())`
52. If single-site and fatal error handler enabled: `wp_recovery_mode()->initialize()`

### Phase 22: Active plugins

53. `require_once wp-admin/includes/plugin.php` (for `get_plugin_data()`)
54. `foreach wp_get_active_and_valid_plugins() as $plugin`:
    - Register plugin path
    - Load plugin text domain
    - `include_once $plugin`
    - `do_action('plugin_loaded', $plugin)`

### Phase 23: Pluggable functions

55. `require pluggable.php` — functions that plugins may override (e.g. `wp_mail`, `wp_hash_password`, `wp_authenticate`)
56. `require pluggable-deprecated.php`

### Phase 24: Post-plugin setup

57. `wp_set_internal_encoding()` — set `mbstring` internal encoding to blog charset
58. If `WP_CACHE` and `wp_cache_postload` function exists: call `wp_cache_postload()`
59. `do_action('plugins_loaded')` — plugins are fully loaded

### Phase 25: Magic quotes and request setup

60. `wp_functionality_constants()` — set feature flags after plugins have loaded
61. `wp_magic_quotes()` — apply `wp_slash()` to `$_GET`, `$_POST`, `$_COOKIE`, `$_SERVER`
62. `do_action('sanitize_comment_cookies')`

### Phase 26: Core globals

63. `$GLOBALS['wp_the_query'] = new WP_Query()`
64. `$GLOBALS['wp_query'] = $GLOBALS['wp_the_query']`
65. `$GLOBALS['wp_rewrite'] = new WP_Rewrite()`
66. `$GLOBALS['wp'] = new WP()`
67. `$GLOBALS['wp_widget_factory'] = new WP_Widget_Factory()`
68. `$GLOBALS['wp_roles'] = new WP_Roles()`

### Phase 27: Theme loading

69. `do_action('setup_theme')`
70. `wp_templating_constants()` — define `TEMPLATEPATH`, `STYLESHEETPATH`
71. `wp_set_template_globals()` — set `$wp_theme_directories`
72. `load_default_textdomain()` — load WordPress core translations
73. Load locale file if it exists (`WP_LANG_DIR/{locale}.php`)
74. `$GLOBALS['wp_locale'] = new WP_Locale()`
75. `$GLOBALS['wp_locale_switcher'] = new WP_Locale_Switcher(); ->init()`
76. `foreach wp_get_active_and_valid_themes() as $theme`:
    - Load theme text domain
    - `include $theme/functions.php` if it exists
77. `do_action('after_setup_theme')`

### Phase 28: Site health

78. Load `WP_Site_Health` class if not loaded
79. `WP_Site_Health::get_instance()`

### Phase 29: Current user

80. `$GLOBALS['wp']->init()` — calls `wp_get_current_user()`, sets `$current_user`

### Phase 30: Final hooks

81. `do_action('init')` — most plugin/theme initialisation happens here
82. If multisite: `ms_site_check()` — verify current site is active, redirect if not
83. `do_action('wp_loaded')` — everything is fully loaded

---

## Key Action Hooks (in order)

```
mu_plugin_loaded      (per mu-plugin)
network_plugin_loaded (per network plugin, multisite)
muplugins_loaded
plugin_loaded         (per active plugin)
plugins_loaded
sanitize_comment_cookies
setup_theme
after_setup_theme
init
wp_loaded
```

---

## TypeScript Equivalent

`wp-settings.php` maps to an async bootstrap function:

```typescript
interface BootstrapOptions {
  shortinit?: boolean;
  config: WordPressConfig;
}

async function bootstrap(options: BootstrapOptions): Promise<Application> {
  const app = new Application(options.config);

  await app.checkRequirements();
  await app.initErrorHandling();
  await app.initConstants();
  await app.initCache();           // advanced-cache drop-in
  await app.initDatabase();        // wpdb
  await app.initObjectCache();     // object-cache drop-in
  await app.registerDefaultHooks();
  await app.initMultisite();

  if (options.shortinit) return app;

  await app.initL10n();
  await app.checkInstalled();
  await app.loadCoreLibraries();   // all the requires
  await app.loadMuPlugins();
  app.hooks.doAction('muplugins_loaded');

  await app.initCookieConstants();
  await app.initTaxonomiesAndPostTypes();
  await app.loadActivePlugins();
  app.hooks.doAction('plugins_loaded');

  await app.initGlobals();         // wp_query, wp_rewrite, etc.
  app.hooks.doAction('setup_theme');
  await app.loadTheme();
  app.hooks.doAction('after_setup_theme');
  await app.initCurrentUser();
  app.hooks.doAction('init');
  app.hooks.doAction('wp_loaded');

  return app;
}
```

The `SHORTINIT` escape hatch is important for tools (WP-CLI, certain admin utilities) that need the DB and basic functions but not the full plugin/theme stack.

---

## Tovu Reconstruction Notes

### Why this exists

This archival note preserves the earlier `wp-settings.php` decomposition. The canonical Tovu-facing treatment now lives in [bootstrap.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-root/bootstrap.md).

### What Tovu should preserve

- The staged bootstrap lifecycle and partial-init concept described in the consolidated bootstrap doc

### What Tovu can simplify

- Tovu does not need to expose WordPress's exact bootstrap sequencing as long as the same service dependencies remain explicit

### Possible Tovu seams

- `src/core/bootstrap/`
- `src/core/ports/BootstrapLifecyclePort.ts`

### Suggested priority

- `Reference only`; implement from the consolidated bootstrap spec
