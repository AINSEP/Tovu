import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t } from "./deployment-i18n";
import { STATIC_HOSTS } from "./rules";

/**
 * @file Static Site tab — explains what a static export would produce and what it costs, and shows
 * a disabled build action with an honest reason. No hook, no fetch: **the static exporter does not
 * exist** (`development/docs/deployment/deployment-constraints.md` §3 — `grep` for
 * `StaticExporter`/`exportSite` returns nothing, and `src/seo/sitemap.ts:50-66` enumerates only
 * published indexable posts, not home/products/theme pages/redirects/404/assets, so the sitemap
 * cannot drive one either). Nothing here is fabricated capability — this tab is copy plus a
 * deliberately inert control, not a screen waiting on data.
 *
 * `STATIC_HOSTS` (`rules.ts`) is the fixed four-host list from the brief — proper nouns, never
 * translated, same as a webhook's own `label` rendering verbatim elsewhere in this app.
 */
export function StaticSiteTab() {
  const locale = useAdminLocale();

  return (
    <div>
      <div className="card">
        <h2>{t(locale, "What Static Site produces")}</h2>
        <p>{t(locale, "A fast, read-only copy of this site's published pages — no server behind it.")}</p>
        <p className="notice warning">{t(locale, "No checkout, no admin online, no assistant, no dynamic anything.")}</p>
      </div>

      <div className="card">
        <h2>{t(locale, "Not built yet")}</h2>
        <p>
          {t(
            locale,
            "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets."
          )}
        </p>
      </div>

      <div className="card">
        <h2>{t(locale, "Static hosts")}</h2>
        <ul className="deployment-host-list">
          {STATIC_HOSTS.map((host) => (
            <li key={host}>{host}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        {/* Disabled, not hidden — the affordance's SHAPE is real (this is where a build will start
            once an exporter exists), only its function is not. A hidden button would tell the
            operator nothing; an enabled one that does nothing would tell them something false. */}
        <button type="button" disabled>
          {t(locale, "Build static export")}
        </button>
        <p className="field-hint">{t(locale, "Not available yet — see above.")}</p>
      </div>
    </div>
  );
}
