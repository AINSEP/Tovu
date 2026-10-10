import { InMemorySettingsRepo } from "@jini-ai/core/settings";
import type { RegistryDepsWithoutLimiter } from "./registry-deps.js";
import { ALL_CHAT_DELETE_TOOLS } from "../../permanent-delete-tool-gate.js";
/** Injected ledger reader for focused domain suites; no module mock or ambient setting. */
export function withChatDeleteGrant(required: { deps: RegistryDepsWithoutLimiter }, _optional = {}): RegistryDepsWithoutLimiter {
  return { ...required.deps, settingsRepo: new InMemorySettingsRepo(),
    settingsUiTabsReady: Promise.resolve(), settingsReady: Promise.resolve(),
    getEffective: async () => ({ value: ALL_CHAT_DELETE_TOOLS, sourceLayer: "workspace", defVersion: 1 }),
  };
}
