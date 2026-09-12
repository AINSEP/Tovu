/**
 * @file Public surface (barrel) for `settings` — re-exported from `@jini-ai/cms/settings`.
 *
 * The domain moved into the package on 2026-08-03 so a second host can use the same
 * definitions/values/revision-ledger model. What is left in this directory is only what is
 * genuinely this host's:
 *
 * - `repo.sqlite.ts` — the Drizzle adapters. They name `db/schema.ts`, this repo's shared
 *   1,246-line schema covering every domain, so they are host persistence, not library code.
 * - `migration.ts` — the one-time brownfield migration retiring this host's own legacy
 *   `presentation_settings` table into the ledger. A fresh host has no such legacy data, so this
 *   is not a generic library capability — it stays here and keeps importing `../presentation`
 *   locally (`features/presentation` is not ported; see the port's own decision note).
 *
 * Everything else here is a re-export, and the shape of what is *not* re-exported is the point:
 * there is no SQLite adapter export on this barrel, so nothing outside the composition root can
 * accidentally depend on this host's persistence choice. This directory previously had no
 * `index.ts` at all — every internal submodule was imported deep by name. This barrel is new, and
 * every prior deep importer in this host was rewritten to go through it (mirrors `identity`'s and
 * `media`'s identical shim pattern).
 */
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
} from "@jini-ai/cms/settings";

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
} from "@jini-ai/cms/settings";

export type { SettingsRepoPort } from "@jini-ai/cms/settings";

export { InMemorySettingsRepo } from "@jini-ai/cms/settings";

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
} from "@jini-ai/cms/settings";

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
} from "@jini-ai/cms/settings";

// Not the package's `set`: the same function behind this host's SPEC-050 REQ-08 site-title bounds.
export { set } from "./site-title-write.js";

export {
  type PurgeServiceDeps,
  type PurgeTenantSettingsRequired,
  purgeTenantSettings,
} from "@jini-ai/cms/settings";

export {
  type ChangeFeedViewer,
  isRevisionVisibleTo,
  type ChangeFeedBatch,
  collectChangedNamespaces,
} from "@jini-ai/cms/settings";

export {
  type DefinitionOpRequestItem,
  type DefinitionOpContext,
  type DefinitionOpHandler,
  NON_REGISTER_DEFINITION_OP_NAMES,
  type NonRegisterDefinitionOp,
  parseNonRegisterDefinitionOp,
  NON_REGISTER_DEFINITION_OPS,
} from "@jini-ai/cms/settings";

export {
  type SettingDefinitionSpec,
  type EnsureSettingDefinitionsDeps,
  type EnsureSettingDefinitionsInput,
  ensureSettingDefinitions,
} from "@jini-ai/cms/settings";

export {
  INSTRUCTIONS_NAMESPACE,
  NOTIFICATIONS_NAMESPACE,
  PRIVACY_NAMESPACE,
  APPEARANCE_NAMESPACE,
  LANGUAGE_NAMESPACE,
  type EnsureSettingsUiTabDefinitionsInput,
  ensureSettingsUiTabDefinitions,
} from "@jini-ai/cms/settings";

export {
  type AgentWritablePreference,
  AGENT_PREFERENCE_WRITE_SCOPE,
  AGENT_WRITABLE_PREFERENCES,
  AGENT_WRITABLE_PREFERENCE_IDS,
  resolveAgentWritablePreference,
  AGENT_PREFERENCE_REQUIRED_SCOPE_BIT,
} from "@jini-ai/cms/settings";

export {
  getSettingsAgentToolCatalog,
  type SettingsAgentToolDefinition as AgentToolDefinition,
} from "@jini-ai/cms/settings";
