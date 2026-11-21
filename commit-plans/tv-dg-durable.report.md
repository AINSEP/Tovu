Implemented 8A → 8B → 3E → 10A; changes remain uncommitted.

- **8A done:** added `development/scripts/__tests__/persisted-names.test.ts`, `persisted-names.json`, and the README rule. The live-value test initially lacks its registry. Required Jini package baseline verification remains pending.
- **8B done:** extended the same test file with the private comparator, four inline cases and `SEMGREP_BASE` target gate. Cases were written before the comparator; historical/unregistered migrations and wrong-old-value cutovers must fail.
- **3E done:** added one native IPC case in `apps/desktop/src/desktop-agent-service.test.ts`, covering refusal, replacement fields and malformed registration. It pins the existing contract; the named mutations must make it fail.
- **10A done:** added the replay fixture/case in the SQLite delivery test and the requested sentence in `delivery.ts`. It pins lost settlement, reclaim, fencing and receiver deduplication; named mutations remain owed.

No tests, builds, installs, type checks or linters ran. Existing pads and signatures are intact. Diff-review deletion: removed the fixture’s subscription-specific URL suffix so both subscriptions share one destination.

[COMMIT-PLAN.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-dg-durable/COMMIT-PLAN.md) records each sheet, base, files, mutations and API delta. [REFRESH.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-dg-durable/REFRESH.md) records missing installed payloads, unresolved merge-9 ref, target-gate execution and the Electron check.
