# Formatting & Sanitization — Specification

**Source files analyzed:**
- `wp-includes/formatting.php`
- `wp-includes/kses.php`
- `wp-includes/functions.php` (date, number, path, JSON helpers)
- `wp-includes/pluggable.php` (wp_hash, wp_hash_password, wp_rand)

---

## 1. Overview

The formatting system is divided into two major responsibilities:

**Output escaping (security):** Functions that take untrusted data and encode it for safe injection into a specific output context — HTML, HTML attributes, URLs, JavaScript, textarea content, XML. These are the last line of defense before a value reaches the browser. They should be applied immediately before rendering, not before storage. Applying them at storage time causes double-encoding and is an antipattern.

**Content formatting (presentation):** Functions that transform content for improved readability — auto-paragraphing, smart quotes, link detection, excerpt generation, slug production. These modify stored or in-transit content for display.

A third cross-cutting concern is **input sanitization**, which removes disallowed content from user-submitted data before storing it. This is distinct from output escaping: sanitization is lossy (it destroys characters), while escaping is lossless and reversible.

The KSES subsystem (`kses.php`) handles a specialized form of input sanitization: HTML allowlisting. It strips all HTML that does not appear in an explicit allowlist of tags, attributes, and attribute values. KSES is the mechanism by which WordPress permits rich post content while blocking script injection.

---

## 2. Output Escaping Functions

All escaping functions follow the same contract:
- Accept a string (or value coercible to string)
- Return a safe string for the named output context
- Never throw — worst case they return an empty string
- Fire a filter so the result can be modified at runtime

### `esc_html(text: string): string`

Escapes a string for output inside HTML text content (between tags, not in attributes).

**Pipeline:**
1. `wp_check_invalid_utf8(text)` — rejects or scrubs invalid UTF-8 sequences.
2. `_wp_specialchars(text, ENT_QUOTES)` — converts `&`, `<`, `>`, `"`, and `'` to HTML entities.
3. Fires filter `esc_html`.

**Entities produced:**
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&#039;`

**Use context:** Text nodes only. Not safe for injection inside `href=""` or `onclick=""` — use `esc_url` and `esc_js` for those.

---

### `esc_attr(text: string): string`

Escapes a string for output inside an HTML attribute value.

**Pipeline:** Identical to `esc_html` (same `ENT_QUOTES` encoding). The difference is semantic — it fires filter `attribute_escape` instead of `esc_html`, allowing context-aware overrides.

```typescript
// Safe usage:
`<img alt="${escAttr(userTitle)}" />`
```

**Why it differs from `esc_html`:** Although both encode the same characters by default, HTML attributes have additional quirks (e.g. event-handler attributes, URL attributes) and separate filter hooks allow plugins to enforce stricter rules for specific attribute contexts.

---

### `esc_url(url: string, protocols?: string[], _context?: string): string`

Cleans and validates a URL for safe output in HTML contexts.

**Pipeline:**
1. Return `''` if input is empty.
2. `ltrim(url)` — strip leading whitespace; replace literal spaces with `%20`.
3. Strip characters not in: `a-z 0-9 - ~ + _ . ? # = ! & ; , / : % @ $ | * ' ( ) [ ] \x80-\xff`
4. Deep-replace `%0d` and `%0a` (CRLF injection) from non-mailto URLs.
5. Fix `;//` → `://`.
6. If no scheme and not a relative path (`/`, `#`, `?`): prepend `http://` (or `https://` if first allowed protocol is https).
7. If context is `'display'` (default): normalize entities via `wp_kses_normalize_entities`, then replace `&amp;` → `&#038;` and `'` → `&#039;`.
8. Percent-encode bare `[` and `]` in the path/query (they break HTML parsers).
9. Pass through `wp_kses_bad_protocol` against allowed protocols list. If protocol was altered, return `''`.
10. Fire filter `clean_url`.

**`_context` parameter:** `'display'` (default) applies HTML-safe entity encoding of `&` and `'`. `'db'` skips that step (used by `sanitize_url` / `esc_url_raw`).

**Allowed protocols (default):** `http`, `https`, `ftp`, `ftps`, `mailto`, `news`, `irc`, `irc6`, `ircs`, `gopher`, `nntp`, `feed`, `telnet`, `mms`, `rtsp`, `sms`, `svn`, `tel`, `fax`, `xmpp`, `webcal`, `urn`.

**Returns empty string if:**
- Input is empty.
- Protocol is not in allowed list and URL is not a relative path.
- Protocol was modified by bad-protocol stripping (indicates obfuscation attempt).

---

### `sanitize_url(url: string, protocols?: string[]): string`

Alias for `esc_url(url, protocols, 'db')`. For database storage and redirects. Does not apply HTML entity encoding for `&` and `'`.

---

### `esc_js(text: string): string`

Escapes a string for safe inline JavaScript output. Intended for use inside single-quoted JS strings embedded in HTML attributes (e.g. `onclick='doThing("${escJs(val)}")'`).

**Pipeline:**
1. `wp_check_invalid_utf8(text)`
2. `_wp_specialchars(text, ENT_COMPAT)` — encodes `&`, `<`, `>`, and `"` (not single quotes yet).
3. `preg_replace('/&#(x)?0*(?(1)27|39);?/i', "'", stripslashes(text))` — converts any HTML entity for `'` back to a literal single quote (so the surrounding JS single-quote string remains intact).
4. Remove `\r` characters.
5. `addslashes(text)` — escape `\`, `"`, `'` with backslashes.
6. Replace `\n` with the literal string `\n` (two characters, for JS line continuation).
7. Fire filter `js_escape`.

**Result safe for:** single-quoted JS string literals.

---

### `esc_textarea(text: string): string`

Escapes a string for safe output inside a `<textarea>` element.

**Pipeline:**
1. `htmlspecialchars(text, ENT_QUOTES, charset)` — encodes `&`, `<`, `>`, `"`, `'`.
2. Fire filter `esc_textarea`.

**Note:** Does not call `wp_check_invalid_utf8` first. Uses the site charset from the `blog_charset` option.

---

### `esc_xml(text: string): string`

Escapes a string for safe output in XML contexts, while preserving CDATA sections unchanged.

**Pipeline:**
1. `wp_check_invalid_utf8(text)`
2. Split the string into alternating CDATA and non-CDATA segments using a regex with named capture groups.
3. For non-CDATA text: apply `_wp_specialchars(segment, ENT_XML1)` which also converts HTML named entities (that are not valid XML named entities) to numeric character references.
4. CDATA sections pass through unmodified.
5. Fire filter `esc_xml`.

**Key difference from `esc_html`:** `ENT_XML1` flag converts HTML-only named entities (e.g. `&nbsp;`) to their numeric equivalents (e.g. `&#160;`), because XML does not recognize most HTML named entities.

---

### `wp_json_encode(value: unknown, flags?: number, depth?: number): string | false`

A wrapper around `JSON.stringify` / PHP `json_encode` that handles encoding failures caused by invalid UTF-8 sequences in string values.

**Pipeline:**
1. Attempt `json_encode(value, flags, depth)`. If it succeeds, return immediately.
2. If it fails: recursively walk the value via `_wp_json_sanity_check`. For every string value, run it through `_wp_json_convert_string` which calls `wp_check_invalid_utf8(str, true)` (strip mode) — replacing invalid UTF-8 byte sequences with the Unicode replacement character U+FFFD.
3. Attempt `json_encode` again on the sanitized value.
4. If `depth` exceeded during sanity check, throw internally and return `false`.

**TypeScript signature:**
```typescript
function wpJsonEncode(
  value: unknown,
  flags?: number,   // default 0
  depth?: number    // default 512
): string | false
```

---

## 3. Input Sanitization Functions

Sanitization is **destructive** — characters that don't pass are removed, not encoded. Use at input time (form submission, API ingestion), not at output time.

### `sanitize_text_field(str: string): string`

Sanitizes a single-line string from user input.

