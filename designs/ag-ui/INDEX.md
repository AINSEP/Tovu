# AG-UI everywhere (hard item #7) — INDEX

Date: 2026-11-16. Status: **COMPLETE design, not executed.** Docs only; no source file changed, no test run.
Branch: `plan/ag-ui-design-2026-11-16` (from `plan/terra-2026-11-15`).

| File | What it holds |
|---|---|
| `DESIGN.md` | Current state (verified), target shape, event mapping, interrupts, frontend tools, streaming lifecycle, security trace, shared-state answer, migration commits, estimate, practice check, not-verified list |
| `INDEX.md` | This file: summary, order, prerequisites, owner decisions, risks |

Bases: Tovu `integ/wave-b-r2` @ `65302ee5`, Jini `integ/wave-b-r2` @ `02edbb68`, `@ag-ui/*` 0.0.58 (npm latest core is 1.0.4).

## 1. Summary

- **Five facts differ from the brief** (DESIGN §1.1). The two that matter most: the admin chat uses AG-UI only behind a per-browser canary switch, and the site chat has no daemon run (it is one in-process provider turn per request).
- **What moves to Jini** (`packages/chat/src/core/ag-ui/`, 13 files, none over 250 lines): request parsing, the daemon-frame source, the run stream and its route, pause records, interrupt mapping, the frontend-tool projection (from `agentic`), the client run transport, a frontend-tool runner, and a light client for the embed widget.
- **What is deleted:** two of three duplicate wire reducers, Tovu's frame parsers, three forwarders and a type re-export, Jini's `ag-ui/entry.ts`; after the site cutover also the site's hand-written SSE client, `/chat`, `/confirm`, and the browser-facing frontend-session stream and response routes.
- **What stays in Tovu:** route paths, authentication, the daemon HTTP client, the site's provider turn and visitor policy, its confirmation copy and store, its event names (`tovu.usage`, `tovu.status`, `tovu.ext.`), tracker spans.
- **Event mapping decisions:** confirmations → AG-UI interrupts (`RUN_FINISHED.outcome` + `resume[]`); page tools → `TOOL_CALL_*` + a `frontend_tool` interrupt emitted only after `ToolExecutor`'s gate; A2UI and MCP-UI → `ACTIVITY_SNAPSHOT`; usage and status stay `CUSTOM`; `isError`/`media` ride as extra fields on `TOOL_CALL_RESULT`.
- **Shared state:** no for now (DESIGN §9).

## 2. Stages, order, prerequisites

| Stage | What | Needs first | Behaviour change on the wire |
|---|---|---|---|
| S0 | Six characterization goldens (event-stream round trips, reducer drift, cancel windows, site stream) | nothing | none |
| S1 | Consolidate in Jini: split `entry.ts`, one reducer, move parsing and frame source, move `agentic` projection; Tovu file shrinks | S0, **OD-2** | none (byte-identical golden) |
| S2 | Route as `ServerRoute` on `createSseStream`; pause store; `drained()` in core SSE | S1, **P-NODE-BRIDGE** (not landed), C4 (landed), C-ORIGIN-PORT | keepalive comment frames, `outcome` on `RUN_FINISHED` |
| S3 | Confirmations as interrupts, admin canary | S2, **OD-1** | confirmation leaves `CUSTOM` |
| S4 | Frontend tools over AG-UI, admin canary; `attachRun` on the daemon facade; server-held relay | S3, **R7 frontend-sessions group**, **OD-5** | bind token leaves the browser on this path |
| S5 | Site chat cutover: site run source, new route, light client, widgets rebound; then delete the old routes | S4, **OD-4**, **OD-7**, visitor page tools plan P0 should land first (it changes the same files) | site wire becomes AG-UI |
| S6 | Admin default paths (durable Local CLI, BYOK) | S5, **its own design** | reattach and replay over AG-UI |
| S7 | Shared state | a real user, S6 | not planned |

