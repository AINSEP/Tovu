# Memory-store prune and index compaction — 2026-09-12

Store: `/Users/la/.claude/projects/-Users-la-Programming-Tovu/memory/` (outside the repo, under
`~/.claude`, not version-controlled — hence the mandatory backup below).

Scope: compact `MEMORY.md` under its read limit, and find stale/wrong/duplicate entries. Deletions
were restricted to the clear-cut; everything requiring judgment is listed here for the owner.
No repo files were changed. No tests were run. No processes were killed.

---

## 1. Backup — how to reverse anything in this report

```
/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/1df5924e-0ced-4b9b-90f4-7a7c05974d1b/scratchpad/memory-backup-before-prune
```

Taken before any edit. Verified byte-for-byte: **367 files / 1,288,354 bytes** on both sides.
All four deleted files are present there. Any change below is reversible with a single `cp`.

Note: `reference_mtime_measured_files_must_be_frozen.md` is absent from the backup as well as from
the live store — the team lead deleted it before the snapshot. Not a discrepancy.

## 2. MEMORY.md

| | bytes |
|---|---|
| before | 22,296 |
| after | 17,022 |
| target | < 17,100 |
| hard read limit | 24,400 |

267 unique pointers, **0 dangling**, all 14 `##` headings preserved in original order, all six
standalone prose warnings kept verbatim (the `env -u TOVU_ADMIN_PASSWORD` line, the pipe/`timeout`
line, "Correct primitive, unwired call site", the jsdom `<details>` line, the `<a>...<button>` scan
line, and the `kill -TERM` correction).

Only two pointers left the index, both because the file was deleted. No pointer was dropped to save
bytes.

Method: labels cut to ~10 characters, and every trailing em-dash hook stripped — but **each hook was
first checked against its target file**, and the two that were not already there were appended to the
target before removal:

- "admin is the inverse" -> appended to `reference_tovu_tests_must_run_from_repo_root` (verified:
  root `test` is `node --import tsx --test` over repo-root-relative globs; `apps/admin`'s is a bare
  `vitest run`).
- "except `openContentDbReadOnly`" -> appended to `reference_migrations_auto_apply_on_live_db`
  (verified: `apps/website/src/platform/db/sqlite/content-db.ts:116`, with
  `__tests__/content-db-readonly.unit.test.ts` as the standing proof).

## 3. Deleted — 4 files, each clear-cut

| File | Deciding evidence |
|---|---|
| `reference_start_here_md_claims_greenfield.md` | Asserts START-HERE.md *"still says Status: greenfield — ... there is no code yet"*. It now reads **"Status: active, existing codebase."** and even carries the memory's own advice ("do not treat it as a from-scratch build entry point, and do not conclude there is nothing to port or preserve"). Subject provably gone. |
| `reference_session_pid_from_socket_path.md` | Strict subset of `reference_session_identity_is_the_socket_pid.md`: same fact, same 2026-09-05 incident, same "never lstart correlation" rule, same cross-link. Survivor adds the three-misattribution narrative and the exact commands. Only unique content was four ephemeral session-to-pid pairs. |
| `reference_git_log_S_path_scoped_false_negative.md` | Strict subset of `reference_git_log_S_pathspec_false_negative.md`. Both state *"The pathspec causes the miss, not the absence of `-M`"* and cite the same worked example (`d6ac6975`, 2026-08-08). Its one unique detail (the fabricated 98%/100% tool-search figure) was merged into the survivor first. |
| `feedback_no_logic_in_tsx_components.md` | Duplicate statement of the rule in `feedback_component_logic_belongs_in_hooks.md`. Merged, not dropped (see below). Also carried a broken `name:` (hyphenated, against an underscored filename). |

Before each deletion, the whole store was grepped for inbound `[[links]]` in **both** the underscore
and hyphen spellings. None of the four had any inbound link, so no dangling links were created.

## 4. Merged

- `feedback_no_logic_in_tsx_components` -> `feedback_component_logic_belongs_in_hooks`. Carried over:
  the 2026-09-02 `Posts.tsx` incident and the owner's verbatim quote, the concrete
  `features/<x>/hooks/use-<x>.hooks.ts` conventions, the standing repo-wide-sweep TODO, and the note
  that Sonnet is the default writer so the rule must be stated in the spawn prompt.
