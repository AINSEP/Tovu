import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t } from "./deployment-i18n";

/**
 * @file History tab — a real empty state, no fake data. There is no builds/deploys backend at all
 * (`development/docs/deployment/deployment-constraints.md` §3 — container packaging, the static
 * exporter, and any host adapter are all absent), so this tab has nothing to fetch and no hook.
 */
export function HistoryTab() {
  const locale = useAdminLocale();
  return (
    <div className="card">
      <div className="empty-state">
        <p>{t(locale, "No deploys yet")}</p>
        <p className="page-description">{t(locale, "Builds and deploys will show up here once a real host is wired up.")}</p>
      </div>
    </div>
  );
}
