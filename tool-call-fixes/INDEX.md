# Tool-call structural fixes: index (2026-11-17, revision 2)

Status: **COMPLETE, revision 2** (design and plan only; no source file edited, nothing built, no test run).
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
  reporter S8 binds to. S9 reports through the existing `reportRouteInternalError` and `reportServerFailure`; E4
  converts both to the reporter with its other call sites, so S9 needs no second edit. Its site list has no row for
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
decisions; a sheet does not start until each has landed or is `DECIDED` (README §4.10, §4.11).

| Sheet | What | Repo | Needs | Red-first test must fail because | Est. |
|---|---|---|---|---|---:|
| S1 | `404 UNKNOWN_TOOL`, one target decision | Jini, Tovu tests | OD-1 | status is 403 / 400 and the text differs | 190k |
| S2a | Family answered as a group; product name leaves Jini | Jini, Tovu | S1 | no port; guard finds `content_read` in Jini | 150k |
| S2b | MCP gateway retries a family call once as its member | Jini, Tovu test | S2a, S8, OD-2 | one request, error result | 140k |
| S3 | `describe_tool` says `callAs` and the exact wire-name call | Jini | S1 | skipped promotion is silent; id is not the wire name | 170k |
| S4a | `check:tool-guides` report over model-facing text + inventory | Tovu | S3 | scanner tests (new code), SQL negatives | 200k |
| S4b | Fix mentions, pin named tools, strict lint | Tovu (+ Jini texts) | S4a; OD-7 if no fit | strict lint fails; order test fails | 220k |
| S5 | Read-wording gate; `approval.class` check | Tovu | none | a write tool's description starts with "Reads" | 100k |
| S6 | Trusted vocabulary before the first lossy pass | Jini | S8; OD-3 for source 4 | output shows `[redacted]` for names | 200k |
| S7 | Route sends `details.toolId` / `inputNames` | Jini, Tovu tests | S1, S6 | envelope has no `details` | 130k |
| S8 | Client never prints a status alone or an unrecognized body; reporter wired | Jini | E2 in base (merge-a) | four responses give a bare status | 190k |
| S9 | Terminal JSON error answer; flat answers become envelopes | Tovu | S8 | bodies are HTML or flat | 150k |
| S10 | Chained batch handler in core | Jini | none | no such function; item 2 refuses | 160k |
| S11 | Theme tools adopt it; wording | Tovu | S10; before T-TH-05 / T-TH-08 | "changed during review" on the second edit | 150k |
| S12a | `clamp` in the normalizer and for MCP-local tools | Jini | OD-8 | 8300 refused | 160k |
| S12b | `obtainFrom` on the typed and the gateway path | Jini | S12a, S1 | no pointer to the listing tool | 150k |
| S13 | Tovu schemas declare repairs; bounds gate | Tovu | S12b, S4a, OD-8, OD-9; before T-TH-08 | alias refused; nothing declares `clamp` | 150k |
| S14a | Clock seam; work deadline, reserve, hard stop in `renderPage` | Jini | none | no fallback when the wait uses the budget | 170k |
| S14b | Tovu computes the budget; current frame after load | Tovu | S14a, OD-5 | no image when the wait uses the budget | 150k |
| S15 | Progress pump; long-wait fetch; approval window pinned | Jini | none | zero notifications in 120 s; headers wait fails | 200k |
| S16a | Probe each CLI; commit the support matrix | Jini | S15; OD-11 for the two unsupported rows | matrix test (new) | 150k |
| S16b | Timeouts as adapter data; Tovu binding | Jini, Tovu | S16a, lane K, OD-6 | config has no timeout key (measured CLIs only) | 170k |
| S17 | One lease per daemon; default | Jini, Tovu | OD-4 for the default part only | two site scopes both get the integration | 170k |

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

Waves (sheets in one wave touch no common file; a wave starts when the one before it has merged):

