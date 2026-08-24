# Bidirectional hub decomposition hypotheses — 139 → 151

**Date:** 2026-08-20
**Agent:** Refactor (investigation only — propose-only per dispatch, no source edits)
**Trigger:** `bidirectional hub count` regressed 139 → 151 (WARNING, non-blocking ratchet) alongside `module API surface` 201 → 202 (BLOCKING, owned by a concurrent session in `plugin-runtime/` — not touched here). Dispatch: figure out how to break up the hubs and prove any proposal numerically before code is written.

## Method

Built a throwaway harness in scratchpad that copies `check-architecture.ts`'s exact graph-building
and hub-detection logic (not imported — the source is a `.ts` file with tsx-only quirks; copied
functions verbatim: `buildFileGraph`, `propagationAndHubs`, `moduleOf`, `median`,
`stronglyConnectedComponents`). Two graphs were built from real `dependency-cruiser` output:

- **current**: `npx depcruise src` against the working tree.
- **baseline**: the actual `bf24571c` commit's `src/` tree, extracted with `git archive bf24571c -- src
  tsconfig.json` into a scratch dir (symlinked to the real `node_modules`) — zero working-tree edits,
  no checkout, no stash.

Both replicate the shipped tool exactly: baseline replica = **862 files / 139 hubs**, matching
`check-architecture.baseline.json` verbatim; current replica = **870 files / 151 hubs**, matching
`npm run check:architecture -- --list` verbatim. All counterfactuals below mutate the in-memory graph
only. No source file, `.dependency-cruiser.cjs`, or baseline JSON was touched — verified clean with
`git status --porcelain -- src/ .dependency-cruiser.cjs development/scripts/check-architecture.baseline.json`
after every experiment.

Scratchpad artifacts (not committed, throwaway): `hub-analysis.mjs` (copied graph logic),
`decompose.mjs`, `simulate.mjs` (split-leverage sweep), `scc-check.mjs` / `scc-runtime.mjs` (Tarjan),
`api-surface-conflict.mjs`, `frozen-median-check.mjs` (§7's validation), plus cached
`cruise-dump.json` / `baseline-cruise-dump.json`.

**Re-measured after the `plugin-runtime/` session landed** (18 commits + handoff, since that work
touches `src/features/plugin-runtime/` and `src/server/routes/admin/plugins/**`, both inside this
investigation's graph). Re-ran `dependency-cruiser` fresh and diffed every module's resolved
dependency set against the cached dump used for every number below: **0 modules changed** — the
landing was already included in the tree this investigation started from (its parent commit was
already `HEAD` when this investigation began). `npm run check:architecture -- --list` re-run live
also still reports 870 files / 151 hubs, matching. All findings below stand unchanged.

---

## 1. How much of 139 → 151 is the median artifact vs. real coupling

**10 of the 12 (83%) is a pure median-crossing artifact — but not from "many small files diluting
the median" as hypothesized. It's from one median moving by exactly 0.5.**

`medianFanIn` held constant at 10 across both runs. `medianFanOut` dropped 10 → 9.5. Files 862→870
(+8), so both counts stay even and the median is still an average-of-two-middle-values — an 8-file
net add is not "many," yet it was enough to nudge the fan-out distribution's midpoint down half a
step.

Applying baseline's thresholds (`fanOut > 10 AND fanIn > 10`) to the **current** graph gives a hub
count of **141**, not 151:

```
current graph, baseline thresholds : 141
current graph, current thresholds  : 151   (real, reported number)
=> median-shift alone accounts for 10 of the 12
```

Confirmed by direct set overlap between the two REAL runs (139 @ baseline vs 151 @ current):

- **0 hubs dropped out** — full retention, every one of the original 139 is still a hub.
- **12 newly hubs.** Of those:
  - **10** existed at baseline, with **`fanOut = 10` then and `fanOut = 10` now — unchanged.**
    Their `fanIn` mostly *decreased* since baseline (e.g. `comments/ingress.ts` 319→272) but stayed
    comfortably above the fanIn median either way. These 10 sat exactly on the boundary that a 0.5
    median shift flipped; nothing about their own coupling changed:
    `comments/ingress.ts`, `features/custom-credentials/store.ts`,
    `features/deployments/publish-credentials/store.ts`, `features/vendor-credentials/store.ts`,
    `media/bootstrap.ts`, `media/index.ts`, `members/access-resolver.ts`,
    `members/consent-service.ts`, `members/repo.memory.ts`, `members/write-service.ts`.
  - **2 are genuinely new files**, both real hubs on first appearance:
    `src/server/http/site/worker-sandbox.ts` (fanIn=275, fanOut=75) and
    `src/server/routes/admin/redirects/shared.ts` (fanIn=12, fanOut=37).

**Verdict on the module-level deltas from the 2026-08-19 census**: the `members` module's +4 and
`media`'s +2 (the two biggest module-level jumps) are **entirely** median-artifact — 4 of the 10
boundary-crossers are `members/*`, 2 are `media/*`. `server`'s +2 is the 2 real new files. Everything
else in the module roll-up (seo, newsletter, assistant, widgets, theme, source-control, deployments,
redirects, export, pages, post, comments, custom-credentials, vendor-credentials at their unchanged
counts) is flat — no real movement.

## 2. The RouteDeps inversion — a defect in the gate, not the refactor

**This is the single most important finding in this report. If someone runs this gate, sees the
count go up, and reverts a `types.ts` split on the strength of that number, the gate lied to them.**

`src/server/routes/types.ts` is the single highest combined-degree hub in the graph
(fanIn=269, fanOut=234) — and `check-architecture.ts`'s own top-of-file comment already names it as
"the actual defect" behind `back-edges into composition root` (a *hard-constraint* metric, separate
from hub count). It is the RouteDeps god-type this repo already knows it wants to break up.

Simulated the split — same leaf/top method as every other row in §3's table: `types.ts` becomes
`types.ts::LEAF` (keeps all 269 inbound edges, 0 outbound) and `types.ts::TOP` (keeps all 234
outbound edges, 0 inbound), original node removed, full graph recomputed.

```
before split:  151 hubs
after split:   179 hubs      <- WORSE, not better
delta:         −28           <- the single largest movement of any file tested, wrong direction
```

**The mechanism, precisely**: `bidirectional hub count` is not an absolute threshold — it's
"fan-in AND fan-out both exceed *this run's own median*." `types.ts` is the single most-connected
node in the graph: roughly 25 `server/routes/admin/*/deps.ts` files each show `fanOut≈235`, nearly
identical to `types.ts`'s own 234, because each of them imports `types.ts` directly and inherits
almost its entire transitive reach that way (confirmed these 25 are *not* a cycle with each other —
independent fan-out convergence on one shared file, not mutual reachability). Deleting a node with
that much independent gravitational pull collapses **overall graph reachability** — most files lose
some fan-in/fan-out because a common through-path is gone. But the *median itself* is computed fresh
on the post-split graph, and it collapses **even faster** than most individual files' degree does
(the same mechanism, sharper, as the 0.5-point shift in §1). So the bar drops further than the typical
file's height drops, and a larger fraction of files end up standing above a much lower bar — hub count
goes up even though the graph is measurably less tangled by every other lens (propagation cost,
back-edges, common sense).

**This is not a one-off curiosity — §7 shows it's the general failure mode of a median-relative
threshold recomputed every run, and proposes and validates a concrete fix.** Until that fix ships,
treat any `bidirectional hub count` regression triggered by touching a high-degree glue file as
uninterpretable without re-deriving what actually happened, exactly as done here — the number alone
is not evidence of anything in either direction for a file like this.

## 3. Hub files ranked by measured leverage (split-count delta, not fan-in+fan-out)

Simulated, for every one of the 151 current hubs: split file X into `X-leaf` (inherits all fan-in,
zero fan-out) and `X-top` (inherits all fan-out, zero fan-in), delete X, recompute the full hub count
on the mutated graph. This is the idealized best case (no residual leaf→top edge). Top 15 by measured
delta:

| rank | delta | file | module | fanIn | fanOut |
|---|---|---|---|---|---|
| 1 | **16** | `src/assistant/index.ts` | assistant | 75 | 280 |
| 2 | 12 | `src/features/post/index.ts` | features/post | 361 | 16 |
| 3 | 9 | `src/members/index.ts` | members | 275 | 29 |
| 4 | 5 | `src/features/deployments/static-publish/index.ts` | features/deployments | 311 | 87 |
| 5 | 5 | `src/features/theme/index.ts` | features/theme | 338 | 22 |
| 6 | 5 | `src/routing/index.ts` | routing | 326 | 20 |
| 7 | 4 | `src/redirects/index.ts` | redirects | 319 | 36 |
| 8 | 4 | `src/server/http/site/render.ts` | server | 275 | 75 |
| 9 | 4 | `src/media/index.ts` | media | 321 | 10 |
| 10 | 3 | `src/export/index.ts` | export | 315 | 66 |
| 11 | 3 | `src/assistant/tool-registrations.ts` | assistant | 75 | 280 |
| 12 | 3 | `src/server/http/site/worker-sandbox.ts` | server | 275 | 75 |
| 13 | 3 | `src/features/vendor-credentials/index.ts` | features/vendor-credentials | 307 | 21 |
| 14 | 3 | `src/seo/types.ts` | seo | 93 | 40 |
| 15 | 2 | `src/server/routes/site/pages.ts` | server | 12 | 345 |

120 of the 151 hubs have **delta = 1** — splitting them only removes themselves from the count, no
cascade. **One hub has negative leverage** (`src/server/routes/types.ts`, delta = −28) — see §2, it
matters more than the top of this table.

**This table is contaminated and should not be acted on as-is — see §6.** Every one of the top 9 rows
above is a pure re-export barrel (owner-verified for row 1, `assistant/index.ts`; classified and
independently spot-checked for the rest). §6 reclassifies all 151 hubs and reruns this ranking with
barrels excluded — that second table, not this one, is the one worth acting on.

## 4. Top-8 detail: what the split looks like, and the risk

**Correction before the detail below**: the original pass through this section (this paragraph added
on revision) tested "does this file carry real logic" with a single-line grep
(`^export \* from|^export {.*} from`), which misses the multi-line `export {\n  a,\n  b,\n} from "./x"`
blocks these files actually use. Read directly against the source, `members/index.ts`,
`routing/index.ts`, `deployments/static-publish/index.ts`, `theme/index.ts`, and `redirects/index.ts`
are **all pure re-export barrels, zero local declarations** — the "carries real logic" claims below for
#3–7 were wrong and are corrected in place. See §6 for the full reclassification of all 151 hubs and
why this matters far beyond these five files.

**#1 — `src/assistant/index.ts` (delta 16) is not really "one file."** Tarjan SCC on the current
all-import graph found a **29-file strongly-connected component**: every feature module's
`tool-registrations.ts` (25 of them — comments through widgets) plus 4 assistant files
(`index.ts`, `byok-tool-surface.ts`, `tool-contribution-registry.ts`, `tool-registrations.ts`), all
showing the *identical* signature `fanIn=75, fanOut=280` — the SCC fingerprint (every member of a
cycle has identical reachability). **This cycle does not survive on the runtime-only graph** — rerun
with `runtimeOnly: true`, the 29-file SCC is gone. It's an `import type`-only cycle: a `tsc`-recheck
cost, not a require/ESM deadlock risk. It almost certainly comes from the registry pattern itself —
each feature's `tool-registrations.ts` imports a shared type from `assistant/tool-contribution-registry.ts`
(or similar) to describe its tools, while `assistant/index.ts` imports every feature's
`tool-registrations.ts` to assemble the registry — the textbook "central aggregator imports every
producer, every producer imports the aggregator's types" cycle.
  - **What the split looks like**: break the *type* dependency, not the aggregation. Move whatever
    shared shape (`ToolRegistration`, `ToolContribution`, etc.) each `tool-registrations.ts` imports
    from `assistant/` into its own leaf types module with zero dependencies of its own (e.g.
    `src/assistant/tool-registration-types.ts`), and have both `assistant/tool-contribution-registry.ts`
    and all 25 feature files import from *that* instead of each other. `assistant/index.ts` keeps
    importing the 25 feature files (that fan-in is real and desired — it's a registry).
  - **Risk**: low for behavior (type-only, so runtime is provably unaffected — `tsc` still gates it).
    Medium for *scope*: touches all 25 feature modules' `tool-registrations.ts` imports, so it's wide
    but mechanical (an import-path rename, not a logic change). Verify with `tsc` before/after; if the
    cycle is truly type-only this should be a pure green-to-green move.

**#2 — `src/features/post/index.ts` (delta 12, fanIn=361 — the highest fan-in of any hub in the
graph)** is a 50-line file, 8 exports, 6 of them `export * from` / `export { } from` — **already a
thin barrel.** Its hub-ness is close to irreducible: everything imports the module through its front
door, which is the point of a barrel. Splitting it doesn't have an obvious target — there's very
little "top" (fanOut=16) to peel off. Flagging this as a likely **§5 structural case**, not a real
split candidate, despite the large measured delta — the delta here is coming from the same median
mechanics as §1/§2, not from real extractable coupling. Do not spend refactor effort here without
re-verifying against §5's caveat.

**#3 — `src/members/index.ts` (delta 9, fanIn=275, fanOut=29)** — **corrected**: this is a 114-line
pure barrel (2 multi-statement `export { ... } from` blocks accounting for every line, 0 local
declarations), not a file with real logic as originally claimed here. Its own doc comment says so
explicitly: `"Public surface (barrel) for the members Tier-2 core library (ADR-030) ... a module's
public contract is its index.ts; boundary lint forbids deep imports."` The large fanOut (29) is the
union of everything the module re-exports (interfaces, error classes, both repo adapter
implementations, the mailer, the access resolver, the write/consent services), not composition logic
`index.ts` performs itself. Splitting it further means splitting the *module*, not the barrel — out of
scope for a graph-shape investigation. See §6.

