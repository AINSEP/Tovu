# Block Engine — Specification

**Source files analyzed:**
- `wp-includes/blocks.php`
- `wp-includes/class-wp-block.php`
- `wp-includes/class-wp-block-type.php`
- `wp-includes/class-wp-block-type-registry.php`
- `wp-includes/class-wp-block-parser.php`
- `wp-includes/class-wp-block-parser-block.php`
- `wp-includes/class-wp-block-parser-frame.php`
- `wp-includes/class-wp-block-list.php`
- `wp-includes/class-wp-block-supports.php`
- `wp-includes/class-wp-block-patterns-registry.php`
- `wp-includes/class-wp-block-pattern-categories-registry.php`
- `wp-includes/class-wp-block-bindings-registry.php`
- `wp-includes/class-wp-block-bindings-source.php`

---

## 1. Overview

The Block Engine is the content-model and rendering system at the center of WordPress since version 5.0. Post content is stored as a **serialized block document** — a string of HTML interleaved with HTML comment delimiters that carry block names and JSON-encoded attributes. At render time this document is **parsed** back into a structured tree and then **rendered** into pure HTML.

The pipeline has four phases:

1. **Serialization** — the block editor serializes a tree of block objects into the comment-delimited string stored in `post_content`.
2. **Parsing** — `parse_blocks()` / `WP_Block_Parser` tokenizes the comment delimiters and reconstructs the tree as an array of plain parsed-block objects.
3. **Instantiation** — each parsed-block array is wrapped in a `WP_Block` instance that resolves block type metadata, applies defaults, propagates context, and hydrates inner blocks.
4. **Rendering** — `WP_Block::render()` produces final HTML by either passing saved inner HTML through block-support filters or invoking a registered `render_callback`.

The entry point for page rendering is `do_blocks()`, which is hooked onto `the_content` at priority 9. Everything else flows from there.

---

## 2. Block Grammar and Serialization Format

### 2.1 Wire Format

Block content is plain UTF-8 text stored in the `post_content` database column. The grammar is deliberately simple: blocks are delimited by HTML comments.

**Named block with no attributes and no content (void):**
```
<!-- wp:paragraph /-->
```

**Named block with attributes, no content (void):**
```
<!-- wp:image {"id":42,"sizeSlug":"large"} /-->
```

**Named block with content:**
```
<!-- wp:paragraph -->
<p>Hello world</p>
<!-- /wp:paragraph -->
```

**Named block with attributes and content:**
```
<!-- wp:heading {"level":2} -->
<h2>My Heading</h2>
<!-- /wp:heading -->
```

**Nested (inner blocks):**
```
<!-- wp:columns -->
<div class="wp-block-columns">
<!-- wp:column -->
<div class="wp-block-column"><!-- wp:paragraph --><p>Left</p><!-- /wp:paragraph --></div>
<!-- /wp:column -->
<!-- wp:column -->
<div class="wp-block-column"><!-- wp:paragraph --><p>Right</p><!-- /wp:paragraph --></div>
<!-- /wp:column -->
</div>
<!-- /wp:columns -->
```

### 2.2 Namespace Rules

Every block name consists of a **namespace** and a **slug** separated by `/`. Example: `core/paragraph`, `my-plugin/my-block`. The `core/` namespace is stripped during serialization so core block comments read as `<!-- wp:paragraph -->` rather than `<!-- wp:core/paragraph -->`. When parsing, if no namespace is found in a comment the parser implicitly prepends `core/`.

Block names must:
- Be entirely lowercase.
- Match the pattern `[a-z0-9-]+/[a-z0-9-]+`.
- Contain no uppercase characters.

### 2.3 Attribute Encoding

The JSON object in a block comment delimiter is produced by `serialize_block_attributes()` which JSON-encodes the attributes with the following post-processing substitutions to prevent the JSON from interfering with HTML comment syntax:

| Original sequence | Encoded as |
|---|---|
| `\\` | `\u005c` |
| `--` | `\u002d\u002d` |
| `<` | `\u003c` |
| `>` | `\u003e` |
| `&` | `\u0026` |
| `\"` | `\u0022` |

The JavaScript `serializeAttributes` function in the block editor must produce identical output.

### 2.4 Classic (Freeform) Blocks

Any content not enclosed in block comment delimiters is treated as a **freeform / classic block**. A classic block has `blockName = null`, `attrs = {}`, empty `innerBlocks`, and its raw HTML as `innerHTML`. The `core/freeform` block type is the registered name for this content. Classic blocks are output verbatim during rendering; no `render_callback` is invoked.

### 2.5 `serialize_block()` and `serialize_blocks()`

`serialize_block(parsedBlock)` reconstructs the wire-format string from a parsed-block object:

1. Iterate `innerContent`. For each string chunk emit it directly; for each `null` placeholder recursively call `serialize_block` on the next `innerBlocks` entry.
2. Pass the assembled content through `get_comment_delimited_block_content(blockName, attrs, content)`.

`serialize_blocks(blocks)` is simply `blocks.map(serialize_block).join('')`.

---

## 3. WP_Block_Type — Block Type Registration Object

`WP_Block_Type` is the plain-data object describing a block type. It is constructed either directly or indirectly through `register_block_type_from_metadata()`.

### 3.1 Properties

```typescript
interface BlockTypeArgs {
  api_version?: number;           // Block API version. Default 1. Currently 3.
  title?: string;                 // Human-readable label shown in the editor inserter.
  category?: string | null;       // Inserter category slug (e.g. "text", "media", "design").
  parent?: string[] | null;       // Block names that this block must be a direct child of.
  ancestor?: string[] | null;     // Block names that this block must appear somewhere inside.
  allowed_blocks?: string[] | null; // Block names that are allowed as direct children of this block.
  icon?: string | null;           // Dashicons slug or SVG string for the editor icon.
  description?: string;           // Longer description shown in the block inspector.
  keywords?: string[];            // Search terms for the inserter.
  textdomain?: string | null;     // i18n textdomain for translatable fields in block.json.
  styles?: BlockStyleVariation[]; // Registered style variations (name, label, isDefault).
  variations?: BlockVariation[] | null; // Registered block variations.
  variation_callback?: (() => BlockVariation[]) | null; // Lazy-loaded variation generator.
  selectors?: Record<string, string>; // Custom CSS selectors for theme.json style generation.
  supports?: BlockSupportsConfig | null; // Feature support flags (see Section 8).
  example?: Record<string, unknown> | null; // Structured example data for the block preview.
  render_callback?: BlockRenderCallback | null; // Server-side render function (makes block dynamic).
  attributes?: Record<string, AttributeSchema> | null; // JSON-Schema-like attribute definitions.
  uses_context?: string[];        // Context keys this block reads from ancestors.
  provides_context?: Record<string, string> | null; // Map of context-key => attribute-name this block publishes.
  block_hooks?: Record<string, BlockHookPosition>; // Automatic insertion relative to anchor blocks.
  editor_script_handles?: string[];   // Script handles enqueued only in the block editor.
  script_handles?: string[];          // Script handles enqueued in editor and on the front end.
  view_script_handles?: string[];     // Script handles enqueued only on the front end.
  view_script_module_ids?: string[];  // ES module IDs enqueued only on the front end.
  editor_style_handles?: string[];    // Style handles enqueued only in the block editor.
  style_handles?: string[];           // Style handles enqueued in editor and on the front end.
  view_style_handles?: string[];      // Style handles enqueued only on the front end.
}

type BlockHookPosition = 'before' | 'after' | 'first_child' | 'last_child';

type BlockRenderCallback = (
  attributes: Record<string, unknown>,
  content: string,
  block: WPBlock
) => string;
```

### 3.2 Global Attributes

Every block type receives the following two attributes automatically regardless of its own attribute definitions:

```typescript
const GLOBAL_ATTRIBUTES: Record<string, AttributeSchema> = {
  lock:     { type: 'object' },  // editor lock settings
  metadata: { type: 'object' },  // block metadata including bindings
};
```

These are merged in during `set_props()` if not already defined by the block.

### 3.3 `is_dynamic()`

Returns `true` if `render_callback` is a callable. A dynamic block re-renders on every page load by invoking its callback. A static block returns the HTML that was saved into `post_content` by the editor.

