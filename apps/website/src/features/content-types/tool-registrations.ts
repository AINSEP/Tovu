import { toolMetadata } from '../../contracts/core/tool-metadata/content-types.js';
import { withToolMetadata } from '@jini-ai/core';
/**
 * @file Content-types' agent-tool registrations, built by `@jini-ai/cms/content-types`.
 * This host seam binds metadata and model-facing errors to the assistant's domain catalog.
 * Contributors are installed explicitly at the composition root; importing a feature must not
 * register tools or create an assistant-to-feature runtime cycle.
 */
import type { ToolContributor } from "#src/assistant/index";
import {
  buildContentTypesRegistrations,
  contentTypesDerivedRisk,
  type ContentTypesToolDeps,
} from "@jini-ai/cms/content-types";

import { ForbiddenError } from "@jini-ai/cms/core";
import { forbiddenRule, withModelFacingRegistrationErrors, type ModelFacingErrorRule } from "@jini-ai/core/model-facing-tool-errors";

export { buildContentTypesRegistrations, contentTypesDerivedRisk, type ContentTypesToolDeps };

/**
 * Content-types' model-facing allowlist — deliberately just `forbiddenRule`.
 *
 * Every content-types domain error EXCEPT `CleanupNotEligibleError` already extends `ToolInputError`
 * at the source (Jini `1029e337`, "model-facing rejections extend ToolInputError"): its own
 * `ForbiddenError`, `InvalidKeyGrammarError`, `ReservedContentTypeKeyError`,
 * `InvalidFieldNameGrammarError`, `InvalidFieldKindError`/`StorageOnlyFieldNotQueryableError`,
 * `InvalidFieldShapeError`, `QueryableFieldCapExceededError`, `VersionConflictError`,
 * `ContentTypeNotFoundError`, `ContentTypeAlreadyExistsError`, `ValidationError` and
 * `ContentTypeLifecycleError`. `reclassifyToolError` returns any `instanceof ToolInputError`
 * rejection UNCHANGED before it ever reaches the rule loop (see that function's own doc — the guard
 * exists so a `withSchemaOnRejection` wrap upstream is never double-prefixed), so listing any of
 * those classes here would be dead code: the loop can never see them. They already reach the model
 * with their own message, un-redacted, just without a `CONTENT_TYPES_` prefix — Jini's fix, not this
 * file's convention, and changing `reclassifyToolError`'s shared early-return to force a prefix onto
 * an already-correctly-classified error would touch every other already-wired domain, well outside
 * this domain's own allowlist decision.
 *
 * `CleanupNotEligibleError` is left OFF this list too, for a different reason: it stays plain `Error`
 * because its two tools (`collections_plan_cleanup`/`collections_execute_cleanup`) are still unwired
 * (`UNWIRED_CONTENT_TYPES_TOOL_IDS`), so nothing reaches a model through it today — and one of its
 * five constructor sites (`cleanup.ts`'s `"gateway_rejected"` case) builds its message from
 * `String(planResult.error)`, an arbitrary downstream error's text, not fixed text plus caller input.
 * It fails this file's message-safety check and must be re-audited, not just re-added, once those
 * tools are wired.
 *
 * `forbiddenRule("CONTENT_TYPES")` covers the KIT's `ForbiddenError` (`requireToolPermission`,
 * called by every handler here before any content-types-specific check runs) — still plain `Error`,
 * the one rejection this domain actually needs wrapped.
 */
const CONTENT_TYPES_MODEL_FACING_RULES: readonly ModelFacingErrorRule[] = [forbiddenRule({ domainPrefix: "CONTENT_TYPES", error: ForbiddenError })];

/**
 * Contributes Content-types' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildContentTypesRegistrations`/
 * `contentTypesDerivedRisk` by name; this is the seam that replaced it.
 *
 * `build` wraps every registration with {@link withModelFacingRegistrationErrors} so the one
 * still-plain-`Error` rejection this domain can throw (the kit's `ForbiddenError`) reaches the model
 * instead of a redacted `INTERNAL_ERROR` — see {@link CONTENT_TYPES_MODEL_FACING_RULES} for why every
 * other content-types error needs no rule here.
 */
export function contributeContentTypesTools(): ToolContributor {
  return {
    domain: "content-types",
    build: (deps) => withModelFacingRegistrationErrors({ registrations: withToolMetadata({ registrations: buildContentTypesRegistrations(deps), metadata: toolMetadata }), rules: CONTENT_TYPES_MODEL_FACING_RULES }),
    risk: contentTypesDerivedRisk,
  };
}
