import { useEffect, useState } from "react";
import { ApiError, api, type AdminPlugin } from "../lib/api";

/**
 * @file `Plugins` — the admin plugins list + enable/disable screen (SPEC-005 REQ-12..18,
 * ui.spec.md). Route `#/section/plugins`; consumes REQ-10's `PLUGINS_LIST`/`PLUGIN_SET_ENABLED`
 * HTTP contract (`api.listPlugins()`/`api.setPluginEnabled()`) as a black box.
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

/** Maps this screen's two calls' error codes to `errors.spec.md`'s operator-facing guidance text
 * (ui.spec.md §8), falling back to the server's own message.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function describeApiError(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return e instanceof Error ? e.message : fallback;
  if (e.code === "PLUGIN_NOT_FOUND") return "No plugin with that id is installed.";
  if (e.code === "PLUGIN_INVALID") return "This plugin failed validation and cannot be enabled.";
  if (e.code === "PLUGIN_INCOMPATIBLE") return "This plugin requires a different SDK version.";
  return e.message || fallback;
}

/**
 * Lists every discovered plugin in the order `PLUGINS_LIST` returns it (TB-01 — never re-sorted
 * client-side) and toggles one plugin's activation at a time.
 *
 * @complexity O(n) render in the number of discovered plugins; one GET on mount plus one PATCH +
 * one re-fetch GET per successful toggle.
 * @tradeoffs In-flight state is a single `rowSavingId` (ui.spec.md §0 mandates mirroring
 * `Roles.tsx`), so toggling a second row while the first is still in flight re-enables the first
 * row's button — EC-11's single-flight guarantee is per-row-at-a-time, not per-row-concurrent. A
 * `Set` of in-flight ids would close that, at the cost of diverging from the mandated convention.
 * @overallScore 92
 */
export function Plugins() {
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

  if (error) return <div className="notice error">{error}</div>;
  if (!plugins) return <div className="notice">Loading plugins…</div>;

  return (
    <div>
      <div className="editor-header">
        <h1>Plugins</h1>
      </div>
      <p>
        Plugins are installed by unpacking them into the site's plugin install directory; a new one
        appears here on the next load. Enable or disable a discovered plugin below.
      </p>
      {rowError ? (
        <div className="notice error">
          <span role="alert">{rowError}</span>
        </div>
      ) : null}

      {plugins.length === 0 ? (
        <div className="notice">No plugins installed.</div>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Version</th>
              <th>Source</th>
              <th>Tier</th>
              <th>Status</th>
              <th aria-label="Enabled" />
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            {plugins.map((plugin) => (
              <tr key={plugin.id}>
                <td>{plugin.name}</td>
                <td>{plugin.version}</td>
                <td>{plugin.source}</td>
                <td>
                  {/* `tier-${plugin.tier}` doubles the prefix (`tier-tier-3`) because the manifest
                      value already carries it — ui.spec.md §5's literal template, kept verbatim. */}
                  <span className={`tier tier-${plugin.tier}`}>{plugin.tier}</span>
                </td>
                <td>
                  <span className={`status status-${plugin.status}`}>{plugin.status}</span>
                </td>
                <td>
                  {plugin.enabled || plugin.status === "valid" ? (
                    <button
                      type="button"
                      disabled={rowSavingId === plugin.id}
                      onClick={() => onToggleEnabled(plugin)}
                    >
                      {rowSavingId === plugin.id ? "…" : plugin.enabled ? "Disable" : "Enable"}
                    </button>
                  ) : (
                    // AC-21: enabling this row is already known to 422, so no enable-capable
                    // control is offered at all (`Roles.tsx`'s built-in-row `—` idiom).
                    <span className="muted-cell">—</span>
                  )}
                </td>
                <td>
                  {plugin.errors.length > 0 ? (
                    <ul className="plugin-errors">
                      {plugin.errors.map((e) => (
                        <li key={`${e.code}:${e.file ?? ""}:${e.message}`}>
                          <span className="save-error">{e.code}</span> <span>{e.message}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