### 3.4 `prepare_attributes_for_render(attributes)`

Validates incoming attributes against the block's attribute schemas:

1. For each attribute present in the incoming object: if its value fails JSON-schema validation, remove it from the set (it will be replaced by the schema default in the next step).
2. For each attribute defined in the schema but missing from the incoming object: if the schema specifies a `default`, inject it.
3. Return the prepared attribute set.

### 3.5 `get_variations()`

Returns the block's variations array. If `variations` is `null` and a `variation_callback` is set, it is invoked once to populate `variations`. The result is then passed through the `get_block_type_variations` filter.

### 3.6 `get_uses_context()`

Returns the `uses_context` array passed through the `get_block_type_uses_context` filter.

### 3.7 Deprecated Property Shims

The following property names were deprecated in WP 6.1 in favour of the `_handles` array variants. The class uses magic `__get` / `__set` / `__isset` to preserve backward compatibility:

| Deprecated name | Canonical property |
|---|---|
| `editor_script` | `editor_script_handles[0]` |
| `script` | `script_handles[0]` |
| `view_script` | `view_script_handles[0]` |
| `editor_style` | `editor_style_handles[0]` |
| `style` | `style_handles[0]` |

Reading these deprecated properties returns the first element of the corresponding array. Writing them sets or replaces the first element.

### 3.8 Attribute Schema Shape

Each attribute is defined by a schema object:

```typescript
interface AttributeSchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
  default?: unknown;
  // Source fields describe how to extract the attribute from saved HTML:
  source?: 'attribute' | 'text' | 'html' | 'rich-text' | 'query' | 'meta';
  selector?: string;        // CSS selector to locate the element
  attribute?: string;       // HTML attribute name (when source='attribute')
  query?: Record<string, AttributeSchema>; // (when source='query')
  // JSON-schema validation fields:
  enum?: unknown[];
  items?: AttributeSchema;
  properties?: Record<string, AttributeSchema>;
  [key: string]: unknown;
}
```

---

## 4. Block Registration

### 4.1 `register_block_type(blockType, args)`

The primary registration function. Its behavior depends on the type of the first argument:

- If `blockType` is a string that points to an existing file path, delegates to `register_block_type_from_metadata(blockType, args)`.
- If `blockType` is a `WP_Block_Type` instance, registers it directly via the registry (the `args` parameter is ignored).
- Otherwise treats `blockType` as a block name string and passes both arguments to `WP_Block_Type_Registry::register()`.

Returns the registered `WP_Block_Type` instance on success, or `false` on failure.

### 4.2 `register_block_type_from_metadata(fileOrFolder, args)`

Reads a `block.json` file and registers the block type from its contents.

**Argument:** either a path directly to a `block.json` file, or a directory path in which a `block.json` file must exist.

**Metadata loading order:**
1. Check `WP_Block_Metadata_Registry` (centralized manifest cache added in WP 6.7) for a pre-loaded entry.
2. If not found and the file exists on disk, read and JSON-decode `block.json`.
3. If still not found, return `false`.

**Property mapping from `block.json` to WP_Block_Type args:**

| `block.json` key | `WP_Block_Type` property |
|---|---|
| `apiVersion` | `api_version` |
| `name` | `name` |
| `title` | `title` |
| `category` | `category` |
| `parent` | `parent` |
| `ancestor` | `ancestor` |
| `icon` | `icon` |
| `description` | `description` |
| `keywords` | `keywords` |
| `attributes` | `attributes` |
| `providesContext` | `provides_context` |
| `usesContext` | `uses_context` |
| `selectors` | `selectors` |
| `supports` | `supports` |
| `styles` | `styles` |
| `variations` | `variations` |
| `example` | `example` |
| `allowedBlocks` | `allowed_blocks` |

**Translatable fields:** If `textdomain` is set in `block.json` and the metadata file exists on disk, any fields listed in the i18n schema (`block-i18n.json`) are automatically translated via `translate_settings_using_i18n_schema()` before the block type is registered.

**`render` field (WP 6.1+):** If `block.json` includes a `render` field containing a relative path to a PHP file (prefixed with `file:`), a `render_callback` closure is auto-generated that `require`s that PHP file. Inside the PHP file the variables `$attributes`, `$content`, and `$block` are in scope.

**`variations` as PHP file (WP 6.7+):** If the `variations` field is a string (file path rather than array), a `variation_callback` is generated that `require`s the PHP file and returns its value.

**Script registration:** For each of `editorScript`, `script`, and `viewScript` (which may be a single value or array), `register_block_script_handle()` is called to resolve file-based paths to registered WP script handles. The `viewScript` handle is registered with `strategy: 'defer'`. Script handles are placed into `editor_script_handles`, `script_handles`, and `view_script_handles` respectively.

**Module registration:** `viewScriptModule` fields are processed via `register_block_script_module_id()` and placed into `view_script_module_ids`.

**Style registration:** For each of `editorStyle`, `style`, and `viewStyle`, `register_block_style_handle()` is called. The resulting handles populate `editor_style_handles`, `style_handles`, and `view_style_handles`.

**`blockHooks` mapping:** The `block.json` `blockHooks` map (camelCase positions) is converted to snake_case for the `block_hooks` property:

| JSON value | PHP value |
|---|---|
| `before` | `before` |
| `after` | `after` |
| `firstChild` | `first_child` |
| `lastChild` | `last_child` |

A block cannot be hooked to itself; such entries are silently skipped.

**Filters applied:**
- `block_type_metadata` — receives the raw metadata array, may modify it.
- `block_type_metadata_settings` — receives the final settings array before registration.
- `register_block_type_args` — applied inside `WP_Block_Type::set_props()`.

The function ends by calling `WP_Block_Type_Registry::get_instance()->register(name, settings)`.

### 4.3 `unregister_block_type(name)`

Delegates to `WP_Block_Type_Registry::get_instance()->unregister(name)`. Returns the unregistered `WP_Block_Type` on success, `false` if not registered.

### 4.4 `get_dynamic_block_names()`

Returns an array of block-name strings for all registered blocks that have a `render_callback` (i.e., `is_dynamic()` returns `true`).

### 4.5 `WP_Block_Type_Registry`

A **singleton** registry. The single instance is retrieved via `WP_Block_Type_Registry::get_instance()`.

```typescript
class BlockTypeRegistry {
  private registeredBlockTypes: Map<string, WPBlockType> = new Map();
  private static instance: BlockTypeRegistry | null = null;

  static getInstance(): BlockTypeRegistry;

  // Register a block type by name+args, or pass a WP_Block_Type instance directly.
  // Name must match /^[a-z0-9-]+\/[a-z0-9-]+$/ and must not already be registered.
  register(name: string | WPBlockType, args?: BlockTypeArgs): WPBlockType | false;

  // Unregister by name or by passing a WP_Block_Type instance.
  // Returns the removed instance, or false if not found.
  unregister(name: string | WPBlockType): WPBlockType | false;

  // Returns null if not registered.
  getRegistered(name: string | null): WPBlockType | null;

  // Returns the full map as a plain object.
  getAllRegistered(): Record<string, WPBlockType>;

  isRegistered(name: string | null): boolean;
}
```

**Validation on `register()`:**
1. If name contains uppercase characters → reject.
2. If name does not match `/^[a-z0-9-]+\/[a-z0-9-]+$/` → reject.
3. If name is already registered → reject.

### 4.6 `wp_register_block_metadata_collection(path, manifest)` (WP 6.7+)

Delegates to `WP_Block_Metadata_Registry::register_collection()`. Pre-loads a JSON manifest of all block metadata for a directory, avoiding per-block filesystem reads.

### 4.7 `wp_register_block_types_from_metadata_collection(path, manifest?)` (WP 6.8+)

Optionally registers a metadata collection, then iterates all block metadata files provided by `WP_Block_Metadata_Registry::get_collection_block_metadata_files()` and calls `register_block_type_from_metadata()` on each.

---

## 5. WP_Block_Parser — Parsing Algorithm

`WP_Block_Parser` converts a raw content string into a flat array of parsed-block objects. It is a hand-written recursive-descent parser driven by a single regular expression tokenizer.

### 5.1 Entry Point

```typescript
function parseBlocks(content: string): ParsedBlock[] {
  // The class WP_Block_Parser is used internally.
  // The parser class name can be overridden via the 'block_parser_class' filter.
}
```

