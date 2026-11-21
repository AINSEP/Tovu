# Refresh notes

- T1-perfobs — importer, unchanged signature: `apps/website/src/assistant/agent-daemon-port.ts:65` re-exports `createAssistantToolExecutor` directly. The sheet only adds optional dependency fields; the existing re-export and its callers need no mechanical edit, parameter, or new logic.
- T1-perfobs — existing test importers need no repoint or signature refresh. Runtime verification and the two named mutations are owed to the combine as recorded in `COMMIT-PLAN.md`.
