/**
 * @file Content-types' agent-tool registrations — re-exported from `@jini-ai/cms/content-types`.
 *
 * A shim rather than a rewrite of the one importer, deliberately, mirroring `identity/` and
 * `navigation/`'s own reasoning. `assistant/tool-registrations.ts` imports all 22 domains as a
 * single uniform block of `../<domain>/tool-registrations` lines, and this file keeps that block
 * uniform. When more domains move, this file and its siblings retire together.
 *
 * 2026-08-17 (Stage 2 batch 2 of the registry rollout): converted to
 * `assistant/tool-contribution-registry.ts`'s explicit-call registry, same as `identity`/`members`/
 * `taxonomy`/`redirects`/`widgets` — see that file's header for why. `widgets` (this batch's own
 * first conversion) imports `features/content-types` internally
 * (`widgets/{write-service,embed-service,region-area-service,deps,entry-payload}.ts`), which is why
 * this domain converts AFTER `widgets`, not before: `widgets` was still a legacy static
 * `DOMAIN_SLICES` entry until its own conversion, and converting `content-types` first would have
 * closed `assistant -> widgets -> content-types -> assistant` (the same shape that forced the
 * `themes`/`post` reverts in the prior batch). With `widgets` already off the static array, no
 * remaining still-legacy domain imports `content-types`, so this edge is safe.
 */
import type { ToolContributor } from "#src/assistant/index";
import {
  buildContentTypesRegistrations,
  contentTypesDerivedRisk,
  type ContentTypesToolDeps,
} from "@jini-ai/cms/content-types";

import { forbiddenRule, withModelFacingRegistrationErrors, type ModelFacingErrorRule } from "../../contracts/core/model-facing-tool-errors.js";

export { buildContentTypesRegistrations, contentTypesDerivedRisk, type ContentTypesToolDeps };

/**
 * Content-types' model-facing allowlist (2026-09-24) — deliberately just `forbiddenRule`.
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
const CONTENT_TYPES_MODEL_FACING_RULES: readonly ModelFacingErrorRule[] = [forbiddenRule("CONTENT_TYPES")];

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
    build: (deps) => withModelFacingRegistrationErrors(buildContentTypesRegistrations(deps), CONTENT_TYPES_MODEL_FACING_RULES),
    risk: contentTypesDerivedRisk,
  };
}
