# Pattern: Stop must reach writes (abort check before the first write)

## Problem
A tool handler gets `ctx.signal`, but many never read it. The executor (Jini `packages/daemon/src/tool-executor.ts`) checks the signal synchronously right before calling the handler, and the approval wrapper (Jini `packages/core/src/approval.ts` `createApprovalHandler`) checks it right before `run`. So the gap is only an `await` inside the handler that comes BEFORE its first write: if Stop lands during that await, the write still happens, while the executor reports the call as `cancelled` ("handler resolved after the execution was already terminal"). The person is told nothing changed, but it did.

## Rule
In every tool handler (and approval/gated `run`), on every code path: if there is at least one `await` before the first write, put `ctx.signal.throwIfAborted();` on its own line directly above the statement that contains the first write. Exactly one check per code path. Never add a check after a write has started (a half-done multi-step write is worse than a finished one). No `await` before the first write -> no change.

## Mechanism: none new (reuse)
- Check: the platform's `AbortSignal.throwIfAborted()` — already the house idiom (`features/project-keys/tools.ts`, `features/vendor-credentials/abort-guarded-repo.ts`, `deployments/publish-agent-tools.ts`).
- What happens when it throws: the executor's `failureResult` maps ANY rejection while the signal is aborted to `status: 'cancelled'`, so no new error type or message is needed (the person sees the run's normal "stopped" state, not an error).
- Multi-step writes: only the one check before the first write, so a write sequence either never starts or runs to the end, as today. No compensation needed.
- Gated mutations (`gatewayConfirm` then `execute*`): the check goes before the `execute*` domain effect; `gatewayConfirm` only records an approval that expires unused.
- A new helper or Jini change would add nothing: the executor already does the classification. Unit tests for the mechanism are therefore the executor's existing cancel tests; per-site regression tests prove each site.

## Decision table
| Variant | Before | After |
|---|---|---|
| INSERT | `await requireToolPermission(...);`<br>`const { x } = await createX({...});` | `await requireToolPermission(...);`<br>`ctx.signal.throwIfAborted();`<br>`const { x } = await createX({...});` |
| INSERT inside a callback block (`withSchemaOnRejection({ fn: async () => { ... } })`) | the write statement inside `fn` | the check goes inside `fn`, directly above that statement (these wrappers call `fn` synchronously) |
| INSERT where the write is in an expression-bodied callback (`fn: () => setX(...)`, `asToolInput(() => commitX(...))`) | `const r = await withSchemaOnRejection({ ..., fn: () => setX(...) });` | check directly above that whole `const r = await withSchemaOnRejection(` statement |
| INSERT in `return writeX(...)` / `if (...) return writeX(...)` | `return createEmailTemplate({...});` | check directly above the `return` / `if` line |
| INSERT-KEEP-EXISTING (handler already has `if (ctx.signal.aborted) return ...` earlier) | keep that line untouched | add the check above the write as in INSERT |
| INSERT-TWO-PATHS | two branches, each with its own first write | one check above each branch's write statement |
| gated `run: async (ctx, {...}, confirmer) =>` | `const record = await gatewayConfirm(...);`<br>`return executeX({...});` | check directly above `return executeX(` / `const r = await executeX(` |
| SKIP-NO-AWAIT / SKIP-NOT-A-WRITE | — | no change (listed in the prompt) |

The context variable is `ctx` at every listed site (handler param `ctx`, approval `run({ ctx, prepared })`, or gated `run(ctx, ...)`).

## Do NOT
- Do not pass `ctx.signal` into write calls (aborting a write midway is how partial state happens). Do not add checks between writes or inside loops.
- Do not return a custom "cancelled" object; throw via `throwIfAborted()` (the executor reports `cancelled`).
- No `eslint-disable`, `as any`, `!`; do not delete or move comments.

## Verify a site
Re-run `node development/scripts/bug-class-audit.mjs --repo tovu=<clone> --repo jini=<jini clone> --out <tmp>`: an INSERT site disappears from `abort-not-reaching-writes.tsv` (the check now reads the signal with no await between it and the write). SKIP rows stay listed until the audit learns the "no await before the first write" exemption (open item below).

## Known limits (not this pattern)
- Services that read-then-write internally (`createUser`, `importThemeFileFromUrl`: download then write) still have a window inside the service. Closing it means services take `{ signal }` in their optional argument and check before their own write — a separate, per-service change.
- Paid vendor calls before a write (`media_generate_asset`'s `generate(...)`) should receive `ctx.signal` so Stop also stops the spend; separate decision.

## Status 2026-11-13: ready to dispatch
1. Done: two Tovu examples, each red before / green after / red again with the line removed:
   - `members_update_profile`: test appended to `features/members/__tests__/tool-registrations.model-facing-errors.test.ts`; real executor, `authorize` fake aborts the controller; before the fix the result was `cancelled` but the member was renamed.
   - `webhooks_delete_subscription` (INSERT-KEEP-EXISTING): test appended to `features/webhooks/__tests__/agent-tools.delete-confirmation.test.ts`; Stop lands during the post-confirmation re-read; before the fix the subscription ended `disabled`.
   No Jini example was run (same one-line shape; Jini rows are listed with the same variants).
2. Re-checked on Jini main 0.7.1 (`w3-da-main`): the executor checks `controller.signal.aborted` synchronously right before the handler (`daemon/src/tool-executor.ts:625`) and `failureResult` maps any rejection while aborted to `cancelled` (:438); the approval wrapper's `run` checks `ctx.signal.aborted` before `steps.run` (`core/src/approval.ts:162`). The mechanism above holds.
3. Jini rows re-classified from the main audit: 12 INSERT (new vs the stale list: commerce create product/price, credential `setUsername`, plugin install, and `PLAN_TOOL_ID`, whose `handlePlan` awaits several reads before `plans.save`), 16 no-change. `abort-before-write.terra-prompt.md` is READY: 63 sites (12 jini, 51 tovu) + 35 no-change rows.
4. Still open (optional): teach audit check 3 the "no await before the first write" exemption so the no-change rows stop showing.

## Open question for the owner
When a handler finishes a write AFTER Stop, the executor reports `cancelled` even though the write happened. Should it instead report `completed` with a note ("finished after Stop")? This pattern shrinks the window but cannot close it for writes already in flight.