Exposed publicly as `parse_blocks(content)`.

### 5.2 Data Structures

**ParsedBlock (WP_Block_Parser_Block):**

```typescript
interface ParsedBlock {
  blockName: string | null;     // null for classic/freeform content
  attrs: Record<string, unknown>; // decoded JSON attributes from comment delimiter
  innerBlocks: ParsedBlock[];   // direct child blocks (not all descendants)
  innerHTML: string;            // raw HTML from inside delimiters, after removing inner block markup
  innerContent: (string | null)[]; // interleaved HTML strings and null placeholders for inner blocks
}
```

**ParserFrame (WP_Block_Parser_Frame):**

Internal stack frame used while parsing an open block:

```typescript
interface ParserFrame {
  block: ParsedBlock;           // the partially-built block
  tokenStart: number;           // byte offset of the opening comment
  tokenLength: number;          // byte length of the opening comment
  prevOffset: number;           // byte offset of end of last consumed content
  leadingHtmlStart: number | null; // byte offset where freeform HTML before this block began
}
```

### 5.3 Tokenizer

The tokenizer is a single PCRE regular expression applied with `PREG_OFFSET_CAPTURE` starting from `this.offset`:

```
/<!--\s+(?P<closer>\/)?wp:(?P<namespace>[a-z][a-z0-9_-]*\/)?(?P<name>[a-z][a-z0-9_-]*)\s+(?P<attrs>{(?:(?:[^}]+|}+(?=})|(?!}\s+\/?-->).)*+)?}\s+)?(?P<void>\/)?-->/s
```

From a match this produces:
- `closer` group present → token is a block closer `<!-- /wp:name -->`
- `void` group present → token is a void block `<!-- wp:name /-->`
- Neither → token is a block opener `<!-- wp:name {"k":"v"} -->`
- `namespace` group absent → default namespace is `core/`
- `attrs` group present → JSON-decoded into `attrs` object; on JSON failure treated as empty

### 5.4 Parsing Loop

The parser holds:
- `document`: the full input string
- `offset`: current read position
- `output`: accumulated top-level parsed blocks
- `stack`: the `ParserFrame` array representing the currently open block hierarchy

The loop calls `proceed()` until it returns `false`:

**Token: `no-more-tokens`**
- Stack is empty → flush remaining document as freeform, return false.
- Stack depth is 1 → call `add_block_from_stack()` (implicit closer), return false.
- Stack depth > 1 → repeatedly call `add_block_from_stack()` until stack is empty (implicit multi-level closer), return false.

**Token: `void-block`**
- Flush any freeform HTML between `this.offset` and `started_at` if it exists.
- If stack is empty → push a new `ParsedBlock` with empty content directly to `output`.
- If stack is non-empty → call `add_inner_block()` to attach the void block to the current stack frame.
- Advance `this.offset` past the token.

**Token: `block-opener`**
- Push a new `ParserFrame` onto `this.stack` recording the token position and any leading freeform HTML start offset.
- Advance `this.offset` past the token.

**Token: `block-closer`**
- Stack is empty → error condition: flush remaining as freeform, return false.
- Stack depth is 1 → call `add_block_from_stack(started_at)` to finalize the block, advance offset, return true.
- Stack depth > 1 → pop the top frame, append any HTML between `frame.prevOffset` and `started_at` to the block's `innerHTML` and `innerContent`, then call `add_inner_block()` to attach the completed block to its parent. Advance offset.

### 5.5 Helper Methods

**`add_inner_block(block, tokenStart, tokenLength, lastOffset?)`:**
Takes the top frame from `this.stack` (the parent), appends any HTML content between `parent.prevOffset` and `tokenStart` to the parent's `innerHTML` / `innerContent` as a string chunk, then appends `null` to `innerContent` (a placeholder for the inner block), and pushes the inner block into `parent.block.innerBlocks`. Updates `parent.prevOffset`.

**`add_block_from_stack(endOffset?)`:**
Pops the top `ParserFrame`. Appends any remaining HTML from `frame.prevOffset` to `endOffset` (or end of document) to the block's `innerHTML` / `innerContent`. If `frame.leadingHtmlStart` is set, flushes the HTML before the block opener as a freeform entry into `output`. Then pushes the completed block to `output`.

**`freeform(innerHtml)`:**
Creates a `ParsedBlock` with `blockName = null`, empty attrs, no inner blocks, and `innerContent = [innerHtml]`.

### 5.6 `innerContent` vs `innerHTML` Semantics

`innerHTML` is the concatenation of all HTML string fragments within the block comment delimiters, **excluding** the markup of any inner blocks. It is the canonical "saved HTML" of a block.

`innerContent` is a mixed array of strings and `null` values. Each string is an HTML fragment; each `null` is a placeholder that corresponds positionally to an entry in `innerBlocks`. Iterating `innerContent` and substituting each `null` with the rendered output of the corresponding `innerBlock` (in order) reconstructs the full rendered output of the block.

---

## 6. WP_Block — Runtime Block Instance

`WP_Block` wraps a parsed block array together with the resolved block type, propagated context, and hydrated inner blocks. It is constructed on demand during rendering, not during parsing.

### 6.1 Properties

```typescript
class WPBlock {
  parsedBlock: ParsedBlock;           // the raw parsed block data
  name: string | null;               // block name
  blockType: WPBlockType | null;     // resolved from registry, or null if unrecognized
  context: Record<string, unknown>;  // context values this block consumes (subset of available)
  innerBlocks: WPBlockList;          // lazy-instantiated list of child WP_Block instances
  innerHtml: string;                 // from parsedBlock.innerHTML
  innerContent: (string | null)[];   // from parsedBlock.innerContent

  // Private / protected:
  availableContext: Record<string, unknown>; // full context from ancestors
  registry: BlockTypeRegistry;       // the registry used to resolve block types
  attributes: Record<string, unknown>; // lazy via __get; prepared with defaults
}
```

### 6.2 Construction

```
WPBlock(parsedBlock, availableContext?, registry?)
```

1. Store `parsedBlock` and `name`.
2. Resolve the `blockType` from the registry.
3. Store `availableContext`.
4. Call `refresh_context_dependents()`.

### 6.3 `refresh_context_dependents()`

Called on construction and whenever `context` or `parsedBlock` is modified externally (e.g., by the `render_block_context` or `render_block_data` filter).

1. Merge `this.context` into `this.availableContext` (backward-compatibility: allows direct mutation of `context` by external code to take effect).
2. For each key listed in `blockType.uses_context`: if that key exists in `availableContext`, copy its value into `this.context`.
3. Call `refresh_parsed_block_dependents()`.

### 6.4 `refresh_parsed_block_dependents()`

1. If `parsedBlock.innerBlocks` is non-empty, compute `child_context`:
   - Start with `availableContext`.
   - For each entry in `blockType.provides_context` (a map of `context_key => attribute_name`): if that attribute exists in `this.attributes`, add it to `child_context` under `context_key`.
   - Create a new `WP_Block_List` from `parsedBlock.innerBlocks`, `child_context`, and the registry.
2. Set `innerHtml = parsedBlock.innerHTML` if non-empty.
3. Set `innerContent = parsedBlock.innerContent` if non-empty.

### 6.5 Lazy `attributes` Property

`attributes` is not set on the object at construction time. On first access:
1. Take `parsedBlock.attrs` (or `{}` if absent).
2. Call `blockType.prepare_attributes_for_render(attrs)` to fill defaults and strip invalid values.
3. Cache the result.

### 6.6 `render(options?)` — The Render Pipeline

```typescript
interface RenderOptions {
  dynamic?: boolean; // default true
}
```

**Step 1: Track asset queues.**
Snapshot the current style queue, script queue, and script module queue so that newly enqueued assets can be detected after rendering (for empty-block dequeue logic).

**Step 2: Interactive block tracking.**
If this block has `supports.interactivity = true` or `supports.interactivity.interactive = true` and no root interactive block is currently set, mark this block as the root interactive block. After this block finishes rendering, `wp_interactivity_process_directives()` is called on its output.

**Step 3: Process block bindings.**
Call `process_block_bindings()` (see Section 12). If any computed attribute values are returned, merge them over `this.attributes`.

