# HTML API - WordPress-to-TypeScript Rewrite Spec

**Source files analyzed:**
- `wp-settings.php`
- `wp-includes/html-api/html5-named-character-references.php`
- `wp-includes/html-api/class-wp-html-attribute-token.php`
- `wp-includes/html-api/class-wp-html-span.php`
- `wp-includes/html-api/class-wp-html-doctype-info.php`
- `wp-includes/html-api/class-wp-html-text-replacement.php`
- `wp-includes/html-api/class-wp-html-decoder.php`
- `wp-includes/html-api/class-wp-html-tag-processor.php`
- `wp-includes/html-api/class-wp-html-unsupported-exception.php`
- `wp-includes/html-api/class-wp-html-active-formatting-elements.php`
- `wp-includes/html-api/class-wp-html-open-elements.php`
- `wp-includes/html-api/class-wp-html-token.php`
- `wp-includes/html-api/class-wp-html-stack-event.php`
- `wp-includes/html-api/class-wp-html-processor-state.php`
- `wp-includes/html-api/class-wp-html-processor.php`

---

## 1. Overview

The HTML API is WordPress core's low-level HTML processing stack. It is not a DOM implementation and it does not expose a single tree model. Instead it is a layered set of streaming processors and compact value objects that can scan, query, and rewrite HTML without fully materializing a document tree.

The main split is:

- `WP_HTML_Tag_Processor` for linear scanning and lexical mutation of tags, attributes, comments, text nodes, and doctypes.
- `WP_HTML_Processor` for higher-level HTML5 document and fragment parsing with a constrained tree model and safe-bail behavior.

The design goal is explicit in the source: preserve HTML correctness, never corrupt markup on unsupported input, and prefer early abort over partial tree reconstruction when the parser cannot guarantee safety. The Interactivity API, block rendering, and other render-time systems build on this stack.

---

## 2. Bootstrap And Load Order

The HTML API is loaded from `wp-settings.php` after the dependency/loader layer and before the block processor and HTTP stack.

The required order matters:

1. `html5-named-character-references.php` must load first because `WP_HTML_Decoder` reads the global token map.
2. The small value-object classes load next: attribute token, span, doctype info, text replacement, decoder.
3. `WP_HTML_Tag_Processor` loads before `WP_HTML_Unsupported_Exception`, the stack/open-element helpers, token, processor state, and `WP_HTML_Processor`.

That ordering makes the public classes safe to include without autoloading and keeps the processor's internal dependencies explicit.

---

## 3. Processing Model

### 3.1 Tag Processor: Linear Scanner Plus Lexical Patches

`WP_HTML_Tag_Processor` scans the source string from left to right and tracks the current token with byte offsets. It does not recurse into the full document structure. Instead, it recognizes one token at a time and records the changes as `WP_HTML_Text_Replacement` objects.

This gives it a narrow but reliable contract:

- It can find the next tag with `next_tag()`.
- It can walk every lexical token with `next_token()`.
- It can mutate only the current opening tag with `set_attribute()`, `remove_attribute()`, `add_class()`, and `remove_class()`.
- It can revisit saved locations with bookmarks.
- It emits updated HTML only at the end via `get_updated_html()`.

The token model is compact and byte-oriented. `WP_HTML_Attribute_Token` stores the attribute name, value location, span length, and whether the attribute was boolean. `WP_HTML_Span` and `WP_HTML_Text_Replacement` are the generic position-and-length primitives used throughout the patch pipeline.

### 3.2 HTML Processor: Safe Tree-Aware Parser

`WP_HTML_Processor` extends the tag processor and adds the parts needed for HTML5 document parsing:

- a stack of open elements
- a stack of active formatting elements
- insertion-mode state
- breadcrumb tracking for nested queries
- unsupported-parse detection
- fragment and full-document creation paths

Its contract is stricter than the tag processor's: if the input enters unsupported territory, the processor should bail instead of guessing. That includes table-associated content, foreign-content parsing, adoption/fostering cases, and other HTML5 behaviors WordPress does not fully implement.

---

## 4. Main Classes

### 4.1 `WP_HTML_Tag_Processor`

This is the core render-time mutation engine. The important public surface is:

- `__construct( $html )`
- `next_tag( $query = null )`
- `next_token()`
- `set_attribute( $name, $value )`
- `remove_attribute( $name )`
- `add_class( $class_name )`
- `remove_class( $class_name )`
- `set_bookmark( $name )`
- `release_bookmark( $name )`
- `seek( $bookmark_name )`
- `get_token_type()`
- `get_token_name()`
- `get_updated_html()`

Key runtime rules:

- Only matched opening tags are mutable.
- Closing tags are read-only and cause mutation methods to return `false`.
- Attribute names are validated aggressively; WordPress rejects `>`, `&`, control characters, and noncharacters.
- Boolean `false` removes an attribute, boolean `true` emits a valueless boolean attribute, and scalar values are escaped before insertion.
- `class` updates are special-cased so `add_class()` and `remove_class()` can accumulate independently until a direct `set_attribute( 'class', ... )` call replaces them.
- Quirks-mode matching is ASCII-case-insensitive for class names.

`next_token()` exposes the underlying token stream. It can surface:

- `#tag`
- `#text`
- `#comment`
- `#doctype`
- `#cdata-section`
- `#presumptuous-tag`
- `#funky-comment`

That is the main tokenizer model in WordPress: a linear token recognizer that keeps enough lexical information to rewrite the source without building a DOM.

### 4.2 `WP_HTML_Processor`

`WP_HTML_Processor` is the higher-level parser. The main entry points are:

