import { useEffect, useState } from "react";
import { ApiError, api, describeApiError, type AdminWidgetRegionBinding } from "../lib/api";
import { navigate } from "../lib/router";

/**
 * @file `WidgetRegionsScreen` (`ui.spec.md` §2.4/§3.6/§4.5/§9) — `/admin/widgets/regions`. Lists
 * currently-bound regions; the bind-new-region control is a free-text `regionKey` input, mirroring
 * `Menus.tsx`'s location-assign control exactly (no "theme declares regions" list API exists to
 * source a dropdown from — `ThemeManifest.regions` is read server-side at render time, not exposed
 * as an admin-listable registry; see `ui.spec.md` §9's disclosed dependency-gap note).
 */

export function WidgetRegions() {
  const [regions, setRegions] = useState<AdminWidgetRegionBinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newRegionKey, setNewRegionKey] = useState("");
  const [binding, setBinding] = useState(false);

  function load() {
    api
      .listWidgetRegions()
      .then((r) => setRegions(r.regions))
      .catch((e) => setError(describeApiError(e, "failed to load regions")));
  }

  useEffect(load, []);

  async function bind() {
    const regionKey = newRegionKey.trim();
    if (!regionKey) return;
    setBinding(true);
    setError(null);
    try {
      await api.bindWidgetRegion(regionKey);
      setNewRegionKey("");
      navigate(`/widgets/regions/${regionKey}`);
    } catch (e) {
      setError(describeApiError(e, "bind failed"));
    } finally {
      setBinding(false);
    }
  }

  if (error && !regions) return <div className="notice error">{error}</div>;
  if (!regions) return <div className="notice">Loading regions…</div>;

  return (
    <div>
      <div className="editor-header">
        <a href="/admin/widgets">← Widgets</a>
        <h1>Widget Regions</h1>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <p className="muted-cell">
        A region is a theme-declared placement area (e.g. "header", "footer", "sidebar"). Bind a
        region by its key to start placing widgets in it.
      </p>
      <span className="editor-actions">
        <input value={newRegionKey} onChange={(e) => setNewRegionKey(e.target.value)} placeholder="e.g. footer" />
        <button onClick={bind} disabled={binding || !newRegionKey.trim()}>
          {binding ? "Binding…" : "Bind region"}
        </button>
      </span>
      {regions.length === 0 ? (
        <p className="muted-cell">No regions bound yet.</p>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th>Region key</th>
              <th>Placements</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {regions.map((region) => (
              <tr key={region.regionKey}>
                <td>
                  <a href={`/admin/widgets/regions/${region.regionKey}`}>{region.regionKey}</a>
                </td>
                <td>{region.placementCount}</td>
                <td>
                  <a href={`/admin/widgets/regions/${region.regionKey}`}>
                    <button>Manage</button>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
