# Sol audit of the 2026-08-20 afternoon session — PARTIAL, terminated early

`gpt-5.6-sol` at xhigh, read-only, range `76a65282..3fec3ab8`. The run was **SIGTERM'd at ~5 min**
(exit 144, empty stderr, no `error` or `turn.failed` event — a host-level kill, not a model failure).
It had produced 292 tool calls and 5 progress messages before dying. **The owner declined a retry.**

Two substantive findings survived. Both are recorded here because they concern a **shipped gate** and a
**shipped deletion**, and would otherwise be lost.

## 1. UNRESOLVED — the architecture baseline's `fanOut` threshold may not match its own claims

Sol's message, verbatim in substance:

> The architecture logic does stop per-run threshold drift, but the shipped baseline freezes
> `fanOut=9.5`, while the validating harness and advertised `141→119` / `141→261` results used the
> prior baseline's `fanOut=10`. Because degrees are integers, that half-point changes membership
> (`>9.5` admits fan-out 10; `>10` does not): the shipped unmodified graph is **151, not the claimed
> 141**. I'm treating the exact-number claim as unproven.

**Status: NOT independently verified by the coordinator.** It is a specific, checkable claim about
`development/scripts/check-architecture.baseline.json` and the numbers quoted in commit `3d989a5f`.

**Why it matters:** the frozen-median fix is correct in principle — that part is not disputed — but if
the shipped threshold is `9.5` while the validating numbers came from `10`, the commit's advertised
before/after figures do not describe the gate that actually shipped. That does not make the gate wrong;
it makes its evidence unreproducible, which is exactly the class of problem the whole
measurement-integrity campaign was about.

**Next step for whoever picks this up:** read the `fanOut` value in the shipped baseline, re-run
`check:architecture` on an unmodified tree, and see whether the hub count is 141 or 151. One run
settles it. Do not rebaseline anything before that is answered.

## 2. RESOLVED — the `highlight.ts` dead-code deletion is safe

Commit `23134fe1` deleted `textContent ?? ""` justified by "tsc passed without it". The coordinator
flagged this as suspect on the grounds that `Node.textContent` is `string | null` per the DOM spec and
a type-checker passing is not proof a runtime value is never null.

**Sol checked and the deletion is safe.** Both production callers use the default `document`;
`querySelectorAll` yields `Element` (not `Node`); and TypeScript 5.9's DOM declarations correctly narrow
`Element.textContent` to a **non-null** getter. `strictNullChecks` is on via `strict`;
`noUncheckedIndexedAccess` is not enabled.

Sol's own caveat is the useful part and worth preserving: *"The typecheck alone would not prove runtime
safety, but the actual receiver type and DOM contract do."* The original justification ("tsc passed")
was insufficient reasoning that happened to reach a correct conclusion.

## Not audited — the questions this run never reached

Its own todo list at time of death, all incomplete: the `execution-settings.ts` / `lib/api.ts`
`request<T>()` blast radius (~99 downstream `.data` reads, only 4 guarded); the `src/widgets`
total/partial accessor split and the `d5bf9fa4` `| undefined` sweep claim; the
`use-other-credentials.hooks.ts:372` dead-`throw` decision; whether any other test directory is still
unreferenced by any gate; and which of that session's coverage numbers came from the now-known-corrupt
full-repo tooling.