- `WP_HTML_Processor::create_fragment( $html, $context = '<body>', $encoding = 'UTF-8' )`
- `WP_HTML_Processor::create_full_parser( $html, $known_definite_encoding = 'UTF-8' )`
- `next_tag()`
- `next_token()`
- `get_breadcrumbs()`
- `get_last_error()`
- `get_unsupported_exception()`
- the same mutation and bookmark APIs inherited from the tag processor

The fragment constructor is the safer entrypoint for render-time HTML rewriting because it establishes a parsing context. The full-parser constructor is for complete document parsing and is the path that understands doctype state, insertion modes, and open-element stack behavior.

The parser is intentionally incomplete in places where WordPress cannot guarantee correctness. When that happens it records an unsupported exception and stops.

---

## 5. Support Types

These classes are not public application APIs in the same sense as the processors, but they are part of the runtime model and should be preserved in a TypeScript decomposition:

- `WP_HTML_Token` is the parser's internal token reference. It carries the bookmark name, node name, namespace, self-closing flag, integration-point metadata, and destruction callback.
- `WP_HTML_Doctype_Info` captures the parsed doctype name, public identifier, system identifier, and resulting compatibility mode.
- `WP_HTML_Processor_State` stores insertion mode, stack state, and parsing flags for the full parser.
- `WP_HTML_Open_Elements` manages the open-element stack and scope checks.
- `WP_HTML_Active_Formatting_Elements` tracks formatting-element reconstruction state.
- `WP_HTML_Stack_Event` records push/pop operations for the element queue.
- `WP_HTML_Unsupported_Exception` is the structured bail-out path with token name, byte offset, raw token text, and stack snapshots.
- `WP_HTML_Decoder` decodes HTML character references in text nodes and attribute values.

`html5-named-character-references.php` provides the precomputed entity map consumed by `WP_HTML_Decoder`.

---

## 6. Runtime Contracts

### 6.1 Token and Parse Semantics

`WP_HTML_Tag_Processor` is deliberately lexical. It does not attempt to rebuild a tree. As a result:

- Queries are forward-only.
- Bookmarks are the only supported back-reference mechanism.
- Changes are accumulated as text replacements, not node edits.
- `get_updated_html()` is the point where lexical patches are merged back into a string.

`WP_HTML_Processor` does build tree context, but only within a supported subset of HTML5. Its breadcrumbs reflect the implied outer wrapper elements as well as the real ancestry of a match.

### 6.2 HTML5 Edge Cases

The processor stack explicitly handles:

- omitted optional tags
- unexpected closing tags
- self-closing syntax on non-void elements
- script/style/title/textarea raw-text behavior
- character-reference decoding in attributes and text nodes
- document compatibility mode derived from a doctype

Unsupported behaviors are not papered over. When the parser cannot safely proceed, it stops.

### 6.3 Character References And Escaping

`WP_HTML_Decoder` is the shared entity decoder. It reads the HTML5 named-character-reference table and decodes spans in either `data` or `attribute` context. This matters because entity acceptance differs between text nodes and attribute values.

`set_attribute()` on the tag processor uses the same escaping principles in reverse: it prevents tag-breaking syntax from being injected while still preserving the intended attribute value.

---

## 7. Integration Points

### 7.1 Interactivity API

The Interactivity API uses `WP_HTML_Tag_Processor` as its server-side directive processor. Its directive engine relies on:

- `next_tag()` / `next_token()` for linear traversal
- `get_attribute_names_with_prefix()` to find directive attributes
- `set_attribute()`, `remove_attribute()`, `add_class()`, `remove_class()`, and `set_content_between_balanced_tags()` for mutation
- balanced-template helpers for `data-wp-each`

That means the HTML API is not just a utility layer; it is a core runtime dependency of server-side interactivity hydration.

### 7.2 Block Rendering

Block rendering can also use the HTML API indirectly when content is rewritten during render. The important implication is that content processors need to work on partially trusted HTML and must fail safely instead of assuming DOM completeness.

### 7.3 Operational Implications

When rewriting this subsystem in TypeScript, keep these constraints:

- Preserve byte offsets and replace-in-place semantics.
- Preserve the distinction between lexical scanning and tree-aware parsing.
- Preserve the fail-closed behavior on unsupported markup.
- Preserve quirks-mode class matching.
- Preserve bookmark semantics and one-way scan behavior.

Any implementation that silently normalizes malformed HTML will diverge from WordPress core behavior.

---

## 8. Tovu Reconstruction Notes

### 8.1 Why this exists

This subsystem exists because content rewriting in a CMS often has to operate on partially trusted, partially malformed HTML without pretending it is a perfect DOM. WordPress’s solution is to separate lexical mutation from deeper tree-aware parsing.

### 8.2 What Tovu should preserve

- Safe server-side HTML rewriting for partially trusted markup
- Clear distinction between lightweight lexical mutation and heavier parse-aware processing
- Fail-closed behavior on unsupported markup
- Deterministic replacement semantics rather than “best effort DOM cleanup”

### 8.3 What Tovu can simplify

- Tovu does not need to replicate every HTML5 edge case immediately
- A smaller supported subset is fine if failures are explicit and safe
- The important thing is not to hide malformed markup behind silent normalization

### 8.4 Possible Tovu seams

- `src/core/ports/HtmlMutationPort.ts` for lexical rewrite operations
- `src/core/ports/HtmlProcessingPort.ts` for tree-aware or context-aware processing
- interactivity and content-render pipelines should depend on those ports rather than rolling bespoke string transforms

### 8.5 Suggested priority

- `V1`: safe lexical rewrite primitives and fail-closed mutation behavior
- `Later`: deeper tree-aware processing, more HTML5 edge handling, richer diagnostics/bookmarks
