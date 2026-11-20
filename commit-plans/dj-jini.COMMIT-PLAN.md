# Jini error-debt cull — base merge-6 (d3e78b387)

Implementation only; no tests, mutations, builds, installs, type checks, linters, commits, or pushes run. No public API changes or changesets. Existing tests stay unchanged; the combine owner runs the witnesses and mutations below. Importer repoints: none; REFRESH.md not needed.

## J1 — done

- File: `packages/admin/src/widgets/controllers/region-editor.controller.ts`.
- Applied the cull's inline `orFallback` replacement in `addPlacement`; success body and why-comment unchanged. `orFallback` accepts the existing `Promise<void>` work and `undefined` fallback without a cast. No `lookup` binding.
- Symbol check: existing widget entry, hook, and tests only; no unlisted production importer.
- Witness: `packages/admin/src/widgets/__tests__/region-editor.controller.unit.test.ts:76,85` (successful title/type update and failed lookup retaining the untitled draft).
- Combine mutations: drop the success update; remove rejection handling so the failed lookup becomes unhandled.
- Ledger key assigned to J8: ordinal 46.
- Files over 500 lines: none. Out-of-scope diff deletions: none.

## J2 — done

- File: `packages/chat/src/core/assistant-client/attachment-liveness.ts`.
- Replaced only the probe's outer catch with `orFallback`; request, `response.ok`, and moved why-comment retained. Timeout, cap, options, and reference admission unchanged.
- Symbol checks: private probe is local; validator uses only its existing entry and tests. No importer repoints.
- Witness: `packages/chat/src/core/assistant-client/__tests__/delivery-and-liveness.test.ts:107,126` (HEAD/status/order and failed/timed-out probes).
- Combine mutations: accept a non-2xx response; let a probe rejection escape.
- Ledger key assigned to J8: ordinal 128.
- Files over 500 lines: none. Out-of-scope diff deletions: none.

## J3 — done

- File: `packages/cms/src/widgets/date-label.ts`.
- Bound `siteTimeZone` for closure narrowing and put the read plus normalization in `orFallback`; early UTC return retained. Separate `normalizeTimeZone` refusal unchanged.
- Symbol check: only the listed recent-entries resolver, post-content context, and tests; no importer repoints.
- Witness: `packages/cms/src/widgets/__tests__/unit/date-label.unit.test.ts:58–66` (valid/invalid zones, absent port, rejected read).
- Combine mutations: remove resolved-branch normalization; propagate a rejected read.
- Ledger key assigned to J8: ordinal 191.
- Files over 500 lines: none. Out-of-scope diff deletions: none.

## J4 — done

- File: `packages/daemon/src/agent-executor/live-session-state.ts`.
- Limited `frameRecord`'s try to `value = JSON.parse(line)`; unchanged catch return and record test now outside the try. Observer and receipt logic unchanged.
- Symbol checks: `frameRecord` is local; session imports match the listed child-input module and three test files. No importer repoints.
- Witness: `packages/daemon/src/agent-executor/__tests__/live-session-state.test.ts:41–49` (malformed/non-record frames and unrelated UUIDs leave input pending until a valid receipt).
- Combine mutation: propagate the JSON `SyntaxError`.
- Ledger key assigned to J8: ordinal 241.
- Files over 500 lines: none. Out-of-scope diff deletions: none.

## J5 — done

- Files: `packages/ui/src/features/panel-kit/fetch-query/adapter.react.tsx`, `packages/ui/src/features/panel-kit/fetch-query/adapter.tanstack.tsx`.
- Replaced only each discarded-promise catch with `observed({ promise })`; comments, original returned promise, mutation state, and invalidation timing unchanged.
- Symbol check: other same-name hooks are binding/kit declarations and their consumers; no unlisted importer of either changed adapter implementation. Existing entries unchanged; no repoints.
- Witness: `packages/ui/src/features/panel-kit/fetch-query/__tests__/fetch-query.test.tsx:528,588`, within the existing loop covering both providers (discarded rejection handled, awaiting caller gets rejection).
- Combine mutations: remove observation in each adapter separately; return a settlement promise instead of the original promise.
- Ledger keys assigned to J8: ordinals 512–513.
- Files over 500 lines: none. Out-of-scope diff deletions: none.

## J6 — done

- File: `packages/commerce/src/payments/ledger/repo.memory.ts`.
- Changed only the tail assignment to `afterSettled({ promise: run })` plus its import. `tail: Promise<unknown>` accepts `Promise<void>` without a cast. Returned `run`, FIFO comment, rollback, reentrancy, snapshots, SQL ledger, and async context unchanged. No new test.
- Symbol check: additional references beyond the sheet's tests are test-only; no unlisted production importer. Kernel entry unchanged; no repoints.
- Witness: `packages/commerce/src/payments/ledger/__tests__/ledger-contract.ts:864–880`, exercised by `memory.vitest.test.ts:6` (original rejection, rollback, and next transaction); existing FIFO case at `memory.vitest.test.ts:22` retained.
- Combine mutations: set `tail = run`; return the settlement promise instead of `run`.
- Ledger key assigned to J8: ordinal 209.
- Files over 500 lines: none. Out-of-scope diff deletions: none.

