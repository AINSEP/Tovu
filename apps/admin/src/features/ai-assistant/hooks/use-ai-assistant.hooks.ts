import { useEffect, useState } from "react";

import type { PublicAssistantSettings } from "../../../lib/api";
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
  }, []);

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
