# Shortcodes - Specification

**Source files analyzed:**
- `wp-includes/shortcodes.php`
- `wp-includes/formatting.php` (`shortcode_unautop()` integration)

---

## 1. Overview

The shortcode subsystem is WordPress's bbcode-like runtime for transforming bracketed tags such as `[gallery]`, `[embed]`, or custom plugin tags into HTML at render time. The core design is intentionally global and callback-driven:

1. Tags are registered in a single global registry.
2. Content is scanned for candidate tags using a generated regular expression.
3. Matching shortcodes are parsed into attributes and optional enclosed content.
4. A registered callback generates replacement output.
5. HTML-aware helpers decide whether shortcodes inside attributes, comments, or raw elements should be expanded or escaped.

The runtime does **not** sanitize shortcode output for you. It normalizes and tokenizes input, but the callback is responsible for escaping its own HTML, URLs, and attributes.

The file also exposes helper APIs for:

- registering and removing shortcodes
- detecting whether content contains a given shortcode
- extracting shortcode tags from content
- parsing and normalizing attributes
- stripping shortcode tags from content without rendering them

---

## 2. Registry and Lifecycle

### `$shortcode_tags`

The runtime registry is a single global array:

```php
$shortcode_tags = array();
```

Each key is the shortcode tag name and each value is the callback that will be invoked when that tag is encountered.

### `add_shortcode( $tag, $callback )`

Registers a shortcode callback.

**Validation rules:**
- Empty or whitespace-only names are rejected.
- Tag names cannot contain spaces or reserved characters:
  - `<`
  - `>`
  - `&`
  - `/`
  - `[`
  - `]`
  - `=`
  - ASCII control characters and whitespace

If the tag is invalid, WordPress calls `_doing_it_wrong()` and returns without registering anything.

**Duplicate handling:**
- If a tag is registered more than once, the last registration wins.
- There is no namespace isolation. Tag names are flat and global.

**Important nuance:**
- `add_shortcode()` stores the callback without validating callability.
- `shortcode_exists( $tag )` only checks whether a tag name is present in the registry, not whether the callback is callable.
- `do_shortcode_tag()` performs the callable check at render time.

### `remove_shortcode( $tag )`

Unsets a single registered tag from the global registry.

### `remove_all_shortcodes()`

Replaces the registry with a fresh empty array. This is the efficient way to clear shortcode state for a request.

### `shortcode_exists( $tag )`

Returns whether a key exists in `$shortcode_tags`.

---

## 3. Rendering Pipeline

### `do_shortcode( $content, $ignore_html = false )`

This is the main entry point.

**Pipeline:**
1. Return immediately if the content contains no `[` characters.
2. Return immediately if no shortcodes are registered.
3. Scan for candidate tag names using a fast regex.
4. Intersect the candidates with the registered tag list.
5. Return immediately if nothing matches.
6. Add the shortcode rendering context filter to `wp_get_attachment_image_context` if it is not already present.
7. Run `do_shortcodes_in_html_tags()` to protect or process shortcode-like text found inside HTML elements.
8. Build the full shortcode regex for the matched tag names.
9. Replace each match with `do_shortcode_tag()`.
10. Restore escaped bracket entities with `unescape_invalid_shortcodes()`.
11. Remove the temporary context filter if this scope added it.

### Runtime context hook

During shortcode rendering, WordPress temporarily filters `wp_get_attachment_image_context` through `_filter_do_shortcode_context()`, which returns:

```php
'do_shortcode'
```

This gives downstream image rendering code a reliable signal that the current image call originated from shortcode processing.

### `apply_shortcodes( $content, $ignore_html = false )`

Alias for `do_shortcode()`. This exists for newer code paths but uses the same runtime.

---

## 4. Tokenization and Nested Behavior

### `get_shortcode_regex( $tagnames = null )`

Generates the parser regex.

If `$tagnames` is omitted, all registered tags are used. Tag names are escaped with `preg_quote()` and joined with `|` into one alternation group.

The regex has six capture groups:

1. Optional second opening bracket for escaped syntax.
2. Shortcode name.
3. Raw attribute string.
4. Self-closing slash.
5. Enclosed content.
6. Optional second closing bracket for escaped syntax.

The regex is intentionally shared by:

- `do_shortcode_tag()`
- `strip_shortcode_tag()`
- `shortcode_unautop()` in `formatting.php`

Core comments warn that changing the regex requires updating those consumers together.

### Candidate scan

Before running the full parser, `do_shortcode()` and `strip_shortcodes()` do a cheap scan:

