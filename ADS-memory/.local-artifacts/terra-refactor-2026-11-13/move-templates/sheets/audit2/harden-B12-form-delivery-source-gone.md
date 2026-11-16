# HD-form-delivery-gone-1: planner records an empty plan when the delivery source is definitively gone (red-first) (template T-HARDEN)

Row: audit2 B12. Written 2026-11-16 against Tovu `integ/wave-b` 10378809 / Jini `integ/wave-b` ab8711ed. Status READY.
untangle_overlap: **YES -> execute after wave B merge.** The audit row records `server/runtime/composition/form-delivery.ts` in the C3 wave's repoint list (its `@jini-ai/cms/forms` / `core/contracts/events` imports are rewritten there); the Tovu edits below are therefore TEXT-guarded (each OLD occurs exactly once), the Jini files blob-guarded. Re-take `form-delivery.ts`'s blob after the merge if the C3 lane changed only import lines: the OLD texts below contain no import line.
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base
Tier: Sonnet 5.5 high (explicit parity row + tests written below). est. executor tokens: ~45k. Two commits (Jini, Tovu).

## Why (the behaviour difference)
Jini `planFormDeliveries` (`packages/cms/src/forms/delivery/planner.ts:39`) throws a bare `Error` when bindings select a submission but `deps.snapshot` returns `null` ("submission or its form no longer exists"). That is right for a transient miss but wrong for a DEFINITIVELY gone source (a submission/form purged after the event was enqueued): the throw fails the whole `form.submission.received` event, so the bus re-runs the event's OTHER subscribers (the notification email, the webhook) on every retry, for nothing. Tovu works around it in the composition root with a local `DeliverySourceGoneError`, a `Promise.reject` wrapper around the snapshot and an `emptyPlanWhenGone` wrapper around `plans.once`'s `build`. The generic part moves into Jini as an option; the default keeps every other Jini caller's behaviour.

```
id: HD-form-delivery-gone-1
feature: @jini-ai/cms forms delivery (definitively-gone source)
tovu_files:
  - apps/website/src/server/runtime/composition/form-delivery.ts | blob 6e0897b89b5ba4bef5697480d11cca901015f3be | reduce-to-binding (text-guarded, see tovu_binding)
jini_survivor: @jini-ai/cms/forms (barrel) planFormDeliveries at packages/cms/src/forms/delivery/planner.ts | blob ec36a42fccc092ffb453828255c2f90e7e1b39c0
parity:
  - P1: a definitively gone source records an EMPTY plan (jobs: []) and does not throw | Tovu form-delivery.ts:76-88 (emptyPlanWhenGone) | Jini planner.ts:39 throws | generic? yes -> Jini option `onSourceGone: "empty-plan"`
  - P2: exactly one log line that names only the submission id (never the form id, answers, or workspace) | Tovu :84 | Jini absent | generic? yes -> Jini optional `report` port (no console in Jini), message text neutral; Tovu prefixes `[form-delivery] `
  - P3: every other failure (bindings read, snapshot reject, plan store) still throws so the event retries | Tovu :81 (`if (!(error instanceof DeliverySourceGoneError)) throw error`) | Jini: unchanged by construction | generic? yes (kept: the option only changes the `!source` branch)
wire_drift: - (log line text is byte-identical after Tovu adds its prefix; plan rows identical: `{ workspaceId, submissionId, formId, jobs: [] }`)
new_options:
  - optional.onSourceGone: "retry" | "empty-plan" default "retry" (today's Jini behaviour: every existing Jini caller and test is unchanged)
  - optional.report: (required: { message: string }) => void default no-op (silent; Jini never logs by itself)
changeset: @jini-ai/cms: minor | "planFormDeliveries takes optional onSourceGone ('retry' default, or 'empty-plan' to record an empty plan when the submission or its form is definitively gone) and an optional report port."
```

## Jini (commit 1) — failing tests FIRST
Guards: `packages/cms/src/forms/delivery/planner.ts` blob ec36a42fccc092ffb453828255c2f90e7e1b39c0; `packages/cms/src/forms/delivery/__tests__/planner.unit.test.ts` blob ce9363156188279ff69a48a2530d550abea0e296; `packages/cms/src/forms/delivery/index.ts` blob 063bc66a9a29a1cba08edc3c0b1ef61236f4f17d (no edit needed: `planFormDeliveries` is already exported); `rg -n "onSourceGone" packages/cms/src` prints nothing.