**Pipeline:**
1. If value is an object or array, return `''`.
2. Cast to string.
3. `wp_check_invalid_utf8(str)`.
4. If string contains `<`: apply `wp_pre_kses_less_than` (escapes lone `<` not followed by a valid tag), then `wp_strip_all_tags(str, false)`.
5. Replace `<\n` → `&lt;\n` to prevent tag construction after newline stripping.
6. Collapse all whitespace sequences (newlines, tabs, spaces) to a single space.
7. `trim`.
8. Loop: remove all `%XX` percent-encoded sequences (e.g. `%20`, `%3C`) and re-trim until none remain.
9. Fire filter `sanitize_text_field`.

**Result:** A plain, single-line, HTML-stripped string safe for storage.

---

### `sanitize_textarea_field(str: string): string`

Identical to `sanitize_text_field` except step 6 preserves newlines — whitespace collapsing only targets spaces and tabs, not `\n` or `\r`.

```typescript
function sanitizeTextareaField(str: string): string
```

Fires filter `sanitize_textarea_field`.

---

### `sanitize_email(email: string): string`

Sanitizes an email address by stripping invalid characters from each portion.

**Algorithm:**
1. If length < 6, return `''` (fire `sanitize_email` filter with context `'email_too_short'`).
2. If no `@` after position 0, return `''` (context `'email_no_at'`).
3. Split on `@` into local and domain parts.
4. **Local part:** strip all chars not in `[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]`. If empty after stripping, return `''`.
5. **Domain part:** remove consecutive periods (`..` → `''`). If empty, return `''`. Trim leading/trailing periods and whitespace. If empty, return `''`. Split on `.` — must have at least 2 parts or return `''`. Each sub-part: trim leading/trailing hyphens and whitespace; strip chars not in `[a-z0-9-]` (case-insensitive). Empty subs are discarded. Must have at least 2 valid subs or return `''`.
6. Reassemble as `local@domain`. Fire filter `sanitize_email`.

---

### `sanitize_url(url: string, protocols?: string[]): string`

Calls `esc_url(url, protocols, 'db')`. See Section 2.

---

### `sanitize_key(key: string): string`

Sanitizes a string key (for internal identifiers, option names, etc.).

**Algorithm:**
1. If not scalar, return `''`.
2. `strtolower(key)`.
3. Strip all chars not in `[a-z0-9_-]`.
4. Fire filter `sanitize_key`.

**Allowed:** lowercase letters, digits, underscores, hyphens.

---

### `sanitize_title(title: string, fallbackTitle?: string, context?: string): string`

Sanitizes a string into a URL slug. The default context is `'save'`.

**Pipeline:**
1. If context is `'save'`: apply `remove_accents(title)` (transliterate accented chars to ASCII equivalents).
2. Fire filter `sanitize_title` (the core hook `sanitize_title_with_dashes` is normally registered here at priority 0).
3. If result is empty or `false`, use `fallbackTitle`.

**Note:** The actual character stripping is performed by the `sanitize_title` filter callback `sanitize_title_with_dashes`. See that function below.

---

### `sanitize_title_with_dashes(title: string, rawTitle?: string, context?: string): string`

The core slug-generation function. Usually called via the `sanitize_title` filter, but can be called directly.

**Pipeline:**
1. Strip HTML tags (`strip_tags`).
2. Preserve percent-encoded octets: `%XX` → `---XX---`, then strip bare `%`, then restore `---%XX---` → `%XX`.
3. If valid UTF-8: `mb_strtolower(title, 'UTF-8')`, then `utf8_uri_encode(title, 200)`.
4. `strtolower(title)`.
5. If context is `'save'`:
   - Convert `%c2%a0` (non-breaking space), `%e2%80%91` (non-breaking hyphen), `%e2%80%93` (en dash), `%e2%80%94` (em dash) → `-`.
   - Convert corresponding HTML entity forms → `-`.
   - Convert `/` → `-`.
   - Strip soft hyphens, inverted punctuation, angle quotes, curly quotes, bullet, copyright/trademark symbols, zero-width characters, byte order mark, object replacement character.
   - Convert various Unicode space categories to `-`.
   - Convert `%c3%97` (×) → `x`.
6. Strip HTML entities (`&xxx;`).
7. Convert `.` → `-`.
8. Strip chars not in `[%a-z0-9 _-]`.
9. Replace whitespace sequences → `-`.
10. Replace multiple consecutive `-` → single `-`.
11. Trim leading/trailing `-`.

---

### `sanitize_title_for_query(title: string): string`

Calls `sanitize_title(title, '', 'query')`. Used when looking up a slug in the database. Skips the `remove_accents` step.

---

### `sanitize_user(username: string, strict?: boolean): string`

Sanitizes a username for storage and comparison.

**Pipeline:**
1. `wp_strip_all_tags(username)`.
2. `remove_accents(username)`.
3. Strip percent-encoded characters: remove `%XX`.
4. Strip HTML entities: remove `&xxx;`.
5. If `strict === true`: strip all chars not in `[a-z0-9 _.@-]` (case-insensitive). This reduces username to ASCII safe characters.
6. `trim`.
7. Collapse multiple whitespace to single space.
8. Fire filter `sanitize_user`.

---

### `sanitize_html_class(classname: string, fallback?: string): string`

Sanitizes a CSS class name string.

**Pipeline:**
1. Strip percent-encoded sequences (`%XX`).
2. Strip all chars not in `[A-Za-z0-9_-]`.
3. If result is empty and `fallback` is provided: recursively call `sanitize_html_class(fallback)`.
4. Fire filter `sanitize_html_class`.

---

### `sanitize_mime_type(mimeType: string): string`

Strips all characters not allowed in a MIME type string.

**Keeps:** `[-+*.a-zA-Z0-9/]`
Fire filter `sanitize_mime_type`.

---

### `sanitize_file_name(filename: string): string`

Sanitizes a filename for safe file-system use.

**Pipeline:**
1. `remove_accents(filename)`.
2. Replace all Unicode "space separator" category characters with a plain space (when PCRE Unicode support is available).
3. Fire filter `sanitize_file_name_chars` to get the list of special characters to remove. Default list: `? [ ] / \ = < > : ; , ' " & $ # * ( ) | ~ \` ! { } % + … « » " "` and null byte.
4. Strip all characters in the special chars list.
5. Replace `%20` and `+` with `-`.
6. Replace multiple consecutive dots (`..+`) with a single `.`.
7. Replace runs of whitespace/newlines/tabs/dashes with a single `-`.
8. Trim leading/trailing `.-_`.
9. If no dot found (no extension), test if the whole filename is itself a valid extension; if so, rename to `unnamed-file.{ext}`.
10. Split on dots. If >2 parts (multiple intermediate extensions): check each intermediate extension. If it is 2–5 alphabetic chars not in the allowed MIME types list, append `_` to disable it.
11. Reassemble.
12. Fire filter `sanitize_file_name`.

---

### `sanitize_option(option: string, value: unknown): unknown`

Applies option-specific sanitization rules for WordPress settings. Each known option name has a hardcoded sanitization pathway:

| Option | Sanitization |
|---|---|
| `admin_email`, `new_admin_email` | Strip invalid DB text; `sanitize_email`; validate with `is_email` |
| Size/count numeric options (`thumbnail_size_w`, etc.) | `absint` |
| `posts_per_page`, `posts_per_rss` | `(int)`, min 1, handle -1 as all |
| `default_ping_status`, `default_comment_status` | Coerce `'0'` or `''` to `'closed'` |
| `blogdescription`, `blogname` | Strip invalid DB text; `esc_html` |
| `blog_charset` | Strip non-`[a-zA-Z0-9_-]` |
| `blog_public` | `(int)` |
| `date_format`, `time_format`, mail options | Strip tags; `wp_kses_data` |
| `ping_sites` | Split on newlines; `sanitize_url` each; rejoin |
| `gmt_offset` | Strip non-`[0-9:.-]` |
| `siteurl`, `home` | Must match `http(s)?://`; `sanitize_url` |
| `permalink_structure`, `category_base`, `tag_base` | `sanitize_url`; strip `http://`; must contain a structure tag `%…%` |
| `timezone_string` | Must be in PHP `timezone_identifiers_list` |
| `moderation_keys`, `disallowed_keys` | Split on `\n`; trim; unique; rejoin |

