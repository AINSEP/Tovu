import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t } from "./deployment-i18n";
import { FULL_SITE_PROVIDERS, type FullSiteProviderRow } from "./rules";

/**
 * @file Full Site tab — the complete Tovu server, one row per host provider. No hook, no fetch:
 * there is no ADMIN-REACHABLE backend to store credentials yet, so every row is honestly
 * `status: "planned"`, never a real connection state.
 *
 * That claim is narrower than "nothing was ever built", and deliberately so — checked directly
 * rather than assumed, the same way `StaticSiteTab.tsx`'s own header had to be corrected mid-build
 * for the opposite kind of gap. `src/features/deployments/` DOES exist: a domain model
 * (`types.ts`/`ports.ts`), a GitHub App provider adapter with SSRF protections
 * (`providers/github.ts`), and a real migration (`deployment_environments`/`targets`/`runs`/
 * `run_events`/`releases`) — all from 2026-08-12, three days before this pass. But
 * `grep -rln "from ['\"].*features/deployments" src` outside that directory itself returns
 * nothing: no route file imports it, `app.ts` never registers one, so nothing anywhere can reach
 * it over HTTP. Same "no callers" shape project memory already flags for `installAgentPlugin` — a
 * correct implementation with zero wiring is still functionally absent from this screen's point of
 * view. `development/docs/deployment/deployment-constraints.md` §3's "Postgres runtime"/"container
 * packaging" gaps are a separate, still-real reason this couldn't be wired live even if a route
 * existed — provisioning a real environment needs both, not just the one adapter.
 *
 * `@jini-ai/ui`'s `SourceConfigList` was evaluated for this tab (per the brief's own instruction —
 * `settings/SettingsUi.tsx`'s External MCP tab is the working example) and rejected: that component
 * is a live add/edit/remove CRUD list backed by a `SourceConfigDependencies` port
 * (`fetchSources`/`addSource`/`updateSource`/`removeSource` — see
 * `hooks/use-external-mcp.hooks.ts`), built for operator-entered, persisted records. This tab has no
 * such records — six fixed, read-only informational rows with no add form and nothing to persist.
 * Wrapping that in a `SourceConfigList` would mean fabricating a port whose writes go nowhere, which
 * is the exact "mount for completeness" trap `SettingsUi.tsx`'s Privacy/Media-providers tabs already
 * document avoiding. A plain list is the honest shape until real provisioning exists.
 *
 * CORRECTED post-launch (2026-08-15, owner UI/UX pass): the original version gave each of the six
 * providers its own full bordered/shadowed `.card` — a lot of padding for one line of text plus a
 * pill that reads "Planned" on all six (nothing differentiates them, so the repetition itself read
 * as noise), and it didn't match how this admin already renders a list of same-shaped named items
 * with a status and description in one place — `Taxonomy.tsx`'s `.settings-row`/`.settings-row-list`
 * for an in-card row list, `Integrations.tsx`'s `DataTable` for a fetched one. This tab's rows are
 * neither selectable (`.settings-row` bakes in `cursor:pointer`/hover/`is-selected`, which don't
 * apply to six fixed informational rows) nor tabular (each has a full sentence of prose, not
 * columns), so it gets its own lightweight, non-interactive row list — `.deployment-provider-list`
 * — rather than reusing either verbatim. One `.card`, six rows, a thin `border-top` between them.
 */
function FullSiteProviderRowItem({ provider, plannedLabel }: { provider: FullSiteProviderRow; plannedLabel: string }) {
  const locale = useAdminLocale();
  return (
    <li className="deployment-provider-list-item">
      <div className="deployment-provider-row">
        <strong>{provider.name}</strong>
        <span className="status status-neutral">{plannedLabel}</span>
      </div>
      <p>{t(locale, provider.descriptionKey)}</p>
    </li>
  );
}

export function FullSiteTab() {
  const locale = useAdminLocale();
  const plannedLabel = t(locale, "Planned");

  return (
    <div>
      <div className="card">
        <h2>{t(locale, "What Full Site gives you")}</h2>
        <p>{t(locale, "The complete Tovu server — admin, assistant, checkout, everything works.")}</p>
      </div>

      <h2>{t(locale, "Providers")}</h2>
      <p className="field-hint">{t(locale, "No credential fields yet — this instance has no backend to store them.")}</p>
      <div className="card">
        <ul className="deployment-provider-list">
          {FULL_SITE_PROVIDERS.map((provider) => (
            <FullSiteProviderRowItem key={provider.id} provider={provider} plannedLabel={plannedLabel} />
          ))}
        </ul>
      </div>
    </div>
  );
}
