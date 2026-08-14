import type { SiteAssistantCredential, SiteAssistantCredentialPatch } from "../../../lib/api";

/**
 * @file What `use-visitor-credential-form.hooks.ts` needs from the outside world, as an interface
 * rather than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair
 * documented on `assistant-chats-port.hooks.ts` (the canonical reference in this workspace) and the
 * shape `ai-assistant-port.hooks.ts`/`composio-config-port.hooks.ts` use for a single-hook feature.
 *
 * Was previously `VisitorCredentialApi`, declared inline in `use-visitor-credential-form.hooks.ts`
 * itself (the "F05 coupling fix", audit `TM-20260810-01` — see that file's `saveVisitorCredential`
 * for the extraction this port formalizes). Split out and renamed to match the `<Name>Port` /
 * `<name>-port.hooks.ts` convention the rest of this workspace's hook quartets use; no behavior
 * changed by the move.
 *
 * Structurally the matching slice of `lib/api`'s client, declared here rather than imported whole so
 * `use-visitor-credential-form.hooks.ts` depends on the two methods it uses instead of on the
 * ambient singleton — the same reasoning `AiAssistantPort` documents for its own two methods.
 */
export interface VisitorCredentialFormPort {
  getAssistantSiteCredential(): Promise<{ data: SiteAssistantCredential }>;
  setAssistantSiteCredential(patch: SiteAssistantCredentialPatch): Promise<{ data: SiteAssistantCredential }>;
}