```php
preg_match_all( '@\[([^<>&/\[\]\x00-\x20=]++)@', $content, $matches );
```

This collects possible tag names after `[` and avoids running the expensive parser when no registered shortcode is present.

### Nested shortcode behavior

The parser is **one-pass** over the content string. It does not recursively re-parse the enclosed content of a shortcode before handing it to the callback.

Operationally:
- A shortcode callback receives enclosed content as raw text in `$content`.
- If the callback wants nested shortcode rendering, it must call `do_shortcode( $content )` itself.
- The helper functions `has_shortcode()` and `get_shortcode_tags_in_content()` do recurse into capture group 5, so they can detect tags nested inside shortcode bodies.

### `has_shortcode( $content, $tag )`

Returns `true` only if:

- the content contains `[` at all
- the target tag is registered
- a parsed shortcode match has the requested tag name
- or one of the matched shortcode bodies recursively contains it

This is a structural search, not a naive substring search.

### `get_shortcode_tags_in_content( $content )`

Returns an array of registered shortcode names found in the content.

Properties of the result:
- Depth-first order.
- Nested shortcode bodies are traversed recursively.
- Duplicate tag names are preserved; the function does not deduplicate.
- If no bracket is present or no shortcode matches are found, returns an empty array.

---

## 5. Attribute Parsing and Normalization

### `get_shortcode_atts_regex()`

Returns the attribute parser regex used by `shortcode_parse_atts()`.

It accepts these forms:

- `name="value"`
- `name='value'`
- `name=value`
- `"value"`
- `'value'`
- `bareword`

### `shortcode_parse_atts( $text )`

Parses the raw attribute string captured from the shortcode opening tag.

**Normalization steps:**
1. Replace non-breaking spaces and zero-width spaces with regular spaces.
2. Match the attribute string with the shortcode attribute regex.
3. Lowercase all attribute names.
4. Strip slashes from captured values with `stripcslashes()`.
5. Store bare values in a numerically indexed array.
6. Reject malformed attribute values containing unclosed HTML elements.

**Important details:**
- The parser returns an array in all cases in modern WordPress, even if the input cannot be parsed.
- Attribute keys are normalized to lowercase, so shortcode callbacks should treat names as case-insensitive.
- Positional attributes are supported alongside keyed attributes.
- Values that appear to contain broken HTML are blanked out rather than returned verbatim.

### `shortcode_atts( $pairs, $atts, $shortcode = '' )`

Combines caller-defined defaults with user-supplied attributes.

**Behavior:**
- Only keys listed in `$pairs` are copied into the output.
- Missing keys are filled from `$pairs` defaults.
- Extra user-supplied attributes are discarded.
- If `$shortcode` is provided, the dynamic filter `shortcode_atts_{$shortcode}` runs on the merged result.

This function is the standard whitelist step for shortcode callbacks that accept named attributes.

---

## 6. Callback Dispatch and Escaping

### `do_shortcode_tag( $m )`

This is the callback invoked by `preg_replace_callback()`.

**Flow:**
1. If the match is escaped as `[[tag]]`, return the original text without the outer brackets.
2. Parse the raw attribute string with `shortcode_parse_atts()`.
3. Reject the tag if the registered callback is not callable.
4. Fire `pre_do_shortcode_tag`.
5. If that filter returns a non-false value, short-circuit and return it.
6. Call the registered shortcode callback with:
   - `$attr`
   - `$content` or `null`
   - `$tag`
7. Wrap the callback output with the original escape brackets stored in `$m[1]` and `$m[6]`.
8. Fire `do_shortcode_tag` and return the filtered output.

### Hooks

#### `pre_do_shortcode_tag`

This is the short-circuit hook.

- Return `false` to allow normal callback execution.
- Return any other value to replace the shortcode output entirely.
- Since WordPress 6.5.0, `$attr` is always an array here.

#### `do_shortcode_tag`

This filters the final rendered shortcode output.

### Escaping rules

Shortcode rendering does **not** add escaping automatically. The callback must escape according to output context:

- HTML text: `esc_html()`
- HTML attributes: `esc_attr()`
- URLs: `esc_url()`
- inline JS: `esc_js()`

The runtime only normalizes and dispatches. It does not sanitize the HTML that a callback returns.

### Escaped syntax

`[[foo]]` is treated as a literal escape form. The outer brackets are stripped and the shortcode text is returned without being executed.

---

## 7. HTML-Aware Processing and Stripping

