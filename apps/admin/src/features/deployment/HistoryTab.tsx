import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t } from "./deployment-i18n";
import { HistoryIcon } from "./deployment-visuals";

/**
 * @file History tab — a real empty state, no fake data. There is no builds/deploys backend this
 * screen can reach (`development/docs/deployment/deployment-constraints.md` §3, and see
 * `FullSiteTab.tsx`'s header for the direct check that `src/features/deployments/` has no route
 * importing it), so this tab has nothing to fetch and no hook.
 *
 * ## Second pass (2026-08-15) — what changed and why
 *
 * It was two grey sentences centered in a tall blank card. That is what `.empty-state` gives you,
 * and it is the right default for a list that merely happens to be empty right now — Media with
 * nothing uploaded, Integrations with no webhooks. This tab is a different thing: the feature does
 * not exist yet, and it will not fill up by itself. An empty state for a durable condition has to
 * do more than say "nothing here", or it reads as an unfinished screen rather than an honest one.
 *
 * So: a mark, a title, one sentence saying what WOULD appear here, and a real next step pointing at
 * the thing that does exist today. What it deliberately does NOT do is draw an empty table header,
 * a filter bar, or a set of placeholder rows — scaffolding for data that has never existed would
 * imply a capability this instance does not have.
 */
export function HistoryTab() {
  const locale = useAdminLocale();
  return (
    <div className="deployment-tab">
      <div className="card">
        <div className="deployment-empty">
          <span className="deployment-empty-mark">
            <HistoryIcon size={22} />
          </span>
          <p className="deployment-empty-title">{t(locale, "No deploys yet")}</p>
          <p className="deployment-empty-body">
            {t(locale, "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.")}
          </p>
          <a className="btn-secondary" href="/admin/deployment?tab=static-site">
            {t(locale, "See how to publish today")}
          </a>
        </div>
      </div>
    </div>
  );
}
