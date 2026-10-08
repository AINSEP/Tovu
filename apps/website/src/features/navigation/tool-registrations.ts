import { toolMetadata } from '../../contracts/core/tool-metadata/navigation.js';
import { withToolMetadata } from '@jini-ai/core';
/**
 * @file Menus' agent-tool registrations, built by `@jini-ai/cms/navigation`.
 * This host seam binds metadata and model-facing errors to the assistant's domain catalog.
 * Contributors are installed explicitly at the composition root; importing a feature must not
 * register tools or create an assistant-to-feature runtime cycle.
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

import { ForbiddenError } from "@jini-ai/cms/core";
import { forbiddenRule, withModelFacingRegistrationErrors, type ModelFacingErrorRule } from "@jini-ai/core/model-facing-tool-errors";

export { buildMenusRegistrations, menusDerivedRisk, type MenusToolDeps };

/**
 * Menus' model-facing allowlist. `menu-service.ts` throws these four classes from fixed
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
  forbiddenRule({ domainPrefix: "MENUS", error: ForbiddenError }),
];

/**
 * Contributes Menus' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildMenusRegistrations`/
 * `menusDerivedRisk` by name; this is the seam that replaced it.
 *
 * `build` wraps every registration with {@link withModelFacingRegistrationErrors}: every
 * menus domain error still extends plain `Error`, so without this wrap each one reached the model as
 * a redacted `INTERNAL_ERROR` 500.
 */
export function contributeMenusTools(): ToolContributor {
  return {
    domain: "menus",
    build: (deps) => withModelFacingRegistrationErrors({ registrations: withToolMetadata({ registrations: buildMenusRegistrations(deps), metadata: toolMetadata }), rules: MENUS_MODEL_FACING_RULES }),
    risk: menusDerivedRisk,
  };
}
