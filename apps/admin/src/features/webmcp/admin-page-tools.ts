import {
  PAGE_CAPABILITIES, executePageCapability, toWebMcpTool,
  type PageDriver, type RequestUserInteraction,
} from "@jini-ai/agentic";
import { getAgentModelContext, type AgentModelContextLike } from "@jini-ai/agentic/dom";
import { getBrowserAgentEnabled } from "./browser-agent-settings.hooks";

/** Thin CMS/admin policy adapter. Projection, schema validation, credential guards and page
 * navigation remain in Jini. WebMCP carries no run/principal: confirmation does not replace
 * server-side permissions or confer ToolExecutor authorization. */
export function registerAdminPageWebMcpTools(
  { driver, signal }: { driver: PageDriver; signal: AbortSignal },
  {
    modelContext = getAgentModelContext({ host: { candidates: () => [
      typeof document === "undefined" ? undefined : (document as unknown as { modelContext?: unknown }).modelContext,
      typeof navigator === "undefined" ? undefined : (navigator as unknown as { modelContext?: unknown }).modelContext,
    ] } }),
    requestUserInteraction,
    isEnabled = () => getBrowserAgentEnabled({}),
    onError = ({ name, error }) => console.warn(`[admin] WebMCP registration failed: ${name}`, error),
  }: {
    modelContext?: AgentModelContextLike;
    requestUserInteraction?: RequestUserInteraction;
    isEnabled?: () => boolean;
    onError?: (required: { name: string; error: unknown }) => void;
  } = {},
): void {
  if (!modelContext || signal.aborted || !isEnabled()) return;
  const assertOpen = () => {
    if (signal.aborted || !isEnabled()) throw new Error("WebMCP admin access is disabled or closed");
  };
  for (const definition of PAGE_CAPABILITIES) {
    const registration = toWebMcpTool({
      // The daemon governs writes itself. This page-native path has no such gate, so every
      // non-read operation (including navigation) needs a separate human confirmation here.
      capability: { ...definition, requiresConfirmation: definition.requiresConfirmation === true || definition.risk !== "read" },
      execute: ({ id, args }) => {
        assertOpen();
        return executePageCapability({ driver, capabilityId: id, input: args });
      },
    }, {
      signal,
      annotations: { untrustedContentHint: true },
      requestUserInteraction: requestUserInteraction ? async (interaction) => {
        assertOpen();
        return requestUserInteraction(interaction);
      } : undefined,
    });
    try {
      const pending = modelContext.registerTool({ tool: registration }, registration.registerOptions);
      void Promise.resolve(pending).catch((error: unknown) => {
        if (!signal.aborted) onError({ name: registration.name, error });
      });
    } catch (error) {
      if (!signal.aborted) onError({ name: registration.name, error });
    }
  }
}
