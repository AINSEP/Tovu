# Tool-call structural fixes: index (2026-11-17, revision 3)

Status: **COMPLETE, revision 3** (design and plan only; no source file edited, nothing built, no test run).
Revision 3 answers the Opus review of revision 2: table "Revision 3 - Opus review response" at the end of this file.
**Base (re-pinned 2026-11-17): `origin/refactor/terra` = `integ/merge-final-2026-11-16`: Jini `65d73b0d5`, Tovu `232764af5`**
(contains revision 3's Tovu `a28cb1bf`; `sheets/README.md` §1.1; `sheets/BLOBS.tsv` regenerated there). Wave 1 progress and
the command fixes of the 2026-11-17 housekeeping run: section "Housekeeping 2026-11-17" at the end. The revision 2 notes below about merge-a and merge-b are kept as history.
Branch: `plan/tool-call-fixes-2026-11-16`.
Revision 2 answers `CODEX-JUDGE.md` ("needs rework": 4 blockers, 15 majors, 1 minor). Each finding was verified in
the code first. **20 accepted, 0 rebutted.** Table at the end of this file.
Code verified against `integ/merge-a-2026-11-16` (Tovu `e801e9ae`, Jini `dde69a6d`); every cited path was also
checked on `integ/merge-b-2026-11-16` (Tovu `450ac748`, Jini `9c982fd9`). `integ/merge-final-2026-11-16` did not
exist. The two integration branches have diverged (Tovu 253 / 134 commits, Jini 97 / 210); merge-b has no
`core/src/errors/reporter.ts`, so S8 and S9 need a base that contains merge-a.

Input: `ADS-memory/.local-artifacts/codex/2026-11-10/tool-failure-audit.md` (1,324 failed tool calls of about 27,000).

## Files

| File | What it is |
|---|---|
| `DESIGN.md` | Verdict per class (§1), root causes with file:line (§2), the ten mechanisms (§3), regression gates (§4), lessons applied (§5), what was not verified (§6) |
| `CODEX-JUDGE.md` | The judge report revision 2 answers |
| `sheets/README.md` | The one contract every executor follows: setup with the Jini link, green-only sheet branch, the gate, a command for every stop condition, report format |
| `sheets/BLOBS.tsv` | Generated: blob ids at merge-a of the 49 files the sheets name, for the drift check |
| `sheets/S*.md` | 22 sheets, each one Sonnet run |

## 1. Classes: are they still live?

| # | Class | Audit count | Today | Mechanism | Jini owner | Sheets |
|---|---|---:|---|---|---|---|
| C1a | Unknown tool answered as "denied" | 68 (+ some of 11) | Live: four different answers | M1 one tool-target decision, `404 UNKNOWN_TOOL`, families through a host port | `daemon` (codes in `protocol`, `core`) | S1, S2a, S2b |
| C1b | Guides name tools that are not directly callable | 12 | Live; a full direct list also skips promotion silently | M2 every answer says how to call; lint over every guide text; named tools pinned first | `mcp`, `core`; check in Tovu | S3, S4a, S4b |
| C1c | "Get" tool refused by the read-only gateway | 11 | Live as **wording**: the refused tool is a real write; risk and the read-only flag are already checked centrally | M3 wording gate plus the unchecked `approval.class` | (Tovu test) | S5 |
| C2 | Names masked in errors | 78 | Live but narrower: launch-time tool ids are no longer masked on the MCP side | M4 trusted vocabulary, complete before the MCP client's first lossy pass; the route sends trusted names | `core`, `mcp`, `daemon` route | S6, S7 |
| C3 | Bare `HTTP 500` | 40 | Live; two causes found | M5 client never prints a status alone and never quotes an unrecognized body; one terminal JSON error answer in Tovu | `mcp` (boundary is Tovu code) | S8, S9 |
| C4 | Same-file batch edits | 21 | Live | M6 same-target items chain on the version the batch itself committed | `core` | S10, S11 |
| C5 | Refusal where clamp or help is safe | about 35 | Live | M7 declared repairs: `aliases` (exists), `clamp`, `obtainFrom` | `core`, `mcp` | S12a, S12b, S13 |
| C6 | Screenshot deadline | 20 | Partly fixed (current-frame fallback exists) | M8 budget from the request; best effort once the page loaded | `diagnostics` | S14a, S14b |
| C7 | Silent waits lose approvals | 5 to 13 | Live; a second 300 s wall is likely in the HTTP hop (to be proven in S15) | M9 one progress pump; long-wait fetch; per-CLI timeouts as adapter data | `mcp`, `agent-runtime` | S15, S16a, S16b |
| C8 | Chrome tab collisions | 192, rising | Changed: an owner-only switch now, but on by default and not exclusive | M10 one browser-integration lease per daemon process; default by owner decision | `daemon` | S17 |

Overlap with other designs (nothing is planned twice):

- **Error system.** Its E2 (core `createErrorReporter`, `mintToolErrorId` in core) is on merge-a and is the one
  reporter S8 binds to. S9 mints its ids with the same core `mintToolErrorId` (one `ERR-` format across S8 and S9)
  and reports through the existing `reportServerFailure`; E4 rebinds those two ports with its other call sites. Its site list has no row for
  `daemon-client.ts` or `delegated-tools.ts`. Its E5a reads the same status table S1 adds a row to. Its disclosure
  rule (redaction is not permission) is why S8 quotes no unrecognized body.
- **AG-UI.** It keeps the chat-card exchange as the one approval mechanism (its OD-10) and adds browser keepalive.
  C7 works on the hop from the agent CLI to the MCP host, which that design does not touch, and pins the 120 s
  approval window unchanged.
- **R7.** Express middleware (bearer gate, 6 MB parser, run gates) stays in Tovu; S9's boundary is therefore Tovu
  code. R7 moves `daemon/src/http/*` (S1, S2a, S7, S12b find their symbols by name) and the mount lines in the scope file.
- **Lane K.** Moves the per-CLI MCP config writers; S16b waits for it.
- **Lane T (theme).** T-TH-05 owns `theme-files.ts`, T-TH-08 owns the theme tool files. S11, S13 and the theme part
  of S4b land **before** them and report touched blobs.

## 2. Sheets

Estimates are Sonnet tokens by analogy with earlier lanes, not measured. "Needs" lists sheets, lanes and owner
decisions. A sheet does not start until each prerequisite has landed (README §4.11) and each **blocking** decision is
`DECIDED` (README §4.10). A **branching** decision (marked "br.") never stops a sheet: while `OPEN`, the sheet runs the
branch its header names.

| Sheet | What | Repo | Needs | Red-first test must fail because | Est. |
|---|---|---|---|---|---:|
| S1 | `404 UNKNOWN_TOOL`, one target decision | Jini, Tovu tests | OD-1 | status is 403 / 400 and the text differs | 190k |
| S2a | Family answered as a group; product name leaves Jini | Jini, Tovu | S1 | no port; guard finds `content_read` in Jini | 150k |
| S2b | MCP gateway retries a family call once as its member | Jini, Tovu test | S2a, S8, OD-2 | one request, error result | 140k |
| S3 | `describe_tool` says `callAs` and the exact wire-name call | Jini | S1 | skipped promotion is silent; id is not the wire name | 170k |
| S4a | `check:tool-guides` report over model-facing text + inventory | Tovu | S3 | scanner tests (new code), SQL negatives | 200k |
| S4b | Fix mentions, pin named tools, strict lint | Tovu (+ Jini texts) | S4a; br. OD-7 (STOP only if no fit) | strict lint fails; order test fails | 220k |
| S5 | Read-wording gate; `approval.class` check | Tovu | none | a write tool's description starts with "Reads" | 100k |
| S6 | Trusted vocabulary before the first lossy pass | Jini | S8; br. OD-3 (OPEN: no source 4) | output shows `[redacted]` for names | 200k |
| S7 | Route sends `details.toolId` / `inputNames` | Jini, Tovu tests | S1, S6 | envelope has no `details` | 130k |
| S8 | Client never prints a status alone or an unrecognized body; reporter wired | Jini | E2 in base; S3, S15 (shared files) | four responses give a bare status | 190k |
| S9 | Terminal JSON error answer; flat answers become envelopes | Tovu | S8 | bodies are HTML or flat | 150k |
| S10 | **DONE** (Jini `wave1/tc-S10`: c46d03c2, 402d81a7; report 5ca2bafd; not merged into refactor/terra) Chained batch handler in core | Jini | none | no such function; item 2 refuses | 160k |
| S11 | Theme tools adopt it; wording | Tovu | S10; before T-TH-05 / T-TH-08 | "changed during review" on the second edit | 150k |
| S12a | `clamp` in the normalizer and for MCP-local tools | Jini | S3, S6 (shared files); OD-8 | 8300 refused | 160k |
| S12b | `obtainFrom` on the typed and the gateway path | Jini | S12a, S1 | no pointer to the listing tool | 150k |
| S13 | Tovu schemas declare repairs; bounds gate | Tovu | S12b, S4a, OD-8; br. OD-9; before T-TH-08 | alias refused; nothing declares `clamp` | 150k |
| S14a | **DONE** (Jini `wave1/tc-S14a`: 6a57eb5a..98f40732, 5 commits; report b2d8d8ce; not merged) Clock seam; work deadline, reserve, hard stop in `renderPage` | Jini | none | no fallback when the wait uses the budget | 170k |
| S14b | Tovu computes the budget; current frame after load | Tovu | S14a; br. OD-5 (OPEN: cap stays 20 s) | no image when the wait uses the budget | 150k |
| S15 | **DONE** (Jini `wave1/tc-S15`: 6ed4fd19..99677518, 7 commits; report 082f833f; not merged) Progress pump; long-wait fetch; approval window pinned | Jini | none | zero notifications in 120 s; headers wait fails | 200k (+30k) |
| S16a | Probe each CLI; commit the support matrix | Jini | S15; br. OD-11 | matrix test (new) | 150k |
| S16b | Timeouts as adapter data; Tovu binding | Jini (incl. core), Tovu | S16a, lane K, OD-6 | config has no timeout key (measured CLIs only) | 170k |
| S17 | One lease per daemon; default | Jini, Tovu | br. OD-4 (OPEN: lease only) | two site scopes both get the integration | 170k |

**Total: about 3.62M Sonnet** for 22 sheets (revision 1: 2.95M for 18), plus about 0.25M Opus for review of the
returned diffs. The growth is the four splits (so each run compiles alone), the reporter wiring in S8, the
server-side metadata in S7 (it replaced a sheet that might have dropped out) and the Tovu test parts.

## 3. Order and prerequisites (the one authoritative graph)

```
S1 ──► S2a ───────────────┐
 │                         ├─► S2b            (needs S8)
 ├──► S3 ──► S4a ──► S4b   │
 │      └──► S8 ◄── S15 ───┘                  (S8 after S3 and S15: shared files)
 │            ├──► S6 ──► S7 ──► S12b ──► S13 (S7 also needs S1; S12b needs S12a; S13 needs S4a)
 │            └──► S9
S10 ──► S11          S12a (after S6 on tool-protocol.ts)          S5
S14a ──► S14b        S15 ──► S16a ──► S16b (lane K, OD-6)         S17
```

Waves (sheets in one wave touch no common source file; a wave starts when the one before it has merged). The one
exception is a package manifest's export lines (`exports`, `jini.entries`), which README §4.9 requires in the commit
that adds the file: see the `core/package.json` row below.

| Wave | Sheets |
|---|---|
| 1 | S1, S5, S10, S14a, S15, S17 |
| 2 | S2a, S3, S11, S14b, S16a |
| 3 | S8, S4a |
| 4 | S6, S2b, S4b, then S9 (S4b and S9 both edit Tovu's scope file: S4b first). If S4b's Jini part edits a file S6 or S2b changes, it runs after them |
| 5 | S7, S12a |
| 6 | S12b |
| 7 | S13, S16b |

Shared files and their one order (a later sheet rebases on the earlier one; no parallel edits):

| File | Order |
|---|---|
| Jini `mcp/src/server/tool-protocol.ts` | S1 → S3 → S8 → S6 → S12a |
| Jini `mcp/src/server/tool-server.ts` | S15 → S3 → S8 (S15 and S3 touch different functions; S3 rebases) |
| Jini `mcp/src/server/daemon-client.ts` | S8 → S6 (S2b, S7 and S9 only read it in a landed check) |
| Jini `mcp/src/bin/serve.ts` | S15 → S8 |
| Jini `mcp/src/server/tools/tool-catalog-tools.ts` | S3 → S12a |
| Jini `daemon/src/http/delegated-tools.ts` | S1 → S2a → S7 → S12b (if R7 moved it: same order at the new path) |
| Jini `daemon/src/core/tool-target.ts` | S1 creates → S2a |
| Jini `mcp/src/server/tools/delegated-tool.ts` | S2b only (S15 only reads `DEFAULT_DELEGATED_TOOL_TIMEOUT_MS`; S6 only reads its `isRegistered` use) |
| Jini `core/package.json` (export lines only) | S1 and S10 (both wave 1), S6, S12a. Each adds its own `exports` / `jini.entries` lines; the second sheet of wave 1 runs `git pull --rebase` and keeps both sets of lines. No sheet edits another sheet's lines |
| Jini `core/src/tool-call-text.ts` | S1 → S3 |
| Jini `core/src/tool-input-repairs.ts` | S12a → S12b |
| Jini `core/src/contracts/server/api-error.ts` | S1 adds one row; error-system E5a changes how the table is read; the second rebases |
| Tovu `agent-daemon-scope.ts` (reconcile SEQUENCE H3) | S17 → S2a → S4b → S9 → S16b (waves 1, 2, 4, 4, 7), one at a time, and after R7 P1 if that is in flight |
| Tovu `features/theme/*` | S11, S13, S4b land **before** lane T's T-TH-05 and T-TH-08; each reports its touched blobs so the lane's `*.files.tsv` are regenerated. If a T lane lands first, the sheet applies at the new path (its `git ls-files` check says so) |

Release nodes (finding 6). Tovu reads Jini from the registry. Executors work against a linked build; these nodes are
what makes an **unlinked** Tovu branch green:

| Node | After | Publishes (new entries) | Before these Tovu parts merge unlinked |
|---|---|---|---|
| REL-1 | wave 1 Jini commits | `core/tool-call-text`, `core/approval-batch-chain`, `diagnostics/web-evidence/capture-budget` + `/testing`, `daemon/exclusive-run-lease`, `UNKNOWN_TOOL` | S1 Tovu tests, S11, S14b, S17 Tovu |
| REL-2 | S2a, S3, S8 Jini commits | family port type, `DaemonHttpError` fields | S2a Tovu, S4a, S9 |
| REL-3 | S6, S7, S2b, S12a, S12b Jini commits | `core/text/*`, `core/tool-input-repairs` | S7 Tovu tests, S2b Tovu test, S13 |
| REL-4 | S16b Jini commits | `mcpToolCall` def field, host option | S16b Tovu |

A REL node is the release owner's work (version bump, publish, Tovu range + lockfile in one Tovu commit). It is not
part of any sheet and no sheet leaves an edit for it: every export-map entry ships in the Jini commit that adds the file.

## 4. Owner decisions

The last column is the gate executors grep (`sheets/README.md` §4.10). The owner replaces `OPEN` with `DECIDED: yes`
or `DECIDED: no`.

| # | Decision | Recommendation | If no | State |
|---|---|---|---|---|
| OD-1 | A new generic code `UNKNOWN_TOOL` (404) instead of reusing `NOT_FOUND` | Yes: `NOT_FOUND` on this route already means "run not found" | S1 reuses `NOT_FOUND`; the model cannot tell a missing run from a missing tool by code | OPEN |
| OD-2 | A family call whose input names exactly one member is retried once **by the MCP gateway tool** as that member, with a note. The server never reroutes | Yes | S2b is not run; only the "group of tools" answer (about 8 failures per 3 weeks stay one extra round trip) | OPEN |
| OD-3 | Errors may show strings the caller itself sent in this call (slugs), except secret-marked fields | Yes | slugs with digits stay masked; S6 runs without source 4 | OPEN |
| OD-4 | Chrome integration off by default (registered setting and fallback together); stored choices kept | Yes, together with the lease | lease only; default stays on | OPEN |
| OD-5 | Screenshot budget may grow with the request up to 45 s | Yes | cap stays 20 s; S14b adopts only the current-frame fallback | OPEN |
| OD-6 | The per-CLI tool-call timeout number for measured CLIs (proposal 600 s); progress every 25 s | Yes | S16b is not run | OPEN |
| OD-7 | If guides name more tools than fit the direct list: write the overflow in gateway call form, keep the 64-tool limit | Yes | raise the limit (more schema in every run's context) | OPEN |
| OD-8 | `clamp` is opt-in per property | Yes | clamp every integer bound (unsafe for selectors) | OPEN |
| OD-9 | Do not default a missing `themeId` to the active theme, even on read tools | Yes (the refusal now names `theme_list`) | a separate small change for read tools only | OPEN |
| OD-10 (new) | The human-approval window stays 120 s (`APPROVAL_WAIT_TIMEOUT_MS`); progress never extends it | Yes: S15 pins it unchanged | a separate design: expiry, late confirmation and "no effects after expiry" all change together | OPEN |
| OD-11 (new) | CLI scope: Gemini is recorded as retired (Antigravity is measured in its place) and Aider as "no tool transport" in the support matrix; neither gets code | Yes: the Gemini def is retired by a test, and Aider has no MCP client upstream | restoring a Gemini def or giving Aider a tool transport is its own design, outside this plan | OPEN |

Revision 1's OD-6 said a human wait has no limit other than the run. The code has a 120 s limit; the text was wrong
and is replaced by OD-6 (timeout number only) and OD-10.

## 5. Riskiest calls

1. **S1 changes a status code on a security-relevant route.** Mitigation: gate order written down (DESIGN M1), every
   reader of the old code listed first, tests that fail when a gate is removed. S1 itself moves no gate.
2. **Family calls (S2b).** The server-side reroute of revision 1 would have bypassed the durable guard. The caller-side
   retry sends a normal concrete request; paired tests compare it with the concrete call under a stale attempt and a writable member.
3. **S4b depends on a number nobody has measured**: how many tools the guides name. S4a measures first and stops if it does not fit.
4. **S6 / S7 loosen masking.** Names come only from trusted positions; every credential rule stays; a property test
   shows unknown tokens are still masked; the registration predicate is not widened.
5. **S8 must not disclose.** A canary test proves no part of an unrecognized body reaches the model.
6. **S11 writes files.** The successor pin is the batch's own committed digest; three foreign-write windows are tested.
7. **S15 rests on an unverified runtime default.** Its first step proves or disproves it and the fetch change is dropped if it is not real.

## 6. Not verified

Full list in DESIGN §6. The ones that can change the plan: tool and guide-site counts (S4a), Node's response-header
wait (S15), every agent CLI's progress and timeout behaviour (S16a), how a failed plan-mode batch reaches the model
(S10), whether schema consumers accept the new keywords (S12a step 0), and the registry release process behind the
REL nodes. Nothing was executed in this run. Estimates are by analogy.

## Revision 2 - judge response

Every row was checked in the code at merge-a before deciding. Evidence paths are Jini `packages/…` (J) or Tovu (T).

| # | Sev. | Verdict | What changed (file) | Evidence |
|---|---|---|---|---|
| 1 | Blocker | ACCEPT | Server never reroutes a family. S2 split: S2a answers with `details.family`; S2b retries in the MCP gateway tool as a concrete call, with paired stale-attempt and writable-member tests (`sheets/S2a-…`, `S2b-…`, DESIGN M1) | T `agent-daemon-scope.ts:1512-1519`; T `durable-run-routes.ts:60` (`if (!isRegistered…) next()`), `:77-84` |
| 2 | Blocker | ACCEPT | No re-read. New `createChainedBatchHandler`: successor pinned to the version the item's own write reported (temp-file digest before rename). Foreign write tested in three windows. `targetKey({ prepared })` corrected and tested (`S10`, `S11`, DESIGN M6) | T `theme-files.ts:625-629` (check then rename, no await); T `file-mutation-tools.ts:50-58`; J `core/src/approval.ts:226,243-246` |
| 3 | Blocker | ACCEPT | S9 has no Jini code. The Express error handler is a Tovu file; it calls existing `reportRouteInternalError` and `reportServerFailure` (`S9`, DESIGN M5) | R7 `R7-ROUTES.md` §3.5 ("stay Express middleware in Tovu"); J `http-kit/src/index.ts:15`; T `admin-failure.ts:52` |
| 4 | Blocker | ACCEPT | Unrecognized bodies are never quoted: fixed words plus a recorded reference; canary property test; unauthenticated answers pinned unchanged in S9 (`S8`, `S9`, README §5) | J `daemon-client.ts:168-174` (envelope fields only today); J `http-kit/src/internal-error.ts:20-33`; error-system DESIGN §3.3 |
| 5 | Major | ACCEPT | README rewritten as one contract: green-only sheet branch plus `wip/` branch, red tests never committed alone, 15 stop conditions each with a command (lazy imports, module mocks, escapes, barrels, hooks, why-comments, inventories, decisions, prerequisites). Decisions are gates: S1 needs OD-1, S12a OD-8 (`sheets/README.md`, sheet headers, INDEX §4 State column) | old `sheets/README.md:19`, `:30-34` |
| 6 | Major | ACCEPT | Every new cross-package file gets its export-map entry and `jini.entries` in the same commit, with an import check (README §4.9; entry table in DESIGN §3). Link procedure with the repo's `link:jini`; REL nodes in INDEX §3 | T `package.json:135-156` (`^0.7.0`), `:102` (`link:jini`); J `core/package.json` (283 concrete entries) |
| 7 | Major | ACCEPT | `publishTool` returns the wire name; `call` is the wire name for direct tools; tests with a dotted id, an over-long id and a reserved-name collision; S4b's wire test looks up wire names (`S3`, `S4b`, DESIGN §2.2, M2) | J `core/src/tool-exposure.ts:26-45`; J `mcp/src/server/tool-server.ts:260-270` |
| 8 | Major | ACCEPT | §2.3 and M3 rewritten: the example is a correctly classified write; S5 is now a wording gate plus the unchecked `approval.class`; it never relabels to read-only (`S5`, DESIGN §2.3, M3) | T `tool-metadata/external-mcp.ts:17-18`; T `operations-tools.ts:33-44`; J `core/src/registration-kit.ts:428-440,533` |
| 9 | Major | ACCEPT | Old S7 removed. The daemon redaction is an injected secrets-only port in Tovu; pinned by a Tovu characterization. Each redactor is tested in its own package; the cross-package check is a Tovu integration test (Jini has no `integration-tests` package at merge-a) (`S6`, `S7`, DESIGN §2.4) | J `daemon/src/tool-recovery/redaction.ts:171,206-214`; T `tool-recovery-preset.ts:19,74`; T `packages/contracts/src/secret-redaction.ts:30-46` |
| 10 | Major | ACCEPT | Vocabulary is applied at the client's first format of a daemon error; S8 comes first and carries `details`; the route sends `details.toolId` / `inputNames` from the registered descriptor (new S7); gateway calls and never-described tools are separate test cases; `diagnosticToolIds` is not widened (`S6`, `S7`, DESIGN M4) | J `tools/delegated-tool.ts:179-199,223`; J `daemon-client.ts:244`; J `tool-protocol.ts:329-331` |
| 11 | Major | ACCEPT | S12 split. S12a: clamp in one core function, called by `normalizeToolInput` and, by opt-in, MCP-local tools (their other texts unchanged); one note for a clamped string. S12b: `obtainFrom` on the typed path (mcp) and the gateway path (daemon route) through one function (`S12a`, `S12b`, DESIGN M7) | J `tool-protocol.ts:261-263`; J `tool-catalog-tools.ts:112`; J `tool-arguments.ts:72-78,139-140`; J `core/src/registration-kit.ts:185-190`; J `core/src/tool-registry.ts:394` |
| 12 | Major | ACCEPT | S14 split. S14a defines work deadline `T − R`, fallback window and hard stop `T` in `renderPage`, adds a clock port first, tests the simultaneous boundary and that a cancel never starts a fallback. S14b adopts it under the outer race (`S14a`, `S14b`, DESIGN §2.8, M8) | T `playwright-page-capture.ts:165-175`; J `render-page.ts:294-295,311-313`; J `page-work-budget.ts` (`Date.now`, `setTimeout`) |
| 13 | Major | ACCEPT | OD-6 corrected; OD-10 added. S15 pins the 120 s window, late confirmation and cancel with characterization tests that must pass unchanged after the pump (`S15`, DESIGN §2.9, M9, INDEX §4) | J `core/src/approval.ts:14`; J `daemon/src/tool-executor.ts:403-411` |
| 14 | Major | ACCEPT | S16 split. S16a commits a support matrix with explicit rows for Claude, Codex, OpenCode, Gemini (retired; Antigravity measured) and Aider (no tool transport), plus a test tying the matrix to the defs. S16b schedules the Tovu binding inside the sheet. OD-11 added (`S16a`, `S16b`) | J `agent-runtime/src/defs/aider.ts:8,80-86`; J `defs/__tests__/gemini.test.ts:5-10`; J `defs/claude.ts:301`, `codex.ts:447`, `opencode.ts:101`, `antigravity/index.ts:363` |
| 15 | Major | ACCEPT | S17 changes the registered default and the fallback together and tests through `readAssistantRuntimePreferences` over a fresh settings repository, plus stored `true` and `false` (`S17`, DESIGN §2.10) | T `features/settings/admin-interface.ts:81`; T `assistant/runtime-preferences.ts:25` |
| 16 | Major | ACCEPT | One lease created in `agent-daemon-server.ts` beside `idlePark`, injected into every scope; release on six named endings through two idempotent release points; two-scope test (`S17`, DESIGN M10) | T `agent-daemon-server.ts:194-201`; T `agent-daemon-scope.ts:674-678` (the `idlePark.hold` / `waitForTerminal` pattern), `:1159-1162` |
| 17 | Major | ACCEPT | Landing edges added: S11, S13 and the theme part of S4b before T-TH-05 / T-TH-08, with a path check and a blob report in each sheet; S4b and S13 check every swept file against lane inventories (`S4b`, `S11`, `S13`, INDEX §3) | `plan/lanes-k-t-2026-11-16` `T-TH-theme.md` (T-TH-05, T-TH-08), `T-TH-08.files.tsv` rows 2-4, `T-TH-05.files.tsv` row 2 |
| 18 | Major | ACCEPT | The lint reads text by provenance (registry, MCP-local tools, a committed list of guide modules); a report-only candidate pass feeds a hand classification; negative fixtures for SQL, templates, identifiers, schema syntax; S4b never edits application code to please the lint (`S4a`, `S4b`, DESIGN M2) | T `platform/db/migrations/0003_coercion_json_as_json.ts` (3 `json_*(` calls); T `platform/db/sqlite/fresh-content-db.ts` |
| 19 | Major | ACCEPT | S8 threads one `reportFailure` port through all five layers and tests the assembled host; the reporter is core's `createErrorReporter` built in `bin/serve.ts`. S9 names the real sink (`reportServerFailure`) instead of a non-existent `onInternalError` on the route deps (`S8`, `S9`) | J `tool-protocol.ts:102-108`; J `tool-server.ts:154-157`; J `run-tool-host.ts:58-70`; J `core/src/errors/reporter.ts:219`; T `agent-daemon-scope.ts:1492-1511` |
| 20 | Minor | ACCEPT | One graph, one wave table and one shared-file order table replace the contradictory lists. Fit accounting corrected: the 64 limit counts exposed registry descriptors, not local tools (`INDEX §3`, `S4a` `pinnedFit`, DESIGN §2.2, M2) | old `INDEX.md:83,88-90`; J `core/src/tool-exposure.ts:161-163` |

Counts re-run for this revision: sheets 22 (`ls sheets/S*.md | wc -l`); files in the drift table 49
(`tail -n +2 sheets/BLOBS.tsv | wc -l`), none missing at merge-a; cited paths missing on merge-b: 1 of the 18
checked (`core/src/errors/reporter.ts`). The judge's "unverified" list (CLI timeouts, Node header wait, registry
counts, pin fit) is still unverified here and is measured by S15, S16a and S4a before anything depends on it.

## Revision 3 - Opus review response

Review: the Opus 5.5 review of revision 2 ("READY WITH FIXES", B1-B10 plus one signature note). Every item was checked
in the code at merge-final (Jini `65d73b0d`, Tovu `a28cb1bf`) before deciding. **12 accepted (B8 with a different
fix), 1 partly rebutted (two sub-points of B2), 3 new findings fixed.** J = Jini `packages/…`, T = Tovu.

| # | Sev. | Verdict | What changed (file) | Evidence |
|---|---|---|---|---|
| B1 | Major | ACCEPT | S17 change 4 no longer runs `npm run check:tool-guides`. It checks the one tool id its sentence names is registered and asserts the exact sentence; S4a (wave 3) scans the file when it lands (`S17`) | T `package.json` scripts at merge-final have `check:size`/`check:complexity` (`:65-66`) and no `check:tool-guides`; S4a "What is scanned" row C lists `assistant-runtime-guidance.ts` (`S4a:18`); T `contracts/core/tool-metadata/web-screenshot.ts:8` |
| B2 | Major | ACCEPT in part, REBUT in part | Scope-file order is now `S17 → S2a → S4b → S9 → S16b` (waves 1, 2, 4, 4, 7). Added rows: `tool-target.ts` (S1 → S2a), `delegated-tool.ts` (S2b only), `core/package.json` export lines (INDEX §3). **Rebutted:** S7 does not edit `mcp/src/server/daemon-client.ts`, and S15 does not edit `delegated-tool.ts` | S7 Change (`S7:36-37`) edits only `daemon/src/http/delegated-tool-error-details.ts` (new) and `delegated-tools.ts`; its `daemon-client.ts` mention is a landed check (`S7:5`). S15 names `delegated-tool.ts` only in a read-only `rg` (`S15:18`); its Change section (`S15:49-`) has no edit there |
| B3 | Medium | ACCEPT | Every sheet header now has `Blocking decision:` (none, or the OD) and, where relevant, `Branching decision:` with the branch to run while `OPEN`. README block 4.10 greps only the blocking line. Blocking: S1 OD-1, S2b OD-2, S12a and S13 OD-8, S16b OD-6. Branching: S4b OD-7 (STOP only if S4a found no fit), S6 OD-3, S13 OD-9, S14b OD-5, S16a OD-11, S17 OD-4 (`sheets/README.md` §4, all 22 sheets, INDEX §2) | INDEX §4: all 11 decisions `OPEN`; S6/S14b/S17 headers said "run without it" / "no = cap stays 20 s" / "built either way" |
| B4 | Medium | ACCEPT | S9 no longer calls `reportRouteInternalError`. The boundary takes `mintErrorId` (bound to Tovu's wrapper over core `mintToolErrorId`) and `onInternalError` (bound to `reportServerFailure(…, { errorId })`), and puts the same `ERR-…` id in `requestId`. S8 labels its id `Error ID:` (was `Reference:`), the label the nested-envelope form already uses. One format, one label (`S8`, `S9`, DESIGN M5, INDEX §1) | J `http-kit/src/internal-error.ts:1,38` (`randomUUID()`, no id port); J `core/src/errors/error-id.ts` (`mintToolErrorId` → `ERR-XXXX-XXXX-XXXX-XXXX`, the format `createErrorReporter` uses); T `assistant/tool-recovery-preset.ts:71-73` (already imported by the scope file); T `server/inbound/shared/admin-failure.ts:52-55` (`errorId` option) |
| B5 | Medium | ACCEPT | README block 4.16: eslint with `max-lines-per-function` 50, `complexity` 10, `sonarjs/cognitive-complexity` 10, `max-lines` 500 on changed `.ts`/`.tsx` source files, JSON formatter, compared with the same file at `BASE`; part of the §3 gate. Copied from the xpkg `COMMON.md` S8 model | J `scripts/check-size.mjs:15` (ratchet fails at 80); J `eslint.config.mjs:45` (sonarjs for every file); T `eslint.config.mjs:55` (sonarjs for `*.ts`/`*.tsx` only, hence the filter); both repos `eslint` `^10.8.0` |
| Fences | Medium | ACCEPT | README §4's table holds no commands; every command is in a fenced block that uses plain pipes for alternation (blocks 4.2 to 4.17). 4.5 also catches `biome-ignore` (Tovu lints with biome). New block 4.17 (empty catch, empty body). Each new pattern was run on a sample diff with the expected hits | the only escaped pipes in the plan were README §4 rows 4.3-4.8, 4.10 and 4.15; block 4.10 keeps escaped pipes on purpose, to match the INDEX table's literal pipes, and says so. All 97 inline `rg` lines in the sheets were run against merge-final (`git grep -P`): one wrong pattern (N1); the other zero-hit lines are landed checks for files not yet created or inventories with no consumers in that repo |
| B6 | Low | ACCEPT | S8 case 6: the private sentence and token are random strings over `qxzjvkwy`; the assertion covers those, not markup | S8 fixed sentences contain "the tool", " service", "readable" |
| B7 | Low | ACCEPT | S8 change 4 names `reportError() {}` as the one allowed hit of block 4.17; the stderr logger still writes every record | S8 change 4 |
| B8 | Low | ACCEPT, different fix | S15 change 3 does not need undici: a fetch-shaped `node:http` adapter for the loopback URL (≤ 80 lines, no dependency), the `pinnedFetch` pattern; STOP only if it needs more. Estimate +30k when built | J `mcp/package.json` dependencies (no `undici`); J `agent-runtime/src/providers/connection-guard.ts:214` (global fetch: undici `headersTimeout` 300 000 ms), `:229` (`node:undici` does not exist) |
| B9 | Low | ACCEPT | S8 prerequisites S3, S15 and S12a prerequisites S3, S6 (shared files only), each with landed checks (`S8`, `S12a`, INDEX §2) | INDEX §3 shared-file order (`tool-protocol.ts`, `tool-server.ts`, `serve.ts`, `tool-catalog-tools.ts`) |
| B10 | Low | ACCEPT | Base pinned to merge-final with `merge-base --is-ancestor` checks (README §1.1); `BLOBS.tsv` regenerated there: 2 of 49 blobs changed. Stale facts fixed: `tool-server.ts` 409 → 438 and its call handler moved into `createCallToolHandler` (S3, S15 change 2: wrap the top-level await only, not the nested `callLocalTool` one); `approval.ts` 373 → 400 (S10, DESIGN §3) | J `git diff --stat dde69a6d 65d73b0d` on the two files; every other BLOBS row identical; Tovu `merge-base --is-ancestor a28cb1bf` the merge-final tip (`232764af`) holds |
| S10 sig. | Low | ACCEPT | `createChainedBatchHandler(required, optional: {…} = {})` | owner rule `(required, optional = {})` |
| N1 | new | FIXED | S16b: `RuntimeAgentDef` is a core type; read-first `rg` and change 1 point at J `core/src/contracts/agents/definition.ts`; S16b's repos list `core` | J `core/src/contracts/agents/definition.ts:338` (`export type RuntimeAgentDef`); revision 2's `rg -n "interface RuntimeAgentDef" packages/agent-runtime/src` has 0 hits |
| N2 | new | FIXED | S1 and S10 (both wave 1) each add a `core/package.json` export entry. The wave rule now names manifest export lines as the one shared-file exception, with a rebase rule (INDEX §3) | S1 change 2 (`./tool-call-text`), S10 change 1 (`./approval-batch-chain`) |
| N3 | new | FIXED | Wave 4: S4b's Jini text part runs after S6 and S2b if it edits one of their files (INDEX §3) | S4b edits "the Jini texts S4a listed", a set unknown until S4a runs |

Not executed in revision 3: no command block was run against a real checkout (only the regex patterns, on sample
input, and the `rg` lines through `git grep`). Owner decisions OD-1..OD-11 are still `OPEN`; with B3 fixed, the sheets
safe to start now are S5, S10, S14a, S15, S17 (lease part) in wave 1, and S1 once OD-1 is decided.

## Housekeeping 2026-11-17 (plan-edit run; no product code)
Every sheet's symbol / landed / STOP command and every fenced block of `sheets/README.md` was run on real checkouts of
`origin/refactor/terra` (Jini 65d73b0d5, Tovu 232764af5, side by side as `Jini` and `Tovu`): 115 commands extracted from the
22 sheets, each run in the Jini root, Jini `packages/` and the Tovu root; blocks 4.3-4.8, 4.15-4.17 also run against a
throwaway local Jini commit with planted violations (lazy import, `vi.mock`, `eslint-disable`, `export *`, `.skip`, empty
catch, 64-line function): every block printed its violation. Block 4.10 printed `STOP` for each OPEN blocking decision
(S1, S12a, S13, S16b, S2b) and nothing once a copy of this INDEX marked OD-1 `DECIDED: yes`.
| # | Where | Defect | Fix |
|---|---|---|---|
| H1 | README §1.4 drift check | read `tool-call-fixes/sheets/BLOBS.tsv` relative to the current directory; from a Tovu or Jini checkout the file is absent, `tail` fails on stderr and the loop prints nothing = pass (fail open, reproduced on Tovu 232764af5) | `PLAN` + `ROOT` variables, `test -s` STOP line, `MISSING` vs `DRIFT` lines |
| H2 | README §1.1, `BLOBS.tsv` | pinned to Tovu `a28cb1bf` / merge-final blobs | re-pinned to refactor/terra; 1 of 49 blobs changed: Tovu `agent-daemon-scope.ts` (497d4dde -> 1a21e6ef: `executorDefinitionPolicies` spread replaces two inline options, lines after :85 shift by +1, after :531 by -1; every sheet symbol line for it still matches). DESIGN line cites of that file are off by one; symbols, not lines, are the contract |
| H3 | README §4.11 (landed checks) | pass = "prints at least one line"; an `rg` on a not-yet-created file prints an error line (exit 2), which reads as a line | pass = exit 0 per command (new block 4.11, `; echo "rc=$?"`); run-directory rule stated |
| H4 | S7 landed check | one `rg` over two files passed when either matched | two commands, each must exit 0 |
| H5 | S5 acceptance | `rg -n "sideEffects" $(git diff --name-only ...)` listed unchanged lines and, on an empty diff, searched the whole tree (723 lines on Tovu terra: fires wrongly) | the `-U0` diff piped into an `rg` for added or removed `sideEffects` lines must print nothing (exact command in S5, outside any table) |
| H6 | S9 acceptance | `rg -n randomUUID <new file>` printed nothing when the file was missing or misnamed (fail open) | `test -f` + `! rg -q` + `echo ok` |
| H7 | README block 4.16 | printed every eslint rule's message (a repo rule such as `sonarjs/no-inconsistent-returns` showed up as a limit finding: fires wrongly) | `msgs` keeps only the four limit rules; re-run on the planted 64-line function: still printed |
Commands that legitimately fail on refactor/terra (not defects): every landed check of a sheet whose prerequisite has not
merged (S2a, S2b, S3, S4a, S4b, S6, S7, S8, S9, S11, S12a, S12b, S13, S14b, S16a, S16b). The landed checks that the DONE
sheets satisfy were checked on their branches: S11's `createChainedBatchHandler` (wave1/tc-S10), S14b's `softDeadlineMs`
(wave1/tc-S14a), S16a/S8's `startCallProgress` (wave1/tc-S15) all match, so S11, S14b, S16a release once those branches merge.
