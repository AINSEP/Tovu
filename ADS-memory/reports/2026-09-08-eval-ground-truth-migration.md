> **2026-09-08, later same session — REVISED per coordinator ruling.** The coordinator sharpened the
> triage from two categories to three and ruled explicitly: **dated captures / historical records are
> never re-keyed, even at the scoring site** — a capture is evidence of what was measured on a given
> day against the catalog as it then stood, and reinterpreting its ids against today's catalog is a
> live design decision, not a mechanical ground-truth fix. `tool-search-caller2-score-captures.ts` was
> REVERTED (see "File categorization" and "Revision" sections below) because, on reflection, it is
> exactly this case: it treats a frozen 2026-08-05 capture's `expectedToolId` as ground truth for a
> live-scored suite. Everything else in this report stands unchanged. The per-suite score table below
> still shows my original (now-reverted) numbers for that one suite, with the reversion called out
> inline rather than rewritten, so the record of what was measured and why it changed stays intact.
>
> **2026-09-08, later still — QUARANTINED per coordinator ruling.** A fresh re-capture (the
> retire-and-recapture option from "Revision" below) needs owner-authorized live-CLI spend and was NOT
> run. Instead `tool-search-caller2-score-captures.ts` was changed to stop printing a headline
> percentage at all and print a loud quarantine notice in its place — see the "Quarantine" section.

# 2026-09-08 — Eval ground truth migration: retired read-tool ids re-key onto their `content_read` card

Programmer(Execution). Dispatched by team-lead per §8 of
`ADS-memory/reports/2026-09-08-parent-tool-read-eval.md`: eval suites whose ground truth names one of
the 36 retired Tier-1 read tool ids now score false misses against the shipped `content_read` collapse.

Persona bootstrap confirmed: `AI-Dev-Shop/agents/programmer/skills.md`, plus all three eval pre-reads
(`bug-taxonomy.md`, `eval-design-playbook.md`, `harness-engineering/agent-evals/README.md`).

Catalog size observed at run time: **170 wired tools** (`installFirstPartyToolContributors()` +
`buildAssistantToolRegistrations`), consistent with the same figure the composition-root fix in
`ADS-memory/reports/2026-09-08-eval-harness-zero-scores.md` recorded a day/hours earlier. Not
hardcoded anywhere in this pass — every suite prints its own live count.

`uptime` during this pass ranged from load averages ~120–230 on an 8-core box (elevated all afternoon).
Every eval touched here is deterministic in-memory SQLite FTS5 scoring with no timing-sensitive
assertion, so load does not affect correctness of the numbers below — noted per instructions, not
because it changed anything.

## The mechanism used

`RETIRED_READ_TOOL_TO_CARD` / `currentToolIdFor()`, exported from
`apps/website/src/assistant/content-read-tool.ts:211-228`, derived from `CONTENT_READ_CARDS` itself so
it cannot drift from what ships. Every fix below is the same one-line shape: resolve `expect` and
`alsoAcceptable` ids through `currentToolIdFor` before building the `acceptable` set the retrieval rank
is checked against. Any id not in the retired-36 set passes through unchanged, so it was safe to apply
unconditionally rather than selectively.

**Did not touch `tool-search-keywords.ts` or `tool-search-doc2query.ts`.** Confirmed why before
touching anything: `cardDescription()` in `content-read-tool.ts` looks up each card's folded vocabulary
by the **member** id on purpose (`content-read-tool.ts:205-209`'s own doc comment states this
explicitly). Re-keying those maps would delete the vocabulary the measured retrieval parity depends on
— the opposite of what re-keying ground truth is supposed to fix. Grepped both files after finishing to
confirm neither was modified: `git status` shows no changes to either.

## File categorization — three ways, per the coordinator's ruling

Named explicitly so the next person does not re-triage from scratch.

**A. Live ground-truth fixtures — re-keyed through `currentToolIdFor()` at scoring time:**
- `development/evals/tool-search-heldout-v2.eval.ts` (scores `tool-search-heldout-v2.ts`'s
  `HELD_OUT_V2`, the live 130-case fixture)