**Step 4: Determine if dynamic.**
`is_dynamic = options.dynamic && this.name !== null && blockType !== null && blockType.is_dynamic()`

**Step 5: Build `block_content` from `innerContent`.**
Skip this step if `options.dynamic === true` AND `blockType.skip_inner_blocks` is set.

Iterate `this.innerContent`:
- For each string chunk: append directly to `block_content`.
- For each `null` placeholder: get the corresponding `inner_block` by index from `this.inner_blocks`.
  1. Fire `pre_render_block` filter (signature: `(null, innerBlock.parsedBlock, parentBlock)`). If non-null returned, use it as the inner block's contribution.
  2. Otherwise: fire `render_block_data` filter on `innerBlock.parsedBlock`. Fire `render_block_context` filter on `innerBlock.context`. If context changed, call `inner_block.refresh_context_dependents()`; else if parsedBlock changed, call `inner_block.refresh_parsed_block_dependents()`. Then call `inner_block.render()` and append result.

**Step 6: Apply computed binding attribute HTML replacement.**
If block bindings produced `computed_attributes` and `block_content` is non-empty, iterate each computed attribute and call `replace_html(block_content, attribute_name, source_value)` to update the actual HTML.

**Step 7: Invoke render_callback (dynamic blocks only).**
Set `WP_Block_Supports::$block_to_render = this.parsedBlock`. Call `blockType.render_callback(this.attributes, block_content, this)`. Restore `$block_to_render`.

**Step 8: Enqueue scripts and styles.**
Enqueue all handles from `blockType.script_handles`, `view_script_handles`, `view_script_module_ids`, `style_handles`, and `view_style_handles`.

**Step 9: Apply `render_block` and `render_block_{name}` filters.**

**Step 10: Process Interactivity API directives.**
If this was the root interactive block, call `wp_interactivity_process_directives(block_content)` and clear the root block reference.

**Step 11: Dequeue assets for empty blocks.**
Compare current asset queues to the snapshots from Step 1. If the rendered block content is empty (after trim) and assets were newly enqueued during rendering, dequeue those assets (unless the `enqueue_empty_block_content_assets` filter returns `true` for this block name, or `wp_enqueue_scripts` fired during rendering — indicating footer-targeted enqueues).

Return `block_content`.

---

## 7. `do_blocks()` — Top-Level Render Orchestrator

```typescript
function do_blocks(content: string): string
```

Registered on `the_content` at priority 9 (before standard content filters like `wpautop` at priority 10).

**Algorithm:**
1. Call `parse_blocks(content)` → array of `ParsedBlock`.
2. Iterate the top-level blocks, calling `render_block(block)` on each.
3. After rendering each block, set `blocks[i] = null` to free memory (prevents OOM on large posts).
4. If the content contains blocks and `wpautop` is in the `the_content` filter: remove `wpautop` for this invocation and add `_restore_wpautop_hook` at `priority + 1` to restore it for subsequent calls.
5. Return the concatenated rendered output.

**`render_block(parsedBlock)`** — the per-block orchestrator:
1. Apply `pre_render_block` filter. If a non-null value is returned, short-circuit and return it.
2. Capture `source_block = parsedBlock` (for passing the unmodified original to filters).
3. Apply `render_block_data` filter (receives `parsedBlock`, `source_block`, `parent_block`).
4. Build initial context: if a global `$post` exists, seed `{ postId: post.ID, postType: post.post_type }`.
5. Apply `render_block_context` filter (receives `context`, `parsedBlock`, `parent_block`).
6. Instantiate `new WP_Block(parsedBlock, context)`.
7. Return `block.render()`.

**`parse_blocks(content)`:**
Instantiates the class named by the `block_parser_class` filter (default: `WP_Block_Parser`) and calls its `parse()` method.

---

## 8. Block Supports

Block supports are feature flags declared in the `supports` property of a block type. They serve two roles:

1. **Editor UI**: signals to the block editor which sidebar panels and controls to show.
2. **Runtime HTML injection**: a set of registered support processors inject CSS classes and inline styles into the block's outermost wrapper element at render time.

### 8.1 WP_Block_Supports

`WP_Block_Supports` is a singleton. It maintains a map of registered support processors, each identified by a name.

```typescript
class BlockSupports {
  private blockSupports: Map<string, BlockSupportConfig> = new Map();
  static blockToRender: ParsedBlock | null = null; // set around render_callback invocations
  private static instance: BlockSupports | null = null;

  static getInstance(): BlockSupports;
  static init(): void; // called on 'init' action; registers attributes on all block types

  // Register a support processor.
  register(name: string, config: BlockSupportConfig): void;

  // Collect HTML attributes from all registered support processors for the current block.
  applyBlockSupports(): Record<string, string>;

  // After registration, inject support-required attributes into all block types.
  private registerAttributes(): void;
}

interface BlockSupportConfig {
  name: string;
  apply?: (blockType: WPBlockType, attributes: Record<string, unknown>) => Record<string, string>;
  register_attribute?: (blockType: WPBlockType) => void;
}
```

`WP_Block_Supports::$block_to_render` is a static property holding the `ParsedBlock` of the block currently being rendered. It is set inside `WP_Block::render()` immediately before calling the `render_callback` and restored after.

### 8.2 `get_block_wrapper_attributes(extraAttributes?)`

Used inside a dynamic block's render callback to obtain all support-generated HTML attributes for the block wrapper element. Called with an optional map of additional attributes to merge.

Supported merging attributes (merged by space-concatenation if both sides exist):
- `style`
- `class`
- `id`
- `aria-label`

All other extra attributes are appended verbatim.

Returns a string like `class="wp-block-paragraph has-text-color" style="color:#fff"`.

### 8.3 Built-in Support Keys

The `supports` object in a block type registration can include any of these standard keys. Each key that is `true` (or an object with a sub-key set to `true`) enables the corresponding feature:

| Key | Effect |
|---|---|
| `color.background` | Background color picker in the editor; injects `has-background` class and `background-color` style |
| `color.text` | Text color picker; injects `has-text-color` class and `color` style |
| `color.gradients` | Gradient picker |
| `color.link` | Link color control |
| `color.heading` | Heading color control |
| `color.__experimentalDuotone` | Duotone filter support |
| `typography.fontSize` | Font size control; injects `has-{size}-font-size` class or `font-size` inline style |
| `typography.lineHeight` | Line height control |
| `typography.fontFamily` | Font family control |
| `typography.fontWeight` | Font weight control |
| `typography.fontStyle` | Font style control |
| `typography.letterSpacing` | Letter spacing control |
| `typography.textDecoration` | Text decoration control |
| `typography.textTransform` | Text transform control |
| `typography.writingMode` | Writing mode control |
| `spacing.margin` | Margin controls; injects margin styles |
| `spacing.padding` | Padding controls; injects padding styles |
| `spacing.blockGap` | Block gap / child spacing |
| `spacing.customSpacingSize` | Custom spacing toggle |
| `spacing.spacingSizes` | Available spacing sizes |
| `border.color` | Border color control |
| `border.radius` | Border radius control |
| `border.style` | Border style control |
| `border.width` | Border width control |
| `dimensions.minHeight` | Minimum height control |
| `dimensions.aspectRatio` | Aspect ratio control |
| `layout` | Layout controls (constrained, flex, grid) |
| `layout.default` | Default layout settings |
| `layout.allowSwitching` | Toggle to switch layout type |
| `layout.allowEditing` | Allow/hide layout controls |
| `layout.allowInheriting` | Inherit layout from parent |
| `layout.allowSizingOnChildren` | Control child element sizing |
| `position.sticky` | Sticky / fixed position support |
| `interactivity` | Enable the Interactivity API for this block |
| `interactivity.interactive` | Block is interactive (uses directives) |
| `interactivity.clientNavigation` | Block supports client-side navigation |
| `multiple` | Whether multiple instances are allowed. Default `true`. Used by the Block Hooks system |
| `html` | Allow the "Edit as HTML" editor mode |
| `inserter` | Show/hide from the inserter |
| `align` | Alignment toolbar: `true` or `['wide', 'full', 'center', 'left', 'right']` |
| `alignWide` | Wide / full-width alignment specifically |
| `defaultStylePicker` | Show the style picker |
| `reusable` | Allow converting to a synced pattern |
| `lock` | Expose the lock UI |
| `anchor` | Generate an HTML `id` attribute |
| `customClassName` | Allow adding a custom CSS class |
| `className` | Inject block wrapper class. Set to `false` to suppress |
| `color` | Object — groups all color supports |
| `typography` | Object — groups all typography supports |
| `spacing` | Object — groups all spacing supports |
| `border` | Object — groups all border supports |
| `dimensions` | Object — groups all dimension supports |

