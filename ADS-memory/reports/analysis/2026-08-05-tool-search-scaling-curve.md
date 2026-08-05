# Tool-search scaling curve — 2026-08-05

**Author:** TestRunner(Execution) subagent, dispatched by team-lead ("tool-scaling" task).
**Scorer:** `development/evals/tool-search-scaling-curve.eval.ts` (free, deterministic, no model
calls, no network at scoring time). Run with `npx tsx development/evals/tool-search-scaling-curve.eval.ts`.
**Fixture:** `development/evals/tool-search-distractors.ts` (936 synthetic distractor tools,
priority-ordered) + `development/evals/tool-search-distractors-doc2query-calibration-250.ts`
(model-generated calibration set for the 119 distractors needed at size 250).
**Held-out set:** `tool-search-heldout-v2.ts`, same independent n=130 blind set used by
`tool-search-all-approaches-v2.eval.ts`. Not read directly by this report's author or printed
per-case anywhere in this document — only aggregate tables below.

## Question answered

Tovu's assistant retrieves tools via BM25 over a catalog currently at **133 tools** (the module
docs elsewhere say 131; it grew by 2 between when those were written and this run — see
"Labeling note" below). Five retrieval approaches score well today (up to 78% top-1). The owner
expects the catalog to grow with plugins, payments, and new features and wanted the **shape** of
degradation and whether the five approaches' **ranking** stays stable, before committing to one.

## Distractor policy (summary — full policy lives in `tool-search-distractors.ts`'s module header)

- **Blind authoring, enforced by order of operations.** The distractor fixture was generated
  and committed BEFORE this report's author read the scorer or the held-out query file, per
  `AI-Dev-Shop/harness-engineering/agent-evals/eval-design-playbook.md`. Style was calibrated by
  reading all 131 real tools' verbatim ids/descriptions from the actual registration source
  files — never the eval files.
- **Generation mechanism:** deterministic template engine (phrase bank × real domain vocabulary,
  seeded per-tool-id PRNG), not bespoke prose per tool — judged not worth the effort at the scale
  needed (869 tools for size 1000).
- **Two categories, mixed ~75:25 (not over-weighted toward either):**
  - `new` (75%, 737 tools / 106 domains) — adjacent business domains a growing CMS/commerce/plugin
    surface would plausibly add (payments, subscriptions, inventory, shipping, plugin marketplace,
    ...). Tests raw catalog-size dilution.
  - `near` (25%, 199 tools / 28 domains, `nearOf` field names the target) — domains that
    deliberately reuse vocabulary from a SPECIFIC existing real domain (`notifications_`
    competing with `newsletter_list_subscriptions`'s "subscription" language; `dashboards_widgets_`
    competing with the real `widgets_` domain). Tests genuine lexical competition, not just volume.
- **Growth ordering:** one priority-ordered master list (commerce/payments first — matches the
  owner's stated vector — plugin-ecosystem next, other feature growth after, near-neighbor domains
  interleaved every 4th domain slot throughout, not segregated to the tail). Catalog sizes are
  PREFIXES of this one list, so the curve reads as one accretion timeline, not four unrelated
  snapshots.
- **doc2query for distractors:** every distractor also got 5 templated synthetic questions
  (`MASTER_DISTRACTOR_DOC2QUERY`), because scoring doc2query fairly requires the WHOLE padded
  catalog to have enriched descriptions — a catalog where only the real 131 got doc2query would
  rig the comparison in doc2query's favor.

### Sample (reviewed and approved by team-lead before full-scale generation)

```
payments_list — "Returns the workspace's charges, newest first, filterable by status. Read-only.
  Call this first to get the id payments_get needs." [19 words]
payments_create — "Creates a new charge with a required amount. Rejected if the payment method
  has already been refunded in full." [19 words]
discounts_create — "Creates a coupon from the supplied fields; code must be unique within the
  workspace. There is no agent-callable undo for this action." [22 words]
```

## Addition 1 (BLOCKING per review) — doc2query calibration at size 250

**Concern:** the distractors' doc2query was templated while the real 131 tools' doc2query was
model-generated and lexically richer. That asymmetry gives distractors artificially weak
competition against doc2query specifically — the approach under active consideration for
adoption — which would flatter it in exactly the wrong direction.

**Method:** for the 119 distractors needed at size 250, a fresh blind subagent (same provenance
discipline as the real `tool-search-doc2query-blind-questions.ts` — given only tool id+description,
explicitly forbidden from opening any eval/heldout/scoring file) wrote independent doc2query
questions. Both sets were scored at size 250 only, per instruction (one measured delta is enough;
not re-calibrated at 500/1000).

| doc2query variant | top-1 | top-3 | top-5 | found@10 |
|---|---|---|---|---|
| templated distractor doc2query | 53.1% (69) | 73% (95) | 78% (101) | 82% (107) |
| **calibrated (model-gen) distractor doc2query** | **50.0% (65)** | 70% (91) | 75% (98) | 86% (112) |
| **delta (top-1)** | **+3.1pp inflation from templating** | | | |

