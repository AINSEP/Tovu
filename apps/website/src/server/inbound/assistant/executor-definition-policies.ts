import type { createNativeAgentRuntime } from "@jini-ai/agent-runtime";

/** Until the executor takes the bound runtime port (daemon R8b), it still receives the two definition policies by value.
 * A module of its own because `createSiteScope` (`agent-daemon-scope.ts`) is at both its size and complexity ceilings. */
export function executorDefinitionPolicies(
  { runtime }: { runtime: ReturnType<typeof createNativeAgentRuntime> },
  _optional: Record<string, never> = {},
): { codexDisablePlugins: boolean; piGracefulShutdownMs: number } {
  return { codexDisablePlugins: runtime.codex.disablePlugins === true, piGracefulShutdownMs: runtime.pi.gracefulShutdownMs ?? 5000 };
}
