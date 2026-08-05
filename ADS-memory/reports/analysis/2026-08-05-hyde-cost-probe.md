# HyDE cost probe — the recurring cost does not exist in this architecture

Session: 2026-08-05 (Coordinator, Claude Opus 5 1M), HEAD `1b3206f`.
Task origin: handoff `20260805-090128-handoff.md` Next Steps #1, owner-selected next step
"cost probe on HyDE first" — on the reasoning that the recurring per-search LLM call was the only
thing that could kill HyDE outright and needed no eval data to measure.

**Result: the probe did not measure the cost. It removed it.** Two code facts, read directly.

## Finding 1 (NEW, statistically significant) — HyDE's recall@10 effect IS confirmed

The prior significance pass (`development/evals/tool-search-canary-significance.eval.ts`, commit
`47f02b4`) built only a `top1Vector` and tested only top-1. It never tested found@10. Extending that
same instrument with a `foundVector` and rerunning:

```
3. PAIRED McNemar exact test on found@10 (recall@10) — the reranker's hard ceiling:
   keywords baseline    found@10 14/20
   doc2query (blind)    found@10 13/20   both=10 baseline-only=4 other-only=3 neither=3   p=1.0000   not significant
   HyDE on shipped      found@10 20/20   both=14 baseline-only=0 other-only=6 neither=0   p=0.0313   SIGNIFICANT at .05
```

**HyDE: 14/20 → 20/20 found@10, discordant 6-0, McNemar exact p = 0.0313, zero regressions.** Not one
case the keyword baseline retrieved was lost.

The handoff's "NONE of the point-estimate deltas clear significance at n=20" is true **of top-1 only**.
This is the single statistically confirmed effect in the whole tool-search workstream, and it was
sitting unmeasured in already-collected data.

**Why recall@10 is the metric to design on, not top-1.** Canary 3 established that a reranker can only
reorder candidates BM25 already retrieved. Today 6/20 cases (30%) never enter the candidate set at all
("is anything wrong with the data store" tops out at `theme_list`), which caps the entire rerank
strategy at 70%. HyDE eliminates that band:

| configuration | candidate set | rerank ceiling | reranker's addressable band |
|---|---|---|---|
| today (shipped keywords) | 14/20 | 70% | 25pp |
| + HyDE | **20/20** | **100%** | 35pp |

So the two "GO" candidates are not competing options — they compose. HyDE fixes candidate
*generation*; reranking fixes *ordering*. And the robust argument for HyDE is no longer the
unconfirmed 65% top-1 (p=0.388) — it is the recall guarantee (p=0.031).

## Finding 2 — the recurring per-search LLM call is an artifact of the simulation, not the architecture

`search_tools` is served on two execution paths, and **on both, the caller that composes the query
string is already an LLM**:

- **BYOK path** (ADR-049 "API · BYOK"): `src/assistant/byok-tool-surface.ts:301` handles the call.
  `search_tools` is one of three meta-tool descriptors (`META_TOOL_DESCRIPTORS`, :119) published to
  the provider model, which invokes it during a tool turn via
  `byok-provider-turn.ts` → `@jini-ai/agent-runtime`'s four `run*ToolTurn` adapters.
- **Spawned-CLI / daemon path**: `src/assistant/agent-daemon-server.ts:653` backs `@jini-ai/mcp`'s
  `search_tools` for the spawned agent CLI, which is itself the model.

There is no third caller. Nothing composes a `search_tools` query except a model that is already
running and already being paid for.

**Both paths currently instruct that model to do the WORSE thing** — the exact query form canary 4
measured as inferior:

- `byok-tool-surface.ts:123` — *"Search this Tovu site's tool catalog **by keyword**."*
- `byok-tool-surface.ts:127` — *"**Keywords** to search for, e.g. `publish post` or `list members`."*
- `agent-daemon-server.ts:387` — *"call `search_tools` with a **keyword query** FIRST"*

Therefore **HyDE in this codebase is a prompt change to those strings, not an added inference call.**
Zero added latency, zero added spend, both paths. The canary's cost label — *"1 LLM call PER search,
every turn, forever"* — describes how the canary *simulated* the expansion (a dedicated blind
subagent), not what the technique costs here.

