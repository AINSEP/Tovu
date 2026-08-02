# Spec: `wp-mail.php`

**Source:** `wordpress/wp-mail.php`
**Lines:** 277
**Role:** Post-by-email — creates posts from incoming POP3 email

---

## Purpose

Polls a configured POP3 mailbox, parses each unread email, and creates a WordPress post from it. This is a legacy feature ("Post by Email") configurable under Settings > Writing.

---

## Entry Conditions

- Loads `wp-load.php`
- If `enable_post_by_email_configuration` filter returns false → 403 and exit
- If `mailserver_url` option is empty or equals the placeholder `'mail.example.com'` → 403 and exit
- Fires `do_action('wp-mail.php')` — allows a plugin to completely take over this process and bypass the built-in logic

---

## Rate Limiting

- Constant `WP_MAIL_INTERVAL` (default: `5 * MINUTE_IN_SECONDS = 300 seconds`)
- Uses transient `mailserver_last_checked`
- If the transient exists (i.e. checked within the interval): 429 with human-readable interval
- After passing the rate limit: `set_transient('mailserver_last_checked', true, WP_MAIL_INTERVAL)`

---

## POP3 Connection

Uses the bundled `POP3` class (`wp-includes/class-pop3.php`).

```
$pop3 = new POP3()
$pop3->connect(mailserver_url, mailserver_port)
$pop3->user(mailserver_login)
$pop3->pass(mailserver_pass)  → returns message count
```

Options used:
- `mailserver_url` — POP3 server hostname
- `mailserver_port` — POP3 port (typically 110 or 995)
- `mailserver_login` — POP3 username
- `mailserver_pass` — POP3 password

On connection or auth error: `wp_die(esc_html($pop3->ERROR))`
If mailbox is empty: quit and die with "no new mail"

---

## Email Processing Loop

Runs as unauthenticated (`wp_set_current_user(0)`) to prevent inadvertent privilege escalation.

For each message `$i = 1 to $count`:

### 1. Parse headers

Scan lines above the body (blank line signals start of body):

| Header | Variable set | Notes |
|---|---|---|
| `Content-Type` | `$content_type`, `$charset` | MIME type and charset |
| `Content-Transfer-Encoding` | `$content_transfer_encoding` | e.g. `quoted-printable`, `base64` |
| `Subject` | `$subject` | Decoded via `iconv_mime_decode()` or `wp_iso_descrambler()` |
| `From` or `Reply-To` | `$author` (email) | Last one found wins; `Reply-To` preferred |
| `Date` | `$post_date`, `$post_date_gmt` | Parsed via `strtotime()`, parenthesised timezone stripped |

**Body detection:** A line shorter than 3 characters signals the transition from headers to body. Everything after is appended to `$content`.

### 2. Determine author

- Extract email from `From:` or `Reply-To:` header via regex
- `get_user_by('email', $author)` → match to WordPress user
- If found: `$post_author = user_ID`, `$author_found = true`
- If not found: `$post_author = 1` (admin), `$author_found = false`

### 3. Determine post status

- If author found and user has `publish_posts` cap: `$post_status = 'publish'`
- Otherwise: `$post_status = 'pending'`

### 4. Process multipart body

If `Content-Type` is `multipart/alternative`:
- Split body by `--{boundary}`
- Take the third part (index 2) — this is the HTML/text part after the boundary header
- If it contains `Content-Transfer-Encoding: quoted-printable`: split and take the second part
- Strip to allowed tags: `<img>`, `<p>`, `<br>`, `<i>`, `<b>`, `<u>`, `<em>`, `<strong>`, `<strike>`, `<font>`, `<span>`, `<div>`

Apply `wp_mail_original_content` filter to the raw content.

### 5. Decode content

- If `Content-Transfer-Encoding` contains `quoted-printable`: `quoted_printable_decode($content)`
- If `iconv` is available and charset is set: `iconv($charset, blog_charset, $content)`

### 6. Parse phone delimiter

`$phone_delim = '::'`