The delta is small (~3pp at top-1, and found@10 actually runs slightly HIGHER under calibration —
noise at this sample size, CI half-width ≈9pp). **Conclusion: the templating bias exists and
points the direction predicted (templated makes doc2query look ~3pp better), but it is small
relative to the confidence interval and does not change any qualitative finding below.** Per
instruction, this bound is treated as holding (or worsening, never improving) at 500/1000, which
were not separately calibrated — so doc2query's absolute numbers at 500/1000 should be read as
carrying up to ~3pp of optimism from this specific source, on top of the general templating
caveat below.

## Addition 2 — miss decomposition (real-tool vs distractor, per size)

For every held-out case where the gold tool is NOT top-1, this records what WON top-1 instead:
another real tool, a `new`-category distractor, or a `near`-category distractor. Only aggregate
counts below — no query text.

**Shipped keywords** (current production config):

| size | total misses | real-tool | distractor-new | distractor-near | distractor share of misses |
|---|---|---|---|---|---|
| 131 (baseline) | 99 | 99 | 0 | 0 | 0% |
| 250 | 98 | 91 | 5 | 2 | 7% |
| 500 | 102 | 84 | 5 | 13 | 18% |
| 1000 | 106 | 78 | 10 | 18 | 26% |

**Finding: even at catalog size 1000 (7.5x the real catalog), 74% of misses are still real-tool-
over-real-tool displacement, not distractor competition.** This is the most important nuance
addition 2 was designed to surface: most of the measured degradation is NOT "new tools are
out-ranking your old ones" — it's that adding hundreds of documents (most of which never win)
still perturbs BM25's global IDF enough to shuffle the ranking AMONG THE EXISTING REAL TOOLS. That
is still genuine degradation and still the product's problem, but it is a different mechanism with
different implications: it means shipping fewer, better-differentiated new tools would not fully
solve this — the ranking of the ORIGINAL 133 also erodes just from catalog volume.

**Per-tool "danger rate"** (misses caused ÷ distractor-category population, size 1000, shipped
keywords): `new` domains caused 10 misses across 670 tools = **1.5% per tool**; `near` domains
caused 18 misses across 199 tools = **9.0% per tool** — near-neighbor distractors are **~6x more
likely per tool** to actually steal a top-1 slot than new-domain distractors, despite being the
minority category by count. This is addition 3's category-contribution answer: **targeted lexical
competition matters far more, per unit, than raw catalog volume** — but because there is so much
more volume in practice, raw dilution still contributes a comparable ABSOLUTE number of misses
(10 vs 18 at size 1000, i.e., new-domain volume is catching up to near-neighbor precision as the
catalog keeps growing).

