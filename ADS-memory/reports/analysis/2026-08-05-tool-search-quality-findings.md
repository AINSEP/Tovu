# Tool search quality — measured findings

Generated 2026-08-05. Instrument: `development/evals/tool-search-quality.eval.ts`
(free, deterministic, no model, no network — runs in ~2s, safe for CI).

## Why this matters now

Before the meta-tool set, a BYOK turn published all 131 tool descriptors to the provider. The model
could read the whole catalog, so search ranking was a convenience. After the meta-tool set
(`byok-tool-surface.ts`'s `META_TOOL_DESCRIPTORS`), the model sees **3** tools and can only reach the
other 131 through `search_tools`. **Ranking became a load-bearing product surface**, and nothing had
ever measured it.

## Headline

25 tasks, phrased the way an operator actually asks (never echoing the tool's own id — that would
only prove BM25 ranks exact token matches first), against the 131 wired tools:

| metric | result |
|---|---|
| top-1 (model needs no judgement) | **10/25 — 40%** |
| top-3 (one `describe_tool` resolves it) | **11/25 — 44%** |
| found at all in top 10 | **14/25 — 56%** |

**44% of realistic requests never surface the right tool at all.** The misses are not near-misses:

| operator asks | wanted | BM25's top hit |
|---|---|---|
| "what images have been uploaded" | `media_list_assets` | `database_list_pending_migrations` |
| "give someone admin access" | `identity_role_assign` | `newsletter_remove_subscription` |
| "what webhooks are set up" | `integrations_list_subscriptions` | `seo_set_settings` |
| "make this old url point somewhere new" | `redirects_create` | `backup_create_restore_point` |
| "take a snapshot before I break something" | `backup_create_restore_point` | `forms_list_definitions` |
| "see what people submitted through the contact form" | `forms_list_submissions` | `menus_assign_location` |
| "who has signed up to the mailing list" | `newsletter_list_subscriptions` | `recovery_resolve_deep_link` |
| "add a link to the top navigation" | `menus_update_menu_tree` | `recovery_resolve_deep_link` |

Every one of those tools is wired and working. This is a **discovery** failure, not a catalog gap.

## What the index actually is

`@jini-ai/sqlite`'s `tool-catalog.ts`:

```sql
CREATE VIRTUAL TABLE tool_catalog_fts USING fts5(id, description, content='tool_catalog', ...)
-- ranked by bm25(tool_catalog_fts, 6.0, 1.0)   -- id weighted 6x, description 1x
```

- Only `id` and `description` are indexed. `inputSchema` is **not** — correct, it would be noise.
- Query terms are OR'd, not AND'd.
- Default `unicode61` tokenizer: **no stemming**.

## A/B results — two hypotheses tested, one killed

Measured on the same 25 cases by rebuilding the identical index with variations:

| configuration | top-1 | top-3 | found |
|---|---|---|---|
| baseline (`unicode61`, id×6, desc×1) | 10 | 11 | 14 |
| weights only (`unicode61`, id×1, desc×3) | 6 | 10 | 14 |
| **porter stemming** (id×6, desc×1) | **9** | **13** | **17** |
| porter + weights (id×1, desc×3) | 7 | 13 | 17 |
| porter + weights (id×2, desc×3) | 7 | 13 | 17 |
| porter + weights (id×1, desc×1) | 8 | 13 | 17 |

**Conclusion 1 — the 6x id weight is NOT the bug.** This was my hypothesis going in and it is wrong.
Every reweighting made top-1 strictly worse. Leave `bm25(fts, 6.0, 1.0)` alone.

**Conclusion 2 — porter stemming is a real but modest win.** Recall 14→17, top-3 11→13, costing one
top-1. It fixes the "images"/"image", "uploaded"/"upload", "webhooks"/"webhook" class of miss.
Change is one clause in `ensureToolCatalogTables`: `tokenize='porter unicode61'`. Note this lives in
`@jini-ai/sqlite`, a SHARED package — it affects every Jini host, not just Tovu, and the package is
symlinked + consumed via `dist`, so it needs a rebuild to take effect here.

**Conclusion 3 — descriptions are the dominant lever.** Even with stemming, 8/25 stay invisible
because the description does not contain the operator's word at all. `media_list_assets` never says
"image"; `integrations_list_subscriptions` never says "webhook"; `backup_create_restore_point` never
says "snapshot". Ranking cannot recover a word that was never indexed.

## Round 2 — what to index (asked 2026-08-05, measured the same way)

Question: can we index more (schema text, handler code) instead of editing descriptions?

| configuration | top-1 | top-3 | found |
|---|---|---|---|
| current (`id` + `description`) | 10 | 11 | 14 |
| + porter stemming | 9 | 13 | 17 |
| + `inputSchema` text indexed (porter) | 9 | 14 | 17 |
| **+ curated `keywords` column (no porter)** | **24** | **25** | **25** |
| + curated `keywords` column (porter) | 22 | 25 | 25 |

**`inputSchema` text: marginal.** +1 top-3, zero recall. It cannot fix the hard misses because those
tools lack the operator's word everywhere — description AND schema. No index over an absent word helps.

**Handler source code: not available and probably not worth it.** The registry holds descriptors, not
source, so this needs a build-time extraction step. Code identifiers are largely the same vocabulary
as the tool id, which is already indexed at 6x weight.

**Curated `keywords`: decisive.** 40% -> 96% top-1, 56% -> 100% recall.

**READ THIS BEFORE QUOTING 96%.** The keyword strings were written while looking at the 25 test
queries. That is fitting to the eval set, so 96% is an optimistic CEILING, not a forecast of live
performance. What the experiment legitimately establishes is the MECHANISM — missing vocabulary is
the bottleneck, not ranking, not tokenization. A fair number needs held-out phrasings the keyword
author never saw. Build that before treating any of this as a shipped result.

**Porter stemming should be DROPPED from the plan.** It helps only in the absence of keywords, and
once keywords exist it is slightly harmful (22 vs 24 top-1). That also removes the need to touch the
shared `@jini-ai/sqlite` package at all — a strictly better outcome than Round 1's recommendation.

Revised recommendation: add an optional `keywords` field to the agent-tool catalog entry, thread it
into `reseedToolCatalog` as a third FTS column, weight it around 1-2. Keep `bm25`'s id weight at 6.

## Recommended order of work

1. **Write held-out eval cases FIRST** — phrasings whose author has not seen the keywords. Without
   this every number below is self-graded. This is the cheapest possible guard and it is the one
   thing that makes the rest trustworthy.
2. **Add a `keywords` field** to the catalog entry + a third FTS column. Highest leverage by a wide
   margin, additive, and the eval re-scores each edit in ~2 seconds.
3. **Do NOT retune the bm25 weights.** Measured worse, twice.
4. **Do NOT add porter stemming.** Superseded by (2) — measured slightly harmful once keywords exist,
   and skipping it avoids a shared-package change entirely.
5. `inputSchema` text as a fourth column is optional and marginal (+1 top-3); take it or leave it.

## Honest consequence for the meta-tool change

The meta-tool set is a real ~100x payload win and its schema handling is verified against live
Gemini. But it converts search quality from a convenience into the ceiling on assistant capability.
On these numbers it is plausibly a **net capability regression until discovery improves** — the sort
of thing that ships silently and later reads as "the assistant is dumb" with nobody able to say why.
That is the tradeoff to weigh, and it is now measurable instead of speculative.

## Not yet measured

This eval covers exactly one failure class — "tool exists but does not rank". The other two need a
real model in the loop and cost money per run:
- **no tool exists** for the task (a genuine catalog gap)
- **found, but called with arguments its schema rejects** (a schema/description problem)
A live companion eval driving `runByokProviderTurn` would measure both, plus real turns-per-task.
