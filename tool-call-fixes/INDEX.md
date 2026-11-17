# Tool-call structural fixes: index (2026-11-17)

Status: **COMPLETE** (design and plan only; no source file edited, nothing built, no test run).
Branch: `plan/tool-call-fixes-2026-11-16`, started from `plan/fable-planning-inputs-2026-11-16`.
Code read from `integ/merge-a-2026-11-16` (Tovu `f354cfbd`, Jini `96aade8c`): the newest named integration branch
when the run started. `integ/merge-final-2026-11-16` did not exist. `integ/merge-b-2026-11-16` existed, was moving in
parallel and was **not** read; every sheet finds its symbols by name before editing.

Input: `ADS-memory/.local-artifacts/codex/2026-11-10/tool-failure-audit.md` (1,324 failed tool calls of about 27,000).

## Files

| File | What it is |
|---|---|
| `DESIGN.md` | Verdict per class (§1), root causes with file:line (§2), the ten mechanisms (§3), regression gates (§4), lessons applied (§5), what was not verified (§6) |
| `sheets/README.md` | Rules every executor follows: setup, order inside a sheet, owner rules, stop conditions, report format |
| `sheets/S*.md` | 18 sheets, each one Sonnet run |

## 1. Classes: are they still live?

| # | Class | Audit count | Today | Mechanism | Jini owner | Sheets |
|---|---|---:|---|---|---|---|
| C1a | Unknown tool answered as "denied" | 68 (+ some of 11) | Live: four different answers | M1 one tool-target decision, `404 UNKNOWN_TOOL`, families through a host port | `daemon` (codes in `protocol`, `core`) | S1, S2 |
| C1b | Guides name tools that are not directly callable | 12 | Live; a full direct list also skips promotion silently | M2 every answer says how to call; lint over every guide text; named tools pinned first | `mcp`, `core`; check in Tovu | S3, S4a, S4b |
| C1c | "Get" tool refused by the read-only gateway | 11 | Live | M3 one registry-wide truth test | (Tovu test over Jini's `isReadOnlyTool`) | S5 |
| C2 | Names masked in errors | 78 | Live but narrower: launch-time tool ids are no longer masked on the MCP side | M4 trusted vocabulary from registration data, shared by both redaction layers | `core`, used by `mcp`, `daemon` | S6, S7 |
| C3 | Bare `HTTP 500` | 40 | Live; two causes found | M5 client never prints a status alone; one terminal JSON error boundary | `mcp`, `http-kit` | S8, S9 |
| C4 | Same-file batch edits | 21 | Live | M6 chained pins for same-target items in the batch owner | `core` | S10, S11 |
| C5 | Refusal where clamp or help is safe | about 35 | Live | M7 declared repairs: `aliases` (exists), `clamp`, `obtainFrom` | `core`, `mcp` | S12, S13 |
| C6 | Screenshot deadline | 20 | Partly fixed (current-frame fallback exists) | M8 budget from the request; best effort once the page loaded | `diagnostics` | S14 |
| C7 | Silent waits lose approvals | 5 to 13 | Live; a second 300 s wall is likely in the HTTP hop (to be proven in S15) | M9 one progress pump; long-wait fetch; per-CLI timeouts as adapter data | `mcp`, `agent-runtime` | S15, S16 |
| C8 | Chrome tab collisions | 192, rising | Changed: an owner-only switch now, but on by default and not exclusive | M10 one browser-integration lease per host; default by owner decision | `daemon` | S17 |

Overlap with other designs (nothing is planned twice):

- **Error system.** Its site list has no row for `daemon-client.ts`, `delegated-tools.ts` or the sanitizer. C3 calls
  its owners (`reportRouteInternalError`, later `createErrorReporter`; the `ERR-…` id function it moves to core) and
  adds no reporter, id format or envelope. C2 only stops masking of names; what an error may say stays under that
  design's disclosure rules. Its E5a edits the same status table as S1.
- **AG-UI.** It keeps the chat-card exchange as the one approval mechanism and adds browser keepalive. C7 works on
  the hop from the agent CLI to the MCP host, which that design does not touch.
- **ACP, lane K, R7, R8.** They move files S1, S9, S16 and S17 edit. Order below.

## 2. Sheets

Estimates are Sonnet tokens by analogy with earlier lanes, not measured.

| Sheet | What | Repo | Needs first | Red-first test must fail because | Est. |
|---|---|---|---|---|---:|
| S1 | `404 UNKNOWN_TOOL`, one target decision | Jini | none; coordinate E5a, R7 | status is 403 / 400 and the text differs | 170k |
| S2 | Families through a host port; product name leaves Jini | Jini, Tovu | S1; OD-2 | no port; guard finds `content_read` in Jini | 150k |
| S3 | `describe_tool` says `callAs` and the exact call | Jini | none | skipped promotion is silent | 150k |
| S4a | `check:tool-guides` report + committed inventory | Tovu | S3 | scanner tests (new code) | 190k |
| S4b | Fix mentions, pin named tools, strict lint | Tovu | S4a; OD-7 if no fit | strict lint fails; order test fails | 220k |
| S5 | Read-truth registry test, fix mismatches | Tovu | none | `external_mcp_get_admissions` mismatch | 110k |
| S6 | Trusted vocabulary, MCP side; locates the masking layer | Jini | none; OD-3 | output shows `[redacted]` for names | 190k |
| S7 | Same vocabulary in the daemon's redaction | Jini, Tovu | S6 (and only if S6 finds this layer masks) | decorator passes no trusted names | 150k |
| S8 | Client never prints a status alone | Jini | none; coordinate E2 | four responses give a bare status | 160k |
| S9 | Terminal JSON error boundary; flat answers become envelopes | Jini, Tovu | S8; prefer after E4 and R7 P1 | bodies are HTML or flat | 170k |
| S10 | Batch chain in core | Jini | none | item 2 refuses after item 1 | 150k |
| S11 | Theme tools adopt it; wording | Tovu | S10 | "changed during review" on the second edit | 130k |
| S12 | `clamp`, `obtainFrom` in the normalizer | Jini | none; OD-8 | 8300 refused; no pointer to the listing tool | 170k |
| S13 | Tovu schemas declare repairs; bounds gate | Tovu | S12, S4a | alias refused; nothing declares `clamp` | 140k |
| S14 | Capture budget, best effort after load | Jini, Tovu | none; OD-5 | no image when the wait uses the budget | 180k |
| S15 | Progress pump; long-wait fetch | Jini | none | zero notifications in 120 s; headers wait fails | 190k |
| S16 | Probe each CLI; timeouts as adapter data | Jini | S15; lane K | config has no timeout key (only for measured CLIs) | 180k |
| S17 | Browser-integration lease; default | Jini, Tovu | OD-4; after R8b / size-10 on `launch.ts` | two runs both get the integration | 150k |

**Total: about 2.95M Sonnet** for the 18 sheets, plus about 0.2M Opus for review of the returned diffs.
S7 may drop out (150k) if S6 shows the daemon layer masks nothing.

## 3. Order and prerequisites

Four chains can run side by side. Inside a chain the order is strict.

```
A (one tool surface):   S1 → S2          S3 → S4a → S4b          S5
B (errors):             S6 → S7          S8 → S9
C (arguments, batches): S10 → S11        S12 → S13 (also needs S4a)
D (waits, pages):       S14              S15 → S16              S17
```

First wave, no prerequisites and no shared files: **S1, S3, S5, S6, S8, S10, S12, S14, S15**.

Shared-file rules:

1. `daemon/src/http/delegated-tools.ts`: S1 then S2. If R7 moves this file first, both apply at the new path.
2. `mcp/src/server/tool-protocol.ts`: S1 (unknown-tool sentence), S3 (`isDirectTool`), S6 (vocabulary). Run S1 → S3 → S6 on this file, or rebase the later one; each touches a different function.
3. `mcp/src/server/daemon-client.ts`: S8 only. S6 reads `DaemonHttpError` fields S8 adds; S6 works without them and picks them up after S8.
4. `mcp/src/server/tool-server.ts` (409 lines): S3 and S15. Each adds under ten lines; second one rebases.
5. Tovu `agent-daemon-scope.ts`: S2 (one deps line), S4b (removes the ordering code into its own file), S9 (boundary, three answers), S17 (lease). It is on the reconcile sequence H3: these go **after R7 P1** if that is in flight, one at a time.
6. `core/src/contracts/server/api-error.ts`: S1 adds one row; error-system E5a changes how the table is read. Either order works; the second rebases.
7. Jini `agent-executor/launch.ts` and the per-CLI config writers: S16 after lane K, S17 after R8b and size-10 (reconcile sequence H2).

## 4. Owner decisions

| # | Decision | Recommendation | If no |
|---|---|---|---|
| OD-1 | A new generic code `UNKNOWN_TOOL` (404) instead of reusing `NOT_FOUND` | Yes: `NOT_FOUND` on this route already means "run not found" | reuse `NOT_FOUND`; the model cannot tell a missing run from a missing tool by code |
| OD-2 | A family id plus a selector that names exactly one member runs that member, with a note | Yes | only the "group of tools" answer; about 8 failures per 3 weeks remain as one extra round trip |
| OD-3 | Errors may show strings the caller itself sent in this call (slugs), except secret-marked fields | Yes | slugs with digits stay masked |
| OD-4 | Chrome integration off by default; stored choices kept | Yes, together with the single-run lease | lease only; default stays on |
| OD-5 | Screenshot budget may grow with the request up to 45 s | Yes | stay at 20 s; only the best-effort capture is added |
| OD-6 | Progress every 25 s; no limit on a human wait other than the run (the 2026-11-03 decision); the number for per-CLI timeouts once S16 has measured | Yes | pick an upper bound for human waits |
| OD-7 | If guides name more tools than fit the direct list: write the overflow in gateway call form, keep the 64-tool limit | Yes | raise the limit (more schema in every run's context) |
| OD-8 | `clamp` is opt-in per property | Yes | clamp every integer bound (unsafe for selectors) |
| OD-9 | Do not default a missing `themeId` to the active theme, even on read tools | Yes (the refusal now names `theme_list`) | a separate small change for read tools only |

## 5. Riskiest calls

1. **S1 changes a status code on a security-relevant route.** Mitigation: the gate order is written down (DESIGN M1),
   every reader of the old code is listed before editing, and tests fail if a gate is removed or reordered.
2. **S4b depends on a number nobody has measured**: how many tools the guides name. S4a measures first and stops if it
   does not fit.
3. **S6 loosens masking.** Mitigation: names come only from trusted positions; every credential rule stays; a property
   test shows unknown tokens are still masked; the daemon side changes only if measured.
4. **S15 rests on an unverified runtime default.** Its first step proves or disproves it and the fetch change is
   dropped if it is not real.

## 6. Not verified

Full list in DESIGN §6. The ones that can change the plan: tool and guide-site counts (S4a), which layer masks each
example (S6), the cause of the 11-09 storm of bare 500s, Node's response-header wait (S15), every agent CLI's progress
and timeout behaviour (S16), how a failed plan-mode batch reaches the model (S10), and anything changed on
`integ/merge-b-2026-11-16`. Nothing was executed in this run.
