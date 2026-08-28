/**
 * @file Public surface (barrel) for `features/content-types` — re-exported from
 * `@jini-ai/cms/content-types`.
 *
 * The domain moved into the package on 2026-08-03. What is left in this directory is only what is
 * genuinely this host's:
 *
 * - `repo.sqlite.ts` — the Drizzle adapter. It names `db/schema.ts`, this repo's shared 1,246-line
 *   schema covering every domain, so it is host persistence, not library code.
 *
 * There is no SQLite export on this barrel, deliberately: nothing outside the composition root can
 * accidentally depend on this host's persistence choice.
 *
 * `repo.memory.ts` and `write-service.ts` also survive as per-file re-export shims. `src/widgets/`'s
 * deep imports were redirected here on 2026-08-17 (matching the `features/entries` shim
 * retirement in c3c030a9); the one remaining direct importer is
 * `src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts` (dynamic
 * `await import(...)`), which `.dependency-cruiser.cjs`'s `TOOL_REGISTRATION_TEST_FROM` pattern
 * deliberately, permanently exempts as a tool-registration-seam contract test — not a pending
 * migration. Retiring these shims depends on whether that file's own owner redirects it to
 * `./index.ts`, which already exports everything it needs.
 */
export type {
  ContentTypeFieldKind,
  ContentTypeFieldDef,
  ContentTypeStatus,
  ContentTypeRecord,
  ActorPrincipalKind,
  ActorIdentityInput,
  Result,
} from "@jini-ai/cms/content-types";
export { CONTENT_TYPE_FIELD_KINDS, isContentTypeFieldKind } from "@jini-ai/cms/content-types";

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
export {
  contentTypesAgentToolCatalog,
  type ContentTypesAgentToolDefinition,
  type ContentTypesAgentToolSideEffect,
  type ContentTypesAgentToolActorClassRule,
} from "@jini-ai/cms/content-types";

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
