import { useEffect, useState } from "react";

import type { AdminPlugin } from "../../../lib/api";
import { describeApiError } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t as translate } from "../plugins-i18n";
import { defaultPluginsPort } from "./plugins-dependencies.hooks";
import type { PluginsPort } from "./plugins-port.hooks";
import type { Translate } from "../../../lib/dictionary-translator";

/**
 * @file Everything the Plugins list does, so `Plugins.tsx` is only markup.
 *
 * Extracted verbatim — same state, same declaration order, same effect, same error strings.
 * `describeApiError` (this screen's server-error-code overrides) moved to `rules.ts` alongside the
 * toggle-cell decision; this hook imports it back for its own async handlers.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `posts/hooks/use-posts.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/plugins` needs it.
 *
 * `deps.port` is injected (see `plugins-port.hooks.ts`) rather than reaching for `lib/api`'s `api`
 * directly — the same `useX(dependencies)` / `useWiredX()` split `redirects`/`widgets` use.
 * `plugins-i18n.ts`'s own `t(locale, key)` — aliased `translate` here to avoid colliding with this
 * file's own bound `(key) => string` closure — stays a direct import for this hook's OWN error
 * strings: a pure `DICT[locale]?.[key] ?? key` lookup with no host boundary, same "pure, no-I/O"
 * category the convention doc names for `describeApiError`.
 *
 * `deps.t` (standing i18n rule, 2026-08-11 — a component with a hook gets a BOUND `t` from that
 * hook, not its own `useAdminLocale()`/dictionary import): injected so `Plugins.tsx` sources its UI
 * copy from this hook instead of its own `useAdminLocale()`/`plugins-i18n` import.
 */

export interface PluginsDependencies {
  port: PluginsPort;
  locale: string;
  t: Translate;
}

export interface PluginsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  plugins: AdminPlugin[] | null;
  error: string | null;
  rowError: string | null;
  /** In-flight enable/disable request, keyed by plugin id — one at a time. See `usePlugins`'s own
   *  `@tradeoffs` note for what that gives up. */
  rowSavingId: string | null;
  onToggleEnabled: (plugin: AdminPlugin) => Promise<void>;
  /** Bound translator — `Plugins.tsx`'s only source of UI copy; see this file's own header. */
  t: Translate;
  /** The raw resolved locale — exposed only because `rules.ts`'s `pluginToggleControl` genuinely
   *  needs it, not `t`. */
  locale: string;
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
export function usePlugins({ port, locale, t }: PluginsDependencies): PluginsController {
  const [plugins, setPlugins] = useState<AdminPlugin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);

  function reload(): Promise<void> {
    return port
      .listPlugins()
      .then((r) => setPlugins(r.plugins))
      .catch((e) => setError(describeApiError(e, translate(locale, "failed to load plugins"))));
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
      await port.setPluginEnabled(plugin.id, { enabled: !plugin.enabled });
      await reload();
    } catch (e) {
      setRowError(describeApiError(e, translate(locale, "failed to update plugin")));
    } finally {
      setRowSavingId(null);
    }
  }

  return { plugins, error, rowError, rowSavingId, onToggleEnabled, t, locale };
}

/**
 * Binds the real `/api/.../plugins` client, the real `useAdminLocale()`, and a `plugins-i18n.ts`-
 * bound translator — see `plugins-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `Plugins.tsx` composes this and a test composes {@link usePlugins} with `createFakePluginsPort`.
 */
export function useWiredPlugins(): PluginsController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate(locale, key);
  return usePlugins({ port: defaultPluginsPort, locale, t });
}
