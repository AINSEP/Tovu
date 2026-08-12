import { api, type AdminComposioConfig } from "../../../lib/api";
import type { ComposioConfigPort } from "./composio-config-port.hooks";

/**
 * @file The only place under `features/settings`'s Composio-key hook that reaches `lib/api` — see
 * `composio-config-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultComposioConfigPort: ComposioConfigPort = {
  getComposioConfig: () => api.getComposioConfig(),
  saveComposioConfig: (apiKey) => api.saveComposioConfig(apiKey),
};

/** Seed state for {@link createFakeComposioConfigPort}. */
export interface FakeComposioConfigPortOptions {
  config?: AdminComposioConfig;
}

const DEFAULT_FAKE_CONFIG: AdminComposioConfig = { configured: false, apiKeyTail: "" };

/**
 * An in-memory {@link ComposioConfigPort} for tests — the fake that lets a test describe "the key
 * is already configured" or "saving flips `configured` to true" directly, instead of hand-building
 * `Response` objects and stubbing global `fetch`. Shipped alongside the real binding per the
 * pattern's "every port gets a fake" rule.
 */
export function createFakeComposioConfigPort(options: FakeComposioConfigPortOptions = {}): ComposioConfigPort & {
  /** The fake's current config record. */
  readonly current: AdminComposioConfig;
} {
  let current = options.config ?? DEFAULT_FAKE_CONFIG;

  return {
    get current() {
      return current;
    },

    async getComposioConfig() {
      return current;
    },

    async saveComposioConfig(apiKey) {
      current = apiKey === null ? { configured: false, apiKeyTail: "" } : { configured: true, apiKeyTail: apiKey.slice(-4) };
      return current;
    },
  };
}
