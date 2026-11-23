# features/workspace Overview

Workspace module demonstrates a complete vertical slice.

## Files

- `agent-tools.ts`: the host's extension of `@jini-ai/cms/workspace`'s agent-tool catalog (`workspace_list`, `workspace_get`'s `workspaceId` input)
- `tool-registrations.ts`: the host's tool contributor (metadata, model-facing errors, the list projection)
- `__tests__/`: executable tests for slice behavior
- `__specs__/`: human-readable behavioral spec

## Where the rest lives now

- Domain commands, ports and the in-memory repo: `@jini-ai/cms/workspace` (import it directly; the old `index.ts` barrel is gone).
- SQLite repo binding (`SqliteWorkspaceRepo`, `WORKSPACE_TABLES`): `@jini-ai/cms/workspace/site/repo.sqlite`; the host injects its content-kernel eraser as `kernelFor`.
- Admin route specs: `@jini-ai/cms/admin-http/routes/workspace/*`; the host's `RouteDeps` narrowing (`WorkspaceRouteDeps`) lives with its registrars in `server/runtime/composition/modules/workspace.ts`.
