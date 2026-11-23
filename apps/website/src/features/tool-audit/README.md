# tool-audit (host storage adapters)

The in-memory sink lives in `@jini-ai/diagnostics/tool-audit/repo.memory`. The durable adapters
stay here because their queries are typed against this site's content database.

## Wiring

- `repo.ts` / `repo.sqlite.ts`: `SqliteToolAttemptAuditSink` over the content db kernel
  (`agent_tool_attempts`), built in `server/runtime/composition/site-deps/route-deps-comments-plugins.ts`.
- `tool-gaps.repo.ts`: `createToolGapReader({ kernel })`, built in the same file.
- In-memory mode binds `createInMemoryToolAttemptAuditSink` from Jini in
  `server/runtime/composition/app.ts` and `agent-daemon-core-deps.ts`.
