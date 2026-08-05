import { useEffect, useState } from "react";
import { ApiError, api, describeApiError, type AdminWidgetRegionBinding } from "../lib/api";
import { navigate } from "../lib/router";
import { DataTable } from "@jini-ai/admin/react";

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
    <div className="page">
      <a href="/admin/widgets">← Widgets</a>
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">Widget Regions</h1>
          <p className="page-description">
            A region is a theme-declared placement area (e.g. "header", "footer", "sidebar"). Bind a
            region by its key to start placing widgets in it.
          </p>
        </div>
        <div className="page-actions">
          <input value={newRegionKey} onChange={(e) => setNewRegionKey(e.target.value)} placeholder="e.g. footer" />
          <button onClick={bind} disabled={binding || !newRegionKey.trim()}>
            {binding ? "Binding…" : "Bind region"}
          </button>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <DataTable
        rows={regions}
        rowKey={(region) => region.regionKey}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>No regions bound yet.</p>
            </div>
          </div>
        }
        columns={[
          {
            key: "region-key",
            header: "Region key",
            cell: (region) => <a href={`/admin/widgets/regions/${region.regionKey}`}>{region.regionKey}</a>,
          },
          { key: "placements", header: "Placements", cell: (region) => region.placementCount },
          {
            key: "manage",
            cell: (region) => (
              <a href={`/admin/widgets/regions/${region.regionKey}`}>
                <button>Manage</button>
              </a>
            ),
          },
        ]}
      />
    </div>
  );
}
