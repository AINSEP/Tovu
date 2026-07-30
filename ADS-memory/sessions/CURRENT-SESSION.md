# Session Record

- Date: 2026-07-28 (UTC, approximate — session in progress)
- User: Leon Aburime (leonaburime@gmail.com)
- Model(s): Claude Sonnet 5 (Coordinator, all pipeline-agent dispatches this session)
- Purpose of this file: explicit audit trail per owner request — "remember all these questions,
  options, and what we went with as we are gonna audit them later with other llms." Each entry
  below states the question/tension, the options considered, what was chosen, and by whom
  (owner decision vs. Coordinator/agent judgment call), so an external LLM auditor can evaluate
  the call independently without reconstructing context from the raw transcript.

---

## Summary

Wide-ranging session spanning: an OpenAPI-consistency audit (discovered no real OpenAPI exists),
a repo-wide function-signature convention refactor, two new-feature architecture dispatches
(SPEC-003 CLI surface, SPEC-005 plugin system) each carried through Software Architect ADR with
one owner-directed revision, a spec-drift audit across all 16 existing feature specs, a
smaller-gaps implementation sweep, a root-cause bug fix for a disk-leaking snapshot mechanism,
~3.1GB of stale-worktree/junk-file cleanup, and a fact-check + practical clarification of
Claude Code's multi-session coordination features (Agent Teams vs. subagents).

---

## Questions, Options, and Decisions

### 1. Are backend calls consistent with OpenAPI?
- **Finding**: No OpenAPI spec exists in this codebase at all — no file, no codegen tooling, no
  zod/schema validation. The closest artifact is 16 hand-written `api.spec.md` docs (one per
  feature spec folder), reverse-documented from real routes but not machine-readable.
- **Options considered**: (A) audit against the existing `api.spec.md` docs as the de facto
  contract, (B) build a real OpenAPI spec now (new tooling, bigger lift).
- **Decision (owner)**: Start with (A) — a concrete drift report. Treat (B) as a separate,
  deferred infrastructure decision.
- **Outcome**: Full audit run across all 16 specs. Headline finding: the admin API client
  (`apps/admin/src/lib/api.ts`) matches real server behavior in **every** case checked — zero
  client/server mismatches. All drift was between the docs and the code, not frontend/backend.
  Sharpest finding: `013-members`, `014-analytics`, `021-media-assets` specs all explicitly claim
  "no authorize() check exists" for routes that now DO have permission checks (added later via
  undocumented "ADR-PIPE" sweeps) — misleading docs about security posture, not an actual
  vulnerability. Also found two features fully speced/approved but never built:
  `003-site-install-dir` (CLI surface) and `005-plugin-system` (loader/SDK).

### 2. Function signature convention: `func(required, options)`
- **Ask**: Separate function args into `func(requiredArgsObj, optionsObj)` — first object
  required, second optional/flexible for future growth. (This was already documented house style
  in `agents/programmer/skills.md`, just inconsistently applied.)
- **Scope decision (owner)**: Repo-wide (offered narrower options: admin-client-only, or
  client+server; owner chose the largest).
- **Mid-refactor finding**: a second, pre-existing convention discovered — `fn(deps, input)` as
  two separate required positional params (not one combined object), used extensively in `seo/`,
  `comments/settings.ts`, `features/settings|theme|post|plugins`, `media/`, `analytics/`, and a
  few core/infra files.
- **Decision (owner)**: Leave the `(deps, input)` family alone as an accepted second style — both
  params are already mandatory, so it doesn't have the optional-args-flexibility problem the
  original ask was about. Don't force it into the single-object shape.
- **Outcome**: 4 batches (admin API client, newsletter, widgets, navigation/menus) + 1 follow-up
  batch (5 DTO-mapper files + admin frontend components/sections) = 66 → ~72 functions converted
  across 66 files, 1902/1902 tests passing throughout, zero behavior changes (Architecture Audit
  PASS both passes). Remaining out-of-scope-for-this-session candidates documented in a progress
  ledger for a future pass if wanted (analytics, plugins, theme, media, infra files not in the
  accepted `(deps,input)` family).

