# WordPress Admin Dashboard — TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-admin/index.php`
- `wp-admin/includes/dashboard.php`
- `wp-admin/network/index.php`

---

## Section 1: Overview

The admin dashboard is the first screen shown after login. Its URL is `/wp-admin/` (maps to `index.php`). The page is composed entirely of draggable, collapsible widget panels called "metaboxes" or "dashboard widgets". Everything on the page is user-configurable: which widgets are shown, how many columns are used, and which column each widget occupies — all persisted per-user in user meta.

### Boot sequence (index.php)

1. Load admin bootstrap (`admin.php`) which handles authentication, sets `$current_user`, loads all WordPress APIs.
2. Load the dashboard API (`wp-admin/includes/dashboard.php`).
3. Call `wp_dashboard_setup()` — registers all built-in widgets into the metabox system.
4. Enqueue scripts: `dashboard` (always), `plugin-install` + `updates` (if `install_plugins` cap), `media-upload` (if `upload_files` cap), `jquery-touch-punch` (if mobile UA).
5. Call `add_thickbox()` to enable the ThickBox modal overlay.
6. Register contextual help tabs for the screen (`overview`, `help-navigation`, `help-layout`, `help-content`).
7. Output the admin header.
8. Conditionally render the welcome panel.
9. Render the widget grid via `wp_dashboard()`.
10. Print community events JavaScript templates.
11. Output the admin footer.

### Admin email reminder notice

If `$_GET['admin_email_remind_later']` is set on page load:
- Read the `admin_email_lifespan` site option.
- Compute `$time_passed = time() - ($postponed_time - $remind_interval)`.
- If `$time_passed < MINUTE_IN_SECONDS` (60 seconds), display a dismissible success notice: "The admin email verification page will reappear after {human_time_diff}."
- The interval is filterable via the `admin_email_remind_interval` filter (default: 3 days in seconds).

---

## Section 2: Dashboard Widgets

All widgets are registered via `wp_dashboard_setup()`. Each widget is internally an `add_meta_box()` call. The widget content is rendered by a callback function.

### 2.1 Browser Nag (`dashboard_browser_nag`)

- **Registered when:** `wp_check_browser_version()` returns a result where `['upgrade'] === true`.
- **Title:** "You are using an insecure browser!" if `['insecure'] === true`; otherwise "Your browser is out of date!"
- **Callback:** `wp_dashboard_browser_nag`
- **Context:** Defaults to `normal` but overridden to `high` priority by the high-priority widget list.
- **CSS class filter:** `postbox_classes_dashboard_dashboard_browser_nag` → `dashboard_browser_nag_class`
- **Capability:** None beyond accessing the dashboard.

### 2.2 PHP Version Nag (`dashboard_php_nag`)

- **Registered when:** `wp_check_php_version()` returns a result, the current user has `update_php` capability, and `['is_acceptable'] === false`.
- **Title:** "PHP Update Required" if `['is_lower_than_future_minimum'] === true`; otherwise "PHP Update Recommended".
- **Callback:** `wp_dashboard_php_nag`
- **Priority:** `high` (overridden from default `core`).
- **CSS class filter:** `postbox_classes_dashboard_dashboard_php_nag` → `dashboard_php_nag_class`

### 2.3 Site Health Status (`dashboard_site_health`)

- **Registered when:** Current user has `view_site_health_checks` capability AND `is_network_admin()` is false.
- **Title:** "Site Health Status"
- **Callback:** `wp_dashboard_site_health`
- **Scripts/styles enqueued:** `site-health` (both script and style).
- **Requires:** `WP_Site_Health` class (loaded from `class-wp-site-health.php` if not already loaded), `WP_Site_Health::get_instance()` called to initialize.
- **Context:** `normal`, priority `core`.

### 2.4 At a Glance / Right Now (`dashboard_right_now`)

- **Registered when:** `is_blog_admin()` AND current user has `edit_posts` capability.
- **Title:** "At a Glance"
- **Callback:** `wp_dashboard_right_now`
- **Context:** `normal`, priority `core`.

**Content rendered by `wp_dashboard_right_now()`:**

A `<div class="main">` containing a `<ul>` of stats, then a footer area.

Stats list items:

