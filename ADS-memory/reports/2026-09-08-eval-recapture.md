# 2026-09-08 — Tool-search caller-2 compliance eval: live-CLI recapture and un-quarantine

Programmer(Execution). Dispatched by team-lead per `ADS-memory/reports/2026-09-08-eval-ground-truth-migration.md`'s
"Revision"/"Quarantine" sections: re-run `tool-search-caller2-compliance-harness.ts` (owner-authorized,
~16 min of real local-CLI API spend) and replace the frozen 2026-08-05 capture as the scored ground
truth for `tool-search-caller2-score-captures.ts`.

Persona bootstrap confirmed: `AI-Dev-Shop/agents/programmer/skills.md`, plus all three eval pre-reads
(`bug-taxonomy.md`, `eval-design-playbook.md`, `harness-engineering/agent-evals/README.md`).

## Load

Checked immediately before dispatch and again immediately before launch: `22.11 23.02 37.47` (16:49
PDT) and `31.20 25.27 37.71` (16:49-16:52 PDT). Both comfortably under the ~100 contention threshold the
dispatch gated the run on — proceeded without waiting. **No reading was taken mid-run** (a real gap,
disclosed rather than implied away) — the next reading, ~50 minutes after the run had already completed,
showed load had climbed to `90.99 82.26 50.12` (17:57 PDT), which is irrelevant to this run's own
conditions but is recorded here since a status check from team-lead cited it.

## What the harness does and costs