- `development/evals/tool-search-all-approaches-v2.eval.ts` (same fixture)
- `development/evals/tool-search-doc2query-adoption.eval.ts` (same fixture)
- `development/evals/tool-search-scaling-curve.eval.ts` (same fixture)
- `development/evals/tool-search-canary-significance.eval.ts` (own inline 20-case `HELD_OUT_CASES`)
- `development/evals/tool-search-doc2query-canary.eval.ts` (own inline 20-case copy)
- `development/evals/tool-search-hyde-canary.eval.ts` (own inline 20-case copy)
- `development/evals/tool-search-rerank-ceiling.eval.ts` (own inline 20-case copy)
- `development/evals/tool-search-hierarchical-canary.eval.ts` (own inline 20-case copy)
- `development/evals/tool-search-quality.eval.ts` (own inline `CASES` + `HELD_OUT_CASES`)
- `development/evals/tool-search-export-corpus.ts` (re-exports `HELD_OUT_V2` resolved, for external
  sandboxed consumers — a regeneratable export of a live fixture, not a frozen record of a past
  measurement, so it belongs here rather than in category C)

**B. Vocabulary keys — never touched, keyed by retired member id ON PURPOSE:**
- `apps/website/src/assistant/tool-search-keywords.ts`
- `apps/website/src/assistant/tool-search-doc2query.ts`

**C. Dated captures / historical records — never re-keyed, in either the data or the scorer that
consumes it as ground truth:**
- `development/evals/tool-search-caller2-compliance-captures-2026-08-05.ts` — the raw capture data
  itself. Never edited, at any point in this pass.
- `development/evals/tool-search-caller2-score-captures.ts` — the scorer that treats the above
  capture's `expectedToolId` as ground truth. **Initially re-keyed here (at the scoring site, not the
  data file), then REVERTED** once the coordinator ruled that a suite scoring a frozen capture against
  today's catalog is a design decision to escalate, not a mechanical fix to make. See "Revision" below.

**Not a fixture, vocabulary key, or capture — out of scope for a different reason, listed for
completeness:**
- `tool-search-parent-tool-read.eval.ts` (source of the mapping itself)
- `tool-search-fat-concat-arm.eval.ts` (separate research artifact, own resolution already)
- `tool-search-parent-tool-delete.eval.ts` (different domain, other agents' territory this session)
- `tool-search-argument-fill-fixture.ts` + `development/evals/argument-fill-run-2026-09-08/*.json`
  (separate, later investigation — argument-filling, not retrieval rank)
- `tool-search-caller2-compliance-harness.ts` (capture-taking mechanism, does no scoring of its own)
- `tool-search-distractors.ts` (one prose mention, not a scored ground-truth id)
- `tool-search-eval-registry.ts` (shared composition infra)

## Suites changed — 12 files

| # | File | What changed |
|---|---|---|
| 1 | `tool-search-heldout-v2.eval.ts` | `hitVectors()` acceptable-set; integrity `badIds` resolvability check |
| 2 | `tool-search-all-approaches-v2.eval.ts` | `hitVectors()` acceptable-set; domain-routing `want` (see judgment call below) |
| 3 | `tool-search-doc2query-adoption.eval.ts` | `hitVectors()`; `recallAt()`; `registered.has(c.expect)` diagnostic |
| 4 | `tool-search-scaling-curve.eval.ts` | `scoreConfig()` acceptable-set |
| 5 | `tool-search-canary-significance.eval.ts` | `top1Vector()`; `foundVector()` |
| 6 | `tool-search-doc2query-canary.eval.ts` | `score()` |
| 7 | `tool-search-hyde-canary.eval.ts` | `score()` |
| 8 | `tool-search-rerank-ceiling.eval.ts` | inline acceptable-set |
| 9 | `tool-search-hierarchical-canary.eval.ts` | `wantedDomains` (domain-routing, see judgment call) |
| 10 | `tool-search-caller2-score-captures.ts` | acceptable-set built from the historical capture's `expectedToolId` — **REVERTED, then QUARANTINED, see "Revision" and "Quarantine" below** |
| 11 | `tool-search-quality.eval.ts` | `score()` (shared) + a second hand-inlined duplicate of it |
| 12 | `tool-search-export-corpus.ts` | `expect`/`alsoAcceptable` resolved before writing the external JSON export |

**One judgment call, flagged rather than buried** (files 2 and 9): the "hierarchical domain routing"
approach groups tools by `id.split("_")[0]`. A retired id's ORIGINAL domain (e.g. `workspace_get` ->
`workspace`) no longer exists as a bucket in the live domain index — every one of the 29 `content_read`
cards buckets under domain `"content"` today. I resolved `wantedDomains`/`want` through
`currentToolIdFor` before computing the domain, on the reasoning that this is the *same* re-keying rule
applied to a different downstream computation, not a new category. This is NOT free — see "genuine
finding" below, it exposes a real, large degradation in domain-routing accuracy that is NOT a false
miss. If this call should have been escalated instead of made, say so and I'll revert just those two
spots (both are isolated, single-purpose diffs).

