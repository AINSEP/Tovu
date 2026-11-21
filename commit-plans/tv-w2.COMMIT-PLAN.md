# codex/tv-w2 commit plan

Base: integ/merge-8 `8d613439cc36f9093e7487f3ed9e698adc77acd6`. Published reference: Jini `origin/integ/merge-9-2026-11-21`. No checks run or git writes, per dispatch; coordinator owns staging and verification.

## AG0-T — done

Files: delete `apps/website/src/server/runtime/composition/modules/__tests__/assistant-ag-ui.wire.unit.test.ts`.
Tests deleted: `wire payload fields coerce: absent is empty, structured is JSON, and a status detail is optional`; `only a tool-turn-limit stop gets a visible notice`.
Every assertion verified by git show against the published Jini reference (paths below relative to `packages/chat/src/core/`):

| Deleted host line / assertion | Jini counterpart |
| --- | --- |
| 18: structured status label becomes JSON; absent detail omitted | `run-events/__tests__/frames.test.ts:39–41`; `run-events/__tests__/payload.test.ts:13–15` |
| 19: numeric status detail becomes a string | `run-events/__tests__/frames.test.ts:39–41` |
| 20: missing text delta becomes empty text | `run-events/__tests__/payload.test.ts:24–25` |
| 21: null tool result content becomes empty; truthy isError becomes true | `run-events/__tests__/payload.test.ts:68–69` |
| 22: raw line passes through | `run-events/__tests__/payload.test.ts:192–193` |
| 23: thinking_start becomes null | `run-events/__tests__/payload.test.ts:206–207` |
| 25 (payload declared at 24): unknown type becomes ext carrying the whole payload | `run-events/__tests__/payload.test.ts:211–221` |
| 29: end_turn yields no notice | `run-events/__tests__/frames.test.ts:62–63`; `ag-ui/__tests__/translation.test.ts:90–93` |
| 30: max_tool_turns yields a status notice | `ag-ui/__tests__/translation.test.ts:90–95` |

Combine owes mutation: admit `end_turn` in Jini's limit check. `assistant-ag-ui-translate.test.ts` remains unchanged. `development/why-comments-debt.json:278` names the deleted file in prose; leave untouched, combine owns cleanup. No API/debt edits. Diff re-read deletions: only the prescribed file.

## TV-AG1 — STOPPED

Base: `8d613439cc`. No files touched; unchanged witnesses: `assistant-ag-ui-wire.golden.test.ts`, `assistant-ag-ui-routes.test.ts`.
Jini exports `drainRunFramesToAgUi` through `@jini-ai/chat/core/ag-ui` with the required context, and the named host grep has no external hits. However `packages/chat/src/core/ag-ui/event-projection.ts:262–268` adds a pendingApproval interrupt terminal wire path absent from the host drain (`apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts:290–292`). This triggers the explicit wire-change STOP. Also Jini no longer ends the response, while the host has no `res.end()` after its call at line 389; following the sheet literally would leave the response open.
Combine owes reconsideration of wire preservation/response ending; terminal-event and wrong-reader mutations; Chrome admin canary, disconnect and Stop; catch-reads-error baseline refresh. Deletions: none.

## T1-perfobs — STOPPED

Base: `8d613439cc`. No files/tests touched. Published `packages/daemon/src/tool-recovery/stack.ts:65–66` has both required fields and composes observation once for a non-no-op port. The prescribed `createAssistantToolExecutor` search found an unlisted production re-export at `apps/website/src/assistant/agent-daemon-port.ts:65`, triggering the dispatch's unlisted-production-importer STOP. No executor layers changed.
Combine owes resolving that importer scope, the registered BYOK observation/live-gate tests, and omit-forwarding/snapshot-gate mutations. No new debt fields or manifest edits. Deletions: none.

## I2-T — done

Base: `8d613439cc`.
Files touched:

- `apps/website/src/platform/db/repos/media-repo.ts`
- `apps/website/src/server/inbound/admin-http/routes/media/byte-size.ts`
- `apps/website/src/server/inbound/admin-http/routes/media/__tests__/byte-size.test.ts`
- `apps/website/src/features/media/__tests__/repo.contract.test.ts`

Tests written and read back BEFORE source edits; not run, per machine rule. Red reason: the old implementation calls `findByHash` once per distinct hash, never the single workspace-scoped `list` batch asserted by the replacement fixture; the old SQL list also ignores the supplied hash filter.
Tests changed:

- `media sizes read returned distinct hashes in one workspace batch and keep eight stats in flight` (renamed from `media sizes visit only returned distinct hashes and keep eight original-blob lookups in flight`)
- `media sizes preserve zero and isolate missing rows, missing files, and storage errors` (also checks failed batch lookup leaves all sizes null)
- `older blob adapters report null without payload or repository I/O; empty pages do nothing` (empty page has sizeOf capability, absent-capability case remains nonempty)
Test added, one SQL case on each existing dialect: `[sqlite/pglite] blob list filters hashes within the requested workspace` (same hash in two workspaces plus an unrelated hash).

Verified published `packages/cms/src/media/ports.ts:47` matches the sheet. SQL uses the existing cross-dialect IN-query pattern, retains workspace filtering and the mapper, and adds no casts or page splitting. Existing importer list matches the sheet. Unknown sizes stay null, including failed batch reads; zero stays zero; eight-worker stats remain. The existing `_optional: Record<string, never> = {}` pad and isolated-stat debt row remain unchanged. Files exceed 500 lines: `media-repo.ts` 724, `repo.contract.test.ts` 740; continue per owner rule.
Combine owes mutations: restore per-hash reads; remove workspace predicate; make zero unknown. Run both suites against released lockfiles and check test-safety/error gates; no error-gate-debt edits here. Deletions: per-hash repository lookup replaced by one list call; obsolete per-hash repo-error fixture replaced by failed-batch expectation. Diff re-read deletions beyond these: none.

## RD-T2 — done (test-only)

Base: `8d613439cc`.
Files touched: `apps/website/src/assistant/__tests__/credential-chat-intake.unit.test.ts`, `apps/website/src/assistant/__tests__/credential-noise.unit.test.ts`.
Verified `apps/website/src/assistant/credential-chat-intake.ts:2,32` uses `redactUserText` from `@jini-ai/chat/core` for history. No source edits.
Tests changed:

- `a plain URL message is not a credential paste, even when earlier history in the cold-start context held a key-shaped value` (DKIM survives; existing two-line comment no longer claims removal)
- `real keys in the current prompt are still caught and still get the card note` (second positive has sk- prefix)
- `public DKIM history cannot flag a current public deployment URL as a paste` (DKIM survives)
URL keep-cases, secretRedacted and notice assertions remain unchanged. Noise comment does not claim DKIM removal and stays unchanged. No new tests/scaffolding.
Combine owes both suites on the 0.7.3-next.1 lock and reverts this sheet if either was already green before flipping. No additional mutation/Chrome/gate row specified. Deletions: none; diff re-read deletions beyond prescribed replacements: none.
