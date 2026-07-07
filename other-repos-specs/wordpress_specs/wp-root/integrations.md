# Integration Entry Points — Specification

**Source files analyzed:**
- `wordpress/wp-comments-post.php`
- `wordpress/wp-cron.php`
- `wordpress/wp-mail.php`
- `wordpress/wp-links-opml.php`
- `wordpress/wp-trackback.php`
- `wordpress/xmlrpc.php`
- `wordpress/wp-includes/comment.php` (comment submission pipeline)
- `wordpress/wp-includes/class-wp-xmlrpc-server.php` (XML-RPC method registry)
- `wordpress/wp-includes/class-IXR.php` (Incutio XML-RPC library)
- `wordpress/wp-includes/class-pop3.php` (POP3 client)

---

## 1. Overview

WordPress exposes six non-admin, non-REST entry points that handle distinct integration concerns. Each file bootstraps WordPress independently and owns its own request/response lifecycle.

| File | Role | Method | Auth Required |
|---|---|---|---|
| `wp-comments-post.php` | Comment submission | POST only | No (cookies for logged-in users) |
| `wp-cron.php` | Scheduled task execution | GET (spawned internally) | No |
| `wp-mail.php` | Post-by-email ingestion | GET (externally triggered) | No (POP3 credentials in options) |
| `wp-links-opml.php` | OPML bookmark export | GET | No |
| `wp-trackback.php` | Incoming trackback/pingback receiver | POST (trackback) | No |
| `xmlrpc.php` | XML-RPC API + RSD discovery | POST (API) / GET (?rsd) | Per-request username+password |

### Shared Characteristics

All six files share a common bootstrap pattern:

1. Define any necessary pre-boot constants (`DOING_CRON`, `XMLRPC_REQUEST`, etc.).
2. Require `wp-load.php` to bootstrap the WordPress environment.
3. Handle their request, produce output or a redirect, and terminate.

None of these files rely on an authenticated session (cookies/session tokens) for their core function. The XML-RPC endpoint explicitly discards all cookies on entry.

### What Each Entry Point Does Not Do

- None of these files serve theme templates or run `the_loop`.
- None of these files are reached via the standard WordPress rewrite/routing system (`WP_Query`).
- None of these files are part of the WordPress REST API (`/wp-json/`).

---

## 2. Comment Submission (`wp-comments-post.php`)

### 2.1 Method Guard

The file immediately checks the HTTP request method before loading WordPress:

```
if ($_SERVER['REQUEST_METHOD'] !== 'POST'):
  header('Allow: POST')
  header('Content-Type: text/plain')
  status_header(405)
  exit
```

Any non-POST request receives HTTP 405 with an `Allow: POST` header and a plain-text body. WordPress is never loaded for non-POST requests.

### 2.2 Bootstrap

```
nocache_headers()            // Prevent any caching of submission responses
require wp-load.php
```

No-cache headers are sent before WordPress loads so they are always present regardless of any output buffering.

### 2.3 POST Fields

| Field | Required | Sanitization | Notes |
|---|---|---|---|
| `comment_post_ID` | Yes | `absint()` | Post to attach comment to |
| `author` | Conditional | `sanitize_text_field()` | Required when not logged in and `require_name_email` option is enabled |
| `email` | Conditional | `sanitize_email()` | Required when not logged in and `require_name_email` option is enabled |
| `url` | No | `sanitize_url()` | Commenter URL |
| `comment` | Yes | `wp_filter_post_kses()` | The comment body |
| `comment_parent` | No | `absint()` | Parent comment ID for threaded replies; defaults to 0 |
| `redirect_to` | No | `sanitize_url()` | Override redirect destination |
| `wp-comment-cookies-consent` | No | presence check | GDPR consent checkbox for author cookies |

All `$_POST` data is passed through `wp_unslash()` before processing.

### 2.4 Submission Pipeline

```
$comment = wp_handle_comment_submission(wp_unslash($_POST))
```

`wp_handle_comment_submission()` is defined in `wp-includes/comment.php` and performs the following in order:

1. **Post existence check** — verify `comment_post_ID` resolves to a real post.
2. **Post status check** — reject if post is `trash` (403), `draft` (403), or password-protected without a valid cookie (403).
3. **Comment open check** — reject if `comment_status` on the post is `closed`.
4. **Authentication** — if `$_COOKIE` contains a valid logged-in cookie, authenticate the user. Anonymous submissions remain unauthenticated.
5. **Required field validation** — if `require_name_email` site option is on and the user is not logged in, `author` and `email` must be non-empty; `email` must be a valid email format.
6. **Comment content validation** — `comment` field must be non-empty after stripping tags.
7. **Flood check** — enforce per-IP comment rate limit via `check_comment_flood_db()`.
8. **Duplicate check** — detect and silently suppress exact duplicate submissions.
9. **Spam check** — run registered spam-detection callbacks.
10. **Insert** — `wp_new_comment($commentdata, $wp_error = true)`.

Returns a `WP_Comment` object on success or a `WP_Error` on any failure.

### 2.5 Validation Rules Summary

| Rule | Error Code | HTTP Status |
|---|---|---|
| Post is in trash | `comment_on_trash` | 403 |
| Post is a draft | `comment_on_draft` | 403 |
| Post is password-protected | `comment_on_password_protected` | 403 |
| Comments closed on post | `comment_on_closed` | 403 |
| Missing required author name | `require_valid_comment` | 400 |
| Missing required email | `require_valid_comment` | 400 |
| Invalid email format | `require_valid_comment` | 400 |
| Comment body empty | `require_valid_comment` | 400 |
| Comment flood | `comment_flood` | 429 |
| Exact duplicate | `comment_duplicate` | 0 (silent) |
| Not logged in when required | `not_logged_in` | 403 |

The `status: 0` case (duplicate) results in a silent `exit` rather than any HTTP response. This is intentional to avoid giving bots confirmation that their submission was recognized.

### 2.6 Error Handling

```typescript
if (comment instanceof WP_Error) {
  const status = Number(comment.get_error_data());
  if (status !== 0) {
    wp_die(comment.get_error_message(), 'Comment Submission Failure', {
      response: status,
      back_link: true,
    });
  } else {
    exit(); // silent exit for duplicate/spam
  }
}
```

### 2.7 Cookie Setting

After a successful comment:

```
do_action('set_comment_cookies', $comment, $user, $cookies_consent)
```

`$cookies_consent` is `true` if `$_POST['wp-comment-cookies-consent']` is set (any value counts as consent).

The default handler sets three cookies when consent is given:

| Cookie Name | Value |
|---|---|
| `comment_author_{COOKIEHASH}` | Commenter name |
| `comment_author_email_{COOKIEHASH}` | Commenter email |
| `comment_author_url_{COOKIEHASH}` | Commenter URL |

`COOKIEHASH` is a site-specific hash derived from the site URL, used to namespace cookies and prevent cross-site leakage on shared domains.

When `$cookies_consent` is `false`, the default handler skips all cookie setting. The cookies action still fires — plugins may set their own cookies unconditionally.

### 2.8 Redirect on Success

The redirect URL is constructed in this order:

1. **Base URL:**
   - If `$_POST['redirect_to']` is set: use it, appended with `#comment-{comment_ID}`.
   - Otherwise: `get_comment_link($comment)` — the permalink to the comment anchor.

2. **Moderation query args** — appended only when ALL three conditions are true:
   - Commenter did not consent to cookies.
   - Comment status is `unapproved`.
   - Comment has an email address.

   When applied:
   ```
   ?unapproved={comment_ID}&moderation-hash={wp_hash(comment_date_gmt)}
   ```
   This allows the theme to display a "your comment is awaiting moderation" notice without relying on cookies.

3. **Filter:** `apply_filters('comment_post_redirect', $location, $comment)`

4. **Redirect:** `wp_safe_redirect($location)` then `exit`.

`wp_safe_redirect` validates the destination against the site's allowed hosts list before redirecting, preventing open redirect attacks.

### 2.9 Nonce Mechanism

`wp-comments-post.php` itself does not validate a nonce. Nonce validation is optional and applied by themes that choose to add a `_wpnonce` field to their comment form. The `pre_comment_on_post` action (fired in `wp_handle_comment_submission`) is the standard point for plugins to perform nonce or additional CSRF checks.

### 2.10 AJAX Differences

When a theme submits a comment form via AJAX (typically targeting the REST API endpoint `POST /wp-json/wp/v2/comments`), the `wp-comments-post.php` flow is not used. However, when JavaScript progressively enhances a regular HTML form that POSTs to `wp-comments-post.php`, the response is still a redirect — the client must follow it. Themes that intercept the XHR response to extract a success/failure state must parse the redirect location or HTTP status code rather than expecting a JSON body.

### 2.11 Hooks

| Hook | Type | Parameters | When |
|---|---|---|---|
| `set_comment_cookies` | action | `$comment, $user, $cookies_consent` | After successful submission, before redirect |
| `comment_post_redirect` | filter | `$location, $comment` | Final redirect URL; return modified URL |
| `pre_comment_on_post` | action | `$comment_post_ID` | Early in `wp_handle_comment_submission`; throw `WP_Error` to abort |

---

## 3. Pseudo-Cron (`wp-cron.php`)

### 3.1 Purpose