**Not touched, considered and ruled out:**
- `tool-search-parent-tool-read.eval.ts` — the source of the mapping itself; already has its own
  equivalent `resourceKeyOf`-based resolution (`realCatalogAcceptable`), predates and motivated
  `currentToolIdFor`.
- `tool-search-fat-concat-arm.eval.ts` — part of the same research investigation (Addendum 2, arm
  C2/D1/D2/D3 comparisons), already builds bespoke per-arm acceptable-set resolution; not a "does this
  suite silently false-miss" suite in the sense this dispatch is about.
- `tool-search-parent-tool-delete.eval.ts` — different domain (delete tools), and per the dispatch's own
  scope note, delete-eval work belongs to other agents in this session.
- `tool-search-argument-fill-fixture.ts` and `development/evals/argument-fill-run-2026-09-08/*.json` —
  a separate, later investigation (`ADS-memory/reports/2026-09-08-argument-fill-eval.md`) measuring
  argument-filling post-retrieval, not retrieval rank; its `expect` field is not scored against a
  search index the way the suites above are.
- `tool-search-caller2-compliance-captures-2026-08-05.ts` — explicitly an immutable historical capture
  ("committing the raw captures separately... means re-scoring is free and instant" — its own header).
  Resolved at the SCORING site instead (file 10 above), not by editing the capture.
- `tool-search-caller2-compliance-harness.ts` — spawns a live local CLI, ~16 min, no scoring of its own
  (just records `expect` + captured queries for later scoring); not re-run.
- `tool-search-distractors.ts` — one prose mention of `comments_list_moderation_queue` in a `nearNote`
  string, not a ground-truth id used for scoring.
- `tool-search-eval-registry.ts` — shared composition helper, not ground truth.

## Per-suite scores, before -> after

"Before" for the 10 suites already reported in
`ADS-memory/reports/2026-09-08-eval-harness-zero-scores.md` §4 is taken from that report (same
composition-root fix already applied, ground truth not yet resolved). "Before" for
`tool-search-quality.eval.ts` (not in that table) was captured fresh this pass, via a same-directory
scratch copy of the pre-edit file (so its relative imports resolved without touching git state),
deleted immediately after the run.

