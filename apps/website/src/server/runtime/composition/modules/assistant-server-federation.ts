import type { ToolAccessChange } from '@jini-ai/daemon';
import { lowerAssistantToolAccess } from './assistant-tool-access-lowering.js';
import type { ByokToolSurface } from "#src/assistant/byok-tool-surface";
import { onExternalMcpRosterChanged } from "#src/assistant/external-mcp-roster-change";
import { readServerAdmissions } from "../../services/external-mcp-admissions.js";

/**
 * Demand ports over the server's single existing tool surface. Constructing this starts nothing.
 * Only the serving app registers the roster listener. The connection source suppresses the legacy
 * desktop stdio identity before admission. No second federation or executor is constructed here.
 */
export interface AssistantServerFederation {
  readonly admissions: () => ReturnType<typeof readServerAdmissions>;
  readonly daemonCalls: ByokToolSurface["daemonCalls"];
  readonly reload: (required: Record<string, never>, optional?: Record<string, never>) => Promise<void>;
  readonly registerRosterListener: (required: Record<string, never>, optional?: Record<string, never>) => void;
}

/** Compose server-only demand adapters without activating them.
 * @param required.toolSurface - The same surface used by BYOK and /internal/tool-executions.
 * @returns Local diagnostics, a cold-safe roster listener, and admission-aware daemon-call adapters.
 * @example const server = createAssistantServerFederation({ toolSurface }, {});
 * @complexity O(1) composition. Startup/reload and remote bounds stay with the existing federation.
 */
export function createAssistantServerFederation(
  { toolSurface }: { toolSurface: Pick<ByokToolSurface, "readFederationAdmissions" | "awaitFederation" | "federation" | "daemonCalls"> },
  optional: { lowerLocal?: (change: ToolAccessChange) => Promise<void> } = {},
): AssistantServerFederation {
  const readAdmissions = () => toolSurface.readFederationAdmissions({}, {});

  /** Cold reload first admits the boot roster; the existing coordinator then reads the latest
   * roster again, including writes that arrived during startup. No independent queue or state.
   * @complexity Startup once, then the existing coalesced reload's bounded per-connection work. */
  async function reload(_required: Record<string, never>, _options: Record<string, never> = {}): Promise<void> {
    await readAdmissions();
    await toolSurface.federation?.reload();
  }

  return {
    admissions: () => readServerAdmissions({ awaitFederation: toolSurface.awaitFederation, readAdmissions }, {}),
    reload,
    registerRosterListener: () => onExternalMcpRosterChanged("byok", async lowered => {
      if (lowered) {
        await Promise.all([lowerAssistantToolAccess(lowered, {}), optional.lowerLocal?.(lowered)]);
        // Stop/cleanup certifies OFF; optional discovery latency must not turn that into a failure.
        void reload({}, {}).catch(() => {});
        return;
      }
      await reload({}, {});
    }),
    daemonCalls: {
      executor: {
        ...toolSurface.daemonCalls.executor,
        execute: async (call, optional) => {
          await toolSurface.awaitFederation(5_000);
          return toolSurface.daemonCalls.executor.execute(call, optional);
        },
      },
      listToolsFor: async (required, optional) => {
        // Native tools remain usable while optional remote connections finish admission.
        // The next catalog read picks up late admissions from the same live surface.
        await toolSurface.awaitFederation(5_000);
        return toolSurface.daemonCalls.listToolsFor(required, optional);
      },
    },
  };
}
