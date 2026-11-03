import type { ByokToolSurface } from "#src/assistant/byok-tool-surface";
import { onExternalMcpRosterChanged } from "#src/assistant/external-mcp-roster-change";
import { readServerAdmissions } from "../../services/external-mcp-admissions.js";

/**
 * Preparation ports over the server's existing tool surface. Constructing this starts nothing.
 * Integration must bind admissions, register the roster listener and use these daemon-call
 * adapters together with the desktop HTTP cutover; otherwise a managed desktop stdio row could
 * become a permanent server child. This module never constructs a second federation or executor.
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
  _optional: Record<string, never> = {},
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
    registerRosterListener: () => onExternalMcpRosterChanged("byok", () => reload({}, {})),
    daemonCalls: {
      executor: {
        ...toolSurface.daemonCalls.executor,
        execute: async (call, optional) => {
          await readAdmissions();
          return toolSurface.daemonCalls.executor.execute(call, optional);
        },
      },
      listToolsFor: async (required, optional) => {
        await readAdmissions();
        return toolSurface.daemonCalls.listToolsFor(required, optional);
      },
    },
  };
}
