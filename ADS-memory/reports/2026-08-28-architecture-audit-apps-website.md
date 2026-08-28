# apps/website/src — architecture-quality audit

Date: 2026-08-28. Commit: `40e1294e` on `restructure/apps-website-phased`. Scope: `apps/website/src`.

Answers the checklist agreed 2026-08-28 (see `project_tovu_next_session_observability_and_folder_debate`
memory): is the code that now lives under `apps/website/` actually well-built, not just "compiles and
tests pass"? 16 items, each mapped below to how it was checked and what it found.

Sources: a fresh run of `development/scripts/code-metrics.py` (12/13 metrics; report at
`ADS-memory/.local-artifacts/metrics/2026-08-28-code-metrics.md`), cross-checked against last
session's independently-verified numbers (`project_apps_website_real_quality_numbers` memory), plus
a dedicated DI/modularity audit for the two items no tool in this repo measures
(`ADS-memory/.local-artifacts/metrics/2026-08-28-di-modularity-audit.md`), independently spot-verified
by the Coordinator (not taken on the sub-agent's report alone).

## Checklist coverage

| # | Item | Status | Headline |
|---|---|---|---|
| 1 | Blast radius | Measured | `@jini-ai/cms/core` has 1,180 transitive dependents (widest); `platform/db/schema.ts` 784 |
| 2 | Tangled/coupled code | Measured | 7 real circular-dependency cycles found; longest chain 5 modules |
| 3 | DI usage | Audited (agent + verified) | **GOOD** — composition-root pattern holds under spot-check; 1 real gap found (below) |
| 4 | Modularity | Audited (agent + verified) | **MIXED** — mostly matches its own docs; 1 stale doc + 1 undocumented hotspot domain found |
| 5 | Cyclomatic complexity | Measured | max CCN 63 (`site/render.ts#safeImageSrc`); 87 functions over 10 |
| 6 | Cognitive complexity | Measured (censored sample) | 13 functions still breach the repo's own threshold; max 36 |
| 7 | Fan-in/fan-out | Measured | app-code max fan-in ~251 (`dev-auth.ts`); max fan-out 138 (`composition/app.ts`, expected — it's the composition root) |
| 8 | Duplication | Measured | 7.99% raw at min-tokens 50 — consistent with last session's corrected 4.4%/1.4% (that run excluded drizzle snapshots; this one does too) |
| 9 | Churn × complexity hotspots | Measured, **with a caveat** | see "Known gap" below — table entries use pre-restructure file names |
| 10 | Circular deps / layering | Measured | same as #2; `.dependency-cruiser.mjs` now has a cycle rule (added this session, `warn`, 35 known violations) |
| 11 | Coverage vs. complexity | Measured | 94.6% but only over 585/1075 files in the lcov artifact — files outside that are **not measured**, not untested |
| 12 | File/function size | Measured | longest function 944 lines (`site/render.ts#safeHref`); biggest file 1,388 lines (`theme/theme.ts`) |
| 13 | Dead code / unused exports | **Not re-run — see gap below** | last session's verified number stands: ~240 real dead exports (15% TP rate), 490 unused files |
| 14 | Type safety (`any` usage) | Measured | 1,532 explicit `any` (was 1,398 last session — real drift, new code since then) |
| 15 | API surface size per module | Measured directly (script's own proxy metric is too weak to use) | 13 of 39 `features/` directories have no `index.ts` barrel at all |
| 16 | Change coupling | Measured, **with the same caveat as #9** | 106 hidden co-change pairs (file identity may be pre-restructure) |

## Known gaps in this run

1. **`code-metrics.py`'s dead-code (knip) step is currently broken for this repo layout.** It calls
   `knip --directory apps/website`, but `apps/website/` has no `package.json` of its own (this isn't
   an npm workspace member), so knip fails with `Unable to find package.json`. Not a data problem —
   the flag itself doesn't apply here. Worth a small fix to the script later; today's number instead
   reuses last session's already-verified figure (~240 dead exports, 490 unused files), which is only
   hours old and every other metric that overlaps between the two runs (change coupling: 106 both
   times; cyclomatic max: 63 both times) confirms nothing material moved in between.

2. **Churn/hotspot/change-coupling file names can be pre-restructure identities git can't bridge.**
   Verified directly: `apps/website/src/server/app.ts` (76 commits in the churn table) no longer
   exists — `git log --follow` on that path returns nothing. The file's current name is
   `apps/website/src/server/runtime/composition/app.ts`. This branch's internal reorg wasn't a plain
   `git mv` for every file (some changed too much for git's own rename-similarity threshold to catch),
   so git's rename detection — and therefore this script's `-M -C` history parsing — cannot connect old
   and new identities for those files. This is a git limitation, not a script bug. **Practical effect:**
   treat the churn/hotspot tables as "which OLD file identities were hot," not a live ranking of
   today's files — several of today's actual hottest files are likely undercounted since the rename.

## The 2 real findings worth acting on (verified directly, not just on the audit agent's word)

1. **A documented rule-of-two adapter is unreachable in production.** `features/comments/index.ts:79`
   hardcodes `new HeuristicSpamCheck()`; `CommentsModuleDeps` has no `spamCheck` field. The second
   adapter, `AkismetSpamCheck` (`spam.external.ts`), is fully built and tested but is imported from
   nowhere except its own test file — confirmed via grep. Fix: add `spamCheck?: SpamCheckPort` to
   `CommentsModuleDeps`, default to `HeuristicSpamCheck` when omitted.
2. **`features/webhooks/INFO.md` is stale.** It lists SQLite adapters for
   `WebhookSubscriptionRepoPort`/`WebhookDeliveryRepoPort` under "Future direction" — confirmed both
   already exist (`platform/db/sqlite/webhook-repo.sqlite.ts`, 358 lines) and are live-wired into
   `server/runtime/composition/deps.ts:923-924`. Also: that adapter lives outside the feature folder,
   unlike every sibling feature's `repo.sqlite.ts` convention — worth relocating, or documenting why
   webhooks is the exception.

Smaller, lower-severity items (full detail + file:line citations in the DI/modularity report):
`features/theme/` — the single largest, most complex, most-churned feature — has no `INFO.md` at all;
4 files import `AuthorizeFn` from `@jini-ai/cms/core` directly instead of the local-redeclaration
pattern ~40 other files follow (harmless today, a latent inconsistency); no `FileSystemPort` exists
anywhere despite every other I/O boundary being ported (applied consistently, reads as a deliberate
scope choice, but leaves `theme.ts` — the biggest hotspot — untestable without real files on disk).

## What's genuinely fine, not just "not flagged"

Composition-root DI discipline holds under spot-check, not just by convention. The in-progress
`RouteDeps` decomposition (splitting a 1,383-line god-interface into named, narrowly-justified slices)
is real narrowing work, not cosmetic. Rule-of-two adapters are real and mostly reachable. 3 of 26
`INFO.md` files were checked word-for-word against their code and matched, including naming their own
known simplifications rather than overclaiming. Route handlers stay thin — verified by reading
`posts/create.ts`/`update.ts` in full. None of this needed a rewrite; every finding above is a
targeted, single-file fix.

## Not covered by this pass

Full qualitative "blast radius of a hypothetical change" (item 1) was only measured structurally
(transitive import closure), not walked end-to-end for a specific proposed change — that needs a real
change to test against, not a standing audit. Cognitive complexity is a censored sample by
construction (SonarJS only reports functions that already breach the configured threshold), not a
full distribution.