WordPress does not have access to a system cron daemon. Instead, it simulates cron by spawning a non-blocking HTTP request to `wp-cron.php` on every page load that has pending jobs. The file executes due events and returns immediately without blocking the originating browser request.

### 3.2 Pre-Boot Guards

Checked before `wp-load.php` is required:

```
if (!empty($_POST) || defined('DOING_AJAX') || defined('DOING_CRON')) die()
```

These guards prevent:
- A POST request accidentally triggering cron.
- A cron run spawning another cron run (re-entrancy).
- An AJAX request triggering cron as a side effect.

### 3.3 Pre-Boot Headers

Sent before WordPress loads:

```
Expires: Wed, 11 Jan 1984 05:00:00 GMT
Cache-Control: no-cache, must-revalidate, max-age=0
```

### 3.4 Response Flush (Fire-and-Forget)

To decouple cron execution from the HTTP response time:

```
if (function_exists('fastcgi_finish_request'))  fastcgi_finish_request()
elseif (function_exists('litespeed_finish_request'))  litespeed_finish_request()
```

When available, the response is sent to the client immediately and PHP continues executing in the background. On servers without these functions (e.g. Apache + mod_php), cron runs synchronously but the originating cron-spawning request has already received its response (the spawn is non-blocking at the HTTP client level).

### 3.5 `DOING_CRON` Constant

```php
define('DOING_CRON', true);
```

Set before loading WordPress. Used throughout the codebase to detect cron context. The pre-boot guard also checks this — if it is already defined, the file exits immediately to prevent nested cron execution.

### 3.6 Bootstrap

```php
if (!defined('ABSPATH')) {
    require_once __DIR__ . '/wp-load.php';
}
```

The `ABSPATH` guard allows the file to be safely included from within an already-bootstrapped WordPress environment (e.g. when WordPress spawns cron by including the file directly rather than spawning an HTTP request).

After bootstrap:

```
wp_raise_memory_limit('cron')
```

Attempts to increase the PHP memory limit for the duration of cron processing. The specific limit is controlled by the `cron_memory_limit` filter (default: the `WP_MAX_MEMORY_LIMIT` constant).

### 3.7 `DISABLE_WP_CRON`

When defined as `true` in `wp-config.php`, WordPress will not automatically spawn a cron HTTP request on page loads. This constant does **not** prevent `wp-cron.php` from executing when called directly — it only suppresses the automatic spawn via `wp_cron()`. Operators who set `DISABLE_WP_CRON` are expected to trigger `wp-cron.php` themselves using a real system cron job (e.g. `curl` or `wget` every minute).

### 3.8 `ALTERNATE_WP_CRON`

When defined as `true` in `wp-config.php`, WordPress spawns cron using a different mechanism: instead of a background HTTP request, it performs a late-page-load redirect. The current page finishes loading, then the redirect triggers a second load that runs cron. This mode exists for hosting environments where non-blocking HTTP requests to the same server fail (e.g. single-threaded servers, some shared hosting configurations).

### 3.9 Distributed Lock (Mutex)

Cron uses a transient-based mutex to prevent concurrent processes from running the same jobs simultaneously.

#### `_get_cron_lock()` — Internal

Reads the `doing_cron` transient while bypassing the local object cache (forces a fresh read from the backing store):

- External object cache present: `wp_cache_get('doing_cron', 'transient', true)` (the `true` force flag bypasses in-process cache).
- No external cache: direct SQL `SELECT option_value FROM options WHERE option_name = '_transient_doing_cron'`.

Returns the stored float timestamp string, or `0`/`false` if no lock exists.

#### Lock Acquisition

```typescript
const gmtTime = microtime(true);                         // high-precision float
const doingCronTransient = get_transient('doing_cron'); // existing lock value
```

Determining `$doing_wp_cron` (the value to compare against):

1. If the global `$doing_wp_cron` is already set (set by WordPress before spawning internally): use it.
2. Else if `$_GET['doing_wp_cron']` is set (externally-spawned request that pre-created the lock): use it.
3. Else (a fresh call with no pre-existing lock context):
   - If a lock exists AND `transient_value + WP_CRON_LOCK_TIMEOUT > gmtTime`: abort — another process holds a fresh lock. `return` with no output.
   - Otherwise: generate a new lock value as a 22-decimal-place float string: `sprintf('%.22F', microtime(true))`.
   - Store: `set_transient('doing_cron', $doing_wp_cron)` with no explicit TTL.

#### Lock Validation

After determining the expected lock value:

```
if (get_transient('doing_cron') !== $doing_wp_cron) return;
```

If the stored transient doesn't match, another process beat us to it.

#### Lock Release

After all jobs have run:

```
if (_get_cron_lock() === $doing_wp_cron) {
    delete_transient('doing_cron');
}
```

The re-check before deletion ensures we only delete our own lock, not a lock set by a concurrent process that started while we were running.

### 3.10 `WP_CRON_LOCK_TIMEOUT`

Default: `60` seconds. Configurable in `wp-config.php`. If a cron process holds the lock longer than this value without releasing it, the next spawned process is permitted to acquire it. This is the only safety valve against a hung cron process permanently blocking future runs.

### 3.11 Job Execution

#### Get Ready Jobs

```
$crons = wp_get_ready_cron_jobs()
```

Returns all scheduled events whose `timestamp ≤ current_gmt_time`, sorted by timestamp ascending.

Data structure:

```typescript
type ReadyCronJobs = {
  [timestamp: number]: {
    [hookName: string]: {
      [key: string]: {
        schedule: string | false;  // recurrence slug or false for one-time
        args: unknown[];
        interval?: number;         // seconds, for recurring jobs
      };
    };
  };
};
```

If empty: `die()` immediately with no output.

#### Execution Loop

For each `timestamp → hookName → key → job`:

1. If `timestamp > current_gmt_time`: `break` — remaining events are not yet due.
2. If `job.schedule` is truthy (recurring event):
   - Call `wp_reschedule_event(timestamp, schedule, hookName, args, true)`.
   - On `WP_Error`: log to `error_log()` and fire `do_action('cron_reschedule_event_error', error, hookName, args)`.
3. Call `wp_unschedule_event(timestamp, hookName, args, true)` — removes this specific occurrence.
   - On `WP_Error`: log and fire `do_action('cron_unschedule_event_error', error, hookName, args)`.
4. Call `do_action_ref_array(hookName, args)` — **executes the job**.
5. After each job: call `_get_cron_lock()`. If the result no longer matches `$doing_wp_cron`, another process has taken the lock — `return` immediately without processing remaining jobs.

The reschedule-before-unschedule ordering ensures that a recurring event is never lost: if the process dies between reschedule and unschedule, the event will be duplicated rather than lost. Deduplication of double-runs is the responsibility of the job handler.

### 3.12 Built-In Schedules

| Slug | Interval |
|---|---|
| `hourly` | 3,600 seconds |
| `twicedaily` | 43,200 seconds |
| `daily` | 86,400 seconds |
| `weekly` | 604,800 seconds |

Custom schedules registered via the `cron_schedules` filter.

### 3.13 Response Format

On success: no HTTP response body — `die()` after all jobs complete. HTTP 200 with an empty body is the expected response when cron runs are triggered via HTTP. When the file is included directly (not via HTTP), there is no HTTP response at all.

### 3.14 Hooks

| Hook | Type | Parameters | When |
|---|---|---|---|
| `cron_reschedule_event_error` | action | `$result, $hook, $args` | When `wp_reschedule_event` returns a `WP_Error` |
| `cron_unschedule_event_error` | action | `$result, $hook, $args` | When `wp_unschedule_event` returns a `WP_Error` |
| `cron_schedules` | filter | `$schedules` | Add custom recurrence intervals |
| `cron_memory_limit` | filter | `$limit` | Override memory limit raised for cron |

---

## 4. Post by Email (`wp-mail.php`)

### 4.1 Purpose

Polls a configured POP3 mailbox, reads unread messages, and creates WordPress posts from them. This is a legacy feature predating the REST API and modern integrations. It remains in core but is rarely used in production environments.

### 4.2 Configuration Options

| Option Key | Description |
|---|---|
| `mailserver_url` | POP3 server hostname |
| `mailserver_port` | POP3 port (typically 110 or 995 for SSL) |
| `mailserver_login` | POP3 username |
| `mailserver_pass` | POP3 password |
| `default_email_category` | Category ID assigned to posts created via email |
| `gmt_offset` | Site timezone offset, used when parsing `Date:` headers |
| `blog_charset` | Site character set, used for `iconv` charset conversion |

### 4.3 Entry Conditions

1. Load `wp-load.php`.
2. Check `enable_post_by_email_configuration` filter — if it returns false: respond with HTTP 403 and exit.
3. Check `mailserver_url` option — if empty or equal to `'mail.example.com'` (the placeholder value): respond with HTTP 403 and exit.
4. Fire `do_action('wp-mail.php')` — any callback attached here may take over the entire process. The action fires before any rate limiting or POP3 connection. If a plugin handles the action completely, it should `exit` from within the callback.

### 4.4 Rate Limiting

- Constant `WP_MAIL_INTERVAL` — default: `5 * MINUTE_IN_SECONDS` (300 seconds). Configurable in `wp-config.php`.
- Uses transient key `mailserver_last_checked`.
- If the transient exists (meaning the mailbox was checked within the interval): respond with HTTP 429 and a human-readable message indicating the remaining time. Exit.
- After passing the rate limit check: `set_transient('mailserver_last_checked', true, WP_MAIL_INTERVAL)` — blocks subsequent runs for the interval.