1. **Posts count:** `wp_count_posts('post')` — shows `$num_posts->publish` as "N Post(s)". Link to `edit.php?post_type=post` if user has `edit_posts` cap; plain text otherwise.
2. **Pages count:** `wp_count_posts('page')` — shows `$num_posts->publish` as "N Page(s)". Link to `edit.php?post_type=page` if user has `edit_pages` cap.
3. **Comments count:** `wp_count_comments()` — shows `$num_comm->approved` approved comments (link to `edit-comments.php`). Shows moderated count in a separate `<li class="comment-mod-count">` (hidden if zero) linking to `edit-comments.php?comment_status=moderated`.
4. **Extra items:** Applied via `dashboard_glance_items` filter — returns an array of HTML strings, each wrapped in `<li>` by the widget.

After the list, `update_right_now_message()` is called to display the theme/version line.

If `manage_options` cap AND `get_option('blog_public')` is falsy (search engines discouraged):
- Renders a `<p class="search-engines-info">` with a link to `options-reading.php`.
- Link title filterable via `privacy_on_link_title`.
- Link text filterable via `privacy_on_link_text` (default: "Search engines discouraged").

Bottom "sub" section fires actions: `rightnow_end`, `activity_box_end`. If either produces output (checked via `ob_start()`/`ob_get_clean()`), wraps it in `<div class="sub">`.

### 2.5 Network Right Now (`network_dashboard_right_now`)

- **Registered when:** `is_network_admin()` is true.
- **Title:** "Right Now"
- **Callback:** `wp_network_dashboard_right_now`
- **Context:** `normal`, priority `core`.

**Content rendered by `wp_network_dashboard_right_now()`:**

Quick action links:
- "Create a New Site" → `network_admin_url('site-new.php')` — shown if `create_sites` cap.
- "Create a New User" → `network_admin_url('user-new.php')` — shown if `create_users` cap.

Stats sentence: "You have {N site(s)} and {N user(s)}." using `get_blog_count()` and `get_user_count()`.

Two inline search forms:
- User search: POST to `network_admin_url('users.php')` with field `s`.
- Site search: POST to `network_admin_url('sites.php')` with field `s`.

Fires: `wpmuadminresult` (before search forms), `mu_rightnow_end`, `mu_activity_box_end`.

### 2.6 Activity (`dashboard_activity`)

- **Registered when:** `is_blog_admin()` is true (no capability check beyond dashboard access).
- **Title:** "Activity"
- **Callback:** `wp_dashboard_site_activity`
- **Context:** `normal`, priority `core`.

**Content rendered by `wp_dashboard_site_activity()`:**

Outer container: `<div id="activity-widget">`.

Three sections, each conditionally rendered:

**Publishing Soon** (via `wp_dashboard_recent_posts()`):
- Query args: `post_type=post`, `post_status=future`, `orderby=date`, `order=ASC`, `posts_per_page=5`, `perm=editable`, `no_found_rows=true`.
- Filter: `dashboard_recent_posts_query_args` on query args.
- Each post rendered as `<li><span>{relative date, time}</span> <a href="{edit or permalink}">{title}</a></li>`.
- Relative dates: "Today", "Tomorrow", locale-formatted month/day, or full date if different year.
- Link is to `get_edit_post_link()` if user has `edit_post` cap; otherwise `get_permalink()`.

**Recently Published** (via `wp_dashboard_recent_posts()`):
- Same function, different args: `post_status=publish`, `order=DESC`, `perm=readable`.

**Recent Comments** (via `wp_dashboard_recent_comments()`):
- Queries up to 5 comments using a paginated loop. Fetches `total_items * 5` comments per page, filters out comments the user cannot see (checks `edit_post`, `post_password_required`, `read_post`), continues paginating until 5 visible comments are found or queries are exhausted.
- Container: `<div id="latest-comments">` with `<ul id="the-comment-list" data-wp-lists="list:comment">`.
- Each comment row rendered via `_wp_dashboard_recent_comments_row()`.

**Comment row (`_wp_dashboard_recent_comments_row()`):**
- Shows avatar (if `show_avatars` option is set, 50px, `mystery` default).
- For regular comments: "From {author link} on {post link} [Pending]".
- For pingbacks/trackbacks/custom types: "{Type} on {post link} [Pending]".
- If user has `edit_comment` cap, shows action links: Approve | Unapprove | Reply | Edit | Spam | Trash/Delete | View.
  - All actions use nonce-signed URLs to `comment.php?action=...&p={post_id}&c={comment_id}`.
  - `data-wp-lists` attributes enable AJAX list updating without page reload.
