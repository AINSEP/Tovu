import { observed } from "@jini-ai/core/errors/idioms";
import type { Clock as ClockPort } from "@jini-ai/core/primitives";
import type { IdGenerator as IdGeneratorPort } from "@jini-ai/core/primitives";
import { type IdentityRouteDepsSlice } from "#src/features/identity/wiring";
import type { RouteDeps } from "../../../routes/types.js";
import { type SiteDisplayNameSource } from "#src/features/settings/site-title";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { applyOwnerPasswordReset } from "#src/features/identity/owner-reset-env";
import { createLiveSiteDisplayName } from "#src/platform/site-dir/read-site-dir";
import { createSiteCreationTimeZone } from "#src/platform/site-dir/read-site-dir";
import { createSiteTimeZonePort } from "@jini-ai/cms/settings/site/site-timezone";
import { createSiteTimeZoneFallbackReporter } from "#src/features/settings/site-timezone-fallback";
import { formatErrorForLog } from "@jini-ai/core";
import { identityServiceDepsFrom } from "#src/server/inbound/admin-http/routes/users/deps";
import { resolveSiteDirForDatabase } from "#src/platform/site-dir/site-databases";
import { SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID } from "../../configuration/seed.js";
import { SqlitePresentationSettingsRepo } from "#src/features/presentation/index";
import { SqliteSettingsRepo } from "#src/features/settings/repo.sqlite";
import { SqliteSiteTitlePreservationStore } from "#src/features/settings/site-title-preservation.sqlite";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";
import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import { createSqliteIdentityRouteDeps } from "#src/features/identity/wiring";
import { ensureAdminInterfaceSettingDefinitions } from "@jini-ai/cms/settings/site/admin-interface";
import { ensureChartProviderSetting } from "@jini-ai/cms/settings/site/chart-provider";
import { ensureCommerceSetting } from "../commerce-settings.js";
import { ensureFormDeliverySettings } from "@jini-ai/cms/settings/site/form-delivery";
import { ensureFormDestinationSetting } from "@jini-ai/cms/settings/site/form-destination";
import { ensureMailProviderSettings } from "#src/features/settings/mail-provider";
import { ensureMailSenderSettings } from "@jini-ai/cms/settings/site/mail-sender";
import { ensureMediaObjectStoreSetting } from "#src/features/object-storage/index";
import { ensurePreviewSwitcherSetting } from "#src/features/theme/preview-switcher";
import { ensureSearchProviderSetting } from "@jini-ai/search/site/settings";
import { ensureSiteTimeZoneSettingDefinition } from "@jini-ai/cms/settings/site/site-timezone";
import { ensureSiteTitleSettingDefinition } from "#src/features/settings/site-title";
import { preserveLegacySiteTitles } from "#src/features/settings/site-title";
import { resolveOwnerCredentials } from "#src/features/identity/wiring";
import { startSettingsRegistration } from "../settings-registration.js";
import { startupSecretEnvironment } from "../../../../platform/secrets/startup-secrets.js";
import type { SiteStore } from "../open-site-store.js";
import type { storeBoundServicesFor } from "../store-bound-services.js";
import type { CreateSiteRouteDepsOverrides } from "./overrides.js";

interface ComposeIdentitySettingsRequired {
  kernel: SiteStore["content"];
  workspaceId: string;
  clock: { nowMs: () => number; nowIso: () => string };
  idGen: { newId: () => string };
  storeBound: ReturnType<typeof storeBoundServicesFor>;
  overrides: Partial<CreateSiteRouteDepsOverrides>;
  dbPath: string;
}