### 4.5 POP3 Connection

Uses the bundled `POP3` class from `wp-includes/class-pop3.php`.

```
$pop3 = new POP3()
$pop3->connect(mailserver_url, mailserver_port)  → bool
$pop3->user(mailserver_login)                    → bool
$pop3->pass(mailserver_pass)                     → int (message count) or false
```

On any connection or authentication failure: `wp_die(esc_html($pop3->ERROR))`.

If `$pop3->pass()` returns `false` or `0`: quit and `die('There doesn't seem to be any new mail.')`.

### 4.6 Email Processing Loop

The loop runs as unauthenticated (`wp_set_current_user(0)`) for the entire duration. This is critical: the post author is resolved from the email `From:` header, never from the current session.

For each message index `$i = 1` to `$count`:

#### Step 1 — Parse Headers

The raw message lines are scanned until a line shorter than 3 characters is encountered (signaling the header/body boundary):

| Header | Stored As | Notes |
|---|---|---|
| `Content-Type` | `$content_type`, `$charset` | MIME type and charset extracted |
| `Content-Transfer-Encoding` | `$content_transfer_encoding` | e.g., `quoted-printable`, `base64` |
| `Subject` | `$subject` | Decoded via `iconv_mime_decode()` if available, else `wp_iso_descrambler()` |
| `From` | `$author` | Extracted email address; overridden by `Reply-To` if present |
| `Reply-To` | `$author` | Takes precedence over `From:` |
| `Date` | `$post_date`, `$post_date_gmt` | Parsed with `strtotime()`; parenthesised timezone suffix stripped before parsing |

Everything after the header/body separator is accumulated into `$content`.

#### Step 2 — Determine Author

- Extract email address from `$author` string using a regex.
- `get_user_by('email', $email_address)` — attempt to match to a WordPress user.
- If found: `$post_author = user->ID`, `$author_found = true`.
- If not found: `$post_author = 1` (admin user), `$author_found = false`.

#### Step 3 — Determine Post Status

- If `$author_found` and the resolved user has `publish_posts` capability: `$post_status = 'publish'`.
- Otherwise: `$post_status = 'pending'`.

#### Step 4 — Process Multipart Body

If `Content-Type` is `multipart/alternative`:
- Split body by `--{boundary}`.
- Take the third segment (index 2) — this is the text/HTML part after the initial boundary header.
- If this segment itself contains `Content-Transfer-Encoding: quoted-printable`: split on that line and take the second part.
- Strip to allowed HTML tags: `<img>`, `<p>`, `<br>`, `<i>`, `<b>`, `<u>`, `<em>`, `<strong>`, `<strike>`, `<font>`, `<span>`, `<div>`.

Apply `wp_mail_original_content` filter to the raw content at this point.

#### Step 5 — Decode Content

- If `Content-Transfer-Encoding` contains `quoted-printable`: run `quoted_printable_decode($content)`.
- If `iconv` extension is available and `$charset` is set: `iconv($charset, blog_charset, $content)`.

#### Step 6 — Phone Delimiter Parsing

The `::` delimiter (a legacy feature from pre-smartphone era MMS/email-to-blog workflows) is processed:

```
$phone_delim = '::'
```

- Split `$content` on `::`.
- If a part after `::` exists: use it as `$post_content`; the part before `::` is a title candidate.
- Split `$subject` on `::`: use the first part as `$subject` (the post title fallback).

Apply `phone_content` filter to the final `$post_content`.

#### Step 7 — Determine Post Title

`xmlrpc_getposttitle($content)` — searches for `<title>...</title>` tags in the content. If found, use that as the title. Otherwise use `$subject`.

#### Step 8 — Insert Post

```typescript
const postData = {
  post_content: string,
  post_title: string,
  post_date: string,       // local datetime, formatted 'Y-m-d H:i:s'
  post_date_gmt: string,   // UTC datetime, formatted 'Y-m-d H:i:s'
  post_author: number,
  post_category: [get_option('default_email_category')],
  post_status: 'publish' | 'pending',
};
```

Data is passed through `wp_slash()` then `wp_insert_post($postData)`.

- On `WP_Error`: print error message and continue to the next email.
- On success: fire `do_action('publish_phone', $post_ID)`.

#### Step 9 — Delete from Server

`$pop3->delete($i)` — marks the message for deletion from the POP3 server.

- On failure: print error message, call `$pop3->reset()` (cancels all pending deletions for the session), and `exit`.
- On success: print `"Message {i} deleted."`.

### 4.7 Finalization

`$pop3->quit()` — issues the POP3 `QUIT` command, which finalizes all pending deletions and closes the connection.

### 4.8 External Trigger Requirement

`wp-mail.php` does not self-invoke. It must be triggered by one of:
- A real server-level cron job (`curl https://example.com/wp-mail.php` scheduled via `crontab`).
- A WordPress cron event that calls `wp_mail_retrieve_attachments()` or a custom wrapper.
- Direct HTTP request by an administrator.

WordPress does not automatically trigger post-by-email on page loads the way it triggers `wp-cron.php`.

### 4.9 Hooks

| Hook | Type | Parameters | Description |
|---|---|---|---|
| `enable_post_by_email_configuration` | filter | `$enabled` | Return `false` to disable the feature entirely |
| `wp-mail.php` | action | none | Fires before any processing; plugin may take over completely |
| `wp_mail_original_content` | filter | `$content` | Filter raw email body before decoding |
| `phone_content` | filter | `$content` | Filter final post content before insertion |
| `publish_phone` | action | `$post_ID` | Fires after post created from email |

---

## 5. OPML Export (`wp-links-opml.php`)

### 5.1 Purpose

Outputs an OPML 1.0 XML document containing the site's bookmarks — the legacy "Links" feature stored in the `wp_links` table under the `link_category` taxonomy. The file is a public GET endpoint with no authentication required.

### 5.2 Link Manager Gate

This endpoint is only useful when the Links/Bookmarks feature is active. If `get_option('link_manager_enabled')` returns false (which is the default in WordPress since 3.5), the output will contain an empty `<body>` with no `<outline>` elements. The file does not explicitly block access when the feature is disabled; it simply produces an empty document.

### 5.3 Bootstrap

```
require wp-load.php
header('Content-Type: text/xml; charset=' . get_option('blog_charset'))
```

The `Content-Type` header is set immediately after bootstrap. No authentication check is performed.

### 5.4 Query Parameter

| Parameter | Type | Description |
|---|---|---|
| `link_cat` | string or int | Filter to a specific link category. `'all'` or `'0'` = all categories. Any other value is treated as a category term ID via `absint(urldecode($_GET['link_cat']))`. |

If `link_cat` is absent, all link categories are included.

### 5.5 Output Format

```xml
<?xml version="1.0"?>
<opml version="1.0">
  <head>
    <title>Links for {bloginfo('name')}</title>
    <dateCreated>{date('D, d M Y H:i:s')} GMT</dateCreated>
    <!-- opml_head action fires here -->
  </head>
  <body>
    <outline type="category" title="{category_name}">
      <outline
        text="{link_name}"
        type="link"
        xmlUrl="{link_rss}"
        htmlUrl="{link_url}"
        updated="{link_updated}"
      />
      <!-- additional <outline type="link"> elements for each bookmark -->
    </outline>
    <!-- additional <outline type="category"> elements for each category -->
  </body>
</opml>
```

The `updated` attribute is omitted when `link_updated` is `'0000-00-00 00:00:00'`.

### 5.6 Data Sources

#### Categories

```
get_categories({
  taxonomy: 'link_category',
  hierarchical: 0,
  include: link_cat_id   // only when link_cat is a specific ID
})
```

The category name is passed through the `link_category` filter before being written to the `title` attribute.

#### Bookmarks (per Category)

```
get_bookmarks({ category: category_term_id })
```

Returns records from `wp_links` with these fields used:

| Field | OPML Attribute | Notes |
|---|---|---|
| `link_name` | `text` | Filtered through `link_title` filter |
| `link_rss` | `xmlUrl` | RSS/Atom feed URL for the bookmarked site |
| `link_url` | `htmlUrl` | The site's HTML home page URL |
| `link_updated` | `updated` | Omitted when value is `'0000-00-00 00:00:00'` |

### 5.7 Exact XML Structure

The document element hierarchy is:

```
opml[@version="1.0"]
  head
    title
    dateCreated
  body
    outline[@type="category", @title="{category}"]
      outline[@type="link", @text="{name}", @xmlUrl="{feed}", @htmlUrl="{url}", @updated="{date}"]
```

There is no `@version` on individual `<outline>` elements beyond the `type` attribute. The OPML version is declared only on the root `<opml>` element.

### 5.8 Hooks

| Hook | Type | Parameters | Description |
|---|---|---|---|
| `opml_head` | action | none | Fires inside `<head>` block, after `<dateCreated>` |
| `link_category` | filter | `$category_name` | Modify category name before output |
| `link_title` | filter | `$link_name` | Modify bookmark name/title before output |

---

## 6. Trackbacks (`wp-trackback.php`)

### 6.1 Purpose

