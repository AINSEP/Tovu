# AG-UI everywhere (hard item #7) — INDEX

Date: 2026-11-16. Status: **COMPLETE design, revision 2, not executed.** Docs only; no source file changed, no test run.
Branch: `plan/ag-ui-design-2026-11-16` (from `plan/terra-2026-11-15`).

| File | What it holds |
|---|---|
| `DESIGN.md` | Current state (verified), target shape, event mapping, interrupts, frontend tools, streaming lifecycle, security trace, shared-state answer, migration commits, estimate, practice check, not-verified list, **Judge response** |
| `CODEX-JUDGE.md` | The adversarial review of revision 1 (Codex gpt-6.1-sol HIGH): 3 blockers, 8 majors, 2 minors |
| `INDEX.md` | This file: summary, order, prerequisites, owner decisions, risks |

Bases: Tovu `integ/wave-b-r2` @ `65302ee5`, Jini `integ/wave-b-r2` @ `02edbb68`, `@ag-ui/*` 0.0.58 (npm latest core is 1.0.4).

## 0. Revision 2 in one screen

- **Judge findings: 13 accepted, 0 rebutted.** Each was checked in the code first (DESIGN "Judge response" has the file:line evidence). Blockers left: **0**.
- **Admin confirmations do not become interrupts in S0–S5.** Revision 1 designed against an event no driver produces. The real owner is the server's chat-card exchange (`applyToolApprovalPolicy` + the daemon's surface-exchange store, answered on the MCP-UI tool-calls route). It stays the one mechanism; the interrupt rendering for admin moves to S6 (OD-10).
- **A refused page-tool call has no executable form on the wire.** A claimed tool name appears in `TOOL_CALL_*` only from the registry's `deliver`, after the gate. The model's own call record rides as a display record. Nothing is paired by tool name or order.
- **Cancellation still beats the effect.** The browser asks `begin` right before an effect; the server says no once it cancelled or timed out.
- **Two lifetimes.** The response and the logical run are separate, with an ordered handoff at park and at resume, a `stop` route for a paused run, and seven named endings. An expired confirmation stays a denial of one tool.
- **Quotas.** Authorization identity (`ownerKey`) and quota identities (`ip:`, `guest:`, global) are separate and admitted atomically.
- **S1 is no longer "byte-identical".** It is Jini moves, then four separate behaviour steps (each with its golden diff), then Tovu deletions, with every importer listed.

## 1. Summary

- **Five facts differ from the brief** (DESIGN §1.1). The two that matter most: the admin chat uses AG-UI only behind a per-browser canary switch, and the site chat has no daemon run (it is one in-process provider turn per request).
- **What moves to Jini** (`packages/chat/src/core/ag-ui/`, 13 files, none over 250 lines): request parsing, the daemon-frame run handle, the run stream and its three routes, pause records with quotas, interrupt mapping, the frontend-tool projection (from `agentic`, in S4), the client run transport, a frontend-tool runner, and a light client for the embed widget.
- **What is deleted:** two of three duplicate wire reducers, Tovu's frame parsers, three forwarders and two type re-exports, Jini's `ag-ui/entry.ts`; after the site cutover also the site's hand-written SSE client, `/chat`, `/confirm`, and the browser-facing frontend-session stream and response routes.
- **What stays in Tovu:** route paths, authentication and admission, the daemon HTTP client, the site's provider turn and visitor policy, its confirmation copy and store, the admin approval policy and card-exchange route, its event names, tracker spans.
- **Event mapping decisions:** site confirmations → AG-UI interrupts; admin confirmations → unchanged card exchange; page tools → `TOOL_CALL_*` + a `frontend_tool` interrupt emitted only after `ToolExecutor`'s gate; A2UI, MCP-UI and frontend-tool display records → `ACTIVITY_SNAPSHOT`; usage and status stay `CUSTOM`; `isError`/`media`/`outcome` and tool correlation ride as extra fields.
- **Shared state:** no for now (DESIGN §9).

## 2. Stages, order, prerequisites

Stages changed by revision 2 are marked **(changed)**.

| Stage | What | Needs first | Behaviour change on the wire |
|---|---|---|---|
| S0 **(changed)** | Six characterization goldens; fixtures now include frame-level cases, populated optional fields, expiry and capacity endings | nothing | none |
| S1 **(changed)** | Jini moves (A1–A4), behaviour steps B1–B4, Tovu moves and deletions (C1–C2); complete importer map | S0; OD-2 (decided); **OD-9** for step B3 | B1: `tool_input_delta` leaves the wire, MCP-UI cards gain recovery identity. B3: four frame-level changes. B4: tool correlation and result extras |
| S2 **(changed)** | Routes as `ServerRoute[]` (run, `begin`, `stop`) on `createSseStream`; pause store with quotas; contracts before implementations | S1, **P-NODE-BRIDGE** (not landed), C4 (landed), C-ORIGIN-PORT | keepalive comment frames, `outcome` on `RUN_FINISHED` |
| S3 **(changed)** | Interrupt mapping and client support, proven on a reference test host. No admin confirmation mapping. | S2; OD-1 (decided) | none in production |
| S4 **(changed)** | Frontend tools over AG-UI, admin canary: `attachRun`, server-held relay, display records, `begin`; the `agentic` projection moves here | S3, **R7 frontend-sessions group**, **OD-11** | bind token leaves the browser on this path |
| S5 **(changed)** | Site chat cutover: preflight split, site run source with its own lifetime, new routes, light client, widgets rebound; then delete the old routes | S4; OD-4 (decided); **OD-7**; visitor page tools plan P0 should land first | site wire becomes AG-UI; site confirmations become interrupts |
| S6 **(changed)** | Admin default paths (durable Local CLI, BYOK) **and** admin card exchange as interrupts | S5, **its own design**, OD-10 | reattach and replay over AG-UI |
| S7 | Shared state | a real user, S6 | not planned |

