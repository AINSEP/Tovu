import { api } from "../../../lib/api";
import type { AssistantDaemonRestartPort } from "./assistant-daemon-restart-port.hooks";

/**
 * @file The only place `use-assistant-daemon-restart.hooks.ts` reaches `lib/api` — see
 * `assistant-daemon-restart-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `ai-assistant-dependencies
 *  .hooks.ts`'s `defaultAiAssistantPort`. */
export const defaultAssistantDaemonRestartPort: AssistantDaemonRestartPort = {
  restart: () => api.restartAssistantDaemon(),
  getReadyz: () => api.getAssistantDaemonReadyz(),
};

/** Seed state for {@link createFakeAssistantDaemonRestartPort}. */
export interface FakeAssistantDaemonRestartPortOptions {
  restartResult?: { ok: boolean; reason?: string };
  readyz?: { ready: boolean; assistantDaemonKnownFailed?: true };
}

/**
 * An in-memory {@link AssistantDaemonRestartPort} for tests — records every call so a test can
 * assert both "the button called restart()" and "the follow-up status check happened", without
 * stubbing global `fetch`. Shipped alongside the real binding per the pattern's "every port gets a
 * fake" rule.
 */
export function createFakeAssistantDaemonRestartPort(options: FakeAssistantDaemonRestartPortOptions = {}): AssistantDaemonRestartPort & {
  readonly restartCallCount: number;
  readonly readyzCallCount: number;
} {
  let restartCallCount = 0;
  let readyzCallCount = 0;
  const restartResult = options.restartResult ?? { ok: true };
  const readyz = options.readyz ?? { ready: true };

  return {
    get restartCallCount() {
      return restartCallCount;
    },
    get readyzCallCount() {
      return readyzCallCount;
    },
    async restart() {
      restartCallCount += 1;
      return restartResult;
    },
    async getReadyz() {
      readyzCallCount += 1;
      return readyz;
    },
  };
}
