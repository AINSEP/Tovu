# WordPress Privacy and Personal Data - TypeScript Rewrite Specification

**Source files analyzed:**
- `wp-admin/privacy.php`
- `wp-admin/options-privacy.php`
- `wp-admin/privacy-policy-guide.php`
- `wp-admin/user/privacy.php`
- `wp-admin/network/privacy.php`
- `wp-admin/export-personal-data.php`
- `wp-admin/erase-personal-data.php`
- `wp-admin/includes/privacy-tools.php`
- `wp-admin/includes/class-wp-privacy-requests-table.php`
- `wp-admin/includes/class-wp-privacy-data-export-requests-list-table.php`
- `wp-admin/includes/class-wp-privacy-data-removal-requests-list-table.php`
- `wp-admin/includes/class-wp-privacy-policy-content.php`
- `wp-includes/class-wp-user-request.php`
- `wp-includes/post.php`
- `wp-includes/user.php`

---

## Section 1: Overview

WordPress privacy handling in admin is split into three related surfaces:

1. An informational About screen at `privacy.php` that explains WordPress.org privacy and telemetry.
2. A site-level privacy-policy manager at `options-privacy.php` and `privacy-policy-guide.php`.
3. The personal-data request workflow used by the export and erasure tools, powered by `privacy-tools.php` and the `WP_Privacy_*` classes.

The subsystem is centered around the built-in `user_request` post type and two built-in request actions:

- `export_personal_data`
- `remove_personal_data`

The admin screens are intentionally thin wrappers over shared helpers. The important behavior lives in:

- capability gates
- request creation and confirmation
- list-table actions for retry, complete, delete, and force-process
- privacy-policy page selection and suggested content caching
- export file generation and export-email delivery

---

## Section 2: Routes and Capability Gates

| Route | Purpose | Required capability |
|---|---|---|
| `GET /wp-admin/privacy.php` | WordPress.org privacy/about page | none in-file; loads as a normal admin page |
| `GET /wp-admin/options-privacy.php` | Privacy settings screen | `manage_privacy_options` |
| `GET /wp-admin/options-privacy.php?tab=policyguide` | Privacy policy guide tab | `manage_privacy_options` |
| `GET /wp-admin/export-personal-data.php` | Export personal data screen | `export_others_personal_data` |
| `GET /wp-admin/erase-personal-data.php` | Erase personal data screen | `erase_others_personal_data` and `delete_users` |
| `GET /wp-admin/user/privacy.php` | User-context wrapper for privacy about page | inherited from `privacy.php` |
| `GET /wp-admin/network/privacy.php` | Network-context wrapper for privacy about page | inherited from `privacy.php` |

The wrappers at `user/privacy.php` and `network/privacy.php` do not add their own logic. They load `admin.php` and then require `wp-admin/privacy.php`, so they inherit the same rendering behavior and do not introduce separate permissions.

The privacy settings screen and policy guide both enforce `manage_privacy_options` before any rendering or action handling. The export screen requires `export_others_personal_data`. The erasure screen requires both `erase_others_personal_data` and `delete_users`, which prevents the erasure tool from being exposed to users who can erase data but cannot delete users.

---

## Section 3: About Privacy Screen (`privacy.php`)

`privacy.php` is an informational admin page, not the privacy settings workflow. It renders a WordPress-branded About-style page with:

- a title of `Privacy`
- a header image and navigation tabs for the About section
- copy explaining that WordPress sites may send version, plugin, and theme data to WordPress.org
- links to WordPress.org stats and privacy policy pages

This file does not gate access with a privacy-specific capability. It simply boots admin, sets the page title, and renders content in the standard admin shell.

Operationally, this page is documentation-only. It does not store options, modify requests, or manage policy pages.

---

## Section 4: Privacy Settings Screen (`options-privacy.php`)

### 4.1 Screen Behavior

This screen is the control center for site privacy policy management. It:

- checks `manage_privacy_options`
- supports a secondary tab switch to the policy guide
- enqueues `privacy-tools`
- adds a `privacy-settings` body class
- requires JavaScript for the main UI

The screen uses `settings_errors()` style notices and posts its own forms with nonces rather than going through `options.php`.

### 4.2 Policy Page State

The selected privacy-policy page is stored in the option:

- `wp_page_for_privacy_policy`

Before rendering the selector, the screen validates the stored page ID:

- if the page is missing, it adds an error saying the selected page does not exist
- if the page is in the Trash, it adds an error telling the admin to restore or replace it
- otherwise it treats the selected page as valid

The screen also checks whether any pages exist at all, because the create/select controls depend on having at least one `page` post.

### 4.3 Create Flow

When the posted action is `create-privacy-page`:

1. The action nonce is verified with `check_admin_referer( 'create-privacy-page' )`.
2. `WP_Privacy_Policy_Content` is loaded if needed.
3. `WP_Privacy_Policy_Content::get_default_content()` generates the default policy body.
4. A draft `page` post titled `Privacy Policy` is inserted.
5. On success, the new post ID is saved in `wp_page_for_privacy_policy`.
6. The admin is redirected to the page editor for the newly created policy page.

If insertion fails, the screen registers an error under `page_for_privacy_policy`.

### 4.4 Set / Change Flow

When the posted action is `set-privacy-page`:

1. The action nonce is verified with `check_admin_referer( 'set-privacy-page' )`.
2. The selected page ID from `page_for_privacy_policy` is cast to an integer.
3. The option `wp_page_for_privacy_policy` is updated.
4. A success notice is registered.

If the chosen page is published, the current user can `edit_theme_options`, and the theme supports menus, the success notice includes a reminder to update menus in the customizer. That reminder is conditional because unpublished pages and menu-capability constraints make a direct menu link unreliable.

### 4.5 UI Structure

The main privacy settings UI includes:

- a tab strip for `Settings` and `Policy Guide`
- explanatory copy about legal responsibility for the policy
- a create-page form
- a dropdown for selecting an existing privacy policy page
- action buttons that create or assign the policy page

The tab state is purely server-rendered. `?tab=policyguide` causes the page to include the guide screen and return early.

---

## Section 5: Privacy Policy Guide (`privacy-policy-guide.php`)

The guide screen is the companion to the settings screen. It:

- checks `manage_privacy_options`
- loads `WP_Privacy_Policy_Content`
- enqueues `privacy-tools`
- renders the same privacy-settings tab strip
- shows the generated default policy content and plugin/theme policy suggestions in accordions

The guide is intentionally educational. It does not save policy content itself. Its job is to surface:

- the core default policy text
- plugin and theme suggested policy text
- update/removal badges when suggested text changes

`WP_Privacy_Policy_Content::get_default_content( true, false )` is used for the tutorial view, which includes section headings and explanatory text rather than the publishable default copy.

`WP_Privacy_Policy_Content::privacy_policy_guide()` renders the plugin/theme suggestions and marks each suggestion as:

- added
- updated
- removed

The guide also depends on the cached policy-text metadata stored on the selected privacy-policy page.

---

## Section 6: Privacy Policy Content Model (`WP_Privacy_Policy_Content`)

`WP_Privacy_Policy_Content` is the shared registry and presentation layer for privacy-policy suggestions.

### 6.1 Static Registry

Plugins and themes contribute suggested policy text through:

- `wp_add_privacy_policy_content()`

That data is accumulated in the static `$policy_content` array and deduplicated by `{ plugin_name, policy_text }`.

### 6.2 Change Detection

`text_change_check()` compares the current registered suggestions against the cached meta on the selected policy page:

- if no policy page is selected, it returns false
- if the current user cannot `edit_post` that page, it returns false
- if no cached suggestion meta exists yet, it returns false
- otherwise it compares old vs new suggestion sets and caches the result in `_wp_suggested_policy_text_has_changed`

If the suggestions changed, the class schedules an admin notice telling the user to review the guide.