- Fires `comment_row_actions` filter to allow modification of the action links array.

If none of the three sections has content, shows `<div class="no-activity"><p>No activity yet!</p></div>`.

### 2.7 Quick Draft (`dashboard_quick_press`)

- **Registered when:** `is_blog_admin()` AND current user has the `create_posts` capability for the `post` post type (`get_post_type_object('post')->cap->create_posts`).
- **Title:** HTML with two `<span>` elements: "Quick Draft" (hidden without JS) and "Your Recent Drafts" (hidden with JS).
- **Callback:** `wp_dashboard_quick_press`
- **Context:** `side` (hardcoded override regardless of passed context), priority `core`.

**Content rendered by `wp_dashboard_quick_press()`:**

Checks `edit_posts` capability; returns early if not met.

Auto-draft management:
- Reads `dashboard_quick_press_last_post_id` from user options.
- If a stored post ID exists and the post is still an `auto-draft`: reuses it (clears `post_title` to empty).
- Otherwise: creates a new auto-draft via `get_default_post_to_edit('post', true)` and saves the new ID back to user options.

Renders a form (`action=post.php`, method POST, id `quick-press`):
- Error notice area (if `$error_msg` passed).
- Title field: `<input type="text" name="post_title" id="title">`.
- Content field: `<textarea name="content" id="content" rows="3">`.
- Tags field: `<input type="text" name="tags_input" id="tags-input">`.
- Hidden fields: `action=post-quickdraft-save`, `post_ID={auto-draft ID}`, `post_type=post`, nonce (`add-post`).
- Submit button: "Save Draft".

After the form, calls `wp_dashboard_recent_drafts()`.

**`wp_dashboard_recent_drafts($drafts)`:**
- Query: `post_type=post`, `post_status=draft`, `author={current_user_id}`, `posts_per_page=4`, `orderby=modified`, `order=DESC`.
- Filter: `dashboard_recent_drafts_query_args`.
- Truncates to 3 drafts for display (fetches 4 to detect if "View all drafts" link is needed).
- If more than 3 found, shows a "View all drafts" link to `edit.php?post_status=draft`.
- Each draft: `<li>` with title link (`get_edit_post_link()`) + `<time datetime="{ISO date}">` + trimmed content preview (10 words, locale-configurable via `_x('10', 'draft_length')`).

**Quick Draft form submission** (handled in `post.php`):
- Action: `post-quickdraft-save`
- Validates nonce (`add-post`), checks `create_posts` capability.
- If content lacks `<!-- wp:paragraph -->` block markup, wraps content in a paragraph block: `<!-- wp:paragraph -->{content}<!-- /wp:paragraph -->` with newlines converted to `<br />`.
- Calls `edit_post()` to save.
- Re-renders `wp_dashboard_quick_press()` and exits.

### 2.8 WordPress Events and News (`dashboard_primary`)

- **Registered:** Always (no capability check).
- **Title:** "WordPress Events and News"
- **Callback:** `wp_dashboard_events_news`
- **Context:** `side` (hardcoded override), priority `core`.

**Content rendered by `wp_dashboard_events_news()`:**

Two sub-sections:

**Community Events** (via `wp_print_community_events_markup()`):
- Requires JavaScript; shows a loading/error notice for non-JS users.
- Renders `<div id="community-events" class="community-events" aria-hidden="true">` (hidden until JS populates it).
- Contains a location display + toggle button, a city input form (POST to `admin-ajax.php`).
- An `<ul class="community-events-results">` that is populated by `wp.communityEvents.renderEventsTemplate()` on the client.
- The form submits via AJAX; the response is a list of upcoming WordPress events (meetups, WordCamps) near the entered city.

**WordPress News** (via `wp_dashboard_primary()`):
- Wrapped in `<div class="wordpress-news hide-if-no-js">`.
- Uses `wp_dashboard_cached_rss_widget()` with a 12-hour transient cache (key: `dash_v2_{md5(widget_id + '_' + locale)}`).
- If cache miss and not doing AJAX: shows a "Loading..." placeholder with a JS-required notice.
- If doing AJAX or cache hit: renders the RSS feed content.
- RSS feed URL stored in `dashboard_widget_options` site option under the widget's key.

