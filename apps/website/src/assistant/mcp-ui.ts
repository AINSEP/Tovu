import { buildUIToolResult as buildResult } from "@jini-ai/protocol/mcp-ui";
import type { UIToolResult as OwnerToolResult, TextContent } from "@jini-ai/protocol/mcp-ui";
import type { UIResource } from "@jini-ai/core/contracts/site/protocol-mcp-ui";

/**
 * @file Tovu's compatibility surface for Jini-owned MCP-UI tool results and wire types.
 * Protocol shapes and rationale live in Jini/packages/ui/src/features/mcp-ui/resource.ts.
 * Tool results keep model-readable text separate from human-only HTML: confirmation secrets
 * belong only in the UI resource and must never enter modelText.
 */


/** Mutable tuple compatibility for existing server result contracts. No runtime shape changes. */
export type UIToolResult = Omit<OwnerToolResult, "content"> & { content: [TextContent, UIResource] };
/** Assembles model text and human-only UI in their wire order; modelText must contain no secret.
 * @param spec.modelText - Model-readable text.
 * @param spec.ui - The human-facing UI resource.
 * @param spec.meta - Optional result metadata.
 * @complexity O(1).
 */
export function buildUIToolResult(spec: Parameters<typeof buildResult>[0], options = {}): UIToolResult {
  return buildResult(spec, options) as UIToolResult;
}