### `do_shortcodes_in_html_tags( $content, $ignore_html, $tagnames )`

This helper processes shortcode-like text found inside HTML elements.

**Core behavior:**
- Normalizes entity forms of `[` and `]` before placeholder handling.
- Splits content with `wp_html_split()`.
- Skips non-tag text segments.
- Encodes stray brackets when only one side appears.
- Encodes all brackets in HTML comments and CDATA sections.
- When `$ignore_html` is true, encodes brackets inside all HTML elements.

**Attribute handling:**
- The function parses tag attributes with `wp_kses_attr_parse()`.
- If parsing fails, it may still process odd markup patterns that start with bracketed shortcode-like text.
- For valid elements, it processes each attribute value separately.
- Unquoted or bare shortcode-like attribute values are treated as trusted/unfiltered markup in the current code path.
- Quoted attribute values that change after shortcode expansion are passed through `wp_kses_one_attr()` to re-sanitize the attribute.

This is the main reason shortcode expansion inside HTML attributes behaves more conservatively than plain-text shortcode expansion.

### `unescape_invalid_shortcodes( $content )`

Restores `&#91;` and `&#93;` back to literal brackets after processing.

This step exists so shortcode processing does not permanently break constructs like conditional comments.

### `strip_shortcodes( $content )`

Removes registered shortcode tags from content without rendering them.

**Pipeline:**
1. Return early if there are no `[` characters or no registered shortcodes.
2. Scan for candidate tags.
3. Build the removal tag list from all registered tags.
4. Allow `strip_shortcodes_tagnames` to filter the list.
5. Intersect the removal list with the tags actually present in the content.
6. Run `do_shortcodes_in_html_tags( $content, true, $tagnames )` to neutralize shortcodes inside HTML elements.
7. Replace each matched shortcode with `strip_shortcode_tag()`.
8. Restore escaped brackets with `unescape_invalid_shortcodes()`.

### `strip_shortcode_tag( $m )`

Removes the shortcode wrapper while preserving escaped syntax.

- `[[foo]]` becomes `[foo]`
- `[foo]` becomes an empty string wrapper result
- Enclosed content is not preserved by this helper

---

## 8. Operational Implications

- Shortcode names are global and last-write-wins. Two plugins registering the same tag will collide, and the later registration controls rendering.
- Callbacks must be callable at render time. A tag can exist in the registry yet still fail when the callback is invalid.
- Nested shortcode rendering is callback-driven. The runtime passes enclosed content through unchanged unless the callback explicitly re-renders it.
- `do_shortcodes_in_html_tags()` makes shortcode expansion inside HTML attributes safer but also more conservative. Shortcodes embedded in quoted attributes can be sanitized through KSES after expansion.
- `ignore_html = true` is the hard skip mode for HTML elements. `strip_shortcodes()` uses it because its job is removal, not expansion.
- `shortcode_unautop()` in `formatting.php` uses the same tag registry and regex family to keep standalone shortcodes from being wrapped in `<p>` tags.
- The shortcode system is not a general content sanitizer. It is a parser and dispatch layer. Security depends on each callback producing valid, escaped output.
- The helper APIs are useful for indexing and inspection:
  - `has_shortcode()` for presence checks
  - `get_shortcode_tags_in_content()` for discovery
  - `strip_shortcodes()` for feeds, excerpts, and fallback text paths

## Tovu Reconstruction Notes

### Why this exists

Shortcodes exist as a late-bound content transformation layer that lets registered callbacks turn bracket syntax into HTML. The key contract is global registration plus deterministic parsing order, not the exact shortcode syntax itself.

### What Tovu should preserve

- A registry of tag names mapped to render callbacks
- Parsing that respects HTML boundaries and nested shortcode behavior
- Explicit helpers for detection, extraction, and stripping
- Late rendering so shortcode output can depend on the current request context

### What Tovu can simplify

- Tovu does not need a global flat registry if namespaces or module-scoped registries are cleaner
- Regex-heavy compatibility rules can be reduced if the parser is built around clearer tokenization
- The system should stay a renderer, not a sanitizer

### Possible Tovu seams

- `src/content/shortcodes/registry/` for tag registration
- `src/content/shortcodes/parser/` for tokenization and nested handling
- `src/content/shortcodes/render/` for callback dispatch and HTML safety boundaries
- the content pipeline should keep shortcode expansion isolated from storage and sanitization

### Suggested priority

- `V1`: registry, parsing, and render dispatch
- `Later`: legacy compatibility helpers and uncommon HTML edge cases