Receives incoming trackback notifications from other blogs. A trackback is a notification sent by blog A to blog B when blog A publishes content that links to blog B. The notification is stored as a comment of type `'trackback'` on the target post.

Pingbacks differ from trackbacks: pingbacks use the XML-RPC protocol via `pingback.ping` (see Section 7.5), not this file.

### 6.2 Bootstrap

```
if (empty($wp)):
    require wp-load.php
    wp(['tb' => '1'])     // bootstrap WordPress with trackback query context
endif
wp_set_current_user(0)    // always unauthenticated
```

The `tb=1` query argument activates trackback-specific routing in `WP_Query`, allowing the trackback target post to be resolved from the URL.

### 6.3 Post ID Resolution

Two methods are tried in order:

1. **GET parameter:** If `$_GET['tb_id']` is present and non-empty, cast it to int and use it as `$post_id`.
2. **URI path:** If no `tb_id` in GET, split `$_SERVER['REQUEST_URI']` on `/` and take the last non-empty segment. Cast to int.

### 6.4 Input Parsing

All inputs come from `$_POST`:

| Field | Variable | Sanitization Applied |
|---|---|---|
| `url` | `$trackback_url` | `sanitize_url()` |
| `charset` | `$charset` | `sanitize_text_field()` |
| `title` | `$title` | `sanitize_text_field(wp_unslash(...))` |
| `excerpt` | `$excerpt` | `sanitize_textarea_field(wp_unslash(...))` |
| `blog_name` | `$blog_name` | `sanitize_text_field(wp_unslash(...))` |

### 6.5 Charset Handling

Charset validation and conversion is applied before any content processing:

1. Normalize `$charset`: strip commas and surrounding whitespace, convert to uppercase.
2. If `mb_list_encodings()` is available and the claimed charset is not in the list: discard `$charset` (set to empty).
3. If `$charset` is empty after normalization: use the fallback list `'ASCII, UTF-8, ISO-8859-1, JIS, EUC-JP, SJIS'`.
4. **Security check:** If `$charset` contains the string `UTF-7`: `die()` immediately. UTF-7 can be used for XSS via charset-sniffing attacks.
5. If `mb_convert_encoding()` is available: convert `$title`, `$excerpt`, and `$blog_name` from `$charset` to `blog_charset` option.
6. After conversion: re-apply `wp_slash()` because sanitize functions stripped the slashes that the rest of the system expects.

### 6.6 Validation Pipeline

Validations run in this order:

1. **Valid post ID:**
   ```
   if (!isset($post_id) || !(int)$post_id)
       trackback_response(1, 'I really need an ID for this to work.')
   ```

2. **Non-browser detection:**
   ```
   if (empty($title) && empty($trackback_url) && empty($blog_name))
       wp_redirect(get_permalink($post_id))
       exit
   ```
   This handles browsers navigating directly to a trackback URL — they receive a redirect to the post. It is not an error.

3. **Duplicate detection:**
   ```sql
   SELECT * FROM wp_comments
   WHERE comment_post_ID = {post_id}
   AND comment_author_url = {trackback_url}
   ```
   If found: `trackback_response(1, 'There is already a ping from that URL for this post.')`

4. **Pings open check:**
   ```
   if (!pings_open($post_id))
       trackback_response(1, 'Sorry, trackbacks are closed for this item.')
   ```
   `pings_open()` checks the `ping_status` meta on the post (`'open'` or `'closed'`).

Note that duplicate detection runs before the pings-open check. This ordering avoids leaking information about whether a post accepts pings to a sender whose URL is already in the system.

### 6.7 Content Truncation

Before insertion:
- `$title` → `wp_html_excerpt($title, 250, '…')` — truncated to 250 characters with HTML awareness.
- `$excerpt` → `wp_html_excerpt($excerpt, 252, '…')` — truncated to 252 characters.

### 6.8 Comment Insertion

```typescript
const commentData = {
  comment_post_ID: post_id,
  comment_author: blog_name,
  comment_author_email: '',    // always empty for trackbacks
  comment_author_url: trackback_url,
  comment_content: `<strong>${title}</strong>\n\n${excerpt}`,
  comment_type: 'trackback',
};
```

`wp_new_comment($commentData)` handles moderation, spam checks, and database insertion.

On `WP_Error`: `trackback_response(1, error_message)`.

### 6.9 Post-Insertion

After successful insertion:

```
do_action('trackback_post', $trackback_id)
trackback_response(0)    // success response
```

### 6.10 `trackback_response()` — Response Function

Outputs XML and terminates. Called for both success and failure.

**Error response:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<response>
  <error>1</error>
  <message>{error_message}</message>
</response>
```

**Success response:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<response>
  <error>0</error>
</response>
```

In both cases:
- `Content-Type: text/xml; charset={blog_charset}` header is set.
- Error responses call `die()` after output.
- The success response does not call `die()` — execution continues (though nothing follows the call in practice).

### 6.11 Pingback Differences

Pingbacks use the XML-RPC `pingback.ping` method, not `wp-trackback.php`. Key differences:

| Aspect | Trackback | Pingback |
|---|---|---|
| Protocol | Custom POST to `wp-trackback.php` | XML-RPC POST to `xmlrpc.php` |
| Discovery | Trackback URL embedded in post HTML | Pingback URL in HTTP `X-Pingback` header or HTML `<link>` tag |
| Authentication | None | None |
| Content | Sender provides title, excerpt, blog name | WordPress auto-fetches title from the linking page |
| Response | Custom XML (`<error>0</error>`) | XML-RPC method response |

### 6.12 Hooks

| Hook | Type | Parameters | When |
|---|---|---|---|
| `pre_trackback_post` | action | `$post_id, $trackback_url, $charset, $title, $excerpt, $blog_name` | Before insertion, after validation |
| `trackback_post` | action | `$trackback_id` | After successful insertion |

---

## 7. XML-RPC API (`xmlrpc.php`)

### 7.1 Two Operating Modes

`xmlrpc.php` handles two distinct request types:

| Mode | Trigger | Response |
|---|---|---|
| RSD discovery | `GET /xmlrpc.php?rsd` | XML (RSD document), then `exit` |
| XML-RPC API | `POST /xmlrpc.php` | XML (method response or fault) |

### 7.2 Entry Conditions

These steps happen in order before any mode-specific processing:

1. `define('XMLRPC_REQUEST', true)` — signals to the rest of WordPress that this is an XML-RPC request. Checked by various subsystems.
2. `$_COOKIE = []` — discard all cookies before WordPress loads. This is a security measure: XML-RPC must never authenticate via session cookies. Authentication is per-request via username+password.
3. Read raw POST body into `$HTTP_RAW_POST_DATA` as a compatibility shim for PHP < 7.0 (which did not populate `php://input` reliably).
4. Trim leading whitespace from `$HTTP_RAW_POST_DATA` — some clients send whitespace before the `<?xml` declaration.
5. `require wp-load.php`.

### 7.3 `xmlrpc_enabled` Filter

```php
apply_filters('xmlrpc_enabled', true)
```

This filter is checked at the start of every non-pingback method call. If it returns false:

- All `wp.*`, `blogger.*`, `metaWeblog.*`, and `mt.*` methods return an `IXR_Error(405, 'XML-RPC services are disabled on this site.')`.
- `pingback.ping` and `pingback.extensions.getPingbacks` are exempt — pingbacks continue to work even when XML-RPC is disabled for other methods.

### 7.4 `XMLRPC_REQUEST` Constant

When `XMLRPC_REQUEST` is defined as `true`, WordPress suppresses certain behaviors that would be inappropriate in an API context:

- Admin notices are suppressed.
- Redirect loops that would occur during login are avoided.
- Some plugin compatibility checks behave differently.

### 7.5 Server Class Selection

```php
$wp_xmlrpc_server_class = apply_filters('wp_xmlrpc_server_class', 'wp_xmlrpc_server');
$wp_xmlrpc_server = new $wp_xmlrpc_server_class();
$wp_xmlrpc_server->serve_request();
exit;
```

The `wp_xmlrpc_server_class` filter allows the entire server to be replaced with a custom class. The custom class must expose a `serve_request()` method. This is an escape hatch for complete XML-RPC replacement.

### 7.6 `WP_XMLRPC_Server` Class

Defined in `wp-includes/class-wp-xmlrpc-server.php`. Extends `IXR_Server` from the Incutio XML-RPC Library (`wp-includes/class-IXR.php`).

The class registers all supported methods in its constructor by populating `$this->methods`, a map from method name string to a PHP callable (typically a method on `$this`). This map is passed through the `xmlrpc_methods` filter before the server is initialized, allowing plugins to add or remove methods.

```php
$this->methods = apply_filters('xmlrpc_methods', $this->methods);
```

#### Authentication

Every privileged method calls `$this->login($username, $password)`. The `$username` and `$password` parameters are extracted from the XML-RPC method call parameters by each method handler — they are always the first two parameters for authenticated methods.

`login()` calls `wp_authenticate($username, $password)`. On failure:
- Fires `do_action('xmlrpc_login_error', $error, $user)`.
- Returns `IXR_Error(403, 'Incorrect username or password.')`.

On success: calls `wp_set_current_user($user->ID)` and returns the `WP_User` object.