Content format: `[title]::[body]` or just body.
- Split by `::`: if part after `::` exists, use it as post body; first part is title candidate.
- Subject line also split by `::`: first part becomes `$subject` (post title fallback).

Apply `phone_content` filter to final `$post_content`.

### 7. Determine post title

`xmlrpc_getposttitle($content)` — looks for a `<title>` tag in the content.
If empty: use `$subject`.

### 8. Create post

```typescript
{
  post_content: string,
  post_title: string,
  post_date: string,       // local datetime
  post_date_gmt: string,   // UTC datetime
  post_author: number,
  post_category: [get_option('default_email_category')],
  post_status: 'publish' | 'pending'
}
```

Passed through `wp_slash()` then `wp_insert_post()`.

On error: print error message, continue to next email.
On success: fire `publish_phone` action with `$post_ID`.

### 9. Delete from server

`$pop3->delete($i)` — marks message for deletion from POP3 server.

On failure: print error, `$pop3->reset()` (cancels all pending deletions), exit.
On success: print "Message {n} deleted."

---

## End

`$pop3->quit()` — finalize deletions and close connection.

---

## Configuration Options

| Option | Description |
|---|---|
| `mailserver_url` | POP3 server hostname |
| `mailserver_port` | POP3 port |
| `mailserver_login` | POP3 username |
| `mailserver_pass` | POP3 password |
| `default_email_category` | Category ID for posts created via email |
| `gmt_offset` | Site timezone offset (used to convert email Date to local time) |
| `blog_charset` | Site charset (used for iconv conversion) |

---

## Hooks

| Hook | Type | Description |
|---|---|---|
| `enable_post_by_email_configuration` | filter | Return false to disable the feature entirely |
| `wp-mail.php` | action | Fires before any processing; return early to fully replace behaviour |
| `wp_mail_original_content` | filter | Filter raw email body content |
| `phone_content` | filter | Filter final post content before insertion |
| `publish_phone` | action | Fires after post created from email |

---

## TypeScript Interface

```typescript
interface MailboxConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

interface ParsedEmail {
  subject: string;
  body: string;
  fromEmail: string;
  date: Date;
  contentType: string;
  charset: string;
  encoding: string;
}

interface EmailToPostResult {
  postId: number;
  status: 'publish' | 'pending';
  authorId: number;
}

interface PostByEmailService {
  checkRateLimit(): Promise<boolean>;
  connect(config: MailboxConfig): Promise<POP3Client>;
  parseEmail(rawMessage: string[]): ParsedEmail;
  resolveAuthor(email: string): Promise<number>;   // returns user ID or 1 (admin fallback)
  createPost(email: ParsedEmail, authorId: number): Promise<EmailToPostResult>;
  deleteFromServer(client: POP3Client, messageIndex: number): Promise<void>;
  run(): Promise<void>;
}
```

### Notes for TypeScript rewrite

- The `::` phone delimiter system is a very old feature (pre-smartphone era). Consider whether to preserve or deprecate it.
- The POP3 class should be replaced with a proper IMAP/POP3 library (e.g. `node-imap`, `emailjs-imap-client`).
- The rate limiting transient maps to a Redis/cache TTL key.
- The `wp_set_current_user(0)` — always run unauthenticated — is important; the post author is set from the email `From:` header, not from any session.

---

## Tovu Reconstruction Notes

### Why this exists

This archival note preserves the earlier `wp-mail.php` decomposition. The canonical Tovu-facing treatment now lives in [integrations.md](/Users/la/Desktop/Tovu AI CMS/other-repos/wordpress_specs/wp-root/integrations.md).

### What Tovu should preserve

- The protocol-adapter and unauthenticated ingestion rules described in the consolidated integrations doc

### What Tovu can simplify

- Email-to-post ingestion is optional; prefer the consolidated integrations spec for priority decisions

### Possible Tovu seams

- `src/features/integration-entry/`
- `src/core/ports/IngressProtocolPort.ts`

### Suggested priority

- `Reference only`; implement from the consolidated integrations spec
