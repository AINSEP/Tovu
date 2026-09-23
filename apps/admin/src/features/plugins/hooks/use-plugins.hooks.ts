import { useEffect, useState } from "react";

import type { AdminPlugin } from "@/lib/api";
import { describeApiError } from "../rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useSettlementGeneration } from "@/hooks/use-settlement-generation.hooks";
import { t as translate } from "../plugins-i18n";
import { defaultPluginsPort } from "./plugins-dependencies.hooks";
import type { PluginsPort } from "./plugins-port.hooks";
import type { Translate } from "@/lib/dictionary-translator";

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
 *
 * `expandedIds`/`onToggleExpanded` moved here (2026-09-10) from a bare `useState` directly in
 * `Plugins.tsx` — this admin's own rule that component logic belongs in `hooks/`, not `.tsx`, same
 * split the sibling `use-agent-plugins.hooks.ts` already draws for `AgentPlugins.tsx`. The Remove
 * confirm dialog's target (`pendingRemovePlugin`) followed on 2026-09-13, the same way
 * `inspectedPlugin` had already arrived: it was the last `useState` left in `Plugins.tsx`.
 *
 * `reload()`'s generation guard (2026-09-20 platform review, X1): `reload()` used to have no
 * ordering guard at all and never cleared `error` on a later success. Two toggles on DIFFERENT rows
 * are allowed to have reloads in flight at once (`rowSavingId`'s single-flight guard is per-row, see
 * this file's own `@tradeoffs` note below), so an older reload's GET could resolve after a newer
 * one's and paint a stale list back over a fresher one — and a single transient reload failure stuck
 * forever, since nothing ever called `setError(null)` again, which replaced the whole populated
 * screen (`Plugins.tsx`'s fatal `if (error) return …`) with an error the operator could not clear
 * short of a full remount. Fixed with `useSettlementGeneration()`, the same "ignore a settled result
 * once a newer call has superseded it" guard this admin already uses at eight other call sites — see
 * that hook's own header. The generation check guards `reload()`'s `catch` too, not only its `then`,
 * so an old rejection cannot blank a newer success either.
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
  /** In-flight enable/disable OR remove request, keyed by plugin id — one at a time, one row action
   *  at a time overall (a remove in flight on one row and a toggle in flight on another still share
   *  this single field). See `usePlugins`'s own `@tradeoffs` note for what that gives up. */
  rowSavingId: string | null;
  onToggleEnabled: (plugin: AdminPlugin) => Promise<void>;
  /** Deletes a `"site"` plugin's on-disk artifact via `PLUGIN_UNINSTALL` and re-fetches the list —
   *  the Downloaded tab's Remove control, gated behind `PluginRemoveConfirmDialog` before this is
   *  ever called (see {@link PluginsController.onConfirmRemove}). Refused by the server for a
   *  `"built-in"` plugin or one still enabled somewhere; either refusal lands in `rowError` via the
   *  same `describeApiError` path `onToggleEnabled` already uses. */
  onRemovePlugin: (plugin: AdminPlugin) => Promise<void>;
  /** Plugin ids whose row detail panel (quarantine/errors) is open. Same shape and home as the
   *  sibling `use-agent-plugins.hooks.ts`'s `AgentPluginsController.expandedIds` — moved here
   *  (2026-09-10) from a bare `useState` in `Plugins.tsx`. */
  expandedIds: ReadonlySet<string>;
  /** Opens or closes one row's detail panel. */
  onToggleExpanded: (id: string) => void;
  /** The plugin open in `PluginPackageFilesModal`, looked up fresh from `plugins` by id so a reload
   *  never shows a stale row; `null` while the viewer is closed. */
  inspectedPlugin: AdminPlugin | null;
  /** Opens the package-files viewer for one plugin (a row's eye button, on either list tab). */
  onInspectPlugin: (id: string) => void;
  onCloseInspector: () => void;
  /** The plugin waiting on `PluginRemoveConfirmDialog`, looked up fresh from `plugins` by id (same as
   *  `inspectedPlugin`), so the confirmed row is always the current one; `null` while it's closed. */
  pendingRemovePlugin: AdminPlugin | null;
  /** Opens the confirm dialog for one row (Downloaded's Remove button). Nothing is deleted yet. */
  onRequestRemove: (plugin: AdminPlugin) => void;
  /** Closes the dialog, then runs {@link PluginsController.onRemovePlugin} for `plugin`. */
  onConfirmRemove: (plugin: AdminPlugin) => void;
  /** Closes the dialog without removing anything. */
  onCancelRemove: () => void;
  /** Bound translator — `Plugins.tsx`'s only source of UI copy; see this file's own header. */
  t: Translate;
  /** The raw resolved locale — exposed only because `rules.ts`'s `pluginToggleControl` genuinely
   *  needs it, not `t`. */
  locale: string;
}

/** Adds or removes one id, returning a new `Set` — so React sees an identity change. Same helper,
 *  independently kept, as `use-agent-plugins.hooks.ts`'s own `withId` — this feature's established
 *  precedent (`rules.ts`'s `humanizeAgentPluginId`) is a private per-screen copy over a shared
 *  cross-screen import for a two-line pure function. */
function withId(ids: ReadonlySet<string>, id: string, present: boolean): ReadonlySet<string> {
  const next = new Set(ids);
  if (present) next.add(id);
  else next.delete(id);
  return next;
}

/**
 * Loads the plugin list and toggles one plugin's activation at a time.
 *
 * @complexity One GET on mount plus one PATCH + one re-fetch GET per successful toggle.
 * @tradeoffs In-flight state is a single `rowSavingId` (ui.spec.md §0 mandates mirroring
 * `Roles.tsx`), so toggling a second row while the first is still in flight re-enables the first
 * row's button — EC-11's single-flight guarantee is per-row-at-a-time, not per-row-concurrent. A
 * `Set` of in-flight ids would close that, at the cost of diverging from the mandated convention.
 * What is NOT part of that tradeoff, and is guarded below: the row whose request is still on the
 * wire must never be unlocked by an UNRELATED row's request settling — see both `finally` blocks.
 * @overallScore 92
 */
export function usePlugins({ port, locale, t }: PluginsDependencies): PluginsController {
  const [plugins, setPlugins] = useState<AdminPlugin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const [inspectedPluginId, setInspectedPluginId] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const settlement = useSettlementGeneration();

  function reload(): Promise<void> {
    const generation = settlement.next();
    return port
      .listPlugins()
      .then((r) => {
        if (!settlement.isCurrent(generation)) return; // a newer reload already won
        setPlugins(r.plugins);
        setError(null);
      })
      .catch((e) => {
        if (!settlement.isCurrent(generation)) return;
        setError(describeApiError(e, translate(locale, "failed to load plugins")));
      });
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
      // Only clear THIS row's lock — `rowSavingId` is shared with `onRemovePlugin`, and the EC-11
      // guard above is per-row, so a second row's action starts freely while this one is still
      // outstanding. An unconditional `setRowSavingId(null)` here would re-enable THAT row's control
      // the moment this request settled, while its own request was still on the wire (same S4b bug
      // fixed in `use-posts.hooks.ts` 26fbe22c5 / `use-pages.hooks.ts` f4f2fe899).
      setRowSavingId((current) => (current === plugin.id ? null : current));
    }
  }

  async function onRemovePlugin(plugin: AdminPlugin) {
    // Same single-flight discipline as `onToggleEnabled` — a second activation of this row's own
    // Remove (or of any other row's action) while a request is outstanding is a no-op.
    if (rowSavingId === plugin.id) return;
    setRowSavingId(plugin.id);
    setRowError(null);
    try {
      await port.uninstallPlugin(plugin.id);
      await reload();
    } catch (e) {
      setRowError(describeApiError(e, translate(locale, "failed to remove plugin")));
    } finally {
      // Symmetric guard to `onToggleEnabled`'s — see its comment. Keeps this correct regardless of
      // which of the two in-flight actions settles first.
      setRowSavingId((current) => (current === plugin.id ? null : current));
    }
  }

  return {
    plugins,
    error,
    rowError,
    rowSavingId,
    onToggleEnabled,
    onRemovePlugin,
    expandedIds,
    onToggleExpanded: (id: string) => setExpandedIds((ids) => withId(ids, id, !ids.has(id))),
    inspectedPlugin: plugins?.find((plugin) => plugin.id === inspectedPluginId) ?? null,
    onInspectPlugin: setInspectedPluginId,
    onCloseInspector: () => setInspectedPluginId(null),
    pendingRemovePlugin: plugins?.find((plugin) => plugin.id === pendingRemoveId) ?? null,
    onRequestRemove: (plugin: AdminPlugin) => setPendingRemoveId(plugin.id),
    onConfirmRemove: (plugin: AdminPlugin) => {
      setPendingRemoveId(null);
      void onRemovePlugin(plugin);
    },
    onCancelRemove: () => setPendingRemoveId(null),
    t,
    locale,
  };
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
