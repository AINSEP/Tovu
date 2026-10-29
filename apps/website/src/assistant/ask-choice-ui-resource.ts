import { buildUIToolResult, type UIResource } from "./mcp-ui.js";

const HTML_MIME_TYPES: ReadonlySet<string> = new Set(["text/html", "text/html;profile=mcp-app", "text/html+skybridge"]);

/** Narrows the renderer's unknown package boundary without casting a required presentation port. */
export function isAskChoiceUiResource(ui: unknown): ui is UIResource {
  if (!isRecord(ui) || ui.type !== "resource" || !isRecord(ui.resource)) return false;
  return hasUiUri({ resource: ui.resource }) && hasHtmlText({ resource: ui.resource });
}

/** Any non-null object; properties are then read as unknown. A positional parameter because a type
 * predicate cannot name a destructured binding. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
export function askChoiceToolResult({ modelText, ui }: { modelText: string; ui: unknown }, _options = {}) {
  if (!isAskChoiceUiResource(ui)) throw new Error("ask-choice renderer returned an invalid UI resource");
  return { ...buildUIToolResult({ modelText, ui }) };
}
