# features/change-sets

## Wiring

- The agent-tool catalog (`getChangeSetsAgentToolCatalog`, permission and limit constants) lives in `@jini-ai/cms/change-sets/agent-tools`.
- `tool-registrations.ts` (still host-side, a candidate MOVE) builds the registrations over `@jini-ai/cms/core/commands` and binds `@jini-ai/core/tool-metadata/change-sets`; installed by `server/runtime/composition/tool-catalog-manifest.ts`.
