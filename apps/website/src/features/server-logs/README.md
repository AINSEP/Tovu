# server-logs (host binding)

The read, the `system_read_server_logs` catalog and its registration live in
`@jini-ai/diagnostics/server-logs/*` (`read-server-logs`, `agent-tools`, `tool-registrations`);
its tool metadata is `@jini-ai/core/tool-metadata/server-logs`. What stays here binds this
process's log capture.

## Wiring

- `process-source.ts` binds `readProcessServerLogs` (`#src/platform/server-logs`) as the
  `ServerLogSourcePort` the admin server-logs route and the chat tool read.
- `server/runtime/composition/tool-catalog-manifest.ts` registers
  `contributeServerLogsTools({ serverLogs: processServerLogSource })` from
  `@jini-ai/diagnostics/server-logs/tool-registrations`, so the chat tool reads this process's
  log unless its deps carry their own source.
