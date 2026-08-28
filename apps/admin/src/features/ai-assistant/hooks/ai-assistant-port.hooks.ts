import type { PublicAssistantSettings } from "@/lib/api";

/**
 * @file What `use-ai-assistant.hooks.ts` needs from the outside world, as an interface rather than
 * a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented on
 * `assistant-chats-port.hooks.ts` (the canonical reference in this workspace) and the shape
 * `redirects-port.hooks.ts` uses for a single-hook feature.
 *
 * Scoped to `useAiAssistant` only — `use-visitor-credential-form.hooks.ts` reaches a much larger
 * `api` surface of its own and is not part of this port.
 */
export interface AiAssistantPort {
  getAssistantSettings(): Promise<{ data: PublicAssistantSettings }>;
  setAssistantSettings(patch: Partial<PublicAssistantSettings>): Promise<{ data: PublicAssistantSettings }>;
}
