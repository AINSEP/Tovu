# Automatic Updater and Debug Data - WordPress to TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-admin/includes/class-wp-automatic-updater.php`
- `wp-admin/includes/class-wp-debug-data.php`
- `wp-admin/site-health-info.php`
- `wp-includes/update.php`
- `wp-admin/includes/ajax-actions.php`
- `wp-admin/admin-ajax.php`

## Section 1: Overview

This subsystem covers two closely related admin responsibilities:

1. **Background update execution** - `WP_Automatic_Updater` decides whether core, plugin, theme, and translation updates should run, performs the update through the upgrader stack, handles maintenance mode, and records notification state.
2. **Operational diagnostics** - `WP_Debug_Data` gathers the Site Health "Info" payload, including update state, filesystem permissions, media backend support, database details, and active/inactive plugin and theme inventory.

The important contract is that the background updater is not a screen controller. The public entry point is a cron hook that instantiates `WP_Automatic_Updater`, while the Site Health info page is the human-facing surface that calls `WP_Debug_Data` to render a structured environment report.

## Section 2: Entry Points

### 2.1 `GET /wp-admin/site-health-info.php`

This is the diagnostic UI for Site Health. It requires JavaScript and renders an accordion of environment sections.

Flow:

1. Load the Site Health classes.
2. Call `WP_Debug_Data::check_for_updates()` to refresh core, plugin, and theme update transients.
3. Call `WP_Debug_Data::debug_data()` to build the section payload.
4. Render a "Copy site info to clipboard" button using `WP_Debug_Data::format( $info, 'debug' )`.
5. Render each section, skipping private or empty sections.

The `wp-paths-sizes` section is displayed with a spinner because size collection is expensive and is loaded separately by the Site Health UI.

### 2.2 `wp_maybe_auto_update()`

This is the cron-backed background update entry point defined in `wp-includes/update.php`.

Flow:

1. Require admin bootstrap and the upgrader class.
2. Instantiate `WP_Automatic_Updater`.
3. Call `run()`.

The cron hook name is `wp_maybe_auto_update`, and WordPress may also schedule a retry from a transient core-update failure.

## Section 3: `WP_Automatic_Updater`

`WP_Automatic_Updater` owns the unattended update policy and execution path. It is responsible for deciding whether to update, selecting the appropriate upgrader, and reporting outcomes.

### 3.1 Key methods

| Method | Role |
|---|---|
| `is_disabled()` | Disables all automatic updates when file modifications are disallowed, WordPress is installing, the constant says so, or `automatic_updater_disabled` filters it off. |
| `is_allowed_dir( $dir )` | Rejects filesystem paths that are not allowed by `open_basedir`. |
| `is_vcs_checkout( $context )` | Detects `.svn`, `.git`, `.hg`, and `.bzr` checkouts above the context path or `ABSPATH`. |
| `should_update( $type, $item, $context )` | Decides whether the current offer is eligible for unattended update. |
| `update( $type, $item )` | Runs the actual upgrader flow and collects results. |
| `run()` | Orchestrates all pending plugin, theme, core, and translation updates. |
| `after_core_update( $update_result )` | Classifies core failures and manages retry / notification policy. |
| `send_email()` | Sends the core update completion or failure email. |
| `after_plugin_theme_update( $update_results )` | Collates plugin/theme outcomes and decides whether to email. |
| `send_plugin_theme_email()` | Builds the plugin/theme background update notification email. |
| `send_debug_email()` | Sends the verbose debug log email for development installs. |
| `has_fatal_error()` | Performs a loopback scrape while maintenance mode is active to detect fatal errors after plugin updates. |

### 3.2 Update selection rules

`should_update()` is the gatekeeper. It creates an `Automatic_Upgrader_Skin`, checks whether automatic updates are globally disabled, and then requires filesystem credentials unless relaxed ownership is allowed for a no-new-files core update.

It then applies the type-specific policy:

| Type | Default decision source |
|---|---|
| `core` | `Core_Upgrader::should_update_to_version()` and core compatibility checks. |
| `plugin` | Item `autoupdate`, then site-level auto-update defaults from `auto_update_plugins`. |
| `theme` | Item `autoupdate`, then site-level auto-update defaults from `auto_update_themes`. |
| `translation` | Item `autoupdate`. |

