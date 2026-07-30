/**
 * @file Ambient declaration for `@jini-ai/agent-runtime`.
 *
 * Same node10-`moduleResolution` reason as `jini-shims.d.ts` (see that file's header). Replaces
 * the former `src/agent-chat/jini-agent-runtime.d.ts`, widened past `claudeAgentDef` alone: ADR-049
 * requires `listAgents()` to probe the full registry, not just Claude.
 */
declare module "@jini-ai/agent-runtime" {
  export interface AgentLaunchResolution {
    launchPath: string | null;
    childPathPrepend: string[];
    diagnostic: string | null;
  }

  export interface RuntimeBuildOptions {
    model?: string | null;
    reasoning?: string | null;
    permissionMode?: "bypass" | "restricted";
  }

  export interface RuntimeContext {
    cwd?: string;
    newSessionId?: string;
    resumeSessionId?: string | null;
    hasPriorAssistantTurn?: boolean;
  }

  export interface RuntimeModelOption {
    readonly id: string;
    readonly label: string;
  }

  /** The subset of `RuntimeAgentDef` Tovu reads. See `packages/agent-runtime/src/types.ts` upstream for the full shape. */
  export interface RuntimeAgentDef {
    readonly id: string;
    readonly name: string;
    readonly bin: string;
    readonly streamFormat: string;
    readonly externalMcpInjection?: "claude-mcp-json" | "acp-merge" | "opencode-env-content" | "mimo-env-content";
    readonly supportsCustomModel?: boolean;
    readonly installUrl?: string;
    readonly docsUrl?: string;
    readonly fallbackModels: RuntimeModelOption[];
    readonly reasoningOptions?: RuntimeModelOption[];
    buildArgs(
      prompt: string,
      imagePaths: string[],
      extraAllowedDirs?: string[],
      options?: RuntimeBuildOptions,
      runtimeContext?: RuntimeContext,
    ): string[];
  }

  /** The 24 built-in CLI adapter defs (`registry.ts`'s `BASE_AGENT_DEFS`). */
  export const AGENT_DEFS: readonly RuntimeAgentDef[];
  export function getAgentDef(id: string): RuntimeAgentDef | null;

  export function resolveAgentLaunch(def: RuntimeAgentDef, configuredEnv?: Record<string, string>): AgentLaunchResolution;
  export function applyAgentLaunchEnv(
    env: NodeJS.ProcessEnv,
    launch: Pick<AgentLaunchResolution, "childPathPrepend">,
    nodeBinDir?: string,
    appendPathDirs?: string[],
  ): NodeJS.ProcessEnv;
}
