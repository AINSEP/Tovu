import { toolMetadata } from '../../contracts/core/tool-metadata/workspace.js';
import { withToolMetadata } from '@jini-ai/core';
/**
 * @file Workspace' agent-tool registrations, built by `@jini-ai/cms/workspace`.
 * This host seam binds metadata and model-facing errors to the assistant's domain catalog.
 * Contributors are installed explicitly at the composition root; importing a feature must not
 * register tools or create an assistant-to-feature runtime cycle.
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

import { ForbiddenError } from "@jini-ai/cms/core";
import { forbiddenRule, withModelFacingRegistrationErrors, type ModelFacingErrorRule } from "@jini-ai/core/model-facing-tool-errors";

export { buildWorkspaceRegistrations, workspaceDerivedRisk, type WorkspaceToolDeps };

/**
 * Workspace's model-facing allowlist. `create.ts`/`update.ts`/`delete.ts` throw these
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
  forbiddenRule({ domainPrefix: "WORKSPACE", error: ForbiddenError }),
];

/**
 * Contributes Workspace's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildWorkspaceRegistrations`/
 * `workspaceDerivedRisk` by name; this is the seam that replaced it.
 *
 * `build` wraps every registration with {@link withModelFacingRegistrationErrors}: every
 * workspace domain error still extends plain `Error`, so without this wrap each one reached the model
 * as a redacted `INTERNAL_ERROR` 500.
 */
export function contributeWorkspaceTools(): ToolContributor {
  return {
    domain: "workspace",
    build: (deps) => withModelFacingRegistrationErrors({ registrations: withToolMetadata({ registrations: buildWorkspaceRegistrations(deps), metadata: toolMetadata }), rules: WORKSPACE_MODEL_FACING_RULES }),
    risk: workspaceDerivedRisk,
  };
}