Untangle lanes this work must follow, not race: **R7** (daemon `src/http` → `ServerRoute[]`), **R4** (chat package edges), **C10** (surfaces port), **P-NODE-BRIDGE**. S0 and S1 need none of them.

## 3. Estimate (revision 2)

S0–S5: about **0.285M Opus + 2.85M Sonnet** (revision 1: 0.25M + 2.6M; per-stage table with reasons in DESIGN §11). S6: about 0.14M Opus design + 1.4M–2.0M Sonnet. S7: 0.06M + 0.45M only if wanted.

## 4. Owner decisions

| # | Decision | State | Recommendation / what was applied |
|---|---|---|---|
| OD-1 | A paused run may outlive its HTTP response, with caps and deadlines | **Resolved: yes** | Applied in DESIGN §7.4–§7.5 |
| OD-2 | Which payload reducer wins | **Resolved: the canonical `run-events` reducer** | Applied as S1 steps B1–B2. It covers payloads only; frames are OD-9 |
| OD-3 | Carry `isError`, `media`, `outcome` as extra fields on `TOOL_CALL_RESULT` | Open | Yes (S1 step B4, together with tool correlation fields). If no: admin on AG-UI keeps losing tool-error state and tool images |
| OD-4 | Site widget client | **Resolved: Jini light client for the public widget; official `@ag-ui/client` stays in admin** | Applied in S5.4 |
| OD-5 | Admin page-approval dialog becomes a `ToolExecutor` confirmation | **Withdrawn** | The code already has one server-side approval owner; the browser dialog option is not wired any more (DESIGN §6.7) |
| OD-6 | A2UI and MCP-UI ride as `ACTIVITY_SNAPSHOT` instead of `CUSTOM` | Open | Yes. If no: `CUSTOM` with Jini default names |
| OD-7 | Keep the old site routes for one release behind a build flag | Open | Yes. If no: delete in the same release; rollback is a revert |
| OD-8 | Shared state now | Open | No |
| **OD-9** (new) | Frame-level canary changes when Tovu's four frame handlers are replaced by the canonical `translateRunFrame`: echo lines dropped and heartbeat statuses added; stderr shown; a status before `RUN_ERROR`; failed/cancelled `end` no longer reported as success | Open | Yes (it follows the spirit of OD-2 and fixes a real fault: a failed run reads as finished today). If no: the four handlers stay in Tovu as host code and the Jini source takes a frame-translation port |
| **OD-10** (new) | Admin confirmations: keep the card exchange as the only mechanism through S5 and design its interrupt rendering in S6 | Open | Yes. If no: add an "awaiting an answer" marker to exchange emissions in the daemon and map awaiting cards to interrupts in S3 (about +0.3M Sonnet, touches a mechanism with ten integration test files) |
| **OD-11** (new) | Two Jini-owned routes beside the AG-UI run route, outside the AG-UI standard: `begin` (cancel-before-effect) and `stop` (cancel a paused run) | Open | Yes. If no: the per-tab frontend-session stream must stay for `cancelled` frames, and the bind token stays in the browser |

Left for the owner: **OD-3, OD-6, OD-7, OD-8, OD-9, OD-10, OD-11** (seven; three are new).

## 5. Riskiest three calls

1. **Run outlives response** (OD-1, decided). A public endpoint will hold parked provider turns. Mitigation: independent per-IP, per-guest and global counts admitted atomically; an abandon deadline; one disposal path; tests on both sides of the park handoff and for Stop (DESIGN §7.4, §7.5).
2. **Execution licensed only after the gate** (FT-1 to FT-4). Getting the emit point wrong is an authorization bypass in the browser. Mitigation: a claimed name appears only from `deliver`; a denying-policy test with a client fake that executes on `TOOL_CALL_END`; `begin` before every effect. Stock-client behaviour is unverified and no compatibility is claimed.
3. **Deleting two reducers and changing frame handling** in code with 100+ existing tests. Mitigation: S0 goldens that can fail on each named difference, one behaviour step per commit with its diff, test counts recorded before and after, admin canary before the site, old site route kept until OD-7's window ends.

## 6. Not verified (full list in DESIGN §13)

Whether extra event fields survive the official client's pipeline; stock AG-UI client behaviour and any documented reason/activity vocabulary; `HttpAgent.connect`; AG-UI 1.x; the node bridge's handling of the `connection` header; daemon event-log retention (needed for S4's admin resume); bundle sizes; importers of four AG-UI types through `./transports/http` outside the two repos; test counts are `grep` counts and no test was executed. The LESSONS file has 11 rules at `b62acb7e`, not the 19 the brief names; all 11 were applied.
