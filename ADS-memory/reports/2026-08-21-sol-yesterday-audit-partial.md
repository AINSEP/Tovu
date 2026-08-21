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

### Resolution (2026-08-21) — CONFIRMED. The shipped gate produces 151, not 141. Verification only; baseline NOT touched.

**Answer: yes, the shipped gate produces 151 on an unmodified tree — Sol was right, and this is now
verified against the source and the actual command, not just the commit message.**

**1. The shipped `fanOut` threshold, read directly from the file:**

```json
"bidirectionalHubs": { "count": 151, "total": 870, "pct": 17.36, "medians": { "fanIn": 10, "fanOut": 9.5 } }
```

`development/scripts/check-architecture.baseline.json` bakes in `medians.fanOut: 9.5` — and its own
`count` field already says **151**, not 141.

**2. How the threshold is applied — strict `>`, confirmed in `check-architecture.ts:455`:**

```ts
(n) => degrees.fanOut.get(n)! > thresholds.fanOut && degrees.fanIn.get(n)! > thresholds.fanIn,
```

Degrees are integers. `10 > 9.5` is `true`; `10 > 10` is `false`. A file with `fanOut` exactly 10 is a
hub under the shipped `9.5` threshold and would NOT be under a `10` threshold — exactly the mechanism
Sol described.

**3. Fresh run on the unmodified tree, right now:**

```
$ npm run check:architecture
check:architecture — 870 files, 49 modules, production files only
  bidirectional hub count                              17.36% (151/870)
check:architecture — OK: at baseline.
```

**151/870, gate green** (matches its own baseline — the gate is internally consistent, not broken).
Not 141.

**4. Where the `141` figures actually came from, and why they don't match** — traced to
`ADS-memory/reports/architecture/2026-08-20-hub-decomposition-hypotheses.md` §7, the report
`3d989a5f`'s commit message itself cites as the source of the validating numbers. Its own text (line
308-309): *"frozen at the actual baseline's medians ... fanIn>10 / fanOut>10"*. At the time that report
was written, **no baseline had frozen medians yet** — freezing was still a proposal, not shipped — so
the report's validation harness used the *prior* (pre-fix) baseline's stated median, `fanOut=10`, as its
stand-in for "frozen," which is exactly what produced the `141` headline figures
(`current graph, no mutation: 141`, then `141→119` and `141→261` for the two mutation tests).

But `check-architecture.ts`'s real `--update` path doesn't freeze the *prior* baseline's median — by
design, it freezes the *current* graph's own fresh median at the moment `--update` runs (comment at
`check-architecture.ts` ~line 699: *"FRESH hubs + fresh medians on purpose: `current` is only ever
written by `--update`, and re-freezing the threshold to this graph is exactly what an update is meant to
do"*). On 2026-08-20, the *current* graph's fresh `fanOut` median was already `9.5` (the same report,
§1: *"medianFanOut dropped 10 → 9.5"*, from unrelated churn elsewhere in an 870-file graph — not from
the fix itself). So the validated demonstration (`fanOut>10`) and the value that a real `--update`
actually freezes (`fanOut>9.5`, current-graph-fresh) were never the same number, and the commit's own
final paragraph inadvertently says so: it quotes the `141`-based figures as evidence, then separately
reports *"hub count 139 → 151"* for what was actually re-captured — two different numbers, unreconciled,
in the same message.

**Verdict on "does the shipped gate produce the numbers its own commit advertises": no.** The gate
itself is not broken — it's green, self-consistent, and its `--update` behavior (freeze to the current
graph, not the prior baseline) is a defensible, intentional design, explicitly commented as such. What's
wrong is narrower: the commit's before/after evidence (`141→119`, `141→261`) was generated against a
threshold (`fanOut>10`) that the real freezing mechanism was never going to produce once it actually ran,
because "freeze to current" and "the old baseline's stored value" happened to diverge by exactly 0.5 that
day. The fix (freezing itself) remains correct and undisputed; its supporting numbers are not
reproducible against what shipped.

**Explicitly not done, per the task brief: no `--update`, no rebaseline, no threshold change.** The
hub/barrel verdict stays settled. This is a verification-only finding for a human to decide what (if
anything) to do about the commit message's inconsistent evidence — the baseline file itself is untouched
by this investigation.

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
