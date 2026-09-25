/**
 * @file Workspace's agent-tool registrations — re-exported from `@jini-ai/cms/workspace`.
 *
 * A shim rather than a rewrite of the one importer, deliberately.
 * `assistant/tool-registrations.ts` imports every not-yet-converted domain as a single uniform block
 * of `../<domain>/tool-registrations` lines. Pointing only workspace somewhere else would make one
 * ported domain the odd line out, and would invite the next reader to "restore consistency" by
 * reaching past a barrel rather than through it. When more domains move, this file and its
 * siblings retire together.
 *
 * 2026-08-17 (Stage 2 batch 2 of the registry rollout): converted to
 * `assistant/tool-contribution-registry.ts`'s explicit-call registry, same as `identity`. Safe: the
 * only importer of this file (relative or `#src/*` subpath) is `assistant/tool-registrations.ts`
 * itself, and every OTHER importer of `features/workspace` at large is either `server/*` (never
 * reachable from `assistant`) or a `import type` from `site-dir/*` (erased at compile time, no
 * runtime edge either way).
 */
import type { ToolContributor } from "#src/assistant/index";
import {
  buildWorkspaceRegistrations,
  workspaceDerivedRisk,
  WorkspaceConflictError,
  WorkspaceLastRemainingError,
  WorkspaceNotFoundError,
  WorkspaceValidationError,
  type WorkspaceToolDeps,
} from "@jini-ai/cms/workspace";

import { forbiddenRule, withModelFacingRegistrationErrors, type ModelFacingErrorRule } from "../../contracts/core/model-facing-tool-errors.js";

export { buildWorkspaceRegistrations, workspaceDerivedRisk, type WorkspaceToolDeps };

/**
 * Workspace's model-facing allowlist (2026-09-24). `create.ts`/`update.ts`/`delete.ts` throw these
 * four classes from fixed text plus caller-supplied slugs/ids only (verified against every
 * `new X(...)` call site) — safe to publish verbatim. Per plan follow-up F2, `workspace/
 * tool-registrations.ts:85` (Jini) still throws a plain `Error("workspace … was not found")` on one
 * path this allowlist cannot match — a Jini-source fix, out of this slice's scope (`Do not touch:
 * Jini source`); that one call site stays redacted until it does.
 */
const WORKSPACE_MODEL_FACING_RULES: readonly ModelFacingErrorRule[] = [
  { error: WorkspaceValidationError, code: "WORKSPACE_VALIDATION" },
  { error: WorkspaceConflictError, code: "WORKSPACE_CONFLICT" },
  { error: WorkspaceNotFoundError, code: "WORKSPACE_NOT_FOUND" },
  { error: WorkspaceLastRemainingError, code: "WORKSPACE_LAST_REMAINING" },
  forbiddenRule("WORKSPACE"),
];

/**
 * Contributes Workspace's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildWorkspaceRegistrations`/
 * `workspaceDerivedRisk` by name; this is the seam that replaced it.
 *
 * `build` wraps every registration with {@link withModelFacingRegistrationErrors} (2026-09-24): every
 * workspace domain error still extends plain `Error`, so without this wrap each one reached the model
 * as a redacted `INTERNAL_ERROR` 500.
 */
export function contributeWorkspaceTools(): ToolContributor {
  return {
    domain: "workspace",
    build: (deps) => withModelFacingRegistrationErrors(buildWorkspaceRegistrations(deps), WORKSPACE_MODEL_FACING_RULES),
    risk: workspaceDerivedRisk,
  };
}