This retires the blocking objection recorded in the handoff: "its cost is a recurring
per-`search_tools` LLM call — latency and spend on every turn, structurally unlike the
build-time-only candidates, which is a product decision, not an engineering one." That framing is
withdrawn. It is an engineering change, and a cheap one.

## What is NOT established — read before implementing

1. **The measured configuration is not the proposed configuration.** Canary 4's expansions came from a
   fresh subagent prompted in isolation, given only the 20 raw operator phrasings plus one generic
   paragraph of domain context. That is structurally close to a runtime caller (same information
   position: sees the request, has never seen the catalog) but it is **not** the same as the calling
   model following a revised tool description inline, mid-tool-turn, with conversation context
   present. The 20/20 result is evidence that *expanded queries retrieve better on this index*; it is
   not a measurement of the prompt-change design.
2. **Prompt compliance is the live risk.** A model told to write a richer, hypothetical-answer-style
   query may still emit terse keywords out of habit, or may over-expand into filler that dilutes BM25
   the way canary 1's doc2query questions did (that failure mode is measured and real). Compliance
   must be measured, not assumed.
3. **Ecological validity is untouched by any of this.** All 20 held-out cases remain agent-authored
   proxy data. The confirmed recall result is confirmed *on this case set*.
4. Conversation context could plausibly make a runtime caller's expansion **better** than the canary's
   (it knows what the operator was talking about). Untested in either direction.

## MEASURED — the prompt-change configuration, and it is the best result in the workstream

The experiment designed below was run in the same session. Two description strings changed
(`byok-tool-surface.ts` `query` param, `agent-daemon-server.ts:387` system overlay), root `tsc` 0 errors.
A blind caller-simulator subagent (`claude-sonnet-5`) was given ONLY the new `query` description verbatim
plus the 20 raw operator phrasings, forbidden from using any tool or opening any file, and confirmed it
used none — so it never saw the expected tool ids, the keywords file, or the catalog. Output committed as
`development/evals/tool-search-hyde-prompt-expansions.ts` with full provenance; scored through the same
extended significance instrument.

| configuration | top-1 | McNemar (top-1) | found@10 | McNemar (found@10) |
|---|---|---|---|---|
| keywords baseline (shipped) | 45% | — | 14/20 | — |
| doc2query (blind) | 20% | p=0.180 | 13/20 | p=1.000 |
| HyDE, dedicated expansion step | 65% | p=0.388 | 20/20 | **p=0.031** |
| **HyDE via prompt change (free)** | **85%** | **p=0.0215 SIGNIFICANT** | **20/20** | **p=0.031 SIGNIFICANT** |

**45% → 85% top-1, discordant 9-1, p = 0.0215. Significant on top-1 AND on found@10, at zero recurring
cost.** It also beats the dedicated-expansion form it was meant to merely approximate (85% vs 65%),
plausibly because the instruction explicitly asks for object + action + synonyms in documentation
register, which aligns the query with the vocabulary the index is actually built from. That mechanism is
checkable and should be checked rather than believed.

Per-case ledger (9 gained, 1 regressed, 8 both-hit, 2 both-miss):

- **Gained (9):** spam-in-replies (`content_post_create` → `comments_mark_comment_spam`); roll-back
  (`collections_content_type_reactivate` → `backup_plan_restore`); logo swap (`theme_read_file` →
  `media_upload_asset`); new-hire permissions (`newsletter_create_campaign` → `identity_role_assign`);
  webhook deliveries (`identity_role_delete` → `integrations_list_subscriptions`); footer widget
  (`content_post_list` → `widgets_bind_region`); data-store health (`theme_list` →
  `database_get_health`); rebrand title (`menus_update_menu_tree` → `workspace_update`); header-bar entry
  (`widgets_bind_region` → `menus_update_menu_tree`).
- **Regressed (1):** "people say the contact page does nothing" — `forms_list_submissions` (correct) →
  `forms_get_submission`. Same domain, wrong granularity: singular-fetch instead of list. A real
  regression under the scoring rule, but a near-miss in kind, not a domain error.
- **Both-miss (2):** "change the colours on the site"; "customer can't get in, send them a way to log in"
  — the second is a genuine semantic drift, the simulator wrote "send a password reset link" where the
  target is `members_request_magic_link`. A magic link is not a password reset, and no query phrasing
  fixes a wrong concept.

