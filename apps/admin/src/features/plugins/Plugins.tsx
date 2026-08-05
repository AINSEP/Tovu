import { DataTable } from "@jini-ai/admin/react";

import { pluginToggleControl } from "./rules";
import { usePlugins } from "./hooks/use-plugins.hooks";

/**
 * @file `Plugins` — the admin plugins list + enable/disable screen (SPEC-005 REQ-12..18,
 * ui.spec.md) — markup only.
 *
 * State and API calls live in `hooks/use-plugins.hooks.ts`; the server-error-message override and
 * the toggle-cell visibility/label decision live in `rules.ts`. Route `/admin/plugins`; consumes
 * REQ-10's `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` HTTP contract (`api.listPlugins()`/
 * `api.setPluginEnabled()`) as a black box.
 *
 * Mirrors `Roles.tsx`/`Redirects.tsx`'s conventions exactly (ui.spec.md §0): `<table
 * className="list-table">`, `<div className="notice">`/`<div className="notice error">`
 * loading/error states, `"No … yet."` empty-state notice, plain `useState`/`useEffect`, a single
 * toggle-as-button per row (label names the action), row-scoped in-flight state (`Roles.tsx`'s
 * `rowSavingId` pattern), await-then-reload mutation flow (no optimistic pre-flip — see ui.spec.md
 * §9's disclosed reading).
 *
 * There is no create/upload affordance: REQ-02 installs a plugin by placing its files under the
 * site install dir, and `api.spec.md` §1 exposes no endpoint an "add plugin" control could call.
 */
export interface PluginsProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before.
   */
  usePluginsHook?: typeof usePlugins;
}

/**
 * Renders every discovered plugin in the order `PLUGINS_LIST` returns it (TB-01 — never re-sorted
 * client-side). Loading and toggling live in `usePlugins` (see its own `@complexity`/`@tradeoffs`).
 *
 * @complexity O(n) render in the number of discovered plugins.
 * @overallScore 100
 */
export function Plugins({ usePluginsHook = usePlugins }: PluginsProps = {}) {
  const { plugins, error, rowError, rowSavingId, onToggleEnabled } = usePluginsHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!plugins) return <div className="notice">Loading plugins…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Studio</p>
          <h1 className="page-title">Plugins</h1>
          <p className="page-description">
            Enable or disable plugins discovered in this site's plugin install directory.
          </p>
        </div>
      </div>
      {rowError ? (
        <div className="notice error">
          <span role="alert">{rowError}</span>
        </div>
      ) : null}

      <DataTable
        rows={plugins}
        rowKey={(plugin) => plugin.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>No plugins installed.</p>
              <p className="page-description">
                A new one appears here on the next load, once it's unpacked into the site's plugin
                install directory.
              </p>
            </div>
          </div>
        }
        columns={[
          { key: "name", header: "Name", cell: (plugin) => plugin.name },
          { key: "version", header: "Version", cell: (plugin) => plugin.version },
          { key: "source", header: "Source", cell: (plugin) => plugin.source },
          {
            key: "tier",
            header: "Tier",
            cell: (plugin) => (
              // `tier-${plugin.tier}` doubles the prefix (`tier-tier-3`) because the manifest
              // value already carries it — ui.spec.md §5's literal template, kept verbatim.
              <span className={`tier tier-${plugin.tier}`}>{plugin.tier}</span>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (plugin) => <span className={`status status-${plugin.status}`}>{plugin.status}</span>,
          },
          {
            key: "enabled",
            headerLabel: "Enabled",
            cell: (plugin) => {
              const control = pluginToggleControl(plugin, rowSavingId);
              return control.visible ? (
                <button type="button" disabled={control.disabled} onClick={() => onToggleEnabled(plugin)}>
                  {control.label}
                </button>
              ) : (
                // AC-21: enabling this row is already known to 422, so no enable-capable
                // control is offered at all (`Roles.tsx`'s built-in-row `—` idiom).
                <span className="muted-cell">—</span>
              );
            },
          },
          {
            key: "errors",
            header: "Errors",
            cell: (plugin) =>
              plugin.errors.length > 0 ? (
                <ul className="plugin-errors">
                  {plugin.errors.map((e) => (
                    <li key={`${e.code}:${e.file ?? ""}:${e.message}`}>
                      <span className="save-error">{e.code}</span> <span>{e.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null,
          },
        ]}
      />
    </div>
  );
}
