/**
 * @file Public surface (barrel) for `features/content-types` — re-exported from
 * `@jini-ai/cms/content-types`.
 *
 * Jini owns content-type behavior. SQLite adapters stay host-owned because they bind the site's
 * schema. This barrel omits SQLite so consumers cannot accidentally depend on that persistence choice.
 *
 * `repo.memory.ts` and `write-service.ts` retain their per-file exports for
 * `src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts` (dynamic
 * `await import(...)`), which `.dependency-cruiser.mjs`'s `TOOL_REGISTRATION_TEST_FROM` pattern
 * deliberately exempts as a tool-registration-seam contract test. That contract keeps these paths
 * available until its owner redirects the imports to this barrel.
 */
export type { ContentTypeFieldKind, ContentTypeFieldDef, ContentTypeStatus, ContentTypeRecord, ActorPrincipalKind, ActorIdentityInput } from "@jini-ai/cms/content-types";
export type { Result } from "@jini-ai/core/primitives";
export { CONTENT_TYPE_FIELD_KINDS, isContentTypeFieldKind, isIndexableFieldKind } from "@jini-ai/cms/content-types";

export type { ContentTypeListPort } from "@jini-ai/cms/content-types";
export { listContentTypes } from "@jini-ai/cms/content-types";

export { parseContentTypeFieldDefs } from "@jini-ai/cms/content-types";

/**
 * Re-exported as **values**, not types: callers catch them with `instanceof`, and re-exporting
 * (rather than redeclaring) keeps exactly one class object per error. Note these are distinct from
 * the same-named classes on `../entries` and on `core/commands/command` — a caller must catch the
 * one belonging to the function it actually called.
 */
export {
  ForbiddenError,
  InvalidKeyGrammarError,
  ReservedContentTypeKeyError,
  InvalidFieldNameGrammarError,
  InvalidFieldKindError,
  InvalidFieldShapeError,
  QueryableFieldCapExceededError,
  VersionConflictError,
  ContentTypeNotFoundError,
  ContentTypeAlreadyExistsError,
  ValidationError,
  ContentTypeLifecycleError,
  CleanupNotEligibleError,
} from "@jini-ai/cms/content-types";

export type { FieldIndexState, FieldIndexTransition } from "@jini-ai/cms/content-types";
export {
  IDENTIFIER_GRAMMAR_PATTERN,
  validateIdentifierGrammar,
  mapFieldKindToCast,
  buildQueryableFieldIndexName,
  resolveFieldIndexTransition,
} from "@jini-ai/cms/content-types";

export type {
  AuthorizeFn,
  ContentTypeRevisionInput,
  ContentTypeRepoPort,
  IndexProvisionerPort,
  OutboxPort,
  WatermarkPort,
  ContentTypeWriteServiceDeps,
  RegisterContentTypeRequired,
  UpdateContentTypeFieldsRequired,
} from "@jini-ai/cms/content-types";
export { registerContentType, updateContentTypeFields } from "@jini-ai/cms/content-types";

export type {
  LifecycleTransitionInput,
  DeprecateContentTypeRequired,
  ReactivateContentTypeRequired,
  TeardownIndexProvisionerPort,
  TombstoneContentTypeRequired,
} from "@jini-ai/cms/content-types";
export {
  deprecateContentType,
  reactivateContentType,
  tombstoneContentType,
} from "@jini-ai/cms/content-types";

export type {
  ContentTypeLifecycleOp,
  ContentTypeLifecycleHandler,
  LifecycleDispatchDeps,
  LifecycleDispatchInput,
} from "@jini-ai/cms/content-types";
export {
  CONTENT_TYPE_LIFECYCLE_OP_NAMES,
  CONTENT_TYPE_LIFECYCLE_OPS,
  parseContentTypeLifecycleOp,
} from "@jini-ai/cms/content-types";

export type {
  CleanupEligibilityCheckRepoPort,
  PlanCleanupGatewayPort,
  PlanCleanupRequired,
  ExecuteCleanupGatewayPort,
  CleanupRemovalRepoPort,
  ExecuteCleanupRequired,
} from "@jini-ai/cms/content-types";
export { planCleanup, executeCleanup } from "@jini-ai/cms/content-types";

export {
  InMemoryContentTypeRepo,
  NoopContentTypeIndexProvisioner,
  toContentTypeOutbox,
} from "@jini-ai/cms/content-types";

/** The agent-tool surface for this domain (see the package's `agent-tools.ts` for what is deliberately omitted). */
export { contentTypesAgentToolCatalog } from "@jini-ai/cms/content-types";
export type { AgentToolDefinition as ContentTypesAgentToolDefinition, AgentToolSideEffect as ContentTypesAgentToolSideEffect, AgentToolActorClassRule as ContentTypesAgentToolActorClassRule } from "@jini-ai/core";

/**
 * The agent-tool wiring for this domain. Also re-exported (unchanged) by `tool-registrations.ts`
 * as a thin shim, since `assistant/tool-registrations.ts` imports every domain uniformly as
 * `../<domain>/tool-registrations`.
 */
export {
  buildContentTypesRegistrations,
  contentTypesDerivedRisk,
  type ContentTypesToolDeps,
} from "@jini-ai/cms/content-types";