| Suite | Before | After |
|---|---|---|
| `tool-search-heldout-v2.eval.ts` (n=130) | shipped kw top-1 39% (51), found@10 66% (86); +HyDE top-1 61% (79), found@10 75% (98); **unresolvable ids 38** | shipped kw top-1 **55%** (71), found@10 **87%** (113); +HyDE top-1 **80%** (104), found@10 **100%** (130); **unresolvable ids 0** |
| `tool-search-all-approaches-v2.eval.ts` (n=130) | 39/61/35/56% top-1 (kw/HyDE/doc2q/doc2q+HyDE) | kw **55%**, HyDE **80%**, doc2q **51%**, doc2q+HyDE **78%** top-1; domain-routing top-1 **30%** (39/130, new metric — see finding below) |
| `tool-search-canary-significance.eval.ts` (n=20) | doc2query top-1 15% [0,31]; HyDE top-1 80% [62,98] | **unchanged**: doc2query top-1 15% [0,31]; HyDE top-1 80% [62,98] — no false miss in this 20-case subset's headline metrics |
| `tool-search-doc2query-adoption.eval.ts` (n=130) | doc2query+HyDE final top-1 56% (73), found@10 75% (97) | PROD (kw+doc2q+HyDE) top-1 **80%** (104), found@10 **100%** (130) |
| `tool-search-doc2query-canary.eval.ts` (n=20) | doc2query coverage 102/170; held-out top-1 15% (3/20) vs shipped-kw 45% (9/20) | **unchanged**: coverage 102/170; doc2query held-out top-1 15% (3/20) |
| `tool-search-hierarchical-canary.eval.ts` | 170 tools/32 domains; domain top-1 55% (11/20), found-anywhere 100% (20/20) | domain top-1 **60%** (12/20), found-anywhere 100% (20/20) |
| `tool-search-hyde-canary.eval.ts` (n=20) | raw top-1 45% (9) -> HyDE top-1 55% (11), found 80%->100% | raw top-1 45% (9, unchanged) -> HyDE top-1 **65%** (13), found 80%->100% |
| `tool-search-rerank-ceiling.eval.ts` (n=20) | top-1 45% (9); recall@10 ceiling 80% (16); 4/20 unreachable | **unchanged**: top-1 45% (9); ceiling 80% (16); 4/20 unreachable |
| `tool-search-scaling-curve.eval.ts` (sizes 131/250/500/1000) | shipped-kw top-1 stable 39-44%; HyDE top-1 stable 59-61% | shipped-kw top-1 stable **55-58%**; HyDE top-1 stable **77-80%** — same shape, all four sizes |
| `tool-search-caller2-score-captures.ts` (n=25, real captured queries) | top-1 **20%** (5/25) | **REVERTED, then QUARANTINED — no percentage printed at all**, see "Revision" and "Quarantine" sections below; the 60%/88%/92% figures below were this file's numbers before the coordinator's ruling, kept for the record only, not reproducible from the file as it stands now |
| `tool-search-quality.eval.ts` (n=25 primary / n=20 held-out) | primary top-1 84% (21/25), found 88% (22/25); held-out top-1 45% (9/20), found 80% (16/20) | primary top-1 **96%** (24/25), found **100%** (25/25); held-out **unchanged** 45%/80% — no false miss in this held-out subset |
| `tool-search-export-corpus.ts` | exports 170 tools/130 cases; **0 checked for resolvability by this file itself** (downstream consumer's problem) | exports 170 tools/130 cases; **0/130 `expect` ids unresolvable against the exported `tools` list** (verified directly: previously would have been 36) |

No suite jumped to 100% on its own primary reported number in a way I'd call suspicious.
`tool-search-quality.eval.ts`'s primary set did reach 100% found@10 (25/25) — flagged per instructions
— but I traced it directly: the pre-fix run's own "MISSES" section showed exactly 3 misses, all 3
literally printing `got: content_read.<resource>` against a `wanted: <retired id>`, i.e. textbook false
misses, and fixing exactly those 3 brings 22/25 to 25/25. Not a red flag; shown its work.
`tool-search-heldout-v2.eval.ts`'s +HyDE arm reaching found@10 100% (130/130) is a bigger jump and
worth a second look on its own terms independent of this fix — HyDE-via-prompt was already the
strongest arm pre-fix (98/130 found@10) and n=130 dilutes any single suspicious case, but I did not
independently re-verify each of the 32 newly-hit cases by hand; flagging rather than asserting.

**Three suites showed no change — stated explicitly as a result, not a null, so it does not later read
as "the migration didn't work there":** `tool-search-canary-significance.eval.ts`,
`tool-search-doc2query-canary.eval.ts`, and `tool-search-rerank-ceiling.eval.ts` (all n=20, all sharing
the same byte-identical `HELD_OUT_CASES` list per their own header comments). The fix is live in all
three — `currentToolIdFor` is imported and called in every one of them — but this particular 20-case
subset happens to contain only 2 of its 20 `expect` values from the retired-36 set
(`media_list_assets`, `seo_get_entry_meta`), and for both of those specific queries the live retrieval
did not rank the correct card within the cutoffs these three suites measure, either before or after
resolution. That is a genuine (pre-existing) retrieval gap on those two queries, not evidence the
re-key is inert — `tool-search-hyde-canary.eval.ts` and `tool-search-hierarchical-canary.eval.ts`,
which measure the SAME 20-case set at different cutoffs/mechanisms, both DID move (see table above).

## Domain routing — answered, and two follow-ups

**Coordinator's own answer, reproduced here so it lives beside the finding it explains:** shipped, but
label-only. `sourceForToolId` at `apps/website/src/assistant/tool-catalog-query.ts:36-39` does the
`id.split("_")[0]` bucketing and seeds the live FTS index at line 78, so all 29 `content_read` cards
really do carry `source: "content"` in production — but `source` is a plain column, never a MATCH or
rank term in the `fts5(id, description)` / `bm25(6.0, 1.0)` index (`@jini-ai/sqlite`'s
`tool-catalog.ts`), so retrieval itself is unaffected. Neither a live regression nor experimental-only.

**Follow-up 1 — does anything actually consume `source`? Yes, the model sees it; no live code path
groups or filters by it.**
- The model sees it directly, unfiltered, in both meta-tools:
  `apps/website/src/assistant/byok-tool-surface.ts:130` (the `search_tools` description text itself
  states the return shape as `{id, description, source, score}`), `byok-tool-surface.ts:274-286`
  (`runSearchTools` returns `ok({ hits })`, `hits` straight from `catalog.search()`, `source` included
  unmodified), and `byok-tool-surface.ts:291-304` (`runDescribeTool` returns `ok(entry)`, `entry` from
  `catalog.describe()`, same unmodified `source` field). So every collapsed card the model sees now
  says `source: "content"` where it used to say `workspace`/`widgets`/`backup`/etc. — visible, real,
  but nothing beyond a JSON field the model may or may not reason about (unmeasurable per the 2026-08-24
  report's own finding, already cited in this report's §0.3-equivalent discussion above).
- The one place that WOULD consume it programmatically —
  `apps/admin/src/features/plugins/tool-catalog-composer-source.ts:106` (`keywords: [hit.source]`,
  feeding the admin chat composer's "/" and "+" capability-menu fuzzy match) — is dead code. That
  file's own header states it was **deliberately unwired 2026-08-21** (an owner decision, cited with
  its own reasoning), and `AssistantDock.hooks.tsx:575` carries a doc-comment confirming the same.
  Control grep: `grep -rn "createToolCatalogComposerCapabilitySource" apps/admin/src --include="*.ts"
  --include="*.tsx" | grep -v __tests__` returns exactly 2 lines — the function's own definition and
  that one doc-comment — and zero live import/call sites. A second, broader control grep for `\.source\b`
  across all of `apps/website/src` and `apps/admin/src` (excluding tests) returned ~100 hits, confirming
  the pattern reliably matches real code (ruling out a silent-zero false negative) — of those, exactly
  one (the line above) is about a tool-catalog search hit; every other hit is an unrelated domain
  concept also spelled `source` (media blob sha256 provenance, theme `build.source`, redirect capture
  source, newsletter subscription source, plugin discovery source, etc.).
- **Net:** real, minor legibility loss to the model (29 distinct source labels collapsed to 1, visible
  in every `search_tools`/`describe_tool` response); zero functional/product impact, since the one
  consumer that would have turned that into a UI-visible grouping problem is already inert.

**Follow-up 2 — sweep for other unswept renames in eval fixtures/ground truth (scope: fixtures only, no
product code touched or swept).** Methodology, built to survive both cautions raised: (a) never trust a
grep's silence alone — cross-checked every extraction against a second, independent count (raw
substring occurrences) and hand-explained every discrepancy rather than accepting the delta silently;
(b) built the "known-good" id set from a LIVE run of the real composition
(`buildEvalToolRegistry`, 170 tools) plus `RETIRED_READ_TOOL_TO_CARD`'s 36 keys, not from
`git log -S`, so no rename-tracing/pathspec trap applies here at all.