### 3. SPEC-003 (CLI surface: `tovu init`/`tovu serve`/`tovu --help`) — build it
- **Finding**: Spec fully written, approved, Red-Team cleared (0 blocking) back on 2026-07-07, but
  had never gone through Software Architect. One CONSTITUTION_FLAG (RT-006, Article I) left open:
  whether/when to adopt a real CLI-parsing library given the surface is about to grow (SPEC-005
  adds 3+ more subcommands).
- **First ADR (v1.0.0)**: Software Architect resolved RT-006 with a deferred two-tier trigger —
  stay hand-rolled for v1's 2 commands, escalate to `node:util.parseArgs` at the 3rd command,
  escalate to `commander` at ≥4 commands or nested subcommands.
- **Owner override**: reviewed and explicitly disagreed with deferring. Reasoning: SPEC-005's
  subcommand growth is already committed roadmap (not speculative), and a separate desktop app,
  Tovu-Runner, will programmatically fork/manage many Tovu instances — meaning this CLI will
  increasingly be driven by another process, not typed by a human, and a real command framework's
  structured parsing/testability matters more in that mode. **Decision: adopt `commander` now, in
  v1, for both commands — don't wait for a growth trigger.**
- **Revised ADR (v1.1.0)**: Sent back to Software Architect. Notable result: re-checking against
  the actual constitution text flipped Article I's status from EXCEPTION to **COMPLIES** (adopting
  commander removes the custom parser entirely — a genuinely more-compliant state, not merely an
  overridden exception). Verified `commander@15.0.0` has zero runtime dependencies (vs. yargs's
  six transitive deps), confirming the original candidate ranking still held independent of
  timing. Dependency to add: `"commander": "^15.0.0"`.