The method also rejects items with `disable_autoupdate`, core offers that do not satisfy PHP or MySQL requirements, and plugins/themes that require a newer PHP version than the runtime provides.

### 3.3 Update execution flow

`update()` selects the upgrader and filesystem context by type:

| Type | Upgrader | Context |
|---|---|---|
| `core` | `Core_Upgrader` | `ABSPATH` |
| `plugin` | `Plugin_Upgrader` | `WP_PLUGIN_DIR` |
| `theme` | `Theme_Upgrader` | `get_theme_root( $item->theme )` |
| `translation` | `Language_Pack_Upgrader` | `WP_CONTENT_DIR` |

The execution sequence is:

1. Call `should_update()`.
2. Fire `pre_auto_update`.
3. Emit a type-specific feedback string on the skin.
4. Enable maintenance mode for all non-translation updates.
5. Call `$upgrader->upgrade()` with rollback enabled and `allow_relaxed_file_ownership` when appropriate.
6. Re-enable maintenance mode while checking for plugin fatals.
7. On plugin updates, if the plugin was active, wait briefly and call `has_fatal_error()`. If a fatal is detected, attempt restore from the temporary backup.
8. Disable maintenance mode when the update attempt is complete.
9. Record the result and emitted messages in `$update_results`.

### 3.4 Background run sequence

`run()` is the top-level orchestrator. It only proceeds when:

1. The updater is not disabled.
2. The request is running on the main network and main site.
3. The `auto_updater` lock can be acquired.

It then:

1. Removes the normal `upgrader_process_complete` hooks that would trigger update checks automatically.
2. Runs plugin update checks, updates every eligible plugin, and refreshes the plugin cache.
3. Runs theme update checks, updates every eligible theme, and refreshes the theme cache.
4. Runs core update checks and applies the preferred core auto-update if one exists.
5. Processes translation updates.
6. Sends the development debug email when enabled by `automatic_updates_send_debug_email`.
7. Runs the appropriate post-update email path for core or plugin/theme results.
8. Fires `automatic_updates_complete`.
9. Releases the lock.

### 3.5 Notification and failure handling

Core updates have three distinct post-update states:

| State | Behavior |
|---|---|
| Success | Send a success email and keep moving. |
| Critical failure | Persist `auto_core_update_failed` with error details, mark the failure as critical, and send a critical email. |
| Transient failure | Schedule a retry via `wp_schedule_single_event()` when the error is in the retryable set. |

Plugin and theme updates are aggregated separately. If only failures occur, WordPress suppresses duplicate failure emails by remembering the last failed version per plugin or theme in `auto_plugin_theme_update_emails`.

## Section 4: `WP_Debug_Data`

`WP_Debug_Data` is the structured environment snapshot used by Site Health. It is not just static data. It actively refreshes update transients and performs some live checks while building the payload.

### 4.1 `debug_data()`

`debug_data()` assembles the section map in insertion order and then removes sections that are `null`.

Core sections returned by the method are:

| Section key | Purpose |
|---|---|
| `wp-core` | WordPress version, locale, URL, multisite state, registration settings, update availability, and WordPress.org connectivity. |
| `wp-paths-sizes` | Directory paths and storage size placeholders for single-site installs. |
| `wp-dropins` | Loaded drop-in replacements. |
| `wp-active-theme` | Current theme metadata and auto-update status. |
| `wp-parent-theme` | Parent theme metadata and auto-update status. |
| `wp-themes-inactive` | Inactive theme inventory and auto-update status. |
| `wp-mu-plugins` | Must-use plugins. |
| `wp-plugins-active` | Active plugins. |
| `wp-plugins-inactive` | Inactive plugins. |
| `wp-media` | Media handling, image editor, upload limits, and Imagick/GD/Ghostscript capability. |
| `wp-server` | PHP/server environment, rewrite support, robots.txt state, and related server facts. |
| `wp-database` | Database extension, versions, connection details, and system limits. |
| `wp-constants` | Environment and configuration constants that affect loading and updates. |
| `wp-filesystem` | Filesystem writability for WordPress, wp-content, uploads, plugins, themes, fonts, and mu-plugins. |

The `debug_information` filter lets plugins or themes add extra sections or extend the existing ones.

### 4.2 Active checks used by the diagnostic payload

