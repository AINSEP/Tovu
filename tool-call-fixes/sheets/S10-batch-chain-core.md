# S10. Batch items for the same target apply in order (C4, mechanism M6, Jini core)

Repo: Jini. Package: `core`. Estimate: 150k Sonnet. Prerequisites: none.

## Read first
`../DESIGN.md` §2.6, M6. `core/src/approval.ts` (`createPreparedBatchHandler`, `createBatchApprovalHandler`: the
`prepare` loop and the `run` loop), `core/src/batch-tool-inputs.ts` (`withBatchInput` plan mode, `batchOutcomeFor`,
`BatchItemResult`), existing tests for both.

## Characterization (passes today; this also answers DESIGN "not verified" item 7)
`core/src/__tests__/approval.batch-same-target.characterization.test.ts` with a fake store `{ version, bytes }`:
a prepared batch of three items on one key where `run` refuses when the pinned version differs →
item 1 applied, the call **throws** the item-2 error, item 3 never runs, and the thrown text gives no per-item account.
Record the exact shape (thrown vs returned) in the report.

## Red-first (fails: item 2 refuses)
`approval.batch-chain.unit.test.ts`, handler built with `chain: { targetKey, repin }`:
1. three items, one key → all three applied in input order; final bytes equal applying them one after another; `repin` called twice.
2. items A1, B1, A2 → B1 uses its prepare-time pin (`repin` not called for B); A2 re-pinned.
3. a foreign change to A between A1 and A2 (the fake bumps the version after `repin`) → A2 refuses with the handler's own stale text; A1 stays applied; the result lists `[{ index: 0, ok: true }, { index: 1, ok: false, error: … }]`.
4. A1 fails → A2 is not run and reports exactly `Skipped: an earlier change to this file in the same call failed.`; B1 still runs.
5. no `chain` option → behaviour identical to the characterization (old callers unchanged).
6. abort between items → the existing "abandoned" outcome, nothing after it runs.

## Change
1. `createPreparedBatchHandler(steps, { maxItems, chain })`. The chained run loop lives in a new `core/src/approval-batch-chain.ts` (approval.ts is 373 lines; keep it under 400).
2. With `chain`, the run returns per-item results in `BatchResult` shape (`{ batch: true, total, results: [{ index, ok, … }] }`) so `batchOutcomeFor` reports `partial_failure` / `error`. Without `chain`, nothing changes.
3. `createBatchApprovalHandler` (the asking variant) does **not** accept `chain`. Add a type-level test (`@ts-expect-error`) so nobody adds it without a design.
4. The generic text in step 4 above lives in core and takes the target noun from the host (`chain.targetNoun`, default `target`): `…change to this ${noun}…`.

## Acceptance
Six cases green with exact text; the "duplicate batch inputs" refusal still fires for identical items; `core` tests, `pnpm guard`, `pnpm typecheck` green; counts recorded.