Support values that are objects (rather than `true`) are passed through the `register_block_type_args` filter and stored in `blockType.supports[key]`.

### 8.4 `block_has_support(blockType, feature, defaultValue?)`

Checks whether a block type supports a specific feature. `feature` may be a string key or a path array. Returns `true` if the support value is `true` or is a non-empty object (array); returns `defaultValue` otherwise.

---

## 9. Block Context

Context is a mechanism for ancestor blocks to pass data to descendant blocks without explicit nesting of attributes. It is declarative: a block type declares what it **provides** and what it **uses**.

### 9.1 `provides_context`

Declared in `block.json` as `providesContext` / in PHP as `provides_context`. It is a map of `context_key => attribute_name`:

```json
{
  "providesContext": {
    "core/query/postId": "postId",
    "fontSize": "fontSize"
  }
}
```

When a `WP_Block` instance is constructed, `refresh_parsed_block_dependents()` examines `provides_context` and builds a `child_context` map. For each `context_key => attribute_name` entry, if `attribute_name` is present in the block's `attributes`, its value is added to `child_context` under `context_key`. This `child_context` is then passed as `available_context` when constructing the `WP_Block_List` for inner blocks.

### 9.2 `uses_context`

Declared as an array of context keys:

```json
{
  "usesContext": ["core/query/postId", "postId", "postType"]
}
```

When `refresh_context_dependents()` runs, for each key in `uses_context`: if that key is present in `available_context`, it is copied into `this.context`. The block's `render_callback` then reads from `$block->context` to obtain these values.

### 9.3 Context Propagation Flow

```
render_block(parsedBlock)
  ├─ initial context: { postId, postType } from global $post
  ├─ 'render_block_context' filter (allows plugins to add more context)
  └─ new WP_Block(parsedBlock, context)
       ├─ this.context = subset of available_context matching uses_context
       └─ WP_Block_List(innerBlocks, childContext)
            └─ childContext = availableContext merged with provides_context values
                 └─ new WP_Block(innerParsedBlock, childContext)
                      └─ inner block's context = subset matching its own uses_context
```

Context flows **downward only** — a child cannot push context up to a parent.

### 9.4 Rendering Context Mutation

During inner block rendering (inside `WP_Block::render()`), the `render_block_context` filter fires for each inner block. If a plugin modifies the context, `inner_block.refresh_context_dependents()` is called to re-propagate. Similarly, if the `render_block_data` filter modifies `parsedBlock`, `refresh_parsed_block_dependents()` is called.

---

## 10. Dynamic vs. Static vs. Reusable Blocks

### 10.1 Static Blocks

A static block has no `render_callback`. The HTML output was produced by the block editor and stored verbatim in `post_content`. At render time, `WP_Block::render()` assembles output from `innerContent` (string chunks plus recursively rendered inner blocks). The assembled output passes through block-support filters (via the `render_block` filter) but no PHP render function is called.

Static blocks can still be extended dynamically via the `render_block` and `render_block_{name}` filters.

### 10.2 Dynamic Blocks

A dynamic block has a registered `render_callback`. The HTML stored in `post_content` by the editor is passed to the callback as `$content` (the "saved" markup), but the callback is free to generate entirely different output based on live data. Common examples: `core/latest-posts`, `core/navigation`, any block that queries the database.

During `render()`:
- `block_content` is first assembled from `innerContent` (inner blocks are still rendered).
- `WP_Block_Supports::$block_to_render` is set to the parsed block data so `get_block_wrapper_attributes()` can read the current block's supports.
- `render_callback(attributes, block_content, block_instance)` is called.
- `$block_to_render` is restored.

### 10.3 Reusable Blocks (Synced Patterns)

Reusable blocks are stored as `wp_block` custom post type entries. They are referenced in post content with the `core/block` block:

```
<!-- wp:block {"ref":42} /-->
```

The `core/block` block's `render_callback` queries the `wp_block` post by its `ref` attribute, retrieves its `post_content`, and calls `do_blocks()` on it recursively.

### 10.4 `core/pattern` — Pattern Substitution

The `core/pattern` block (with `{"slug":"my-namespace/my-pattern"}`) is resolved at render time by looking up the pattern in `WP_Block_Patterns_Registry` and replacing the block with the pattern's parsed content. The function `resolve_pattern_blocks()` handles recursive patterns (guarded against infinite loops via a `seen_refs` tracker).

---

## 11. Block Patterns

### 11.1 Pattern Structure

A registered block pattern is a plain object:

```typescript
interface BlockPattern {
  name: string;            // Namespaced slug, e.g. "my-plugin/hero-section"
  title: string;           // Required. Human-readable title.
  content?: string;        // Block HTML markup. Either content or filePath must be provided.
  filePath?: string;       // Absolute path to a PHP file whose output provides content (lazy-loaded).
  description?: string;    // Visually hidden description for discoverability.
  viewportWidth?: number;  // Intended width in pixels for the scaled preview.
  inserter?: boolean;      // Default true. Set false to hide from inserter (programmatic use only).
  categories?: string[];   // Array of registered category slugs.
  keywords?: string[];     // Search aliases.
  blockTypes?: string[];   // Block names that can use this as a placeholder / transform.
  postTypes?: string[];    // Post type slugs this pattern is restricted to.
  templateTypes?: string[]; // Template type slugs where this pattern fits.
}
```

### 11.2 `WP_Block_Patterns_Registry`

Singleton. Maintains two internal maps: all registered patterns, and patterns registered outside of the `init` action (used to detect deprecated late registrations).

```typescript
class BlockPatternsRegistry {
  private registeredPatterns: Map<string, BlockPattern>;
  private registeredPatternsOutsideInit: Map<string, BlockPattern>;
  private static instance: BlockPatternsRegistry | null = null;

  static getInstance(): BlockPatternsRegistry;

  // Returns false if name or title invalid, or if content/filePath not provided.
  register(patternName: string, patternProperties: Omit<BlockPattern, 'name'>): boolean;

  unregister(patternName: string): boolean;

  // Returns the pattern with content resolved (filePath → PHP include output).
  // Content is passed through apply_block_hooks_to_content() before return.
  getRegistered(patternName: string): BlockPattern | null;

  // Returns all patterns, each with content resolved and block hooks applied.
  getAllRegistered(outsideInitOnly?: boolean): BlockPattern[];

  isRegistered(patternName: string | null): boolean;
}
```

**Content resolution:** If a pattern's `content` is absent but `filePath` is set, the file is `include`d and output-buffered to obtain the content string. This is cached: `filePath` is removed and `content` is stored after the first resolution.

**Block hook injection:** `get_registered()` and `get_all_registered()` each pass the resolved content through `apply_block_hooks_to_content()` using `insert_hooked_blocks_and_set_ignored_hooked_blocks_metadata` as the callback.

### 11.3 `register_block_pattern(name, properties)` / `unregister_block_pattern(name)`

Module-level wrappers that delegate to the singleton registry.

### 11.4 `WP_Block_Pattern_Categories_Registry`

Separate singleton for pattern categories.

```typescript
interface BlockPatternCategory {
  name: string;
  label: string; // Required human-readable label.
}

class BlockPatternCategoriesRegistry {
  private registeredCategories: Map<string, BlockPatternCategory>;
  private registeredCategoriesOutsideInit: Map<string, BlockPatternCategory>;
  private static instance: BlockPatternCategoriesRegistry | null = null;

  static getInstance(): BlockPatternCategoriesRegistry;
  register(categoryName: string, categoryProperties: { label: string }): boolean;
  unregister(categoryName: string): boolean;
  getRegistered(categoryName: string): BlockPatternCategory | null;
  getAllRegistered(outsideInitOnly?: boolean): BlockPatternCategory[];
  isRegistered(categoryName: string | null): boolean;
}
```