Swept: `tool-search-heldout-v2.ts` (130 cases — already verified 0 unresolvable via the live
`tool-search-heldout-v2.eval.ts` integrity check, not re-derived), the 5 byte-identical 20-case
`HELD_OUT_CASES` copies (`tool-search-canary-significance.eval.ts`, `-doc2query-canary.eval.ts`,
`-hyde-canary.eval.ts`, `-rerank-ceiling.eval.ts`, `-hierarchical-canary.eval.ts` — confirmed
byte-identical: every one extracted exactly 47 distinct referenced ids, 0 unresolvable), 
`tool-search-quality.eval.ts`'s own `CASES`+`HELD_OUT_CASES` (52 distinct ids, 0 unresolvable),
`tool-search-caller2-compliance-captures-2026-08-05.ts`'s 25 `expectedToolId` values (1 unresolvable —
see below), and the generated `argument-fill-run-2026-09-08/afill-key.json` +
`afill-delete-key.json` (130 distinct ids each, 0 unresolvable — both already post-collapse artifacts).

**Result: exactly one unswept rename found, and it is the one already known** —
`integrations_list_subscriptions` in `tool-search-caller2-compliance-captures-2026-08-05.ts` (line 94).
No new instance surfaced. Given its own file is a dated capture (category C, never re-keyed per the
coordinator's ruling), there is nothing to fix here even though it is a confirmed stale ground-truth
id — reported, not touched, consistent with "fix only the fixture ground truth" (this one lives in a
capture, not a fixture). See the next section for why one pre-collapse rename going unswept is worth
someone asking about more broadly.

## Finding: a second, older, unswept rename — `integrations_list_subscriptions` -> `webhooks_list_subscriptions`

Called out as its own finding, not a footnote, per the coordinator's instruction: this is a SEPARATE,
OLDER instance of the exact same class of decay the collapse produced, from a rename nobody swept.

`tool-search-caller2-compliance-captures-2026-08-05.ts:94` — the captured case `integrations-list` —
has `expectedToolId: "integrations_list_subscriptions"`. That id does not exist in the live 170-tool
catalog. It is also NOT one of the 36 collapse-retired ids (`currentToolIdFor` returns it unchanged,
confirmed directly). The real tool was renamed at the domain level, `integrations` -> `webhooks`
(current id: `webhooks_list_subscriptions`), at some point BEFORE the 2026-09-08 collapse — this capture
was already stale on the day the collapse shipped, for a completely unrelated, earlier reason. It has
been scoring a permanent false miss in `tool-search-caller2-score-captures.ts` for however long that
rename has been live, invisible the whole time because nothing checked this suite's ground truth against
the catalog until today.

**Not fixed** — the id lives in a dated capture (category C above), which the coordinator's ruling
places off-limits even for a scoring-site resolution, so this is reported and left exactly as found,
identically to how the 2026-09-08 collapse instance was handled.

**Why this matters beyond this one id, per the coordinator's own framing:** one rename nobody swept
found this way means others plausibly exist and have not been looked for. The rename sweep in the
"Domain routing" section above covered every ground-truth fixture reachable from `development/evals/`
and found no OTHER instance — but that sweep is bounded to what currently exists as literal
`expect`/`expectedToolId`/`alsoAcceptable` string values in this directory. It cannot see a rename that
happened, then was ALSO later swept correctly (nothing left to find) versus one that has not yet
produced a visible symptom because the suite that would show it hasn't been run or audited recently.
Whether other pre-collapse renames are lurking elsewhere (product code, other test suites, other eval
directories not part of this dispatch) is exactly the open question the coordinator flagged — worth
someone asking later, not concluded here.

## Other genuine failures unmasked — not fixed here, per instructions

**Both findings below were observed while `tool-search-caller2-score-captures.ts` was still re-keyed
(before the coordinator's ruling and the revert documented earlier).** They describe real retrieval
behavior seen during that run, not an artifact of the (now-reverted) re-keying itself, so they are
recorded as-is rather than discarded — but this suite's LIVE state today is the reverted one (20%, raw
ids), not the 60% state these two items were observed against.

1. **Nine other genuine misses in `tool-search-caller2-score-captures.ts`** (of the 25 real captured
   queries): `recipes-list`, `content-list`, `content-update` (model never called `search_tools` at
   all), `identity-user-list`, `members-list`, `redirects-list`, `seo-entry-meta`, `widgets-list`,
   `workspace-get`. Each now compares correctly (both sides resolved) and still misses — the model's
   real captured query ranked the wrong tool/card, not a scoring artifact. Genuine retrieval quality
   findings, not mine to fix.

2. **Hierarchical/domain-routing accuracy genuinely degraded by the shipped collapse — not a false
   miss, a real cost, and now fully characterized in "Domain routing — answered, and two follow-ups"
   above (the coordinator's shipped-but-label-only ruling, what consumes `source`, and the rename
   sweep).** Restated briefly here for the list: `tool-search-all-approaches-v2.eval.ts`'s
   domain-routing metric is **30% (39/130) domain top-1**, because `domainOf`/`sourceForToolId` splits
   on `_`, so all 29 `content_read.*` cards now bucket under one domain, `"content"`, instead of their
   29 original domains. `tool-search-hierarchical-canary.eval.ts`'s narrower 20-case version only moved
   11/20 -> 12/20 because few of its 20 cases have their `expect` inside the collapse set. Not a
   regression to fix — retrieval itself is unaffected (`source` is not a rank/MATCH term) and the
   consumer that would have turned it into a UI problem is dead code — but a real, disclosed metric
   change worth knowing if domain-routing is ever revisited as a design.

3. Every other suite's remaining top-1/top-5/top-10 gap after this fix (e.g.
   `tool-search-heldout-v2.eval.ts`'s shipped-keywords arm still misses 13% at found@10) is the same
   genuine retrieval-quality signal the parent-tool-read-eval report already characterized (D1-SHIPPED
   matches BASELINE case-for-case) — nothing new surfaced by this pass beyond the findings above.

## Was this suite ever a meaningful eval? — the finding the coordinator asked for

**`tool-search-caller2-score-captures.ts`: 18 of its 25 cases (72%) have ground truth that is a
retired-collapse id.** Counted directly against the capture file, not estimated:
`backup_list_restore_points, collections_entry_list, comments_list_moderation_queue,
content_post_list, forms_list_definitions, identity_user_list, media_list_assets, members_list,
menus_list_menus, newsletter_list_campaigns, plugins_list, redirects_list, seo_get_entry_meta,
settings_list_definitions, taxonomy_list, theme_list, widgets_list_instances, workspace_get`. Not
literally "entirely retired ids," but overwhelmingly dominated by them — meaning this suite's pre-fix
20% (5/25) was measuring almost nothing about real retrieval quality; 18 of its 20 misses were
guaranteed misses by construction the moment the collapse shipped, regardless of what the live agent
actually did. Whatever this suite is meant to answer, it answered close to nothing for the three weeks
between the collapse shipping and either this fix or the coordinator's revert landing.

No other suite touched in this pass comes close to that proportion — `tool-search-heldout-v2.ts`'s
130-case fixture is 26% retired-id ground truth (34/130, the Tier-1-only figure from
`ADS-memory/reports/2026-09-08-parent-tool-read-eval.md` §3's addendum), and the five 20-case canary
sets sit even lower (2 of 20 for the ones checked directly above). `tool-search-caller2-score-captures.ts`
is the one outlier worth naming.

## Revision — `tool-search-caller2-score-captures.ts` reverted

After sending the first version of this report, the coordinator ruled: dated captures and historical
records are never re-keyed, **including at the scoring site** — resolving a frozen capture's ids
against today's catalog is a live design decision (how should a one-time historical measurement be
interpreted once the thing it measured has structurally changed?), not a mechanical ground-truth fix,
and it belongs to the coordinator to decide, not to this dispatch.

`tool-search-caller2-score-captures.ts` is exactly that case: it scores
`tool-search-caller2-compliance-captures-2026-08-05.ts`'s `expectedToolId` (a frozen 2026-08-05
capture) against the live, now-collapsed catalog. My original fix resolved `capture.expectedToolId`
and the matched held-out case's `alsoAcceptable` through `currentToolIdFor` at the point where the
`acceptable` set is built — the capture FILE itself was never edited, only the scorer's
interpretation of it. On reflection this is still squarely inside the rule: the capture is "also being
used as live ground truth by a running suite," which the coordinator named as the design-problem case
rather than the re-key case.

