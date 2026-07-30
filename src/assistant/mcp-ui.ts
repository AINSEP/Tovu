/**
 * @file MCP-UI resource construction — the wire shapes a tool handler returns when it needs a
 * HUMAN to act before the tool does anything, rather than a text answer the model reads.
 *
 * ## What MCP-UI actually is (researched, not assumed)
 *
 * MCP-UI is a real, existing convention for returning INTERACTIVE UI from an MCP tool call. A tool
 * result may carry an `EmbeddedResource` whose `resource.uri` uses the `ui://` scheme and whose
 * `mimeType` marks it as renderable HTML. An MCP host that understands the convention renders that
 * HTML in a SANDBOXED IFRAME shown to the user; the iframe talks back to the host over
 * `window.postMessage`, and the host turns a UI action into a follow-up MCP tool call.
 *
 * Two closely-related layers exist, and this file is written against both because they agree on
 * everything this code depends on:
 * - `mcp-ui` (the community SDK: `@mcp-ui/server` / `@mcp-ui/client`, docs at mcpui.dev) —
 *   pioneered the pattern.
 * - MCP Apps / SEP-1865 (`@modelcontextprotocol/ext-apps`) — the standardized version that grew out
 *   of it, which fixed the `ui://` scheme and the `text/html;profile=mcp-app` MIME type.
 *
 * Every literal below was read out of the published packages rather than guessed:
 * - `@modelcontextprotocol/ext-apps@1.7.5` exports `RESOURCE_URI_META_KEY = "ui/resourceUri"` and
 *   `RESOURCE_MIME_TYPE = "text/html;profile=mcp-app"`.
 * - `@mcp-ui/server@6.1.0`'s `dist/src/types.d.ts` declares ``URI = `ui://${string}` ``,
 *   `MimeType = 'text/html' | 'text/html;profile=mcp-app' | 'text/html+skybridge'`,
 *   `HTMLTextContent = { uri; mimeType; text; blob?: never; _meta? }`, the
 *   `UIActionType = 'tool' | 'prompt' | 'link' | 'intent' | 'notify'` union, and the
 *   `UIActionResult*` payload shapes {@link UIActionResult} reproduces below.
 * - `@mcp-ui/client@7.1.1`'s documented host behavior: when an action carries a `messageId`, the
 *   host acknowledges with `ui-message-received` and later answers with `ui-message-response`
 *   carrying the same `messageId`.
 *
 * ## Why the shapes are declared here rather than imported
 *
 * Same reason `jini-shims.d.ts` exists for `@jini-ai/*`: Tovu's root tsconfig uses
 * `moduleResolution: "Node"` (node10), which ignores a package's `exports` field. Beyond that,
 * `@mcp-ui/server` is a BUILDER over these shapes, not the protocol — the protocol is the JSON on
 * the wire. Declaring the ~30 lines Tovu actually emits keeps the dependency surface honest and
 * keeps this file readable as a statement of the wire format. The types are structurally
 * compatible with the published ones, so swapping in the real SDK later is a drop-in.
 *
 * ## Architectural role
 *
 * `assistant` layer, domain-agnostic — it names no post, page, or content concept. It passes the
 * kit's own membership test ("would a fourth, not-yet-written domain need it?"): any future
 * destructive tool needs exactly this and nothing domain-shaped.
 */

/** The `ui://` URI scheme MCP Apps fixes for UI resources. */
export type UIResourceUri = `ui://${string}`;

/**
 * MIME types a UI resource may declare. Tovu emits {@link MCP_UI_MIME_TYPE}; the other two are
 * listed because the published union lists them (`text/html` for legacy mcp-ui hosts,
 * `text/html+skybridge` for the Apps SDK adapter), and a host may negotiate either.
 */
export type UIResourceMimeType = "text/html" | "text/html;profile=mcp-app" | "text/html+skybridge";

/**
 * `RESOURCE_MIME_TYPE` from `@modelcontextprotocol/ext-apps` — the MCP Apps standard MIME type for
 * sandboxed HTML. Chosen over the bare `text/html` legacy value because it is the one the
 * standardized spec fixed, and mcp-ui's own client accepts it.
 */
export const MCP_UI_MIME_TYPE: UIResourceMimeType = "text/html;profile=mcp-app";

/**
 * `RESOURCE_URI_META_KEY` from `@modelcontextprotocol/ext-apps` — the `_meta` key a TOOL uses to
 * point at a pre-registered UI template.
 *
 * Tovu does not use the template-registration flow (it returns the resource inline in the tool
 * result, the original mcp-ui shape, because Tovu's `ToolDescriptor` shim has no `_meta` field to
 * carry a template reference). The constant is exported anyway so the day Tovu registers UI
 * templates as MCP resources, the key is already the spec's rather than a fresh guess.
 */
export const MCP_UI_RESOURCE_URI_META_KEY = "ui/resourceUri";

/** `UI_METADATA_PREFIX` from `@mcp-ui/server` — namespace for mcp-ui's own resource `_meta` hints. */
export const MCP_UI_METADATA_PREFIX = "mcpui.dev/ui-";

