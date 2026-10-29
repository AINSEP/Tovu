import { useFetchQuery, useFetchMutation, useCachedLoader } from "@jini-ai/ui/fetch-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PublicAssistantSettings } from "@/lib/api";
import { navigate } from "@/lib/router";
import { describeApiError } from "../rules";
import { defaultAiAssistantPort } from "./ai-assistant-dependencies.hooks";
import type { AiAssistantPort } from "./ai-assistant-port.hooks";

/**
 * @file The `AiAssistant` screen's own top-level state: the visitor-facing public on/off switch.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings. This is
 * deliberately narrower than the whole screen: `AdminAssistantSwitch`, `AdminExecutionMode`, and
 * `VisitorCredentialForm` each own their own state and get their own hook file, per this feature's
 * "one hook file per component" convention (see `features/integrations/hooks/` for the same split
 * applied to a smaller feature).
 *
 * `deps.port` is injected (see `ai-assistant-port.hooks.ts`) rather than reaching for `lib/api`'s
 * `api` directly — the same `useX(dependencies)` / `useWiredX()` split `redirects`/`widgets`/
 * `plugins`/`members`/`workspace` use. `use-visitor-credential-form.hooks.ts` — the other hook this
 * screen composes — is NOT part of this conversion: it reaches a much larger `api` surface of its
 * own and is deliberately out of scope here.
 */

export interface AiAssistantDependencies {
  port: AiAssistantPort;
}

export interface AiAssistantController {
  settings: PublicAssistantSettings | null;
  loadError: string | null;
  saveError: string | null;
  saving: boolean;
  setPublicEnabled: (publicEnabled: boolean) => Promise<void>;
  setWidget: (input: { widget: "react" | "vanilla" }, options?: Record<string, never>) => Promise<void>;
}

export function useAiAssistant({ port }: AiAssistantDependencies, _options: Record<string, never> = {}): AiAssistantController {
  const key = useMemo(() => ["ai-assistant", "settings"] as const, []);
  const fetchSettings = useCallback(async () => {
    try { return (await port.getAssistantSettings()).data; }
    catch (error) { throw new Error(describeApiError(error, "failed to load AI assistant settings")); }
  }, [port]);
  const query = useFetchQuery({ key, fetch: fetchSettings }, { staleTime: 0 });
  const loader = useCachedLoader({ key, fetch: fetchSettings }, { staleTime: 0 });
  const settings = query.data ?? null;
  const loadError = query.error?.message ?? null;
  const update = useFetchMutation({ run: ({ input }: { input: Partial<PublicAssistantSettings> }) => port.setAssistantSettings(input) }, { invalidates: [key] });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveSettings(input: Partial<PublicAssistantSettings>, _options = {}) {
    setSaving(true);
    setSaveError(null);
    try {
      // The response, not `publicEnabled` — the server is the authority on what is now true, and a
      // rejected or partially-applied write must not leave this screen lying about it.
      const { data } = await update.mutate({ input });
      loader.replace({ value: data });
    } catch (e) {
      setSaveError(describeApiError(e, "failed to save AI assistant settings"));
    } finally {
      setSaving(false);
    }
  }

  const setPublicEnabled = (publicEnabled: boolean) => saveSettings({ publicEnabled });
  const setWidget = (input: { widget: "react" | "vanilla" }, options = {}) => saveSettings(input, options);
  return { settings, loadError, saveError, saving, setPublicEnabled, setWidget };
}

/**
 * Binds the real `/api/.../assistant/settings` client — see `ai-assistant-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `AiAssistant.tsx` composes this and a test composes {@link useAiAssistant} with
 * `createFakeAiAssistantPort`.
 */
export function useWiredAiAssistant(): AiAssistantController {
  return useAiAssistant({ port: defaultAiAssistantPort });
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
export function resolveAiAssistantRequestedTabId(tabId: string | null | undefined): string | undefined {
  return tabId && (AI_ASSISTANT_TAB_IDS as readonly string[]).includes(tabId) ? tabId : undefined;
}

/** Keeps the page subtitle and shell on the same tab, including standalone mounts.
 * URL changes remain owned by the existing navigation function. No I/O beyond navigation.
 * @complexity Time/space: O(1), with a fixed three-tab set.
 */
export function useAiAssistantTab({ tabId }: { tabId: string | null | undefined }, _options = {}) {
  const [activeTabId, setActiveTabId] = useState(() => resolveAiAssistantRequestedTabId(tabId) ?? "visitor");
  useEffect(() => { setActiveTabId(resolveAiAssistantRequestedTabId(tabId) ?? "visitor"); }, [tabId]);
  const onTabChange = (nextTabId: string) => {
    setActiveTabId(nextTabId);
    navigateToAiAssistantTab(nextTabId);
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
export function navigateToAiAssistantTab(nextTabId: string): void {
  navigate(`/ai-assistant?tab=${nextTabId}`, { replace: true });
}
