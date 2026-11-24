import { nowIso } from "@jini-ai/core/primitives";
import { observed } from "@jini-ai/core/errors/idioms";
import { nowIso } from "@jini-ai/core/primitives";
import { InMemorySiteTitlePreservationStore, ensureSiteTitleSettingDefinition, preserveLegacySiteTitles } from "@jini-ai/cms/settings/site/site-title";
import { LEGACY_SITE_TITLE, siteTitlePreservationHostBindings } from "#src/features/settings/site-title-legacy";
import { ensureAdminInterfaceSettingDefinitions } from "@jini-ai/cms/settings/site/admin-interface";
import { ensureSettingDefinitions, resolveDefinitionRaw, set } from "@jini-ai/core/settings";
import { SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID } from "../../../configuration/seed.js";
import { ensureChartProviderSetting } from "@jini-ai/cms/settings/site/chart-provider";
import { ensureFormDestinationSetting } from "@jini-ai/cms/settings/site/form-destination";
import { ensurePreviewSwitcherSetting } from "#src/features/theme/preview-switcher";
import { ensureSiteTimeZoneSettingDefinition } from "@jini-ai/cms/settings/site/site-timezone";
import { InMemorySettingsRepo } from "#src/features/settings/index";
import type { MemoryClock, MemoryIdGen } from "../ports.js";
import type { composeIdentitySettings } from "./identity-settings.js";

type IdentitySettings = ReturnType<typeof composeIdentitySettings>;

export function composeSiteTitleSettings(required: { settingsRepo: InMemorySettingsRepo; clock: MemoryClock; idGen: MemoryIdGen; settingsPrincipals: IdentitySettings["settingsPrincipals"]; analyticsSettingsReady: IdentitySettings["analyticsSettingsReady"] }, _optional = {}) {
  const { settingsRepo, clock, idGen, settingsPrincipals, analyticsSettingsReady } = required;
  // SPEC-050 `core.site.title` (`@jini-ai/cms/settings/site/site-title`): registration, then the one-time
  // pin for workspaces that existed before the setting. This root always seeds fresh, so it records
  // no pre-existing workspace (EC-03) and the pin is a no-op. Chained after `analyticsSettingsReady`
  // for the single-SQLite-connection-transaction reason every registration above documents.
  const siteTitlePreservationStore = new InMemorySiteTitlePreservationStore();
  const siteTitleSettingsDeps = { settingsRepo, clock, ids: idGen, principals: settingsPrincipals, ensureSettingDefinitions };
  const siteSettingsReady = analyticsSettingsReady
    // `core.interface` (`@jini-ai/cms/settings/site/admin-interface`), chained here for the same
    // one-connection reason as the registrations above.
    .then(() => ensureAdminInterfaceSettingDefinitions(siteTitleSettingsDeps, { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    .then(() => ensureChartProviderSetting({ deps: siteTitleSettingsDeps, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    .then(() => ensureFormDestinationSetting({ deps: siteTitleSettingsDeps, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    .then(() => ensurePreviewSwitcherSetting({ deps: siteTitleSettingsDeps, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    .then(() => ensureSiteTitleSettingDefinition(siteTitleSettingsDeps, { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID, legacySiteTitle: LEGACY_SITE_TITLE }))
    // Bug D: `core.site.timezone` (`@jini-ai/cms/settings/site/site-timezone`), the zone post dates render in.
    .then(() => ensureSiteTimeZoneSettingDefinition(siteTitleSettingsDeps, { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }));
  // Public title reads already handle pending pins; consent must not inherit this migration wait.
  const siteTitleReady = siteSettingsReady
    .then(() =>
      preserveLegacySiteTitles(
        { ...siteTitleSettingsDeps, preservationStore: siteTitlePreservationStore, set, resolveDefinitionRaw, nowIso, ...siteTitlePreservationHostBindings },
        { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID, legacySiteTitle: LEGACY_SITE_TITLE }
      )
    )
    .then(() => undefined);

  // Consent no longer observes this detached branch. Observe it now while preserving rejection
  // for consumers that await title readiness later, as the persistent composition root does.
  observed({ promise: siteTitleReady });
  return { siteTitleSettingsDeps, siteSettingsReady, siteTitleReady, siteTitlePreservationStore };
}
