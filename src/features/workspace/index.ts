/**
 * Barrel exports for workspace feature slice and local adapters.
 */
export {
  createWorkspace,
  WorkspaceConflictError,
  WorkspaceValidationError,
  type CreateWorkspaceDeps,
  type CreateWorkspaceInput,
  type WorkspaceRecord,
  type WorkspaceRepoPort,
} from "./create";
export { InMemoryWorkspaceRepo } from "./repo.memory";
export { SqliteWorkspaceRepo } from "./repo.sqlite";