### 11.5 `register_block_pattern_category(name, properties)` / `unregister_block_pattern_category(name)`

Module-level wrappers for the category registry singleton.

---

## 12. Block Bindings

Block bindings (introduced in WP 6.5) allow individual block attributes to be sourced from external data at render time instead of using the value stored in the block's comment delimiter.

### 12.1 Mechanism

A binding is declared inside `attrs.metadata.bindings`:

```json
{
  "metadata": {
    "bindings": {
      "content": {
        "source": "core/post-meta",
        "args": { "key": "subtitle_field" }
      },
      "url": {
        "source": "core/post-meta",
        "args": { "key": "link_url_field" }
      }
    }
  }
}
```

The `source` value must match a registered `WP_Block_Bindings_Source` name. The `args` object is passed to the source's `get_value_callback`.

### 12.2 Supported Blocks

By default only these core block types can use bindings (the list is not currently extensible):

- `core/paragraph` (attribute: `content`)
- `core/heading` (attribute: `content`)
- `core/image` (attributes: `url`, `title`, `alt`)
- `core/button` (attributes: `url`, `text`, `linkTarget`, `rel`)

`get_block_bindings_supported_attributes(blockName)` returns the list of bindable attribute names for a given block.

### 12.3 `__default` Pattern Overrides

If `bindings.__default.source === 'core/pattern-overrides'`, the `__default` entry is expanded into individual bindings for every supported attribute of the block, each pointing to `core/pattern-overrides`. Explicit per-attribute bindings in the same block take precedence. The expanded bindings are stored back into `computed_attributes.metadata.bindings` so the block's render receives the complete expanded set.

### 12.4 `process_block_bindings()` — called inside `WP_Block::render()`

For each attribute listed in `bindings`:
1. Skip if the attribute is not in the supported list for this block type.
2. Skip if the `source` string does not correspond to a registered source.
3. Look up the `WP_Block_Bindings_Source` from the registry.
4. If the source has `uses_context`, copy those context keys from `available_context` into `this.context`.
5. Call `source.get_value(source_args, block_instance, attribute_name)` → `source_value`.
6. If `source_value !== null`, add to `computed_attributes`.

Returns `computed_attributes`.

### 12.5 `replace_html(block_content, attribute_name, source_value)`

After the block's inner content is assembled, binding values are injected into the output HTML:

- **`source: 'html'` or `source: 'rich-text'`**: Uses `WP_HTML_Processor` to locate the element matching the attribute's `selector` CSS path, then replaces its inner content with `wp_kses_post(source_value)`.
- **`source: 'attribute'`**: Uses `WP_HTML_Tag_Processor` to locate the element and set the named HTML attribute to `source_value`.
- Other sources: the block content is returned unchanged.

### 12.6 `WP_Block_Bindings_Registry`

Singleton registry for binding sources.

```typescript
class BlockBindingsRegistry {
  private sources: Map<string, BlockBindingsSource> = new Map();
  private static instance: BlockBindingsRegistry | null = null;
  private allowedSourceProperties = ['label', 'get_value_callback', 'uses_context'];
  private supportedBlocks = ['core/paragraph', 'core/heading', 'core/image', 'core/button'];

  static getInstance(): BlockBindingsRegistry;

  // source_name must match /^[a-z0-9-]+\/[a-z0-9-]+$/, must not be already registered.
  // source_properties must include 'label' and 'get_value_callback' (a callable).
  // Optional 'uses_context' must be an array.
  register(sourceName: string, sourceProperties: BlockBindingsSourceConfig): BlockBindingsSource | false;

  unregister(sourceName: string): BlockBindingsSource | false;
  getAllRegistered(): Record<string, BlockBindingsSource>;
  getRegistered(sourceName: string): BlockBindingsSource | null;
  isRegistered(sourceName: string | null): boolean;
}

interface BlockBindingsSourceConfig {
  label: string;
  get_value_callback: (
    sourceArgs: Record<string, unknown>,
    blockInstance: WPBlock,
    attributeName: string
  ) => unknown;
  uses_context?: string[];
}
```

### 12.7 `WP_Block_Bindings_Source`

```typescript
class BlockBindingsSource {
  name: string;
  label: string;
  usesContext: string[] | null;
  private getValueCallback: BlockBindingsSourceConfig['get_value_callback'];

  // Invokes get_value_callback and then applies 'block_bindings_source_value' filter.
  getValue(sourceArgs: Record<string, unknown>, blockInstance: WPBlock, attributeName: string): unknown;
}
```

The `get_value` method applies the `block_bindings_source_value` filter (WP 6.7+) after calling the callback, enabling plugins to intercept and override any binding value.

### 12.8 Module-Level Functions

```typescript
function register_block_bindings_source(sourceName: string, props: BlockBindingsSourceConfig): BlockBindingsSource | false;
function unregister_block_bindings_source(sourceName: string): BlockBindingsSource | false;
function get_block_bindings_source(sourceName: string): BlockBindingsSource | null;
function get_all_registered_block_bindings_sources(): Record<string, BlockBindingsSource>;
```

---

## 13. Block Hooks

Block hooks (WP 6.4+) allow a block to be automatically inserted relative to another "anchor" block whenever that anchor block is encountered in content, templates, or patterns.

### 13.1 Registration

A block declares its hooks in `block.json` under `blockHooks`:

```json
{
  "blockHooks": {
    "core/post-content": "firstChild",
    "core/navigation": "lastChild",
    "core/group": "after"
  }
}
```

Or in PHP registration args as `block_hooks`:

```php
'block_hooks' => [
  'core/post-content' => 'first_child',
  'core/navigation'   => 'last_child',
]
```

### 13.2 `get_hooked_blocks()`

Iterates all registered block types and builds an index:

```
hooked_blocks[anchor_block_type][relative_position][] = hooked_block_name
```

Possible positions: `before`, `after`, `first_child`, `last_child`.

### 13.3 `apply_block_hooks_to_content(content, context?, callback?)`

Processes serialized block content to inject (or track) hooked blocks:

1. Optionally registers a metadata collection.
2. Calls `get_hooked_blocks()`.
3. For single-instance blocks (`supports.multiple !== true`) already present in `content`, removes them from the hooked_blocks index.
4. Sets up a `suppress_single_instance_blocks` filter on `hooked_block_types` to prevent re-insertion of already-inserted single-instance blocks during traversal.
5. Calls `traverse_and_serialize_blocks(parse_blocks(content), before_visitor, after_visitor)`.
6. The `before_visitor` injects hooked blocks in `before` and `first_child` positions; the `after_visitor` injects `after` and `last_child` positions.

The `callback` parameter defaults to `insert_hooked_blocks` which serializes the hooked block markup. Alternatively `set_ignored_hooked_blocks_metadata` records hooked block names in the anchor block's `metadata.ignoredHookedBlocks` attribute without generating markup (used when saving content).

### 13.4 `ignoredHookedBlocks` Metadata

An anchor block can opt out of receiving specific hooked blocks by listing them in `attrs.metadata.ignoredHookedBlocks`. This array is persisted in `post_meta` as `_wp_ignored_hooked_blocks` (JSON-encoded) for post-based content (written by `update_ignored_hooked_blocks_postmeta()` on the `wp_insert_post_data` filter).

### 13.5 Hooked Block Filters

| Filter | Arguments |
|---|---|
| `hooked_block_types` | `hooked_block_types[], relative_position, anchor_block_type, context` |
| `hooked_block` | `parsed_hooked_block[], hooked_block_type, relative_position, parsed_anchor_block, context` |
| `hooked_block_{block_type}` | Same as `hooked_block` but for a specific block type |

A filter returning `null` for `hooked_block` suppresses that hooked block.

---

## 14. Key Hooks and Filters

### Filters

