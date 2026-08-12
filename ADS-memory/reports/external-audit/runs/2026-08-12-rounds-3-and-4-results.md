# External Audit ROUNDS 3 & 4 — results

**Threat model:** `TM-tovu-pg-migration-001`, unchanged across all four rounds — scores comparable throughout.

## Why these rounds happened

After round 2 the coordinator recommended stopping: 15/15 resolved, zero blockers, scores converged.
**The owner asked for another pass anyway. That call was correct** — round 3 found two real bugs, one of
them destructive. The reasoning that justified it, in hindsight: *the fixes are themselves unaudited
code, and on this codebase a fix had already introduced a regression once.*

## Round 3 — audited the round-2 fix diff (`42f3d5a..HEAD`)

| Auditor | Score | Verdict |
|---|---|---|
| Gemini 3.6 Flash (packet-only) | **9.5** | all three fixes hold — **found nothing** |
| Sonnet 5 (files + live PG) | **9** | F3 partially-broken |
| Terra xhigh (files, PG sandbox-denied) | **7.8** | **F2 broken** |
| Gemini 3.1 Pro (packet-only) | **6** | F1 partially-broken, F2 broken |

**Scores DIVERGED (8.1→7.8, 8.5→6). That divergence was the signal.** Three real findings, and **no
single auditor found all three**:

1. **Terra — the sweep could DROP a non-fixture database.** `sweepStaleFixtureDatabases()` guarded with
   `Number(suffix)` + `Number.isInteger`, which accepts `9e8`→900000000, `0x10`→16, `900000000.0`,
   `+12` — all valid unquoted Postgres identifiers `process.pid` can never produce.
   **The fixing agent's repro beat the audit's:** it created seven real adversarial databases and
   watched three actually get dropped, including discovering pid 7 is dead on this host so `_007`
   misparsed. It also found `+12`/` 12` survived *only* by crashing on unquoted SQL — proving the
   quoting fix is not redundant with the regex fix.
2. **Gemini 3.1 Pro, with NO file access — the offset bound was wrong for Postgres.** It reasoned that
   Postgres caps timezone displacement tighter than `Date.parse`. Confirmed live: `+16:00` and `+19:00`
   fail with `time zone displacement out of range`; `+15:59` succeeds. The round-2 fix had set the bound
   at `23:59` to mirror `Date.parse`, blessing values that can never be cast to `timestamptz`.
3. **Sonnet — a real JSON column invisible to the classifier.** `composio_config.auth_config_ids`'s own
   docs say twice that it holds JSON, yet it classified `plain-text`, so `verifyJsonText` never ran.
   Neither naming signal catches it (`auth_config_ids` / `authConfigIds`), so the "genuinely
   independent" oracle computed an **empty disagreements array** and stayed green *alongside* the gap.

**Coordinator severity error, corrected:** Terra rated finding 1 a blocker; Sonnet proved with a 17-case
adversarial name sweep that it can never escape the `tovu_migration_fixture_*` namespace and needs an
already-privileged actor. **Sonnet was right; the coordinator had relayed "blocker" too strongly.**

### Round-3 fixes (`c9193d0`, `2cb39fc`) — all coordinator-verified
- **A:** anchored `/^[1-9]\d*$/` before coercion + quoted identifiers.
- **B:** bound corrected to **±15:59**. Verified both directions: `+14:00` (Kiribati) and `+13:45`
  (Chatham) still accept; `+16:00`/`+20:00` reject; and rounds 1-2 gains survive (`+24:00`,
  `2026-02-30`, space-separated all still rejected).
- **C:** the scan turned up **5 columns, not 1** — including **`external_mcp_servers.allowed_tool_names`,
  a security column** (default-deny MCP tool federation). A migration corrupting a default-deny allowlist
  would have passed verification silently. Shipped with three gates, not the one requested.

**Declined, with reasoning, and accepted:** the UUID-nonce fix for the pid-reuse race. Failure mode is
"database does not exist" on a sibling run — test-infra churn, not data loss — and a nonce would end
auto-reclaim of pid-suffixed fixtures. Recorded as known-open.

## Round 4 — audited the round-3 fix diff

| Auditor | Score | A | B | C |
|---|---|---|---|---|
| Sonnet 5 | **9.2** | holds | holds | partially-broken |
| Terra xhigh | **8.7** | holds | holds | partially-broken |
| Gemini 3.1 Pro | **8.5** | — | — | — |
| Gemini 3.6 Flash | **8.0** | — | — | — |

**Zero blocking findings from all four.** Fixes A and B held under probing that materially exceeded the
shipped suite — 33 and 28 independent cases including fullwidth/Arabic-Indic digit lookalikes,
`Infinity`, BigInt suffixes, and a live injection probe with `DROP TABLE decoy_should_survive; --`
embedded in a database name (the decoy survived).

**One finding, and Terra + Sonnet converged on it independently** — same finding, same two ranked
options, same recommendation: **`REVIEWED_JSON_COLUMNS` has no completeness gate.** Its four tests check
staleness, non-redundancy, end-to-end classification, and a hardcoded five-column snapshot — **none
asserts anything about a column NOT in the registry**, and `classifyCoreColumn` falls through to
`plain-text` (manifest.ts:474) ungated. The next unconventioned JSON column reproduces
`auth_config_ids`' silent failure exactly.

**Owner chose** the heuristic fail-closed tripwire over a full 500-column registry, documentation-only,
or accepting the risk. Implemented test-only.

## What actually worked — carry these forward

1. **Probe direction is a coverage dimension.** Round 2's regression survived an auditor that scanned
   3,431 values, because every probe asked *"does this wrongly reject valid data?"* Round 3 and 4 made
   both directions mandatory and required a **case count per verdict** — "verified" without a count
   reads as not verified.
2. **Auditor diversity beat auditor depth, repeatedly.** The deepest auditor missed what a
   lower-scoring one found, twice. A packet-only auditor with no file access found the Postgres offset
   bound by reasoning about *which authority was correct*.
3. **Flash returned the highest score and zero findings in two consecutive rounds where real bugs
   existed.** Weight its clean bills near zero.
4. **Divergence, not convergence, is the interesting signal.** Round 2 converged and was wrong to stop
   at; round 3 diverged and found two bugs.
5. **Ranked fix slates with explicit failure modes** (owner's request, protocol's `suggest_changes=patches`
   + Solution Slate). Every regression in rounds 2-3 came from a single unreviewed fix choice whose
   failure mode nobody wrote down. Round 4's finding arrived with three costed options and let the owner
   choose.
6. **The fixing agents repeatedly out-verified the auditors** — real adversarial databases over mocks,
   re-derived data scans instead of citing the coordinator's numbers, and self-caught bugs in their own
   test fixtures.