export function composeIdentitySettings(required: ComposeIdentitySettingsRequired, _optional = {}) {
  const { kernel, workspaceId, clock, idGen, storeBound, overrides, dbPath } = required;
  // SQLite-backed identity (principals/users/sessions/roles/policies persist in content.db) so a
  // login survives a `tsx watch` restart instead of being silently wiped every file save.
  // Composition root: the ONLY place the serving site reads its first-boot owner login from env.
  const identity = createSqliteIdentityRouteDeps({ db: kernel, workspaceId, clock, idGen, permissionGrants: createAppPermissionGrants({}), ownerCredentials: resolveOwnerCredentials({ env: startupSecretEnvironment({ env: process.env }) }) });
  // Keep the host repository ABI while binding the active/workspace-scoped settings lookup.
  const settingsPrincipals = {
    ...createSettingsPrincipalLookup({ repo: identity.principalRepo }),
    findById: (required: Parameters<typeof identity.principalRepo.findById>[0]) => identity.principalRepo.findById(required),
    list: (required: Parameters<typeof identity.principalRepo.list>[0]) => identity.principalRepo.list(required),
    save: (record: Parameters<typeof identity.principalRepo.save>[0]) => identity.principalRepo.save(record),
  };
  // Fire-and-forget, mirroring `identityReady`/`blobHydrationReady` below — opt-in only (see the
  // function's own doc), so this is a genuine no-op on every ordinary boot. Exposed on the returned
  // deps (like `blobHydrationReady`) so a boot test can await the reset; nothing gates on it.
  const adminPasswordResetReady = applyAdminPasswordResetFromEnvIfConfigured({ beforeReset: () => storeBound.dbOps.captureRestorePoint({ scopeId: "boot-admin-password-reset" }), workspaceId, identity, clock, idGen, overrides });
  const presentationRepo = new SqlitePresentationSettingsRepo({ store: kernel });
  const settingsRepo = new SqliteSettingsRepo({ store: kernel });
  // Fire-and-forget, mirroring `identityReady` (see routes/types.ts's `settingsReady` doc) — this
  // composition root stays synchronous; consumers await `settingsReady` before relying on the
  // settings boot sequence being ready.
  // Presentation remains the live owner; boot must not write a second active-theme value.
  const settingsReady = Promise.resolve();
  // Serial writes avoid nested SQLite transactions; see startSettingsRegistration in app.ts.
  const { seoReady, commentsSettingsReady, assistantSettingsReady, executionSettingsReady, settingsUiTabsReady, analyticsSettingsReady } = startSettingsRegistration({
    deps: { settingsRepo, clock, ids: idGen, principals: settingsPrincipals },
    settingsReady,
    workspaceId: workspaceId,
    systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
  });

  // SPEC-050 `core.site.title` (`features/settings/site-title.ts`): registration, then the one-time
  // pin for every workspace the marker migration recorded as pre-existing (REQ-06). Chained after
  // `analyticsSettingsReady` for the single-SQLite-connection-transaction reason every registration
  // above documents; the pin writes through the same ledger.
  const siteTitlePreservationStore = new SqliteSiteTitlePreservationStore(kernel);
  const { siteDisplayName, siteTimeZone } = compositionSiteDisplaySources({ dbPath, overrides, settingsRepo });
  const siteTitleSettingsDeps = { settingsRepo, clock, ids: idGen, principals: settingsPrincipals };
  const { siteSettingsReady, siteTitleReady } = startPersistentSiteSettings({ analyticsSettingsReady, siteTitleSettingsDeps, siteTitlePreservationStore });
  return { identity, settingsPrincipals, adminPasswordResetReady, presentationRepo, settingsRepo, settingsReady, seoReady, commentsSettingsReady, assistantSettingsReady, executionSettingsReady, settingsUiTabsReady, analyticsSettingsReady, siteTitlePreservationStore, siteDisplayName, siteTimeZone, siteTitleSettingsDeps, siteSettingsReady, siteTitleReady };
}