Application Passwords (introduced in WordPress 5.6) are also accepted. When the `Authorization: Basic` HTTP header is present, WordPress checks whether the password is an Application Password and validates it accordingly, without requiring the old `PHP_AUTH_USER`/`PHP_AUTH_PW` server variables.

#### `IXR_Error` Codes

| Code | Meaning |
|---|---|
| 403 | Authentication failure or permission denied |
| 404 | Post, comment, term, or media item not found |
| 405 | XML-RPC disabled; or invalid method |
| 500 | Internal server error during operation |
| 401 | Unauthorized (used for capability checks) |

### 7.7 WordPress API (`wp.*`)

All `wp.*` methods require authentication. Parameters are passed as an XML-RPC struct (associative array). Methods return structs or arrays of structs.

#### Post Methods

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `wp.getUsersBlogs` | `username, password` | `array<BlogInfo>` | Returns blogs the user belongs to (multisite-aware) |
| `wp.getPost` | `blog_id, username, password, post_id, fields?` | `Post` | Fetch a single post by ID |
| `wp.getPosts` | `blog_id, username, password, filter?` | `array<Post>` | Fetch multiple posts; `filter` supports `post_type`, `post_status`, `number`, `offset`, `orderby`, `order` |
| `wp.newPost` | `blog_id, username, password, content` | `post_id` string | Create a new post; `content` is a struct of post fields |
| `wp.editPost` | `blog_id, username, password, post_id, content` | `true` | Update an existing post |
| `wp.deletePost` | `blog_id, username, password, post_id` | `true` | Delete (trash) a post |
| `wp.getPostType` | `blog_id, username, password, post_type_name, fields?` | `PostType` | Get metadata for a registered post type |
| `wp.getPostTypes` | `blog_id, username, password, filter?, fields?` | `array<PostType>` | List all registered post types |
| `wp.getPostFormats` | `blog_id, username, password, filter?` | `array<string>` | Get supported post formats |
| `wp.getPostStatusList` | `blog_id, username, password` | `array<string>` | Get all registered post status slugs |

#### Taxonomy and Term Methods

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `wp.getTaxonomy` | `blog_id, username, password, taxonomy` | `Taxonomy` | Get metadata for a registered taxonomy |
| `wp.getTaxonomies` | `blog_id, username, password, filter?, fields?` | `array<Taxonomy>` | List all registered taxonomies |
| `wp.getTerm` | `blog_id, username, password, taxonomy, term_id` | `Term` | Fetch a single term |
| `wp.getTerms` | `blog_id, username, password, taxonomy, filter?` | `array<Term>` | Fetch terms from a taxonomy |
| `wp.newTerm` | `blog_id, username, password, content` | `term_id` string | Create a new taxonomy term |
| `wp.editTerm` | `blog_id, username, password, term_id, content` | `true` | Update a term |
| `wp.deleteTerm` | `blog_id, username, password, taxonomy, term_id` | `true` | Delete a term |

#### Comment Methods

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `wp.getComment` | `blog_id, username, password, comment_id` | `Comment` | Fetch a single comment |
| `wp.getComments` | `blog_id, username, password, filter?` | `array<Comment>` | Fetch multiple comments; `filter` supports `post_id`, `status`, `number`, `offset` |
| `wp.newComment` | `blog_id, username, password, post_id, comment` | `comment_id` int | Create a new comment |
| `wp.editComment` | `blog_id, username, password, comment_id, comment` | `true` | Update a comment |
| `wp.deleteComment` | `blog_id, username, password, comment_id` | `true` | Delete a comment |
| `wp.getCommentStatusList` | `blog_id, username, password` | `struct<string>` | Map of status slugs to display names |
| `wp.getCommentCount` | `blog_id, username, password, post_id` | `CommentCount` | Count of comments by status for a post |

#### Options Methods

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `wp.getOptions` | `blog_id, username, password, options?` | `struct` | Fetch site options; `options` is an array of option keys to fetch (all if omitted) |
| `wp.setOptions` | `blog_id, username, password, options` | `struct` | Update site options; returns updated values |

Settable options are a curated subset (e.g. `software_name`, `blog_title`, `blog_tagline`, `date_format`, `time_format`, `users_can_register`). Not all options can be set via XML-RPC.

#### Media Methods

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `wp.getMediaItem` | `blog_id, username, password, attachment_id` | `MediaItem` | Fetch a media attachment |
| `wp.getMediaLibrary` | `blog_id, username, password, filter?` | `array<MediaItem>` | List media items; `filter` supports `parent_id`, `mime_type`, `number`, `offset` |
| `wp.uploadFile` | `blog_id, username, password, data` | `UploadResult` | Upload a file; `data` struct contains `name`, `type`, `bits` (base64), `overwrite?` |

#### Page Methods

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `wp.getPage` | `blog_id, username, password, page_id` | `Page` | Fetch a single page |
| `wp.getPages` | `blog_id, username, password, num_pages?` | `array<Page>` | Fetch pages |
| `wp.newPage` | `blog_id, username, password, content, publish` | `page_id` string | Create a new page |
| `wp.editPage` | `blog_id, username, password, page_id, content, publish` | `true` | Update a page |
| `wp.deletePage` | `blog_id, username, password, page_id` | `true` | Delete a page |

#### User Methods

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `wp.getAuthors` | `blog_id, username, password` | `array<Author>` | List users with `edit_posts` capability |
| `wp.getCategories` | `blog_id, username, password` | `array<Category>` | List all `category` terms (shorthand; equivalent to `wp.getTerms` for `category` taxonomy) |
| `wp.getTags` | `blog_id, username, password` | `array<Tag>` | List all `post_tag` terms |
| `wp.suggestCategories` | `blog_id, username, password, category, max_results` | `array<Category>` | Search category names (for autocomplete) |
| `wp.getUser` | `blog_id, username, password, user_id, fields?` | `User` | Fetch a single user |
| `wp.getUsers` | `blog_id, username, password, filter?, fields?` | `array<User>` | List users; `filter` supports `role`, `who`, `number`, `offset`, `orderby`, `order` |
| `wp.getProfile` | `blog_id, username, password, fields?` | `User` | Fetch the authenticated user's own profile |
| `wp.editProfile` | `blog_id, username, password, content` | `true` | Update the authenticated user's own profile |

### 7.8 Blogger API (`blogger.*`)

The Blogger API is a legacy compatibility layer. All methods authenticate with `appkey` (ignored), `blogid` (ignored — WordPress always uses `1`), `username`, and `password`.

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `blogger.getUsersBlogs` | `appkey, username, password` | `array<BlogInfo>` | List blogs the user belongs to |
| `blogger.getUserInfo` | `appkey, username, password` | `UserInfo` | Get basic info about the authenticated user |
| `blogger.getPost` | `appkey, postid, username, password` | `Post` | Fetch a single post |
| `blogger.getRecentPosts` | `appkey, blogid, username, password, numberOfPosts` | `array<Post>` | Fetch recent posts |
| `blogger.newPost` | `appkey, blogid, username, password, content, publish` | `post_id` string | Create a post |
| `blogger.editPost` | `appkey, postid, username, password, content, publish` | `true` | Update a post |
| `blogger.deletePost` | `appkey, postid, username, password, publish` | `true` | Delete a post |

### 7.9 MetaWeblog API (`metaWeblog.*`)

The MetaWeblog API extends the Blogger API with richer post content and media upload support.

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `metaWeblog.newPost` | `blogid, username, password, content, publish` | `post_id` string | Create a post; `content` is a struct with `title`, `description`, `categories`, `mt_keywords`, etc. |
| `metaWeblog.editPost` | `postid, username, password, content, publish` | `true` | Update a post |
| `metaWeblog.getPost` | `postid, username, password` | `Post` | Fetch a single post |
| `metaWeblog.getRecentPosts` | `blogid, username, password, numberOfPosts` | `array<Post>` | Fetch recent posts |
| `metaWeblog.getCategories` | `blogid, username, password` | `array<Category>` | List all categories |
| `metaWeblog.newMediaObject` | `blogid, username, password, data` | `UploadResult` | Upload a media file; `data` is a struct with `name`, `type`, `bits` (base64) |
| `metaWeblog.getTemplate` | `appkey, blogid, username, password, templateType` | `string` | Not implemented; returns empty string |
| `metaWeblog.setTemplate` | `appkey, blogid, username, password, template, templateType` | `true` | Not implemented; returns false |

The `content` struct accepted by `newPost`/`editPost` supports the following fields:

| Field | Description |
|---|---|
| `title` | Post title |
| `description` | Post body (HTML) |
| `mt_excerpt` | Post excerpt |
| `mt_text_more` | Extended body (appended after `<!--more-->`) |
| `wp_slug` | Post slug |
| `wp_password` | Post password |
| `wp_page_parent_id` | Parent page ID (for pages) |
| `wp_author_id` | Author user ID |
| `post_status` | `publish`, `draft`, `pending`, `private` |
| `categories` | Array of category names |
| `mt_keywords` | Comma-separated tags |
| `dateCreated` | ISO 8601 datetime |
| `enclosure` | Struct: `url`, `length`, `type` — sets `enclosure` post meta |
| `wp_post_thumbnail` | Attachment ID for featured image |

