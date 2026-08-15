import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t } from "./deployment-i18n";
import { STATIC_HOSTS } from "./rules";

/**
 * @file Static Site tab — explains what a static export produces and what it costs, and shows a
 * disabled build action with an honest reason. No hook, no fetch — everything here is static copy
 * plus a deliberately inert control.
 *
 * CORRECTED mid-build: `development/docs/deployment/deployment-constraints.md` §3 said the static
 * exporter did not exist, and that was true when this pass started. It stopped being true partway
 * through this same session — a concurrent teammate landed `src/export/route-manifest.ts`
 * (`RouteManifestPort`, resolving home/products/theme pages via the SAME functions the real public
 * routes use, plus a synthetic 404 probe — the exact gap §3 flagged), `src/export/site-exporter.ts`
 * (`exportSite`), and `src/cli/commands/export.ts` (`tovu export <dir>`), landing at 11:26–11:41 on
 * 2026-08-15, before this tab's own commit. Verified directly (not taken on faith): `grep -rln
 * "runExportCommand\|exportSite\b" src/server/routes` returns nothing, so the exporter is real but
 * CLI-only — there is still no HTTP route this admin screen could call, which is why the button
 * below stays disabled. The copy here now says "run it from a terminal", not "does not exist" —
 * shipping the stale claim once it was known to be false would be worse than the extra edit.
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
        <h2>{t(locale, "Build it from a terminal")}</h2>
        <p>
          {t(
            locale,
            "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder."
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
            once this screen can reach the exporter over HTTP), only its function is not. A hidden
            button would tell the operator nothing; an enabled one that does nothing would tell
            them something false. The exporter itself is real now (see this file's header) — what's
            still missing is an admin-reachable route to trigger it from a click instead of a
            terminal, same "real capability, no button wired to it yet" shape as the Dockerfile
            tab's own build note. */}
        <button type="button" disabled>
          {t(locale, "Build static export")}
        </button>
        <p className="field-hint">{t(locale, "Not available from this screen yet — run tovu export from a terminal.")}</p>
      </div>
    </div>
  );
}