Footer links: "Meetups" → `https://make.wordpress.org/community/meetups-landing-page`, "WordCamps" → `https://central.wordcamp.org/schedule/`, "News" → `https://wordpress.org/news/` (translatable URL).

**Community events JavaScript templates** (`wp_print_community_events_templates()`):
Outputs four `<script type="text/template">` blocks with Underscore.js template syntax:
- `tmpl-community-events-attend-event-near`: Message for events near a location.
- `tmpl-community-events-could-not-locate`: Error message for unknown city.
- `tmpl-community-events-event-list`: Iterates `data.events`, renders each as `<li class="event event-{type}">` with title link, type label, city, date, and (for meetups) time + timezone.
- `tmpl-community-events-no-upcoming-events`: "No upcoming events" message with optional location description.

---

## Section 3: wp_add_dashboard_widget()

```typescript
function wp_add_dashboard_widget(
  widget_id: string,
  widget_name: string,
  callback: () => void,
  control_callback?: (() => void) | null,
  callback_args?: Record<string, unknown> | null,
  context?: 'normal' | 'side' | 'column3' | 'column4',
  priority?: 'high' | 'core' | 'default' | 'low'
): void
```

**Parameter details:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `widget_id` | `string` | required | Unique ID. Used as the `id` attribute of the metabox container element. |
| `widget_name` | `string` | required | Title displayed in the widget header bar. May contain HTML (for Configure/Cancel links). |
| `callback` | `callable` | required | Function that echoes the widget body content. |
| `control_callback` | `callable\|null` | `null` | Optional. Function that renders a configuration form. Only registered if the current user has `edit_dashboard` capability. |
| `callback_args` | `array\|null` | `null` | Extra data passed as the `$args` parameter to the `callback`. Merged with `['__widget_basename' => $widget_name]`. |
| `context` | `string` | `'normal'` | Column area. See Section 4. |
| `priority` | `string` | `'core'` | Stack order within a context. |

**Hardcoded context overrides:**
- `dashboard_quick_press` and `dashboard_primary` always get context `side`, regardless of the passed argument.

**Hardcoded priority overrides:**
- `dashboard_browser_nag` and `dashboard_php_nag` always get priority `high`.

**Control callback handling:**
When `control_callback` is provided AND is callable AND user has `edit_dashboard` cap:
- The widget ID is stored in `$wp_dashboard_control_callbacks[widget_id]`.
- A "Configure" link is appended to `widget_name` pointing to `?edit={widget_id}#{widget_id}`.
- If the current request has `GET edit == widget_id`, a "Cancel" link is shown instead, and the `callback` is replaced with `_wp_dashboard_control_callback` (which renders the control form).

**`_wp_dashboard_control_callback()`:**
Renders `<form method="post" class="dashboard-widget-control-form">` containing:
- The output of the registered `control_callback`.
- Nonce field: `edit-dashboard-widget_{widget_id}` with name `dashboard-widget-nonce`.
- Hidden field: `widget_id={widget_id}`.
- Submit button: "Save Changes".

**Control callback POST handling (in `wp_dashboard_setup()`):**
If `REQUEST_METHOD === 'POST'` and `$_POST['widget_id']` is set:
- Verify nonce: `edit-dashboard-widget_{widget_id}`.
- Call `wp_dashboard_trigger_widget_control($_POST['widget_id'])`.
- Redirect to current URL without `edit` query param.

**Underlying registration:**
Calls `add_meta_box($widget_id, $widget_name, $callback, $screen, $context, $priority, $callback_args)` where `$screen` is the current screen object.

---

## Section 4: Widget Contexts and Positions

### Contexts (columns)

| Context | Container ID | Description |
|---|---|---|
| `normal` | `postbox-container-1` | Left/main column |
| `side` | `postbox-container-2` | Right sidebar column |
| `column3` | `postbox-container-3` | Third column (only visible if ≥3 columns enabled) |
| `column4` | `postbox-container-4` | Fourth column (only visible if ≥4 columns enabled) |

### Priority (stack order within a context)

Values: `high`, `core`, `default`, `low` — determines vertical order of widgets within their column. `high` renders first (top).

### Drag-and-drop ordering

The dashboard uses jQuery UI Sortable. After a drag operation, the browser sends an AJAX request that saves the new order to user meta:

