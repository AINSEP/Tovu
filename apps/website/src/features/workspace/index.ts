/**
 * @file Public surface (barrel) for `workspace` — re-exported from `@jini-ai/cms/workspace`.
 *
 * Jini owns workspace transitions, repository contracts and the tool catalog. SQLite persistence
 * and SPEC-044 route requirements stay host-owned. The registration shim follows the assistant's
 * uniform domain import convention.
 * `SqliteWorkspaceRepo` is exported here for the host composition root (`server/deps.ts`);
 * the package barrel omits SQLite adapters.
 */
export {
  createWorkspace,
  validateWorkspaceNameAndSlug,
  WorkspaceConflictError,
  WorkspaceLastRemainingError,
  WorkspaceNotFoundError,
  WorkspaceValidationError,
  type CreateWorkspaceDeps,
  type CreateWorkspaceInput,
  type CreateWorkspaceRequired,
  type CreateWorkspaceOptional,
  type WorkspaceRecord,
  type WorkspaceRepoPort,
  updateWorkspace,
  type UpdateWorkspaceDeps,
  type UpdateWorkspaceInput,
  type UpdateWorkspaceRequired,
  deleteWorkspace,
  type DeleteWorkspaceDeps,
  type DeleteWorkspaceInput,
  type DeleteWorkspaceRequired,
  InMemoryWorkspaceRepo,
} from "@jini-ai/cms/workspace";

/** The agent-tool catalog for this domain (see the package's `agent-tools.ts` for what is omitted). */
export { getWorkspaceAgentToolCatalog } from "@jini-ai/cms/workspace";
export type { AgentToolDefinition as WorkspaceAgentToolDefinition, AgentToolSideEffect as WorkspaceAgentToolSideEffect, AgentToolActorClassRule as WorkspaceAgentToolActorClassRule } from "@jini-ai/core";

export { SqliteWorkspaceRepo } from "./repo.sqlite.js";