### 6.3 Policy Page Notice

`notice()` renders a warning when the current post being edited is the selected privacy-policy page and the current user can `manage_privacy_options`.

The notice behavior differs by editor:

- block editor: injects a non-dismissible notice through `wp-notices`
- classic editor: renders an inline admin notice with a link to the policy guide

### 6.4 Cache Updates

The selected policy page stores suggested policy metadata in post meta:

- `_wp_suggested_privacy_policy_content`

The class updates that cache when:

- plugin/theme policy text changes
- a plugin or theme is activated
- a plugin or theme is deactivated
- the policy page itself is updated

This means the policy guide is not a live read of the registry only. It is a cached audit trail of suggestion changes, which is why removed items can still be surfaced later.

### 6.5 Default Policy Content

`get_default_content()` builds the policy page starter text. It includes core sections such as:

- Who we are
- What personal data we collect and why we collect it
- Comments
- Media
- Contact forms

The method supports two output modes:

- normal default policy body
- tutorial / description mode for the guide screen

The generated content is meant to be edited by the site owner. Core does not treat it as a complete policy.

---

## Section 7: Personal Data Request Model

The privacy request system is built on the built-in `user_request` post type and the `WP_User_Request` wrapper.

### 7.1 `user_request` Post Type

`user_request` is a built-in, non-public post type with:

- no rewrite rules
- no query var
- no front-end export support
- no supports array
- `delete_with_user` set to false

That makes it suitable for storing administrative requests without exposing them as public content.

### 7.2 Request Statuses

The built-in request statuses are:

| Status | Meaning |
|---|---|
| `request-pending` | waiting for confirmation |
| `request-confirmed` | user confirmed the action |
| `request-failed` | confirmation expired or failed |
| `request-completed` | admin/process finished the request |

These statuses are registered as internal post statuses and are also returned by `_wp_privacy_statuses()`.

### 7.3 `WP_User_Request`

`WP_User_Request` wraps a `WP_Post` object and exposes:

- `ID`
- `user_id`
- `email`
- `action_name`
- `status`
- `created_timestamp`
- `modified_timestamp`
- `confirmed_timestamp`
- `completed_timestamp`
- `request_data`
- `confirm_key`

The wrapper maps post fields and meta into a request-specific object so the rest of the privacy system does not need to work directly with raw posts.

### 7.4 Core APIs

`wp_create_user_request( $email, $action_name, $request_data, $status )`:

- validates the email address
- validates the action name against `_wp_privacy_action_request_types()`
- validates the status as `pending` or `confirmed`
- looks up a user by email when possible
- blocks duplicate incomplete requests for the same email + action
- stores the request as a `user_request` post

`wp_send_user_request( $request_id )`:

- loads the request through `wp_get_user_request()`
- localizes the email to the user locale when a user ID exists
- generates a confirmation key with `wp_generate_user_request_key()`
- sends the confirmation email

`wp_validate_user_request_key( $request_id, $key )`:

- accepts only `request-pending` and `request-failed` requests
- verifies the hashed confirmation key
- enforces the key-expiration window from `user_request_key_expiration`

The default expiration is one day.

Operationally, this model makes privacy requests durable and queryable through standard admin list tables, while still allowing the confirmation token to expire independently of the post record.

---

## Section 8: Request Screens

### 8.1 Export Personal Data

The export screen at `export-personal-data.php` is the admin entry point for `export_personal_data` requests.

It:

- requires `export_others_personal_data`
- adds contextual help for the request workflow and default data categories
- calls `_wp_personal_data_handle_actions()`
- calls `_wp_personal_data_cleanup_requests()`
- enqueues `privacy-tools`
- sets a per-page screen option default of 20
- renders a request-creation form plus the request list table

The form posts:

- `action=add_export_personal_data_request`
- `type_of_action=export_personal_data`
- `username_or_email_for_privacy_request`
- optional `send_confirmation_email`