- `reference_git_log_S_path_scoped_false_negative` -> `reference_git_log_S_pathspec_false_negative`.

## 5. Content moved out of the index into real files

`MEMORY.md` was holding memory content, against its own contract ("no frontmatter and no memory
content, only pointers"). Three long content-bearing lines became proper files, each with a pointer
left in the index:

- `project_tovu_footer_dead_links.md`
- `project_aad_backfill_is_a_noop_on_live.md`
- `project_jini_cms_role_seed_not_idempotent.md`

## 6. ACTIVELY WRONG — the repo contradicts these today

Kept separate from the merely stale, because a confidently wrong memory is dangerous in a way an
outdated one is not.

**6.1 — UNRESOLVED, needs an owner call.** Two memories give different numbers for the same
quantity, written the same day, neither superseding the other:

- `project_tovu_runtime_overlay_reaches_seven_of_24` — *"The system-prompt overlay reaches 7 of 24
  runtimes"*, verified 2026-09-02 by an Opus 5 audit of Jini `2268bd5c`.
- `reference_runtime_mcp_and_overlay_coverage` — table row: `systemPromptDelivery` | the overlay
  (prompt text) | **4 of 24**, verified 2026-09-02 by reading every def in
  `Jini/packages/agent-runtime/src/defs/`.

Whichever is quoted, one is wrong. I did not attempt to adjudicate — that needs a read of the Jini
defs, which was out of scope for a prune.

**6.2 — FIXED in place.** `reference_mutation_sweep_tool` gave the path as
`scripts/mutation-sweep.mjs`. Real path is `development/scripts/mutation-sweep.mjs` (the file already
self-corrected at its line 55, but its description and usage line did not). Description and usage
line corrected.

**6.3 — FIXED in place.** `reference_src_theme_archive_is_a_live_fixture` pointed at
`src/theme-archive/`, which no longer exists; it moved to `development/fixtures/theme-archive/`
(commit `4f6ce56`, 2026-08-09) and now holds 7 themes (`clean-blog`, `column`, `dispatch`,
`grayscale`, `ledger`, `minima`, `tovu-official`). The substance still holds — the call sites load it
by absolute `process.cwd()` joins in
`apps/website/src/features/theme/__tests__/{handlebars,liquid}-allowlist.test.ts`, `theme.test.ts`,
and the `public-http/http/site/__tests__/render*.test.ts` suites — so the path was corrected rather
than the file deleted.

**6.4 — FIXED in place.** `project_tovu_check_gates_all_report_only` said "10 of 19" (its index line
said "9 of 19"). Re-derived 2026-09-12: root `package.json` declares **22** `check:*` scripts, and
**8** are referenced by no other root script and no `.github/workflows/*` file
(`embed-marker-drift`, `governance-adr-scope-drift`, `menu-href-allowlist-sync`, `openapi-contract`,
`openapi-secret-leaks`, `outbox-bridge`, `secret-scan`, `theme-replaced-elements`). The ratio moved;
the finding did not. The continue-on-error claim about the wired steps was NOT re-verified.

**6.5 — DELETED.** `reference_start_here_md_claims_greenfield` (see section 3).

**6.6 — Systemic, NOT touched.** **185 of 366 files** have a `name:` frontmatter that does not match
their filename (the harness writes hyphens; hand-authored files use underscores), and **119 of the
143 dangling `[[wikilinks]]` in the store resolve if you swap `-` for `_`**. Since hub files are how
~99 unindexed memories stay reachable, a large share of that graph is silently broken. Mechanically
fixable in one pass. Not done here: it touches half the store and is a different task from a prune.
The four indexed hubs are NOT affected — 91 of 91 of their links resolve.

Also fixed: `project_parent_tool_collapse_retrieval_verdict` linked to
`[[reference_recheck_inherited_premises]]`; the real file is `feedback_recheck_inherited_premises`.

## 7. JUDGMENT CALLS — recommend, but did not act. Owner's decision.

1. **`project_tovu_runtime_overlay_reaches_one_of_24`** — `..._seven_of_24` states in its own body:
   *"Supersedes the earlier 'reaches 1 of 24' figure."* Near-clear-cut, BUT it carries a second,
   un-superseded finding (non-resuming runtimes get no conversation history at all — `grep -c
   history` on the 7/24 file returns 0). **Recommend:** move that second finding into the 7/24 file,
   then delete this one. Do not delete it as-is.

2. **`project_tovu_runner_is_the_desktop_app`** — *"The Tovu desktop app ALREADY EXISTS as the
   sibling Tovu-Runner repo ... don't design a new one."* No self-marker, but `apps/desktop/` exists
   and has its own six-line section in the index. **Recommend:** rewrite as "Runner is prior art;
   apps/desktop is the real one", or fold into
   `reference_tovu_runner_is_prior_art_electron_packaging`.

3. **`reference_tovu_deploys_from_a_separate_public_mirror`** — self-marked *"SUPERSEDED 2026-09-10:
   origin IS the deploy repo leonaburime-ucla/Tovu (public). The old two-disjoint-repos model is
   dead."* The filename now asserts the opposite of the content. **Recommend:** rename, do not
   delete — the correction is the value.

4. **`project_tovu_byok_blocked_by_chatpane_cli_gate`** — self-marked *"SUPERSEDED/FIXED
   2026-09-01"*, but still states a standing architectural fact: `@jini-ai/chat`'s ChatPane computes
   "No usable CLI is selected" purely from CLI detection, with no `executionMode` branch.
   **Recommend:** keep; retitle so the filename stops asserting a fixed blocker.

5. **`feedback_subagent_dispatch_mode`** — *"User prefers plain one-shot subagent dispatch over
   persistent Agent-Teams teammates by default."* The 2026-09-12 session ran as Agent-Teams with
   named teammates throughout. **Recommend:** confirm the current preference with the owner, then
   rewrite or delete. Do not delete on my inference alone.

6. **`reference_asar_packing_corrupts_silently_under_concurrent_edits`** and
   **`reference_packing_a_live_tree_signs_a_corrupt_artifact`** — same incident, same finding, two
   files, both written during this session by a concurrent agent. Both are indexed and neither was
   pruned. **Recommend:** merge once that agent has finished. Not touched: undoing another agent's
   in-flight work needs their report first.

## 8. Self-marked SUPERSEDED files deliberately KEPT — and why

"Delete anything marked superseded" is the wrong default, and the next prune will face this call.
Each of these still explains *why* the old belief was held, which is the part that prevents the
error recurring:

- `reference_admin_build_exits_zero_while_blocked` (marked RETRACTED) — still carries a live,
  unfixed defect: `apps/desktop/scripts/stage-payload.mjs:64` declares `apps/admin/dist` with an
  `existsSync`-only freshness check at `:352`/`:384`, and warns that the obvious "pattern to follow"
  (`warnIfDistIsStale` at `:326-336`) reproduces the same bug while looking like consistency.
- `project_parent_tool_collapse_retrieval_verdict` (marked RETRACTED) — holds the measured re-run
  numbers and the confound analysis; deleting it invites the retracted 85%->59% claim back.
- `project_tovu_templated_theme_preview_gap` — records why the gap was written the same day the
  pipeline shipped.
- `project_jini_renderers_react_standalone` — the weakest of the five; see item 6 below on remaining
  work.
- `reference_media_has_no_slug_only_uuid` — records the old state and precisely what changed.

A retraction that records *how* the error happened is worth more than a clean store.

## 9. STRUCTURAL FINDING — the index is at its floor

**Correction first:** an earlier draft of this finding said "~25 low-frequency pointers can move
behind hubs." **That figure was my error and should not be quoted.** I tested it afterwards; the
measured answer is in 9.2.

**9.1 The arithmetic.** At 267 pointers:

| component | bytes | movable? |
|---|---|---|
| bare filenames | ~11,600 | no |
| link syntax `[](...)` | ~1,070 | no |
| **immovable base** | **~12,670** | — |
| labels | ~2,500 | exhausted |
| headings, bullets, separators, newlines | ~960 | no |
| protected prose warnings | ~630 | deliberately kept |

Filenames alone are **68% of the file**. 17,022 bytes was reached only by cutting labels to ~10
characters and stripping every hook; there is no further label headroom. **Roughly 10 more memories
breach the 17.1KB target again**, and ~40 more breach the 24.4KB hard limit, at which point the
owner loses memory access at session start.

**9.2 Answer to "which 25, by what criterion" — I cannot defend a list of 25, so I am not giving
one.** The defensible criterion is "already summarised inside a hub that is itself indexed", since
moving such a pointer costs nothing new. Measured: 267 indexed pointers, 91 hub children,
**overlap = 2** (`project_tovu_deployment_model`, `project_tovu_todos_md_is_half_stale`).

The index and the hub system are **near-disjoint**. The hubs are carrying the ~99 *unindexed*
memories — which is exactly why those stay reachable — not duplicating the indexed set. So moving an
indexed pointer behind a hub is not a reshuffle; it requires **authoring new curated summary prose
into a hub**, and only 4 of the 14 index sections have a hub at all (coverage traps, dispatch,
platform state, tool delivery). Admin UI, Tests, Git safety, Themes, Database and Environment have
none.

**9.3 Answer to "what does a hub-resident pointer cost at recall time".** Two retrieval paths exist:
`MEMORY.md` is loaded verbatim at session start (observed directly this session), and each file's
`description:` field is documented as "used to decide relevance during recall", a path independent
of the index. A hub-resident memory loses the first and keeps the second, plus "the agent opens the
hub."

The hub route is genuinely good here: all four hubs give each child an **inline one-line summary**
rather than a bare link, and **91 of 91 of their wikilinks resolve**. But the hit rate of the
description-recall path cannot be measured from inside a session, so the move should not be called
free. The cost concentrates entirely in whether the **hub's own index line** pulls the agent in —
which makes those four lines the highest-leverage text in the file. (This pass initially cut three of
them to a bare "hub"; that was a regression and has been reverted to `coverage traps hub`,
`dispatch hub`, `platform state hub`, `tool-delivery hub`.)

**9.4 Options for the owner, in the order I would put them.**

- **(c) Shorten filenames — the one that actually pays.** Filenames average 43 characters and are
  68% of the file. Bringing them to ~25 would free ~4.8KB, more than any pruning can. Cost: a
  mechanical rename plus a wikilink and `name:` rewrite pass. Since 185 files already have
  mismatched `name:` frontmatter (6.6), that pass is arguably needed regardless — doing both at once
  is the efficient move.
- **(a) Author hubs for the six sections lacking one**, then move their settled `project_*` decision
  records behind them. Real authoring work, not a reshuffle.
- **(b) Treat the index as a fixed-size cache** with an explicit, written eviction rule, so the next
  agent does not have to re-derive this trade-off under pressure.

## 10. Remaining work — not done, deliberately

1. Adjudicate the 7/24 vs 4/24 overlay contradiction (6.1) by reading the Jini agent-runtime defs.
2. The hyphen/underscore `name:` and wikilink repair (6.6) — 185 files, ~119 recoverable links.
3. A systematic read of the ~99 hub-only memories. This prune sampled them via descriptions and hub
   contents but did not read them end to end. A fresh agent's job.
4. The five self-marked SUPERSEDED files (section 8) were judged and kept; re-litigating them is not
   recommended without new evidence. `project_jini_renderers_react_standalone` is the one I would
   revisit first if index bytes are needed.
5. Merge the two asar/packing memories once their author is done (7.6).

## 11. Method notes worth reusing

- `grep` on this machine is **ugrep**: `grep --search ...` failed outright during this pass, and
  `--include`/`--exclude` are silently ignored. Pass explicit paths; use `-e` for any pattern that
  starts with a dash.
- Never verify an index against disk with a case-sensitive `[a-z]` filename pattern — it silently
  missed `reference_git_log_S_*` and `project_*_SOLVED` and reported false orphans.
- A regex that strips trailing em-dash hooks will also eat an em-dash **inside a label**, destroying
  the whole link. It did exactly that to `feedback_verify_agent_liveness_with_ps` here; caught only
  by diffing the pointer set before and after. Diff the pointer set after every bulk index edit.
