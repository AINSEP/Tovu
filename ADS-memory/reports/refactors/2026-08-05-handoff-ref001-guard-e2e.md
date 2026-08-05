# Handoff: REF-001 complete, guard 71→7, three E2E specs made trustworthy

Generated: 2026-08-05T19:25:00Z
Source: Coordinator (Review Mode), Claude Code / Opus 5 (1M context), with 3 dispatched Sonnet 5 subagents
Repos: `/Users/la/Programming/Jini` and `/Users/la/Programming/Tovu`, both on `refactor/jini-admin-extraction`
Supersedes: `20260805-180000-handoff.md` — **all 5 of its "Next Steps" are now done or answered**

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this file. **Do NOT re-derive REF-001 — Steps A–D are landed
> and committed.** Do not re-investigate the `a7c0f8b5` coverage question; it is answered in
> `Jini/ADS-memory/reports/findings/2026-08-05-confirmation-transport-gap.md`. Start at
> `## Do This First`. The house rules that mattered all day: `git commit -F <msgfile> -- <explicit
> paths>` (never `-A`), and **verify every claim against source — SIX premises were measured false
> this session, two from the previous handoff.**

## Do This First

**1. There are at least TWO other active sessions in these repos.** Not one, as the previous handoff
implied. They committed ~10 times today across both repos (BYOK specs, evals/tool-search scaling,
`search_tools` keywords, degraded-boot fixes, a `pages-editor` spec). **Consequences that already
bit us — do not relearn these:**
- **Never `pkill chromium`** to clean orphans; another session's live Playwright run uses the same
  binaries. Attribute by `--user-data-dir` or spawned PID, or leave it.
- **Never `npm ci` / `npm install` in the live tree** while others have e2e running — it prunes
  `node_modules` others depend on. Use a scratch clone.
- **Commit promptly; never hold large uncommitted sets.** One session's commit can sweep another's
  work. Check `git diff --cached` too — a staged revert is invisible to plain `git diff`.

**2. `packages/vibecoding/**`, `pnpm-lock.yaml`, and the untracked `packages/vibecoding/src/html/node/`
in Jini belong to another session.** Untouched all session; keep it that way.

**3. ~~One task is mid-flight~~ — CLOSED after this handoff's first draft.** The R10 transitive-reach
question is answered and shipped; do not re-open it. Refactor traced every one- and two-hop import by
hand and found **the entire live transitive gap was exactly one symbol**, `interleaveMessageBlocks` —
every other second-hop name was already reachable through some barrel. It is now **exported**
(`a266a4d9`), on the same argument §9.2 settled for `definedProps`/`useLatestOperation`. **Option A
(accept the documented scope limit) is approved** — revisit only if a *second, independently-found*
instance appears. Option B (real module-graph walk) was rejected as real cost for a gap tracing to
zero remaining instances; Option C (relocate the reachable set) was rejected because it would reverse
§2.3(b)'s locked composability guarantee. Reasoning is self-contained in §10/§10.5 of
`Jini/ADS-memory/reports/refactor/2026-08-05-ref-001-steps-bcd-proposal.md`.

## Current State — 17 commits, every one verified by the Coordinator against source

**Jini (12):** `2fc2d1d1` Step D exports · `51e798ef` R10 enforcing · `2d852abe` REF-001 §9 ·
`2185f0a1` **Step C** · `7460c750` 21 import fixes · `8557462c` **R11 rule** · `2da8d0c0` two R2
exceptions · `017a0e35` + `925f0c03` two R5 fixes · `d5ad2a5b`+`eafadf4a`+`1e07b8bc` findings doc + 2 corrections · `1e29f8c7` §10 proposal · `a266a4d9` interleaveMessageBlocks export

**Tovu (5):** `2c1519b` lockfile cruft · `986387e` destructive-path test correction · `4be2e87` SSE
envelope fix · `95f4750` readiness-probe dedupe · `95a6886` 6 safe `chat.*` verbs wired