- **Meta key:** `meta-box-order_{screen_id}` — for the dashboard screen this is `meta-box-order_dashboard`.
- **Value format:** A serialized associative array of `context => comma-separated list of widget IDs` in order.
- **AJAX action:** `save-widget-order` (via the `meta-box-order` nonce field `meta-box-order-nonce`).

### Collapsed state

Each widget's collapsed/expanded state is stored in user meta:
- **Meta key:** `closedpostboxes_{screen_id}` — e.g., `closedpostboxes_dashboard`.
- **Value:** Serialized array of widget IDs that are currently collapsed.
- **AJAX action:** `closed-postboxes` (via the `closedpostboxes` nonce field `closedpostboxesnonce`).

Both nonce fields are printed at the end of `wp_dashboard()`.

---

## Section 5: Screen Options

The dashboard Screen Options panel (toggled via the "Screen Options" tab) controls:

### Column count

The user can choose 1, 2, 3, or 4 columns. This is stored in user meta via the `screen_layout_{screen_id}` key (e.g., `screen_layout_dashboard`).

The active column count is read via `$screen->get_columns()`. The resulting integer is applied as a CSS class `columns-{n}` on `<div id="dashboard-widgets">`.

### Widget visibility

Each registered widget has a checkbox in Screen Options. Unchecked widgets are added to the `metaboxhidden_{screen_id}` user meta array (e.g., `metaboxhidden_dashboard`). Hidden widgets receive `display: none` via CSS. The widget still exists in the DOM; it is simply hidden.

### Screen Options form fields

The Screen Options panel is generated by the admin framework based on what is registered. The dashboard does not register any additional `per_page` type screen options — only the layout columns and widget visibility checkboxes appear.

---

## Section 6: Welcome Panel

### Visibility logic

```
show_welcome_panel user meta value:
  0 = always hidden (user explicitly dismissed)
  1 = shown (user explicitly opened, or site owner on single-site)
  2 = shown for multisite site owners (admin email matches site admin email)
```

**Show/hide rules:**
- The welcome panel HTML only renders if `has_action('welcome_panel')` is true AND current user has `edit_theme_options` capability.
- CSS class `welcome-panel` is always present on the container.
- CSS class `hidden` is added if: the meta value is `0`, OR the meta value is `2` and the current user's email does not match `get_option('admin_email')`.

**Dismiss link:**
`<a class="welcome-panel-close" href="?welcome=0">Dismiss</a>`
This link navigates to the dashboard with `?welcome=0`. The admin framework intercepts this and saves `0` to the `show_welcome_panel` user meta.

**Nonce:** A `welcome-panel-nonce` nonce field with name `welcomepanelnonce` is printed inside the panel div. This nonce is used by JavaScript when the dismiss link is clicked via AJAX.

**Content hook:**
```
do_action('welcome_panel')
```
The default content is registered as `wp_welcome_panel` on this action. To replace or remove, use `remove_action('welcome_panel', 'wp_welcome_panel')`.

**`wp_welcome_panel()` default content:**
Renders a panel with quick links for common new-site tasks:
- "Create your first blog post" → `post-new.php`
- "Add an About page" → `post-new.php?post_type=page`
- "Set up your homepage" → `customize.php`
- "View your site" → home URL
- Customization tools section
- More actions section

Capability-checked: only shows relevant links based on user capabilities (`edit_posts`, `manage_options`, etc.).

---

## Section 7: Network Dashboard (Multisite)

**Entry point:** `wp-admin/network/index.php`

**Key differences from standard dashboard:**

1. **Capability check:** `manage_network` is required immediately after loading; `wp_die(403)` if not met. The standard dashboard only requires `read`.

2. **Script enqueuing:** Always enqueues `plugin-install`. Does NOT check `upload_files` (no media upload button). Does NOT enqueue `updates`.

3. **Widget set:** Calls the same `wp_dashboard_setup()`, but inside that function, the widget registration is context-aware:
   - `dashboard_right_now` (blog "At a Glance") is replaced by `network_dashboard_right_now` ("Right Now") which shows network-wide user and site counts.
   - `dashboard_activity` and `dashboard_quick_press` are only registered by `is_blog_admin()`, so they do NOT appear on the network dashboard.
   - `dashboard_site_health` is only registered when `!is_network_admin()`, so it does NOT appear.
   - `dashboard_primary` (Events and News) always registers.