### 7.10 MovableType API (`mt.*`)

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `mt.getRecentPostTitles` | `blogid, username, password, numberOfPosts` | `array<{postid, title, dateCreated, userid}>` | Titles only, no body |
| `mt.getCategoryList` | `blogid, username, password` | `array<{categoryId, categoryName}>` | All categories |
| `mt.getPostCategories` | `postid, username, password` | `array<Category>` | Categories assigned to a post |
| `mt.setPostCategories` | `postid, username, password, categories` | `true` | Replace categories on a post |
| `mt.supportedMethods` | none | `array<string>` | All registered XML-RPC method names |
| `mt.supportedTextFilters` | `username, password` | `array<{key, label}>` | Registered content filters (typically empty) |
| `mt.getTrackbackPings` | `postid` | `array<{pingTitle, pingURL, pingIP}>` | Trackback comments on a post |
| `mt.publishPost` | `postid, username, password` | `true` | Publish a post (set status to `publish`) |

### 7.11 Pingback (`pingback.*`)

These two methods handle cross-blog link notifications. They are exempt from the `xmlrpc_enabled` filter and continue to function even when XML-RPC is otherwise disabled.

#### `pingback.ping`

**Parameters:** `sourceURI` (string), `targetURI` (string)

**Flow:**

1. Validate `targetURI` resolves to a post on this blog.
2. Fetch `sourceURI` to verify it actually links to `targetURI` (HTTP GET with a WordPress user-agent; 60-second timeout).
3. Extract the page title from the fetched HTML `<title>` tag.
4. Check for existing pingback from the same `sourceURI` on the same post.
5. Check `pings_open($post_id)`.
6. Insert as a comment with `comment_type = 'pingback'`, `comment_author_url = sourceURI`, `comment_content = [title of source page]`.

**Returns:** On success, the `sourceURI`. On failure, an `IXR_Error` with an appropriate fault code.

**Pingback Fault Codes:**

| Code | Meaning |
|---|---|
| 0 | Generic error |
| 16 | Source URI does not exist |
| 17 | Source URI does not contain a link to target |
| 32 | Target URI does not exist or is not a valid post |
| 33 | Target URI cannot be used as a pingback target |
| 48 | Ping already registered |
| 49 | Access denied |
| 50 | Server error |

#### `pingback.extensions.getPingbacks`

**Parameters:** `post_URI` (string)

**Returns:** An array of URIs that have pinged the post at `post_URI`. Reads from `wp_comments` where `comment_type = 'pingback'` for the resolved post.

### 7.12 System Methods (`system.*`)

These methods are implemented by the underlying IXR library, not by `WP_XMLRPC_Server` directly:

| Method | Description |
|---|---|
| `system.multicall` | Execute multiple method calls in a single HTTP request; returns an array of responses |
| `system.listMethods` | Return all registered method names |
| `system.getCapabilities` | Return a struct describing XML-RPC capabilities |

### 7.13 `xmlrpc_methods` Filter

```php
apply_filters('xmlrpc_methods', $methods)
```

Fired in the `WP_XMLRPC_Server` constructor before the method map is finalized. Plugins use this to:

- Add new methods: `$methods['mynamespace.myMethod'] = [$this, 'my_method']`.
- Remove existing methods: `unset($methods['system.multicall'])`.
- Replace a method handler: `$methods['wp.newPost'] = 'my_custom_new_post'`.

The filter is the canonical extension point for the XML-RPC API.

### 7.14 Hooks (XML-RPC)

| Hook | Type | Parameters | Description |
|---|---|---|---|
| `xmlrpc_rsd_apis` | action | none | Fires inside `<apis>` block of the RSD document; add `<api>` elements |
| `wp_xmlrpc_server_class` | filter | `$class_name` | Replace the server class; return a class name string |
| `xmlrpc_enabled` | filter | `$enabled` | Return `false` to disable all non-pingback methods |
| `xmlrpc_login_error` | action | `$error, $user` | Fires on authentication failure |
| `xmlrpc_call` | action | `$method_name` | Fires at the start of each method call |
| `xmlrpc_call_success_{method}` | action | varies | Fires after a successful method execution; hook name uses `.` replaced with `_` |
| `xmlrpc_methods` | filter | `$methods` | Add/remove/replace methods before server initialization |
| `xmlrpc_prepare_post` | filter | `$post_data, $post, $fields` | Modify post struct before returning to client |
| `xmlrpc_prepare_comment` | filter | `$comment_data, $comment` | Modify comment struct before returning |
| `xmlrpc_prepare_user` | filter | `$user_data, $user, $fields` | Modify user struct before returning |
| `xmlrpc_prepare_term` | filter | `$term_data, $term, $taxonomy` | Modify term struct before returning |
| `xmlrpc_prepare_media_item` | filter | `$media_data, $attachment, $fields` | Modify media item struct before returning |
| `xmlrpc_prepare_page` | filter | `$page_data, $post` | Modify page struct before returning |

---

## 8. RSD Discovery

### 8.1 Purpose

Really Simple Discovery (RSD) is an XML format that tells API clients which remote publishing APIs a blog supports and where those endpoints are located. It is linked from the `<head>` of every WordPress page via:

```html
<link rel="EditURI" type="application/rsd+xml" title="RSD" href="https://example.com/xmlrpc.php?rsd" />
```

### 8.2 Trigger

`GET /xmlrpc.php?rsd` — the presence of the `rsd` key in `$_GET` (any value, including empty) triggers RSD mode.

### 8.3 Response Format

```
Content-Type: text/xml; charset={blog_charset}
```

```xml
<?xml version="1.0" encoding="{blog_charset}"?>
<rsd version="1.0" xmlns="http://archipelago.phrasewise.com/rsd">
  <service>
    <engineName>WordPress</engineName>
    <engineLink>https://wordpress.org/</engineLink>
    <homePageLink>{site_url()}</homePageLink>
    <apis>
      <api name="WordPress"    blogID="1" preferred="true"  apiLink="{xmlrpc_url}" />
      <api name="Movable Type" blogID="1" preferred="false" apiLink="{xmlrpc_url}" />
      <api name="MetaWeblog"   blogID="1" preferred="false" apiLink="{xmlrpc_url}" />
      <api name="Blogger"      blogID="1" preferred="false" apiLink="{xmlrpc_url}" />
      <!-- xmlrpc_rsd_apis action fires here -->
    </apis>
  </service>
</rsd>
```

`{xmlrpc_url}` is `site_url('/xmlrpc.php')`.

After output: `exit`.

### 8.4 `xmlrpc_rsd_apis` Action

Plugins that add their own XML-RPC namespaces hook `xmlrpc_rsd_apis` to add `<api>` elements inside `<apis>`. The action fires with no parameters; plugins use `echo` directly to output additional `<api>` elements.

### 8.5 `rsd_apis` Filter

Separate from the action, `apply_filters('rsd_apis', $apis)` can be used by plugins that want to modify the `$apis` array before the XML is rendered — but this is secondary to the direct-echo action pattern.

---

## 9. Security Model

### 9.1 Per-Endpoint Security Summary

| Endpoint | Auth Model | CSRF Protection | Session Cookies Used | Input Sanitization |
|---|---|---|---|---|
| `wp-comments-post.php` | Optional (logged-in users via cookie) | Optional nonce via `pre_comment_on_post` action | Yes, for logged-in user resolution | `wp_unslash` + per-field sanitizers |
| `wp-cron.php` | None | `DOING_CRON` constant guard + transient mutex | No | N/A |
| `wp-mail.php` | POP3 credentials in DB options | Rate limit transient | No | Per-field; `wp_slash` after iconv |
| `wp-links-opml.php` | None | None | No | URL decode + `absint` for `link_cat` |
| `wp-trackback.php` | None | None | No | Per-field sanitizers + charset validation |
| `xmlrpc.php` | Username+password per request | Cookies explicitly discarded | No | IXR library parsing + per-method validation |

### 9.2 Comment Submission Security

- **Method enforcement:** HTTP 405 for non-POST. This prevents cross-site GET-based CSRF (browsers follow redirects from GET, but not from POST).
- **`wp_safe_redirect`:** The redirect destination is validated against the site's allowed host list. An attacker cannot inject a `redirect_to` that sends the user to an external domain.
- **No nonce by default:** WordPress does not require a nonce on comment submission out of the box. Themes that need CSRF protection on comments must add `<?php wp_nonce_field('...') ?>` to their comment form and validate in `pre_comment_on_post`.
- **Silent exit on duplicate:** The `status: 0` code path exits silently to avoid providing bots with signal about whether their content was recognized.
- **Cookie consent gating:** The `wp-comment-cookies-consent` field prevents setting identifying cookies without explicit user action, supporting GDPR compliance.

### 9.3 Cron Security

- **No unauthenticated data accepted:** The only accepted input is the `doing_wp_cron` GET parameter, which is a float timestamp. It is never executed or evaluated as code.
- **Transient mutex:** Prevents concurrent job execution without requiring a database lock. The float-precision timestamp used as the lock key has sufficient entropy to avoid accidental collisions.
- **`DOING_CRON` guard:** Prevents re-entrant execution.
- **Memory limit raise:** Cron is allowed to use more memory than a normal page load, but this is controlled by a WordPress filter, not arbitrary input.

### 9.4 Post-by-Email Security

