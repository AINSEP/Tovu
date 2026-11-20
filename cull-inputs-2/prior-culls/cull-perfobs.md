# Cull of r62t-perfobs sheets (over-engineering judge)

Input: `o-r62t-perfobs/r62t-perfobs.md`. Bases: Tovu `c-r62t-perfobs` merge-6 `776ce6d0f` plus pushed `origin/codex/{tv-xd5-publish,tv-tq}`; Jini `ro-m6-jini` `d3e78b387`. Read-only. I checked the anchors with file reads and single-symbol `git grep`.

Counts (13 sheets): **KEEP 4** (J1, J2, J3, T1) / **CUT-TO 5** (T2, T4, T5, T6, T7) / **DROP 4** (J4, J5, J6, T3) / **NEEDS-DECISION 1** (M5 browser receiver, carried over).

PARTIAL / RETIRE rows (M1 other paths, M2 plugin/depth, M3 wiring, M4, M6 other schedulers, I1 lazy = RETIRE, I1 paging, I2 ×3): I agree they are not Codex-ready. **I1 cursor paging** and **I2 byte-size batch lookup** are the two owner-visible perf items left. Each needs its own re-sheet. The design gives only acceptance anchors.

## Two rules applied across the Tovu sheets

1. **No `root: true` (J4 dropped).** `createServingApp` (`serving-app.ts:70–114`) starts every loop at boot, outside any span. A timer pass therefore already has no parent and is a root. A pass triggered from a request (`tick`) is correctly that request's child. The forced-root option guards a parent that does not exist in production.
2. **No live gate on rare background work.** The owner cost rule is "no added *per-request* allocation when disabled". Import, backup push, the hourly trash sweep, the per-minute domain sweep and go-live passes are not request paths. Use the existing `Tracker.trace` (`RouteDeps.tracker` is required; `sweepTrash: TrashSweepOnce` at `types.ts:1070`). It already settles, reports and rethrows. Drop the `observabilityEnabled` plumbing and the "disabled check" tests from T2 and T4–T7. Keep the gate only on the per-call tool path (J1/T1).

| Sheet | Verdict | Reason | Exact cut text |
|---|---|---|---|
| **J1** bind tool observation | KEEP | The decorator exists (`tool-recovery/observability.ts:74`), and the stack never calls it (`stack.ts:76–84`). The stack's own doc already says "Redaction precedes observation", so the slot between `redacted` and `audited` is right. The live gate is justified: it is the per-call hot path, and Tovu's port is a lease fan-out, never the noop singleton (`provider-plugins.ts:387`). | As the design. |
| **J2** tool counters | KEEP | M2 approved. `metric`/`supportsMetric` already exist on the port (`core observability.ts:72–75`). No port change. | As the design. |
| **J3** run-duration histogram | KEEP | M2 approved. OTel is the only metrics backend (`opentelemetry.ts:298`, `supportsMetric: true`), so recording beside the span is the smallest place. | As the design. |
| **J4** `root?: true` | DROP | No production parent exists (rule 1). Removes two contract fields, two provider branches and three test files. | — |
| **J5** outbox drain root | DROP | The outbox is already covered: every delivery is an `outbox.deliver` span (`outbox-drainer.ts:53–72`), which is what M6 asks. A drain root adds an empty span on every idle poll (noise and export cost) plus two new Jini options. A claim failure already reaches the drainer's error log. | — |
| **T3** wire outbox drain | DROP | Follows J5. | — |
| **J6** agent usage fields | DROP (for now) | It adds a contract field and an attribute mapper that no producer passes; the design itself marks M3 wiring PARTIAL. "No options for later." Re-sheet J6 together with the M3 BYOK wiring (`assistant-byok.ts:387–394,813–829`) as one Jini+Tovu pair. | — |
| **T1** BYOK binding | KEEP (waits J1) | `createByokToolSurface(routeDeps)` already receives `observability`/`observabilityEnabled` (`route-deps-site-providers.ts:93,149`, `assistant-byok.ts:565`). Only the preset and `composeSurfaceExecutor` must forward them. | As the design. |
| **T2** import spans | CUT-TO | `ImportBackendRequired.tracker` already exists (`import-backend.ts:42`) and is wired (`site-imports.ts:31`). Drop the new `observabilityEnabled` field and all composition edits. `verifyAndStage` rethrows (`:99–103`), so `trace` marks a rejection failed with no extra code. | See **T2**. |
| **T4** trash purge | CUT-TO | Rules 1+2. | See **T4**. |
| **T5** domain sweep | CUT-TO | Rules 1+2. | See **T5**. |
| **T6** go-live | CUT-TO | Rules 1+2. Put the test in a new file, because `tv-tq` rewrites `go-live.test.ts` (−53 lines) and an edit there would conflict at combine. | See **T6**. |
| **T7** backup push | CUT-TO, WAIT | Rule 2. Drop the `isNoopObservabilityPort` import: the noop port returns one frozen tracker, so there is nothing to skip. It must wait for `tv-xd5-publish`, which rewrites `backup-service.ts` (35 lines) and `push-cancellation.unit.test.ts` (75 lines). | See **T7**. |
| **M5** browser receiver | NEEDS-DECISION | "Which receiver should get opt-in browser diagnostics: the same-origin site receiver behind the existing consent boundary and site providers?" I recommend yes. Full Web Vitals SDK = OPUS-CLOUD. | — |

