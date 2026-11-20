# Cull of r62t-feat2 (AG-UI phases 2–4, MCP Apps, media paging/byte size, M5 + traceparent, visitor approval) — over-engineering judge

Input: `cull-inputs-2/designs/r62t-feat2.md`; prior `cull-inputs-2/prior-culls/cull-agui.md` (D1–D4 now YES). Bases: Jini `d3e78b387`, Tovu `776ce6d0f`; read `origin/codex/jb1` (`drainRunFramesToAgUi`, `event-projection.ts:202–262`). Read-only; no tests or builds.

Counts (14 sheets): **KEEP 7** (AG0-J, AG3A-J, I2-J, AG0-T, AP-T, TV-AG1, T1) / **CUT-TO 6** (AG2-J, AG3-J, AG4-J, AG2-T, I2-T, AG3-T) / **BLOCKED 1** (AG4-T on AG3-T). PARTIAL rows (S6, MCP Apps 1–5, I1 paging, Perfobs T7, M1/M2/M4/M5/M6): agree, no sheet this round.

## Verdicts

| Sheet | Verdict | Base | Reason |
|---|---|---|---|
| AG0-J | KEEP | needs `jb1` | Two assertions in an existing Jini suite; lets AG0-T delete the Tovu duplicate (prior cull asked for this). |
| AG2-J | CUT-TO + NEEDS-DECISION | needs `jb1`, `jy-pb` | A hand-rolled `AgUiClient` next to the ADR-059 `HttpAgent` (`ag-ui-transport.ts:4`). Justified only to keep `@ag-ui/client`/rxjs out of the visitor bundle (site-chat has neither `@ag-ui/client` nor `@ag-ui/core`, `apps/site-chat/package.json:18–24`). If kept, it must validate every event with `@ag-ui/core` `EventSchemas` (ADR-059 parity); no unvalidated JSON. |
| AG3-J | CUT-TO | needs AG2-J | Cut `peek` (no named caller). Caps: visitor binding only — admin resume goes through the existing surface exchange (`deliverSurfaceCallback`, AG3-T), not the pause store, so admin caps have no caller. |
| AG3A-J | KEEP | needs AG3-J, `jb1` | Opt-in `pendingApproval` = D2 exactly. |
| AG4-J | CUT-TO | needs AG3-J | Keep `begin`. Cut "move the applicable frontend tool wire projection from `agentic/src/core/ag-ui.ts:19–127` only with its first caller" — conditional move with no named caller. |
| I2-J | KEEP | needs `bl-jini`, `dh-jini` | One optional filter on the existing `AssetBlobRepoPort.list` (`cms/src/media/ports.ts:46`). N+1 confirmed: Tovu `byte-size.ts:32` calls `findByHash` per hash. |
| AG0-T | KEEP | needs `tv-b2` + AG0-J release | Deletes the Tovu duplicate suite. |
| AP-T | KEEP (bug fix) | merge-6 | Real silent failure (BUGS 1). Fix both renderers together, failing tests first. |
| TV-AG1 | KEEP | needs `jb1` release | Local drain confirmed at `assistant-ag-ui.ts:170 streamFromReader, :181 AgUiFrameContext, :191, :208, :286 drainAgUiStream, call :389`. Design's `:156–223` drifted; delete **by symbol**. jb1's context shape `{ reader, threadId, runId, state, notices, write }` matches the design call. |
| AG2-T | CUT-TO | needs AP-T, TV-AG1, AG2-J release + cloud `@ag-ui/core` dep for site-chat | No new `assistant-ag-ui-sse.ts`: export the existing `writeAgUiEvent` (`assistant-ag-ui.ts:134`) and import it in `site-assistant.ts`. |
| AG3-T | CUT-TO (sequencing) | needs AG2-T, AG3-J, AG3A-J release | Do **not** wait for E8: E8 is unsheeted (BLOCKED in `cull-err-sys.md`). E8 rebases onto the finished transport after AG4. |
| AG4-T | BLOCKED (AG3-T) | — | Sound (D4); dispatch with/after AG3-T. |
| I2-T | CUT-TO | needs I2-J release, `tv-bl`, `tv-dh`, `tv-y2` | Replace "use `orFallback` if needed by the error gate" with an exact line (below). |
| T1 perfobs | KEEP | needs `jb1` release, `tv-c6fix` | `tool-recovery-preset.ts:99–112` spreads `...deps` into `createDaemonToolExecutor`; `byok-tool-surface.ts:48` import verified. |