- **Status**: ADR v1.1.0 complete; **awaiting owner architecture sign-off** before TDD/Programmer
  can start (per this project's standing human-checkpoint rule — not yet given as of this record).

### 4. SPEC-005 (plugin system) — build now or defer?
- **Finding**: A prior session (SPEC-045 scoping memo, 2026-07-21) had already investigated this
  exact fork and the owner had chosen to defer (Option B: placeholder nav entry, `soon: true`)
  because real plugin-loader work is "a materially larger project than [a] CRUD sweep."
- **Options re-presented**: (A) build SPEC-005 for real now (loader/SDK/hook/word-count-plugin/
  admin-UI — approved spec, but multi-session scope), (B) keep the placeholder (status quo), (C) a
  narrower relabeled "Data Modules" stub (memo's own read: not recommended, likely confusing).
- **Decision (owner)**: Reconsidered and chose **Option A** — build it for real.
- **Outcome so far**: Two parallel dispatches. (i) Spec Agent wrote `ui.spec.md` resolving
  SPEC-005's own deferred OQ-02 (plugins list+toggle admin screen) — this bumped the *whole*
  SPEC-005 package from v1.0.0/APPROVED to v1.1.0/DRAFT (same amendment pattern as the earlier
  SPEC-006 amendment), so **the new UI material needs its own fresh owner approval** before
  Red-Team/Architect can treat it as approved. (ii) Software Architect produced the full backend
  ADR (Microkernel/Plugin-Host + hexagonal ports inside the existing modular monolith) — caught
  that ADR-024 (ratified one day after SPEC-005's original approval) imposes a binding ABI freeze
  never folded back into the spec, and surfaced a small real spec gap (`plugin.tier` manifest
  field has no home in REQ-01) needing a follow-up Spec Agent fix. 5 Critical Internal Constraints
  designated, 3 security-escalated. Both artifacts (**backend ADR + UI amendment**) are awaiting
  owner sign-off. Honest scope estimate given unprompted: at least 3 more TDD→Programmer sessions.

### 5. Smaller API-spec gaps (002 pages, 004 themes, 006 API keys, 007 settings)
- **Ask**: Build the smaller documented-but-unbuilt endpoints found by the drift audit.
- **Outcome**: 3 of 4 shipped (page get/update, themes list, settings raw+list-definitions) —
  1902/1902 tests passing, Architecture Audit PASS. **006 (API key issue/revoke) was escalated,
  not implemented** — the agent found the real blocker isn't the spec's DRAFT-status paperwork
  (which was a red herring I'd flagged), it's that the supporting plumbing doesn't exist at all:
  no `ApiKeyRecord` type, no repo port, no `api_keys` table, no route to even mint the
  `api_key`-kind principal `ISSUE_API_KEY` needs. Correctly stopped rather than inventing a schema
  on the spot. **Decision needed (owner, not yet made)**: route to Software Architect for the
  API-key plumbing design.
- Also flagged, not fixed (correctly out of the dispatched scope): a create-time shape mismatch
  where both `posts/create.ts` and `pages/create.ts` ignore caller-supplied `slug`/`bodyJson`/
  `status` — bigger than the 2 endpoints this dispatch covered.

### 6. Why so many "snapshot" files in `Tovu/`, and the fix
- **Finding (root cause)**: `src/features/plugins/snapshot.ts`'s `snapshotDb()` naively does
  `path.dirname`/`path.basename` on whatever `dbPath` it's given. When called with SQLite's
  special in-memory identifier `":memory:"` (used throughout the test suite via the newsletter/
  comments modules' calls into the ADR-023 dataModule engine), this produces literal files named
  `:memory:.snapshot-<label>-<timestamp>` in the repo root. 297 of these (213MB) had accumulated
  from this session's test runs alone. A prior session had already noticed the symptom and
  gitignored the pattern — masking it rather than fixing the cause.
- **Decision (owner)**: fix it properly ("best, most flexible, scalable long term"), not just
  delete the files.
- **Fix approach (Coordinator judgment, grounded in the code's own doctrine)**: the whole
  snapshot+journal apparatus exists for crash recovery at next boot (ADR-023) — which is
  semantically meaningless for an in-memory database (nothing persists across a "next boot" for
  `:memory:` regardless). So `snapshotDb()` should detect in-memory paths and return `null`
  (already a legitimate value in this codebase's own `DeclareResult.snapshotPath: string | null`
  idiom) rather than attempt a file backup, and `declareDataModule()` should skip the journal
  bookkeeping (which requires a non-null path) for that case, relying on the same-process
  transaction rollback that already handles the only failure mode an in-memory db can have.
  Dispatched to a Programmer subagent for implementation (in progress as of this record).
- **Separately**: found and cleaned up ~2.9GB across 8 stale `.claude/worktrees/` directories,
  orphaned after the project folder moved (`~/Desktop/Programming/Tovu` → `~/Programming/Tovu`).
  All 8 branches confirmed merged into main via `git merge-base --is-ancestor` before deletion.
  **Decision (owner)**: delete all 8 (offered "show list first" / "leave for now" as alternatives).

### 7. Multi-Claude-session coordination ("talk to the other agent in Jini")
- **Initial ask**: user pasted an AI-generated (unverified, low-trust-sourced) answer about
  coordinating multiple Claude Code terminal sessions via a "Channels" feature and third-party
  MCP bridges (`claude-ipc-mcp`, `cc2cc`, `Proxima`, etc.), asked to fact-check and whether to
  delegate the fact-check to a subagent or do it directly.
- **Decision (owner)**: delegate to a subagent (the dedicated `claude-code-guide` agent) — general
  preference stated: web-search-heavy fact-checking should go to a subagent to keep it out of the
  main conversation.
- **Finding**: the pasted answer was mostly hallucination wearing real package names. "Channels"
  does the opposite of what was claimed (external→Claude, not Claude↔Claude). The real official
  feature is **Agent Teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), independently re-verified
  by fetching Anthropic's actual docs directly (not just trusting the subagent's secondhand
  summary) — confirmed accurate.
- **Scope narrowing (owner)**: focus on Claude-Code-only coordination for now; a cross-vendor
  bridge (Claude/Gemini/Codex) isn't needed since Codex has its own exec mode reachable
  separately.
- **Setup done**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` added to `~/.claude/settings.json`
  (user-level, since the stated intent was cross-repo experimentation). Requires restarting the
  Claude Code session to take effect (checked at session start).
- **Key limitation surfaced** (this was the crux of the actual question): Agent Teams is
  "one team per session" — a session can only message teammates *it itself spawns*; there is no
  mechanism to reach an already-running, independently-launched Claude Code session in another
  terminal (e.g. one already open in the Jini folder). This ruled out what the owner actually
  wanted (bridging to an existing separate session).
- **Follow-up clarification**: owner asked whether "restart me, spawn a teammate in Jini" is
  meaningfully different from just using a regular subagent (Agent tool). Answer given: yes, but
  narrower than it sounds — subagents are one-shot (single final report, no direct user access);
  teammates are persistent, message back-and-forth automatically, and the *user* can view/message
  them directly via the terminal's agent panel without going through the Coordinator. Given the
  owner's own phrasing ("so *you* can talk to the other agent," not "so *I* can talk to it"), a
  plain subagent was judged sufficient.
- **Status**: owner had not yet confirmed "yes, spawn the Jini subagent now" as of this record —
  last exchange ended on that open offer before the conversation moved to the snapshot-file
  question.

---

## Decisions & Learnings (cross-cutting, for future sessions)

- This repo has **no OpenAPI/schema-validation tooling at all** (no zod, no codegen) — if that
  ever gets built, it's new infrastructure, not a quick fix.
- **`api.spec.md` docs drift silently from code**, especially after security/authz sweeps —
  three specs (013/014/021) now describe a *less* secure system than actually exists because a
  later permission-check addition was never folded back into the docs. Worth a process fix
  (e.g., a checklist item on authz-sweep PRs to touch the relevant `api.spec.md`), not just a
  one-time correction.
- The `(deps, input)` two-positional-required-param shape is now an **explicitly owner-approved**
  second house style, coexisting with `(required: {...}, options: {...} = {})` — future sessions
  should not flag the former as a violation of the latter.
- Spec amendments (adding new REQs to an already-APPROVED spec) **revert the whole spec's status
  to DRAFT** in this project's convention (seen twice now: SPEC-006, SPEC-005) — this is
  structural, not a bug, but the validator's hard requirement of `status: APPROVED` means these
  amendments will always show as validator failures until the fresh checkpoint clears; that's
  expected, not a sign of a broken amendment.
- Watch for **parallel-dispatch version races**: running a spec-amendment dispatch (Spec Agent)
  concurrently with an architecture dispatch (Software Architect) against the *same* spec package
  worked out this time (the backend ADR's grounding in REQ-01–11 was confirmed unaffected by the
  new REQ-12+ UI amendment), but the version/status metadata between the two artifacts needs
  manual reconciliation before final sign-off — safer to sequence these if the amendment might
  touch anything the architecture work depends on.
- `.claude/worktrees/` can silently balloon to gigabytes if a project folder is ever moved/renamed
  (breaks git's path tracking, leaves orphaned copies) — worth an occasional `git worktree list`
  + `du -sh .claude/worktrees/*` check.

---

## 2026-07-28 (continued) — Owner directive: sign off + finish everything pending

Owner reviewed the "what's left" status and gave three directives in one message: (1) sign off
on SPEC-003 and SPEC-005, (2) finish every item that was in the "waiting on a decision from you"
list, (3) keep this audit trail current. Recorded here for the later multi-LLM audit:

### Sign-offs granted
- **SPEC-003 ADR v1.1.0** (CLI surface, `commander` adoption) — **APPROVED**. Recorded in
  `reports/pipeline/003-site-install-dir/pipeline-state.md`. Cleared tasks.md generation + TDD
  dispatch.
- **SPEC-005 backend ADR** (Microkernel/Hexagonal plugin loader) — **APPROVED**. One blocker
  remained before TDD could actually certify against it: the `plugin.tier` gap in REQ-01 (ADR-024
  vocabulary with no home in the spec) — routed to a Spec Agent fix rather than skipped.
- **SPEC-005 UI amendment (v1.1.0, REQ-12–17)** — owner approved building the full plugin system
  including this UI screen (reaffirming the earlier Option-A decision). Formal DRAFT→APPROVED
  status flip + validator re-run delegated to the same Spec Agent dispatch fixing plugin.tier.
  **Red-Team must still review the new REQ-12–17 + REQ-01 change before TDD certifies them** —
  this is standard pipeline order, not skipped even under the "finish everything" directive.

### "Finish it" — five items actioned
1. **API-key issuance (006)** — dispatched Software Architect to design the missing `api_keys`
   schema/repo port, a key-hashing primitive (distinct from argon2id — keys are checked on every
   request), and resolve the `CREATE_PRINCIPAL` route/shape ambiguity. Instructed not to
   re-litigate the already-worked-out security design (grantless-principal + frozen-policy-
   snapshot invariants, F-052…F-054 in SPEC-006's own revision history) — only to build the
   missing plumbing for it.
2. **Posts/pages create-time shape gap** — dispatched Programmer to make `createPost()` actually
   honor caller-supplied `slug`/`bodyJson`/`status` instead of silently discarding them, with a
   RED-then-GREEN test-first requirement since this is a real behavior change, not a refactor.
3. **Remaining signature-refactor scope** — dispatched Programmer (pass 3) to finish the
   NOT-STARTED files (analytics/, plugins/, theme/, media/, infra files, `token.ts`), explicitly
   told to avoid the concurrent create-shape-gap dispatch's file (`post.ts`) to prevent a
   collision, touching only the unrelated `classifyStatusTransition` export there.
4. **Judgment calls (`describeApiError`, MenuEditor/WidgetRegionEditor tree-ops)** — same
   dispatch instructed to give a final, justified verdict rather than re-flagging them as open
   again.
5. **Code Review** — dispatched for the 3 already-shipped smaller-gap endpoints (page get/update,
   themes list, settings raw+list-definitions), instructed to re-run tests fresh rather than trust
   the implementing agent's self-report.

### Discovered mid-session: duplicate governance-ADR registries
The API-key-plumbing Software Architect dispatch found the (then-separate) `ADS-project-knowledge/governance/adrs/ADR-INDEX.md` empty and reasonably created `GOV-ADR-001` there for the new credential-hashing rule. But `ADS-memory/governance/adrs/` was the actually-active governance registry (already had real, ACCEPTED, MANDATORY-enforcement GOV-ADR-001/002/003) — a genuine ID collision, not caught by the dispatch itself since it had no visibility into the other root. Caught and fixed directly (Coordinator, not delegated, since it was a small mechanical rename): moved the file, renumbered to GOV-ADR-004, updated both indices, added a note in the stale root pointing future agents to the real one. **Worth an auditor's opinion**: should this project formally consolidate the two `governance/adrs/` roots (and the similarly-named-but-distinct `reports/architecture/ADR-*.md` numbered-decision registry, which is unrelated and fine) rather than leaving a pointer note as the fix? **Resolved 2026-07-29**: yes — the two `ADS-project-knowledge`/`ADS-memory` roots were fully consolidated into `ADS-memory` (see the entry below), closing this out properly instead of leaving the pointer note as a permanent workaround.

### Session close-out: handoff produced for context reset
Owner asked to stop all dispatch and restart with a clean context. Sent live status-check messages to the two agents still running at that point (SPEC-005 Phase 1 Programmer, SPEC-005 tier-badge TDD addendum) rather than guessing their state; both paused cleanly with no work lost. Full handoff written to `ADS-memory/.local-artifacts/handoff/2026-07-28-multi-track-session-handoff.md` — covers current state, what's done vs. paused, and ordered next steps. This CURRENT-SESSION.md file remains the "why" record; the handoff doc is the "what state things are in right now" record — read both when resuming.

### Process note for the audit
Generating `tasks.md` is normally a Coordinator-owned artifact per this project's own pipeline
docs (produced after ADR sign-off, before TDD dispatch) — with 7 parallel dispatches in flight
this turn, that step was folded into the TDD dispatch itself as Coordinator-delegated work rather
than done by hand first. Worth an auditor's opinion: is that an acceptable delegation, or should
tasks.md always be hand-authored by the Coordinator directly before TDD is dispatched?

---

## 2026-07-28 (continued) — Fresh session, resumed from handoff: SPEC-003 recertification + coverage-gate decision

New session, context reset per the handoff above. Picked SPEC-003 Code Review + TestRunner as the
first Next Step (owner's explicit pick from the handoff's ordered list). Dispatched TestRunner,
which found real gaps beyond just "needs review": a broken test fixture (EC-05 lock-priming never
actually acquired the lock — proved the real implementation correct via a corrected re-test), an
indefinitely-hanging test (`serve-command`'s port-boundary check spawned a real long-running server
synchronously with no timeout), and branch-coverage gates reading below their bars. Also separately
verified: SPEC-005 Phase 1 Track F (admin plugin UI) complete, SPEC-006's `CREATE_PRINCIPAL`
route-shape gap resolved (new dedicated endpoint, not a fold-in), and two housekeeping fixes
(body-size-cap middleware wired onto PUT routes, plus a version-stamp check that turned out to need
no fix).

### Coverage-gate measurement-validity decision
- **Finding**: TDD's recertification pass mechanically classified every uncovered branch arm in the
  4 unit-suite files + full integration suite. Verdict: **100% of real, reachable source branches are
  covered in the unit suite (41/41); 90.64% (155/171) in the integration suite** — the latter actually
  clears the stated 90% gate on real code. The measured shortfall (83.72% unit / 81.68% integration,
  both below their 98%/90% bars) is entirely esbuild/tsx's auto-generated CommonJS interop scaffolding
  (`__copyProps`/`__toESM`/`__toCommonJS`/`__export`/`__name` helpers injected into every transpiled
  module that imports anything) — code the coverage instrument counts but no test can reach, because
  it isn't Tovu source.
- **Options presented**: (A) accept the real-arms evidence as satisfying the gate, log a tooling
  follow-up; (B) switch to a source-map-accurate coverage tool (c8/istanbul) and re-measure now; (C) a
  human-approved profile-override waiver (TDD's least-preferred option, explicitly not applied
  unilaterally).
- **Owner asked first**: could the unreachable code just be refactored out? **Answer (Coordinator,
  verified against TDD's own classification): no** — it isn't application code sitting in any source
  file; it's compiler-injected boilerplate that exists only in the transpiled output. There is nothing
  in `src/site-dir/**`/`src/cli/**` to restructure that would remove it.
- **Decision (owner)**: **Option A** — accept the real-arms evidence, don't block Code Review on new
  tooling work. Logged the c8/istanbul swap as a real, non-blocking follow-up in `todos.md` so the
  same argument doesn't need re-litigating per future feature.
- Both real test-quality blockers (EC-05, serve-command hang) were independently re-verified by the
  Coordinator directly re-running the tests, not just trusting the TDD subagent's report — both
  confirmed genuinely fixed. Unit and integration coverage percentages were also independently
  recomputed from a fresh test run + a direct lcov-file parse, and matched TDD's reported numbers
  almost exactly (one branch off due to run-to-run instrumentation noise, immaterial).

### Owner also flagged (2026-07-28): neither this session nor the previous one has been reviewed
Explicit ask: track that `/code-review` (internal pipeline gate) and `/audit-work` (external
multi-LLM audit) both still owe a pass — this session's SPEC-003/005/006 work, and the prior long
session's uncommitted work (repo-wide signature refactor, snapshot-leak fix, posts/pages create-time
validation fix, the 002/004/007 drift-fix sweep). Recorded in `todos.md` as a pinned "OWED" item
rather than only in this session's own task list, since it explicitly spans both sessions.

---

## 2026-07-29 — Fresh session, resumed from handoff: B1 fix, CR-R03/CR-R04, CLI introspection

New session, context reset per the prior handoff (`.local-artifacts/handoff/20260729T004926Z-handoff.md`).
Owner's explicit priority: fix B1 (boot-bricking regression) first, before the rest of the backlog.

### B1 fix direction — a real fork, not just a bug fix
- **Investigation finding**: the handoff's suggested fix (relax `resolveWorkspace` to tolerate >1
  workspace rows) directly conflicted with an existing CERTIFIED TDD test and an explicit spec
  invariant (state.spec.md §5: "exactly one workspace row... multi-workspace sites are not
  supported in v1"). Two real options existed: (A) amend the invariant/test to tolerate >1 rows,
  or (B) block a 2nd workspace from ever being created (enforcing the existing invariant at the
  write boundary instead).
- **Decision (owner)**: neither, exactly — owner rejected the framing itself: "why would i want
  only one workspace ever? there should be a bunch if im working on multiple sites... this is the
  cli problem right? can't we attach some arg to the cli to whichever one we are doing? it should
  default to the oldest one." This reframed the bug: workspaces are a real, intentional
  multi-tenancy primitive (already the stated intent of ADR-007), not an error condition — the
  spec's "exactly one row" invariant was itself the defect, not `resolveWorkspace`'s enforcement of
  it. **Option A, plus a new explicit selector** was correct once framed this way, not a compromise.
- **Outcome**: `resolveWorkspace` now defaults to the oldest workspace (by `createdAt`) when >1
  rows exist, logs a warning, and accepts an explicit `workspaceId`; `tovu serve --workspace <id>`
  exposes this. state.spec.md/api.spec.md/feature.spec.md amended (REQ-06 amended, REQ-06b added),
  version bumped 1.0.0 → 1.1.0 → 1.2.0, status DRAFT pending owner sign-off (standing project
  convention for spec amendments). 22 new/updated tests, full suite 2126/2136 (10 pre-existing,
  already-disclosed plugin-loading failures, unrelated). Typecheck clean.

### Systemic testing gap, found and fixed
- **Owner asked directly**: "is there some fundamental hole or problem in the code and tests for
  cli?" — Answer: yes, two. (1) B1 itself (two independently-tested specs conflicting at their
  seam). (2) All 71+ existing CLI tests ran the TypeScript source via `tsx`, from inside the repo
  checkout — never the actual built `dist/` binary, never from another working directory. This is
  exactly why Code Review (prior session) found the built binary didn't start at all and `tovu
  serve` 500'd from outside the repo — bugs no source-level test can catch.
- **Root causes found and fixed**: (a) `package.json`'s `build` script never copied
  `src/infra/drizzle/`, `src/infra/drizzle-database-journal/`, or `themes/` into `dist/` — `tsc`
  only compiles `.ts`, so the built binary was missing its own migration files and built-in themes.
  (b) `builtInThemesDir()`/`mediaUploadsDir()` (`server/deps.ts`) resolved off `process.cwd()`,
  which is only correct by accident when every test happens to spawn from the repo root.
- **Fix**: build script now copies all three; `builtInThemesDir()` resolves package-relative
  (`__dirname`, mirroring the existing Drizzle-migrations/templates pattern) instead of cwd-relative;
  uploads gets an explicit `uploadsDir` override threaded from `tovu serve <dir>` (install-dir-
  relative), with the legacy `npm start` path unchanged. Verified by actually building and running
  the real `dist/` binary from `/tmp` (not just unit tests) — both confirmed broken before the fix,
  fixed after. Added a CLI-integration regression test that spawns from a foreign `cwd` — the exact
  scenario the whole suite previously never exercised.
- **Theme-directory-precedence** (should built-in themes merge with site-local ones, or stay
  exclusive?) and **plugin permission-string fixes** (B2/B3) were explicitly deferred at owner's
  request ("skip the theme and plugin stuff for now") — confirmed tracked in the task list (not
  lost), not decided unilaterally.

### CLI machine-readability — "OpenAPI for CLI"
- **Owner asked**: whether SPEC-003's CLI has any OpenAPI-spec-like artifact an agent could use to
  know how to invoke it (motivated by Tovu-Runner driving this CLI programmatically). Finding: no —
  only `api.spec.md`, a hand-maintained markdown doc, current but with zero enforced link back to
  `program.ts`'s actual `commander` definition (it had already drifted once — `--workspace`
  existed in code before the doc caught up).
- **Options discussed**: oclif-style build-time-generated manifest vs. a runtime introspection
  command with zero drift risk by construction (always reads the live `Command` tree, no separate
  generation step to forget). Also discussed MCP tool-definition schemas as the more directly
  relevant modern paradigm for agent-driven CLI use, vs. building a full running MCP server
  (out of scope — schema export only, not a server).
- **Decision (owner)**: build the commander-introspection command, and also do the MCP tool-schema
  export ("seems like we should").
- **Outcome**: `tovu introspect [--format commander|mcp]` (`src/cli/introspect.ts` +
  `commands/introspect.ts`), reading the live `Command` tree — `commander` format is the raw
  shape, `mcp` reshapes to `{name: "tovu_<cmd>", description, inputSchema}[]`. New REQ-11 in
  feature.spec.md, version bumped to 1.2.0. 6 new tests (unit + CLI-spawn integration), verified
  against both the `tsx` dev path and the real built `dist/` binary. Bad `--format` is `VALIDATION`
  (exit 2), not a silent fallback.

### `ADS-project-knowledge` → `ADS-memory` consolidation — done
Executed after the CLI work above. The old `ADS-project-knowledge/` root no longer exists on disk.
All 1266 unique files moved (`git mv` for tracked ones, plain `mv` + re-add for the ~856 that were
already untracked); 24 exact-path overlaps plus a `memory/`→`knowledge/` semantic-duplicate pair (5
more files, same content under a renamed directory) resolved by content, not by which root they
happened to live in: `governance/constitution.md` (real ratified vs. blank template) and
`knowledge/learnings.md` (strict superset, one extra codex-dispatch entry) both needed the old
`ADS-project-knowledge` side to win; everything else kept the `ADS-memory` side (including
`governance/adrs/ADR-INDEX.md`, the real governance registry). Final count verified exactly
(196 + 1261 = 1457, zero loss). Then fixed ~190 internal cross-references (specs, ADRs, reports,
`todos.md`, `tovu-v2-design.md`, `START-HERE.md`, `.gitignore`, 3 `src/*.ts` doc-comments) that
literally said the old root name — left untouched only two raw external-LLM transcript `.jsonl`
files and some `.claude/commands/*.ads-bak.*` backups (out of scope, not this project's own state).
Nothing committed — still sitting in the working tree per the "never commit unless asked" rule.

### Still open (parked, tracked in the task list, not lost)
B2/B3 plugin-permission fixes; CR-R01/CR-R02 routing decisions (Software Architect, Spec Agent);
Task #13's original three findings (now folded into the CR-R03/CR-R04 fix above — confirmed done,
not just claimed); the second Code Review/Security/TestRunner pass on SPEC-003; a broader repo-wide
bug hunt (owner deferred this to a later session, undecided between a plain Code Review+Security
pass on all uncommitted work vs. a full multi-agent workflow audit).
