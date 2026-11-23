# server-logs (host binding)

The read and the `system_read_server_logs` catalog live in `@jini-ai/diagnostics/server-logs/*`
(`read-server-logs`, `agent-tools`). What stays here binds this process's log capture.

## Wiring

- `process-source.ts` binds `readProcessServerLogs` (`#src/platform/server-logs`) as the
  `ServerLogSourcePort` the admin server-logs route and the chat tool read.
- `tool-registrations.ts` builds `system_read_server_logs` from the Jini catalog, the host tool
  metadata (`contracts/core/tool-metadata/server-logs.ts`) and `processServerLogSource` as the
  default log source; registered by `server/runtime/composition/tool-catalog-manifest.ts`.
