import { directPageAction } from "@tovu/headless";
import { PAGE_CAPABILITIES, executePageCapability, toWebMcpTool, type PageDriver } from "@jini-ai/agentic";
import { getAgentModelContext } from "@jini-ai/agentic/dom";
import type { AdminPageToolCollaborators } from "@jini-ai/admin/screens/webmcp/admin-page-tools";
import { getBrowserAgentEnabled } from "./browser-agent-settings.hooks";

/**
 * @file What this admin injects into `@jini-ai/admin`'s `registerAdminPageWebMcpTools`:
 * `@jini-ai/agentic`'s page-capability catalog, executor, WebMCP projection and model-context lookup,
 * Tovu's own direct-vs-confirmed page-action policy (`@tovu/headless`), the origin-local browser-agent
 * preference, and the admin's registration-failure warning. `App.hooks.ts` and the WebMCP tests
 * spread it into the call's first argument.
 */
export const adminPageToolCollaborators: AdminPageToolCollaborators<PageDriver> = {
  pageCapabilities: PAGE_CAPABILITIES,
  executePageCapability,
  toWebMcpTool,
  getAgentModelContext,
  directPageAction,
  isBrowserAgentEnabled: () => getBrowserAgentEnabled({}),
  reportRegistrationError: ({ name, error }) => console.warn(`[admin] WebMCP registration failed: ${name}`, error),
};