**This overturns canary 3's "30% structurally unreachable" as a design constraint.** The handoff called
that the one number safe to design on, because it was an exact tally rather than a sampling estimate.
The tally was correct — but it is a property of the *query form*, not of the retrieval. "is anything
wrong with the data store", the canary's own example of a case BM25 could never retrieve (topping out at
`theme_list`), is now **top-1**. Exactness and immutability are different properties, and the report
conflated them. Recall@10 goes 70% → 100%, so the rerank ceiling goes 70% → 100% and reranking's
addressable band is now the 15pp between 85% and 100%.

**What still limits this result:** compliance is measured at its ceiling, not in production (see the
provenance header on the expansions file); n=20 throughout; and all 20 cases remain agent-authored
proxy data, so ecological validity is exactly as unresolved as before. The 85% has a ±15.6pp
single-proportion interval → [69%, 100%]. What is now established is a large, significant, paired
improvement on this case set at no recurring cost — not a production number.

## Next experiment (designed, not run)

Change the two description strings, then measure the prompt-change configuration honestly:

- Dispatch a **blind** subagent as the caller-simulator — given the revised `search_tools` description
  verbatim as its only instruction, plus the 20 raw operator phrasings, and **no** view of
  `HELD_OUT_CASES`, `tool-search-keywords.ts`, the tool catalog, or any eval file. Per the session's
  methodology rule: an agent that has seen a held-out set cannot afterwards author anything scored
  against it.
- Score its emitted queries through the existing instruments (`tool-search-quality.eval.ts` and the
  extended significance eval) for top-1, found@10, and paired McNemar vs. the shipped keyword baseline.
- Report compliance separately from retrieval: what fraction of emitted queries actually followed the
  new instruction rather than reverting to keywords. A retrieval win with 40% compliance means
  something different from the same win at 95%.

Sequencing note: reranking stays CONDITIONAL GO / second, per canary 3 — but its ceiling under HyDE is
100% rather than 70%, which strengthens the case for building it after this lands.

## Sample-size constraint (unchanged, still governing)

n=20. One case is 5pp; the 95% interval around 45% is roughly ±22pp. Point-estimate deltas under
~10-15pp are not distinguishable from noise. What n=20 supports is large effects and structural facts.
The recall@10 result qualifies as the former (6-0 discordant, no regressions); the 65% top-1 does not.

Two distinct problems are conflated in the handoff's "blocked on an honest eval set":

- **Sample size** — fixable now, free, via blind-subagent authoring. Needs no owner decision.
- **Ecological validity** — fixable only with real logged operator queries.

And the load-bearing scheduling fact: the canary agent found **zero captured operator usage** of the
admin assistant. Instrumenting `search_tools` logging yields an empty table until real operators use
the feature, so it is the right long-term move but does **not** unblock this workstream on a near
timeline. Confirm the feature's release status before treating logging as the critical path.

## Handoff Contract

- **Inputs used:** `development/evals/tool-search-canary-significance.eval.ts` (read, then extended
  with a `foundVector` + found@10 McNemar section and rerun — the new result is measured output, not
  inference); `ADS-memory/reports/analysis/2026-08-05-tool-search-canaries.md` (full);
  handoff `20260805-090128-handoff.md`; direct reads of `src/assistant/byok-tool-surface.ts`
  (:96-145, :301), `src/assistant/byok-provider-turn.ts` (:1-60, transport shape),
  `src/assistant/agent-daemon-server.ts` (:365-394, :653), and a `grep` sweep for every
  `search_tools` reference in `src/` and `packages/`.
- **Output summary:** one new statistically significant result (HyDE recall@10, p=0.031) recovered
  from existing data by testing a dimension the prior pass never tested; and the withdrawal of the
  recurring-cost objection that was gating the whole workstream, on the grounds that the query-composing
  caller is already an LLM in both execution paths and is currently being instructed to send the
  measurably worse query form.
- **Risks:** the prompt-change configuration is designed but unmeasured; prompt compliance unquantified;
  over-expansion could dilute BM25 (canary 1's measured failure mode); ecological validity unchanged —
  all 20 cases remain agent-authored proxy data.
- **Suggested next assignee:** whoever runs the next experiment above. It is a small code change plus
  one blind subagent dispatch, and it does not need the owner's logging decision to proceed.