**Reverted.** Removed the `currentToolIdFor` import and the `.map(currentToolIdFor)` call; restored
the original `new Set<string>([capture.expectedToolId, ...(heldOutCase?.alsoAcceptable ?? [])])`.
Re-ran fresh: **top-1 5/25 (20%)** — confirmed byte-for-byte the same output as this suite produced
before this whole pass touched it, i.e. a clean revert, not a partial one.

**The design problem, for the coordinator to decide:** as things stand, this suite will keep scoring
~20% indefinitely — not because retrieval is bad, but because 72% of its ground truth points at ids
that no longer exist. Options, not a recommendation:
1. Leave it frozen and 20% forever, as an honest (if increasingly useless) record of 2026-08-05.
2. Re-key it after all, accepting that the "measurement" becomes "did 2026-08-05's captured queries,
   scored against TODAY's catalog, still find the right thing" — a hybrid that is neither a pure
   historical record nor a pure live eval.
3. Treat it as retired/superseded now that the catalog it measured no longer exists in that shape, and
   either archive it or replace it with a fresh capture run against the current catalog (the harness
   that produces captures, `tool-search-caller2-compliance-harness.ts`, is untouched and still works —
   it just costs ~16 minutes of live local-CLI time per run).

## Quarantine — coordinator's ruling on the design problem above

