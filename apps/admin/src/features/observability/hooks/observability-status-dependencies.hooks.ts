import { api, type AdminObservabilityStatus } from "@/lib/api";
import type { ObservabilityStatusPort } from "./observability-status-port.hooks";

/**
 * @file The only place under `features/observability`'s hook that reaches `lib/api` — see
 * `observability-status-port.hooks.ts` for why the split exists. Mirrors
 * `features/plugins/hooks/agent-plugins-dependencies.hooks.ts`'s identical split for its sibling
 * screen.
 */

/** The live implementation, as a module-level singleton — matches `defaultAgentPluginsPort`. */
export const defaultObservabilityStatusPort: ObservabilityStatusPort = {
  getObservabilityStatus: () => api.getObservabilityStatus(),
};

/** Seed state for {@link createFakeObservabilityStatusPort}. */
export interface FakeObservabilityStatusPortOptions {
  status?: AdminObservabilityStatus;
  /** Makes `getObservabilityStatus` reject with this instead of resolving — for the hook's own
   *  failure-path test. */
  failWith?: unknown;
}

/** An in-memory {@link ObservabilityStatusPort} for tests — mirrors
 *  `createFakeAgentPluginsPort`'s identical role. */
export function createFakeObservabilityStatusPort(
  options: FakeObservabilityStatusPortOptions = {},
): ObservabilityStatusPort {
  return {
    async getObservabilityStatus() {
      if (options.failWith !== undefined) throw options.failWith;
      return options.status ?? { enabled: false, serviceName: null };
    },
  };
}
