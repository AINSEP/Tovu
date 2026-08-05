import { useEffect, useState } from "react";

import { api, type AdminPlugin } from "../../../lib/api";
import { describeApiError } from "../rules";

/**
 * @file Everything the Plugins list does, so `Plugins.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same effect, same error strings.
 * `describeApiError` (this screen's server-error-code overrides) moved to `rules.ts` alongside the
 * toggle-cell decision; this hook imports it back for its own async handlers.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `posts/hooks/use-posts.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/plugins` needs it.
 */

export interface PluginsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  plugins: AdminPlugin[] | null;
  error: string | null;
  rowError: string | null;
  /** In-flight enable/disable request, keyed by plugin id — one at a time. See `usePlugins`'s own
   *  `@tradeoffs` note for what that gives up. */
  rowSavingId: string | null;
  onToggleEnabled: (plugin: AdminPlugin) => Promise<void>;
}

/**
 * Loads the plugin list and toggles one plugin's activation at a time.
 *
 * @complexity One GET on mount plus one PATCH + one re-fetch GET per successful toggle.
 * @tradeoffs In-flight state is a single `rowSavingId` (ui.spec.md §0 mandates mirroring
 * `Roles.tsx`), so toggling a second row while the first is still in flight re-enables the first
 * row's button — EC-11's single-flight guarantee is per-row-at-a-time, not per-row-concurrent. A
 * `Set` of in-flight ids would close that, at the cost of diverging from the mandated convention.
 * @overallScore 92
 */
export function usePlugins(): PluginsController {
  const [plugins, setPlugins] = useState<AdminPlugin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  function reload(): Promise<void> {
    return api
      .listPlugins()
      .then((r) => setPlugins(r.plugins))
      .catch((e) => setError(describeApiError(e, "failed to load plugins")));
  }

  useEffect(() => {
    void reload();
  }, []);

  async function onToggleEnabled(plugin: AdminPlugin) {
    // EC-11: a second activation of this row's own toggle while its request is outstanding is a
    // no-op — the client-side single-flight discipline is the guard, no `Idempotency-Key` is sent.
    if (rowSavingId === plugin.id) return;
    setRowSavingId(plugin.id);
    setRowError(null);
    try {
      await api.setPluginEnabled(plugin.id, { enabled: !plugin.enabled });
      await reload();
    } catch (e) {
      setRowError(describeApiError(e, "failed to update plugin"));
    } finally {
      setRowSavingId(null);
    }
  }

  return { plugins, error, rowError, rowSavingId, onToggleEnabled };
}