## J7 — done

- File: `packages/oauth/src/registration-cache.ts`.
- Replaced the pending-registration catch with the named `pending` binding and guarded `await afterSettled({ promise: pending })`. Existing comment, key construction, deletion, registration, file cache, and retry handling unchanged. No new test.
- Symbol check: existing index export and tests only; no unlisted production importer or repoints.
- Witness: `packages/oauth/tests/dynamic-registration.test.ts:177` (invalidation waits for an outstanding registration cache write).
- Combine mutations: bypass the wait; await the rejecting pending promise directly so deletion is skipped. The latter uses the cut design case's rejected-write scenario; no new test was added, as required by the cull.
- Ledger key assigned to J8: ordinal 407.
- Files over 500 lines: none. Out-of-scope diff deletions: none.

## J8 — done last

- File: `scripts/error-gate-debt.json`; all seven source sheets finished before this edit.
- All 21 pinned ordinals matched their exact file/rule keys. Removed eight fixed keys and 13 DONE-STALE keys, totaling 27 recorded findings. Surviving keys, values, and order retained: 559 → 538 keys; 978 → 951 recorded findings.
- Static stale-site review: form-editor, claude-stream, and version-manager have no catch; both ai-trace files are absent; EntityEdit has no denied generic failure literal; entity-edit and json-event-stream have pure JSON parses; remaining entity-edit, MCP bridge, frontend request/session, and memory-connectors catches bind and read/pass the caught error. The memory-connectors catch contains no inline failure text.
- Combine witness: compare parent/candidate gate listings for assigned files and the deletion-only ledger diff. Negative mutation: restore an assigned catch while keeping its ledger key deleted; it must register as new debt. Existing unrelated baseline failures, including accepted EXDEV debt, are outside this batch. No gate or mutation was run here.
- File over 500 lines: `scripts/error-gate-debt.json` (2,692 lines after removal); continued as directed.
- Out-of-scope diff deletions: none. The culled `lookup` binding and new J6/J7 tests were never added. No other ledger, baseline, manifest, test, or public entry was edited.

Removed keys (base ordinals; exact file/rule):

| Ordinal | Sheet | File | Rule | Findings |
| --- | --- | --- | --- | --- |
| 9 | J8 DONE-STALE | `packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts` | `catch-reads-error` | 3 |
| 21 | J8 DONE-STALE | `packages/admin/src/react/entities/EntityEdit.tsx` | `no-generic-failure-text` | 1 |
| 22 | J8 DONE-STALE | `packages/admin/src/react/entities/use-entity-edit.ts` | `catch-reads-error` | 1 |
| 46 | J1 | `packages/admin/src/widgets/controllers/region-editor.controller.ts` | `catch-reads-error` | 1 |
| 90 | J8 DONE-STALE | `packages/agent-runtime/src/ai-trace/capture.ts` | `catch-reads-error` | 1 |
| 91 | J8 DONE-STALE | `packages/agent-runtime/src/ai-trace/sinks.ts` | `catch-reads-error` | 1 |
| 96 | J8 DONE-STALE | `packages/agent-runtime/src/claude-stream.ts` | `catch-reads-error` | 1 |
| 103 | J8 DONE-STALE | `packages/agent-runtime/src/json-event-stream.ts` | `catch-reads-error` | 1 |
| 128 | J2 | `packages/chat/src/core/assistant-client/attachment-liveness.ts` | `catch-reads-error` | 1 |
| 191 | J3 | `packages/cms/src/widgets/date-label.ts` | `catch-reads-error` | 1 |
| 209 | J6 | `packages/commerce/src/payments/ledger/repo.memory.ts` | `catch-reads-error` | 1 |
| 241 | J4 | `packages/daemon/src/agent-executor/live-session-state.ts` | `catch-reads-error` | 1 |
| 243 | J8 DONE-STALE | `packages/daemon/src/agent-executor/mcp-bridge.ts` | `catch-reads-error` | 1 |
| 258 | J8 DONE-STALE | `packages/daemon/src/http/frontend-request-route.ts` | `catch-reads-error` | 1 |
| 259 | J8 DONE-STALE | `packages/daemon/src/http/frontend-sessions.ts` | `catch-reads-error` | 1 |
| 407 | J7 | `packages/oauth/src/registration-cache.ts` | `catch-reads-error` | 1 |
| 505 | J8 DONE-STALE | `packages/ui/src/features/memory/react/hooks/useMemoryConnectors.hooks.ts` | `catch-reads-error` | 3 |
| 506 | J8 DONE-STALE | `packages/ui/src/features/memory/react/hooks/useMemoryConnectors.hooks.ts` | `failure-text-from-catalog` | 3 |
| 512 | J5 | `packages/ui/src/features/panel-kit/fetch-query/adapter.react.tsx` | `catch-reads-error` | 1 |
| 513 | J5 | `packages/ui/src/features/panel-kit/fetch-query/adapter.tanstack.tsx` | `catch-reads-error` | 1 |
| 527 | J8 DONE-STALE | `packages/ui/src/features/version-manager/react/hooks/useVersionManager.ts` | `catch-reads-error` | 1 |