Untangle lanes this work must follow, not race: **R7** (daemon `src/http` → `ServerRoute[]`; it rewrites `frontend-sessions.ts` and `frontend-control.ts`), **R4** (chat package edges, including `@jini-ai/chat` → `@jini-ai/agentic`), **C10** (surfaces port; the A2UI renderer the activity events feed), **P-NODE-BRIDGE**. S0 and S1 need none of them.

## 3. Estimate

S0–S5: about **0.25M Opus + 2.6M Sonnet** (per-stage table in DESIGN §11). S6: about 0.12M Opus design + 1.2M–1.8M Sonnet, wide until designed. S7: 0.06M + 0.45M only if wanted.

## 4. Owner decisions

| # | Decision | Recommendation | If the answer is no |
|---|---|---|---|
| OD-1 | Allow a paused run to outlive its HTTP response (needed for the AG-UI interrupt shape), with the caps and deadlines in DESIGN §7.5 | Yes | Confirmations cannot use the standard shape; they stay a mid-stream `CUSTOM` event with Jini-owned names, and page-tool results return on a side POST |
| OD-2 | Which wire reducer wins where the three disagree (DESIGN §1.4) | The canonical `run-events` one. Visible effects on the canary: `tool_input_delta` no longer appears as `CUSTOM`; `tool_use` gains correlation fields; MCP-UI resources become recoverable | Keep the AG-UI-specific differences as explicit options on the one reducer |
| OD-3 | Carry `isError`, `media`, `outcome` as extra fields on `TOOL_CALL_RESULT` (AG-UI has no error flag; schemas pass extra fields through) | Yes | Admin on AG-UI keeps losing tool-error state and tool images |
| OD-4 | Site widget client: official `@ag-ui/client` (adds rxjs, zod and four more dependencies to a public bundle) or a ~150-line Jini light client checked against the official schemas in tests | Light client for the widget; official client stays in admin | Measure the bundle first; the loader's 3 KB budget is unaffected either way |
| OD-5 | Admin page-approval dialog becomes a `ToolExecutor` confirmation (one confirm mechanism) | Yes | Keep `requiresFrontendApproval` and emulate its two progress phases with two interrupts |
| OD-6 | A2UI and MCP-UI ride as `ACTIVITY_SNAPSHOT` (standard carrier) instead of `CUSTOM` | Yes | `CUSTOM` with Jini default names (`jini.a2ui`, `jini.mcp-ui`); zero new mapping code |
| OD-7 | Keep the old site routes for one release behind a build flag before deleting them | Yes | Delete in the same release; rollback is then a revert |
| OD-8 | Shared state now | No | DESIGN §9 lists what it needs |

## 5. Riskiest three calls

1. **Run outlives response** (OD-1). A public endpoint will hold parked provider turns. Mitigation: per-guest/per-IP/global caps, a server deadline, same rate limiter on resume, one owner for cleanup, tests for every disconnect window (DESIGN §7.4, §7.5).
2. **Execution licensed only after the gate** (FT-1 to FT-3). Getting the emit point wrong is an authorization bypass in the browser. Mitigation: the licensing event is emitted only from the registry's `deliver`; a denying-policy test must see zero browser executions; stock-client behaviour is unverified and stated.
3. **Deleting two reducers and moving the bind from a token to the request** in code with 100+ existing tests. Mitigation: S0 goldens that can fail, byte-identical S1, admin canary before the site, old site route kept until OD-7's window ends.

## 6. Not verified (full list in DESIGN §13)

Admin's current confirmation answer route; whether the tool handler context has the model's tool-use id; stock AG-UI client behaviour and any documented reason/activity vocabulary; `HttpAgent.connect`; AG-UI 1.x; the node bridge's handling of the `connection` header on HTTP/2; daemon event-log retention; bundled client size; test counts are `grep` counts. The LESSONS file has 11 rules, not 15.