The coordinator ruled option 3 in principle (retire and re-capture) but explicitly declined to run the
harness tonight — a fresh capture is ~16 minutes of real billed local-CLI API calls Leona has not
authorized, and today's load (>300 for stretches) would freeze today's contention into the fixture. That
spend is queued in a batch of decisions for her, not made here. Option 1 (leave it silently frozen at
20%) was ruled out as the worst choice: an unlabelled 20% sitting in this repo's output is exactly how a
fabricated tool-search accuracy figure survived unnoticed for a month elsewhere in this codebase
(`2026-09-08-parent-tool-read-eval.md` §0.1) — a number nobody knows is stale gets quoted as if it
weren't.

**What was done instead: quarantine the suite so its output cannot be misread as a measurement**, per
the coordinator's explicit instruction. `tool-search-caller2-score-captures.ts` now:
- Carries a loud `@file` header stating the quarantine, the date (2026-09-08), the 72% figure, why a
  capture going stale is a data problem rather than a scorer bug, and what unblocks it (a fresh capture,
  owner-authorized).
- Prints a banner at the START of its run pointing to the notice at the end, before the per-case detail.
- Tags every per-case line whose `expectedToolId` is a collapse-retired id with `[STALE: collapse-
  retired id]` (computed live via `RETIRED_READ_TOOL_TO_CARD.has()` — a membership check for the
  warning label only, never used to resolve/re-key the `acceptable` set the score is computed from, so
  this does not reintroduce the reverted re-key).
