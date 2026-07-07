# Updater and Filesystem - WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-admin/update-core.php`
- `wp-admin/update.php`
- `wp-admin/includes/update.php`
- `wp-admin/includes/class-wp-upgrader.php`
- `wp-admin/includes/class-plugin-upgrader.php`
- `wp-admin/includes/class-theme-upgrader.php`
- `wp-admin/includes/file.php`
- `wp-admin/includes/theme-install.php`
- `wp-admin/includes/class-wp-theme-install-list-table.php`

---

## 1. Overview

This subsystem covers every privileged path that installs, updates, overwrites, or edits code on disk from wp-admin. It is split across two layers:

1. **Screen controllers** - `wp-admin/update-core.php` and `wp-admin/update.php` render the update/install screens, validate capability checks, and dispatch the requested action.
2. **Execution primitives** - `WP_Upgrader`, `Theme_Upgrader`, `Plugin_Upgrader`, and the filesystem helpers in `wp-admin/includes/file.php` perform package downloads, unpacking, file moves, rollback, and PHP file editing.

The important contract is that no screen writes directly to disk. Every mutation goes through `WP_Filesystem()` and then through an upgrader or editor routine that validates the target, creates temp backups when needed, and emits a structured `WP_Error` on failure. The same package pipeline is used for theme installs, plugin installs, core updates, translation packs, and overwrite flows from uploaded ZIP files.

---

## 2. Entry Points

### 2.1 `GET /wp-admin/update-core.php`

This is the core update dashboard. It loads `admin.php`, enqueues `plugin-install`, `updates`, and Thickbox, then redirects multisite users to network admin before rendering anything.

The page is gated by:

- `current_user_can( 'update_core' )`
- `current_user_can( 'update_themes' )`
- `current_user_can( 'update_plugins' )`
- `current_user_can( 'update_languages' )`

If the user has none of those capabilities, the request dies immediately.

The visible page is built from helpers in `wp-admin/includes/update.php`:

- `get_core_updates()`
- `find_core_auto_update()`
- `get_plugin_updates()`
- `get_theme_updates()`
- translation update helpers

### 2.2 `GET /wp-admin/update.php`

This is the action router for installation and update flows. It sets `IFRAME_REQUEST` for bulk and activate actions, loads `admin.php`, then dispatches on `$_GET['action']`.

Supported branches include:

| Action | Purpose |
|---|---|
| `update-selected` | Bulk plugin update iframe |
| `upgrade-plugin` | Single plugin update |
| `activate-plugin` | Reactivate a plugin after update |
| `install-plugin` | Install plugin from WordPress.org |
| `upload-plugin` | Install plugin from uploaded ZIP |
| `upload-plugin-cancel-overwrite` | Cancel an upload overwrite flow |
| `upgrade-theme` | Single theme update |
| `update-selected-themes` | Bulk theme update iframe |
| `install-theme` | Install theme from WordPress.org |
| `upload-theme` | Install theme from uploaded ZIP |
| `upload-theme-cancel-overwrite` | Cancel a theme overwrite flow |

All branches perform their own capability check before any download or filesystem work begins.

### 2.3 File Editing and Credentials

The file editor and filesystem credential UI live in `wp-admin/includes/file.php`:

- `request_filesystem_credentials()`
- `WP_Filesystem()`
- `get_filesystem_method()`
- `wp_edit_theme_plugin_file()`
- `wp_print_request_filesystem_credentials_modal()`
- `wp_get_theme_file_editable_extensions()`
- `wp_get_plugin_file_editable_extensions()`

These are not screen controllers; they are the safety layer used by the screen controllers and upgrader skins.

---

## 3. Update and Install Flow

### 3.1 Core Update Flow

`update-core.php` does not execute the upgrade itself. It renders the available update set and posts to `update-core.php?action=do-core-upgrade` or `do-core-reinstall`, which are handled by the same file and `WP_Upgrader` plumbing.