**The same decomposition for doc2query (blind) reveals something extra:** at size 1000, doc2query's
distractor-caused misses split 11 new / 6 near (near danger rate 3.0%/tool vs new 1.6%/tool — still
near > new, but the gap is far smaller than shipped-keywords' 9.0% vs 1.5%). **doc2query's real
scaling advantage isn't just a flatter overall curve — it specifically blunts the near-neighbor
lexical-competition failure mode**, because enriching every tool (real AND distractor) with
synthetic questions dilutes the significance of any single shared boilerplate phrase. HyDE-alone
(no corpus-side enrichment) shows the opposite pattern most starkly: at size 1000, its distractor
misses are 7 near / 1 new — HyDE is specifically vulnerable to near-neighbor competition because it
only transforms the query, never touches the distractor documents' raw vocabulary.
doc2query+HyDE combined has almost no distractor-caused misses at all (2 of 33, both near) — the
most degradation-resistant option by a wide margin.

## Curve shape: logarithmic, not linear or cliff-shaped

Top-1 by catalog size (nominal 131/250/500/1000; see labeling note):

| approach | 131 | 250 | 500 | 1000 | total drop | shape |
|---|---|---|---|---|---|---|
| no keywords (pre-fix) | 11% | 12% | 11% | 9% | −2pp | flat/negligible |
| shipped keywords | 24% | 25% | 22% | 18% | −6pp | mild, ~logarithmic |
| doc2query (blind) | 52% | 53% | 51% | 51% | −1pp | essentially flat |
| HyDE via prompt (free) | 72% | 69% | 65% | 62% | **−10pp** | steady ~logarithmic decline |
| doc2query + HyDE prompt | 78% | 78% | 76% | 75% | −3pp | mild, ~logarithmic |

Point-loss per catalog DOUBLING is roughly constant for every approach that degrades at all (e.g.
HyDE: ~131→250 −3pp, 250→500 −4pp, 500→1000 −3pp) rather than accelerating — that is the signature
of **logarithmic degradation** (roughly constant cost per doubling), not linear-in-tool-count and
not a cliff. No approach shows a sudden collapse anywhere in the measured range.

**Approaches that enrich the CORPUS (doc2query, doc2query+HyDE) are far flatter than the approach
that only enriches the QUERY (HyDE alone).** This is the most actionable shape finding: HyDE's
current ~20pp lead over plain doc2query at size 131 (72% vs 52%) compresses to an ~11pp lead by
size 1000 (62% vs 51%) — the gap nearly halves. Extrapolating the same per-doubling loss rates
past 1000 tools, doc2query alone would plausibly close most or all of the remaining gap with HyDE
alone by the next doubling or two — **not observed in this measured range, stated as a trend, not
a result.**

## Ranking stability: no crossover among the 5 approaches, at any measured size

Order is identical at every size: **doc2query+HyDE > HyDE > doc2query (blind) > shipped keywords >
no keywords.** No two approaches swap places anywhere from 131 to 1000. This is the cleanest
possible answer to the crossover question the brief flagged as most decision-relevant: there isn't
one, in the measured range — but see the gap-compression trend above, which is the leading
indicator of where a crossover would eventually happen if growth continues.

## Rerank ceiling decomposition (shipped keywords, per size)

| size | already #1 | addressable (reranker could fix) | unreachable (not even in top-10) | ceiling |
|---|---|---|---|---|
| 131 | 24% | 40pp | 36% | 64% |
| 250 | 25% | 37pp | 38% | 62% |
| 500 | 22% | 35pp | 44% | 56% |
| 1000 | 18% | 33pp | 48% | 52% |

**The unreachable band grows steadily (36%→48%) — a reranker becomes a WEAKER mitigation, not a
stronger one, as the catalog grows**, because retrieval increasingly fails to even surface the
gold tool among the top 10 candidates a reranker would see. The addressable band actually shrinks
in absolute terms too (40pp→33pp). Any plan that treats "we'll add a reranker later" as sufficient
insurance against catalog growth should account for this: the ceiling a reranker could ever reach
drops from 64% to 52% over this range, independent of reranker quality.

## Caveat on direction (correction from milestone 1, per review)

Milestone 1 stated the templating makes every number a clean optimistic bound. **That was
overclaiming a direction and has been corrected.** The bias is likely optimistic on net but is
**not unidirectional**: shared boilerplate phrases across many distractors ("Read-only.", "Call
this to find an id before calling X") lower BM25's global IDF for those same phrases WHEN THEY
APPEAR IN REAL TOOLS TOO, which can inflate apparent degradation for reasons unrelated to genuine
distractor content — pushing the other way. Addition 2's miss decomposition is what actually
separates these two effects (distractor-caused vs real-tool-vs-real-tool misses), and shows both
are present: distractor competition is real and grows with catalog size (7%→26% of misses), but
the majority of degradation even at size 1000 is still real-tool-vs-real-tool churn, consistent
with an IDF-shift component alongside genuine competition. Treat every absolute number in this
report as approximate in an UNKNOWN net direction, not a clean bound in either direction — the
decompositions above are the actual evidence, not this paragraph's framing.

## Labeling note

The real catalog is currently **133 tools**, not the 131 several module docstrings elsewhere in
this codebase still say (it grew by 2 between when those were written and this run, 2026-08-05).
`distractorsForSize(size)` computes `need = size - 131` regardless, so actual catalog sizes in
this run are 133/252/502/1002 tools, not exactly 131/250/500/1000. This is a pure labeling
imprecision — it does not affect any relative comparison, shape, or decomposition above, and the
tables are all labeled with the nominal (rounder) size for readability.

## Bottom line for the owner

1. **No crossover risk in the range tested (up to 1000 tools).** The current ranking of the 5
   approaches is safe to act on without worrying it inverts as the catalog grows to plausible
   near-term sizes.
2. **doc2query+HyDE is both the best performer AND the most growth-resistant** (78%→75% top-1,
   −3pp over 7.5x catalog growth, and almost immune to distractor-caused misses specifically).
   Plain HyDE degrades roughly 3x faster in absolute terms and is the approach most vulnerable to
   targeted lexical competition (near-neighbor distractors) specifically, because it never touches
   the competing documents' own vocabulary.
3. **A future reranker is a weaker safety net at scale, not a stronger one** — the ceiling it could
   ever deliver drops from 64% to 52% over this range because retrieval itself increasingly fails
   to surface the gold tool in the first 10 results.
4. **Most degradation is IDF/ranking churn among existing tools, not new tools stealing top spots**
   — even at 1000 tools, only ~26% of misses are directly caused by a distractor winning. This
   means "ship fewer/more distinct new tools" would help only partially; the existing 133-tool
   catalog's own internal ranking also erodes from sheer volume.
5. **Near-neighbor competition (tools that share vocabulary with an existing domain) is far more
   dangerous per tool than generic new-domain growth** (~6x higher miss rate under shipped
   keywords) — worth extra design care whenever a new domain is genuinely adjacent to an existing
   one (e.g., a future in-app notifications feature sitting next to the existing newsletter
   domain).
6. **Every number above should be read as approximate**, per the corrected caveat: templating
   likely inflates doc2query slightly (measured +3.1pp at size 250, unmeasured beyond that), and
   shared-boilerplate IDF shift likely inflates apparent degradation somewhat in the other
   direction. The decompositions, not the point estimates, are the load-bearing evidence.