Fires a dynamic filter `sanitize_option_{$option}`.

---

## 4. wp_kses — The HTML Allowlist System

KSES (Kiddies' Silly Escape System) is the HTML filter that allows rich content while removing dangerous markup. The name is historical; the system is serious security infrastructure.

### `wp_kses(content: string, allowedHtml: AllowedHtmlMap | string, allowedProtocols?: string[]): string`

The master HTML sanitization function.

**Pipeline:**
1. If `allowedProtocols` is empty, use `wp_allowed_protocols()`.
2. `wp_kses_no_null(content, { slash_zero: 'keep' })` — strip null bytes and control characters `[\x00-\x08\x0B\x0C\x0E-\x1F]`. Preserve literal `\0` strings.
3. `wp_kses_normalize_entities(content)` — normalize all HTML entities (see Section 6).
4. Fire filter `pre_kses` — allows pre-processing.
5. `wp_kses_split(content, allowedHtml, allowedProtocols)` — tokenize and process all HTML in the string.

**Tokenization:** The string is split using a regex that finds:
- HTML comments (`<!-- ... -->`)
- Closing tags with invalid names (`</123>`)
- Invalid markup declarations (`<!...>`)
- All other tag-like spans (`<...>`)
- Stray `>` characters

Each token is processed by `wp_kses_split2`:
- Stray `>` → `&gt;`
- HTML comments: strip `<!--` / `-->`, run content through `wp_kses` recursively until stable, prevent double-dashes, return as `<!-- cleaned -->`
- Bogus comment constructs (`<![abc...]>`, `</123>`) → recursively clean inner content, preserve structure
- Normal tags: parse `<tagname attrs>` or `</tagname>`
  - Tag name must match `[a-zA-Z0-9-]+`
  - Tag name (lowercased) must be in `allowedHtml` — otherwise the entire tag is stripped (returned as `''`)
  - Closing tags have all attributes stripped: return `</tagname>`
  - Opening tags: attributes are parsed and filtered by `wp_kses_attr`

### The `$allowed_html` Structure

```typescript
type AttributeRules =
  | true                          // attribute allowed, any value
  | {
      required?: true;            // tag is invalid if this attr is missing
      valueless?: 'y' | 'n';     // 'y' = must have no value, 'n' = must have value
      maxlen?: number;            // max byte length of value
      minlen?: number;            // min byte length of value
      maxval?: number;            // max integer value (also validates value is 0-6 digit integer)
      minval?: number;            // min integer value
      values?: string[];          // value must be one of these (case-insensitive)
      value_callback?: string;    // name of a function that returns bool
    };

type AllowedHtmlMap = {
  [tagName: string]: {            // tag name must be lowercase
    [attrName: string]: AttributeRules;
  } | true;                       // true = all attributes allowed (rare)
};
```

**Global attributes:** Added to every tag in `$allowedposttags` via `_wp_add_global_attributes`. These are:
`aria-controls`, `aria-current`, `aria-describedby`, `aria-details`, `aria-expanded`, `aria-hidden`, `aria-label`, `aria-labelledby`, `aria-live`, `class`, `data-*`, `dir`, `hidden`, `id`, `lang`, `style`, `title`, `role`, `xml:lang`.

**`data-*` wildcard:** When `'data-*': true` is set for a tag, any attribute matching `data-[a-z0-9_-]+` is permitted.

**`style` attribute:** When `style` is in the allowed list, its value is run through `safecss_filter_attr` which applies a CSS property allowlist.

**Required attributes:** If an attribute has `required: true` and is absent from the tag, the entire tag has all attributes stripped. For self-closing tags, the tag itself is removed.

**URI attributes:** Attributes whose names appear in `wp_kses_uri_attributes()` have their values run through `wp_kses_bad_protocol` to strip dangerous schemes. The URI attribute list includes: `action`, `archive`, `background`, `cite`, `classid`, `codebase`, `data`, `formaction`, `href`, `icon`, `longdesc`, `manifest`, `poster`, `profile`, `src`, `usemap`, `xmlns`.

**Duplicate attributes:** First occurrence wins. Subsequent attributes with the same name are discarded.

### `wp_kses_post(data: string): string`

Convenience wrapper: `wp_kses(data, 'post')`.

### `wp_kses_data(data: string): string`

Convenience wrapper: `wp_kses(data, currentFilter())`. Used in filter callbacks to auto-derive context.

### `wp_kses_allowed_html(context: string | AllowedHtmlMap): AllowedHtmlMap`

Returns the allowed HTML map for a named context.

| Context | Returns |
|---|---|
| `'post'` | Full `$allowedposttags` (rich post content allowlist) |
| `'user_description'`, `'pre_term_description'`, `'pre_user_description'` | `$allowedtags` + `a[rel]` + `a[target]` |
| `'strip'` | Empty array (strips all HTML) |
| `'entities'` | `$allowedentitynames` array |
| `'data'` or default | `$allowedtags` (comment/minimal allowlist) |
| Array passed directly | Returns it as-is (fires filter with context `'explicit'`) |

All contexts fire the `wp_kses_allowed_html` filter before returning.

### `$allowedposttags` — The Post Allowlist

The full post allowlist is the union of the base tag set (approximately 70 HTML5 elements) plus MathML elements. Every tag in the set receives the global attributes automatically.

Selected notable tags and their permitted non-global attributes:

| Tag | Permitted non-global attributes |
|---|---|
| `a` | `href`, `rel`, `rev`, `name`, `target`, `download` (valueless) |
| `audio`, `video` | `autoplay`, `controls`, `loop`, `muted`, `preload`, `src` + `video` adds `height`, `width`, `playsinline`, `poster` |
| `button` | `disabled`, `name`, `type`, `value`, `popovertarget`, `popovertargetaction`, `aria-haspopup` |
| `img` | `alt`, `align`, `border`, `height`, `hspace`, `loading`, `longdesc`, `vspace`, `src`, `usemap`, `width` |
| `input` | NOT in allowlist (removed in 5.0.1) unless `<select>` is also present via filter |
| `object` | `data` (requires value_callback `_wp_kses_allow_pdf_objects`), `type` (must be `'application/pdf'`) |
| `table`, `td`, `th` | alignment, sizing, spanning attributes |
| `textarea` | `cols`, `rows`, `disabled`, `name`, `readonly` |

`$allowedtags` (comment context, minimal):
```typescript
{
  a: { href: true, title: true },
  abbr: { title: true },
  acronym: { title: true },
  b: {},
  blockquote: { cite: true },
  cite: {},
  code: {},
  del: { datetime: true },
  em: {},
  i: {},
  q: { cite: true },
  s: {},
  strike: {},
  strong: {}
}
```

### `safecss_filter_attr(css: string): string`

Filters an inline `style` attribute value. Strips all CSS declarations not in the allowed list.

**Process:**
1. Strip null bytes and control characters. Strip `\n`, `\r`, `\t`.
2. Split on `;` to get individual declarations.
3. For each declaration:
   - Extract property name from before `:`.
   - Check against allowed property list (or `--*` wildcard for custom properties).
   - For URL-type properties: extract `url(...)` functions, validate each URL with `wp_kses_bad_protocol`.
   - For gradient properties: validate `linear-gradient` / `radial-gradient` / `conic-gradient` / `repeating-*-gradient` syntax.
   - Allow CSS functions: `var()`, `calc()`, `min()`, `max()`, `minmax()`, `clamp()`, `repeat()` (remove them from the test string before the safety check).
   - Safety check: reject if test string (after removing url/gradient/function parts) contains `\`, `(`, `&`, `}`, `=`, or `/*`.
   - Fire filter `safecss_filter_attr_allow_css` with `(allowed: bool, testString: string)`.

**Allowed CSS properties (partial list):**
`background`, `background-color`, `background-image`, `background-position`, `background-repeat`, `background-size`, `background-attachment`, `background-blend-mode`, `border`, `border-radius`, `border-*` (all sides/components), `border-spacing`, `border-collapse`, `caption-side`, `columns`, `column-*`, `color`, `filter`, `font`, `font-family`, `font-size`, `font-style`, `font-variant`, `font-weight`, `letter-spacing`, `line-height`, `text-align`, `text-decoration`, `text-indent`, `text-transform`, `white-space`, `height`, `min-height`, `max-height`, `width`, `min-width`, `max-width`, `margin`, `margin-*`, `margin-block-start`, `margin-block-end`, `margin-inline-start`, `margin-inline-end`, `padding`, `padding-*` (same logical variants), `flex`, `flex-*`, `gap`, `column-gap`, `row-gap`, `grid-template-columns`, `grid-auto-columns`, `grid-column-*`, `grid-template-rows`, `grid-auto-rows`, `grid-row-*`, `grid-gap`, `justify-content`, `justify-items`, `justify-self`, `align-content`, `align-items`, `align-self`, `clear`, `cursor`, `direction`, `float`, `list-style-type`, `object-fit`, `object-position`, `opacity`, `overflow`, `vertical-align`, `writing-mode`, `position`, `top`, `right`, `bottom`, `left`, `z-index`, `box-shadow`, `aspect-ratio`, `container-type`, `--*` (custom properties).

---

## 5. Content Formatting

### `wpautop(text: string, br?: boolean): string`

Converts double line breaks to `<p>` tags and optionally converts remaining single line breaks to `<br />`.

**Algorithm (exact sequence):**

1. Return `''` if text is only whitespace.
2. Pad text with a trailing `\n`.
3. **Preserve `<pre>` blocks:** Replace each `<pre>…</pre>` span with a placeholder `<pre wp-pre-tag-N></pre>`. The original content is stored for restoration at end.
4. Collapse sequences of two or more `<br>` / `<br/>` tags to `\n\n`.
5. Add `\n\n` before and after opening/closing block-level tags. Block tags: `table thead tfoot caption col colgroup tbody tr td th div dl dd dt ul ol li pre form map area blockquote address style p h1-h6 hr fieldset legend section article aside hgroup header footer nav figure figcaption details menu summary`.
6. Add `\n\n` after `<hr>` self-closing tags.
7. Normalize `\r\n` and `\r` to `\n`.
8. Replace `\n` inside HTML tags with ` <!-- wpnl --> ` placeholders (protects tag attributes from getting converted).
9. Collapse `<option>` surrounding whitespace.
10. Collapse `<object>`, `<param>`, `<embed>` surrounding whitespace.
11. Collapse `<source>`, `<track>` surrounding whitespace.
12. Collapse `<figcaption>` surrounding whitespace.
13. Reduce 3+ consecutive `\n` to 2.
14. Split on `\n\s*\n` to get paragraph segments.
15. Wrap each segment in `<p>` and `</p>\n`.
16. Remove empty `<p></p>` pairs.
17. Move `<p>content</div|address|form>` → `<p>content</p></div>`.
18. Unwrap `<p>` wrapping block-level tags.
19. Fix `<p><li...>` wrapping.
20. Move `<p><blockquote>` → `<blockquote><p>`.
21. Remove orphaned `<p>` before block elements.
22. Remove orphaned `</p>` after block elements.
23. If `br === true` (default):
    - Protect `<script>`, `<style>`, `<svg>`, `<math>` content by replacing their internal `\n` with `<WPPreserveNewline />` placeholders.
    - Normalize `<br>` / `<br/>` to `<br />`.
    - Replace `\n` not preceded by `<br />` → `<br />\n`.
    - Restore `<WPPreserveNewline />` → `\n`.
24. Remove `<br />` immediately following block-level closing/opening tags.
25. Remove `<br />` before certain opening/closing block elements.
26. Strip trailing `\n` before `</p>`.
27. Restore placeholder `<pre>` blocks.
28. Restore `<!-- wpnl -->` placeholders to `\n`.

---

### `wptexturize(text: string, reset?: boolean): string`

Converts plain-text typographic characters to their typographically correct HTML entity equivalents (smart quotes, dashes, etc.).

**Skipped elements:** Content inside `<pre>`, `<code>`, `<kbd>`, `<style>`, `<script>`, `<tt>` tags, and inside registered shortcodes, is never texturized. A push/pop stack tracks entry into and exit from these zones.

**Static replacements (simple string substitutions, run first):**
- `...` → `&#8230;` (ellipsis)
- ` `` ` → `&#8220;` (opening double quote, backtick style)
- `''` → `&#8221;` (closing double quote)
- ` (tm)` → ` &#8482;` (trademark)
- Cockney contractions: `'tain't` → `&#8217;tain&#8217;t`, etc. (localized list)

**Dynamic apos/quote replacements (regex-based):**

Single quotes / apostrophes:
- `'99'` or `'99"` at end of sentence → abbreviated year: apostrophe + closing quote
- `'99` (abbreviated year) → `&#8217;` + digits
- Quoted numbers like `'0.42'` → opening single quote + number + closing single quote
- `'` after `(`, `[`, `{`, `"`, `-`, or start of string → opening single quote (`&#8216;`)
- `'` in a word (not preceded/followed by space or punctuation) → apostrophe (`&#8217;`)
- Prime detection: `9'` after a digit → prime (`&#8242;`); otherwise closing single quote

Double quotes:
- Quoted numbers like `"42"` → opening + number + closing double quote
- `"` after `(`, `[`, `{`, `-`, or start of string (not followed by spaces) → opening double quote (`&#8220;`)
- Closing quote logic: inside a sentence segment that started with opening quote, rightmost `"` before end-of-sentence punctuation is treated as closing quote; ambiguous cases prefer closing quote over prime; remaining `"` → closing double quote (`&#8221;`)
- Double prime: digit followed by `"` → `&#8243;`

Dashes:
- `---` → `&#8212;` (em dash)
- ` -- ` (space-surrounded double dash) → `&#8212;` (em dash)
- `--` (not at `xn--`) → `&#8211;` (en dash)
- ` - ` (space-surrounded single dash) → `&#8211;` (en dash)

Multiplication sign:
- Pattern `9x9` (non-zero digit × digit, but not `0x9999`) → `&#215;`

Ampersand cleanup:
- `&` not already part of a valid entity → `&#038;`

**Configuration:** The static/dynamic pattern arrays are built once on first call (or when `reset === true`). The `run_wptexturize` filter can short-circuit the entire function.

---

### `wp_rel_nofollow(text: string): string`

Adds `rel="nofollow"` to all `<a>` tags in HTML content.

**Algorithm:**
1. `stripslashes(text)` (pre-save filter receives slashed data).
2. Find all `<a ...>` open tags with a regex.
3. For each tag: parse existing attributes via `wp_kses_hair`. If the link is internal (same host), remove `nofollow` from the rel value. If there is already a `rel` attribute, merge `nofollow` into its space-separated value list (deduplicated). Rebuild the `<a>` tag.
4. `wp_slash(text)`.

---

### `wp_rel_ugc(text: string): string`

Identical to `wp_rel_nofollow` but adds `rel="nofollow ugc"`.

---

### `capital_P_dangit(text: string): string`

Corrects the misspelling "Wordpress" (lowercase p) to "WordPress".

**Context-aware behavior:**
- When running on the `the_title` or `wp_title` filter: simple global replace of `Wordpress` → `WordPress`.
- Otherwise (body content context): only replaces `Wordpress` when preceded by a space, opening curly single quote `&#8216;`, opening curly double quote `&#8220;`, `>`, or `(`. This prevents false positives inside URLs.

---

### `make_clickable(text: string): string`

Converts plain-text URLs, www/ftp addresses, and email addresses to clickable `<a>` tags.

**Algorithm:**
1. Split text on HTML tags (tags are preserved literally, text nodes are processed).
2. Inside `<code>`, `<pre>`, `<script>`, `<style>` blocks: skip (track nesting depth).
3. For long text chunks (>10,000 chars): split on whitespace boundaries at ~2100 char intervals.
4. For each text chunk, pad with leading/trailing spaces, then apply three sequential regex replacements:
   - **URLs with scheme:** Match `scheme://...` (up to ~2000 chars), balance parentheses, strip trailing `.,;:)`, wrap with `<a href="url">url</a>`. Add `rel="nofollow"` for external http/https links. Add `rel="ugc"` when inside a comment context.
   - **www/ftp:** Match `www.` or `ftp.` domains, prepend `http://`, apply same wrapping.
   - **Email:** Match `local@domain.tld`, wrap with `<a href="mailto:...">`.
5. After all substitutions: clean up accidentally nested links: `<a...><a...>text</a></a>` → `<a...>text</a>`.

---

### `wp_trim_words(text: string, numWords?: number, more?: string): string`

Trims text to a specified number of words and appends a suffix if truncated.

| Parameter | Default |
|---|---|
| `numWords` | `55` |
| `more` | `'&hellip;'` |

**Algorithm:**
1. `wp_strip_all_tags(text)` — strip HTML first.
2. If word count type starts with `'characters'` and charset is UTF-8: split text by individual UTF-8 characters (for East Asian languages). Otherwise split on `[\n\r\t ]+`.
3. Take the first `numWords + 1` chunks.
4. If count > `numWords`: pop the last chunk, join remainder, append `more`.
5. Otherwise join all chunks.
6. Fire filter `wp_trim_words`.

---

### `wp_trim_excerpt(text?: string, post?: WP_Post | number): string`

Generates an excerpt from post content.

**Algorithm:**
1. If `text` is non-empty: apply `wp_trim_excerpt` filter and return.
2. If empty: fetch post content, strip shortcodes, strip Gutenberg blocks, strip footnotes, run through `the_content` filter (with `wp_filter_content_tags` temporarily unhooked to avoid processing image tags needlessly).
3. Apply `excerpt_length` filter (default `55`) to determine word count.
4. Apply `excerpt_more` filter (default `' [&hellip;]'`) to determine suffix.
5. Call `wp_trim_words(text, excerptLength, excerptMore)`.
6. Fire filter `wp_trim_excerpt`.

---

## 6. Encoding / Decoding

### `wp_specialchars_decode(text: string, quoteStyle?: number | string): string`

The inverse of `_wp_specialchars`. Converts HTML entities back to their characters.

**Entities decoded depending on `quoteStyle`:**

| quoteStyle | Decoded entities |
|---|---|
| `ENT_NOQUOTES` (default) | `&lt;` `&gt;` `&amp;` `&#038;` `&#x26;` `&#060;` `&#062;` |
| `ENT_COMPAT` or `'double'` | Above + `&quot;` `&#034;` `&#x22;` |
| `'single'` | Above (base) + `&#039;` `&#x27;` |
| `ENT_QUOTES` | All of the above |

**Process:** First normalize zero-padded numeric entities (e.g. `&#039;` → `&#039;`, `&#0*39;` → `&#039;`), then apply a string translation table.

---

### `wp_check_invalid_utf8(text: string, strip?: boolean): string`

Validates UTF-8 encoding. Only runs when the site charset is configured as UTF-8 (cached on first call).

- If charset is not UTF-8: returns input unchanged.
- If text is valid UTF-8: returns unchanged.
- If text contains invalid sequences and `strip === false` (default): returns `''`.
- If text contains invalid sequences and `strip === true`: returns text with invalid sequences replaced by U+FFFD (the Unicode replacement character `\uFFFD`).

Since WordPress 6.9, stripping replaces with the replacement character rather than deleting bytes.

---

### `seems_utf8(str: string): boolean`

**Deprecated** since WordPress 6.9. Use `wp_is_valid_utf8` instead.

Validates UTF-8 by walking each byte and verifying continuation bytes. Accepts 1–6 byte sequences (UTF-8 has a maximum of 4, so 5- and 6-byte sequences are accepted by this function but are not valid Unicode). Returns `true` if the string is consistent with UTF-8 encoding.

---

### `utf8_uri_encode(utf8String: string, length?: number, encodeAsciiCharacters?: boolean): string`

Percent-encodes non-ASCII bytes for use in URI components.

**Algorithm:** Walk byte-by-byte.
- ASCII bytes (< 128): output as-is, or percent-encode if `encodeAsciiCharacters === true`.
- Multi-byte sequences: collect all bytes of the sequence and percent-encode each byte as `%HH`.
- If `length > 0`: stop before the encoded result would exceed `length` bytes. For multi-byte sequences, the check uses `numOctets * 3` bytes.

Returns a string where all non-ASCII bytes are percent-encoded.

---

### `rawurlencode_deep(value: unknown): unknown`

Recursively applies `rawurlencode` to all strings in a nested array or object structure. Non-string scalar values are left unchanged. Uses `map_deep` for recursion.

---

## 7. Slug / URL Functions

### `sanitize_title_for_query(title: string): string`

Calls `sanitize_title(title, '', 'query')`. The `'query'` context skips `remove_accents`, making it suitable for database lookups where the slug is already stored in transliterated form.

---

### `remove_accents(text: string, locale?: string): string`

Transliterates accented Latin characters and some Unicode characters to their ASCII equivalents.

**Early exit:** If the string contains no bytes with value ≥ 0x80, return unchanged.

**UTF-8 path:** Normalize from NFD to NFC form first (if `normalizer_normalize` is available). Then apply a `strtr` mapping.

**Selected mappings (UTF-8):**

Currency/specials:
- `€` (U+20AC) → `E`
- `£` (U+00A3) → `` (empty string)

Latin-1 Supplement (U+00C0–U+00FF): Standard mapping to unaccented ASCII equivalents. Examples: `À`→`A`, `Ç`→`C`, `Ø`→`O`, `ß`→`s`, `æ`→`ae`, `ÿ`→`y`, `Þ`→`TH`, `þ`→`th`.

Latin Extended-A (U+0100–U+017F): Full mapping. Examples: `Ā`→`A`, `ā`→`a`, `Ĳ`→`IJ`, `ĳ`→`ij`, `Œ`→`OE`, `œ`→`oe`, `ſ`→`s`.

Latin Extended-B (U+018F–U+021B): `Ə`→`E`, `ǝ`→`e`, `Ș`→`S`, `ș`→`s`, `Ț`→`T`, `ț`→`t`.

Vietnamese diacritics: Full mapping covering all tonal diacritic combinations for AEIOUWY.

Chinese/Pinyin diacritics on vowels: `ǖ`→`u`, `ǘ`→`u`, `Ǎ`→`A`, etc.

**Locale-specific overrides (applied after base map):**
- German (`de*`): `Ä`→`Ae`, `ä`→`ae`, `Ö`→`Oe`, `ö`→`oe`, `Ü`→`Ue`, `ü`→`ue`, `ß`→`ss`
- Danish (`da_DK`): `Æ`→`Ae`, `æ`→`ae`, `Ø`→`Oe`, `ø`→`oe`, `Å`→`Aa`, `å`→`aa`
- Catalan (`ca`): `l·l`→`ll`
- Serbian/Bosnian (`sr_RS`, `bs_BA`): `Đ`→`DJ`, `đ`→`dj`

**Non-UTF-8 path (ISO-8859-1):** Uses a byte-level `strtr` for common Latin-1 characters, then handles 9 two-character mappings for digraphs like `AE`, `DH`, `TH`, `ss`, etc.

---

### `wp_strip_all_tags(text: string, removeBreaks?: boolean): string`

Strips all HTML tags including the content of `<script>` and `<style>` elements (unlike PHP's native `strip_tags` which preserves their content).

**Algorithm:**
1. If null, return `''`.
2. If not scalar: emit `E_USER_WARNING` and return `''`.
3. `preg_replace('@<(script|style)[^>]*?>.*?</\1>@si', '', text)` — remove script/style blocks with their content.
4. `strip_tags(text)` — strip remaining HTML tags.
5. If `removeBreaks === true`: replace all whitespace runs (including `\n`, `\r`, `\t`) with a single space.
6. `trim`.

---

## 8. Date / Time Formatting

All date functions use the site timezone configured in WordPress settings (`timezone_string` option, or `gmt_offset` as fallback). The PHP `DateTimeZone` object for the site is returned by `wp_timezone()`.

### `mysql2date(format: string, date: string, translate?: boolean): string | number | false`

Converts a MySQL datetime string (or any PHP-parseable date string) to the requested format.

| Parameter | Notes |
|---|---|
| `format` | PHP date format string, or `'U'` / `'G'` for Unix timestamp |
| `date` | Any string parseable by PHP's `date_create()` |
| `translate` | Whether to use `wp_date()` for locale-aware formatting. Default `true` |

- Returns `false` if `date` is empty or not parseable.
- `'G'` or `'U'` format: returns `timestamp + timezone_offset` (legacy behavior, integer).
- `translate === true`: delegates to `wp_date(format, timestamp, timezone)`.
- `translate === false`: calls `$datetime->format(format)` directly.

---

### `current_time(type: string, gmt?: boolean): number | string`

Returns the current time.

| `type` | Returns |
|---|---|
| `'timestamp'` or `'U'` | Integer Unix timestamp (+ UTC offset if `gmt === false`) |
| `'mysql'` | String in `'Y-m-d H:i:s'` format |
| Any PHP format string | Formatted string |

- `gmt === true`: use UTC.
- `gmt === false` (default): use site timezone.
- For `'timestamp'` / `'U'` with `gmt === false`: returns `time() + gmt_offset * 3600` (note: this is a quirky legacy value, not a standard Unix timestamp).

---

### `date_i18n(format: string, timestampWithOffset?: number | false, gmt?: boolean): string`

Legacy date formatting with i18n support. Accepts a "timestamp with offset" (the result of `strtotime()` on a local time string), which is a non-standard value.

- If `timestampWithOffset` is omitted: uses `current_time('timestamp', gmt)`.
- If format is `'U'`: returns the timestamp integer as a string (not a formatted date).
- If `gmt === true` and no timestamp: uses UTC current time via `wp_date(format, null, UTC)`.
- If no timestamp and not GMT: uses `wp_date(format)` (site timezone).
- If timestamp provided: converts the "timestamp with offset" back to a local DateTime, then calls `wp_date`.
- Fires filter `date_i18n`.

---

### `wp_date(format: string, timestamp?: number | null, timezone?: DateTimeZone): string | false`

The modern, preferred date formatting function. Accepts a true Unix timestamp (not summed with offset).

**Algorithm:**
1. `timestamp === null` → use `time()`.
2. Create DateTime from `@{timestamp}` (UTC epoch).
3. Set to target timezone (site timezone if not specified).
4. If locale has translated month/weekday names: walk the format string character by character. Replace `D` (abbreviated weekday), `F` (full month), `l` (full weekday), `M` (abbreviated month), `a`/`A` (am/pm meridiem) with locale-translated values (escaped with `addcslashes` to prevent interpretation as format chars). Backslash-escaped chars are preserved literally.
5. Format the DateTime.
6. Run result through `wp_maybe_decline_date` (handles grammatical case declension for certain locales).
7. Fire filter `wp_date`.

---

### `get_gmt_from_date(dateString: string, format?: string): string`

Converts a date/time string in the site's local timezone to UTC.

- Parses `dateString` using `date_create(dateString, wp_timezone())`.
- Returns `gmdate(format, 0)` (epoch in UTC) if parse fails.
- Converts to UTC timezone and formats. Default format: `'Y-m-d H:i:s'`.

---

### `get_date_from_gmt(dateString: string, format?: string): string`

Converts a UTC date/time string to the site's local timezone.

- Parses `dateString` using `date_create(dateString, UTC)`.
- Returns `gmdate(format, 0)` if parse fails.
- Converts to site timezone and formats.

---

### `human_time_diff(from: number, to?: number): string`

Returns a human-readable description of the difference between two Unix timestamps.

`to` defaults to `time()` (now).

Difference thresholds (in seconds; MINUTE=60, HOUR=3600, DAY=86400, WEEK=604800, MONTH=2629440, YEAR=31557600):

| Diff range | Format |
|---|---|
| < 60 s | `"N second(s)"` (min 1) |
| 60 s – 3600 s | `"N minute(s)"` (rounded, min 1) |
| 3600 s – 86400 s | `"N hour(s)"` (rounded, min 1) |
| 86400 s – 604800 s | `"N day(s)"` (rounded, min 1) |
| 604800 s – 2629440 s | `"N week(s)"` (rounded, min 1) |
| 2629440 s – 31557600 s | `"N month(s)"` (rounded, min 1) |
| ≥ 31557600 s | `"N year(s)"` (rounded, min 1) |

Fires filter `human_time_diff`.

---

### `human_readable_duration(duration: string): string | false`

Converts a duration string in `HH:MM:SS` or `MM:SS` format (optionally negative-prefixed) to a human-readable string.

- Strips leading `-`.
- Validates format: `HH:MM:SS` must match `/^([0-9]+):([0-5]?[0-9]):([0-5]?[0-9])$/`, `MM:SS` must match `/^([0-5]?[0-9]):([0-5]?[0-9])$/`.
- Builds an array of `"N hour(s)"`, `"N minute(s)"`, `"N second(s)"` as applicable.
- Returns `implode(', ', parts)`.
- Returns `false` for invalid input.

---

## 9. Number / Size Formatting

### `number_format_i18n(number: number, decimals?: number): string`

Formats a number according to the current locale.

Uses `$wp_locale->number_format['decimal_point']` and `$wp_locale->number_format['thousands_sep']` if the locale object is available. Falls back to PHP `number_format` with English defaults. Fires filter `number_format_i18n`.

---

### `size_format(bytes: number | string, decimals?: number): string | false`

Converts a number of bytes to the largest appropriate human-readable unit.

**Unit ladder (largest first):**
`YB` (yottabyte = 2⁸⁰), `ZB` (2⁷⁰), `EB` (2⁶⁰), `PB` (2⁵⁰), `TB` (2⁴⁰), `GB` (2³⁰), `MB` (2²⁰), `KB` (2¹⁰ = 1024), `B` (1).

- If `bytes === 0`: return `"0 B"` (using `number_format_i18n`).
- Walk from largest to smallest; return `number_format_i18n(bytes / unitSize, decimals) + ' ' + unitSymbol` for the first unit where `bytes >= unitSize`.
- If bytes < 1 and not 0: returns `false` (no unit fits).
- Unit symbols are translatable via `_x`.

```typescript
sizeFormat(1024)         // "1 KB"
sizeFormat(1536, 1)      // "1.5 KB"
sizeFormat(1073741824)   // "1 GB"
```

---

### `wp_convert_bytes_to_hr(bytes: number): string`

An older alias with the same behavior as `size_format`. Not recommended for new code; use `size_format` directly.

---

## 10. String Utilities

### `str_starts_with`, `str_ends_with`, `str_contains` — WP Polyfills

WordPress defines polyfills for these PHP 8.0 built-ins for PHP 7.x compatibility. They behave identically to the native PHP functions:

```typescript
function strStartsWith(haystack: string, needle: string): boolean {
  return needle === '' || haystack.slice(0, needle.length) === needle;
}

function strEndsWith(haystack: string, needle: string): boolean {
  return needle === '' || haystack.slice(-needle.length) === needle;
}

function strContains(haystack: string, needle: string): boolean {
  return needle === '' || haystack.includes(needle);
}
```

---

### `balanceTags(text: string, force?: boolean): string`

Balances HTML tags if the `use_balanceTags` site option is enabled, or if `force === true`. Delegates to `force_balance_tags`. Returns `text` unchanged if balancing is disabled.

---

### `force_balance_tags(text: string): string`

Parses and closes unclosed HTML tags using a stack algorithm. Also handles self-closing tags and prevents non-nestable tags from being double-opened.

**Algorithm:**
1. Fix `< !--` → `<    !--` (WordPress legacy quirk for space after `<`).
2. Fix `<` before digits → `&lt;` (handles expressions like `LOVE <3`).
3. While the regex finds a tag pattern `<(/?)tagname(attrs)>`:
   - **Closing tag (`/tagname`):** If stack is empty, discard. If top of stack matches, pop and emit `</tagname>`. If top doesn't match, search deeper in the stack — close all intermediate tags.
   - **Self-closing (void) tags** (`area base basefont br col command embed frame hr img input isindex link meta param source track wbr`): if presented with `/`, keep it. If not self-closed, add ` /` to produce `<br />` style.
   - **Non-nestable tags** where the same tag is already open: close the previous one first.
   - **Regular opening tags:** push to stack, emit tag.
4. After processing: close all remaining open tags in LIFO order.
5. Restore `<    !--` → `< !--` (undo step 1 for intentional use), then `< !--` → `<!--`.

**Nestable tags** (may be repeated in the stack): `article aside blockquote details div figure object q section span`.

---

### `tag_escape(tagName: string): string`

Sanitizes a tag name for safe output.

- `strtolower(preg_replace('/[^a-zA-Z0-9-_:]/', '', tagName))`
- Allows hyphens (custom elements like `<my-element>`), colons (namespace prefixes), underscores.
- Fires filter `tag_escape`.

---

### `zeroise(number: number, threshold: number): string`

Pads `number` with leading zeros until it is at least `threshold` characters wide.

```typescript
zeroise(5, 4)    // "0005"
zeroise(5000, 4) // "5000"
```

Equivalent to `sprintf('%0Ns', number)` where N is threshold.

---

### `backslashit(value: string): string`

Adds backslashes before every ASCII letter (A–Z, a–z) in the string. If the string begins with a digit, prepends `\\` (two backslashes) before the digit.

Equivalent to `addcslashes(value, 'A..Za..z')` with special handling for leading digits.

---

### `trailingslashit(value: string): string`

Ensures the string ends with exactly one forward slash.

```typescript
trailingslashit('/foo/bar')   // '/foo/bar/'
trailingslashit('/foo/bar/')  // '/foo/bar/'
trailingslashit('/foo/bar//') // '/foo/bar/'
```

Implementation: `untrailingslashit(value) + '/'`

---

### `untrailingslashit(value: string): string`

Removes trailing forward slashes and backslashes.

`value.replace(/[/\\]+$/, '')`

---

### `path_join(base: string, path: string): string`

Joins a base path and a relative path.

- If `path` is absolute (begins with `/` on Unix or `C:\` / `//` on Windows), return `path` unchanged.
- Otherwise: `rtrim(base, '/') + '/' + path`.

---

### `wp_normalize_path(path: string): string`

Normalizes a filesystem path.

**Algorithm:**
1. If the path is a PHP stream wrapper (`scheme://...`), extract and preserve the `scheme://` prefix.
2. Replace all `\` with `/` (Windows → Unix separators).
3. Replace multiple consecutive `/` with single `/`, except for the initial `//` in network paths (UNC paths on Windows).
4. If path starts with `X:/` (Windows drive letter), uppercase the drive letter.
5. Reattach the stream wrapper prefix.

---

## 11. Hash / HMAC

### `wp_hash(data: string, scheme?: string, algo?: string): string`

Computes an HMAC of `data` using a site-specific salt as the key.

| Parameter | Default |
|---|---|
| `scheme` | `'auth'` |
| `algo` | `'md5'` |

**Process:**
1. Retrieve the site salt for `scheme` via `wp_salt(scheme)`. WordPress derives salts from constants (`AUTH_KEY`, `SECURE_AUTH_KEY`, etc.) or generates random values stored in the database.
2. Throw `InvalidArgumentException` if `algo` is not in `hash_hmac_algos()`.
3. Return `hash_hmac(algo, data, salt)`.

**Schemes:** `'auth'`, `'secure_auth'`, `'logged_in'`, `'nonce'` (each uses a different salt constant).

This function is pluggable — it can be replaced by a custom implementation.

---

### `wp_hash_password(password: string): string`

Hashes a password using bcrypt by default (since WordPress 6.8).

**Algorithm (default, non-pluggable path):**
1. If password is longer than 4096 bytes: return `'*'` (invalid hash sentinel).
2. Get algorithm from `wp_hash_password_algorithm` filter (default `PASSWORD_BCRYPT`).
3. Get options from `wp_hash_password_options` filter (default `{}`).
4. If algorithm is not bcrypt: `password_hash(password, algorithm, options)`.
5. If algorithm is bcrypt: pre-hash via `base64_encode(hash_hmac('sha384', trim(password), 'wp-sha384', true))`. This pre-hashing retains entropy for passwords > 72 bytes (bcrypt's input limit). Return `'$wp' + password_hash(preHashed, PASSWORD_BCRYPT, options)`.

The `$wp` prefix distinguishes WordPress bcrypt hashes from vanilla bcrypt hashes (e.g. those created by other systems or by phpass).

This function is pluggable — if `$wp_hasher` (phpass instance) is set globally, it is used instead.

---

### `wp_rand(min?: number, max?: number): number`

Generates a cryptographically random non-negative integer.

| Parameter | Default |
|---|---|
| `min` | `0` |
| `max` | `4294967295` (0xFFFFFFFF) |

- Uses `random_int(min, max)` for cryptographic quality.
- Both min and max are cast to integers (floats are truncated).
- Returns `0` if both min and max are `0`.

This function is pluggable.

---

## 12. TypeScript Interface Sketch

```typescript
// ---- Types ----

type QuoteStyle = 'ENT_NOQUOTES' | 'ENT_COMPAT' | 'ENT_QUOTES' | 'single' | 'double';

interface AttributeRule {
  required?: true;
  valueless?: 'y' | 'n';
  maxlen?: number;
  minlen?: number;
  maxval?: number;
  minval?: number;
  values?: string[];
  value_callback?: string;
}

type AttributeMap = Record<string, true | AttributeRule>;
type AllowedHtmlMap = Record<string, AttributeMap | true>;

// ---- Output Escaping ----

interface OutputEscaping {
  escHtml(text: string): string;
  escAttr(text: string): string;
  escUrl(url: string, protocols?: string[], context?: 'display' | 'db'): string;
  escUrlRaw(url: string, protocols?: string[]): string;
  sanitizeUrl(url: string, protocols?: string[]): string;
  escJs(text: string): string;
  escTextarea(text: string): string;
  escXml(text: string): string;
  tagEscape(tagName: string): string;
  wpJsonEncode(value: unknown, flags?: number, depth?: number): string | false;
}

// ---- Input Sanitization ----

interface InputSanitization {
  sanitizeTextField(str: string): string;
  sanitizeTextareaField(str: string): string;
  sanitizeEmail(email: string): string;
  sanitizeUrl(url: string, protocols?: string[]): string;
  sanitizeKey(key: string): string;
  sanitizeTitle(title: string, fallbackTitle?: string, context?: string): string;
  sanitizeTitleWithDashes(title: string, rawTitle?: string, context?: string): string;
  sanitizeTitleForQuery(title: string): string;
  sanitizeUser(username: string, strict?: boolean): string;
  sanitizeHtmlClass(classname: string, fallback?: string): string;
  sanitizeMimeType(mimeType: string): string;
  sanitizeFileName(filename: string): string;
  sanitizeOption(option: string, value: unknown): unknown;
  removeAccents(text: string, locale?: string): string;
}

// ---- KSES HTML Allowlist ----

interface KsesSystem {
  wpKses(content: string, allowedHtml: AllowedHtmlMap | string, allowedProtocols?: string[]): string;
  wpKsesPost(data: string): string;
  wpKsesData(data: string): string;
  wpKsesAllowedHtml(context: string | AllowedHtmlMap): AllowedHtmlMap;
  wpKsesNoNull(content: string, options?: { slash_zero?: 'keep' | 'remove' }): string;
  wpKsesBadProtocol(content: string, allowedProtocols: string[]): string;
  wpKsesNormalizeEntities(content: string, context?: 'html' | 'xml'): string;
  safecssFilterAttr(css: string): string;
}

// ---- Content Formatting ----

interface ContentFormatting {
  wpautop(text: string, br?: boolean): string;
  wptexturize(text: string, reset?: boolean): string;
  wpRelNofollow(text: string): string;
  wpRelUgc(text: string): string;
  capitalPDangit(text: string): string;
  makeClickable(text: string): string;
  wpTrimWords(text: string, numWords?: number, more?: string): string;
  wpTrimExcerpt(text?: string, post?: unknown): string;
  balanceTags(text: string, force?: boolean): string;
  forceBalanceTags(text: string): string;
}

// ---- Encoding / Decoding ----

interface EncodingDecoding {
  wpSpecialcharsDecode(text: string, quoteStyle?: QuoteStyle | number): string;
  wpCheckInvalidUtf8(text: string, strip?: boolean): string;
  seemsUtf8(str: string): boolean; // deprecated since 6.9
  utf8UriEncode(utf8String: string, length?: number, encodeAsciiCharacters?: boolean): string;
  rawurlencodeDeep(value: unknown): unknown;
}

// ---- Slug / URL ----

interface SlugUrl {
  sanitizeTitleForQuery(title: string): string;
  removeAccents(text: string, locale?: string): string;
  wpStripAllTags(text: string, removeBreaks?: boolean): string;
  wpMakeLinkRelative(link: string): string;
}

// ---- Date / Time ----

interface DateTimeFormatting {
  mysql2date(format: string, date: string, translate?: boolean): string | number | false;
  currentTime(type: string, gmt?: boolean): number | string;
  dateI18n(format: string, timestampWithOffset?: number | false, gmt?: boolean): string;
  wpDate(format: string, timestamp?: number | null, timezone?: unknown): string | false;
  getGmtFromDate(dateString: string, format?: string): string;
  getDateFromGmt(dateString: string, format?: string): string;
  humanTimeDiff(from: number, to?: number): string;
  humanReadableDuration(duration?: string): string | false;
}

// ---- Number / Size ----

interface NumberFormatting {
  numberFormatI18n(number: number, decimals?: number): string;
  sizeFormat(bytes: number | string, decimals?: number): string | false;
}

// ---- String Utilities ----

interface StringUtilities {
  zeroise(number: number, threshold: number): string;
  backslashit(value: string): string;
  trailingslashit(value: string): string;
  untrailingslashit(value: string): string;
  pathJoin(base: string, path: string): string;
  wpNormalizePath(path: string): string;
  normalizeWhitespace(str: string): string;
  tagEscape(tagName: string): string;
}

// ---- Hash / HMAC ----

interface HashingFunctions {
  wpHash(data: string, scheme?: string, algo?: string): string;
  wpHashPassword(password: string): string;
  wpRand(min?: number, max?: number): number;
}
```

---

## 13. Design Patterns to Carry Over

1. **Output escaping is context-specific.** There is no single "escape this" function. Each output context (`esc_html`, `esc_attr`, `esc_url`, `esc_js`, `esc_textarea`, `esc_xml`) has different encoding requirements. A value safe in one context may be dangerous in another. In TypeScript, model these as separate typed functions and rely on linter rules to enforce their correct usage at call sites.

2. **Escaping does not belong at storage time.** `esc_html` and `esc_attr` are not sanitizers. Storing escaped data corrupts it for non-HTML consumers (JSON APIs, emails, etc.) and produces double-encoding on subsequent renders. Store raw, escape late.

3. **KSES is a strict allowlist, not a blocklist.** The system strips anything that is not explicitly permitted. Tags and attributes not in the allowlist are removed — never passed through. In TypeScript, the `AllowedHtmlMap` type should be treated as an exhaustive permit map.

4. **Global attributes are additive.** Every tag in the post allowlist inherits a base set of global attributes (`class`, `id`, `style`, `data-*`, `aria-*`, `dir`, `lang`, etc.). Any implementation must merge these with tag-specific attributes rather than replacing them.

5. **`data-*` is a wildcard, not a specific attribute.** When `'data-*': true` appears in an attribute map, it authorizes any attribute whose name matches `/^data-[a-z0-9_-]+$/`. The lookup happens at attribute check time, not at allowlist construction time.

6. **`wpautop` is a multi-pass regex pipeline, not a parser.** The algorithm applies a sequence of substitutions to coerce block-separated content into paragraphs. The exact order of operations matters — applying them out of order produces different (incorrect) HTML. Preserve the sequence precisely.

7. **`wptexturize` uses a protected-zone stack.** Content inside certain elements (`<pre>`, `<code>`, etc.) is skipped by maintaining an entry/exit stack. Any implementation must track this state across the entire input string, not per-tag.

8. **`remove_accents` is locale-aware.** The same Unicode character maps to different ASCII sequences in different locales (e.g. German `ü` → `ue` instead of `u`). The locale check must happen before the base transliteration map is applied, since locale rules override base rules.

9. **`sanitize_title` vs `sanitize_title_with_dashes`.** These are two different functions with a filter relationship: `sanitize_title` handles the lifecycle (accents, fallback, filter dispatch) and `sanitize_title_with_dashes` handles the actual character stripping. The `sanitize_title` filter is the extension point; plugins register on it to override slug production entirely.

10. **`wp_hash` uses scheme-based salts, not a single site key.** Different operation types (authentication tokens, nonces, sessions) use different salts so that a leaked salt from one context cannot be exploited in another. TypeScript implementations must replicate the scheme dispatch to maintain the same security properties.

11. **`wp_hash_password` pre-hashes for bcrypt's 72-byte limit.** Bcrypt silently truncates passwords longer than 72 bytes. WordPress uses SHA-384 pre-hashing to retain full password entropy before bcrypt hashing. The `$wp` prefix on the resulting hash marks it as having been pre-hashed, so `wp_check_password` can apply the same pre-hash before `password_verify`.

12. **Filters permeate every public function.** Nearly every function documented here fires at least one filter that can override or post-process the return value. Any TypeScript reimplementation that wants to be extensible must replicate the filter hook call sites at the same points in the pipeline.

13. **`size_format` uses binary (powers of 1024), not SI (powers of 1000).** 1 KB = 1024 bytes, not 1000 bytes. The unit labels are intentionally inconsistent with SI: `KB` means kibibyte. This is documented as a known inaccuracy. Implementations must use 1024-based thresholds to match the existing output.

14. **Timezone handling separates "timestamp with offset" from "true Unix timestamp".** `date_i18n` accepts the legacy PHP pattern of adding the UTC offset to a timestamp, while `wp_date` accepts a true Unix timestamp. New code should use `wp_date`. Preserve the `date_i18n` quirk in the TypeScript signature to avoid breaking existing callers.

## Tovu Reconstruction Notes

### Why this exists

Formatting exists to keep unsafe content out of output and to turn raw content into browser-ready markup without forcing callers to hand-roll the same escapes and transforms. For Tovu, the important boundary is context-specific escaping plus a small set of opinionated content transforms.

### What Tovu should preserve

- Separate escaping functions for HTML, attributes, URLs, JavaScript, XML, and textarea contexts
- Allowlist-based HTML sanitization with predictable stripping behavior
- Locale-aware transliteration and slug generation
- The content-formatting pipeline for paragraphing, texturizing, and shortcode-adjacent cleanup

### What Tovu can simplify

- Tovu does not need every historical compatibility branch if its serializers are typed and explicit
- Legacy regex quirks can be reduced when the output contract is narrower
- The main rule is to preserve late escaping and avoid storing rendered output

### Possible Tovu seams

- `src/formatting/escape/` for context-specific escape helpers
- `src/formatting/sanitize/` for HTML allowlists and content cleanup
- `src/formatting/text/` for slug, accent, and paragraph transforms
- ports should keep translation, locale, and filter hooks separate from pure string transforms

### Suggested priority

- `V1`: escaping, sanitization, and the transforms required by content rendering
- `Later`: edge-case compatibility helpers and rare legacy formatting branches
