# tool-audit (host storage bindings)

The in-memory sink lives in `@jini-ai/diagnostics/tool-audit/repo.memory`; the durable SQL sink
(`SqlToolAttemptAuditSink`, `@jini-ai/diagnostics/tool-audit/repo`) and the tool-gap reader
(`createToolGapReader`, `@jini-ai/diagnostics/tool-audit/tool-gaps.repo`) live in Jini too. This
folder keeps only the SQLite binding that supplies what those adapters need from this site.

## Wiring

- `repo.sqlite.ts` binds, for both Jini SQL adapters:
  - `kernel`: `schemaErasedKernel({ store })` over the content db kernel/handle;
  - `tables`: `TOOL_ATTEMPT_TABLES` (`{ toolAttempts: "agent_tool_attempts" }`);
  - `onError` (sink): `logToolAuditAppendFailure` (`console.error("[tool-audit] append failed", error)`)
    unless the caller passes its own;
  - `toolGapAuditId` / `decodeToolGapEntry` (reader): `TOOL_GAP_AUDIT_ID` / `decodeToolGapEntry`
    from `@jini-ai/daemon/tool-audit`.
- `SqliteToolAttemptAuditSink` is built in `server/runtime/composition/site-deps/route-deps-comments-plugins.ts`
  (with `onError` bound to the site's `reportToolAuditError`) and in
  `server/runtime/composition/agent-daemon-core-deps.ts` (default reporter).
- `createSqliteToolGapReader({ store })` is built in `route-deps-comments-plugins.ts`.
- In-memory mode binds `createInMemoryToolAttemptAuditSink` from Jini in
  `server/runtime/composition/app.ts` and `agent-daemon-core-deps.ts`.
