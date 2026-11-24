import { buildUIToolResult } from "./mcp-ui.js";
import { isRecord } from "@jini-ai/core/records";
import type { UIResource } from "@jini-ai/core/contracts/site/protocol-mcp-ui";

const HTML_MIME_TYPES: ReadonlySet<string> = new Set(["text/html", "text/html;profile=mcp-app", "text/html+skybridge"]);

/** Narrows the renderer's unknown package boundary without casting a required presentation port. */
export function isAskChoiceUiResource(required: { ui: unknown }, _optional: Record<string, never> = {}): required is { ui: UIResource } {
  // Any non-null object; properties are then read as unknown. A positional parameter would be needed because a type
  // predicate cannot name a destructured binding; core's `isRecord` instead narrows `required.value`, so each
  // candidate is bound in a `{ value }` first.
  const envelope = { value: required.ui };
  if (!isRecord(envelope) || envelope.value.type !== "resource") return false;
  const resource = { value: envelope.value.resource };
  if (!isRecord(resource)) return false;
  return hasUiUri({ resource: resource.value }) && hasHtmlText({ resource: resource.value });
}

/** The resource names a `ui://` URI. */
function hasUiUri({ resource }: { resource: Record<string, unknown> }): boolean {
  return typeof resource.uri === "string" && resource.uri.startsWith("ui://");
}

/** The resource carries HTML text in one of the MCP-UI HTML mime types. */
function hasHtmlText({ resource }: { resource: Record<string, unknown> }): boolean {
  return typeof resource.mimeType === "string" && HTML_MIME_TYPES.has(resource.mimeType) && typeof resource.text === "string";
}

/** The ask-choice tool result for a rendered form; the renderer's output crosses an unknown package boundary.
 * @throws Error when the renderer returned anything other than an HTML `ui://` resource. @complexity O(1). */
export function askChoiceToolResult(required: { modelText: string; ui: unknown }, _options = {}) {
  if (!isAskChoiceUiResource(required)) throw new Error("ask-choice renderer returned an invalid UI resource");
  return { ...buildUIToolResult({ modelText: required.modelText, ui: required.ui }) };
}