J-1 (tests). In `planner.unit.test.ts` add inside a new `describe("definitively gone source", ...)` after the last existing `describe`, reusing the file's own `setup(bindings, source)` helper (it takes `source: FormDeliverySnapshot | null` and returns `{ deps, calls, ... }` — the executor reads lines 39-52 of the file first and adapts the three destructured names to what `setup` actually returns; any mismatch beyond names = STOP):
```ts
describe("definitively gone source", () => {
  test("default option still throws when the snapshot is null, so the source event retries", async () => {
    const { deps } = setup([binding("a")], null);
    await expect(planFormDeliveries({ deps, workspaceId: "w-1", submissionId: "s-1", formId: "f-1" })).rejects.toThrow(/was not found; the source event will retry/);
  });

  test("onSourceGone 'empty-plan' records an empty plan, stores it once, and reports one line naming only the submission id", async () => {
    const { deps } = setup([binding("a")], null);
    const lines: string[] = [];
    const plan = await planFormDeliveries(
      { deps, workspaceId: "w-1", submissionId: "s-1", formId: "f-1" },
      { onSourceGone: "empty-plan", report: ({ message }) => { lines.push(message); } },
    );
    expect(plan).toEqual({ workspaceId: "w-1", submissionId: "s-1", formId: "f-1", jobs: [] });
    expect(lines).toEqual(["submission s-1 or its form no longer exists; recorded an empty delivery plan"]);
  });

  test("'empty-plan' never swallows a snapshot failure: it still throws so the event retries", async () => {
    const { deps } = setup([binding("a")]);
    deps.snapshot = async () => { throw new Error("database is locked"); };
    await expect(planFormDeliveries({ deps, workspaceId: "w-1", submissionId: "s-1", formId: "f-1" }, { onSourceGone: "empty-plan" })).rejects.toThrow("database is locked");
  });
});
```
On the parent: test 2 is RED (the option is ignored, the planner throws); tests 1 and 3 are GREEN. Report "RED on parent expected: planner.unit.test.ts › definitively gone source › onSourceGone 'empty-plan' records an empty plan...".
J-2 (code) `planner.ts`: (a) signature OLD (1 occurrence)
```ts
  required: { deps: FormDeliveryPlannerDeps; workspaceId: string; submissionId: string; formId: string },
  _optional: Record<string, never> = {},
): Promise<FormDeliveryPlan> {
```
NEW
```ts
  required: { deps: FormDeliveryPlannerDeps; workspaceId: string; submissionId: string; formId: string },
  optional: PlanFormDeliveriesOptions = {},
): Promise<FormDeliveryPlan> {
```
(b) OLD (1 occurrence) `    if (!source) throw new Error(\`Form delivery planning failed: submission ${submissionId} or form ${formId} was not found; the source event will retry.\`);` NEW
```ts
    if (!source) return sourceGone({ workspaceId, submissionId, formId, optional });
```
(c) insert above the `selects` function (after the `FormDeliveryPlannerDeps` interface, before `function selects`):
```ts
/** @param optional.onSourceGone `"retry"` (default) throws so the source outbox job retries; `"empty-plan"` records an
 *  empty plan instead, for a submission or form that is definitively gone — a throw would fail the whole event and
 *  re-run its other subscribers on every retry, for nothing. Only a null snapshot is affected: every other failure still throws.
 *  @param optional.report receives one line (the submission id only; never the form id, answers or workspace). */
export interface PlanFormDeliveriesOptions {
  readonly onSourceGone?: "retry" | "empty-plan";
  readonly report?: (required: { message: string }) => void;
}

/** Bindings selected the submission but its source is gone: retry (throw) or record the empty plan. @complexity O(1). */
function sourceGone(
  required: { workspaceId: string; submissionId: string; formId: string; optional: PlanFormDeliveriesOptions },
  _optional = {},
): FormDeliveryPlan {
  const { workspaceId, submissionId, formId, optional } = required;
  if (optional.onSourceGone !== "empty-plan") {
    throw new Error(`Form delivery planning failed: submission ${submissionId} or form ${formId} was not found; the source event will retry.`);
  }
  optional.report?.({ message: `submission ${submissionId} or its form no longer exists; recorded an empty delivery plan` });
  return { workspaceId, submissionId, formId, jobs: [] };
}
```
(d) update the `@throws` doc of `planFormDeliveries`: OLD ` * @throws Error when bindings select the submission but its source is gone, so the source outbox` -> NEW ` * @throws Error when bindings select the submission but its source is gone (unless \`optional.onSourceGone\` is \`"empty-plan"\`), so the source outbox`.
(e) export the type: in `index.ts` add `PlanFormDeliveriesOptions` to the existing planner export line (executor reads `rg -n "planner" packages/cms/src/forms/delivery/index.ts`; if the file uses `export *` nothing to do; if it names exports, add `type PlanFormDeliveriesOptions` to that list — the blob guard above then changes: record it).
Complexity: `sourceGone` cyclomatic 3; `planFormDeliveries`'s inner `build` unchanged branch count (the `if (!source)` now delegates). `_optional` was `Record<string, never>`; the new `optional: PlanFormDeliveriesOptions = {}` keeps the outer `= {}` (rule 10).
J-3 changeset `.changeset/cms-form-delivery-source-gone.md` as above. Rule checks (COMMON 2-9): no `console`, no Tovu text; eslint planner.ts and the test; commit `fix(cms): planFormDeliveries can record an empty plan for a definitively gone source` | body "Opt-in via onSourceGone: 'empty-plan'; default 'retry' keeps today's behaviour. RED test on the parent: the empty-plan case."