4. **Widget registration hooks:**
   - Standard dashboard fires `wp_dashboard_setup` and applies `wp_dashboard_widgets` filter.
   - Network dashboard fires `wp_network_dashboard_setup` and applies `wp_network_dashboard_widgets` filter.
   - User dashboard fires `wp_user_dashboard_setup` and applies `wp_user_dashboard_widgets` filter.

5. **Help tabs:** Network dashboard has "Overview" and "Quick Tasks" tabs instead of the standard layout/content tabs.

6. **No welcome panel:** The network dashboard has no welcome panel section.

---

## Section 8: Capability Requirements

### Standard dashboard (`index.php`)

The minimum capability to access the admin at all is `read` (enforced by `admin.php` bootstrap, not by `index.php` directly).

Per-widget capability gates:

| Widget | Capability Required |
|---|---|
| `dashboard_site_health` | `view_site_health_checks` |
| `dashboard_right_now` | `edit_posts` |
| `dashboard_quick_press` | `create_posts` (from post type object) |
| `dashboard_php_nag` | `update_php` |
| `dashboard_activity` | None beyond `read` |
| `dashboard_primary` | None beyond `read` |
| Welcome panel | `edit_theme_options` |

### Network dashboard (`network/index.php`)

- `manage_network` — required immediately, blocks entire page if missing.

### Widget-level action capabilities

- Configuring a widget (control callback): `edit_dashboard`
- Commenting actions in activity widget: `edit_comment` for action links; `edit_post` or `read_post` for comment visibility.

---

## Section 9: Key Hooks and Filters

### Actions

| Hook | Where fired | Description |
|---|---|---|
| `wp_dashboard_setup` | `wp_dashboard_setup()` | Fires after core blog-admin dashboard widgets are registered. Add custom widgets here. |
| `wp_network_dashboard_setup` | `wp_dashboard_setup()` | Fires after core network-admin widgets are registered. |
| `wp_user_dashboard_setup` | `wp_dashboard_setup()` | Fires after core user-admin widgets are registered. |
| `welcome_panel` | `index.php` body | Fires to render welcome panel content. Default: `wp_welcome_panel`. |
| `do_meta_boxes` | `wp_dashboard_setup()` (twice) | Fires widget rendering for `normal` then `side` contexts. |
| `rightnow_end` | `wp_dashboard_right_now()` | Appended content at bottom of At a Glance. |
| `activity_box_end` | `wp_dashboard_right_now()` | Legacy synonym for `rightnow_end`. |
| `mu_rightnow_end` | `wp_network_dashboard_right_now()` | Bottom of network Right Now widget. |
| `mu_activity_box_end` | `wp_network_dashboard_right_now()` | Legacy synonym for `mu_rightnow_end`. |
| `wpmuadminresult` | `wp_network_dashboard_right_now()` | Before network search forms. |
| `bulk_edit_posts` | `bulk_edit_posts()` | Fires after bulk edit processing. Passed: updated IDs, post data. |

### Filters

| Hook | Description | Default |
|---|---|---|
| `wp_dashboard_widgets` | Array of widget IDs to load for blog-admin dashboard. | `[]` |
| `wp_network_dashboard_widgets` | Array of widget IDs for network-admin dashboard. | `[]` |
| `wp_user_dashboard_widgets` | Array of widget IDs for user-admin dashboard. | `[]` |
| `dashboard_glance_items` | Extra HTML `<li>` strings for At a Glance widget. | `[]` |
| `dashboard_recent_posts_query_args` | WP_Query args for Publishing Soon / Recently Published. | See Section 2.6 |
| `dashboard_recent_drafts_query_args` | WP_Query args for Quick Draft's recent drafts list. | See Section 2.7 |
| `privacy_on_link_title` | Title attribute for "Search engines discouraged" link. | `''` |
| `privacy_on_link_text` | Label for "Search engines discouraged" link. | `'Search engines discouraged'` |
| `admin_email_remind_interval` | Seconds between admin email reminders. | `3 * DAY_IN_SECONDS` |
| `postbox_classes_dashboard_{widget_id}` | CSS classes array for specific widget container. | Per widget |
| `comment_row_actions` | Action links array for each comment row in Activity widget. | See Section 2.6 |
| `enter_title_here` | Placeholder text for Quick Draft title field. | `'Title'` |

