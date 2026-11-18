import { createInMemoryIdentityRouteDeps, resolveOwnerCredentials } from "#src/features/identity/wiring";
import { seededWorkspace, SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID } from "../../../configuration/seed.js";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";
import { startupSecretEnvironment } from "@tovu/host-shared/startup-secrets";
import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import { startSettingsRegistration } from "../../settings-registration.js";
import { InMemorySettingsRepo } from "#src/features/settings/index";
import type { MemoryClock, MemoryIdGen } from "../ports.js";

export function composeIdentitySettings(required: { clock: MemoryClock; idGen: MemoryIdGen; settingsRepo: InMemorySettingsRepo }, _optional = {}) {
  const { clock, idGen, settingsRepo } = required;
  // Composition root: the in-memory root keeps the same env-driven owner login as `deps.ts`.
  const identity = createInMemoryIdentityRouteDeps({ workspaceId: seededWorkspace.id, clock, idGen, permissionGrants: createAppPermissionGrants({}), ownerCredentials: resolveOwnerCredentials({ env: startupSecretEnvironment({ env: process.env }) }) });
  // Keep the host repository ABI while binding the active/workspace-scoped settings lookup.
  const settingsPrincipals = {
    ...createSettingsPrincipalLookup({ repo: identity.principalRepo }),
    findById: (required: Parameters<typeof identity.principalRepo.findById>[0]) => identity.principalRepo.findById(required),
    list: (required: Parameters<typeof identity.principalRepo.list>[0]) => identity.principalRepo.list(required),
    save: (record: Parameters<typeof identity.principalRepo.save>[0]) => identity.principalRepo.save(record),
  };
  // Fire-and-forget, mirroring `identityReady` (see routes/types.ts's `settingsReady` doc) — this
  // composition root stays synchronous; consumers await `settingsReady` before relying on the
  // settings boot sequence being ready.
  // Presentation remains the live owner; boot must not write a second active-theme value.
  const settingsReady = Promise.resolve();

  // Serial writes avoid nested SQLite transactions; see startSettingsRegistration below.
  const { seoReady, commentsSettingsReady, assistantSettingsReady, executionSettingsReady, settingsUiTabsReady, analyticsSettingsReady } = startSettingsRegistration({
    deps: { settingsRepo, clock, ids: idGen, principals: settingsPrincipals },
    settingsReady,
    workspaceId: seededWorkspace.id,
    systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
  });
  return { settingsPrincipals, analyticsSettingsReady, settingsReady, commentsSettingsReady, identity, seoReady, assistantSettingsReady, executionSettingsReady, settingsUiTabsReady };
}
