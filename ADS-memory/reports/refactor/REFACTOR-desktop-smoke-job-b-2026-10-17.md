# Desktop smoke complexity refactor — job B

Refactor(Execution): Refactor persona loaded to extract helpers without changing behavior.

Inputs: peer dispatch for todo 3027; `AI-Dev-Shop/AGENTS.md`; Refactor persona;
architecture sections 13 and 14; project memory; desktop manifests, smoke scripts,
source, tests and complexity gate/debt; sibling Jini daemon probe and platform process source.
No separate spec version/hash was supplied; the dispatched scope is the work contract.

Type F — complexity debt. Local extractions preserve the existing owners, public signatures,
diagnostics, validation order, retry bounds, timeouts and cancellation. No dependencies added.
The CLI layout comment moved with its implementation; other why comments remain with their code.

## Function results

Before values come from the supplied debt list. After values are expected from manual source
review, not measured: the dispatch explicitly forbids lint, tests, typecheck and builds.

| Function | Metric | Before → expected after | Extracted helper |
| --- | --- | --- | --- |
| `scripts/smoke-bridge.ts:main` | Cyclomatic | 14 → 3 | `resolveBridgeSmokeTargets` |
| `src/smoke-bridge.ts:parseJiniEntries` map callback | Cyclomatic | 11 → 7 | `parseJiniEntryEnv` |
| `scripts/smoke-packaged-chat.ts:signalGroupUntilGone` | Cognitive | 13 → 8 | `signalPackagedChatGroup` |
| `scripts/smoke-packaged-chat.ts:waitForClaudeModel` | Cognitive | 11 → 3 | `readPackagedChatModel` |
| `src/smoke-packaged-chat.ts:assertPackagedChatEvidence` | Cyclomatic | 10 → 7 | `assertPackagedSiteGuideResult` |

All five corresponding debt entries were removed; all other entries were retained.
New helpers use `(requiredObject, optionalObject = {})` and have explicit return types.
Each has direct unit tests written in the existing smoke test files, with failure assertions.

## Reuse decisions

Graph MCP tools were unavailable; discovery used `rg` and source reads. The desktop target has
371 files, below the Refactor persona's optional Graphify threshold. No new analysis tooling
was implemented.

- Reuse: bridge target selection; searched desktop smoke/isolated target code and release callers;
  inspected `smoke-native.ts:resolveSmokeTargets`, script `main`, and `packaged-gate-isolation.ts`;
  used existing native resolver with the original app-specific CLI adapter extracted locally;
  owner record: existing smoke script, no ownership change.
- Reuse: resolver environment validation; searched Tovu smoke/resolver callers and Jini daemon/MCP
  sources for `release-smoke` and `probeMcpBridge`; inspected `parseJiniEntries`,
  `buildJiniEntryScript`, and Jini `mcp-bridge-probe.ts`; used the existing fixed release-entry
  validation extracted as `parseJiniEntryEnv`. The probe only initializes and changes run identity;
  it does not satisfy the gate's tool roster contract. The existing probe lifecycle is unchanged.
- Reuse: shutdown signal policy; searched Jini platform process code for group/ESRCH/EPERM;
  inspected `signalProcesses`, `stopProcesses`, and this script's group teardown;
  extracted the existing ESRCH/EPERM policy with an injected signaling port. Jini's existing
  per-PID policy tolerates only ESRCH. Migration is recorded in
  `ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md`; Jini is outside writable roots.
- Reuse: discovery polling response policy; searched desktop and Jini daemon/MCP sources for
  discovery pending and packaged chat handling; inspected `waitForClaudeModel` and
  `selectPackagedChatModel`; extracted response interpretation and retained the existing model
  selector. Retry timing, fetch cancellation and authentication remain in the script.
- Reuse: durable overview result validation; searched packaged chat evidence and existing tests;
  inspected `assertPackagedChatEvidence`, `eventsFrom`, and `rawFrames`; extracted the existing
  first matching result check, retaining Tovu's `site_guide` contract and diagnostic precedence.

## Handoff

CHANGED FILES:

- `apps/desktop/scripts/smoke-bridge.ts`
- `apps/desktop/src/smoke-bridge.ts`
- `apps/desktop/src/smoke-bridge.test.ts`
- `apps/desktop/scripts/smoke-packaged-chat.ts`
- `apps/desktop/src/smoke-packaged-chat.ts`
- `apps/desktop/src/smoke-packaged-chat.test.ts`
- `apps/desktop/complexity-debt.json`
- `ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md` (local backlog)
- This report.

NOT DONE: tests, lint/complexity gate, typecheck, builds and commits, as instructed.
Jini process-group migration remains a follow-up. Runtime equivalence and expected complexity
values are unverified by execution. Renderer files were not touched. Concurrent changes to other
desktop modules were observed and left alone.

Suggested next assignee: Coordinator to review this diff and arrange verification when authorized.
