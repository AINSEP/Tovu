# Fabricated tool-search accuracy stat — fixed in two shipping prompt surfaces

Date: 2026-09-08
Commits: `9573c90f` (first pass — later found to be wrong direction, see §2), `37a78494` (second
pass — number-free source fix, see §3), `f74bfdec` (third pass — test-layer fix, see §7) on
`restructure/apps-website-phased`

**Revision note:** this report went through three passes.
1. Replaced the fabricated 98%/100% figure with what looked like a true measured 87%/94% figure.
   Rejected — see §2 for why a *correct* number is the same defect shape as a *false* one here.
2. Rewrote both prompt surfaces with no percentage at all (§3) — this is the correct source fix
   and it stands.
3. The regression tests from pass 2 still pinned the ENTIRE corrected sentence as one exact
   string (`assert.equal` against a full paragraph in one file, one long `.includes()` clause in
   the other). That reproduces the same brittleness one layer up: a maintainer improving the
   retry-guidance wording later would have to fight a green test over prose, not over the property
   that actually matters. §7 rewrites both tests to assert only the load-bearing phrases plus the
   `\d+%` absence guard, dropping the full-paragraph pin.

Sections below are written to reflect the final state; §2 preserves the reasoning for why the
first pass was rejected, and §7 the reasoning for why the full-string test pin was also wrong,
since both are the durable part of this fix.

## 1. Defect confirmed, verified myself (not taken on the dispatcher's word)

`apps/website/src/assistant/byok-tool-surface.ts:143-147` (line numbers had drifted from the
briefed 146-147 — same text) told the model, inside the `search_tools` meta-tool's `limit`
parameter description:

> "If none of the returned candidates fit what you need, search again with a HIGHER limit (try
> 25) before concluding no tool exists — measured on a 130-case blind set, the right tool is in
> the top 10 98% of the time but in the top 20 100% of the time, so the remaining misses are
> ranked just below the default cutoff, not absent."

A second, unbriefed occurrence — same shape, same numbers — in
`apps/website/src/server/inbound/assistant/assistant-system-overlay.ts:168-172`, inside
`buildBaseSystemOverlay()`:

> "...before concluding no tool exists: on a 130-case blind set the right tool is in the default
> top 10 98% of the time and in the top 20 100% of the time, so a near-miss is almost always
> ranked just below the cutoff rather than absent."

**Verified myself that the claim is not reproducible from its own cited source:**

- `development/evals/tool-search-heldout-v2.eval.ts:115`: `const CUTOFFS = [1, 3, 5, 10] as
  const;` — this is the "130-case blind set" both texts point to (n=130 is that eval's own case
  count). **It has no top-20 cutoff at all.** It structurally cannot have produced the "100% in
  the top 20" half of either claim.
- `git log -S "in the top 20 100% of the time"` (run by me, after my own fix removed the phrase,
  so it now shows as a removal too) returns three commits: my own fix commit, a report commit
  that quotes the phrase verbatim while describing it as fabricated, and — the actual origin —
  **`d6ac6975`, 2026-08-08, "refactor(assistant): rework execution model-listing and
  test-connection routes"**. `git show d6ac6975` shows the phrase added as brand-new `+` lines to
  both `src/assistant/agent-daemon-server.ts` (this repo's pre-extraction home for what is now
  `assistant-system-overlay.ts`) and `src/assistant/byok-tool-surface.ts`, simultaneously, with no
  eval run, report, or commit-message citation backing it.

  **This corrects a claim in `ADS-memory/reports/2026-09-08-parent-tool-read-eval.md` §0.1**,
  which attributed the claim's origin to `708e81b2` (the later `src/`→`apps/website/src/` rename)
  and said "no commit introduces it as new text; it was carried through, never derived." That's
  imprecise: the rename commit doesn't show up under `git log -S` for this phrase because it's a
  100%-similarity rename (the pickaxe sees no net change in occurrence count across it), which
  masks the real origin one layer further back. `d6ac6975` (Aug 8) predates the rename (Aug 28) by
  three weeks and is where the number was actually invented. I'm flagging this as a correction to
  that report rather than silently using its (wrong) attribution.

## 2. Why the "true" number is not the fix — the actual finding

My first pass replaced 98%/100% with 87%/94%, sourced from
`ADS-memory/reports/2026-09-08-parent-tool-read-eval.md`. The coordinator correctly rejected this.
Reading that report's own numbers myself (not trusting any quoted figure secondhand) surfaces
exactly why:

