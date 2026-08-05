# Tool search — canary results for four candidate approaches

Dispatched 2026-08-05 as a QA/E2E canary task. Runtime model: Claude Sonnet 5 (`claude-sonnet-5`).
Pre-reads confirmed loaded before any work: `AI-Dev-Shop/agents/qa-e2e/skills.md`,
`AI-Dev-Shop/harness-engineering/agent-evals/bug-taxonomy.md`,
`AI-Dev-Shop/harness-engineering/agent-evals/eval-design-playbook.md`,
`AI-Dev-Shop/harness-engineering/agent-evals/README.md`. Those three are written for seeded
bug-finding evals (code review / QA fixtures); this task is retrieval-quality measurement, not bug
seeding, so their scoring taxonomy doesn't map directly — the parts that *do* transfer and were
applied here: never author test cases with knowledge of what's being graded, keep a hidden/held-out
set honest, and report a number instead of a vibe.

Baseline re-confirmed by rerunning `development/evals/tool-search-quality.eval.ts` before touching
anything:

| set | top-1 | top-3 | found@10 |
|---|---|---|---|
| held-out BEFORE (no keywords) | 2/20 (10%) | 4/20 (20%) | 8/20 (40%) |
| held-out AFTER (current keywords) | 9/20 (45%) | 11/20 (55%) | 14/20 (70%) |

All four canaries below score against this SAME held-out set (`HELD_OUT_CASES` in
`tool-search-quality.eval.ts`) — no new eval cases were authored to score against. See the "real
operator query search" section for what was and wasn't found as an independent corpus.

## Statistical caveats — read this before trusting any percentage below

Added after team-lead review flagged it, and the flag was correct. n=20 means one case is worth 5pp,
and the 95% CI half-width on a single proportion is **~13-22pp** depending on where p sits (verified
numerically, not just cited): 45% ± 21.8pp, 20% ± 17.5pp, 65% ± 20.9pp. **Point-estimate deltas under
roughly 15-20pp between canaries are not distinguishable from noise if you treat each canary as an
independent sample of the true query distribution.**

But the canaries are NOT independent samples — every one of them scores the identical 20 cases under
a different configuration, which is a paired design and should be tested as one.
`development/evals/tool-search-canary-significance.eval.ts` (new, committed) runs a paired McNemar
exact test against the shipped-keywords baseline for the two candidates whose point estimates moved
most (doc2query, HyDE):

| comparison vs. keywords baseline | both-hit | baseline-only | other-only | both-miss | McNemar exact p |
|---|---|---|---|---|---|
| doc2query (blind) | 2 | 7 | 2 | 9 | p=0.180 — not significant |
| HyDE on shipped | 5 | 4 | 8 | 3 | p=0.388 — not significant |

**Neither headline delta clears conventional significance at n=20, including HyDE's.** The paired
test is more informative than the marginal-proportion CI (it isolates which specific cases flipped
rather than comparing two noisy rates), and it still can't confirm either effect at this sample size.
Read "not significant" as **"cannot confirm," not "disproven."** The doc2query discordant pairs lean
7-2 against it (suggestive, not confirmed); HyDE's lean 8-4 in its favor (suggestive, not confirmed).
Every GO/NO-GO verdict below has been re-worded to reflect this — treat them as directional
recommendations backed by point estimates plus a plausible mechanism, not as proven effects.

**One number in this file is NOT subject to this caveat: the 30%-unreachable / 70%-recall@10 finding
in canary 3.** That's an exact count of how many of these 20 specific cases BM25 retrieves at all —
not a sampling estimate of a population, a deterministic fact about this exact case set. It's still
only as generalizable as the held-out set itself (the separate, unresolved "no real operator queries"
problem below), but it isn't fighting sampling noise the way a percentage comparison is.

## Real operator query search — result: NOTHING USABLE FOUND

Searched `ADS-memory/sessions/`, `ADS-memory/.local-artifacts/` (handoffs, agent-reports,
swarm-consensus, external-audit offloads), git log (`--all --grep`), and test fixtures in
`src/server/__tests__/assistant-*-routes.test.ts`, `src/assistant/__tests__/byok-tool-surface.test.ts`,
`development/e2e/byok-google-tool-schema.spec.ts`, and `apps/admin/src/features/ai-assistant/AiAssistant.tsx`
(for suggested-prompt UI copy) for real phrasings an operator typed to the admin AI assistant.

