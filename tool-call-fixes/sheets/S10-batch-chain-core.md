# S10. Batch items for the same target apply in order, each pinned to what the batch itself wrote (C4, M6, Jini core)

Repo: Jini. Package: `core`. Estimate: 160k Sonnet. Prerequisites: none.

## The rule this sheet enforces (judge finding 2)
After item 1 writes, item 2 must be pinned to **the version item 1's own write committed**, reported by that write.
It must never be pinned by reading the target again: a foreign writer who lands between the write and the read
would become the accepted baseline. So the chain has no "re-read" step at all. The host's `run` returns what it
committed; core hands that value to the next item with the same key.

## Read first
`../DESIGN.md` §2.6, M6. `rg -n "export function createPreparedBatchHandler|export function createBatchApprovalHandler" packages/core/src/approval.ts`
(373 lines; the `prepare` loop and the `run` loop) · `rg -n "batchOutcomeFor|BatchItemResult|withBatchInput" packages/core/src/batch-tool-inputs.ts` · their tests.

## Characterization (passes today; answers DESIGN "not verified" item 7)
`core/src/__tests__/approval.batch-same-target.characterization.test.ts`, fake store `{ version, bytes }`:
a prepared batch of three items on one key whose `run` refuses when the pinned version differs → item 1 applied, the
call **throws** item 2's error, item 3 never runs, the thrown text has no per-item account. Record thrown vs returned.

## Red-first (fails: no such function)
`approval-batch-chain.unit.test.ts`, handler from `createChainedBatchHandler({ prepare, run, targetKey, successor }, { targetNoun: 'file' })`.
The fake store's `write` returns the new version; `run` returns `{ output, committed: newVersion }`.
1. three items, one key → all applied in input order; final bytes equal applying them one after another; `successor`
   called twice, each time with the `committed` value of the item before it; the store's `read` is called **zero** times by core.
2. items A1, B1, A2 → B1 keeps its prepare-time pin (`successor` not called for B); A2 gets A1's committed version.
3. distinct keys: `targetKey` receives `{ prepared }` (assert the argument shape) and two items with different keys never chain.
4. foreign write **before** the successor is computed (the fake changes the store inside A1's `run`, after its own
   write returned) → A2 refuses with the host's stale text; A1 stays applied; result
   `[{ index: 0, ok: true }, { index: 1, ok: false, error: <stale text> }]`.
5. foreign write **after** the successor is computed, before A2's `run` → same refusal.
6. foreign write **during asynchronous preparation** (between A1's `prepare` and the first `run`) → A1 refuses; A2 is
   reported `Skipped: an earlier change to this file in the same call failed.`; nothing is written.
7. A1 fails for its own reason → A2 skipped with that exact sentence; B1 still runs.
8. `run` returns `committed: undefined` (it wrote nothing, for example a byte-identical write) → the successor is
   given the predecessor's own pin.
9. abort between items → the existing "abandoned" outcome; nothing after it runs.
10. `createPreparedBatchHandler` and `createBatchApprovalHandler` behave exactly as the characterization (unchanged file section; rerun their existing tests).

## Change
1. New `core/src/approval-batch-chain.ts` (≤ 200 lines; `approval.ts` is not grown), public entry
   `./approval-batch-chain` (`universal`, README §4.9):
   ```ts
   export function createChainedBatchHandler<TPrepared, TCommitted>(
     required: { prepare: PrepareStep<TPrepared>;
                 run(required: { ctx: ToolExecutionContext; prepared: TPrepared }, optional?: object): Promise<{ output: unknown; committed: TCommitted | undefined }>;
                 targetKey(required: { prepared: TPrepared }): string;
                 successor(required: { prepared: TPrepared; committed: TCommitted | undefined; previous: TPrepared }): TPrepared },
     optional?: { maxItems?: number; targetNoun?: string }): ToolHandler;
   ```
   It reuses the approval owner's input snapshot, item cap, duplicate detection and cancellation checks by calling the
   existing exported pieces; if a needed piece is not exported from `approval.ts`, export that one function (no copy).
   `successor` is synchronous and must not do I/O (doc comment says why: finding 2).
2. A single (non-batch) call returns `output` unchanged in shape. A batch returns `BatchResult` shape
   (`{ batch: true, total, results: [{ index, ok, … }] }`) so `batchOutcomeFor` reports `partial_failure` / `error`.
3. The asking variant (`createBatchApprovalHandler`) is not touched: a person approved a description computed from
   the first bytes, so chaining there needs its own design.

## Acceptance
Ten cases green with exact text; the "Duplicate batch inputs are not allowed." refusal still fires; gate green; counts recorded; new export listed for REL.