**`pnpm guard`: 71 (session start) → 12 → 7.** All **7** remaining are one deliberately-deferred
category: `R2-deep-path` `@jini-ai/chat/core` imports inside `features/chat-pane/**` (BYOK's
territory, excluded from Phase 1's sweep on purpose). **Zero R5, zero R10, zero R11.**
Two new rules added, both **proven to actually fail** (core condition disabled → `SELF-TEST FAILED`
with exactly the expected breaks) before being trusted, both shipped contributing zero.

## The Session's Most Important Finding

**`development/e2e/destructive-path.spec.ts` never guarded `a7c0f8b5`.** Reverting the fix and
rebuilding `dist` (verified: `cancelledConfirmations` 4→0) left the test **passing**. Root cause:
`a7c0f8b5` guards `ToolExecutor`'s `requiresConfirmation` gate; `content_post_delete` never sets that
flag and cancels via its own `ctx.signal`→`SurfaceExchange` path, which exists identically pre- and
post-fix. The test is retitled (`986387e`) to describe what it actually guards.

**Why it can't be tested today:** there is **no human-confirmation transport in either repo**.
`createToolExecutor` defaults `delegate = {}`; nothing calls `resumeConfirmation`; and `startTimeout`
arms only *after* the confirmation await — so a confirming tool **hangs unbounded**, it does not time
out. Full write-up with citations: `Jini/ADS-memory/reports/findings/2026-08-05-confirmation-transport-gap.md`.

**Honest payoff if someone builds the transport:** `collections_execute_cleanup` + `chat.reset_conversation`
+ an `a7c0f8b5` E2E. **NOT** `database_execute_migrate_forward` / `backup_execute_restore` — those are
Tovu tools, **double-blocked** by a missing `DERIVED_RISK_BY_TOOL_ID` classification that refuses them
earlier (`Tovu/src/assistant/__tests__/tool-registrations.database-recovery.test.ts:228`).
**Note:** Tovu commit `95a6886`'s message carries the superseded "3 CMS tools" figure.

## Decisions Made This Session

- **User approved wiring `CHAT_CAPABILITIES`; shipped filtered.** `95a6886` wires the **6 safe**
  `chat.*` verbs. `chat.reset_conversation` excluded by **`requiresConfirmation !== true`, filtered on
  the PROPERTY not the id** — self-maintaining, so any future confirming verb is excluded
  automatically. 4 tests pin it, one driving the real `createFrontendControl`. **This is a deferral,
  not a judgement that confirmation is unnecessary.**
- **REF-001 keep-and-guard confirmed by outcome.** Step C moved `ChatPane` to
  `@jini-ai/chat/react/chat-pane` with the old path as a deprecated alias; verified against a **real
  extracted tarball** (not workspace symlinks) with `ChatPane` reference-identical across both paths.
- **R10's `barrelPath` stays at `index.ts`** — it is already the union of both subpaths. Repointing it
  at `chat-pane.ts` produces **27** false violations. Documented in-file.
- **No amend of `95a6886`** despite its superseded figure — never rewrite pushed commits on a branch
  other sessions build on.

## Open Items

| Item | State |
|---|---|
| ~~**R10 transitive-reach + `interleaveMessageBlocks`**~~ | **CLOSED** — symbol exported (`a266a4d9`), Option A approved. See `## Do This First` item 3 |
| **Tab-close does not cancel a run** | Verified real behavior, defensible either way. **User's product decision**, not an investigation |
| **Confirmation transport** | Costed 3 ways in the findings doc. User chose the filtered-registration deferral; (a) engine-level and (b) Tovu `SurfaceExchange`→`ExecutionDelegate` bridge remain open |
| **DOM-query Stage 1** | Blocked — its design names `packages/vibecoding/src/html/regions.ts`, another session's live tree |
| **Wire `@jini-ai/protocol` into Tovu** | **HELD, not forgotten.** `surface-live-agent.spec.ts` hand-mirrors the wire envelope because `protocol` isn't resolvable from Tovu. Needs `package.json` + lockfile + install — **do it only when the tree is quiet** |
| **7 remaining guard violations** | Deliberate. BYOK's territory |

## Traps Worth Carrying Forward

- **`daemon-ready.ts` defaults to port 4990.** Importing `waitForAgentDaemon()` from a config that
  doesn't publish `E2E_AGENT_DAEMON_PORT` silently probes **another suite's daemon**. The correct
  pattern is the config publishing the env vars as top-level statements (see
  `playwright.live-agent.config.ts:40-41`).
- **A source-only revert has NO runtime effect.** Tovu resolves `@jini-ai/*` into Jini's built
  `dist/`. Rebuild after every toggle, both directions, and grep `dist/` to confirm.
- **Symptoms are reachable by many routes — this cost us four times today.** Name every path that
  could satisfy an assertion before trusting it: a zero-match `--grep` looks like a legitimate red;
  `GET /api/runs/:runId` reports terminal state whether or not the fix is present; a green run that
  died before reaching the parsing path proves nothing.
- **`moduleResolution: "Bundler"` is repo-wide** (`tsconfig.base.json`), so `tsc` cannot catch
  extensionless imports. R11 now does.
- **SendMessage dropped ≥3 messages** to one agent. What worked: writing every decision to a shared
  file agents read on change-notification, numbered messages with required paraphrases, and checking
  the tree instead of waiting. **Caution:** "dirty file" and "abandoned work" look identical — the
  Coordinator nearly clobbered an agent's in-flight edit and was saved only by a stale-read check.

## Handoff Contract

- **Inputs:** the previous handoff; 3 dispatched ADS subagents (Refactor, QA/E2E, Programmer, all
  Sonnet 5); independent Coordinator verification of every load-bearing claim against source.
- **Output:** REF-001 complete; guard 71→7 with two new proven rules; three E2E specs made
  trustworthy; the confirmation-transport gap documented; 6 chat verbs shipped.
- **Risks:** two other sessions active in both repos; the R10 proposal may be incomplete;
  `@jini-ai/protocol` wiring deliberately deferred.
- **SIX premises corrected by checking source** (2 inherited from the prior handoff, 4 the
  Coordinator's own). This is the single most load-bearing pattern of the session — **no claim
  survived here on authority, only on evidence:**
  1. *"The dangling symlink will bite an `npm ci`"* (prior handoff) — **false**, exit 0 twice against
     the unfixed lockfile in a scratch clone.
  2. *"The SSE spec can never fail"* (prior handoff) — **wrong direction; it can never PASS.** The
     sentinel strings it checks exist nowhere in the protocol.
  3. *"The 502 is the new loud-failure path"* (Coordinator) — no; that path returns **`503
     AGENT_DAEMON_BOOT_FAILED`**. Real cause: a readiness probe polling a route with no daemon
     dependency at all.
  4. *"23 extensionless imports"* (Coordinator) — **21**; `mcp`'s 2 were string-literal test data,
     and a guard built on that same naive pattern would have flagged them forever.
  5. *"3 CMS tools blocked"* (agent's own claim, relayed by Coordinator) — **one**. Caught by the
     agent's own verified-vs-inferred flag, on its own document.
  6. *"MSG #7 never reached you"* (Coordinator) — it did; I was reading a **stale guard run** from
     before the agent's commit, and issued a duplicate assignment.
- **Also corrected:** *"the `chat.*` verbs may have no server-side executor, so wiring may be
  incoherent"* (Coordinator) — refuted; `page.*` is also browser-executed. That is the intended
  architecture, and the correction is what turned a false dead end into a real user decision.
- **Suggested next assignee:** user decision on tab-close and the confirmation transport; Programmer
  for `@jini-ai/protocol`
  once quiet; Software Architect if the confirmation transport is taken up.