## Tovu (commit 2) — `server/runtime/composition/form-delivery.ts` (text-guarded; OLD occurs once each)
1. DELETE the class and its doc: OLD (1 occurrence)
```ts
/** Thrown by the snapshot read when the submission or its form is gone; the plan store below turns
 * it into an empty plan. */
class DeliverySourceGoneError extends Error {
  constructor(readonly required: { workspaceId: string; submissionId: string; formId: string }) {
    super(`form delivery source gone: submission ${required.submissionId}`);
  }
}

```
NEW: empty string.
2. In `composeFormDelivery`: OLD (1) `    plans: { once: (input: Parameters<FormDeliveryPlanPort["once"]>[0]) => required.plans.once({ ...input, build: () => emptyPlanWhenGone({ build: input.build, warn }) }) },` NEW `    plans: required.plans,`.
3. OLD (1) `      (await readDeliverySnapshot({ deps: required, ...input })) ?? Promise.reject(new DeliverySourceGoneError(input)),` NEW `      readDeliverySnapshot({ deps: required, ...input }),` (check the line before it, `snapshot: async (input: ...) =>` — if it now has no `await`, the executor drops `async` only if eslint `require-await` is a configured error; else leave).
4. OLD (1) `    plan: (input) => planFormDeliveries({ deps: planner, ...input }),` NEW `    plan: (input) => planFormDeliveries({ deps: planner, ...input }, { onSourceGone: "empty-plan", report: ({ message }) => warn(\`[form-delivery] ${message}\`) }),`.
5. DELETE `emptyPlanWhenGone` with its doc: OLD (1) the whole block from `/** Runs the planner's \`build\`; when its source is gone, the empty plan instead (one log line naming` through the closing `}` of the function (L73-L90 of the guarded blob) -> empty. Also the now-unused `FormDeliveryPlan` / `FormDeliveryPlanPort` imports: remove `type FormDeliveryPlan,` and `type FormDeliveryPlanPort,` from the import list only if `rg -n "FormDeliveryPlan\b|FormDeliveryPlanPort" form-delivery.ts` shows no other use (the `plans: FormDeliveryPlanPort` field in `FormDeliveryCompositionDeps` still uses `FormDeliveryPlanPort`: keep that one; `FormDeliveryPlan` goes).
6. Doc: the `composeFormDelivery` header sentence "A submission (or form) deleted before its event is planned records an EMPTY plan and logs one line, instead of Jini's planner throwing" -> "... records an EMPTY plan and logs one line (Jini's planner option `onSourceGone: \"empty-plan\"`), instead of throwing:" (keep the rest of the why).
tests_tovu: `__tests__/form-delivery.test.ts` (blob 7ccce32baba37124e66888b33115e4cd51ee1849? the executor records the three blobs `git hash-object` of `form-delivery.test.ts`, `form-delivery-subscribers.test.ts`, `form-delivery.security.test.ts` and treats them as guards) and `form-delivery-subscribers.test.ts` already assert the exact warn line `[form-delivery] submission sub-1 or its form no longer exists; recorded an empty delivery plan` and the recorded `{ ..., jobs: [] }` plan (lines 76, 97, 109) and "only a gone source becomes an empty plan" (line 100): they stay UNCHANGED and must stay GREEN on the Tovu commit (that is the parity proof). A test that fails = STOP.
census: `rg -n "DeliverySourceGoneError|emptyPlanWhenGone" apps` after the edit prints nothing.
tovu_msg: `refactor(form-delivery): use planFormDeliveries onSourceGone instead of a local wrapper` | body "Behaviour and log text unchanged; the wrapper moved into Jini as an opt-in option."
extra_stops: `plans.once` in Tovu's `SqlFormDeliveryRepo` expects its `build` to throw for some other case the wrapper used to swallow (it only swallowed `DeliverySourceGoneError`, which only the snapshot wrapper threw: verified by `rg` in the L1-101 read).

## Expected afterwards (batched cloud run)
RED on the Jini parent: `planner.unit.test.ts › definitively gone source › onSourceGone 'empty-plan' ...`; GREEN on the Jini commit. Tovu: `form-delivery*.test.ts` GREEN before and after (unchanged assertions).