| Wave | Sheets |
|---|---|
| 1 | S1, S5, S10, S14a, S15, S17 |
| 2 | S2a, S3, S11, S14b, S16a |
| 3 | S8, S4a |
| 4 | S6, S2b, S4b, then S9 (S4b and S9 both edit Tovu's scope file: S4b first) |
| 5 | S7, S12a |
| 6 | S12b |
| 7 | S13, S16b |

Shared files and their one order (a later sheet rebases on the earlier one; no parallel edits):

| File | Order |
|---|---|
| Jini `mcp/src/server/tool-protocol.ts` | S1 → S3 → S8 → S6 → S12a |
| Jini `mcp/src/server/tool-server.ts` | S15 → S3 → S8 (S15 and S3 touch different functions; S3 rebases) |
| Jini `mcp/src/server/daemon-client.ts` | S8 → S6 |
| Jini `mcp/src/bin/serve.ts` | S15 → S8 |
| Jini `mcp/src/server/tools/tool-catalog-tools.ts` | S3 → S12a |
| Jini `daemon/src/http/delegated-tools.ts` | S1 → S2a → S7 → S12b (if R7 moved it: same order at the new path) |
| Jini `core/src/tool-call-text.ts` | S1 → S3 |
| Jini `core/src/tool-input-repairs.ts` | S12a → S12b |
| Jini `core/src/contracts/server/api-error.ts` | S1 adds one row; error-system E5a changes how the table is read; the second rebases |
| Tovu `agent-daemon-scope.ts` (reconcile SEQUENCE H3) | S2a → S4b → S9 → S17 → S16b, one at a time, and after R7 P1 if that is in flight |
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

## Opus fixes - remaining

The Opus review of revision 2 is not applied to this plan yet: the run that applied it to the xpkg sheets (`plan/xpkg-lane-sheets-2026-11-16` @ `78fa7ef3`) stopped at its context limit before starting here. Every item below is still open:
- **S17 vs S4a (B1, Major):** S17 (wave 1) change 4 requires `npm run check:tool-guides`, but S4a creates it in wave 3. Verified: Tovu merge-final `package.json` has no `check:tool-guides`. Remove that line from S17, or move S17's guidance edit after S4a.
- **Shared-file order vs waves (B2, Major):** the `agent-daemon-scope.ts` order `S2a → S4b → S9 → S17 → S16b` contradicts S17 in wave 1. Rewrite it as `S17 → S2a → S4b → S9 → S16b`, or move S17. Also add `mcp/src/server/daemon-client.ts` S8 → S6 → **S7** and `mcp/src/server/tools/delegated-tool.ts` S15 → S2b to the table.
- **README §4.10 (B3):** split each sheet header into "Blocking decision" and "Branching decision" (S6 OD-3, S17 OD-4, S14b OD-5, S4b OD-7 are branching), and grep only the blocking ones.
- **One error-id format (B4):** S8 uses core `mintToolErrorId` (`ERR-…`), while S9's `reportRouteInternalError` mints `randomUUID()` (`http-kit/src/internal-error.ts:38`). Pick one format matching core `createErrorReporter` (`core/src/errors/reporter.ts:219`) / `errors/error-id`, or write the temporary split into S9's acceptance with E4 as the owner.
- **README §4 STOP table:** move every command out of the table cells into fenced blocks. Also check each `grep -E` pattern that uses `\|`: inside a code block it must be a plain `|`.
- **50/10 enforcing command (B5):** copy xpkg `COMMON.md` S8 (eslint `max-lines-per-function` 50, `complexity` 10, `sonarjs/cognitive-complexity` 10, `max-lines` 500 on changed source files, diffed against `BASE`; eslint 10 has no `unix` formatter, so it uses the JSON formatter). Both repos load the sonarjs plugin (Jini `eslint.config.mjs:45`, Tovu `:55`).
- Lows (cheap): B6 (random non-dictionary alphabet in S8's canary sentence), B7 (name S8's no-op tracker as the one allowed empty body), B8 (S15 undici step likely to STOP: say so in the estimate), B9 (landed checks for S12a and S8), B10 (re-pin the base to merge-final, Jini `65d73b0d` / Tovu `a28cb1bf`; regenerate BLOBS.tsv on it), S10 `optional = {}` signature.
- Then add a `## Revision 3 - Opus review response` table (item, ACCEPT/REBUT, change, evidence).