The core helper functions in `wp-admin/includes/update.php` are responsible for state selection:

- `get_preferred_from_update_core()` chooses the top candidate.
- `get_core_updates()` filters dismissed and available updates from the `update_core` site transient.
- `find_core_auto_update()` asks `WP_Automatic_Updater` whether the best auto-update offer should be applied.
- `get_core_checksums()` fetches release checksums from WordPress.org and falls back from HTTPS to HTTP if needed.

### 3.2 Plugin and Theme Updates

`update.php` branches to `Plugin_Upgrader` or `Theme_Upgrader` depending on the action.

The sequence is consistent:

1. Check capability and nonce.
2. Fetch the package metadata from the WordPress.org API when the action is an install.
3. Create the correct skin object for the screen:
   - `Bulk_Plugin_Upgrader_Skin`
   - `Plugin_Upgrader_Skin`
   - `Plugin_Installer_Skin`
   - `Theme_Upgrader_Skin`
   - `Bulk_Theme_Upgrader_Skin`
   - `Theme_Installer_Skin`
4. Call `install()` or `upgrade()` on the upgrader.
5. Render the header/footer pair around the progress UI when the action is not iframe-only.

For theme installs, `update.php` calls `themes_api( 'theme_information', ... )`, then hands the returned download link to `Theme_Upgrader`.

### 3.3 Upload Overwrite Flows

Upload flows use `File_Upload_Upgrader` to stage the uploaded ZIP into the media subsystem before the upgrader consumes it. The overwrite modes are explicit:

- `update-plugin` / `downgrade-plugin`
- `update-theme` / `downgrade-theme`

If the upload finishes successfully or fails with a `WP_Error`, the temporary uploaded attachment is cleaned up.

---

## 4. WP_Upgrader Contract

`WP_Upgrader` is the common execution engine. The key methods in `wp-admin/includes/class-wp-upgrader.php` are:

| Method | Role |
|---|---|
| `init()` | Binds the skin and loads default strings |
| `fs_connect()` | Negotiates filesystem access and validates the target directories |
| `download_package()` | Downloads a remote ZIP or accepts a local file |
| `unpack_package()` | Extracts the archive into `wp-content/upgrade/` |
| `install_package()` | Copies or moves the unpacked tree into place |
| `run()` | Orchestrates the full package lifecycle |
| `maintenance_mode()` | Creates or removes `.maintenance` |
| `create_lock()` / `release_lock()` | Serializes concurrent update activity |
| `move_to_temp_backup_dir()` | Backs up the current plugin/theme before overwrite |
| `restore_temp_backup()` | Restores the backup on failure |
| `delete_temp_backup()` | Cleans successful backup state |

The package lifecycle is:

1. `fs_connect()` asks the skin for filesystem credentials, then calls `WP_Filesystem()`.
2. `download_package()` uses `download_url()` and can enforce signature verification.
3. `unpack_package()` extracts into `wp-content/upgrade/`.
4. `install_package()` validates source and destination, clears or preserves the destination, then uses `move_dir()` when possible or `copy_dir()` otherwise.
5. `run()` applies `upgrader_pre_download`, `upgrader_package_options`, `upgrader_source_selection`, `upgrader_pre_install`, `upgrader_clear_destination`, `upgrader_post_install`, and `upgrader_process_complete`.

The important operational detail is that the upgrader never assumes direct filesystem access. It is designed to work against direct, SSH2, FTP extension, and FTP sockets transports.

---

## 5. Filesystem Abstraction

### 5.1 Transport Selection

`get_filesystem_method()` chooses the transport in this order:

1. `direct` if the web server process owns the files, or relaxed ownership is allowed.
2. `ssh2` if an SSH connection is requested and the extension exists.
3. `ftpext` if the FTP extension exists.
4. `ftpsockets` if sockets or `fsockopen()` are available.

