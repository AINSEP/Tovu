import type { AdminTrashedSite, AdminSitesSnapshot } from "@/lib/api";
import type { Translate } from "@jini-ai/ui/panel-kit";
import type { LocalSitesController } from "./hooks/use-local-sites.hooks";
import { resolveSiteSubtitle, resolveTrashCardActions } from "./Sites.hooks";

/** Recoverable site Trash, in the same card language as All sites (2026-10-08 polish). Permanent
 *  deletion is offered only here: select the card, then Delete permanently, which the controller
 *  confirms. The danger button appears once its card is selected rather than sitting disabled. */
export function SiteTrashTab({ snapshot, controller, t }: {
  snapshot: AdminSitesSnapshot; controller?: LocalSitesController; t: Translate;
}) {
  if (!snapshot.localManagementEnabled || !controller) return null;
  const trash = snapshot.trash ?? [];
  if (trash.length === 0) return <div className="sites-empty"><p className="sites-empty-lead">{t("Site Trash is empty.")}</p></div>;
  return <div className="sites-grid" role="group" aria-label={t("Site Trash")}>
    {trash.map((site) => <TrashedSiteCard key={site.id} site={site} controller={controller} t={t} />)}
  </div>;
}

/** One trashed site. Accessible names carry the site's name, the same pattern as All sites' Start. */
function TrashedSiteCard({ site, controller, t }: { site: AdminTrashedSite; controller: LocalSitesController; t: Translate }) {
  const actions = resolveTrashCardActions({ id: site.id, checked: controller.checked, busyName: controller.busyName });
  const subtitle = resolveSiteSubtitle(site);
  return <div className="site-card site-card-trashed">
    <div className="site-card-head"><span className="status status-neutral">{t("In Trash")}</span></div>
    <div className="site-card-body">
      <span className="site-card-name">{site.name}</span>
      {subtitle === null ? null : <p className="site-card-display-name">{subtitle}</p>}
      <label className="site-card-select">
        <input type="checkbox" checked={actions.selected} aria-label={`${t("Select for permanent deletion")} ${site.name}`}
          onChange={(event) => controller.toggleChecked(site.id, event.target.checked)} />
        {t("Select for permanent deletion")}
      </label>
      <div className="site-card-actions">
        <button type="button" className="btn-primary" disabled={actions.restoreDisabled}
          aria-label={`${t("Restore")} ${site.name}`} onClick={() => void controller.run(site.id, "restore")}>{t("Restore")}</button>
        {actions.selected ? <button type="button" className="btn-danger" disabled={actions.deleteDisabled}
          aria-label={`${t("Delete permanently")} ${site.name}`} onClick={() => void controller.run(site.id, "delete")}>{t("Delete permanently")}</button> : null}
      </div>
    </div>
  </div>;
}