**#4-7 — `deployments/static-publish/index.ts`, `theme/index.ts`, `routing/index.ts`,
`redirects/index.ts`** — **corrected**: all four are also pure barrels on the same test (verified
directly against source, not just the flawed grep). `routing/index.ts` in particular looked like a
worst case under the old single-line grep (0 matches for `export * from` / `export {.*} from` on one
line) but is actually a single `export { ... } from "./routing.js"` block spanning lines 1-13 plus
three more multi-line `export type { ... } from` blocks — 100% barrel, 0 declarations. See §6 for the
full 151-file reclassification.

**#8 — `src/server/http/site/render.ts` (delta 4, fanIn=275, fanOut=75)** is part of a second,
smaller SCC: `render.ts`, `handlebars-sandbox.ts`, `liquid-sandbox.ts`, `worker-sandbox.ts` (4 files,
all-import graph) — same fingerprint pattern as the 29-file cluster (identical fanIn/fanOut in the
full listing). **Also type-only** — does not survive on the runtime-only graph. Likely each sandbox
variant imports a shared type from `render.ts` (dispatch/config shape) while `render.ts` imports all
three sandbox implementations to dispatch between them. Same fix shape as #1: extract the shared type
into a zero-dependency leaf, keep the dispatch fan-out in `render.ts` as-is (that fan-out is real and
wanted — it's a dispatcher).

## 5. Hubs that are hub-shaped for structural reasons — no split fixes them

- **Every module's own `index.ts` with `fanOut` near zero** (`post/index.ts` fanOut=16 on 50 lines,
  mostly re-exports) is doing exactly its job. High fan-in on a barrel is the *design*, not a defect.
  Splitting it further just relocates the barrel, it doesn't reduce real coupling. The measured
  leverage numbers for these (rank #2 especially) are median-mechanics, not genuine extractable debt.
- **`src/server/routes/types.ts`** — covered in full in §2 (the RouteDeps inversion). Splitting it
  measures as a −28 regression under today's gate for reasons that have nothing to do with whether the
  split is good; judge it on the independent evidence already in this codebase (the file's own doc
  comment, the `back-edges into composition root` finding), not on this metric.
- **`server` module generally** (45 of 151 hubs, the largest single-module share) — it is the
  composition root. Assembling and wiring every route necessarily produces both high fan-in (routes
  import shared deps/types) and high fan-out (the composition root reaches into every feature). Some
  fraction of this is irreducible by definition of what a composition root does; only the specific
  concentration on `types.ts` (§2) looks like a genuine extractable defect within it.
- **`routing/{index,routing,ports}.ts`** (3 hubs) — routing's entire job is to sit in the structural
  middle. Expect these to stay hub-shaped under any reasonable split.

## 6. Does hub reduction conflict with API-surface reduction — measured, not guessed

**The measured conflict is real, but runs the opposite direction from the stated hypothesis, and it
is much sharper on the metric that actually blocks the build.**

Simulated "fix every deep import": for all 279 cross-module edges that bypass a target module's
`index.ts` *and* whose target module actually has an `index.ts` in the graph, rerouted
`caller → target` into `caller → index.ts` plus `index.ts → target` (this is structurally what
"route everyone through the barrel" does to the import graph — index.ts must import/re-export
whatever callers used to reach directly).

```
hub count:            151 → 45     (crashes, does NOT rise)
medianFanIn:            10 → 15
medianFanOut:          9.5 → 350   (35x)
propagation cost (all-import, HARD CONSTRAINT):  11.62% → 24.38%  (~2.1x)
```

**Why hub count crashes instead of rising**: forcing every deep import through a single barrel file
doesn't just concentrate fan-*in* on `index.ts` — because dependency-cruiser's edges are file-level,
not export-level, every caller of a now-fatter barrel inherits transitive reachability into
*everything else the barrel re-exports*, whether the caller uses it or not. That explodes fan-*out*
for every caller of every barrel simultaneously, which explodes the *median* fan-out (9.5 → 350) far
more than it concentrates any individual file's degree. Once the bar itself is at 350, almost nothing
clears it — hence 151 → 45. This is the same median-relative distortion as the `types.ts` case in §2,
just pulling the number the opposite direction — confirmed directly in §7: under the frozen-threshold
alternative proposed there, this same simulated change scores 141 → 261, correctly showing it makes
coupling much worse, not better.

**The real, load-bearing finding here is the propagation-cost number, not the hub count**:
barrel-routing to shrink API surface would roughly **double** `propagation cost (all-import)`
(11.62% → 24.38%) — and that metric is a **HARD CONSTRAINT** that blocks the build, unlike
`bidirectional hub count`, which is WARN-only. So: **do not treat a shrinking hub-count as
confirmation that routing through `index.ts` is safe** — on this measurement, chasing API-surface
compliance by blindly barrel-routing every deep import would trip the hard gate even as it makes the
warn-only hub metric look better. The two metrics are not simply in tension in the direction guessed;
they can point in opposite directions from each other for reasons specific to how each is computed.
This is a mechanism finding (verified once, on the full simulated edge set), not a per-module survey —
a targeted routing of only the highest-value modules (rather than all 279 edges at once) was not
separately measured and could behave differently at smaller scale.

## 7. Verdict — is `bidirectional hub count` worth optimizing at all?

**No, not in its current form. The floating median makes it unreliable as a trend signal — it moves
for reasons unrelated to coupling (§1), it can score a proven-correct fix as a large regression (§2),
and it can be driven to look dramatically better by a change that is verifiably worse by the metric
that actually blocks the build (§6). All three failure modes trace to the same root cause, and there
is a small, concrete fix.**

**Root cause**: the threshold (`medianFanIn`, `medianFanOut`) is recomputed fresh from the *current*
run's own distribution, every run. That makes hub membership a property of the whole graph's shape at
that instant, not a property of the file being measured — the same file, with the same imports, can
gain or lose hub status purely because something unrelated changed elsewhere in an 870-file graph.
Compare this to `module API surface (files exposed)`, a genuinely reliable count-based hard constraint
in the same file: its rule ("is this the target module's `index.ts`, yes or no") is a fixed structural
check, not a statistic recomputed from the current run. `bidirectional hub count` uses the same
count-based framing but a *floating* statistic underneath, and that's exactly the part that's broken.

**Proposed fix, and it's validated, not just argued**: freeze `medianFanIn`/`medianFanOut` in the
baseline JSON at the last `--update`, the same way `moduleApiSurfaceFiles` and every other
hard-constraint number is already frozen between baselines. Recompute each file's *own* fanIn/fanOut
fresh every run (that part is fine — it's real, per-file data), but compare against the frozen
threshold, not a threshold recomputed from this run's graph. Re-ran both adversarial cases from this
report under that rule (`frozen-median-check.mjs`, frozen at the actual baseline's medians, fanIn>10 /
fanOut>10):

```
                                    floating (today)      frozen (proposed)
current graph, no mutation:        151                    141
types.ts split (§2):        151 -> 179  (Δ -28)     141 -> 119  (Δ +22)   <- flips to correct sign
barrel-routing (§6):        151 ->  45  (Δ +106)     141 -> 261  (Δ -120) <- flips to correct sign
```

Both adversarial cases — the ones that make today's metric actively misleading — flip to the
*correct* sign under a frozen threshold: the real structural improvement (`types.ts` split) now scores
as an improvement, and the fake improvement (barrel-routing, which doubles propagation cost) now
correctly scores as a large regression. This wasn't cherry-picked; these are the two most adversarial
mutations tested in this entire investigation, and the frozen-threshold version got both of them right
where the current version got both of them backwards.

**Trade-off to flag honestly**: a frozen threshold no longer self-normalizes as the codebase grows
organically — over a long enough horizon (years, not this ratchet's typical cadence) the fixed 10/10
bar would need re-baselining as the median file naturally gains more imports. That's an acceptable
cost for a ratchet that's already `--update`-able on demand, and it's the same cost every other
count-based metric in this file already accepts.

**What to do with the current 151 number in the meantime**: treat it as a diagnostic snapshot (the
`--list` membership enumeration has real value — this whole investigation depended on it), not as a
trend signal. Don't chase the count down; don't let a future run's count going up block or shame a
real fix without re-deriving what happened, the way §2 required here.

## 8. What could not be determined, and why

- **Symbol-level split contents for #3-7** (`members/index.ts`, `theme/index.ts`,
  `routing/index.ts`, `redirects/index.ts`, `deployments/static-publish/index.ts`): confirmed each
  carries real logic beyond re-exports (via line count / `export from` ratio, not a full read), but
  did not read each file to name which specific exports move where. Left as a follow-up for whoever
  picks up implementation — do not implement from the module-name-only signal in §3 alone.
- **Whether the 279-edge, all-at-once barrel-routing simulation in §6 generalizes to a partial/targeted
  routing** (e.g. just the `core` and `db` modules, which top the real `deep imports bypassing index.ts`
  list at 129 and 88 edges respectively) — not separately measured. The mechanism (fan-out explosion
  through a fattened barrel) should still apply, but the *magnitude* at smaller scale is unverified.
- **Whether `src/core/` and `src/db/` even have an `index.ts` to route through** — the simulation
  skips rerouting when the target module has no `index.ts` node in the graph, and 239 of the 518
  deep-import edges reported in the real tool's informational count were left un-rerouted for this
  reason (279 rerouted here vs. 518 total bypass edges in the real tool's own count — the gap is
  edges into modules without an `index.ts`, or possibly a small definitional mismatch between this
  script's module-has-index check and the real tool's; not reconciled exactly).
- **No fix was proposed for the `server` module's remaining ~20 hubs** outside the `types.ts`
  concentration already covered — `seo`, `newsletter`, `assistant`-site (non-tool-registration),
  `widgets`, and `deployments` module-internal hub clusters were enumerated (§3/§4 table) but not
  individually traced for split feasibility given the context budget for one investigation pass.

## Verification

```
npm run check:architecture -- --list   # 870 files, 151 hubs, matches every number in this report
git status --porcelain -- src/ .dependency-cruiser.cjs development/scripts/check-architecture.baseline.json
                                        # clean before and after every experiment -- no source edits
```

No refactor was implemented. `plugin-runtime/` and `src/server/routes/admin/plugins/uninstall.ts`
were not touched — read-only graph analysis only, scratchpad-local.