`check_for_updates()` refreshes the update transients before the info page renders by calling:

- `wp_version_check()`
- `wp_update_plugins()`
- `wp_update_themes()`

`get_wp_core()` also performs a live `wp_remote_get( 'https://wordpress.org' )` check so the report can state whether WordPress.org is reachable.

### 4.3 Output formatting and privacy

`format( $info_array, $data_type )` converts the section map into copyable plain text. It skips private sections and private fields, prints booleans as `true` or `false`, and flattens one-level arrays into indented name/value pairs.

This matters operationally because the Info page uses the same data both for UI rendering and clipboard export, but the copy path intentionally omits private details such as URLs, database credentials, and other sensitive fields.

### 4.4 Update-related metadata in the debug data

The plugin and theme sections report both current and latest version data when update transients are available. They also include auto-update state derived from:

- `wp_is_auto_update_enabled_for_type()`
- `wp_is_auto_update_forced_for_item()`
- `get_site_option( 'auto_update_plugins' )`
- `get_site_option( 'auto_update_themes' )`

The plugin section uses `plugin_auto_update_debug_string` to customize the copied auto-update text. The theme sections use `theme_auto_update_debug_string`.

## Section 5: Hooks and Filters

### 5.1 Updater hooks

| Hook | Role |
|---|---|
| `automatic_updater_disabled` | Globally disable background updates. |
| `automatic_updates_is_vcs_checkout` | Override VCS checkout detection. |
| `auto_update_{$type}` | Type-specific yes/no decision for core, plugin, theme, and translation updates. |
| `pre_auto_update` | Fires immediately before an auto-update begins. |
| `automatic_updates_send_debug_email` | Controls whether the debug email is sent. |
| `automatic_updates_complete` | Fires after all automatic updates finish. |
| `send_core_update_notification_email` | Controls manual core update notification emails. |
| `auto_core_update_send_email` | Controls core success/fail/critical email delivery. |
| `auto_core_update_email` | Filters the final core email payload. |
| `auto_plugin_update_send_email` | Controls plugin update emails. |
| `auto_theme_update_send_email` | Controls theme update emails. |
| `auto_plugin_theme_update_email` | Filters the final plugin/theme email payload. |
| `automatic_updates_debug_email` | Filters the debug email payload. |
| `https_local_ssl_verify` | Controls SSL verification for the fatal-scrape loopback request. |
| `update_feedback` | Used by core upgrade feedback during background updates. |

### 5.2 Debug data hooks

| Hook | Role |
|---|---|
| `debug_information` | Extends the Site Health info payload. |
| `plugin_auto_update_debug_string` | Filters the plugin auto-update text shown in Site Health. |
| `theme_auto_update_debug_string` | Filters the theme auto-update text shown in Site Health. |

## Section 6: Operational Implications

1. Background updates are deliberately conservative. They refuse to run when file modifications are disallowed, when WordPress is installing, or when a VCS checkout is detected.
2. Core updates can be retried after transient failures, but critical failures are persisted and treated as stop conditions until a successful manual update clears the state.
3. Plugin updates are the most sensitive path because the updater explicitly scrapes the site after upgrade and attempts rollback if a fatal error appears.
4. `WP_Debug_Data` is effectively a support packet generator. It exposes environment facts, but it also performs active checks that can affect transients and network requests.
5. The Site Health copy output intentionally omits private fields, so the structure must preserve the `private` flags when implementing a rewrite.

---

## Tovu Reconstruction Notes

### Why this exists

This subsystem exists to automate safe maintenance work and to generate support-grade diagnostics when things go wrong.

### What Tovu should preserve

- Conservative auto-update gating and rollback/fatal-check behavior for risky package changes
- Structured diagnostic payloads with redaction rules for private fields
- Separation between update policy decisions and the concrete updater runtime

### What Tovu can simplify

- Tovu does not need WordPress.org-specific update flows if deployment uses a different channel
- Diagnostics can be narrower if they still support real support and incident triage workflows

### Possible Tovu seams

- `src/features/update/`
- `src/features/site-health/`
- `src/core/ports/UpdatePolicyPort.ts`
- `src/core/ports/SupportDiagnosticsPort.ts`

### Suggested priority

- `V1`: diagnostics and support packet generation
- `Later`: autonomous updater and rollback automation