function startPersistentSiteSettings(required: {
  analyticsSettingsReady: Promise<void>;
  siteTitleSettingsDeps: { settingsRepo: SqliteSettingsRepo; clock: ClockPort; ids: IdGeneratorPort; principals: ReturnType<typeof createSettingsPrincipalLookup> & Pick<IdentityRouteDepsSlice["principalRepo"], "findById" | "list" | "save"> };
  siteTitlePreservationStore: SqliteSiteTitlePreservationStore;
}, _options = {}) {
  const { analyticsSettingsReady, siteTitleSettingsDeps, siteTitlePreservationStore } = required;
  const siteSettingsReady = analyticsSettingsReady
    // `core.interface` (`features/settings/admin-interface.ts`), chained here for the same
    // one-connection reason as the registrations above.
    .then(() => ensureAdminInterfaceSettingDefinitions(siteTitleSettingsDeps, { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    .then(() => ensureChartProviderSetting({ deps: siteTitleSettingsDeps, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    .then(() => ensureFormDestinationSetting({ deps: siteTitleSettingsDeps, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    .then(() => ensureMediaObjectStoreSetting({ deps: siteTitleSettingsDeps, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    .then(() => ensurePreviewSwitcherSetting({ deps: siteTitleSettingsDeps, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    .then(() => ensureFormDeliverySettings({ deps: siteTitleSettingsDeps, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    // `core.mail.senderEmail`/`senderName` (`features/settings/mail-sender.ts`): system mail's From.
    .then(() => ensureMailSenderSettings({ deps: siteTitleSettingsDeps, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    // `core.mail.provider`/`testMode` (`features/settings/mail-provider.ts`): explicit provider per lane.
    .then(() => ensureMailProviderSettings({ deps: siteTitleSettingsDeps, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    // Site search's per-site `core.search/provider` (default `builtin`); registering it enables nothing.
    .then(() => ensureSearchProviderSetting({ deps: siteTitleSettingsDeps, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    .then(() => ensureSiteTitleSettingDefinition(siteTitleSettingsDeps, { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    // Bug D: `core.site.timezone` (`features/settings/site-timezone.ts`), the zone post dates render in.
    .then(() => ensureSiteTimeZoneSettingDefinition(siteTitleSettingsDeps, { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }))
    .then(() => ensureCommerceSetting({ deps: siteTitleSettingsDeps, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }));
  // Public title reads already handle pending pins; consent must not inherit this migration wait.
  const siteTitleReady = siteSettingsReady
    .then(() =>
      preserveLegacySiteTitles(
        { ...siteTitleSettingsDeps, preservationStore: siteTitlePreservationStore },
        { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
      )
    )
    .then(() => undefined);
  // Observed at once: composition awaits provider boot before any consumer reads this tail, and a
  // rejection left unobserved across that pause is an unhandled rejection (Codex check 2026-10-27).
  // Only marks it handled; every consumer below still receives the rejection.
  observed({ promise: siteTitleReady });
  return { siteSettingsReady, siteTitleReady };
}

/**
 * SPEC-050 (NC-2 = B, REQ-13): the served site's display name, `config.json` `name` in the directory
 * holding `dbPath`, read at each render that needs it so a rename shows with no restart. Every boot
 * path keeps `content.db` in its site directory (`tovu serve`/`tovu export` pass `<dir>/content.db`;
 * the default boot and the agent daemon use `siteDir()`'s), so no caller has to thread it. Reads
 * `undefined` while that directory holds no valid `config.json` (a bare `TOVU_CONTENT_DB`, a temp test
 * database) and always for `:memory:`; the site title then falls back to `workspaces.name`.
 */
function createSiteDisplayNameSource({ dbPath }: { dbPath: string }, { siteDir }: { siteDir?: string } = {}): SiteDisplayNameSource {
  if (dbPath === ":memory:") return { read: () => undefined };
  // Database relocation must not relocate the site's name/configuration.
  return createLiveSiteDisplayName({ dir: resolveSiteDirForDatabase({ dbPath, siteDir }) });
}

/**
 * 2026-09-03 production incident recovery hook — opt-in ONLY: a no-op on every ordinary boot,
 * because it does nothing at all unless the operator has explicitly set `TOVU_ADMIN_RESET_PASSWORD`
 * (e.g. as a host secret) for this one deploy. That opt-in-via-env-var gate is what makes it safe to
 * wire into every boot unconditionally, the same reasoning `hydrateContentDbIfNeeded` above follows
 * for its own presence-not-contents gate.
 *
 * Exists because the admin UI's own reset-password route is not always trustworthy as a recovery
 * path — it is exactly what failed in the incident this closes (see
 * `features/identity/owner-reset-env.ts`'s own header for the full story) — so
 * an operator locked out of the admin panel needs a way to fix the credential that does not depend
 * on the admin panel already working. Jini owner recovery re-reads and verifies the
 * write before this function ever reports success; a failure here is logged loudly but never
 * crashes the boot (mirrors `hydrateBlobStoreFromSeed`'s own catch-and-log posture below) —
 * crashing the ENTIRE public site over a failed ADMIN-only credential fix would be a strictly worse
 * outcome than the incident it is trying to recover from.
 *
 * A no-op whenever `overrides.db` is supplied, same reason and same guard as
 * `hydrateContentDbIfNeeded` above: that caller has already opened its own db (at a path this
 * function cannot assume equals `dbPath`) before reaching here.
 */
function applyAdminPasswordResetFromEnvIfConfigured(required: {
  beforeReset: () => Promise<unknown>;
  workspaceId: string;
  identity: IdentityRouteDepsSlice;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  overrides?: Partial<CreateSiteRouteDepsOverrides>;
}): Promise<void> {
  if (required.overrides?.db !== undefined || required.overrides?.store !== undefined) return Promise.resolve();

  const password = process.env.TOVU_ADMIN_RESET_PASSWORD;
  if (!password) return Promise.resolve();
  const username = process.env.TOVU_ADMIN_RESET_USERNAME;
  const { workspaceId, identity, clock, idGen } = required;
  return identity.identityReady.then(async () => {
    if (!identity.recoveryCodes) throw new Error("Owner recovery storage is unavailable");
    // A secret left set after recovery must not re-salt the same credential, revoke sessions,
    // or copy the whole database on every boot. Capture a backup only before an actual write.
    return applyOwnerPasswordReset({ workspaceId, password, ...(username === undefined ? {} : { username }),
      deps: { auth: identityServiceDepsFrom({ ...identity, clock: { nowMs: () => clock.nowMs(), nowIso: () => new Date(clock.nowMs()).toISOString() }, idGen }),
        codes: identity.recoveryCodes, seededOwnerPrincipalId: await identity.ownerPrincipalId } }, { beforeReset: required.beforeReset });
  }).then((resolvedUsername) => {
    console.error(`[admin-password-reset] SUCCESS — username='${resolvedUsername}' configured password self-verified at boot. Unset TOVU_ADMIN_RESET_PASSWORD now.`);
  }).catch((error: unknown) => {
    const details = formatErrorForLog({ error }, { ...TOVU_ERROR_REDACTION_OPTIONS, exactSecrets: [password] });
    console.error(`[admin-password-reset] FAILED: the owner password could not be reset. Check the owner username and identity database, then retry. Details: boot-owner-reset\n${details}`);
  });
}

function compositionSiteDisplaySources(
  { dbPath, overrides, settingsRepo }: { dbPath: string; overrides: Partial<CreateSiteRouteDepsOverrides>; settingsRepo: RouteDeps["settingsRepo"] },
  _optional = {},
) {
  const siteDisplayName = createSiteDisplayNameSource({ dbPath }, { siteDir: overrides.siteBinding?.dir });
  // Bug D: post dates render in `core.site.timezone`, else the zone recorded when the site was created.
  const siteTimeZone = createSiteTimeZonePort({
    settingsRepo,
    reportFallback: createSiteTimeZoneFallbackReporter(),
    ...(dbPath === ":memory:" ? {} : { creationTimeZone: createSiteCreationTimeZone({ dir: resolveSiteDirForDatabase({ dbPath, siteDir: overrides.siteBinding?.dir }) }) }),
  });
  return { siteDisplayName, siteTimeZone };
}
