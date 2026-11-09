/** Tovu compatibility shim (A10 seam). The portable body lives in `@jini-ai/agent-plugins/connect`
 * and takes the installed-plugin reads and the rename actor as required inputs; these entries keep
 * their original positional signatures and bind Tovu's lifecycle reads and `system:tool-renames`. */
import type { Clock as ClockPort } from "@jini-ai/core/primitives";
import type { AgentPluginMcpPort } from "./service-ports.js";
import { listInstalledAgentPluginServers, type InstalledAgentPluginServers, type TokenImportLog } from "./import-access-token.js";
import { applyAgentPluginToolRenames as applyWithPorts, renameToolNames as renameWithPorts } from "@jini-ai/agent-plugins/connect";

/** Recorded as the row's write-grant attribution when a rename changes its write list. */
const TOOL_RENAMES_ACTOR = "system:tool-renames";

export interface ApplyAgentPluginToolRenamesDeps {
  readonly workspaceId: string;
  readonly agentPluginLayout: import("./layout.js").AgentPluginLayout;
  readonly externalMcpServerRepo: AgentPluginMcpPort["repo"];
  readonly clock: ClockPort;
  /** Injected for tests. Defaults to `import-access-token.ts`'s `listInstalledAgentPluginServers`. */
  readonly listPlugins?: () => Promise<readonly InstalledAgentPluginServers[]>;
  /** Announces a changed roster so live runtimes reload — the composition root passes
   *  `notifyExternalMcpRosterChanged`. A port rather than a value import: a feature module may not
   *  value-import `#src/assistant/` (`domain-no-direct-tool-registration.boundary.test.ts`). */
  readonly notifyRosterChanged: () => Promise<void>;
}

export function renameToolNames(names: readonly string[], renames: Readonly<Record<string, string>>): string[] | null {
  return renameWithPorts({ names, renames });
}

/** Same entry; the layout getter is read only if the default listing runs (as before). */
export function applyAgentPluginToolRenames(deps: ApplyAgentPluginToolRenamesDeps, log: TokenImportLog): Promise<void> {
  return applyWithPorts({ log, deps: {
    workspaceId: deps.workspaceId, externalMcpServerRepo: deps.externalMcpServerRepo, clock: deps.clock, actor: TOOL_RENAMES_ACTOR,
    notifyRosterChanged: () => deps.notifyRosterChanged(),
    listPlugins: () => (deps.listPlugins ?? (() => listInstalledAgentPluginServers(deps)))(),
  } });
}