- **Mailserver credential validation:** The `mailserver_url` placeholder check prevents accidental use of unconfigured credentials.
- **Rate limiting:** The transient-based rate limit prevents mailbox hammering if the endpoint is called frequently.
- **Unauthenticated execution:** `wp_set_current_user(0)` ensures no privilege escalation from POP3 content. The post author is resolved from the `From:` header email address, not from any session.
- **`enable_post_by_email_configuration` filter:** Provides a single point of disablement for the feature.

### 9.5 OPML Export Security

- **Public by design:** No authentication. The link list is considered publicly available information.
- **No user-generated content execution:** The output is XML-encoded bookmark data from the database. Values pass through the `link_category` and `link_title` filters where plugins can sanitize further.
- **`link_cat` sanitization:** The query parameter is decoded and passed through `absint()`, preventing SQL injection or path traversal.

### 9.6 Trackback Security

- **UTF-7 rejection:** The most critical trackback security rule. If the `charset` claim contains `UTF-7`, the request is immediately terminated before any content is processed. UTF-7 encoding can bypass HTML sanitizers and enable XSS via charset sniffing.
- **Unauthenticated execution:** Always runs as user 0.
- **Duplicate detection before pings_open:** Avoids information leakage. A sender who has already pinged cannot learn whether pings are still open.
- **Content truncation:** Title and excerpt are hard-capped at 250/252 characters to prevent database issues from oversized input.

### 9.7 XML-RPC Security

- **Cookie discarding:** `$_COOKIE = []` at entry. Session tokens are completely ignored. Every request must provide credentials.
- **Per-request authentication:** `login()` is called inside every authenticated method handler. There is no session state between XML-RPC calls.
- **`xmlrpc_enabled` filter:** Provides a single point of disablement for the entire API (except pingbacks).
- **Application Password support:** Allows per-application credentials that can be individually revoked, without exposing the user's main password.
- **`XMLRPC_REQUEST` constant:** Signals to the rest of WordPress that behavior should be adapted for the API context.

---

## 10. Key Hooks and Filters

### 10.1 `wp-comments-post.php` Hooks

| Hook | Type | Signature | Notes |
|---|---|---|---|
| `set_comment_cookies` | action | `(WP_Comment $comment, WP_User $user, bool $consent)` | Set or skip author identity cookies |
| `comment_post_redirect` | filter | `(string $url, WP_Comment $comment) → string` | Modify final redirect URL |
| `pre_comment_on_post` | action | `(int $post_id)` | Fired in submission pipeline; throw `WP_Error` to abort |

### 10.2 `wp-cron.php` Hooks

| Hook | Type | Signature | Notes |
|---|---|---|---|
| `cron_schedules` | filter | `(array $schedules) → array` | Add custom recurrence intervals; each entry: `[interval, display]` |
| `cron_memory_limit` | filter | `(string $limit) → string` | Override PHP memory limit for cron context |
| `cron_reschedule_event_error` | action | `(WP_Error $result, string $hook, array $args)` | Log or alert on reschedule failure |
| `cron_unschedule_event_error` | action | `(WP_Error $result, string $hook, array $args)` | Log or alert on unschedule failure |

### 10.3 `wp-mail.php` Hooks

| Hook | Type | Signature | Notes |
|---|---|---|---|
| `enable_post_by_email_configuration` | filter | `(bool $enabled) → bool` | Return `false` to disable the feature |
| `wp-mail.php` | action | `()` | Fires before processing; plugin may `exit` to take over |
| `wp_mail_original_content` | filter | `(string $content) → string` | Filter raw email body |
| `phone_content` | filter | `(string $content) → string` | Filter final post content |
| `publish_phone` | action | `(int $post_id)` | Fires after post creation from email |

### 10.4 `wp-links-opml.php` Hooks

| Hook | Type | Signature | Notes |
|---|---|---|---|
| `opml_head` | action | `()` | Output additional `<head>` elements in the OPML document |
| `link_category` | filter | `(string $name) → string` | Modify category name before output |
| `link_title` | filter | `(string $name) → string` | Modify bookmark title before output |

### 10.5 `wp-trackback.php` Hooks

| Hook | Type | Signature | Notes |
|---|---|---|---|
| `pre_trackback_post` | action | `(int $post_id, string $url, string $charset, string $title, string $excerpt, string $blog_name)` | Before insertion, after all validation |
| `trackback_post` | action | `(int $trackback_id)` | After successful insertion; `$trackback_id` is the new comment ID |

### 10.6 `xmlrpc.php` Hooks

| Hook | Type | Signature | Notes |
|---|---|---|---|
| `xmlrpc_rsd_apis` | action | `()` | Output `<api>` elements inside RSD `<apis>` block |
| `wp_xmlrpc_server_class` | filter | `(string $class) → string` | Replace the XML-RPC server implementation class |
| `xmlrpc_enabled` | filter | `(bool $enabled) → bool` | Disable all non-pingback methods when returning `false` |
| `xmlrpc_methods` | filter | `(array $methods) → array` | Add/remove/replace method handlers |
| `xmlrpc_login_error` | action | `(WP_Error $error, WP_User|WP_Error $user)` | Fires on authentication failure |
| `xmlrpc_call` | action | `(string $method)` | Fires at start of every method call |
| `xmlrpc_call_success_{method}` | action | varies | Fires after successful method execution |
| `xmlrpc_prepare_post` | filter | `(array $data, WP_Post $post, array $fields) → array` | Modify post struct before returning to client |
| `xmlrpc_prepare_comment` | filter | `(array $data, WP_Comment $comment) → array` | Modify comment struct |
| `xmlrpc_prepare_user` | filter | `(array $data, WP_User $user, array $fields) → array` | Modify user struct |
| `xmlrpc_prepare_term` | filter | `(array $data, object $term, string $taxonomy) → array` | Modify term struct |
| `xmlrpc_prepare_media_item` | filter | `(array $data, WP_Post $attachment, array $fields) → array` | Modify media item struct |
| `xmlrpc_prepare_page` | filter | `(array $data, WP_Post $post) → array` | Modify page struct |

---

## 11. TypeScript Interface Sketch