Found plenty of *developer-to-developer* natural language (handoff docs, audit questions like "is
this site newer than, or divergent from, this runtime?") but **zero instances of an operator asking
the admin assistant to do something** — no chat transcripts, no logged turns, no suggested-prompt
chips in the UI. The admin AI Assistant feature has shipped BYOK plumbing and tool wiring but
apparently no captured usage yet.

**This is still the single biggest blocker to trusting any number in this file, including the
existing 45%.** Every held-out case, and everything below, is proxy data authored by an agent, not
observed operator behavior. Flagging loudly per the brief's instruction — nothing below should be
read as "production-validated."

---

## Canary 3 — Recall@10 ceiling (reranking upper bound)

Instrument: `development/evals/tool-search-rerank-ceiling.eval.ts` (new, committed). No model calls,
no network. Reuses the identical `HELD_OUT_CASES` (duplicated verbatim, not imported, since
`tool-search-quality.eval.ts` keeps its case arrays module-local) against the live index.

| metric | n | pct |
|---|---|---|
| already top-1 (nothing for a reranker to do) | 9/20 | 45% |
| in top-10 but not top-1 (reranker's addressable set) | 5/20 | 25% |
| missing from top-10 entirely (reranker cannot touch) | 6/20 | 30% |
| **recall@10 ceiling** | **14/20** | **70%** |

A perfect reranker moves the headline number from 45% top-1 to at most 70% — the same 70% the
existing eval already reports as "found." The 5 addressable cases are genuine near-misses (e.g.
"the footer needs a recent posts block" → `widgets_bind_region` ranks #2 behind `content_post_list`;
"we rebranded, the title at the top is stale" → `workspace_update` ranks #2 behind
`menus_update_menu_tree`) — the kind of ordering error a cross-encoder or an LLM judging 10
candidates would plausibly fix. But 6/20 (30%) never make the candidate list at all — BM25's top
hit for "is anything wrong with the data store" is `theme_list`, nowhere near `database_get_health`.
No reranker, however good, moves a candidate that was never retrieved.

**Cost:** zero to measure (this canary). To build: one LLM call (or cross-encoder pass) per
`search_tools` invocation, over ≤10 candidates — real but small added latency/cost per turn.

**Verdict: CONDITIONAL GO, but sequence it second, not first.** The addressable 25pp is real and
cheap to try, but capping at 70% found means reranking alone cannot fix the majority-share problem
(vocabulary gap — same root cause the original findings report identified). Build retrieval-side
fixes (canary 1) first to raise recall@10 itself; reranking is worth adding on top afterward, not
instead of it. Building a reranker against the current 70% ceiling first would spend effort chasing
a 25pp band while leaving the 30% "wrong candidate set" failures completely untouched.

---

## Canary 2 — Hierarchical search (domain-level top-1)

Instrument: `development/evals/tool-search-hierarchical-canary.eval.ts` (new, committed). Reuses the
production `@jini-ai/sqlite` FTS5/BM25 machinery directly — `ensureToolCatalogTables` /
`reseedToolCatalog` / `searchToolCatalog` — seeded with one row per domain instead of one row per
tool. Each domain row's text is the concatenation of its member tools' current (keyword-augmented)
indexed descriptions — no new authoring, free per the brief's framing. 131 tools grouped into 21
domains by id prefix, matching `tool-catalog-query.ts`'s own `sourceForToolId` derivation.

| metric | n | pct |
|---|---|---|
| domain top-1 (routing lands on the right domain first) | 8/20 | **40%** |
| domain found anywhere in the ranked domain list | 20/20 | 100% |

**40% domain top-1 is BELOW the current flat top-1 of 45%.** The "found anywhere" number is
uninformative here — with only 21 domains and OR'd terms, nearly everything ranks somewhere, so it's
not a useful ceiling the way found@10 was for canary 3. Top-1 is the number that matters, and it's a
regression versus doing nothing.

Root cause, visible in the misses: concatenating every tool's text into one domain document produces
long, noisy documents for domains with many tools (`content` and `collections` have 6 and 11 tools
respectively and keep winning by accident — e.g. "the footer needs a recent posts block" routes to
`content` over `widgets`, "people say the contact page does nothing" routes to `content` over
`forms`). BM25's own length normalization works against big domains here: more text means more terms
match by coincidence, and the domain-level query loses the sharp single-tool phrase match that made
the flat index work in the first place.

**Verdict: NO-GO, on structural grounds more than the point estimate.** 40% vs. the flat baseline's
45% is a 5pp gap — well inside the noise floor on its own, not a confirmed regression (this
comparison wasn't run through the paired McNemar test above since domain-level and tool-level top-1
aren't the same unit). The case against hierarchical search doesn't rest on that 5pp gap; it rests on
the structural argument stated above: a two-stage design's ceiling IS its first stage, and there's no
evidence here that stage one clears the bar needed to justify the added complexity — best case
measured, it merely matches doing nothing. This was the FREE version (existing text, no new
authoring); a hand-curated one-line-per-domain blurb might route better, but that is a different,
non-free experiment outside this canary's mandate — worth flagging as a possible follow-up if
hierarchical search is ever reconsidered, but not worth building against these numbers as-is.

---

## Canary 1 — Doc-side query generation (doc2query)

**First attempt was contaminated — caught it, not shipping the number, redoing it blind.** Full
transparency on what happened, because it's a direct, concrete illustration of exactly the failure
mode the brief warned about.

Instrument: `development/evals/tool-search-doc2query-canary.eval.ts` (new, committed — the harness
is sound and reused for the redo; only the question SOURCE was contaminated). Wrote ~3-4 synthetic
questions per tool for the same 85 tools `TOOL_SEARCH_KEYWORDS` covers, believing I was generating
them "from the tool's raw description alone." First run: **held-out top-1 18/20 (90%), top-3 90%,
found 95%** — a huge jump over the keywords' 45%.

That number is not trustworthy. On inspection, several of my "synthetic" questions are near-verbatim
lifts from `HELD_OUT_CASES`, which I had already read in full (I had to, to build canaries 2 and 3
first) — e.g. I wrote `database_get_health: ["Is anything wrong with the data store?", ...]`, which
is not a paraphrase, it is the held-out query string `"is anything wrong with the data store"`
copied almost verbatim. Auditing the other 19: `"We rebranded, how do I update the site title?"`
against held-out `"we rebranded, the title at the top is stale"`; `"Why isn't the external system
receiving our events?"` against `"is the external system actually receiving our events"`; `"How do I
grant a new hire permission to edit posts?"` against `"new hire needs to be able to edit posts"`;
`"Where can I see everyone on our email list?"` against `"show everyone on our email list"` — the
pattern repeats across roughly 12-15 of the 20 cases. I believed I was writing from descriptions
only and was not; the held-out phrasing was sitting in context and leaked in despite that intent.
**This is the self-grading trap from the original findings report, reproduced live, by an agent that
had just read the warning about it.** Intent to avoid contamination is not sufficient — only genuine
blindness (never having the answer key in context) is.

**Redo, dispatched to a fresh subagent with zero visibility into `HELD_OUT_CASES` or any eval file**
— given only the 131-tool id+description catalog (`development/evals/tool-search-doc2query-blind-questions.ts`
has full provenance in its header) and asked to write 5 questions per tool from that alone. Subagent
confirmed it never opened any eval/test/held-out file, covered all 131/131 tools. Cost: one subagent
call, ~81.6k tokens, ~4m45s wall time, 4 tool uses — this is the "generating the questions costs
model calls once" cost the brief flagged as acceptable.

**Honest result (`tool-search-doc2query-canary.eval.ts`, rerun against the blind data):**

| set | top-1 | top-3 | found@10 |
|---|---|---|---|
| doc2query (blind, full 131-tool coverage) | 4/20 (**20%**) | 10/20 (50%) | 13/20 (65%) |
| current keywords (for comparison) | 9/20 (45%) | 11/20 (55%) | 14/20 (70%) |
| no-vocabulary baseline (for comparison) | 2/20 (10%) | 4/20 (20%) | 8/20 (40%) |

**Doc2query beats doing nothing (10%→20% top-1) but loses to the hand-curated keywords file on every
metric (45% top-1, 55% top-3, 70% found).** This is the opposite of what the contaminated first
attempt suggested, and it's the number to trust — this one is genuinely blind.

Plausible cause, visible in the misses: the blind subagent wrote full natural questions ("How do I
add a new photo to the media library?") rather than compact keyword bags. Five full sentences per
tool add a lot of shared filler vocabulary ("how", "do", "I", "can", "you") that doesn't discriminate
between tools, and BM25's length normalization works against the now much longer per-tool documents
— the same length-normalization dynamic that hurt canary 2's domain-level concatenation. The
hand-written keywords file is short, topical, and deliberately excludes stopword-shaped filler; that
compactness appears to matter more than the systematic generation process helps.

**Verdict: NO-GO as tested, but hold it loosely — the paired McNemar test (see "Statistical caveats"
above) puts this at p=0.180, not significant at n=20.** The discordant pairs lean 7-2 against
doc2query (7 cases the keywords baseline got right that doc2query missed, vs. 2 the reverse), which
is suggestive in the same direction as the point estimate, but "suggestive" is the honest ceiling
this sample size supports — it is not proof doc2query is worse, only that it did not demonstrate
being better, and the mechanism argument (filler-word dilution, BM25 length normalization) is doing
real work in this verdict alongside the numbers. Doc2query in this form costs a model call per tool
and did not demonstrate beating the already-shipped, zero-marginal-cost keywords file. A version that
filtered the generated questions down to their distinctive open-class terms (i.e., converged toward
what the keywords file already does by hand) might close the gap, but that is a different, unbuilt
technique — not what "generate questions, index them" as specified in the brief measures.

---

## Canary 4 — Query expansion / HyDE

Instrument: `development/evals/tool-search-hyde-canary.eval.ts` (new, committed). This is the one
canary that did NOT need a redo — built blind from the start. The expansions
(`tool-search-hyde-blind-expansions.ts`) were generated by a fresh subagent given ONLY the 20 raw
held-out query strings plus one generic paragraph of CMS-admin domain context; it never saw the real
tool catalog, `HELD_OUT_CASES`, or any eval file — mirroring exactly how a real runtime HyDE call
works (the expanding model never gets to peek at the index it's about to search). Cost: one subagent
call, ~35k tokens, ~41s wall time, covering all 20 queries in one batch.

| index | query form | top-1 | top-3 | found@10 |
|---|---|---|---|---|
| raw baseline (no keywords) | operator's raw query | 2/20 (10%) | 4/20 (20%) | 8/20 (40%) |
| raw baseline (no keywords) | **HyDE-expanded** | **11/20 (55%)** | 15/20 (75%) | 20/20 (100%) |
| current shipped (with keywords) | operator's raw query | 9/20 (45%) | 11/20 (55%) | 14/20 (70%) |
| current shipped (with keywords) | **HyDE-expanded** | **13/20 (65%)** | 19/20 (95%) | 20/20 (100%) |

**This is the strongest result of the four candidates, and it's clean — genuinely blind, no
contamination risk.** Two findings stack:

1. **HyDE alone, with NO keywords at all, beats the current shipped fix** (55% vs 45% top-1) — it
   would have solved the original vocabulary-gap problem without touching `tool-search-keywords.ts`
   or any shared package.
2. **HyDE on top of the current shipped index is better still** (65% top-1, 95% top-3, 100% found —
   every held-out case is now at least in the top 10, most in the top 3). The two techniques are
   complementary, not redundant: keywords fix the index side, HyDE fixes the query side, and
   together they close nearly all of the vocabulary gap that motivated this whole investigation.

Not universally positive — a handful of previously-rank-1 cases moved to rank 2-4 under HyDE (e.g.
"a contractor finished, take away their account" 1→3, "that extension is causing trouble" 1→2), so
this is not a strict improvement on every case, just a strong one in aggregate.

**Cost — the one place this candidate is structurally different from the other three.** Doc2query
and keywords are BUILD-TIME costs: pay once, free at query time forever. HyDE is a RUNTIME cost: one
extra LLM call on every single `search_tools` invocation, adding real latency and per-call spend to
every search, forever. That is a materially different tradeoff than "generate this once."

**Verdict: GO to prototype, but the point estimate is NOT statistically confirmed at n=20 — say this
plainly rather than let the biggest number in the file overstate its own certainty.** The paired
McNemar test (see "Statistical caveats" above) puts the shipped-index comparison at p=0.388; the
discordant pairs lean 8-4 in HyDE's favor, which is the most favorable lean of anything measured in
this file, but it does not clear conventional significance at this sample size either. What justifies
"GO to prototype" instead of "inconclusive, do nothing" is the combination of: the most favorable
point estimate and discordant-pair lean of all four candidates, a plausible and independently
checkable mechanism (expansion adds vocabulary exactly where the original findings report already
proved vocabulary is the bottleneck), and a genuinely blind measurement process with no contamination
risk. That combination is a reasonable basis for spending prototype effort — it is not a basis for
claiming the win is proven. This is also a per-query RUNTIME cost, not a build-time investment like
the other three: worth prototyping with the runtime cost measured explicitly (latency added to
`search_tools`, cost of the cheap model used for expansion) before committing, and ideally paired with
the existing keywords file rather than replacing it, since the combination outperforms either alone
in this measurement.

---

## Summary — verdict table

| # | approach | headline number | paired significance vs. baseline | cost | verdict |
|---|---|---|---|---|---|
| 3 | rerank top-K | recall@10 ceiling 70% (25pp addressable, 30% unreachable) | n/a — exact count, not a sampled comparison | small, per-search | CONDITIONAL GO — sequence after retrieval fixes |
| 2 | hierarchical (domain routing) | domain top-1 40% (below flat 45%) | not tested (different unit); 5pp gap alone is noise | free (reused index) | **NO-GO** (structural argument, not the point estimate) |
| 1 | doc2query | held-out top-1 20% (blind) — below keywords' 45% | McNemar p=0.180, discordant 7-2 against | 1 subagent call, ~82k tokens, one-time | **NO-GO as tested, not disproven** |
| 4 | HyDE query expansion | held-out top-1 65% on shipped index (55% even with NO keywords) | McNemar p=0.388, discordant 8-4 in favor | 1 LLM call PER search, every turn, forever | **GO to prototype, not statistically confirmed** |

Read together: the two "index more text at build time" ideas (doc2query, and implicitly the
hierarchical domain-grouping) did NOT beat the already-shipped hand-written keywords file, though
neither loss is statistically proven at n=20 either — both rest partly on plausible mechanism, not
pure numbers. The two ideas that touch the QUERY side (reranking, HyDE) both show the most promising
signal, and HyDE's is the best single result measured across all four candidates and the existing
keywords fix combined — but "best measured" and "statistically confirmed" are different claims, and
only the former is true here. If forced to pick one thing to prototype next, it's HyDE — with the
caveat that it's the only candidate here whose cost recurs on every turn rather than being paid once,
and its win is a promising lean, not a proven effect.

## Recommendation: instrument real `search_tools` queries — do not implement, this is the owner's call

Every number in this file, and every number in the original findings report, is measured against
cases an agent authored. That ceiling cannot be raised by trying harder to search for existing real
queries (already attempted, nothing found) or by writing more careful synthetic cases (the
contamination in canary 1 shows how easily "careful" fails). The only fix is to stop relying on
authored cases and start capturing real ones as a by-product of ordinary use.

**What this would look like:** log every `search_tools` invocation's query text and the tool id the
operator's turn ultimately called (or a `describe_tool` follow-up, or neither, all three are
signal). That's enough to build an honest eval set organically — real phrasing, real distribution of
easy vs. hard cases, no author bias.

**What must NOT be logged:** tool call arguments (may carry site content, PII, or credentials),
response payloads, anything from `execute_delegated_tool`'s actual execution — only the search
query string and which tool id (if any) was ultimately selected. This is a narrower, lower-risk
surface than general request logging, but it is still new persistent capture of operator-typed text,
which is a privacy-posture decision, not an engineering one. **Not implemented here** — flagging it
as the highest-leverage next step and leaving the call to the owner.

## Process note for whoever picks this up next

Canary 1's contamination-and-redo is the most important methodological result in this file, arguably
more important than any single number: an agent that has already read the answer key and consciously
tries not to use it still leaked verbatim phrases into its "independent" generation. The only
technique in this file that produced a fully trustworthy number was genuine blindness enforced by
information architecture (a fresh subagent that was never shown the answers), not by instruction or
intent. Apply that lesson to any future eval work in this repo: if an agent has seen a held-out set,
it cannot subsequently author anything meant to be scored against it, no matter how careful it tries
to be — dispatch a blind subagent instead.
