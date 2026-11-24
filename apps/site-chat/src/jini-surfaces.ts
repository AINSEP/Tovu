// WHY apps/site-chat/package.json DECLARES `@mcp-ui/client` WITH NO IMPORT IN THIS APP (owner decision B280, keep):
// it is the optional peer of `@jini-ai/ui/mcp-ui` (see `peerDependenciesMeta` in that package), and
// the `McpUiHost` imported on the first import below renders through its `AppRenderer`. A published
// `@jini-ai/ui` cannot install an optional peer for us, so this app must declare it or the
// MCP-UI iframe surface cannot load. Removing it only *looks* safe, because no file here names it.
// knip.json lists it under this workspace's `ignoreDependencies` for the same reason.
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
