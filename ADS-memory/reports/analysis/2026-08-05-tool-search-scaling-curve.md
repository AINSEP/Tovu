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

## Headline finding

**doc2query's real advantage over the alternatives is not "generally better retrieval" — it
specifically blunts the failure mode that catalog growth actually produces.** Under the current
production config (shipped keywords), a new tool that deliberately shares vocabulary with an
existing domain (a `notifications_` feature landing next to `newsletter_`, an admin-dashboard
`widgets_`-adjacent feature next to the real `widgets_` domain) is **~6x more likely, per tool, to
steal a top-1 slot than a generic new-domain tool** (9.0%/tool vs 1.5%/tool at catalog size 1000).
Under doc2query, that gap collapses to **~1.9x** (3.0%/tool vs 1.6%/tool) — doc2query's synthetic
per-tool questions specifically neutralize the near-neighbor lexical-competition mechanism, not
just overall catalog dilution. This is a mechanism-level argument for doc2query, not a scoreboard
one: it says WHY it holds up as the catalog grows, and predicts it will keep holding up
specifically against the kind of growth (adjacent, vocabulary-overlapping features) that's most
likely to actually happen. Full evidence in "Addition 2" below.

## Distractor policy (summary — full policy lives in `tool-search-distractors.ts`'s module header)

- **Blind authoring, enforced by order of operations.** The distractor fixture was generated
  and committed BEFORE this report's author read the scorer or the held-out query file, per
  `AI-Dev-Shop/harness-engineering/agent-evals/eval-design-playbook.md`. Style was calibrated by
  reading all real tools' verbatim ids/descriptions (131 at the time of that read, now 133 — see
  "Labeling note") from the actual registration source files — never the eval files.
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
  catalog to have enriched descriptions — a catalog where only the real tools got doc2query would
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

**Concern:** the distractors' doc2query was templated while the real tools' doc2query was
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

## Rerank ceiling decomposition — recomputed over the config that would actually ship (per review)

Milestone 2 originally reported this ceiling over "shipped keywords" (today's production config).
Per review: nobody would adopt a reranker on top of a baseline nobody would ship, so the
decision-relevant number is the ceiling over **doc2query+HyDE prompt** — the best-performing,
most growth-resistant config from the sections above. Both are reported; the gap between them is
itself an important finding.

**doc2query + HyDE prompt (the config anyone would actually adopt):**

| size | already #1 | addressable (reranker could fix) | unreachable (not even in top-10) | ceiling |
|---|---|---|---|---|
| 131 | 77.7% | 20.8pp | 1.5% | **98.5%** |
| 250 | 77.7% | 19.2pp | 3.1% | **96.9%** |
| 500 | 76.2% | 21.5pp | 2.3% | **97.7%** |
| 1000 | 74.6% | 23.1pp | 2.3% | **97.7%** |

**This reverses the earlier conclusion. Under the config that would actually ship, the ceiling
stays consistently near 97-98% across the entire range — it does NOT meaningfully erode as the
catalog grows to 1000 tools.** The already-#1 rate declines mildly (77.7%→74.6%, tracking the
top-1 numbers above), but the addressable band GROWS slightly (20.8pp→23.1pp) to compensate, and
the unreachable band stays consistently tiny (1.5-3.1%, essentially noise at n=130). **A reranker
built on top of doc2query+HyDE would remain a highly viable mitigation all the way to 1000 tools**
— the opposite of what the shipped-keywords-only view suggested.