/** The text-bearing UI resource body (mcp-ui's `HTMLTextContent`). Tovu never emits the `blob` variant. */
export interface UIResourceContent {
  uri: UIResourceUri;
  mimeType: UIResourceMimeType;
  text: string;
  _meta?: Record<string, unknown>;
}

/**
 * An MCP `EmbeddedResource` carrying UI. This is the object a tool result's `content` array holds,
 * and the object an mcp-ui-aware client hands to its `UIResourceRenderer`.
 */
export interface UIResource {
  type: "resource";
  resource: UIResourceContent;
}

/** mcp-ui's `UIActionType` union — what an iframe may ask the host to do. */
export type UIActionType = "tool" | "prompt" | "link" | "intent" | "notify";

/**
 * mcp-ui's `UIActionResult` union — the `postMessage` payload an iframe sends to the host.
 *
 * `messageId` is what makes the round trip observable: mcp-ui's client answers a message carrying
 * one with `ui-message-received` and then `ui-message-response` (same `messageId`). Tovu's
 * confirmation dialog sets one so the rendered UI can show "deleted" or an error instead of
 * silently appearing to do nothing.
 */
export type UIActionResult =
  | { messageId?: string; type: "tool"; payload: { toolName: string; params: Record<string, unknown> } }
  | { messageId?: string; type: "prompt"; payload: { prompt: string } }
  | { messageId?: string; type: "link"; payload: { url: string } }
  | { messageId?: string; type: "intent"; payload: { intent: string; params: Record<string, unknown> } }
  | { messageId?: string; type: "notify"; payload: { message: string } };

/** The host→iframe acknowledgement mcp-ui's client sends for any action carrying a `messageId`. */
export const UI_MESSAGE_RECEIVED = "ui-message-received";

/** The host→iframe result mcp-ui's client sends once its `onUIAction` callback settles. */
export const UI_MESSAGE_RESPONSE = "ui-message-response";

/**
 * mcp-ui's `createUIResource({ uri, content: { type: 'rawHtml', htmlString }, encoding: 'text' })`,
 * narrowed to the one call shape Tovu makes.
 *
 * @param spec.uri - The `ui://` identifier for this resource instance.
 * @param spec.htmlString - Self-contained HTML. It renders in a sandboxed iframe with no bundler
 * and no network, so it must inline everything it needs.
 * @param spec.meta - Optional `_meta` for the resource (e.g. mcp-ui's `preferred-frame-size`).
 * @returns The `EmbeddedResource` to place in a tool result's `content` array.
 * @complexity O(1).
 * @overallScore 100
 */
export function createUIResource(spec: {
  uri: UIResourceUri;
  htmlString: string;
  meta?: Record<string, unknown>;
}): UIResource {
  return {
    type: "resource",
    resource: {
      uri: spec.uri,
      mimeType: MCP_UI_MIME_TYPE,
      text: spec.htmlString,
      ...(spec.meta !== undefined ? { _meta: spec.meta } : {}),
    },
  };
}

/** An MCP text content block — the model-readable half of a tool result. */
export interface TextContent {
  type: "text";
  text: string;
}

/**
 * An MCP tool result carrying both a model-readable text block and a human-facing UI resource.
 *
 * The ORDER of the two halves is the security boundary, not a formatting choice. Per MCP Apps'
 * own security model, the host renders the UI resource for the USER and does not feed its HTML to
 * the model — so a secret embedded in the HTML is a secret the model never sees, while anything in
 * the `text` block is something the model reads. {@link buildConfirmationToolResult} depends on
 * exactly that split.
 */
export interface UIToolResult {
  content: [TextContent, UIResource];
  /** Non-standard hosts ignore this; mcp-ui-aware ones use it to skip re-parsing the content array. */
  _meta?: Record<string, unknown>;
}

/**
 * Assembles the two-part tool result: what the MODEL is told, and what the HUMAN is shown.
 *
 * @param spec.modelText - The model-readable block. Must NOT contain the confirmation secret.
 * @param spec.ui - The UI resource, whose HTML is rendered to the human only.
 * @param spec.meta - Optional result-level `_meta`.
 * @complexity O(1).
 * @overallScore 100
 */
export function buildUIToolResult(spec: {
  modelText: string;
  ui: UIResource;
  meta?: Record<string, unknown>;
}): UIToolResult {
  return {
    content: [{ type: "text", text: spec.modelText }, spec.ui],
    ...(spec.meta !== undefined ? { _meta: spec.meta } : {}),
  };
}

/** Escapes a value for safe interpolation into the confirmation dialog's HTML text nodes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Serializes a value as a JS string literal safe to embed in an inline `<script>`.
 *
 * `JSON.stringify` alone is not enough for two reasons a UI resource actually hits: a literal
 * `</script` inside the value would close the script element early, and U+2028/U+2029 are legal in
 * JSON but were not legal in JS string literals before ES2019. All three are escaped.
 */
export function escapeJsString(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
