import { useEffect, useState } from "react";

import { useAiAssistant, type AiAssistantController } from "@jini-ai/admin/screens/assistant-settings/use-ai-assistant.hooks";
import { navigate } from "@jini-ai/admin/shell/lib/router";
import { describeApiError } from "../rules";
import { defaultAiAssistantPort } from "./ai-assistant-dependencies.hooks";

/**
 * @file Host bindings for the AI Assistant screen: the wired settings hook (the hook itself lives in
 * `@jini-ai/admin/screens/assistant-settings/use-ai-assistant.hooks`) and the screen's own tab state,
 * which the host owns.
 */

/**
 * Binds the real `/api/.../assistant/settings` client — see `ai-assistant-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `AiAssistant.tsx` composes this and a test composes {@link useAiAssistant} with
 * `createFakeAiAssistantPort`.
 */
export function useWiredAiAssistant(): AiAssistantController {
  return useAiAssistant({ port: defaultAiAssistantPort, describeError: describeApiError });
}

/** The three tab ids `AiAssistant.tsx`'s own `tabs` array declares — kept here as the single source
 *  {@link resolveAiAssistantRequestedTabId} checks a `?tab=` value against, so a stray typo in a
 *  link can never look like a valid tab. */
export const AI_ASSISTANT_TAB_IDS = ["visitor", "admin", "roadmap"] as const;

/**
 * The tab the inline shell should actually open on, or `undefined` to leave it uncontrolled — same
 * computation, and same reason, as `SettingsUi.tsx`'s own `requestedTabId`: `tabId` can be `null` (no
 * `?tab=` at all, the common case) or an id that matches none of the three tabs (typo, stale link),
 * and either one must fall back to the shell's own default rather than being passed straight through
 * as `activeTabId`, whose controlled/uncontrolled switch is `!== undefined`, not truthiness.
 */
export function resolveAiAssistantRequestedTabId({ tabId }: { tabId: string | null | undefined }, _options: Record<string, never> = {}): string | undefined {
  return tabId && (AI_ASSISTANT_TAB_IDS as readonly string[]).includes(tabId) ? tabId : undefined;
}

/** Keeps the page subtitle and shell on the same tab, including standalone mounts.
 * URL changes remain owned by the existing navigation function. No I/O beyond navigation.
 * @complexity Time/space: O(1), with a fixed three-tab set.
 */
export function useAiAssistantTab({ tabId }: { tabId: string | null | undefined }, _options = {}) {
  const [activeTabId, setActiveTabId] = useState(() => resolveAiAssistantRequestedTabId({ tabId }) ?? "visitor");
  useEffect(() => { setActiveTabId(resolveAiAssistantRequestedTabId({ tabId }) ?? "visitor"); }, [tabId]);
  const onTabChange = (nextTabId: string) => {
    setActiveTabId(nextTabId);
    navigateToAiAssistantTab({ nextTabId });
  };
  return { activeTabId, onTabChange };
}

/** Reuses the selected tab's translated copy; unknown ids use the first tab.
 * @complexity Time: O(n) tabs; space: O(1).
 */
export function resolveAiAssistantTabSubtitle({ tabs, activeTabId }: {
  tabs: readonly { id: string; subtitle?: string }[]; activeTabId: string;
}, _options = {}): string | undefined {
  return (tabs.find(tab => tab.id === activeTabId) ?? tabs[0])?.subtitle;
}

/**
 * Keeps `?tab=` in sync as the operator switches tabs — same `replace`-not-push shape and same
 * "fires even before any `?tab=` is present" behaviour as `SettingsUi.tsx`'s own `handleTabChange`.
 */
export function navigateToAiAssistantTab({ nextTabId }: { nextTabId: string }, _options: Record<string, never> = {}): void {
  navigate({ routePath: `/ai-assistant?tab=${nextTabId}` }, { replace: true });
}
