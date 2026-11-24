# features/change-sets

## Wiring

- The agent-tool catalog (`getChangeSetsAgentToolCatalog`, permission and limit constants) lives in `@jini-ai/cms/change-sets/agent-tools`.
- The registrations (`contributeChangeSetsTools`, `buildChangeSetsRegistrations`, `toChangeSetView`, `ChangeSetToolDeps`) live in `@jini-ai/cms/change-sets/tool-registrations`. The host binds `ChangeSetToolDeps` (authorize, workspace id, change-set repo, the shared revert registry, clock, id generator, outbox) from its route-deps bag; installed by `server/runtime/composition/tool-catalog-manifest.ts`. `server/inbound/admin-http/http/change-sets.ts` reuses `toChangeSetView`.
