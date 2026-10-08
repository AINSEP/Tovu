import { createUIResource as createResource, buildUIToolResult as buildResult, escapeJsString as escapeString } from "@jini-ai/ui/mcp-ui/surfaces";
import type { UIToolResult as OwnerToolResult, UIResource, TextContent } from "@jini-ai/ui/mcp-ui/surfaces";
export { MCP_UI_MIME_TYPE } from "@jini-ai/ui/mcp-ui/surfaces";
export { escapeHtml } from "#src/platform/html/escape";
export type { UIResourceUri, UIResourceMimeType, UIResourceContent, UIResource, TextContent } from "@jini-ai/ui/mcp-ui/surfaces";

/**
 * @file Tovu's compatibility surface for Jini-owned MCP-UI resource construction and escaping.
 * Protocol shapes and rationale live in Jini/packages/ui/src/features/mcp-ui/resource.ts.
 * Tool results keep model-readable text separate from human-only HTML: confirmation secrets
 * belong only in the UI resource and must never enter modelText.
 */

export type { UIActionType, UIActionResult } from "@jini-ai/ui/mcp-ui/surfaces";

/** Mutable tuple compatibility for existing server result contracts. No runtime shape changes. */
export type UIToolResult = Omit<OwnerToolResult, "content"> & { content: [TextContent, UIResource] };
/** Builds an inline `ui://` resource. HTML must be self-contained for its sandboxed iframe.
 * @param spec.uri - The resource instance identifier.
 * @param spec.htmlString - Inline HTML requiring no bundler or network.
 * @param spec.meta - Optional resource metadata.
 * @returns The embedded UI resource.
 * @complexity O(1).
 */
export function createUIResource(spec: Parameters<typeof createResource>[0], options = {}): UIResource {
  return createResource(spec, options);
}
/** Assembles model text and human-only UI in their wire order; modelText must contain no secret.
 * @param spec.modelText - Model-readable text.
 * @param spec.ui - The human-facing UI resource.
 * @param spec.meta - Optional result metadata.
 * @complexity O(1).
 */
export function buildUIToolResult(spec: Parameters<typeof buildResult>[0], options = {}): UIToolResult {
  return buildResult(spec, options) as UIToolResult;
}
/** Escapes a JS string for inline scripts, including script-closing text and U+2028/U+2029. */
export function escapeJsString(value: string): string {
  return escapeString({ value }, {});
}
