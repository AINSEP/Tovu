import { directPageAction } from "../../../../website/src/assistant/assistant-tool-approval-policy.js";
import {
  PAGE_CAPABILITIES, executePageCapability, toWebMcpTool,
  type PageDriver, type WebMcpToolRegistration,
} from "@jini-ai/agentic";
import { getAgentModelContext, type AgentModelContextLike } from "@jini-ai/agentic/dom";
import { getBrowserAgentEnabled } from "./browser-agent-settings.hooks";

/** The authenticated host adapter owns confirmation and execution of opaque page effects. */
export type RequestAdminPageAction = (required: {
  capabilityId: string; input: Record<string, unknown>; signal: AbortSignal;
}) => Promise<unknown>;

/** Thin CMS/admin policy adapter. Jini keeps projection, schema validation and direct page guards.
 * Protected actions use the authenticated ToolExecutor/card exchange; the browser agent never
 * receives a confirmation-answer capability or a local callback that can execute the action.
 * @complexity O(n) registrations for n page capabilities; O(input bytes) per captured call.
 * @overallScore 98
 * @tradeoffs Low: current browser access is rechecked locally; the host cancels the request when
 * the registration lifetime ends, and the server owns authorization and once-only execution. */
export function registerAdminPageWebMcpTools(
  { driver, signal }: { driver: PageDriver; signal: AbortSignal },
  {
    modelContext = getAgentModelContext({ host: { candidates: () => [
      typeof document === "undefined" ? undefined : (document as unknown as { modelContext?: unknown }).modelContext,
      typeof navigator === "undefined" ? undefined : (navigator as unknown as { modelContext?: unknown }).modelContext,
    ] } }),
    requestPageAction,
    isEnabled = () => getBrowserAgentEnabled({}),
    onError = ({ name, error }) => console.warn(`[admin] WebMCP registration failed: ${name}`, error),
  }: {
    modelContext?: AgentModelContextLike;
    requestPageAction?: RequestAdminPageAction;
    isEnabled?: () => boolean;
    onError?: (required: { name: string; error: unknown }) => void;
  } = {},
): void {
  if (!modelContext || signal.aborted || !isEnabled()) return;
  const assertOpen = () => {
    if (signal.aborted || !isEnabled()) throw new Error("WebMCP admin access is disabled or closed");
  };
  const register = (registration: WebMcpToolRegistration) => {
    try {
      const pending = modelContext.registerTool({ tool: registration }, registration.registerOptions);
      void Promise.resolve(pending).catch((error: unknown) => {
        if (!signal.aborted) onError({ name: registration.name, error });
      });
    } catch (error) {
      if (!signal.aborted) onError({ name: registration.name, error });
    }
  };
  for (const definition of PAGE_CAPABILITIES) {
    const registration = toWebMcpTool({
      // Owner 2026-10-07: ordinary edits run directly; opaque clicks require explicit consent.
      // Classification lives in the shared host table used by the daemon and WebMCP.
      capability: { ...definition, requiresConfirmation: false },
      execute: async ({ id, args }) => {
        assertOpen();
        const capturedArgs = structuredClone(args);
        const execute = async () => {
          assertOpen();
          return executePageCapability({ driver, capabilityId: id, input: capturedArgs });
        };
        if (directPageAction({ capabilityId: id, input: capturedArgs })) return execute();
        if (!requestPageAction) throw new Error("This page action requires an authenticated chat confirmation channel");
        const result = await requestPageAction({ capabilityId: id, input: capturedArgs, signal });
        assertOpen();
        return result;
      },
    }, { signal, annotations: { untrustedContentHint: true } });
    // Projection validates before the adapter can open a card. Each protected request captures
    // its input once; human decisions travel only through the server's authenticated callback.
    register(registration);
  }
}