## Exact cut text (Tovu; paths under `apps/website/src/`)

### T2

- **Test first.** In `features/site-backup/__tests__/import-backend.unit.test.ts`, add two cases using a fake `Tracker` that records `trace` names and outcomes. (1) A new import traces `site.import.verify`, and completing owner setup traces `site.import.restore`. (2) An archive rejection settles `site.import.verify` as failed, the row is `failed`, and the stage is removed. Mutation: drop either trace.
- **Source.** `features/site-backup/import-backend.ts` only. Add a private `function traced<T>({ ctx, name, run }: { ctx: ImportBackendContext; name: string; run: () => Promise<T> }, _optional = {}): Promise<T> { return ctx.required.tracker ? ctx.required.tracker.trace({ name, run }) : run(); }`. Then:
  - At `:164`, use `return traced({ ctx, name: "site.import.verify", run: () => verifyAndStage({ … unchanged … }) });`.
  - At `:188`, use `const { row: allocated, created } = await traced({ ctx, name: "site.import.restore", run: () => createImportedSite({ … unchanged … }) });`.
- No new fields, no composition or CLI edits. The replay early-return (`:155–160`) stays outside the trace.

### T4

- **Test first.** Create a new `server/runtime/composition/__tests__/serving-app-trash-sweep.test.ts` (serving-app fixture pattern) with a fake tracker. (1) One sweep pass traces `trash.purge` and returns the sweep's result. (2) A rejected sweep settles failed and still reaches the existing `[trash-sweeper]` `onError`. Mutation: pass `routeDeps.sweepTrash` unwrapped.
- **Source.** `serving-app.ts:88`: replace `sweep: routeDeps.sweepTrash,` with `sweep: (...args) => routeDeps.tracker.trace({ name: "trash.purge", run: () => routeDeps.sweepTrash(...args) }),`. Forward the arguments unchanged. If the parameter type cannot be inferred without a cast, STOP. Nothing else changes.

### T5

- **Test first.** Extend `server/runtime/composition/__tests__/serving-app-domain-binding-sweep.test.ts`. (1) A due pass traces one `domain.bindings.sweep`. (2) An absent `verifyDueDomainBindings` still yields the idle handle, with no trace. Mutation: always install a callback.
- **Source.** In `serving-app.ts:105–106`, before the call add `const verifyDue = routeDeps.verifyDueDomainBindings;`, and pass `{ sweep: verifyDue && ((input) => routeDeps.tracker.trace({ name: "domain.bindings.sweep", run: () => verifyDue(input) })) }`. Nothing else changes.

### T6

- **Test first.** Create a new `features/post/__tests__/go-live-trace.unit.test.ts` with injected `timers` and a fake tracker. (1) One pass traces `post.go_live.sweep`. (2) A rejected pass calls `onError`, and the next pass uses the same `afterIso` (watermark unchanged). Mutation: trace outside the `try`, or move the watermark assignment into the traced callback before the await.
- **Source.** In `features/post/go-live-sweep.ts`, add `tracker?: Tracker` to the `optional` type and `import type { Tracker } from "@jini-ai/diagnostics/observability";`. Inside the existing `try`, replace the `announceDueGoLives(...)` await with `const announce = () => announceDueGoLives({ deps, input: { workspaceId, nowIso } }, { afterIso }); await (optional.tracker ? optional.tracker.trace({ name: "post.go_live.sweep", run: announce }) : announce());`. The watermark line stays after it. Add one `@param optional.tracker` doc line. In `serving-app.ts:98`, pass `{ tracker: routeDeps.tracker }` as the second argument. Do not edit `go-live.test.ts`.

### T7 (draft only)

- As the design, except: no `isNoopObservabilityPort` import or check; `runObservedBackupPush` returns `pushPlannedBackup(...)` directly only when `deps.observability` is absent. Tests: success → `completed`, cancellation → `cancelled`, `not_pushed` → failed, and a throw is the same rejection. No singleton no-op case.

## Final batched run plan

- **Tovu job `tv-po`** (branch `codex/tv-po`, base merge-6 `776ce6d0f`): T2 → T4 → T5 → T6. That is 4 sheets, so it launches. The theme-watcher edit `tv-xd5-publish` makes in `serving-app.ts` and `tv-tq`'s import line in `go-live-sweep.ts` are separate lines; combine-7 resolves them.
- **DRAFT `j-po-jini-DRAFT.md`** (Jini merge-6): J1 → J2 → J3. It has 3 sheets, below the minimum; merge it with other small Jini halves.
- **DRAFT `j-tv-po2-DRAFT.md`** (combine-7 Tovu with `tv-xd5-publish` + Jini J1 released): T7, T1. It has 2 sheets; merge it.
- **Dropped:** J4, J5, J6 (until M3), T3, every forced root, and the `observabilityEnabled` gates on background work.
