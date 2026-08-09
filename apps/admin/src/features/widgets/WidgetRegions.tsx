import { DataTable } from "@jini-ai/admin/react";
import { useWidgetRegions } from "./hooks/use-widget-regions.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { WIDGETS_DICT } from "./widgets-i18n";

/**
 * @file `WidgetRegionsScreen` (`ui.spec.md` §2.4/§3.6/§4.5/§9) — `/admin/widgets/regions` — markup
 * only. Lists currently-bound regions; the bind-new-region control is a free-text `regionKey`
 * input, mirroring `Menus.tsx`'s location-assign control exactly (no "theme declares regions" list
 * API exists to source a dropdown from — `ThemeManifest.regions` is read server-side at render
 * time, not exposed as an admin-listable registry; see `ui.spec.md` §9's disclosed dependency-gap
 * note).
 *
 * State, the fetch, and bind live in `hooks/use-widget-regions.hooks.ts`.
 */
export interface WidgetRegionsProps {
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useWidgetRegionsHook?: typeof useWidgetRegions;
}

export function WidgetRegions({ useWidgetRegionsHook = useWidgetRegions }: WidgetRegionsProps = {}) {
  const { regions, error, newRegionKey, setNewRegionKey, binding, bind } = useWidgetRegionsHook();
  const locale = useAdminLocale();
  const t = (key: string): string => WIDGETS_DICT[locale]?.[key] ?? key;

  if (error && !regions) return <div className="notice error">{error}</div>;
  if (!regions) return <div className="notice">Loading regions…</div>;

  return (
    <div className="page">
      <a href="/admin/widgets">← {t("Widgets")}</a>
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t("Widget Regions")}</h1>
          <p className="page-description">
            {t(
              'A region is a theme-declared placement area (e.g. "header", "footer", "sidebar"). Bind a region by its key to start placing widgets in it.',
            )}
          </p>
        </div>
        <div className="page-actions">
          <input value={newRegionKey} onChange={(e) => setNewRegionKey(e.target.value)} placeholder="e.g. footer" />
          <button onClick={bind} disabled={binding || !newRegionKey.trim()}>
            {binding ? t("Binding…") : t("Bind region")}
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
              <p>{t("No regions bound yet.")}</p>
            </div>
          </div>
        }
        columns={[
          {
            key: "region-key",
            header: t("Region key"),
            cell: (region) => <a href={`/admin/widgets/regions/${region.regionKey}`}>{region.regionKey}</a>,
          },
          { key: "placements", header: t("Placements"), cell: (region) => region.placementCount },
          {
            key: "manage",
            cell: (region) => (
              <a href={`/admin/widgets/regions/${region.regionKey}`}>
                <button>{t("Manage")}</button>
              </a>
            ),
          },
        ]}
      />
    </div>
  );
}