---

## Section 10: TypeScript Interface Sketch

```typescript
// Capability string type (not exhaustive — extend as needed)
type WPCapability =
  | 'read'
  | 'edit_posts'
  | 'edit_pages'
  | 'create_posts'
  | 'publish_posts'
  | 'manage_options'
  | 'edit_theme_options'
  | 'install_plugins'
  | 'upload_files'
  | 'view_site_health_checks'
  | 'update_php'
  | 'edit_dashboard'
  | 'manage_network'
  | 'edit_comment'
  | 'edit_post'
  | 'read_post'
  | string;

type DashboardContext = 'normal' | 'side' | 'column3' | 'column4';
type MetaboxPriority = 'high' | 'core' | 'default' | 'low';

interface DashboardWidget {
  id: string;
  title: string;                          // May contain HTML
  callback: (post: null, metabox: MetaboxArgs) => void;
  controlCallback?: ((post: null, metabox: MetaboxArgs) => void) | null;
  callbackArgs?: Record<string, unknown> | null;
  context: DashboardContext;
  priority: MetaboxPriority;
}

interface MetaboxArgs {
  id: string;
  title: string;
  callback: () => void;
  args: Record<string, unknown>;
}

interface DashboardScreen {
  id: 'dashboard';
  columns: 1 | 2 | 3 | 4;               // From user meta `screen_layout_dashboard`
  widgets: DashboardWidget[];
  hiddenWidgets: string[];                // From user meta `metaboxhidden_dashboard`
  widgetOrder: Record<DashboardContext, string[]>; // From user meta `meta-box-order_dashboard`
  closedWidgets: string[];                // From user meta `closedpostboxes_dashboard`
}

interface WelcomePanelState {
  // show_welcome_panel user meta value
  value: 0 | 1 | 2;
  // Computed from value + whether user email matches admin_email
  visible: boolean;
}

interface RightNowData {
  postCount: number;
  pageCount: number;
  commentCount: number;
  moderatedCommentCount: number;
  themeInfo: {
    name: string;
    version: string;
    link: string;
  };
  wordpressVersion: string;
  searchEnginesDiscouraged: boolean;
}

interface NetworkRightNowData {
  siteCount: number;
  userCount: number;
  canCreateSites: boolean;
  canCreateUsers: boolean;
}

interface ActivityPost {
  id: number;
  title: string;
  date: Date;
  editLink: string;
  permalink: string;
  canEdit: boolean;
}

interface ActivityComment {
  id: number;
  postId: number;
  postTitle: string;
  postUrl: string;
  authorName: string;
  authorUrl: string;
  authorEmail: string;
  content: string;
  status: 'approved' | 'unapproved' | 'spam' | 'trash';
  type: 'comment' | 'pingback' | 'trackback' | string;
  canEdit: boolean;
  actions: {
    approve?: string;
    unapprove?: string;
    reply?: string;
    edit?: string;
    spam?: string;
    trash?: string;
    delete?: string;
    view?: string;
  };
}

interface QuickDraftData {
  autoDraftPostId: number;
  recentDrafts: RecentDraft[];
}

interface RecentDraft {
  id: number;
  title: string;
  content: string;                       // Trimmed to ~10 words
  modifiedDate: Date;
  editLink: string;
}

interface CommunityEvent {
  type: 'meetup' | 'wordcamp' | string;
  title: string;
  url: string;
  location: {
    location: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  user_formatted_date: string;
  user_formatted_time?: string;
  timeZoneAbbreviation?: string;
}

interface CommunityEventsResponse {
  location: {
    description: string;
    latitude?: number;
    longitude?: number;
  };
  events: CommunityEvent[];
  error?: string;
}

interface DashboardWidgetOptions {
  // Stored in `dashboard_widget_options` site option
  [widgetId: string]: {
    url?: string;
    title?: string;
    items?: number;
    show_summary?: boolean;
    show_author?: boolean;
    show_date?: boolean;
    number?: number;
  };
}

// RSS widget cache
interface RSSWidgetCache {
  cacheKey: string;           // `dash_v2_{md5(widgetId + '_' + locale)}`
  ttl: number;                // 12 * 3600 seconds (12 hours)
  content: string;
}

// User meta keys for dashboard preferences
interface DashboardUserMeta {
  'show_welcome_panel': 0 | 1 | 2;
  'screen_layout_dashboard': 1 | 2 | 3 | 4;
  'metaboxhidden_dashboard': string[];   // Array of hidden widget IDs
  'meta-box-order_dashboard': Record<DashboardContext, string>;  // CSV of IDs per context
  'closedpostboxes_dashboard': string[]; // Array of collapsed widget IDs
  'dashboard_quick_press_last_post_id': number;
}
```

