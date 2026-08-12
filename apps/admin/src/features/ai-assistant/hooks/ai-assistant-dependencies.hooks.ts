import { api, type PublicAssistantSettings } from "../../../lib/api";
import type { AiAssistantPort } from "./ai-assistant-port.hooks";

/**
 * @file The only place `use-ai-assistant.hooks.ts` reaches `lib/api` — see `ai-assistant-port
 * .hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultAiAssistantPort: AiAssistantPort = {
  getAssistantSettings: () => api.getAssistantSettings(),
  setAssistantSettings: (patch) => api.setAssistantSettings(patch),
};

/** Seed state for {@link createFakeAiAssistantPort}. */
export interface FakeAiAssistantPortOptions {
  settings?: PublicAssistantSettings;
}

const DEFAULT_FAKE_SETTINGS: PublicAssistantSettings = { publicEnabled: false };

/**
 * An in-memory {@link AiAssistantPort} for tests — the fake that lets a test describe "the
 * assistant starts enabled" directly, instead of hand-building `Response` objects and stubbing
 * global `fetch`. Shipped alongside the real binding per the pattern's "every port gets a fake"
 * rule.
 */
export function createFakeAiAssistantPort(options: FakeAiAssistantPortOptions = {}): AiAssistantPort & {
  /** The fake's current settings record. */
  readonly current: PublicAssistantSettings;
} {
  let current = options.settings ?? DEFAULT_FAKE_SETTINGS;

  return {
    get current() {
      return current;
    },

    async getAssistantSettings() {
      return { data: current };
    },

    async setAssistantSettings(patch) {
      current = { ...current, ...patch };
      return { data: current };
    },
  };
}
