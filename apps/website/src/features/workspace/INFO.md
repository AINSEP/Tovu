# features/workspace Overview

Workspace module demonstrates a complete vertical slice.

## Files

- `__tests__/`: executable tests for slice behavior
- `__specs__/`: human-readable behavioral spec

## Where the rest lives now

- Domain commands, ports and the in-memory repo: `@jini-ai/cms/workspace` (import it directly; the old `index.ts` barrel is gone).
- SQLite repo binding (`SqliteWorkspaceRepo`, `WORKSPACE_TABLES`): `@jini-ai/cms/workspace/site/repo.sqlite`; the host injects its content-kernel eraser as `kernelFor`.
- Admin route specs: `@jini-ai/cms/admin-http/routes/workspace/*`; the host's `RouteDeps` narrowing (`WorkspaceRouteDeps`) lives with its registrars in `server/runtime/composition/modules/workspace.ts`.
- Agent-tool catalog and registrations, including `workspace_list` and `workspace_get`'s `workspaceId` input: `@jini-ai/cms/workspace`.
- Tool contributor (`contributeWorkspaceTools`: metadata, model-facing errors): `@jini-ai/cms/workspace/site/tool-registrations`; registration declarations: `@jini-ai/core/tool-metadata/workspace`. `__tests__/tool-registrations.list.test.ts` stays here as the host card parity proof.
