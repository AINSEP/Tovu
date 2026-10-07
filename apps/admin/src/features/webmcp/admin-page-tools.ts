import { directPageAction } from "@tovu/headless";
import {
  PAGE_CAPABILITIES, executePageCapability, toWebMcpTool,
  type PageDriver, type RequestUserInteraction, type WebMcpToolRegistration,
} from "@jini-ai/agentic";
import { getAgentModelContext, type AgentModelContextLike } from "@jini-ai/agentic/dom";
import type { AdminPageApprovalStore } from "./admin-page-approval.store";
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
    approvals,
    isEnabled = () => getBrowserAgentEnabled({}),
    onError = ({ name, error }) => console.warn(`[admin] WebMCP registration failed: ${name}`, error),
  }: {
    modelContext?: AgentModelContextLike;
    requestUserInteraction?: RequestUserInteraction;
    approvals?: AdminPageApprovalStore;
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
        const frozenArgs = structuredClone(args);
        if (!directPageAction({ capabilityId: id, input: frozenArgs })) {
          if (!requestUserInteraction) throw new Error("This page action requires an app confirmation channel");
          if (!await requestUserInteraction({ capability: definition, args: structuredClone(frozenArgs) })) throw new Error("Page action declined");
          assertOpen();
        }
        return executePageCapability({ driver, capabilityId: id, input: frozenArgs });
      },
    }, {
      signal,
      annotations: { untrustedContentHint: true },
      requestUserInteraction: requestUserInteraction ? async (interaction) => {
        assertOpen();
        return requestUserInteraction(interaction);
      } : undefined,
    });
    if (approvals) {
      register({
        ...registration,
        description: `${registration.description} Protected actions return approval_required; explicitly answer through admin.respond_page_approval before they run. Ordinary edits run directly.`,
        // Reuse Jini's projection validator before recording the proposal. This also avoids
        // depending on a helper signature that differs between the linked source and its dist.
        execute: toWebMcpTool({
          capability: { ...definition, requiresConfirmation: false },
          execute: async ({ args: input }) => {
            assertOpen();
            // Capture values once: the tool caller cannot edit a pending destructive action's input.
            const args = structuredClone(input);
            if (directPageAction({ capabilityId: definition.id, input: args })) {
              return executePageCapability({ driver, capabilityId: definition.id, input: args });
            }
            return approvals.propose({
              interaction: { capability: definition, args: structuredClone(args) }, signal,
              execute: async () => {
                assertOpen();
                return executePageCapability({ driver, capabilityId: definition.id, input: args });
              },
            });
          },
        }, { signal }).execute,
      });
    } else register(registration);
  }
  if (approvals) register({
    name: "admin.respond_page_approval",
    description: "Explicitly approve or decline the exact pending admin page action. Approval executes it once; never approve a destructive action without the user's authorization.",
    inputSchema: { type: "object", properties: { approvalId: { type: "string" }, approved: { type: "boolean" } }, required: ["approvalId", "approved"], additionalProperties: false },
    annotations: { readOnlyHint: false },
    registerOptions: { signal },
    execute: async (args) => {
      assertOpen();
      if (typeof args.approvalId !== "string" || typeof args.approved !== "boolean" || Object.keys(args).some(key => key !== "approvalId" && key !== "approved")) {
        throw new Error("Expected approvalId (string) and approved (boolean)");
      }
      return approvals.respond({ approvalId: args.approvalId, approved: args.approved });
    },
  });
}
