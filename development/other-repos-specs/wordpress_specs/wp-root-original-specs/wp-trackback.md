# Spec: `wp-trackback.php`

**Source:** `wordpress/wp-trackback.php`
**Lines:** 179
**Role:** Incoming trackback/pingback receiver

---

## Purpose

Receives trackback pings from other blogs, validates them, and saves them as comments of type `'trackback'`. Responds with XML.

---

## Entry Conditions

- If the `$wp` global is empty (i.e. not already bootstrapped): load `wp-load.php` and call `wp(array('tb' => '1'))` to bootstrap WordPress with a trackback-specific query
- Always sets current user to unauthenticated: `wp_set_current_user(0)`

---

## `trackback_response($error, $error_message)` — Response Function

Outputs XML and terminates. Called for both success and error.

**Error response:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<response>
  <error>1</error>
  <message>{error_message}</message>
</response>
```
Then `die()`.

**Success response:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<response>
  <error>0</error>
</response>
```
Does **not** die — execution continues (but nothing follows the call in practice).

`Content-Type: text/xml; charset={blog_charset}` is set in both cases.

---

## Post ID Resolution

### Method 1: `$_GET['tb_id']`

If `$_GET['tb_id']` is present and non-empty: use it as `$post_id`.

### Method 2: URI path

If no `tb_id`: extract the last segment of `$_SERVER['REQUEST_URI']` by splitting on `/` and using the last element. Cast to int.

---

## Input Parsing

All inputs are from `$_POST`:

| Field | Variable | Sanitization |
|---|---|---|
| `url` | `$trackback_url` | `sanitize_url()` |
| `charset` | `$charset` | `sanitize_text_field()` |
| `title` | `$title` | `sanitize_text_field(wp_unslash(...))` |
| `excerpt` | `$excerpt` | `sanitize_textarea_field(wp_unslash(...))` |
| `blog_name` | `$blog_name` | `sanitize_text_field(wp_unslash(...))` |

---

## Charset Handling

1. Normalize `$charset`: strip commas and spaces, uppercase
2. If `mb_list_encodings()` is available and the claimed charset is not in the list: discard it
3. If `$charset` is empty after normalisation: use fallback `'ASCII, UTF-8, ISO-8859-1, JIS, EUC-JP, SJIS'`
4. **Security:** If `$charset` contains `UTF-7`: die immediately (UTF-7 can be used for XSS via charset sniffing attacks)
5. If `mb_convert_encoding()` is available: convert `$title`, `$excerpt`, `$blog_name` from `$charset` to `blog_charset`
6. After conversion: re-apply `wp_slash()` (because sanitize functions stripped slashes)

---

## Validation

### Post ID must be valid

```
if (!isset($post_id) || !(int)$post_id)
    → trackback_response(1, 'I really need an ID for this to work.')
```

### Detect non-trackback GET requests

```
if (empty($title) && empty($trackback_url) && empty($blog_name))
    → wp_redirect(get_permalink($post_id)) and exit
```

This handles browsers navigating to a trackback URL directly — redirect to the post instead.

---

## Duplicate Detection

Before inserting, check for an existing comment from the same URL on the same post:

```sql
SELECT * FROM wp_comments
WHERE comment_post_ID = {post_id}
AND comment_author_url = {trackback_url}
```

If found: `trackback_response(1, 'There is already a ping from that URL for this post.')`

---

## Pingbacks Open Check

```
if (!pings_open($post_id))
    → trackback_response(1, 'Sorry, trackbacks are closed for this item.')
```

`pings_open()` checks the post's `ping_status` field.

---

## Content Truncation

Before insertion:
- `$title` → `wp_html_excerpt($title, 250, '…')`
- `$excerpt` → `wp_html_excerpt($excerpt, 252, '…')`

---

## Comment Insertion

```typescript
{
  comment_post_ID: post_id,           // int
  comment_author: blog_name,          // string
  comment_author_email: '',           // always empty for trackbacks
  comment_author_url: trackback_url,  // string
  comment_content: `<strong>${title}</strong>\n\n${excerpt}`,
  comment_type: 'trackback'
}
```

`wp_new_comment($commentdata)` — handles moderation, spam checks, and insertion.

On error: `trackback_response(1, $result->get_error_message())`

---

## Post-insertion Actions

```
do_action('trackback_post', $trackback_id)
```

Then: `trackback_response(0)` — success response.

---

## Hooks

| Hook | Type | When |
|---|---|---|
| `pre_trackback_post` | action | Before insertion; receives `post_id, trackback_url, charset, title, excerpt, blog_name` |
| `trackback_post` | action | After successful insertion; receives `trackback_id` (the new comment ID) |

---

## TypeScript Interface

```typescript
interface TrackbackInput {
  url: string;
  charset: string;
  title: string;
  excerpt: string;
  blogName: string;
}

interface TrackbackResult {
  error: 0 | 1;
  message?: string;
  trackbackId?: number;
}

interface TrackbackController {
  receive(req: Request, res: Response): Promise<void>;
}

// Always responds with Content-Type: text/xml
// GET with no valid trackback fields → 302 to post permalink
// All other cases → XML response
```

### XML response helper

```typescript
function trackbackResponse(error: boolean, message?: string): string {
  if (error) {
    return `<?xml version="1.0" encoding="utf-8"?>\n<response>\n<error>1</error>\n<message>${message}</message>\n</response>`;
  }
  return `<?xml version="1.0" encoding="utf-8"?>\n<response>\n<error>0</error>\n</response>`;
}
```

### Security notes

- UTF-7 charset must be rejected immediately before any content processing
- Always run as unauthenticated user
- Duplicate ping detection must happen before pings_open check to avoid information leakage about whether pings are open

---

## Tovu Reconstruction Notes

### Why this exists

This archival note preserves the earlier `wp-trackback.php` decomposition. The canonical Tovu-facing treatment now lives in [integrations.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-root/integrations.md).

### What Tovu should preserve

- The adapter-specific trust model and anti-abuse ordering described in the consolidated integrations doc

### What Tovu can simplify

- Trackbacks are likely optional for Tovu; use the consolidated integrations doc to decide whether this protocol survives at all

### Possible Tovu seams

- `src/features/integration-entry/`
- `src/core/ports/IngressProtocolPort.ts`

### Suggested priority

- `Reference only`; implement from the consolidated integrations spec