| Filter | Signature | Purpose |
|---|---|---|
| `block_parser_class` | `(className: string) => string` | Override the parser class name used by `parse_blocks()`. |
| `register_block_type_args` | `(args: object, blockType: string) => object` | Modify block type registration args in `WP_Block_Type::set_props()`. |
| `block_type_metadata` | `(metadata: object) => object` | Modify raw `block.json` metadata before property mapping. |
| `block_type_metadata_settings` | `(settings: object, metadata: object) => object` | Modify the final settings array before `register()` is called. |
| `get_block_type_variations` | `(variations: object[], blockType: WPBlockType) => object[]` | Modify variations returned by `get_variations()`. |
| `get_block_type_uses_context` | `(usesContext: string[], blockType: WPBlockType) => string[]` | Modify `uses_context` returned by `get_uses_context()`. |
| `pre_render_block` | `(null \| string, parsedBlock, parentBlock \| null) => string \| null` | Short-circuit block rendering. Return non-null to skip normal render. |
| `render_block_data` | `(parsedBlock, sourceBlock, parentBlock \| null) => parsedBlock` | Modify the parsed block before it is instantiated. |
| `render_block_context` | `(context: object, parsedBlock, parentBlock \| null) => object` | Modify the context passed to a block instance. |
| `render_block` | `(blockContent: string, parsedBlock, blockInstance) => string` | Filter the rendered output of every block. |
| `render_block_{block/name}` | `(blockContent: string, parsedBlock, blockInstance) => string` | Filter the rendered output of a specific block type. |
| `the_content` | Standard WP content filter | `do_blocks()` is added here at priority 9. |
| `hooked_block_types` | `(types: string[], position: string, anchorType: string, context) => string[]` | Filter which blocks are hooked at a given anchor/position. |
| `hooked_block` | `(parsedHookedBlock \| null, hookedType, position, parsedAnchor, context) => object \| null` | Filter or suppress a specific hooked block instance. |
| `hooked_block_{block/type}` | Same signature as `hooked_block` | Type-specific variant of `hooked_block`. |
| `block_bindings_source_value` | `(value, sourceName, sourceArgs, blockInstance, attributeName) => mixed` | Filter the resolved value from any binding source. |
| `excerpt_allowed_blocks` | `(blocks: string[]) => string[]` | Blocks allowed to contribute to the excerpt. |
| `excerpt_allowed_wrapper_blocks` | `(blocks: string[]) => string[]` | Wrapper blocks whose inner blocks are recursed for excerpt. |
| `interactivity_process_directives` | `(enabled: boolean) => boolean` | Disable Interactivity API directive processing. |
| `enqueue_empty_block_content_assets` | `(enqueue: boolean, blockName: string) => boolean` | Override asset dequeue for empty-content blocks. |

### Actions

Block registration and initialization are driven by the core `init` action:

- Block types should be registered on `init` (callback priority unspecified but recommended to use default priority 10 or higher).
- Block patterns should be registered on `init` (registrations outside `init` are tracked separately as potentially deprecated).
- `WP_Block_Supports::init()` is called on `init` to register support attributes on all block types.

---

## 15. Serialization Utility Functions

### `serialize_block_attributes(attrs)`

JSON-encodes `attrs` with `JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE` and applies the special character substitutions (see Section 2.3).

### `get_comment_delimited_block_content(blockName, attrs, content)`

Assembles the wire-format string for a single block:
- If `blockName` is `null`, returns `content` unchanged (freeform).
- Strips `core/` prefix from `blockName`.
- Serializes `attrs` (empty attrs → empty string).
- If `content` is empty → void form: `<!-- wp:name attrs/-->`.
- Otherwise → `<!-- wp:name attrs-->content<!-- /wp:name -->`.

### `strip_core_block_namespace(blockName)`

Removes the `core/` prefix from `blockName`. Used before encoding block names into comment delimiters.

### `has_blocks(post?)`

Quick substring check: returns `true` if the content contains `<!-- wp:`. Does not parse or validate; optimized for performance.

### `has_block(blockName, post?)`

Tests for a specific block by substring matching `<!-- wp:{blockName} `. Normalizes names without a namespace to `core/{name}`. Also tests the de-namespaced form for core blocks.

### `block_version(content)`

Returns `1` if `has_blocks(content)` is true, else `0`.

### `filter_block_content(text, allowedHtml?, allowedProtocols?)`

Parses blocks from `text`, applies `filter_block_kses()` to each (sanitizing attribute values via `wp_kses`), and re-serializes.

### `traverse_and_serialize_block(block, preCallback?, postCallback?)`

Recursively traverses a parsed block tree, calling optional `pre_callback` before each inner block and `post_callback` after. The callbacks receive `(block_ref, parent_ref, sibling)`. Their string return values are prepended/appended to the serialized output respectively. Returns the full serialized string including comment delimiters.

### `traverse_and_serialize_blocks(blocks, preCallback?, postCallback?)`

Variant of the above that operates on a top-level array of blocks.

---

## 16. TypeScript Interface Sketch

```typescript
// ─── Parsed block (output of WP_Block_Parser) ──────────────────────────────

interface ParsedBlock {
  blockName: string | null;
  attrs: Record<string, unknown>;
  innerBlocks: ParsedBlock[];
  innerHTML: string;
  innerContent: (string | null)[];
}

// ─── Block type registration ────────────────────────────────────────────────

type BlockHookPosition = 'before' | 'after' | 'first_child' | 'last_child';

type BlockRenderCallback = (
  attributes: Record<string, unknown>,
  content: string,
  block: WPBlock
) => string;

interface AttributeSchema {
  type?: string;
  default?: unknown;
  source?: 'attribute' | 'text' | 'html' | 'rich-text' | 'query' | 'meta';
  selector?: string;
  attribute?: string;
  query?: Record<string, AttributeSchema>;
  enum?: unknown[];
  items?: AttributeSchema;
  properties?: Record<string, AttributeSchema>;
  [key: string]: unknown;
}

interface BlockStyleVariation {
  name: string;
  label: string;
  isDefault?: boolean;
}

interface BlockVariation {
  name: string;
  title: string;
  description?: string;
  category?: string;
  icon?: string;
  isDefault?: boolean;
  attributes?: Record<string, unknown>;
  innerBlocks?: unknown[][];
  example?: Record<string, unknown>;
  scope?: string[];
  keywords?: string[];
}

interface BlockSupportsConfig {
  color?: boolean | Record<string, boolean>;
  typography?: boolean | Record<string, boolean>;
  spacing?: boolean | Record<string, unknown>;
  border?: boolean | Record<string, boolean>;
  dimensions?: boolean | Record<string, boolean>;
  layout?: boolean | Record<string, unknown>;
  position?: boolean | Record<string, boolean>;
  interactivity?: boolean | { interactive?: boolean; clientNavigation?: boolean };
  multiple?: boolean;
  html?: boolean;
  inserter?: boolean;
  align?: boolean | string[];
  anchor?: boolean;
  customClassName?: boolean;
  className?: boolean;
  reusable?: boolean;
  lock?: boolean;
  [key: string]: unknown;
}

interface WPBlockType {
  name: string;
  apiVersion: number;
  title: string;
  category: string | null;
  parent: string[] | null;
  ancestor: string[] | null;
  allowedBlocks: string[] | null;
  icon: string | null;
  description: string;
  keywords: string[];
  textdomain: string | null;
  styles: BlockStyleVariation[];
  variations: BlockVariation[];
  variationCallback: (() => BlockVariation[]) | null;
  selectors: Record<string, string>;
  supports: BlockSupportsConfig | null;
  example: Record<string, unknown> | null;
  renderCallback: BlockRenderCallback | null;
  attributes: Record<string, AttributeSchema> | null;
  usesContext: string[];
  providesContext: Record<string, string> | null;
  blockHooks: Record<string, BlockHookPosition>;
  editorScriptHandles: string[];
  scriptHandles: string[];
  viewScriptHandles: string[];
  viewScriptModuleIds: string[];
  editorStyleHandles: string[];
  styleHandles: string[];
  viewStyleHandles: string[];

  isDynamic(): boolean;
  prepareAttributesForRender(attributes: Record<string, unknown>): Record<string, unknown>;
  getVariations(): BlockVariation[];
  getUsesContext(): string[];
}

// ─── Registry ───────────────────────────────────────────────────────────────

interface BlockTypeRegistry {
  register(name: string | WPBlockType, args?: Partial<WPBlockType>): WPBlockType | false;
  unregister(name: string | WPBlockType): WPBlockType | false;
  getRegistered(name: string | null): WPBlockType | null;
  getAllRegistered(): Record<string, WPBlockType>;
  isRegistered(name: string | null): boolean;
}

// ─── Runtime block instance ──────────────────────────────────────────────────

interface RenderOptions {
  dynamic?: boolean;
}

interface WPBlock {
  parsedBlock: ParsedBlock;
  name: string | null;
  blockType: WPBlockType | null;
  context: Record<string, unknown>;
  innerBlocks: WPBlockList;
  innerHtml: string;
  innerContent: (string | null)[];
  attributes: Record<string, unknown>; // lazily populated with defaults

  render(options?: RenderOptions): string;
  refreshContextDependents(): void;
  refreshParsedBlockDependents(): void;
}

// ─── Block list (lazy-instantiated array of WP_Block) ───────────────────────

interface WPBlockList extends Iterable<WPBlock> {
  length: number;
  [index: number]: WPBlock;
}

// ─── Block Supports ──────────────────────────────────────────────────────────

interface BlockSupportProcessorConfig {
  name: string;
  apply?: (blockType: WPBlockType, attributes: Record<string, unknown>) => Record<string, string>;
  registerAttribute?: (blockType: WPBlockType) => void;
}

interface BlockSupports {
  register(name: string, config: BlockSupportProcessorConfig): void;
  applyBlockSupports(): Record<string, string>;
}

// ─── Block Patterns ──────────────────────────────────────────────────────────

interface BlockPattern {
  name: string;
  title: string;
  content: string;
  description?: string;
  viewportWidth?: number;
  inserter?: boolean;
  categories?: string[];
  keywords?: string[];
  blockTypes?: string[];
  postTypes?: string[];
  templateTypes?: string[];
}

interface BlockPatternCategory {
  name: string;
  label: string;
}

// ─── Block Bindings ──────────────────────────────────────────────────────────

interface BlockBindingsSource {
  name: string;
  label: string;
  usesContext: string[] | null;
  getValue(
    sourceArgs: Record<string, unknown>,
    blockInstance: WPBlock,
    attributeName: string
  ): unknown;
}

interface BlockBindingsSourceConfig {
  label: string;
  get_value_callback: (
    sourceArgs: Record<string, unknown>,
    blockInstance: WPBlock,
    attributeName: string
  ) => unknown;
  uses_context?: string[];
}

// ─── Top-level API ───────────────────────────────────────────────────────────

declare function parseBlocks(content: string): ParsedBlock[];
declare function renderBlock(parsedBlock: ParsedBlock): string;
declare function doBlocks(content: string): string;
declare function serializeBlock(block: ParsedBlock): string;
declare function serializeBlocks(blocks: ParsedBlock[]): string;
declare function serializeBlockAttributes(attrs: Record<string, unknown>): string;
declare function getCommentDelimitedBlockContent(
  blockName: string | null,
  attrs: Record<string, unknown>,
  content: string
): string;
declare function registerBlockType(blockType: string | WPBlockType, args?: Partial<WPBlockType>): WPBlockType | false;
declare function unregisterBlockType(name: string | WPBlockType): WPBlockType | false;
declare function registerBlockTypeFromMetadata(fileOrFolder: string, args?: Partial<WPBlockType>): WPBlockType | false;
declare function getDynamicBlockNames(): string[];
declare function hasBlocks(post?: string | number): boolean;
declare function hasBlock(blockName: string, post?: string | number): boolean;
declare function blockHasSupport(blockType: WPBlockType, feature: string | string[], defaultValue?: unknown): boolean;
declare function getBlockWrapperAttributes(extraAttributes?: Record<string, string>): string;
declare function registerBlockPattern(name: string, properties: Omit<BlockPattern, 'name'>): boolean;
declare function unregisterBlockPattern(name: string): boolean;
declare function registerBlockPatternCategory(name: string, properties: { label: string }): boolean;
declare function unregisterBlockPatternCategory(name: string): boolean;
```

