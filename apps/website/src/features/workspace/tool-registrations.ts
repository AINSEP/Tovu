import { toolMetadata } from '../../contracts/core/tool-metadata/workspace.js';
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, ToolInputError, withToolMetadata, type DerivedRiskByToolId, type ToolRegistration } from '@jini-ai/core';
import { getWorkspaceAgentToolCatalog } from './agent-tools.js';
/**
 * @file Workspace' agent-tool registrations, built by `@jini-ai/cms/workspace`.
 * This host seam binds metadata and model-facing errors to the assistant's domain catalog.
 * Contributors are installed explicitly at the composition root; importing a feature must not
 * register tools or create an assistant-to-feature runtime cycle.
 */
import type { ToolContributor } from "@jini-ai/core";
import {
  buildWorkspaceRegistrations as buildSharedWorkspaceRegistrations,
  workspaceDerivedRisk as sharedWorkspaceDerivedRisk,
  WorkspaceConflictError,
  WorkspaceLastRemainingError,
  WorkspaceNotFoundError,
  WorkspaceValidationError,
  type WorkspaceToolDeps,
} from "@jini-ai/cms/workspace";

import { ForbiddenError } from "@jini-ai/cms/core";
import { forbiddenRule, withModelFacingRegistrationErrors, type ModelFacingErrorRule } from "@jini-ai/core/model-facing-tool-errors";

export type { WorkspaceToolDeps };
export const workspaceDerivedRisk: DerivedRiskByToolId = new Map([...sharedWorkspaceDerivedRisk, ["workspace_list", "none"]]);

/**
 * Adds the v1 list projection by calling Jini's current-workspace read, including its permission gate.
 * @param deps - Jini workspace ports, bound to the served workspace.
 * @param optional - `buildShared` swaps the Jini registration builder (defaults to `@jini-ai/cms/workspace`'s).
 * @returns Shared registrations plus the host's list of addressable workspaces.
 * @throws Error when the shared builder registers no `workspace_get` read owner;
 * existing read-owner failures unchanged; ToolInputError for another workspace id.
 * @complexity O(t) wiring for t shared tools; each read uses one existing repository lookup.
 * @example buildWorkspaceRegistrations({ workspaceId: "ws", authorize, workspaceRepo })
 */
export function buildWorkspaceRegistrations(
  deps: WorkspaceToolDeps,
  { buildShared = buildSharedWorkspaceRegistrations }: { buildShared?: (deps: WorkspaceToolDeps) => ToolRegistration[] } = {},
): ToolRegistration[] {
  const shared = buildShared(deps);
  const get = shared.find(registration => registration.descriptor.id === "workspace_get");
  if (!get) throw new Error("workspace read owner is not registered");
  /** Preserves the existing permission/read owner, translating only its known missing-row refusal. */
  const readCurrent: typeof get.handler = async (ctx, options) => {
    try { return await get.handler(ctx, options); }
    catch (error) {
      if (error instanceof Error && error.message === `workspace '${deps.workspaceId}' was not found`) {
        throw new WorkspaceNotFoundError({ message: error.message });
      }
      throw error;
    }
  };
  const getWithId: ToolRegistration = { ...get, descriptor: { ...get.descriptor,
    inputSchema: getWorkspaceAgentToolCatalog().find(tool => tool.name === "workspace_get")!.inputSchema,
  }, handler: async ctx => {
    if (ctx.input === undefined) return readCurrent(ctx);
    const input = requireInputRecord({ input: ctx.input });
    if (input.workspaceId === undefined) return readCurrent(ctx);
    const workspaceId = requireString({ input, key: "workspaceId" });
    const result = await readCurrent({ ...ctx, input: {} });
    if (workspaceId !== deps.workspaceId) throw new ToolInputError({ message: `workspace '${workspaceId}' is not addressable — only '${deps.workspaceId}' is available in this server` });
    return result;
  } };
  const list = buildDomainRegistrations({ metadata: toolMetadata, domain: "workspace", catalogModule: "features/workspace/agent-tools.ts",
    catalog: indexCatalogById({ catalog: getWorkspaceAgentToolCatalog().filter(tool => tool.name === "workspace_list") }),
    derivedRisk: new Map([["workspace_list", "none"]]),
    handlers: { workspace_list: async ctx => {
      const result = await readCurrent(ctx) as { workspace: unknown };
      return { workspaces: [result.workspace] };
    } },
  });
  return [...shared.map(registration => registration === get ? getWithId : registration), ...list];
}

/**
 * Workspace's model-facing allowlist. `create.ts`/`update.ts`/`delete.ts` throw these
 * four classes from fixed text plus caller-supplied slugs/ids only (verified against every
 * `new X(...)` call site) — safe to publish verbatim. Jini's current read still throws a plain
 * missing-workspace Error; the host read adapter above translates only that exact known refusal
 * so arbitrary repository errors retain the transport's redaction.
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
 * `satisfies` checks the shared contributor contract while preserving this builder's actual
 * workspace-only inputs; it needs no surface exchange store.
 */
export function contributeWorkspaceTools() {
  return {
    domain: "workspace",
    build: (deps: WorkspaceToolDeps) => withModelFacingRegistrationErrors({ registrations: withToolMetadata({ registrations: buildWorkspaceRegistrations(deps), metadata: toolMetadata }), rules: WORKSPACE_MODEL_FACING_RULES }),
    risk: workspaceDerivedRisk,
  } satisfies ToolContributor<WorkspaceToolDeps, unknown>;
}
