import type { UUID } from "@jini-ai/core/primitives";
import { ensureSettingDefinitions, type EnsureSettingDefinitionsDeps, SCOPE_BIT } from "@jini-ai/cms/settings";

/**
 * @file `core.interface`: the admin's per-operator UI preferences, shown on Settings → User Interface.
 *
 * `hideChatFabWhileOpen` (owner, 2026-10-06): whether the floating chat button hides while the
 * assistant dock is open. Default `true` keeps the behaviour the owner already approved (the dock's
 * own ✕ closes it); `false` keeps the button on screen over the open dock so it can toggle it closed.
 *
 * `wrapTabs` (owner, 2026-10-07): on phones, whether the admin's tab strips wrap onto more rows
 * instead of scrolling sideways. Default `false` keeps the one-row swipeable strip.
 *
 * Per operator, same mask as `@jini-ai/cms/settings`' Appearance and Language definitions: how one
 * admin wants the chrome to behave is not a property of the workspace. The `workspace` bit stays in
 * the mask so an operator with no user row still inherits a workspace default.
 *
 * `core.*` because the settings namespace fence admits that prefix only for a platform-wide core
 * definition, the same constraint `site-title.ts` documents.
 */

export const ADMIN_INTERFACE_NAMESPACE = "core.interface";
export const HIDE_CHAT_FAB_WHILE_OPEN_KEY = "hideChatFabWhileOpen";
export const WRAP_TABS_KEY = "wrapTabs";

const PER_OPERATOR_SCOPES = SCOPE_BIT.user | SCOPE_BIT.workspace;

export interface EnsureAdminInterfaceSettingDefinitionsInput {
  /** The trusted boot-time actor the registration is attributed to. */
  systemPrincipalId: UUID;
}

/**
 * Idempotently registers the `core.interface` definitions. Safe on every boot.
 *
 * @complexity O(1), two definitions.
 */
export async function ensureAdminInterfaceSettingDefinitions(
  deps: EnsureSettingDefinitionsDeps,
  input: EnsureAdminInterfaceSettingDefinitionsInput
): Promise<void> {
  await ensureSettingDefinitions(deps, {
    namespace: ADMIN_INTERFACE_NAMESPACE,
    definitions: [
      { key: HIDE_CHAT_FAB_WHILE_OPEN_KEY, schema: { type: "boolean" }, defaultValue: true, scopes: PER_OPERATOR_SCOPES },
      { key: WRAP_TABS_KEY, schema: { type: "boolean" }, defaultValue: false, scopes: PER_OPERATOR_SCOPES },
    ],
    systemPrincipalId: input.systemPrincipalId,
  });
}
