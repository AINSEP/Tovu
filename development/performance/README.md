# Local UI performance check
Follow [Jini's on-demand recipe](../../../Jini/packages/diagnostics/docs/ui-performance-check.md).
Use a disposable local/staging session with synthetic data only.
Build/publish `@jini-ai/chat` and `@jini-ai/mcp` before consuming the new exports.
In a disposable local `ChatPane` harness, import `createLongTranscriptFixture` from `@jini-ai/chat/testing`.
Seed `initialMessages` with `createLongTranscriptFixture({ turns: 250, toolRowsPerTurn: 15 }, {})`.
Set `toolCallDisplay="show"`; 250 pairs yield 500 messages and 3,750 finished tool rows.
Use the exported DevTools preset and existing agent install planner; Tovu has no launch wiring yet.
Warm up, then trace 50 trusted keys three times; the budget is ≤50 ms per key.
Remove the disposable fixture/draft afterward and keep requested trace artifacts locally.