**shipped keywords (today's production config, kept for contrast):**

| size | already #1 | addressable (reranker could fix) | unreachable (not even in top-10) | ceiling |
|---|---|---|---|---|
| 131 | 23.8% | 40.0pp | 36.2% | 63.8% |
| 250 | 24.6% | 36.9pp | 38.5% | 61.5% |
| 500 | 21.5% | 34.6pp | 43.8% | 56.2% |
| 1000 | 18.5% | 33.1pp | 48.5% | 51.5% |

This row DOES erode substantially (ceiling 63.8%→51.5%, unreachable band 36.2%→48.5%) — but that
is a property of shipped keywords specifically, not of retrieval-plus-reranking in general. **The
practical implication is the opposite of the milestone-2 framing: the choice of retrieval config
determines whether a reranker keeps paying off as the catalog grows, far more than catalog growth
itself erodes reranking's value.** Adopting doc2query+HyDE now would make a future reranker
decision essentially insensitive to further catalog growth in this range; staying on shipped
keywords would not.

## Bias verdict — tested, not just named (per review)

Milestone 1 claimed a clean optimistic bound; milestone 2's correction backed off to "likely
optimistic but not unidirectional" without adjudicating. Per review, that's a true statement that
leaves the owner unable to act, so here is a tested verdict.

**The specific mechanism under test:** distractors reuse this fixture's own boilerplate phrases
("Read-only.", "Call this to find an id before calling X"). If those phrases ALSO appear in real
tool descriptions, adding hundreds of distractor documents lowers BM25's global IDF for those
phrases, which could shuffle the ranking among the ORIGINAL real tools for reasons that have
nothing to do with genuine new competition — a template artifact that would make this curve
OVERSTATE true degradation (pessimistic bias, opposite of milestone 1's claim).

**Discriminator 1 (the one specified in review): the "no keywords" row's degradation slope.**
Raw, unaugmented real descriptions are the row most exposed to this mechanism (real tools get no
extra vocabulary to fall back on, so they compete on the same boilerplate-heavy terms as
distractors) and least protected by anything. If the artifact dominates, this row should degrade
disproportionately. It does not: relative top-1 decline from size 131→1000 is 18.2% for "no
keywords" (11%→9%) versus **25.0% for shipped keywords** (24%→18%) and 13.9% for HyDE — "no
keywords" sits in the middle, not at the top. The row keyword augmentation is supposed to protect
(shipped keywords) degrades MORE, not less, than the unprotected row. That runs counter to the
artifact-dominates prediction. (Confound, stated plainly: shipped keywords' extra decline is also
explained by near-neighbor distractors being deliberately designed to compete with exactly the
domains that have keyword entries — a genuine-competition explanation, not an artifact one — so
this discriminator alone is suggestive, not conclusive.)

**Discriminator 2 (found in addition to the requested one): new-domain distractors' direct win
rate versus their share of injected volume.** New-domain distractors carry the SAME boilerplate
phrases as near-domain ones but have no deliberate content overlap with any real domain — they are
the cleanest available proxy for "boilerplate-sharing alone, without genuine competition." At size
1000 they are 670 of 869 injected tools (77% of the boilerplate-sharing volume) but directly cause
only 10 of 106 shipped-keywords misses (9.4%). If bulk boilerplate-sharing volume alone were a
powerful ranking-shifting force, the dominant-by-volume category should show a much larger
footprint than 9.4% of misses. It doesn't.

**Discriminator 3 (a magnitude bound, not a direction test): the boilerplate was already common
in the real catalog before any distractor existed.** At least 18 of the real tool descriptions
(≥14% of 133, confirmed by grep against the actual source: `src/media/agent-tools.ts`,
`src/forms/agent-tools.ts`, and others) already contain the literal phrase "Read-only." — this is
a pre-existing house convention this fixture extended, not something invented by templating.
BM25's IDF is logarithmic in document frequency: a term that was ALREADY common (already low IDF,
already contributing little to any score) has much less room to be pushed further down than a term
that started rare. Diluting an already-low-discriminative-power term produces a comparatively
small marginal score change, bounding how much damage this specific mechanism can do regardless of
direction.

**Verdict: net optimistic, but only mildly so — not the clean bound milestone 1 claimed, and not
"genuinely indeterminate" either.** The newly-tested pessimism mechanism (boilerplate IDF dilution)
is real in direction — addition 2 shows distractor-caused misses are a genuine and growing share of
degradation (7%→26%) — but bounded in magnitude by discriminators 1-3 above: the row most exposed
to it doesn't degrade disproportionately, the category that carries it without genuine competition
has weak direct effect despite dominating injected volume, and the shared phrases were already
low-IDF before this experiment existed. The ORIGINAL optimism source from milestone 1 — real,
independently-authored future tools would carry genuinely varied prose from different engineers
over time, almost certainly MORE lexically distinct from each other and from the real catalog than
936 tools drawn from one finite phrase bank — remains completely untested here and is plausibly
larger in magnitude than anything measured in this section. That untested, larger factor is why
the verdict leans optimistic rather than landing on "indeterminate": there is a real, unmeasured
reason to expect true degradation to be WORSE than this curve shows, and no comparably strong
untested reason to expect it to be better. Treat every absolute number in this report as a
plausible **understatement** of true degradation, by an amount this experiment cannot bound
further without a bespoke-prose distractor set — which was judged not worth the effort at this
scale (see Distractor policy).

## Labeling note

The real catalog is currently **133 tools**, not the 131 several module docstrings elsewhere in
this codebase still say (it grew by 2 between when those were written and this run, 2026-08-05).
`distractorsForSize(size)` computes `need = size - 131` regardless, so actual catalog sizes in
this run are 133/252/502/1002 tools, not exactly 131/250/500/1000. This is a pure labeling
imprecision — it does not affect any relative comparison, shape, or decomposition above, and the
tables are all labeled with the nominal (rounder) size for readability.

## Bottom line for the owner

1. **doc2query's advantage is mechanistic, not just scoreboard.** It specifically blunts
   near-neighbor lexical competition — the failure mode most likely to actually occur as the
   product grows into adjacent features — collapsing the near-vs-new danger-rate gap from ~6x
   (shipped keywords) to ~1.9x (doc2query). See "Headline finding."
2. **No crossover risk in the range tested (up to 1000 tools).** The ranking of the 5 approaches
   is stable throughout; doc2query+HyDE is safe to adopt without worrying the ranking inverts as
   the catalog grows to plausible near-term sizes.
3. **doc2query+HyDE is both the best performer AND the most growth-resistant** (78%→75% top-1,
   −3pp over 7.5x catalog growth, almost immune to distractor-caused misses specifically). Plain
   HyDE degrades roughly 3x faster and is the approach most vulnerable to near-neighbor
   competition, because it only transforms the query and never touches competing documents' own
   vocabulary.
4. **A future reranker remains highly viable IF built on doc2query+HyDE — the config choice
   matters more than catalog growth itself.** Recomputing the rerank ceiling over doc2query+HyDE
   (the config that would actually ship) instead of shipped keywords reverses the earlier
   conclusion: the ceiling stays at 97-98% throughout, not 64%→52%. That erosion is a property of
   staying on shipped keywords, not an inherent cost of catalog growth.
5. **Most degradation is IDF/ranking churn among existing tools, not new tools stealing top spots**
   — even at 1000 tools, only ~26% of shipped-keywords misses are directly caused by a distractor
   winning. "Ship fewer/more distinct new tools" would help only partially; the existing catalog's
   own internal ranking also erodes from sheer volume, under approaches that don't enrich the
   corpus.
6. **Near-neighbor competition is far more dangerous per tool than generic new-domain growth**
   under shipped keywords (~6x higher miss rate) — worth extra design care whenever a new domain is
   genuinely adjacent to an existing one, UNLESS doc2query-style per-tool enrichment is adopted,
   which blunts most of that gap.
7. **Read every absolute number here as a likely UNDERSTATEMENT, not an overstatement, of true
   degradation.** Tested and verdicted, not just flagged (see "Bias verdict"): the mechanism that
   could make this curve overstate degradation (shared boilerplate lowering IDF for real tools too)
   is real in direction but small in measured magnitude; the mechanism that would make it
   understate degradation (real future tools being written by different engineers with genuinely
   more varied prose than 936 tools drawn from one phrase bank, and therefore harder for the real
   world to out-compete than these distractors are) was not tested here and is plausibly larger.
