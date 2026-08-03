/**
 * @file The cross-domain half of ADR-049 Decision 4's agent-tool wiring — re-exported from
 * `@jini-ai/cms/core`.
 *
 * Moved into the package on 2026-08-02. See `../ports.ts` for why the re-export shim exists.
 * 23 of this repo's files import this kit; every domain's `tool-registrations.ts` is one of them.
 *
 * `ToolHandler` and `ToolRegistration` originate in `@jini-ai/core` and are re-exported through the
 * kit rather than imported directly by each domain — deliberately, so a domain file needs one
 * import line for its tool wiring instead of two. That indirection is preserved here.
 */
export type {
  AgentToolActorClassRule,
  AgentToolSideEffect,
  DerivedRiskByToolId,
  ToolHandler,
  ToolRegistration,
  WirableToolDefinition,
} from "@jini-ai/cms/core";

export {
  ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT,
  AGENT_TOOL_PRINCIPAL_KIND,
  assertToolIsWirable,
  buildDomainRegistrations,
  decorateWithSchema,
  fromResult,
  indexCatalogById,
  isRecord,
  mergeDerivedRiskMaps,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireInputRecord,
  requireNoInput,
  requireNumber,
  requireObject,
  requireString,
  requireToolPermission,
  withSchemaOnRejection,
} from "@jini-ai/cms/core";
