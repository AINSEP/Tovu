BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed. READ-ONLY job: change no file.
You are a refactoring architect (Codex 6.2). OWNER PRIORITY (owner 11-20: "plan the rest of the Tovu to Jini extraction, all of it… finish the Tovu extraction immediately"): extract generic code from Tovu into Jini, then organize Jini (packages import only their own package + @jini-ai/core + @jini-ai/protocol; host presets server/cli excepted). Generic code goes to Jini behind ports Tovu wires; product names, env, routes, product copy stay in Tovu.
BASES: cwd = private Tovu clone at `integ/merge-6-2026-11-19` (776ce6d0f; branch name in this clone: the current HEAD). Jini at `SCR/ro-m6-jini` (Jini `integ/merge-6-2026-11-19`, d3e78b387), READ-ONLY.
PUSHED BUT NOT YET COMBINED (they are NOT in either base; read them with `git show <ref>:<path>` / `git grep -n -F '<x>' <ref> -- <dir>` / `git diff --stat <base>...<ref>` whenever your item touches the same files, and say in each sheet which of them it must run after):
- Tovu (refs in cwd, each `origin/codex/<name>`): tv-tq, tv-c6fix, tv-fn50-1, tv-fn50-2, tv-fn50-3, tv-fn50-4, tv-fn50-5, tv-ub, tv-b1, tv-bl, tv-b2, tv-po, tv-b3, tv-b4, tv-ext-rs-c, tv-rs-e, tv-split, tv-dh, tv-xd5-render, tv-xd5-publish; plus origin/claude/uiux-split.
- Jini (read ONLY with `git -C <jini> show|diff|log … origin/codex/<name>`, read-only, never checkout or write there; `origin/claude/uiux-split` is readable in ro-m6-jini): jx-c6fix, ua-jini, ub-jini, rsh-jini, bl-jini, jb1, jb2, dj-jini, xd-rs-c, xd-rs-c2, rs-e-jini, split-jini, dh-jini, tq-jini, tq-jini2; plus claude/uiux-split.
- What each pushed job ran: its prompt `SCR/j-<job>/<job>.md` (the TASK/SHEETS section names its sheets) and its executor report `SCR/o-<job>/<job>.md` (+ COMMIT-PLAN.md / REFRESH.md on the branch). A sheet that STOPPED there is still open; a sheet that finished there = RETIRE with the branch as evidence.
IN FLIGHT, assume they land first: Jini jy-pay, jy-core, jy-pads, jy-cls, jy-pa, jy-pb; Tovu tv-y1, tv-y2 (launch-44-41; prompts in `SCR/j-<job>/<job>.md`). Never sheet what their prompts name; a sheet touching their files says "after <job>".
PLANS: Tovu plan branches are fetched into cwd: list `git branch -r --list 'origin/plan/*'`, read `git show origin/plan/<name>:<path>`. Older extraction surveys (phase 0/1/3, batches 1-28): `SCR/ro-tovu-ext/.plan/extraction-surveys/xpkg-plan-result.md` (batches at lines ~378-460) and `xpkg-plan-review.md`. 11-11 survey evidence (read-only): `<tovu>/ADS-memory/.local-artifacts/extraction-survey/2026-11-11/` (SURVEY-SUMMARY.md, judge reports). Status reports: `SCR/sheet-census-2026-11-19.md` (§1 READY, §2 NEEDS-RE-SHEET, §3 BLOCKED, §4 DONE, §5 gaps), `SCR/o-r62t-ext-a/r62t-ext-a.md`, `SCR/o-r62t-ext-b/r62t-ext-b.md`, `SCR/o-r62t-survey-a/r62t-survey-a.md`, `SCR/o-r62t-survey-b/r62t-survey-b.md`, `SCR/o-r62t-tq/r62t-tq.md` + its over-engineering cull `SCR/cull-tq.md`, `SCR/o-r62t-dhttp/r62t-dhttp.md` + `SCR/cull-dhttp.md`, `SCR/o-r62t-xd4d-render/r62t-xd4d-render.md`, `SCR/cull-rs-e.md`.
DO NOT DUPLICATE (one line each in your table as OWNED-ELSEWHERE <owner> or PARKED): hygiene-a/b + practice (cloud cull running); launch-44-41 contents (jy-*, tv-y1, tv-y2); ACP-3/4/5 redo; RT-J3; Tier-2 ~210 Tovu-styled class tokens (per screen, later); todos.md section L (parked); the 424 UI functions > 50 lines (tabled for good); fn50 / c6fix size and complexity work; coverage; mutation testing. `codex/ex-err-jini` is HELD (explicit dispatch hold): anything in the files it touched = OWNED-ELSEWHERE ex-err-jini (list them with ONE `git -C <jini> diff --stat $(git -C <jini> merge-base d3e78b387 origin/codex/ex-err-jini) origin/codex/ex-err-jini`).
OWNER DECISIONS 11-20 (apply them): (1) the arch-120 L08/L14/L15 hold is LIFTED — S7a Tovu / S7b SQL (media) and L08/L14/L15 are sheetable now. (2) a57 S2 runs as already sheeted (READY, no extra option). (3) Framework-dictated signatures (Express handlers, React events, comparators, type guards) are EXEMPT from the args rule. (4) share-archive refuses files with secret warnings. (5) the trash EXDEV error-gate line is accepted. (6) ThemePreviewReloadControl goes to the Jini admin package (@jini-ai/admin). (7) Owner 11-20 ~12:50: Tovu is removed from Jini TOTALLY ("we will fix the breaks later"; overrides every cull's KEEP list): rename every Tovu name/id in Jini — published `tovu/<id>` plugin ids → `jini/<id>`, `extensions.tovu` keys → `jini`, `TOVU_*` env names, persisted names (`TOVU_FORMS*`, `.tovu/managed-*.json`, `_tovu_*` Sheets headers, `/_tovu/*` routes), credential labels, `tovu-*.json` filenames. Breaks (existing installs, deployed workers, saved data) are ACCEPTED: every sheet that renames one lists each break it causes on a `BREAKS:` line for the later fix. Code your sheets add to or move into Jini carries no Tovu name. (8) Also 11-20: AG-UI (todos J) START NOW; chat redaction = the SIMPLE redesign only; the env remainder hold is LIFTED (Codex does the code, the approved lockfile cloud run does the package/lock part); GitHub + Lipay adapters → provider plugins YES; M5 browser receiver APPROVED (same-origin receiver behind the existing consent boundary, off by default).

## NO OVER-ENGINEERING (owner rule, HARD — every sheet you write must obey it, and executors read it before every edit)
- Do EXACTLY what the sheet names. If the sheet does not name it, do not add it.
- No new helpers, wrappers, adapters, ports, interfaces, types, generics, options, config flags or abstraction layers unless the sheet lists them by name.
- No "just in case" code: no extra validation, defensive checks, fallbacks, try/catch, null guards, retries or default values the moved code did not already have.
- No speculative generality: no parameters "for later", no unused exports, no optional args nobody passes, no `_optional` pads.
- Moves are VERBATIM: same statements, same order, same names. Do not rewrite, rename, "clean up", reformat or modernize the code you move.
- Tests: only the cases the sheet lists (+ the named mutation). No extra test scaffolding, fixtures or factories beyond what those cases need.
- Comments: move existing why-comments verbatim; add NO new comments except a one-line neutral note where the sheet asks for one.
- Smallest diff that satisfies the sheet. If something seems to need more, STOP that step and report it instead of building it.
- Before finishing, re-read your diff and DELETE anything not required by the sheet. List any deletions in COMMIT-PLAN.md.
Design-side corollary (from the cull judges): move only code shared by two or more callers or code that duplicates existing Jini code; no new "workflow"/result-union layers; no port with one caller; reuse existing Jini deps bags/helpers; single-route coercion and host copy stay in Tovu. Prefer DROP/RETIRE over a sheet that adds a layer.

## OWNER RULES (HARD — copy into every Codex job brief you propose)
Behaviour identical; API args (required, optional = {}) for NEW functions only; no re-export shells; no new deps; no new eslint-disable/@ts-ignore/as any/as never; functions <= 50 lines and complexity <= 10 (HARD). A file going over 500 lines is NOT a stop reason (owner correction 11-20: note it in COMMIT-PLAN.md and continue). STOP a sheet (continue the others) if a named declaration is missing, an unlisted PRODUCTION importer appears (`git grep -n -F '<symbol>' -- apps/ development/ packages/`; unlisted TEST importers needing only the same repoint are fine, record in REFRESH.md), a cast is needed, or the function/complexity limit is exceeded. MACHINE RULE: no other repo-wide scans; NO tests, builds, installs, type-checks, linters; no codebase-memory-mcp; .git read-only; COMMIT-PLAN.md at repo root. Hooks are injected as props. No vendor code in Jini domain packages (vendors live in provider packages); no specific server framework in Jini domain code (`{ app: Server }` style). Anything needing a lockfile change, a new npm dependency or a new Jini package = OPUS-CLOUD.

## YOUR MACHINE RULES (this design job)
Read-only. No tests, builds, installs, type-checks; no codebase-memory-mcp; no file writes. Targeted lookups only (`git grep -n -F '<exact>' -- <one dir>`, `git show`, `ls`, opening named files); NO repo-wide scans; never search outside <local> and SCR. Budget: <= 140 targeted lookups; if you run short, finish the table and write the sheets you have, and mark the rest PARTIAL with what is left.

## SHEET FORMAT (each READY-FOR-CODEX sheet; Codex 6.1 Sol runs it literally: source + test edits only)
- id, repo (ONE repo per sheet: Jini sheet first, then the Tovu sheet against that Jini branch), base (merge-6, or "after <pushed branch>" when it overlaps one), est. executor tokens.
- Exact files + declarations (file:line on the base), what moves verbatim / is deleted / is repointed, destination path + package export entry.
- EVERY importer incl. tests (file:line), each with its exact new import line.
- Tests first: the named test cases (existing ones to port, or the minimum new ones) and the mutation that turns each red.
- Debt rows (injection-debt / API baseline / manifest rows the move must touch), and any "look owed" (Chrome/Electron) after the combine run.
- STOP conditions specific to the sheet.

## OUTPUT (<= 6000 words; your final message is the deliverable)
1. Disposition table of EVERY item in your scope: id | READY-FOR-CODEX / NEEDS-DECISION / OPUS-CLOUD / RETIRE | reason (RETIRE = done on a base or pushed branch, or not worth doing: cite evidence — path/symbol/commit — for "done"). NEEDS-DECISION = phrase the ONE owner question and your recommended answer.
2. The READY sheets (format above).
3. BATCHED Codex jobs: Jini-half batches first, then Tovu-half batches, 6-8 sheets per Codex job, one branch per job, base + order inside each job + which pushed branches each must follow; est. tokens per job.
4. Anything you could not cover (PARTIAL), and why.


THIS ROUND (11-20 round 6, one job). Pushed branches since your bases: see SCR/j-r62t-bugs/r62t-bugs.md "THIS ROUND" (same list) plus Jini codex/rs3-jini, Tovu codex/tv-rs3. Your prior design: SCR/o-r62t-bugs/r62t-bugs.md (read it first; do not redo its research). Bug list: <tovu>/development/open-bugs.md (line IDs as in that design).

## TASK (r62t-bugs2): write READY sheets with the coordinator's decisions applied
COORDINATOR DECISIONS (fixed inputs):
- 1372 embed widget crash: YES, the public mount requires host-supplied ChatSurfaces (keep direct React use working).
- 1383 cold daemon: show the "assistant is starting" state; an actionable error only when the start fails.
- 1391 saved-key import cancel: propagate AbortError to the existing cancellation path (confirm the current wrapper first).
- 1408 mixed-validity batch: per-item outcomes; assert both the successful write and the refused item.
- 1417 oversized design guidance: YES, turn one gets a short load instruction via the existing load tool; byte cap unchanged.
- 1418 literal dispatch marker: NO CHANGE. Owner decided 11-20 to KEEP the <<SUBAGENT_DISPATCH>> marker (it stops in-app agents in Tovu sites from booting AI-Dev-Shop). RETIRE with that reason.
- 155 theme overwrite on redesign: YES, explicit approval through the existing approval path before editing/activating the existing theme.
- 348 newsletter bodyJson: YES, persist + include in revisions; schema change = ADR-066 TS migration (file + journal registration, journal "when" = previous + 1) in the campaign owner; create/update tests.
- 566 plugin sign-in Skip: YES, via the existing dismissal outcome.
- 576 lock eviction: NO stealing from a live owner; update the age-rule test to require proof the owner is gone.
- 579 analytics with consent off: keep the gate closed (fix any path that runs vendor analytics with the gate off).
- 614 site switcher off: preserve the off setting's current scope (fix only if the web admin bypasses it).
Sheet ALL of: the 2 READY-FOR-CODEX items of the prior design, the 11 decided items above (1418 = RETIRE), and these two re-sheets of STOPPED sheets (read SCR/o-tv-rs3/tv-rs3.md + SCR/c-tv-rs3/REFRESH.md):
- B02 (Tovu, second stop -> redesign, do not retry): unlisted production re-export `apps/website/src/features/deployments/index.ts:91`; owner rule no re-export shells: repoint every importer and delete the re-export, listing each importer with its exact edit.
- M5-T (Tovu): routing would raise `browser-analytics-http.ts:21` handler complexity 10 -> 12: verbatim split FIRST, then M5-T exactly as the cull-resheet3 text on Tovu origin/plan/culls-1120:cull-outputs/j-tv-rs3-DRAFT.md defines it.
Every bug sheet: failing test FIRST + its mutation, then the smallest fix; a function over 50 lines gets a verbatim split sheet first. Then batch into Codex jobs (Jini first, 6–8 sheets, file-disjoint, base per job: merge-6 or the pushed branch it needs).
