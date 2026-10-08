/**
 * @file Public surface (barrel) for `settings` — re-exported from `@jini-ai/core/settings`.
 *
 * Jini owns definitions, values and the revision ledger. SQLite adapters bind the site's schema;
 * `migration.ts` handles this host's legacy `presentation_settings` data. Those stay host-owned,
 * as do the title write policy and active-principal lookup below.
 * This barrel omits SQLite so consumers cannot accidentally depend on the host's persistence choice.
 */
import type { PrincipalRepoPort } from "@jini-ai/user-management";
import type { SettingsPrincipalLookupPort } from "@jini-ai/core/settings";

/** Bind Tovu's membership/status policy to the CMS lookup port.
 * Missing, disabled and foreign-workspace records never become settings targets (REQ-13/INV-09).
 * @complexity O(1) beyond one repository lookup; no writes or authorization effects.
 */
export function createSettingsPrincipalLookup(required: { repo: PrincipalRepoPort }): SettingsPrincipalLookupPort {
  return {
    findActiveById: async ({ workspaceId, id }) => {
      const principal = await required.repo.findById({ workspaceId, id });
      return principal?.status === "active" && principal.workspaceId === workspaceId && principal.id === id
        ? { id: principal.id }
        : null;
    },
  };
}

export {
  SCOPE_BIT,
  type SettingScope,
  type SettingOwnerKind,
  type DefinitionStatus,
  type ValueState,
  type RevisionEntityKind,
  type RevisionOp,
  type SettingValueSchema,
  type SettingDefinitionRecord,
  type SettingValueRecord,
  type SettingRevisionRecord,
  type SettingScopeContext,
} from "@jini-ai/core/settings";

export {
  DefinitionInvalidError,
  ScopeNotAllowedError,
  SecretNotSupportedError,
  ValueValidationFailedError,
  RenameRetypeConflictError,
  AliasDepthExceededError,
  DefinitionTombstonedError,
  DefinitionNotFoundError,
  PurgeRequiredError,
  ForbiddenError,
  PrincipalNotFoundError,
} from "@jini-ai/core/settings";

export type { SettingsRepoPort } from "@jini-ai/core/settings";

export { InMemorySettingsRepo } from "@jini-ai/core/settings";

export {
  type DefinitionInput,
  validateDefinitionInput,
  validateValueAgainstSchema,
  registerCoercer,
  invalidateDefinitionNamespaceCache,
  invalidateWorkspaceSettingsCache,
  resolveDefinitionRaw,
  resolveDefinition,
  type ResolvedSetting,
  getEffective,
} from "@jini-ai/core/settings";

export {
  type AuthorizeFn,
  type SettingsWriteServiceDeps,
  deriveRequiredPermission,
  type RegisterDefinitionsRequired,
  registerDefinitions,
  type SetValueRequired,
  type ClearValueRequired,
  clear,
  type ResetNamespaceRequired,
  resetNamespace,
  type RenameDefinitionRequired,
  renameDefinition,
  type RetypeDefinitionRequired,
  retypeDefinition,
  type ReconcileDefinitionDefaultRequired,
  reconcileDefinitionDefault,
  type DeprecateDefinitionRequired,
  deprecateDefinition,
  type TombstoneDefinitionRequired,
  tombstoneDefinition,
} from "@jini-ai/core/settings";

// Not the package's `set`: the same function behind this host's SPEC-050 REQ-08 site-title bounds.
export { set } from "./site-title-write.js";
// Renderers consume the title resolver through the settings public surface.
export { resolveSiteTitle } from "./site-title.js";

export {
  type PurgeServiceDeps,
  type PurgeTenantSettingsRequired,
  purgeTenantSettings,
} from "@jini-ai/core/settings";

export {
  type ChangeFeedViewer,
  isRevisionVisibleTo,
  type ChangeFeedBatch,
  collectChangedNamespaces,
} from "@jini-ai/core/settings";

export {
  type DefinitionOpRequestItem,
  type DefinitionOpContext,
  type DefinitionOpHandler,
  NON_REGISTER_DEFINITION_OP_NAMES,
  type NonRegisterDefinitionOp,
  parseNonRegisterDefinitionOp,
  NON_REGISTER_DEFINITION_OPS,
} from "@jini-ai/core/settings";

export {
  type SettingDefinitionSpec,
  type EnsureSettingDefinitionsDeps,
  type EnsureSettingDefinitionsInput,
  ensureSettingDefinitions,
} from "@jini-ai/core/settings";

export {
  INSTRUCTIONS_NAMESPACE,
  NOTIFICATIONS_NAMESPACE,
  PRIVACY_NAMESPACE,
  APPEARANCE_NAMESPACE,
  LANGUAGE_NAMESPACE,
  type EnsureSettingsUiTabDefinitionsInput,
} from "@jini-ai/core/settings";

export { ensureSettingsUiTabDefinitions } from '../webmcp/settings.js';

export {
  type AgentWritablePreference,
  AGENT_PREFERENCE_WRITE_SCOPE,
  AGENT_WRITABLE_PREFERENCES,
  AGENT_WRITABLE_PREFERENCE_IDS,
  resolveAgentWritablePreference,
  AGENT_PREFERENCE_REQUIRED_SCOPE_BIT,
} from "@jini-ai/core/settings";

export { getSettingsAgentToolCatalog } from "@jini-ai/core/settings";
export type { AgentToolDefinition } from "@jini-ai/core";
