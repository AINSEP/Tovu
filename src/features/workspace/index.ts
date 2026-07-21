/**
 * Barrel exports for workspace feature slice and local adapters.
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
  type WorkspaceRecord,
  type WorkspaceRepoPort,
} from "./create";
export { updateWorkspace, type UpdateWorkspaceDeps, type UpdateWorkspaceInput } from "./update";
export { deleteWorkspace, type DeleteWorkspaceDeps, type DeleteWorkspaceInput } from "./delete";
export { InMemoryWorkspaceRepo } from "./repo.memory";
export { SqliteWorkspaceRepo } from "./repo.sqlite";
