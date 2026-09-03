import { useEffect, useState } from "react";

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
}

export function useAiAssistant({ port }: AiAssistantDependencies): AiAssistantController {
  const [settings, setSettings] = useState<PublicAssistantSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    port
      .getAssistantSettings()
      .then((r) => setSettings(r.data))
      .catch((e) => setLoadError(describeApiError(e, "failed to load AI assistant settings")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port]);

  async function setPublicEnabled(publicEnabled: boolean) {
    setSaving(true);
    setSaveError(null);
    try {
      // The response, not `publicEnabled` — the server is the authority on what is now true, and a
      // rejected or partially-applied write must not leave this screen lying about it.
      const { data } = await port.setAssistantSettings({ publicEnabled });
      setSettings(data);
    } catch (e) {
      setSaveError(describeApiError(e, "failed to save AI assistant settings"));
    } finally {
      setSaving(false);
    }
  }

  return { settings, loadError, saveError, saving, setPublicEnabled };
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

/**
 * Keeps `?tab=` in sync as the operator switches tabs — same `replace`-not-push shape and same
 * "fires even before any `?tab=` is present" behaviour as `SettingsUi.tsx`'s own `handleTabChange`.
 */
export function navigateToAiAssistantTab(nextTabId: string): void {
  navigate(`/ai-assistant?tab=${nextTabId}`, { replace: true });
}