### 8.2 Erase Personal Data

The erasure screen at `erase-personal-data.php` is the admin entry point for `remove_personal_data` requests.

It:

- requires both `erase_others_personal_data` and `delete_users`
- adds contextual help for erasure and plugin data guidance
- calls `_wp_personal_data_handle_actions()`
- calls `_wp_personal_data_cleanup_requests()`
- enqueues `privacy-tools`
- sets a per-page screen option default of 20
- renders a request-creation form plus the request list table

The form posts:

- `action=add_remove_personal_data_request`
- `type_of_action=remove_personal_data`
- `username_or_email_for_privacy_request`
- optional `send_confirmation_email`

### 8.3 Request Creation Flow

`_wp_personal_data_handle_actions()` is the shared request-handler for both screens.

For both export and erasure requests, it:

1. Verifies the `personal-data-request` nonce.
2. Accepts either a username or an email address.
3. Resolves usernames to an email address through `get_user_by( 'login', ... )` when needed.
4. Validates that the requested action is one of the allowed privacy request types.
5. Calls `wp_create_user_request()`.
6. If the caller requested confirmation, sends the confirmation email with `wp_send_user_request()`.
7. Registers success or error messages with `add_settings_error()`.

The `send_confirmation_email` checkbox controls whether the request is created in `pending` state or as an already-confirmed request.

### 8.4 Cleanup Flow

`_wp_personal_data_cleanup_requests()` scans `user_request` posts in `request-pending` state and marks expired requests as `request-failed`, clearing the stored password token.

This cleanup runs before the list table renders on both request screens. It is a practical guard against stale confirmations lingering forever in the UI.

### 8.5 Request List Tables

The base list table class is `WP_Privacy_Requests_Table`.

Common behavior:

- columns: requester, status, requested, next steps
- sortable columns: requester and requested
- request counts and views are cached by post type and request type
- bulk actions: resend, complete, delete
- search support through the standard list-table UI
- per-page setting keyed by request type

The base table normalizes the admin URL so `remove-personal-data` maps to `erase-personal-data.php`.

#### Export Request Rows

`WP_Privacy_Data_Export_Requests_List_Table` adds:

- a `Download personal data` action for pending requests
- a `Send export link` action for confirmed requests
- a retry action for failed requests
- a remove-request action for completed requests

The `next_steps` column mirrors those states with the same underlying action data.

#### Erasure Request Rows

`WP_Privacy_Data_Removal_Requests_List_Table` adds:

- a `Force erase personal data` action for not-yet-confirmed requests
- an `Erase personal data` action for confirmed requests
- a retry action for failed requests
- a remove-request action for completed requests

The erasure list table intentionally allows a force-erase path before confirmation has been received, because the admin may still need to process the data erasure.

### 8.6 Bulk Actions and Nonces

Bulk operations are nonce-protected with `bulk-privacy_requests`.

Supported bulk actions are:

- resend confirmation requests
- mark requests as completed
- delete requests

The screen-specific row actions also use request-specific nonces for the Ajax data-export and data-erasure operations.

---

## Section 9: Export and Erasure Processing (`privacy-tools.php`)

### 9.1 Request Completion Helpers

`_wp_privacy_resend_request( $request_id )`:

- validates that the target post is a `user_request`
- calls `wp_send_user_request()`
- returns `WP_Error` on invalid requests or send failures

`_wp_privacy_completed_request( $request_id )`:

- validates the request wrapper
- stores the completion timestamp in `_wp_user_request_completed_timestamp`
- updates the post status to `request-completed`

These helpers are reused by the list tables and the Ajax processing pipeline.

### 9.2 Export File Generation

`wp_privacy_process_personal_data_export_page()` is the Ajax interceptor for exporter responses.

It:

- validates the response shape
- accumulates raw exporter data in `_export_data_raw`
- groups the data into export sections in `_export_data_grouped`
- calls `do_action( 'wp_privacy_personal_data_export_file', $request_id )`
- clears the grouped meta after file generation

