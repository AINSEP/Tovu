import { McpUiHost } from "@jini-ai/ui/mcp-ui";
import { DEFAULT_INTERACTIVE_UI_REGISTRY } from "@jini-ai/ui/interactive-ui";
import { buildA2uiCatalogFromRegistry } from "@jini-ai/ui/a2ui";
import { getAgentModelContext } from "@jini-ai/agentic/dom";
import type { ChatSurfaces } from "@jini-ai/chat/react";

/** Tovu picks the iframe host, component registry and WebMCP probe; chat only states the port. */
export const chatSurfaces = {
  mcpUi: { Host: McpUiHost },
  interactiveUi: { defaultRegistry: DEFAULT_INTERACTIVE_UI_REGISTRY },
  a2ui: { catalogFromRegistry: buildA2uiCatalogFromRegistry },
  page: { getModelContext: getAgentModelContext },
} satisfies ChatSurfaces;
