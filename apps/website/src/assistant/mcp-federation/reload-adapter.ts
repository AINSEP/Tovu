/** @file Host DI/ABI adapter; reload.ts's admission freeze and trailing-edge queue moved to Jini. */
import { createFederationReloadCoordinator as createJiniReload, type FederationReloadResult } from "@jini-ai/mcp/federation";
import { attachFederatedMcpTools, createDefaultConnect, tovuStdioLaunchResolverFromEnv, type AttachFederatedMcpToolsParams, type FederationLogger } from "./bootstrap.js";
import { toJiniFederationDeps, type FederationDeps } from "./registrations.js";
import type { ResolvedFederatedConnection } from "@jini-ai/mcp/federation";

/** Host contracts retain the injected attach seam and zero-argument reload used by daemon/BYOK. */
export interface FederationReloadCoordinatorDeps {
  readonly registry: AttachFederatedMcpToolsParams["registry"];
  readonly deps: FederationDeps;
  readonly resolveConnections: () => Promise<readonly ResolvedFederatedConnection[]>;
  readonly attach?: typeof attachFederatedMcpTools;
  readonly logger?: FederationLogger;
  readonly connect?: AttachFederatedMcpToolsParams["connect"];
}

/** Adapt ports once; Jini owns coalescing, failed-attempt retry and the frozen admitted set.
 * @complexity O(1) to construct; reload inherits O(c · t) admission work from Jini.
 */
export function createFederationReloadCoordinator({ coordDeps, initiallyAdmitted }: {
  coordDeps: FederationReloadCoordinatorDeps; initiallyAdmitted: Iterable<string>;
}, _optional: Record<string, never> = {}): {
  reload(): Promise<FederationReloadResult>; admittedConnectionIds(): ReadonlySet<string>;
} {
  const connect = coordDeps.connect ?? createDefaultConnect({ resolver: {
    resolve: ({ spec }) => tovuStdioLaunchResolverFromEnv(process.env).resolve({ spec }),
  } }, { logger: coordDeps.logger });
  const attach = coordDeps.attach ?? attachFederatedMcpTools;
  const coordinator = createJiniReload({ initiallyAdmitted, coordDeps: {
    registry: coordDeps.registry, deps: toJiniFederationDeps({ deps: coordDeps.deps }),
    resolveConnections: coordDeps.resolveConnections,
    connect: ({ connection }) => connect(connection),
    // Keep the existing host attach injection usable without running a second boot/preset pass.
    attach: async (_required, options = {}) => {
      return attach({ registry: coordDeps.registry, deps: coordDeps.deps, connect,
        connections: options.connections, extraConnections: options.extraConnections,
        ...(coordDeps.logger ? { logger: coordDeps.logger } : {}),
      });
    },
    ...(coordDeps.logger ? { logger: {
      info: ({ message }: { message: string }) => coordDeps.logger!.info(message),
      warn: ({ message }: { message: string }) => coordDeps.logger!.warn(message),
      error: ({ message }: { message: string }) => coordDeps.logger!.warn(message),
    } } : {}),
  } });
  return { reload: () => coordinator.reload({}), admittedConnectionIds: () => coordinator.admittedConnectionIds() };
}
