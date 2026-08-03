/**
 * @file Workspace's half of ADR-049 Decision 4 (SPEC-044): maps the wireable subset of
 * `agent-tools.ts`'s four catalog entries onto the current-workspace read and the narrow rename
 * write, as `ToolRegistration`s.
 *
 * Risk framing: this is the highest-stakes domain wired so far — `create` and `delete` are
 * deliberately excluded, each with its reason recorded on {@link UNWIRED_WORKSPACE_TOOL_IDS}; see
 * `features/workspace/agent-tools.ts`'s own file header for the full reasoning. Only a plain rename
 * (`update`) is wired, alongside a read.
 *
 * Authorization shape: neither `updateWorkspace` (`update.ts`) nor a direct `workspaceRepo.findById`
 * read calls `authorize()` internally — the admin routes gate inline (`routes/admin/workspace/get.ts`,
 * `update.ts`) — so both handlers here call the kit's `requireToolPermission` themselves, mirroring
 * those routes' identical `workspace.manage` check.
 */
import type { AuthorizeFn } from "../../core/commands/command";
import {
  buildDomainRegistrations,
  indexCatalogById,
  optionalString,
  requireInputRecord,
  requireNoInput,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "../../core/tools/registration-kit";
import { getWorkspaceAgentToolCatalog } from "./agent-tools";
import { updateWorkspace } from "./update";
import type { WorkspaceRepoPort } from "./create";

const CATALOG_BY_ID = indexCatalogById(getWorkspaceAgentToolCatalog());

/**
 * The exact slice of the route-deps bag Workspace's tool handlers read. Declared structurally
 * (rather than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge
 * into the composition root. `server/routes/*` satisfies this structurally by passing its existing
 * `RouteDeps` object; nothing there changes.
 */
export interface WorkspaceToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  workspaceRepo: WorkspaceRepoPort;
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration — and note that the two excluded tools appear NOWHERE here, which is
 * itself the strongest of the guards: an unclassified id cannot be wired at all.
 */
export const workspaceDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> routeDeps.workspaceRepo.findById(): one read, no domain function of its own (mirrors
  //    `routes/admin/workspace/get.ts`'s own direct repo call).
  ["workspace_get", "none"],
  // -> updateWorkspace (update.ts) -> repo.findById + repo.findBySlug + repo.update: validates,
  //    checks slug uniqueness excluding the row itself, writes. No domain event enqueued (matches
  //    update.ts's own header: REQ-04 doesn't ask for one).
  ["workspace_update", "mutates-durable-state"],
]);

/** Workspace catalog entries this pass does not wire, and why — see `features/workspace/agent-tools.ts`'s own per-entry comments for the full reasoning. */
const UNWIRED_WORKSPACE_TOOL_IDS = new Set([
  // EXCLUDED BY DESIGN: inserts a row no other route can ever address (every workspace route
  // resolves strictly against the boot-wired `deps.workspaceId`) — zero utility, non-zero
  // orphaned-row/clutter surface.
  "workspace_create",
  // EXCLUDED BY DESIGN: INV-03-guarded to always refuse today, but the lever removes the only
  // addressable workspace scope the moment that guard's precondition ever changes — whole-scope,
  // no per-domain undo, same exclusion class as `database_execute_migrate_forward`/
  // `backup_execute_restore`.
  "workspace_delete",
]);

export function buildWorkspaceRegistrations(routeDeps: WorkspaceToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    workspace_get: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "workspace.manage", entityType: "workspace" });

      const workspace = await routeDeps.workspaceRepo.findById(routeDeps.workspaceId);
      if (!workspace) {
        // Defensive: the boot-wired workspaceId always resolves to a real row by construction — see
        // `routes/admin/workspace/list.ts`'s identical comment. Not an expected runtime path.
        throw new Error(`workspace '${routeDeps.workspaceId}' was not found`);
      }
      return { workspace };
    },

    workspace_update: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "workspace.manage", entityType: "workspace" });

      // WorkspaceValidationError/WorkspaceConflictError/WorkspaceNotFoundError (all real `Error`
      // subclasses, see `create.ts`) propagate as-is — `ToolExecutor` treats any thrown error as a
      // failed execution, matching every other domain's handler convention of not rewrapping typed
      // domain errors before letting them surface.
      const { workspace } = await updateWorkspace({
        deps: { repo: routeDeps.workspaceRepo },
        input: {
          id: routeDeps.workspaceId,
          name: optionalString(input, "name"),
          slug: optionalString(input, "slug"),
        },
      });
      return { workspace };
    },
  };

  return buildDomainRegistrations({
    domain: "workspace",
    catalogModule: "features/workspace/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: workspaceDerivedRisk,
    unwiredToolIds: UNWIRED_WORKSPACE_TOOL_IDS,
  });
}
