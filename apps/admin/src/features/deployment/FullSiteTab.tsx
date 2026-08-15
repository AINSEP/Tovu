import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t } from "./deployment-i18n";
import { FULL_SITE_CAPABILITIES, FULL_SITE_PROVIDERS, type FullSiteProviderRow } from "./rules";
import { CapabilityList, FullSiteIcon } from "./deployment-visuals";

/**
 * @file Full Site tab — the complete Tovu server, one row per host provider. No hook, no fetch:
 * there is no ADMIN-REACHABLE backend to store credentials yet, so every row is honestly
 * `status: "planned"`, never a real connection state.
 *
 * That claim is narrower than "nothing was ever built", and deliberately so — checked directly
 * rather than assumed. `src/features/deployments/` DOES exist: a domain model (`types.ts`/
 * `ports.ts`), a GitHub App provider adapter with SSRF protections (`providers/github.ts`), and a
 * real migration (`deployment_environments`/`targets`/`runs`/`run_events`/`releases`) — all from
 * 2026-08-12. But `grep -rln "from ['\"].*features/deployments" src` outside that directory itself
 * returns nothing: no route file imports it, `app.ts` never registers one, so nothing anywhere can
 * reach it over HTTP. Same "no callers" shape project memory already flags for `installAgentPlugin`
 * — a correct implementation with zero wiring is still functionally absent from this screen's point
 * of view. `development/docs/deployment/deployment-constraints.md` §3's "Postgres runtime"/
 * "container packaging" gaps are a separate, still-real reason this couldn't be wired live even if
 * a route existed.
 *
 * `@jini-ai/ui`'s `SourceConfigList` was evaluated for this tab and rejected: that component is a
 * live add/edit/remove CRUD list backed by a `SourceConfigDependencies` port (`fetchSources`/
 * `addSource`/`updateSource`/`removeSource`), built for operator-entered, persisted records. This
 * tab has no such records — six fixed, read-only informational rows with no add form and nothing to
 * persist. Wrapping that in a `SourceConfigList` would mean fabricating a port whose writes go
 * nowhere, the exact "mount for completeness" trap `SettingsUi.tsx`'s Privacy/Media-providers tabs
 * already document avoiding.
 *
 * ## Second pass (2026-08-15) — what changed and why
 *
 * The first pass collapsed six cards into one card of six rows, which was right and stays. Two
 * things about those rows were not:
 *
 * 1. `justify-content: space-between` put each row's "Planned" pill against the far right edge of a
 *    ~1250px card, roughly 1000px from the name it describes. Proximity is what says two things
 *    belong together, and at that distance it said the opposite. The pill now sits immediately
 *    after the provider's name.
 * 2. The right-hand column, freed up, now carries the one value that actually DIFFERS between the
 *    six rows — the cost. Six rows whose only distinguishing feature was buried at the end of a
 *    sentence read as six copies of the same row; a value column is what a reader scanning a list
 *    is looking for. The figures are not new: `rules.ts` splits each row's existing approved
 *    sentence at its own em-dash, and the two providers with no published figure say "AWS pricing"
 *    and "Already paid for" rather than getting one invented for them.
 *
 * The lead card also gained the same `CapabilityList` the Overview comparison and the Static Site
 * tab use. All four rows are supported here, and that is the point of showing it: the shape of the
 * two lists side by side is the whole difference between the paths. "Everything works" is a claim
 * about the software, which is true; what does not exist is provisioning, which is what the
 * `Planned` pills and the notice below the heading say.
 */
function FullSiteProviderRowItem({ provider, plannedLabel }: { provider: FullSiteProviderRow; plannedLabel: string }) {
  const locale = useAdminLocale();
  return (
    <li className="deployment-provider-list-item">
      <div className="deployment-provider-row">
        <span className="deployment-provider-name">
          {/* Proper nouns, rendered verbatim and marked `translate="no"` so a machine translator
              leaves them alone — same treatment the env-var names and the CLI command get. */}
          <span translate="no">{provider.name}</span>
          <span className="status status-neutral">{plannedLabel}</span>
        </span>
        <span className="deployment-provider-cost">{t(locale, provider.costKey)}</span>
      </div>
      <p>{t(locale, provider.descriptionKey)}</p>
    </li>
  );
}

export function FullSiteTab() {
  const locale = useAdminLocale();
  const translate = (key: string): string => t(locale, key);
  const plannedLabel = t(locale, "Planned");

  return (
    <div className="deployment-tab">
      <div className="card">
        <div className="card-head">
          <div className="deployment-path-head">
            <span className="deployment-path-icon">
              <FullSiteIcon />
            </span>
            <h2 className="card-title">{t(locale, "What Full Site gives you")}</h2>
          </div>
          <div className="card-head-actions">
            <span className="status status-neutral">{t(locale, "Not wired up yet")}</span>
          </div>
        </div>
        <div className="deployment-card-body">
          <p className="card-lead">
            {t(locale, "The complete Tovu server — admin, assistant, checkout, everything works.")}
          </p>
          <div className="deployment-split">
            <div>
              <span className="deployment-fact-label">{t(locale, "What you keep")}</span>
              <CapabilityList rows={FULL_SITE_CAPABILITIES} t={translate} />
            </div>
            <div>
              <span className="deployment-fact-label">{t(locale, "What it needs")}</span>
              <p className="deployment-action-reason">
                {t(locale, "A host that can run a container and keep a disk — the Dockerfile tab has the image this runs from.")}
              </p>
              <a className="btn-secondary" href="/admin/deployment?tab=dockerfile">
                {t(locale, "View the Dockerfile")}
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{t(locale, "Providers")}</h2>
          <div className="card-head-actions">
            <span className="deployment-provider-cost">{t(locale, "None connectable yet")}</span>
          </div>
        </div>
        <div className="deployment-card-body">
          <p className="deployment-action-reason">
            {t(locale, "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.")}
          </p>
          <ul className="deployment-provider-list">
            {FULL_SITE_PROVIDERS.map((provider) => (
              <FullSiteProviderRowItem key={provider.id} provider={provider} plannedLabel={plannedLabel} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
