/**
 * @file Menus' (navigation's) agent-tool registrations — re-exported from `@jini-ai/cms/navigation`.
 *
 * A shim rather than a rewrite of the one importer, deliberately, mirroring `identity/
 * tool-registrations.ts`'s own reasoning. `assistant/tool-registrations.ts` imports all 22 domains
 * as a single uniform block of `../<domain>/tool-registrations` lines. Pointing only navigation
 * somewhere else would make the ported domain the odd line out, and would invite the next reader to
 * "restore consistency" by reaching past a barrel rather than through it. When more domains move,
 * this file and its siblings retire together.
 *
 * 2026-08-17 (Stage 2 batch 2 of the registry rollout): converted to
 * `assistant/tool-contribution-registry.ts`'s explicit-call registry, same as `widgets`/
 * `content-types`/`forms` earlier in this batch — see that file's header for why. The one other
 * importer of `navigation` outside `server/*` is `features/theme/static-render.ts`, but `themes`'
 * own `DOMAIN_SLICES` entry points at `features/theme/tool-registrations.ts`, and that file's real
 * transitive import closure (`agent-tools.ts` -> `theme-files.ts` -> `theme.ts` ->
 * `build-conformance.ts`/`handlebars-allowlist.ts`/`liquid-allowlist.ts`) never reaches
 * `static-render.ts` or `index.ts` — confirmed by tracing every import in that closure, not just a
 * same-directory assumption. So `assistant -> themes -> navigation -> assistant` cannot close, unlike
 * the `themes -> export` cycle that blocked `themes`' own conversion.
 */
import type { ToolContributor } from "#src/assistant/index";
import {
  buildMenusRegistrations,
  menusDerivedRisk,
  MenuConflictError,
  MenuLocationBoundError,
  MenuNotFoundError,
  MenuValidationError,
  type MenusToolDeps,
} from "@jini-ai/cms/navigation";

import { forbiddenRule, withModelFacingRegistrationErrors, type ModelFacingErrorRule } from "../../contracts/core/model-facing-tool-errors.js";

export { buildMenusRegistrations, menusDerivedRisk, type MenusToolDeps };

/**
 * Menus' model-facing allowlist (2026-09-24). `menu-service.ts` throws these four classes from fixed
 * text plus caller-supplied ids/slugs/counts only (verified against every `new X(...)` call site) —
 * safe to publish verbatim. `MenuLocationBoundError` (a `MenuConflictError` subclass) is listed
 * FIRST, per `reclassifyToolError`'s "subclass before superclass" ordering rule, so its own, more
 * specific code wins the match. `EntityNotLiveError` (Jini `e46b9ebc`/`7239f991`'s trashed-menu
 * guards) is deliberately NOT listed: it already extends `ToolInputError` at the source, so it
 * reaches the model correctly without this wrap, and listing it would be dead code — see
 * `features/content-types/tool-registrations.ts`'s identical reasoning for that package's own
 * already-`ToolInputError` classes.
 */
const MENUS_MODEL_FACING_RULES: readonly ModelFacingErrorRule[] = [
  { error: MenuLocationBoundError, code: "MENUS_LOCATION_BOUND" },
  { error: MenuNotFoundError, code: "MENUS_NOT_FOUND" },
  { error: MenuValidationError, code: "MENUS_VALIDATION" },
  { error: MenuConflictError, code: "MENUS_CONFLICT" },
  forbiddenRule("MENUS"),
];

/**
 * Contributes Menus' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildMenusRegistrations`/
 * `menusDerivedRisk` by name; this is the seam that replaced it.
 *
 * `build` wraps every registration with {@link withModelFacingRegistrationErrors} (2026-09-24): every
 * menus domain error still extends plain `Error`, so without this wrap each one reached the model as
 * a redacted `INTERNAL_ERROR` 500.
 */
export function contributeMenusTools(): ToolContributor {
  return {
    domain: "menus",
    build: (deps) => withModelFacingRegistrationErrors(buildMenusRegistrations(deps), MENUS_MODEL_FACING_RULES),
    risk: menusDerivedRisk,
  };
}
