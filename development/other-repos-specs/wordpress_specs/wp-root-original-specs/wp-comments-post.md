# Spec: `wp-comments-post.php`

**Source:** `wordpress/wp-comments-post.php`
**Lines:** 82
**Role:** Comment submission endpoint

---

## Purpose

Receives POST requests containing comment form data, delegates processing to the core comment handler, sets cookies, and redirects the user back to the relevant post.

---

## Entry Conditions

- **Method guard:** If request method is not `POST`:
  - Set `Allow: POST` header
  - Return HTTP 405 with `Content-Type: text/plain`
  - Exit

- Loads `wp-load.php`
- Sends `nocache_headers()`

---

## Processing

### 1. Submit comment

```
$comment = wp_handle_comment_submission(wp_unslash($_POST))
```

`wp_handle_comment_submission()` (defined in `wp-includes/comment.php`) performs:
- Validates required fields
- Checks for duplicate comments
- Applies spam filters
- Inserts the comment via `wp_new_comment()`
- Returns a `WP_Comment` object on success or `WP_Error` on failure

### 2. Handle errors

If `$comment` is a `WP_Error`:
- Get the HTTP status code from `$comment->get_error_data()` (cast to int)
- If the code is non-zero: `wp_die()` with message, title "Comment Submission Failure", back link, and that HTTP status
- If code is zero (e.g. duplicate comment spam): `exit` silently

### 3. Set comment cookies

```
do_action('set_comment_cookies', $comment, $user, $cookies_consent)
```

`$cookies_consent` is `true` if `$_POST['wp-comment-cookies-consent']` is set.

The default handler for this action sets:
- `comment_author_{COOKIEHASH}` — commenter name
- `comment_author_email_{COOKIEHASH}` — commenter email
- `comment_author_url_{COOKIEHASH}` — commenter URL

If `$cookies_consent` is false, these cookies are not set.

### 4. Determine redirect URL

Base URL:
- If `$_POST['redirect_to']` is set: use it, appended with `#comment-{id}`
- Otherwise: `get_comment_link($comment)`

If the commenter did not consent to cookies AND the comment is `unapproved` AND the comment has an email address:
- Append query args to the redirect URL:
  - `unapproved={comment_ID}`
  - `moderation-hash={wp_hash(comment_date_gmt)}`
- This allows the "Your comment is awaiting moderation" notice to be shown without cookies

Apply `comment_post_redirect` filter to the final URL.

### 5. Redirect

`wp_safe_redirect($location)` then exit.

---

## `$_POST` Fields

| Field | Required | Notes |
|---|---|---|
| `comment_post_ID` | Yes | Post ID to attach comment to |
| `author` | Conditional | Commenter name; required if not logged in and `require_name_email` option is on |
| `email` | Conditional | Commenter email; required if not logged in and `require_name_email` option is on |
| `url` | No | Commenter URL |
| `comment` | Yes | Comment content |
| `comment_parent` | No | Parent comment ID (for threaded replies) |
| `redirect_to` | No | URL to redirect to after submission |
| `wp-comment-cookies-consent` | No | GDPR-style cookie consent checkbox |

---

## Hooks

| Hook | Type | When |
|---|---|---|
| `set_comment_cookies` | action | after successful comment, before redirect |
| `comment_post_redirect` | filter | modify final redirect URL |

---

## TypeScript Interface

```typescript
interface CommentSubmissionInput {
  commentPostId: number;
  author?: string;
  email?: string;
  url?: string;
  comment: string;
  commentParent?: number;
  redirectTo?: string;
  cookiesConsent?: boolean;
}

interface CommentController {
  submit(req: Request, res: Response): Promise<void>;
}
```

### Error handling contract

```typescript
// Errors from wp_handle_comment_submission equivalent:
type CommentError =
  | { code: 'comment_on_trash' | 'comment_on_draft' | 'comment_on_password_protected', status: 403 }
  | { code: 'comment_flood', status: 429 }
  | { code: 'require_valid_comment', status: 400 }
  | { code: 'duplicate_comment', status: 0 }   // silent exit
  | { code: 'not_logged_in', status: 403 }
```

The `status: 0` case (duplicate/spam) requires a silent exit rather than an error response — this is intentional behaviour to avoid leaking information to spam bots.

---

## Tovu Reconstruction Notes

### Why this exists

This archival note preserves the earlier `wp-comments-post.php` decomposition. The canonical Tovu-facing treatment now lives in [integrations.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-root/integrations.md) and [comments.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-includes/comments.md).

### What Tovu should preserve

- The dedicated comment-submission entry point and anti-abuse response semantics described in the consolidated docs

### What Tovu can simplify

- Use the consolidated integration and comment-runtime specs instead of treating this file as a primary planning doc

### Possible Tovu seams

- `src/features/comments/`
- `src/features/integration-entry/`

### Suggested priority

- `Reference only`; implement from the consolidated comment and integration specs