---

## Section 11: Design Patterns

### Metabox system

Every dashboard widget is implemented as a generic metabox. The same `add_meta_box()` function is used for both dashboard widgets and classic post editor panels. The dashboard simply passes the dashboard screen ID as the `$screen` argument. `do_meta_boxes($screen_id, $context, $post)` iterates registered metaboxes for the given screen and context and invokes each callback.

### Lazy RSS loading

The Events and News widget uses a two-pass loading strategy:
1. On page load (non-AJAX): if the feed transient is missing, render a `<p class="widget-loading">Loading...</p>` placeholder. The `dashboard` JavaScript then fires an AJAX request.
2. On AJAX request: the same page endpoint is called; `wp_doing_ajax()` returns true, the RSS feed is fetched, output is captured into a transient, and returned as the AJAX response body.

In TypeScript, this should be a lazy-fetch pattern: render a skeleton, fire a background request, replace with real content on success.

### Per-user persistence

Every dashboard preference — column count, widget visibility, widget order, collapsed state — is stored in `user meta`, not `site options`. This means preferences are per-user and per-site in a multisite network. The implementation should use a dedicated user preferences store keyed by user ID.

### Drag-and-drop ordering

Widget order is serialized as `normal=id1,id2&side=id3,id4&column3=&column4=` (the jQuery Sortable serialized form), then stored in user meta. On re-render, `get_user_meta()` is read to determine widget order. Within each context, widgets are sorted by their stored position, not by registration order.

### Conditional widget registration

Widgets are registered once at page load inside `wp_dashboard_setup()`. The function checks capabilities and environment flags inline — no deferred registration. In TypeScript, replicate this as a factory that receives the current user's capability set and returns only the appropriate widget descriptors.

### Control callback protocol

The "Configure" mechanism is a full page reload pattern: clicking "Configure" reloads the dashboard with `?edit={widget_id}` in the URL, which causes `wp_add_dashboard_widget()` to substitute `_wp_dashboard_control_callback` as the widget content callback, rendering the config form inside the widget body. Saving POSTs back to the same URL (without AJAX), saves the options to `dashboard_widget_options` site option, then redirects back to the dashboard without the `?edit` param.

### Nonce strategy

Three nonce fields are always printed on the dashboard page:
1. `meta-box-order-nonce` — for saving widget order changes via AJAX.
2. `closedpostboxesnonce` — for saving collapsed/expanded state via AJAX.
3. `welcomepanelnonce` — for saving the welcome panel dismiss action via AJAX.

Each nonce is seeded with a specific action string to prevent cross-action forgery.

## Section 12: Tovu Reconstruction Notes

### 12.1 Why this exists

This screen is the operator landing page. It gives a quick read on content, activity, system health, and news while also serving as a customizable widget grid for the current user.

### 12.2 What Tovu should preserve

- Per-user widget layout, visibility, and collapsed-state persistence
- A lightweight home screen that can show health, activity, and draft cues
- Lazy loading for external or slow widgets
- Capability-sensitive widget registration so the dashboard does not overexpose admin-only information

### 12.3 What Tovu can simplify

- Tovu does not need the exact metabox implementation if it can preserve draggable, configurable cards
- Legacy news/RSS widgets can become a single support/news feed service
- The welcome panel can be reduced to a one-time onboarding card

### 12.4 Possible Tovu seams

- `src/features/dashboard/` for the home screen and widget composition
- `src/core/ports/DashboardPreferencePort.ts` for layout and visibility persistence
- `src/core/ports/FeedFetchPort.ts` for delayed news/event content
- `src/core/ports/SystemStatusPort.ts` for health and activity cards

### 12.5 Suggested priority

- `V1`: widget layout persistence and core dashboard cards
- `Later`: welcome panel, external news feeds, and full WordPress widget parity
