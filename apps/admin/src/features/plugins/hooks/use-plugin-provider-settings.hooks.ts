import { useEffect, useState } from "react";

import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import type { AdminPluginProviderSettings } from "@/lib/api";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { t as translate } from "../plugins-i18n";
import { describeApiError } from "../rules";
import { defaultPluginsPort } from "./plugins-dependencies.hooks";
import type { PluginsPort } from "./plugins-port.hooks";

/**
 * @file `PluginProviderSettingsDialog`'s data (2026-10-26): one provider plugin's settings card —
 * its manifest-declared fields, the saved public values, and for each secret only whether one is
 * saved. Secret inputs start empty and stay write-only: an empty secret on save keeps the saved one
 * while the public fields are unchanged (the server's rule); changing one (an endpoint, a host) is
 * refused until the saved secrets are entered again, and the server's message names them.
 *
 * `useX(dependencies)` / `useWiredX()` pair, same as `use-plugin-package-files.hooks.ts`.
 */

export interface PluginProviderSettingsController {
  card: AdminPluginProviderSettings | null;
  /** The form's current text per field name. */
  values: Readonly<Record<string, string>>;
  setValue: (name: string, value: string) => void;
  save: () => Promise<void>;
  saving: boolean;
  /** A load or save failure, in the screen's words. */
  error: string | null;
  /** Set after a successful save. */
  saved: boolean;
  t: Translate;
}

/** Public fields start from their saved value; secrets always start blank. */
function initialValues(card: AdminPluginProviderSettings): Record<string, string> {
  return Object.fromEntries(card.fields.map((field) => [field.name, field.secret ? "" : field.value ?? ""]));
}

export function usePluginProviderSettings({ pluginId, port, t }: { pluginId: string; port: Pick<PluginsPort, "getProviderSettings" | "saveProviderSettings">; t: Translate }): PluginProviderSettingsController {
  const [card, setCard] = useState<AdminPluginProviderSettings | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let live = true;
    port.getProviderSettings(pluginId).then(
      (loaded) => { if (live) { setCard(loaded); setValues(initialValues(loaded)); } },
      (failure: unknown) => { if (live) setError(describeApiError(failure, t("failed to load plugin settings"))); },
    );
    return () => { live = false; };
  }, [pluginId, port, t]);
  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await port.saveProviderSettings(pluginId, values);
      setCard(next);
      setValues(initialValues(next));
      setSaved(true);
    } catch (failure) {
      setError(describeApiError(failure, t("failed to save plugin settings")));
    } finally {
      setSaving(false);
    }
  };
  return { card, values, setValue: (name, value) => setValues((current) => ({ ...current, [name]: value })), save, saving, error, saved, t };
}

/** Binds the real `/api/.../plugins/:id/provider-settings` client and the admin locale's translator. */
export function useWiredPluginProviderSettings(pluginId: string): PluginProviderSettingsController {
  const locale = useAdminLocale();
  const [t] = useState(() => (key: string): string => translate({ locale, key }));
  return usePluginProviderSettings({ pluginId, port: defaultPluginsPort, t });
}
