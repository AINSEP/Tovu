import type { AdminComposioConfig } from "../../../lib/api";

/**
 * @file What `use-composio-config.hooks.ts` needs from the outside world, as an interface rather
 * than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented
 * on `assistant-chats-port.hooks.ts` (the canonical reference in this workspace) and the shape
 * `redirects-port.hooks.ts` uses for a single-hook feature.
 */
export interface ComposioConfigPort {
  getComposioConfig(): Promise<AdminComposioConfig>;
  /** Stores (`string`) or clears (`null`) the workspace's Composio API key — see
   *  `lib/api.ts`'s own `saveComposioConfig` doc for why a missing key can't mean "leave alone". */
  saveComposioConfig(apiKey: string | null): Promise<AdminComposioConfig>;
}