If the export is being emailed, it sends the export email and then marks the request completed. If the export is being downloaded in-browser, it returns the export file URL in the Ajax response.

`wp_privacy_generate_personal_data_export_file()` writes the actual export artifacts:

- requires `ZipArchive`
- verifies the request is an `export_personal_data` request
- creates the exports folder if needed
- drops an `index.php` file into the directory to block browsing
- writes a JSON report and an HTML report
- zips them into a `.zip` archive
- fires `wp_privacy_personal_data_export_file_created`
- removes the temporary JSON and HTML files

The archive filename is reused if it already exists, which keeps previously emailed links stable.

### 9.3 Export Email Delivery

`wp_privacy_send_personal_data_export_email()`:

- loads the request and validates the action
- localizes the email to the user locale when possible
- uses `wp_privacy_export_expiration` with a default of 3 days
- builds a subject and body that are filterable
- supports the filters:
  - `wp_privacy_personal_data_email_to`
  - `wp_privacy_personal_data_email_subject`
  - `wp_privacy_personal_data_email_content`
  - `wp_privacy_personal_data_email_headers`
- sends the mail and returns `WP_Error` on failure

Operationally, this means the export email path is both user-localized and heavily filterable, but it also depends on a writable exports directory and working mail transport.

### 9.4 Erasure Processing

`wp_privacy_process_personal_data_erasure_page()` is the Ajax interceptor for eraser responses.

It:

- validates the response shape
- verifies the request is a `remove_personal_data` request
- waits until the last eraser reports `done`
- marks the request completed
- fires `wp_privacy_personal_data_erased`

The erasure path does not build an archive. Its job is to treat completion as the terminal state for the request record once all registered erasers have finished.

---

## Section 10: Operational Implications

The privacy subsystem is intentionally conservative:

- request screens are capability-gated and nonce-protected
- privacy requests are stored as posts, which makes them manageable with standard admin APIs and list tables
- request confirmation keys expire, and stale pending requests are downgraded to failed automatically
- policy-page selection is validated against existence and trash state, not just raw option values
- privacy-policy suggestions are cached on the policy page so the guide can show change history
- export generation requires file-system write access and ZipArchive support
- export emails, request emails, and policy-guide text are all filterable, which means plugins can extend the workflow without replacing core screens

The result is a system that is mostly administrative workflow and state management, not a single monolithic feature. The spec should treat it as three connected layers:

1. policy-page administration
2. request lifecycle management
3. export/erasure file and email processing

---

## Section 11: Tovu Reconstruction Notes

### 11.1 Why this exists

This subsystem exists because privacy compliance is a workflow problem, not just a storage problem. WordPress coordinates policy-page management, user request verification, export/erasure execution, file generation, and email delivery as one administrative process.

### 11.2 What Tovu should preserve

- A formal request lifecycle for data export and erasure, including confirmation and completion states
- Separate registries for exporters and erasers so product modules can contribute their own personal-data handlers
- Capability-gated administrative workflows with auditable request records
- Clear distinction between policy-page guidance, request processing, and artifact delivery

### 11.3 What Tovu can simplify

- Tovu does not need to store privacy requests as posts if a dedicated workflow model is cleaner
- Export packaging can use a different artifact format than WordPress's HTML/JSON/ZIP bundle
- Email and file-delivery strategies can be modernized as long as expiry, confirmation, and completion states remain explicit

### 11.4 Possible Tovu seams

- `src/features/privacy/` for request workflows and operator tooling
- `src/core/ports/PrivacyRequestPort.ts` for request persistence and state transitions
- `src/core/ports/DataExportPort.ts` for exporter registration and artifact generation
- `src/core/ports/DataErasurePort.ts` for eraser registration and completion tracking

### 11.5 Suggested priority

- `V1`: privacy request lifecycle, exporter/eraser registries, audited admin flow
- `Later`: richer artifact delivery options, policy-guide UX, and compatibility-oriented mail customization