`development/evals/tool-search-caller2-compliance-harness.ts` spins up a real in-process Express
scratch daemon (loopback-only, port hardcoded, must be free before running), builds the REAL tool
registry via `buildEvalToolRegistry` (`installFirstPartyToolContributors()` +
`buildAssistantToolRegistrations` — the actual production composition, not a stub), and for each of 25
fixed operator-phrased cases (`CASES`, sampled from `tool-search-heldout-v2.ts`), POSTs a run to its own
`/api/runs` route which spawns a REAL local `claude` CLI subprocess against that operator query, with
the real system overlay text copied verbatim from `agent-daemon-server.ts`. A logging tap ahead of the
real tool-catalog-search route captures the exact `query` argument(s) the CLI composes for
`search_tools`. Sequential, one live CLI run per case, ~30-90s each — confirmed ~16 min wall-clock this
run (16:52-17:08 PDT). It targets the CURRENT catalog: confirmed directly via `buildEvalToolRegistry`
before running (see `tool-search-eval-registry.ts`'s own throw-if-undersized guard) and via the harness's
own `assertSchemaIsFresh()` pre-flight check, which passed (live `@jini-ai/mcp` schema already carries
the descriptive-phrasing text, not the old stale keyword text). It does no scoring of its own — it only
prints a `=== SUMMARY ===` JSON block at the end, which a separate scorer/fixture step must consume.

## Run — once, with a self-inflicted (unpaid) false start

First launch attempt used a manually-`nohup`'d backgrounded shell command; the wrapping shell returned
immediately, producing a false "exit 0, 0-byte log" reading within seconds. Per the dispatch's own
warning about this exact failure shape, this was NOT trusted — `ps`/`pgrep` confirmed the process tree
was in fact alive and had already bound the harness's scratch port. A second launch attempt (using the
tool's own backgrounding instead of manual `nohup`/`&`) then collided on that port (`EADDRINUSE`) and
exited immediately, before spawning any `claude` CLI subprocess — it never called the local CLI, so it
cost nothing and is not a second paid run. Its crash output, combined with its `>`-truncating redirect
to the SAME log path the first (real) process was still writing to, garbled two lines of raw console
output at the very start of that log (a fragment of the crashed process's stack trace spliced into the
real process's still-advancing file offset) — this affected only that log's first two lines, before the
real process's first case output. The real process's own `=== SUMMARY ===` JSON block, printed once at
the end after all 25 cases completed, is from that single surviving process alone and is unaffected;
verified directly (`status: "succeeded"` for all 25 entries, matching the per-case console lines for
every case from `backup-copy` onward).

**Exactly one paid run**, as authorized. Git HEAD at capture time: `ac663cec2c7aef37260b57be2f73836a8c7a0376`.
Local `claude` CLI: `2.1.266 (Claude Code)`. Node `v24.2.0`. Live catalog size: **170 tools**, verified
directly via `buildEvalToolRegistry` both before and after the run.

A status check from team-lead mid-run reported the process as dead (`pgrep` empty, no new file, stale
timestamps) — that check was against a state that turned out to be simply "the run had already finished
successfully and exited by design" (the harness calls `process.exit(0)` after printing its summary), not
a real failure; verified and reconciled directly against the log's own content and mtime rather than
assumed. Full exchange in this session's transcript.

## Capture fixture produced

`development/evals/tool-search-caller2-compliance-captures-2026-09-08.ts` (commit `eddfe32e`) — same 25
cases, same shape (`Caller2ComplianceCapture`) as the frozen 2026-08-05 file, which is **untouched**
(confirmed via `git diff --stat`, empty). All 25 cases `status: "succeeded"`; 24/25 called `search_tools`
(the 25th, `content-update`, did not call it either time — same case that skipped it in the 2026-08-05
capture). `expectedToolId` values are the RAW ids from the harness's own `CASES` array, unresolved —
same convention the 2026-08-05 file uses. 19 of these 25 raw ids are collapse-retired (verified via
`RETIRED_READ_TOOL_TO_CARD.has()`), because the harness's `CASES` list predates the `content_read`
collapse and was never rewritten for it (it received one earlier, unrelated fix: the
`integrations_list_subscriptions` -> `webhooks_list_subscriptions` stale rename that the ground-truth
migration report flagged as unswept in the old capture — this new capture already carries the corrected
id for that case, for free, since it reflects the harness's current `CASES` array rather than a frozen
2026-08-05 transcript).

**Resolvability: 25/25 (100%)** of the new capture's raw `expectedToolId` values resolve to a tool that
exists in the live 170-tool catalog once passed through `currentToolIdFor` — verified directly with a
standalone script (`buildEvalToolRegistry` + `currentToolIdFor`, not eyeballed), not estimated. 19 of the
25 required resolution (collapse-retired -> `content_read.<resource>` card id); the other 6 were already
live ids unchanged by `currentToolIdFor`.

## Scorer un-quarantined

`development/evals/tool-search-caller2-score-captures.ts` (commit `b12cee27`) now imports the
2026-09-08 capture instead of the 2026-08-05 one, and resolves `expectedToolId` (and the matched
held-out case's `alsoAcceptable`) through `currentToolIdFor` when building the `acceptable` set — the
same pattern the other 11 "live ground-truth fixture" suites in this directory already use. This is
**not** the move that was reverted for the 2026-08-05 capture: that capture is a historical record
whose catalog-at-capture-time predates the collapse, so resolving its ids against today's catalog would
retroactively reinterpret a past measurement. This capture was recorded TODAY, against TODAY's
already-collapsed catalog — resolving its ids at the scoring site is ordinary live-fixture maintenance,
not history-rewriting, and only proceeded because the resolvability check above came back 25/25, per the
dispatch's own condition for lifting the quarantine.

Removed: the quarantine `@file` header, the start-of-run banner, the `[STALE: collapse-retired id]`
per-case tagging, and the QUARANTINE NOTICE block. Restored: the `CUTOFFS`/`hits` computation and the
top-1/top-3/top-5/found@10 table, structured identically to the pre-quarantine version (recovered from
git history at commit `a87b2154` for structural reference, not reused verbatim since it scored the old
capture).

## Real numbers (n=25, today's catalog, today's capture)

```
top-1     17/25  (68%)
top-3     21/25  (84%)
top-5     22/25  (88%)
found@10  23/25  (92%)
```

**Eight** misses at top-1 (verified via a per-case rank script, not inferred from the aggregate table):
`recipes-list`, `comments-settings`, `identity-user-list`, `redirects-list`, `content-update`,
`taxonomy-list`, `widgets-list`, `workspace-get`. Of those, **six are recovered within the top-10
window** (`comments-settings` rank 2, `identity-user-list` rank 2, `redirects-list` rank 2,
`workspace-get` rank 2, `taxonomy-list` rank 4, `widgets-list` rank 7) and **two are never found in the
top 10 at all** (`recipes-list`; `content-update`, which never called `search_tools` in the first place,
so it is a guaranteed miss by construction, not a retrieval failure). Not framed against the retracted
"85%->59%, collapsing destroys retrieval" result per the dispatch's explicit instruction — this is a
fresh, independent n=25 measurement with its own number, not a comparison point for that retracted
finding.

## Verification

- `npx tsx` import check on the new capture file: 25 entries, all `status: "succeeded"`, caseIds match
  the harness's own 25-case list exactly.
- Standalone resolvability script (`buildEvalToolRegistry` + `currentToolIdFor`, both imported directly,
  not re-derived): 170-tool live catalog confirmed; 25/25 raw `expectedToolId` values resolve.
- `node --import tsx development/evals/tool-search-caller2-score-captures.ts`: exit 0, real (non-
  degenerate) per-case output and the table above.
- `npx tsc -p tsconfig.json --noEmit` from repo root: clean, 0 errors, after both edits.
- `git diff --stat -- development/evals/tool-search-caller2-compliance-captures-2026-08-05.ts`: empty —
  confirmed untouched at every point in this pass.
- `git status --short development/evals/`: scoped to exactly the two files this report describes, no
  stray changes.

## Not done / out of scope

- Did not re-run the harness a second time (one paid run only, as authorized).
- Did not touch the 2026-08-05 capture file or re-key it at any site, per explicit instruction.
- Did not investigate the 8 real top-1 misses beyond naming them above — that is genuine retrieval-
  quality signal for a future pass, not something to fix inside a recapture/scoring dispatch.
- Did not touch `apps/website/src` (the daemon-restart restriction was lifted mid-task by team-lead, but
  nothing in this dispatch's scope required touching it anyway).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RkYH6BctvmSgHDn1fTqSBR