| arm | denominator | top-10 | top-20 |
|---|---|---|---|
| BASELINE (177 tools, pre-collapse) | n=130, whole set | 87% (113/130) | 94% (122/130) |
| D1 — resource-keyed cards (the design that shipped as `content_read`) | n=130, whole set | 87% (113/130) | **95%** (123/130) |
| same D1 arm | n=34, cases inside the collapse only | 85% (29/34) | **97%** (33/34) |

Three real, correctly-labeled numbers, not a contradiction between sources — but the top-20 figure
already moved **94% → 95%** the moment a same-day, same-repo change (`content_read`) landed, and a
different, non-comparable pair (85%/97%) exists right next to it on a different denominator ready
to be misquoted as the whole-set figure. This is not a one-time coincidence: it is what a
retrieval percentage inherently is — **a property of the current catalog and current keywords,
re-measured by construction every time either changes.** `byok-tool-surface.ts` and
`assistant-system-overlay.ts` are shipped instruction text; nothing re-measures a number written
into them. Writing today's true number into that text reproduces the original defect's mechanism
exactly — a stale, unverified constant asserted as current fact to the model — with a better
initial value and the same eventual drift. That the original number was fabricated from nothing
and this one would start out true does not change the failure mode it decays into.

**The actual fix is therefore to make no percentage claim at all**, in either file, and to encode
the behavior the number was trying to produce directly: a miss at the default search cutoff is
weak evidence, not proof — retry wider/different before concluding a tool doesn't exist, and say
so honestly if it still comes up empty. That statement doesn't need a number and doesn't go stale
as the catalog changes.

## 3. Final fix applied

### `apps/website/src/assistant/byok-tool-surface.ts:143-147`

Old: quoted in §1.

New:
```
`Max hits to return (1-${SEARCH_LIMIT_MAX}). Optional, defaults to ${SEARCH_LIMIT_DEFAULT}. ` +
`If none of the returned candidates fit what you need, search again with a HIGHER limit (try ${SEARCH_LIMIT_MAX}) ` +
`and different phrasing before concluding no tool exists — a differently-worded or wider search often surfaces a tool the ` +
`default cutoff missed, so a miss at the default limit is weak evidence, not proof that no matching tool exists. If a retry ` +
`with different terms still finds nothing, say you could not find a matching tool rather than assuming none exists.`,
```

Rendered: "Max hits to return (1-25). Optional, defaults to 10. If none of the returned candidates
fit what you need, search again with a HIGHER limit (try 25) and different phrasing before
concluding no tool exists — a differently-worded or wider search often surfaces a tool the default
cutoff missed, so a miss at the default limit is weak evidence, not proof that no matching tool
exists. If a retry with different terms still finds nothing, say you could not find a matching
tool rather than assuming none exists."

### `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts:168-171`

Old: quoted in §1.

New:
```
"again with a higher limit (up to 25) or different phrasing before concluding no tool exists: a " +
"differently-worded or wider search often surfaces a tool the default cutoff missed, so a miss " +
"at the default limit is weak evidence, not proof that no matching tool exists. Do this before " +
"reaching for Bash, curl, or " +
```