`WP_Filesystem()` loads the selected transport class, constructs it, sets `FS_CONNECT_TIMEOUT`, `FS_TIMEOUT`, `FS_CHMOD_DIR`, and `FS_CHMOD_FILE`, then connects.

### 5.2 Credential Negotiation

`request_filesystem_credentials()` returns one of three states:

- `true` if no credentials are needed.
- `false` if the UI must prompt for credentials.
- `array` of connection details if the credentials are already available.

The form persists non-password FTP details in the `ftp_credentials` option. `wp_print_request_filesystem_credentials_modal()` renders that form in a modal when a request needs it.

### 5.3 Safe File Editing

`wp_edit_theme_plugin_file()` is the direct file editor backend. It validates:

- required args (`file`, `newcontent`, `nonce`)
- path traversal via `validate_file()`
- capability (`edit_plugins` or `edit_themes`)
- nonce
- existence of the plugin/theme
- editable extension whitelist
- actual file writability

If the target is an active PHP file, it performs a loopback scrape against the editor page and the front page. If either request reports a fatal error, the write is rolled back from the saved previous contents and a `php_error` is returned.

`wp_opcache_invalidate()` and `wp_opcache_invalidate_directory()` are used after writes and copies so PHP does not serve stale code.

### 5.4 Archive and Copy Helpers

The lower-level helpers are:

- `download_url()`
- `verify_file_md5()`
- `verify_file_signature()`
- `wp_trusted_keys()`
- `wp_zip_file_is_valid()`
- `unzip_file()`
- `_unzip_file_ziparchive()`
- `_unzip_file_pclzip()`
- `copy_dir()`
- `move_dir()`
- `wp_tempnam()`

These functions enforce package integrity, sanitize filenames, skip invalid archive members, and preserve permissions when moving files into place.

---

## 6. Runtime Contracts and Operational Implications

1. All update/install flows are capability-gated before any network or filesystem work starts.
2. Signature verification is attempted for trusted hosts and can soft-fail with a recoverable `WP_Error` if the runtime cannot verify signatures.
3. `WP_Upgrader::install_package()` treats `ABSPATH`, `WP_CONTENT_DIR`, `WP_PLUGIN_DIR`, and the themes directory as protected destinations and rewrites the target path when needed.
4. Temporary backups are scheduled for deferred cleanup so failed updates can still be restored on shutdown.
5. The file editor is intentionally conservative: only whitelisted extensions are editable, and active PHP files are post-write scraped to catch fatal regressions immediately.

---

## 7. Tovu Reconstruction Notes

### 7.1 Why this exists

This subsystem exists so WordPress can update, install, and edit code/files across environments where direct filesystem access is not guaranteed. It treats package fetch, unpack, validation, filesystem transport, and rollback/health-check logic as one controlled operational workflow.

### 7.2 What Tovu should preserve

- A filesystem/package boundary that does not assume one deployment transport
- Staged package install behavior with validation before replacing live files
- Capability-gated operational flows that fail safely before network or filesystem mutation
- Post-write health checks and rollback hooks for high-risk code changes

### 7.3 What Tovu can simplify

- Tovu does not need browser-based code editing or FTP-era transports unless the product explicitly targets self-hosted operators who need them
- If deployments are externalized to CI/CD or platform adapters, the internal updater can be much thinner
- Signature and package verification can align with Tovu's own distribution model rather than WordPress.org conventions

### 7.4 Possible Tovu seams

- `src/features/update/` for operator-facing update/install flows
- `src/core/ports/PackageFetcherPort.ts` for download and verification
- `src/core/ports/FilesystemPort.ts` for transport-agnostic file operations
- `src/core/ports/RuntimeHealthCheckPort.ts` for post-write validation and rollback decisions

### 7.5 Suggested priority

- `V1`: package verification and install hooks only if Tovu ships self-update behavior
- `Later`: full filesystem transport abstraction, in-browser editing, and WordPress-style updater UX
