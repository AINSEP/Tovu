/**
 * @file Public surface (barrel) for `workspace` — re-exported from `@jini-ai/cms/workspace`.
 *
 * The domain moved into the package on 2026-08-03 so a second host can use the same
 * create/update/delete transitions, the `WorkspaceRepoPort` contract, and the agent-tool catalog.
 * What is left in this directory is only what is genuinely this host's:
 *
 * - `repo.sqlite.ts` — the Drizzle adapter. It names `db/schema.ts`, this repo's shared
 *   1,246-line schema covering every domain, so it is host persistence, not library code.
 * - `tool-registrations.ts` — a re-export shim; see that file's own header for why it stays.
 * - `INFO.md` / `__specs__/` — this host's requirement documents (SPEC-044). They describe the
 *   host's routes and acceptance criteria, not a library contract, so they stay with the host.
 *
 * The `SqliteWorkspaceRepo` re-export below is deliberate, and unlike `settings`' barrel, which
 * drops its adapter: `server/deps.ts` already imports the adapter from this barrel, and the four
 * concurrent extraction branches all touch `deps.ts`. Preserving this host-internal export keeps
 * the composition root untouched. The *package* barrel correctly omits every SQLite adapter.
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
export {
  getWorkspaceAgentToolCatalog,
  type WorkspaceAgentToolDefinition,
  type WorkspaceAgentToolSideEffect,
  type WorkspaceAgentToolActorClassRule,
} from "@jini-ai/cms/workspace";

export { SqliteWorkspaceRepo } from "./repo.sqlite";