This file already carried good failure-mode guidance a few sentences later ("What to do instead
when you believe no tool fits: search_tools again with different phrasing and a higher limit, and
if it still does not exist, SAY SO...") — the old "100% of the time" claim directly contradicted
it (a guaranteed-to-exist claim next to a real not-found path). The fix removes that contradiction
as a side effect, not just the falsehood.

Verified no `%` character remains in either shipped file: `grep -n "%" byok-tool-surface.ts
assistant-system-overlay.ts` → no matches.

## 4. Regression tests — assert the absence of the defect SHAPE, not just the new string

A test that only pins the corrected sentence would pass again the moment someone adds a fresh
number next to it — that is exactly how the original defect could recur. Each file's test suite
now carries two tests:

1. **Exact-text pin** of the new, number-free wording (full string equality in
   `byok-tool-surface.test.ts`; exact-substring `.includes()` in
   `assistant-system-overlay.unit.test.ts`, matching that file's own established style for
   asserting slices of one large concatenated string).
2. **A structural guard**: `assert.doesNotMatch(description, /\d+%/)` (and, for the overlay, over
   the whole rendered string, both flag values — verified first that `%` does not appear anywhere
   else in that file so the global assertion can't false-negative on an unrelated `%`). This one
   fails on ANY hardcoded percentage reintroduced later, true or false, which is the property that
   actually needs guarding.

**RED** (before the number-free source fix — both structural-guard tests and both text-pin tests
failing against my own still-percentaged first-pass text):
```
✖ search_tools' limit description tells the model a miss at the default cutoff is weak evidence, not proof no tool exists
✖ search_tools' limit description names no coverage percentage — a hardcoded number here is the exact shape of the defect this fixes, regardless of whether the number happens to be true today
✖ both overlays tell the model a miss at the default cutoff is weak evidence, not proof no tool exists, and name no coverage percentage
```
(full assertion diffs captured in the test run output, not reproduced here — each showed
`actual` still containing `87%`/`94%` against the number-free `expected`, and the `doesNotMatch`
guard failing against that same text.)

**GREEN** (after the fix):
```
✔ search_tools' limit description tells the model a miss at the default cutoff is weak evidence, not proof no tool exists
✔ search_tools' limit description names no coverage percentage — a hardcoded number here is the exact shape of the defect this fixes, regardless of whether the number happens to be true today
✔ both overlays tell the model a miss at the default cutoff is weak evidence, not proof no tool exists, and name no coverage percentage
```

Full run: `node --import tsx --test apps/website/src/assistant/__tests__/byok-tool-surface.test.ts apps/website/src/server/inbound/assistant/__tests__/assistant-system-overlay.unit.test.ts`
from repo root — 42 tests, 38 pass, 4 fail. **The 4 failures are pre-existing and unrelated to
this fix** (present identically before any of my edits): `execute_delegated_tool`/`describe_tool`
calls against `workspace_get` now get `unknown tool "workspace_get"` because another agent's
in-flight `content_read` migration already removed it as a standalone tool id
(`content-read-tool.ts:176` maps it into `content_read`'s resource registry instead). Not touched
— out of scope, actively owned elsewhere.

`uptime` at run time: `load averages: 29.00 33.34 48.58` (high — multiple agents active in this
shared tree). Both suites are pure in-process `node:test` with no timing-sensitive assertions, so
load does not affect correctness.

## 5. Citation fix: `ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md` §5

That report's Recommendation section cited "the measured 98%-top-10/100%-top-20 accuracy on a
130-case blind set (`byok-tool-surface.ts`'s own comment)" as supporting evidence for its
conclusion that the retrieval layer "works well when a tool's description/keywords are honestly
populated." The conclusion is not disturbed by this defect (it's argued on other grounds too —
that report's own §3/§4), but the citation was the fabricated figure.

Fixed in place: replaced the citation with a pointer to
`ADS-memory/reports/2026-09-08-parent-tool-read-eval.md`'s real eval (run against the actual
shipped catalog), added a disclosed correction blockquote explaining what was wrong and why no
replacement figure is substituted, and left the original conclusion sentence otherwise intact. Did
not delete the conclusion, per instruction. Verified after editing: `grep -n "98%\|100% of the
time" <file>` returns exactly one hit, inside the disclosed correction blockquote itself — no
stray uncorrected occurrence remains.

## 6. Scope discipline

No-touch list, all confirmed untouched: `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`,
the tool registry, `apps/admin/src/features/plugins/agent-plugin-source-catalog.ts` and its test
(still `UU`), `apps/website/src/assistant/content-read-tool.ts`,
`apps/website/src/assistant/tool-registrations.ts`, `apps/website/src/assistant/tool-search-keywords.ts`,
`apps/admin/src/lib/agent-pages.ts`. Did not run any `serve-command*.integration.test.ts`. Commits
use explicit pathspecs on both `git add` and `git commit`, unique commit-message files in the
scratchpad dir, no `git add -A`.

`content-read-tool.ts:20` also carries "85%/87% top-10" in a header doc comment, citing the same
eval lineage — flagged by the coordinator as the same rot at a lower grade, but explicitly not a
third finding here: that comment is never read by a model (not model-facing, not shipped
instruction text), the file is on the no-touch list, and it is owned by another agent's in-flight
work. Left untouched, disclosed rather than silently skipped.

## 7. Why no number belongs in this instruction text — written for the next person who reopens this

This section exists because the trap already sprang once inside this same dispatch: the first fix
(§2, §4) replaced a false constant with a true one and shipped it anyway, including in a test that
then had to be rewritten again (this section). The pattern is worth naming explicitly so a future
reader doesn't repeat it a third time.

**The property that matters is not "is this number currently true." It's "does anything make this
number stay true."** A retrieval percentage is computed by running an eval against a specific
snapshot of the tool catalog and its keywords. `byok-tool-surface.ts` and
`assistant-system-overlay.ts` are prompt text compiled once and read by a model at run time —
nothing about loading, building, or serving that text re-runs the eval, checks the eval's age, or
warns when the catalog it was measured against has changed. The moment the catalog changes (which
happened same-day, mid-dispatch, via the `content_read` collapse — top-20 moved 94%→95% on the
exact same eval), the asserted number silently stops matching reality, and nothing in the system
notices. That is mechanically identical to how the original 98%/100% figure survived unnoticed for
a month: not because someone lied once, but because the surface that states it has no path back to
the thing that would keep it honest.

**The fix is therefore structural, not arithmetical.** Two rules for anyone touching either file
again:
1. **No coverage percentage, ratio, "N out of M", or similarly-shaped retrieval-accuracy claim
   belongs in `byok-tool-surface.ts` or `assistant-system-overlay.ts`.** If a number is genuinely
   wanted for context, it belongs in an eval report under `ADS-memory/reports/` or in the eval file
   itself (`development/evals/`), where re-running the eval is the mechanism that keeps it honest.
   Prompt text may point at "the retrieval eval" by name; it must not restate the eval's output as
   a fact about itself.
2. **The behavior worth encoding is the operational one, not the statistical one**: a miss at the
   default search cutoff is weak evidence, not proof of absence — retry with a wider limit and
   different phrasing, and if that still finds nothing, say so honestly rather than assuming no
   tool exists. That sentence is true regardless of what the catalog measures this week, because it
   describes what to DO on a miss rather than how often a miss happens.

**This same reasoning applies one layer up, in the test suite (this pass's actual change).** The
regression tests added in §4 initially pinned the ENTIRE corrected sentence — one `assert.equal`
against a full paragraph in `byok-tool-surface.test.ts`, one long `.includes()` clause spanning the
whole sentence in `assistant-system-overlay.unit.test.ts`. That is the identical failure shape one
level removed: a test that locks exact prose down to the word makes future *wording* improvements
(not measurement drift, but honest editing — "retry with different phrasing" could later become
"try a different search term or a synonym," say) fight a green test for no reason connected to
correctness. **A test should pin the property the fix establishes, not the sentence that happens to
express it today.** The properties here are (a) the description still names the specific
behavior — retry-on-miss, weak-not-absent evidence, honest failure — and (b) it names no
percentage. Both are asserted now via targeted phrase/regex checks
(`byok-tool-surface.test.ts:129-141`, `assistant-system-overlay.unit.test.ts:88-97`) instead of a
full-paragraph pin. If a future edit changes connecting words but keeps the behavior and drops no
percentage back in, these tests should — and now do — stay green.

## 8. Architecture Audit

Status: **PASS**. All changes are text-only edits to string literals inside existing exported
constants/functions, plus one documentation correction in a report file (not shipped code). No
new modules, no new imports, no layer or boundary crossed. No ADR scope-glob match for either
shipped file.

## 9. Pre-Completion Checklist

- Requirements re-verified against both dispatch messages, including the direction change: defect
  confirmed against the actual files (line numbers corrected), `CUTOFFS` and `git log -S` verified
  directly rather than trusted from either the original dispatch or the eval report, the eval
  report's own origin-commit claim corrected, three real (non-conflicting, differently-denominated)
  figures read directly from the eval report and explicitly NOT hardcoded into shipped text,
  reasoning for that decision stated explicitly here for durability, structural (`\d+%`) regression
  guard added so the shape of the defect — not just its old value — cannot recur unnoticed, second
  occurrence fixed in the same shape, citation in the 2026-09-07 audit report corrected without
  deleting its conclusion or introducing a new bare figure.
- Fresh evidence commands: `git show d6ac6975` / `git log -S`, `grep -n CUTOFFS
  development/evals/tool-search-heldout-v2.eval.ts`, and the RED→GREEN test run in §4 (run twice).
- No certified test deleted or weakened — only additions (2 new tests per file, replacing my own
  earlier, now-superseded 2 tests per file from the rejected first pass).
- Scope: 4 shipped/test files + 1 report-citation fix, all disclosed.
- Open items: the 4 pre-existing `workspace_get` failures (§4), not caused by or fixed in this
  dispatch.
