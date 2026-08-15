import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t } from "./deployment-i18n";
import { FULL_SITE_PROVIDERS, type FullSiteProviderRow } from "./rules";

/**
 * @file Full Site tab — the complete Tovu server, one row per host provider. No hook, no fetch:
 * there is no backend to store credentials yet (`development/docs/deployment/
 * deployment-constraints.md` §3 — Postgres runtime and container packaging both don't exist), so
 * every row is honestly `status: "planned"`, never a real connection state.
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
 */
function FullSiteProviderCard({ provider, plannedLabel }: { provider: FullSiteProviderRow; plannedLabel: string }) {
  const locale = useAdminLocale();
  return (
    <div className="card">
      <div className="deployment-provider-row">
        <strong>{provider.name}</strong>
        <span className="status status-neutral">{plannedLabel}</span>
      </div>
      <p>{t(locale, provider.descriptionKey)}</p>
    </div>
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
      {FULL_SITE_PROVIDERS.map((provider) => (
        <FullSiteProviderCard key={provider.id} provider={provider} plannedLabel={plannedLabel} />
      ))}
    </div>
  );
}