## Exact cut text

### AG2-J
Add to Source: "`readAgUiResponse` parses each SSE `data` with `EventSchemas.parse` from `@ag-ui/core` before handing it to subscribers; a parse failure ends the run with the existing transport refusal path once." Add test case: a frame that fails `EventSchemas` ends the run once and never reaches `onLiveEvent` or the transcript. Mutation: skip the parse. Everything else as design.

### AG3-J
Pause-store methods are `park`, `claim`, `remove` (no `peek`). Caps are supplied by the host as one object (`{ global, perScope }` with the host's scope key) and apply only where the host creates the store; this sheet's tests use one store. Delete "and global/principal on admin".

### AG4-J
Delete the sentence starting "Move the applicable frontend tool wire projection…" and the first STOP clause about the projection move. `agentic/src/core/ag-ui.ts` is untouched.

### AG2-T
Replace "Move Express-specific `writeAgUiEvent` … `import { writeAgUiEvent } from "./assistant-ag-ui-sse.js";`" with: "Export the existing `writeAgUiEvent` from `assistant-ag-ui.ts` (`:134`, unchanged body) and in `site-assistant.ts` add `import { writeAgUiEvent } from "./assistant-ag-ui.js";`. No new file." STOP if that import creates a cycle (then report; do not create a file).

### AG3-T
Base line: "after AG2-T and the AG3-J/AG3A-J release; E8 is NOT a predecessor." Everything else as design.

### I2-T
Replace "Use the existing `orFallback` idiom for that lookup if needed by the error gate, with …" with: "Inside the existing `if (store.sizeOf)` guard and only when `sha256s.length > 0`: `const blobs = await orFallback({ work: () => deps.assetBlobRepo.list({ workspaceId: deps.workspaceId }, { sha256s }), fallback: [], step: "Read media blob rows" });` then index by `sha256`; a failed lookup leaves every size `null` (as today). Import `orFallback` from `@jini-ai/core/errors/idioms`." The per-hash `try/catch` moves to wrap only the `sizeOf` call (comment verbatim).

### AP-T
As design. Base merge-6; tests first (they fail on merge-6: prompt cleared before the `false` result).

## BUGS (confirmed at merge-6)
1. **Tovu `apps/site-chat/src/SiteToolConfirmation.hooks.ts:26–27`** and **`apps/site-chat/src/vanilla-tool-confirmation.ts:43–44`** — `decide` clears the prompt and then `void confirm(...)` discards the `boolean` that `confirmSiteAssistantTool` (`tool-confirmation.ts:25–32`) returns; on a failed send (offline, timeout, refusal) the visitor sees nothing, the prompt is gone, and the held tool expires as denied after 60 s. Silent failure; contract visitor row requires words. Fix: AP-T.
2. Tovu `apps/website/src/server/inbound/admin-http/routes/media/byte-size.ts:32` — N+1: one `findByHash` query per distinct hash on every media list (concurrency 8). Fix: I2-J + I2-T.

## NEEDS-DECISION
- **AG2-J client** — hand-rolled fetch `AgUiClient` (validated with `EventSchemas`) for the visitor, vs official `HttpAgent` + `@ag-ui/client` in site-chat (ADR-059)? **Recommend: fetch agent with `EventSchemas` validation** — keeps rxjs out of the public embed; cloud adds only `@ag-ui/core` to site-chat (an opt-in peer of `./transports/ag-ui`, `packages/chat/package.json:53,61`).
- **AG3-T after E8?** **Recommend: no** — E8 is unsheeted; it rebases onto the AG4 transport.
- **MCP client library (AppBridge)** — **Recommend: yes**, in `@jini-ai/ui`'s MCP-UI feature (not core), existing inline renderer kept for current cards; dependency change is CLOUD; no source sheet until MCP Apps 1–2 has its first production resource.
- **M3/J6 behind T1** — **Recommend: yes** (`assistant-byok.ts:387–394,813–829` settles spans without usage).
- **M5 browser receiver (owner-approved 11-20)** — design leaves it PARTIAL. **Recommend: one design pass to sheet it** (receiver behind `browser-analytics-http.ts:11–48` consent/origin/rate checks, closed numeric body, off by default); not Codex-ready this round.