- **No longer prints a top-1/top-3/top-5/found@10 percentage table at all.** Removed the aggregate
  `hits`/`CUTOFFS` computation entirely rather than compute-then-suppress. In its place, a QUARANTINE
  NOTICE block computes and states the live `retiredCount`/`retiredPct` (not hardcoded — re-derives 18
  of 25, 72%, from `RETIRED_READ_TOOL_TO_CARD` and the capture data on every run, so it cannot silently
  drift stale itself) and says explicitly: "Do NOT quote a number from this run as a retrieval
  measurement." Verified by running it fresh: the printed output contains no `X/25 (Y%)`-shaped line
  anywhere — a number that isn't printed cannot be misquoted.

The capture file itself, `tool-search-caller2-compliance-captures-2026-08-05.ts`, remains completely
untouched — the quarantine lives entirely in the scorer's presentation, not in the frozen data.

## Verification

- Every fixed file re-run fresh via `npx tsx development/evals/<file>` from repo root, exit 0, real
  (non-degenerate) numbers — outputs quoted above are from those runs, not inherited.
- `npx tsc -p tsconfig.json --noEmit` from repo root: **clean, 0 errors**, after all 12 edits.
- `tool-search-heldout-v2.eval.ts`'s own integrity line: `unresolvable ids 0 (all resolve)`, down from
  38 — direct proof the resolution works across the full 130-case set, not just spot-checked cases.
- `tool-search-export-corpus.ts`'s exported JSON checked directly (script, not eyeballed): 0/130
  `expect` ids fail to resolve against the exported `tools` list.
- No `serve-command*.integration` suite run. No unscoped runner invocation. Every run scoped to one
  file, one runner (`npx tsx`), from repo root.
- `git status`/`git diff --stat` scoped to `development/evals/`: exactly the 12 files above, no stray
  changes, no scratch files left behind (`_scratch-quality-before-2026-09-08.eval.ts` was created and
  deleted in the same pass, before this diff was taken).
- Confirmed by direct read + `git status`: `apps/website/src/assistant/tool-search-keywords.ts` and
  `tool-search-doc2query.ts` are unmodified.

## Not done (out of scope per dispatch)

- Did not touch `tool-search-parent-tool-delete.eval.ts`, `apps/website/src/features/**`
  delete-confirmation code, `mcp-ui-tool-calls.ts`, or `apps/admin/src/lib/api.ts`.
- Did not expand coverage: no new eval cases added anywhere.
- Did not change any product code (`content-read-tool.ts`, `tool-registrations.ts`, etc.) — read-only
  as a dependency, never edited.
- Did not fix the `integrations_list_subscriptions` stale-rename ground truth (its own finding, "A
  second, older, unswept rename" above — it lives in a dated capture, which is out of bounds even for
  a scoring-site resolution) or the 9 genuine retrieval misses (finding 1 in "Other genuine failures
  unmasked") — flagged, not silently patched.
- Swept eval fixtures/ground truth for other unswept renames (scope: `development/evals/` only, no
  product code) — found none beyond the one already known. Did not sweep product code, other test
  suites, or eval directories outside this dispatch, per explicit scope instruction.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
