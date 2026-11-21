# REFRESH

- T2 STOP: the existing OTLP callback in `apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts:669–748` is exactly 80 physical lines, meeting the coordinator ruling's STOP threshold. The identity re-seed callback at `:595–667` is 73 lines. No code changed for T2.
- Importer checks: targeted fixed-string lookups covered `initFixture`, `JINI_AGENT_DAEMON_PORT` and `agent-daemon-server`. Other `initFixture` declarations are separate private test fixtures; no equivalent test-only repoints were needed. The daemon entry remains a spawned script; no production importer repoint is needed.
- T4 combine: execute the new invalid-port child case and existing daemon boot/EOF cases, plant the bare-Number mutation, and perform the packaged Electron daemon-start look. Executor runtime results are unavailable because execution is prohibited by the machine rule.
- T2 combine: once the 80-line STOP is resolved, retain the seeded-route, foreign-CWD and real-provider/loopback witnesses, plant the no-sample-content mutation, and collect paired T1/T2 timings on the same linked build plus a completed run.