```typescript
// ============================================================
// Comment Submission
// ============================================================

interface CommentSubmissionRequest {
  commentPostId: number;
  author?: string;         // required if not logged in and require_name_email option is on
  email?: string;          // required if not logged in and require_name_email option is on
  url?: string;
  comment: string;
  commentParent?: number;  // default 0
  redirectTo?: string;
  cookiesConsent?: boolean;
}

type CommentErrorCode =
  | 'comment_on_trash'
  | 'comment_on_draft'
  | 'comment_on_password_protected'
  | 'comment_on_closed'
  | 'comment_flood'
  | 'require_valid_comment'
  | 'duplicate_comment'   // status 0 → silent exit
  | 'not_logged_in';

interface CommentSubmissionError {
  code: CommentErrorCode;
  message: string;
  httpStatus: number;      // 0 = silent exit, no response
}

interface CommentSubmissionResult {
  comment: {
    id: number;
    status: 'approved' | 'unapproved' | 'spam';
    dateGmt: string;
    postId: number;
  };
  redirectUrl: string;
}

// ============================================================
// Cron Execution
// ============================================================

interface CronJob {
  hook: string;
  args: unknown[];
  schedule: string | false;  // recurrence slug or false for one-time
  interval?: number;          // seconds, present when schedule is truthy
  timestamp: number;          // unix timestamp (seconds)
}

interface CronExecutionContext {
  gmtTime: number;           // microtime float
  lockKey: string;           // float string used as mutex identifier
  lockTimeout: number;       // WP_CRON_LOCK_TIMEOUT in seconds
}

interface CronLockService {
  acquire(gmtTime: number): Promise<string | null>;   // returns lock key or null if locked
  verify(lockKey: string): Promise<boolean>;           // re-verify ownership
  release(lockKey: string): Promise<void>;
}

interface CronRunner {
  getReadyJobs(): Promise<CronJob[]>;
  reschedule(job: CronJob): Promise<void>;
  unschedule(job: CronJob): Promise<void>;
  execute(job: CronJob): Promise<void>;
  run(context: CronExecutionContext): Promise<void>;
}

// ============================================================
// Post by Email
// ============================================================

interface MailIngestionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  defaultCategoryId: number;
  siteCharset: string;
  gmtOffset: number;
  checkIntervalSeconds: number;  // WP_MAIL_INTERVAL
}

interface ParsedEmailMessage {
  subject: string;
  body: string;
  fromEmail: string;
  postDate: Date;
  contentType: string;
  charset: string;
  transferEncoding: string;
}

interface EmailIngestionResult {
  postId: number;
  postStatus: 'publish' | 'pending';
  authorId: number;
}

interface MailIngestionService {
  checkRateLimit(): Promise<boolean>;
  setRateLimitToken(): Promise<void>;
  connect(config: MailIngestionConfig): Promise<void>;
  getMessageCount(): number;
  parseMessage(index: number): ParsedEmailMessage;
  resolveAuthor(email: string): Promise<number>;
  determinePostStatus(authorId: number): Promise<'publish' | 'pending'>;
  createPost(msg: ParsedEmailMessage, authorId: number, config: MailIngestionConfig): Promise<number>;
  deleteMessage(index: number): Promise<void>;
  quit(): Promise<void>;
  run(config: MailIngestionConfig): Promise<void>;
}

// ============================================================
// OPML Export
// ============================================================

interface OpmlExportOptions {
  linkCategoryFilter?: number | 'all';  // undefined = all categories
  siteCharset: string;
  siteName: string;
}

interface OpmlBookmark {
  text: string;        // link_name (after link_title filter)
  xmlUrl: string;      // link_rss
  htmlUrl: string;     // link_url
  updated?: string;    // link_updated; omitted when '0000-00-00 00:00:00'
}

interface OpmlCategory {
  title: string;       // category name (after link_category filter)
  bookmarks: OpmlBookmark[];
}

interface OpmlExporter {
  getCategories(options: OpmlExportOptions): Promise<OpmlCategory[]>;
  render(categories: OpmlCategory[], options: OpmlExportOptions): string;
}

// ============================================================
// Trackback
// ============================================================

interface TrackbackRequest {
  postId: number;
  url: string;
  charset: string;
  title: string;
  excerpt: string;
  blogName: string;
}

interface TrackbackSuccessResponse {
  error: 0;
}

interface TrackbackErrorResponse {
  error: 1;
  message: string;
}

type TrackbackResponse = TrackbackSuccessResponse | TrackbackErrorResponse;

interface TrackbackService {
  resolvePostId(tbIdParam: string | undefined, requestUri: string): number;
  validateCharset(charset: string): string;  // returns safe charset or throws
  checkDuplicate(postId: number, url: string): Promise<boolean>;
  checkPingsOpen(postId: number): Promise<boolean>;
  insert(data: TrackbackRequest): Promise<number>;  // returns new comment ID
  process(raw: Record<string, string>, requestUri: string): Promise<TrackbackResponse>;
}

// ============================================================
// XML-RPC Server
// ============================================================

interface XmlRpcCredentials {
  username: string;
  password: string;
}

interface XmlRpcFault {
  faultCode: number;
  faultString: string;
}

type XmlRpcMethodResult<T> = T | XmlRpcFault;

type XmlRpcHandler<TParams extends unknown[], TResult> =
  (...params: TParams) => Promise<XmlRpcMethodResult<TResult>>;

interface XmlRpcMethod<TParams extends unknown[], TResult> {
  name: string;
  requiresAuth: boolean;
  handler: XmlRpcHandler<TParams, TResult>;
}

interface XmlRpcServer {
  // Mode 1: RSD discovery
  serveRsd(): string;

  // Mode 2: XML-RPC method dispatch
  handleRequest(rawBody: string): Promise<string>;

  // Method registry
  registerMethod<TParams extends unknown[], TResult>(
    method: XmlRpcMethod<TParams, TResult>
  ): void;

  removeMethod(name: string): void;
  listMethods(): string[];
  isEnabled(): boolean;
}

// RSD API entry for discovery document
interface RsdApiEntry {
  name: string;
  blogID: string;
  preferred: boolean;
  apiLink: string;
  settings?: Record<string, string>;
}

// Post struct returned by wp.* and metaWeblog.* methods
interface XmlRpcPost {
  post_id: string;
  post_title: string;
  post_date: Date;
  post_date_gmt: Date;
  post_modified: Date;
  post_modified_gmt: Date;
  post_status: string;
  post_type: string;
  post_name: string;
  post_author: string;
  post_password: string;
  post_excerpt: string;
  post_content: string;
  post_parent: string;
  post_mime_type: string;
  link: string;
  guid: string;
  menu_order: number;
  comment_status: string;
  ping_status: string;
  sticky: boolean;
  post_thumbnail: XmlRpcMediaItem | Record<string, never>;
  post_format: string;
  terms: XmlRpcTerm[];
  custom_fields: Array<{ id: string; key: string; value: string }>;
  enclosure: Record<string, string>;
}

// Media item struct returned by wp.getMediaItem etc.
interface XmlRpcMediaItem {
  attachment_id: string;
  date_created_gmt: Date;
  parent: number;
  link: string;
  title: string;
  caption: string;
  description: string;
  metadata: Record<string, unknown>;
  type: string;
  thumbnail: string;
}

// Term struct returned by wp.getTerm etc.
interface XmlRpcTerm {
  term_id: string;
  name: string;
  slug: string;
  term_group: string;
  term_taxonomy_id: string;
  taxonomy: string;
  description: string;
  parent: string;
  count: number;
  filter: string;
}
```

---

## 12. Design Patterns to Carry Over

### 1. Request-Level Constant Signaling

WordPress uses `define()` to broadcast execution context before the main bootstrap (`DOING_CRON`, `XMLRPC_REQUEST`). This pattern lets any downstream code branch on context without requiring dependency injection. In a TypeScript system, an equivalent is a request-scoped context object or `AsyncLocalStorage` store populated at the middleware layer.

### 2. Pre-Boot Guards

`wp-cron.php` performs its most critical checks (abort conditions) before loading WordPress. This avoids the cost of bootstrapping the application for requests that should be rejected outright. The TypeScript equivalent is a lightweight middleware layer that validates the request shape before the application context is initialized.

### 3. Transient-Based Distributed Locks

The cron mutex uses a database-backed transient rather than a true distributed lock (no `SELECT FOR UPDATE`). The pattern — generate a unique token, store it, verify ownership before acting, re-verify before release — is a sound optimistic locking scheme for low-contention scenarios. For production TypeScript systems, replace with Redis `SET NX EX` or a database advisory lock, but preserve the ownership-verification step.

### 4. Fire-and-Forget Response Flushing

`wp-cron.php`'s `fastcgi_finish_request()` pattern decouples the HTTP response from the work. The TypeScript equivalent depends on the runtime: in Node.js, `res.end()` before continuing async work; in serverless environments, background jobs via a queue. The key invariant is that the originating HTTP request must not block on the work.

### 5. Unauthenticated Execution for Ingestion

Both `wp-mail.php` and `wp-trackback.php` explicitly set the current user to unauthenticated (`wp_set_current_user(0)`) before processing. This is a defensive pattern: even if the external data contains a valid user token, session state is never used. Author identity is resolved from the content itself (email `From:` header, trackback URL) via a separate lookup.

### 6. XML Responses with Error Codes

The trackback response format uses `<error>0</error>` / `<error>1</error>` rather than HTTP status codes. XML-RPC uses `<fault>` / `<methodResponse>`. Both patterns predate REST conventions. In a modern TypeScript rewrite, map these to standard HTTP semantics (200/400/403/404/429/500) while maintaining the XML response body for backward compatibility where client parsers require it.

### 7. Method Registry with Filter Hook

The XML-RPC server's `xmlrpc_methods` filter makes the method map the canonical extension surface. This pattern — expose a mutable registry and apply a filter to it at construction time — allows plugins to extend or modify behavior without subclassing. TypeScript equivalent: expose the method map as a `Map<string, Handler>` and run it through a registration pipeline that plugins can contribute to.

### 8. `prepare_*` Filters on Outbound Data

The `xmlrpc_prepare_post`, `xmlrpc_prepare_comment`, etc. filters run on every object before it is serialized to XML-RPC response format. This allows plugins to add, remove, or transform fields on the way out without modifying the storage layer. TypeScript equivalent: a serialization pipeline that passes each object through a chain of transformers before encoding.

### 9. Rate Limiting via Transient TTL

`wp-mail.php` uses a transient with a TTL as a rate limit token. The pattern is simple and portable: set a key with expiry on first access; reject on subsequent accesses while the key exists. Redis TTL keys are the natural TypeScript equivalent. The rate-limit check must happen after the feature-enabled check but before any external resource access.

### 10. OPML as a Structured Export Format

The OPML export demonstrates the pattern of mapping internal taxonomy/bookmark data to a standardized XML interchange format. The hierarchy (`opml > head > body > outline[@type=category] > outline[@type=link]`) is fixed and must not be changed. Extension is via the `opml_head` action (add elements to `<head>`) rather than changing the body structure. TypeScript equivalent: a renderer class that accepts typed data and produces a spec-compliant XML string, with extension hooks injected as callbacks.

---

## 13. Tovu Reconstruction Notes

### 13.1 Why this exists

These entry points exist so WordPress can ingest or emit work outside the normal browser-admin flow: cron, XML-RPC, email ingestion, trackbacks, and exports. The architectural lesson is that each protocol is an adapter with its own trust model and bootstrap rules.

### 13.2 What Tovu should preserve

- Explicit request context flags for protocol-specific execution modes
- Pre-bootstrap guards for requests that should be rejected before full app startup
- Scheduler and ingestion paths that can run without blocking the original HTTP request
- Adapter-specific security and rate-limiting instead of pretending every external entry point is just another web page

### 13.3 What Tovu can simplify

- Tovu does not need legacy protocols like trackbacks or OPML unless they serve a real user need
- XML-RPC compatibility is optional if modern REST/webhook surfaces replace it cleanly
- Cron locking can use stronger primitives than WordPress transients, as long as ownership verification and timeout behavior remain explicit

### 13.4 Possible Tovu seams

- `src/features/integration-entry/` for protocol adapters and request mode setup
- `src/core/ports/SchedulerPort.ts` for cron/background execution
- `src/core/ports/IngressProtocolPort.ts` for inbound integrations such as webhooks or mailbox ingestion
- `src/core/ports/ExportRendererPort.ts` for structured export formats

### 13.5 Suggested priority

- `V1`: background scheduler, webhook-style ingress, and typed export seams
- `Later`: legacy protocol compatibility and niche interchange formats