---

## 17. Design Patterns to Carry Over

### Singleton Registries

`WP_Block_Type_Registry`, `WP_Block_Patterns_Registry`, `WP_Block_Pattern_Categories_Registry`, `WP_Block_Supports`, and `WP_Block_Bindings_Registry` are all singletons. In TypeScript, implement each as a module-level instance (not a global class with `getInstance()` exposed publicly) or as a dependency-injectable service passed through constructor arguments. The registries should accept a `WP_Block_Type` instance directly in `register()` as a convenience for callers who already have the constructed object.

### Lazy Instantiation of Block Instances

`WP_Block_List` defers creating `WP_Block` instances until elements are accessed by index. This is important for performance: a large post may contain hundreds of inner blocks that are never visited if rendering short-circuits. Implement this with a Proxy or a custom accessor class.

### Lazy Attribute Defaults

`WP_Block::attributes` is not populated until first read. Defer schema validation and default injection. This matters because some callers (e.g., context propagation) construct `WP_Block` instances purely for context plumbing and never read attributes.

### Context Isolation

Child blocks must receive context through their `available_context` constructor argument, not through a shared mutable object. The parent computes `child_context` as a new merged object before constructing the `WP_Block_List`; the parent's own `context` object is never mutated by child rendering.

### `innerContent` as the Canonical Render Template

The `innerContent` array — interleaved strings and nulls — is the authoritative description of how a block's rendered output is assembled. Strings are literal HTML; nulls indicate "insert rendered inner block N here". Do not assemble output by concatenating `innerHTML` with inner block output separately; always iterate `innerContent`.

### Memory Management for Large Posts

`do_blocks()` sets each rendered top-level block to `null` after rendering to allow GC to reclaim memory. In TypeScript this is less critical (GC is automatic and block instances are scoped), but the principle of not retaining all rendered blocks simultaneously still applies if content is very large.

### Filter-Driven Extensibility

Every significant step in the render pipeline (`pre_render_block`, `render_block_data`, `render_block_context`, `render_block`, `render_block_{name}`) corresponds to a hook. These are not optional — they are the primary extension points. The hook engine (see `hook-engine.md`) must be implemented before the block engine.

### Asset Dequeue on Empty Blocks

A dynamic block that produces no HTML output should not cause its scripts and styles to be loaded. Track the asset queues before and after rendering; if the output is empty, dequeue newly added assets. Preserve assets if the block's render callback itself triggered `wp_enqueue_scripts` (indicating footer-destined assets), or if the `enqueue_empty_block_content_assets` filter explicitly permits it.

### Block Hooks — Idempotent Insertion

The `ignoredHookedBlocks` metadata prevents hooked blocks from being inserted multiple times when content is read (via REST API), saved, and read again. When saving, run the hooks algorithm with `set_ignored_hooked_blocks_metadata` to record which blocks were added; store the result in `_wp_ignored_hooked_blocks` post meta. On subsequent reads, consult that meta so already-acknowledged insertions are suppressed.

### Serialization Parity with JavaScript

`serialize_block_attributes()` must produce output **byte-identical** to the JavaScript `serializeAttributes()` function in `@wordpress/blocks`. This is a hard contract: the same post_content must be re-parseable by both the PHP parser and the JavaScript parser. Deviating from the character-escape table in Section 2.3 will corrupt content in the block editor.

---

## 18. Tovu Reconstruction Notes

### 18.1 Why this exists

The block runtime exists so authored content can behave like structured, nestable application state while still serializing back into portable document content. WordPress’s key lesson is that block content is not just HTML and not just JSON; it is a bidirectional content contract.

### 18.2 What Tovu should preserve

- Structured content nodes with stable serialization/parsing rules
- A registry for block/component definitions and capabilities
- Render-time extensibility and context propagation
- Strict parity between editor-side and server-side serialization expectations

### 18.3 What Tovu can simplify

- Tovu does not need Gutenberg’s exact comment-delimited format if it chooses a cleaner portable content contract
- Hooked blocks, dequeue-on-empty, and every registry nuance can come later
- The important thing is one canonical content model across editor, server render, and API transport

### 18.4 Possible Tovu seams

- `src/features/post/` or a dedicated structured-content module for content node parsing/serialization
- `src/core/ports/StructuredContentPort.ts` for parse/render/serialize contracts
- editor shells consume the same structured content contract, not a separate ad hoc model

### 18.5 Suggested priority

- `V1`: canonical structured content format, parse/render/serialize parity, registry for core content node types
- `Later`: richer hooks, dynamic node asset behavior, advanced insertion/augmentation semantics
