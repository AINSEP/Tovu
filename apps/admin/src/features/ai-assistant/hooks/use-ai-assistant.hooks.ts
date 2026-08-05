import { useEffect, useState } from "react";

import { api, type PublicAssistantSettings } from "../../../lib/api";
import { describeApiError } from "../rules";

/**
 * @file The `AiAssistant` screen's own top-level state: the visitor-facing public on/off switch.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings. This is
 * deliberately narrower than the whole screen: `AdminAssistantSwitch`, `AdminExecutionMode`, and
 * `VisitorCredentialForm` each own their own state and get their own hook file, per this feature's
 * "one hook file per component" convention (see `features/integrations/hooks/` for the same split
 * applied to a smaller feature).
 */

export interface AiAssistantController {
  settings: PublicAssistantSettings | null;
  loadError: string | null;
  saveError: string | null;
  saving: boolean;
  setPublicEnabled: (publicEnabled: boolean) => Promise<void>;
}

export function useAiAssistant(): AiAssistantController {
  const [settings, setSettings] = useState<PublicAssistantSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getAssistantSettings()
      .then((r) => setSettings(r.data))
      .catch((e) => setLoadError(describeApiError(e, "failed to load AI assistant settings")));
  }, []);

  async function setPublicEnabled(publicEnabled: boolean) {
    setSaving(true);
    setSaveError(null);
    try {
      // The response, not `publicEnabled` — the server is the authority on what is now true, and a
      // rejected or partially-applied write must not leave this screen lying about it.
      const { data } = await api.setAssistantSettings({ publicEnabled });
      setSettings(data);
    } catch (e) {
      setSaveError(describeApiError(e, "failed to save AI assistant settings"));
    } finally {
      setSaving(false);
    }
  }

  return { settings, loadError, saveError, saving, setPublicEnabled };
}
