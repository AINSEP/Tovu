BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.
DRAFT (coordinator review before dispatch; cull 11-20; answer the AG2-J NEEDS-DECISION first — the draft assumes the recommended fetch agent with EventSchemas validation).
You are a refactor programmer. Read <repos>/Tovu/AI-Dev-Shop/agents/refactor/skills.md and <repos>/Tovu/AI-Dev-Shop/skills/refactor-patterns/SKILL.md first.
REPO: your cwd = private Jini clone, branch codex/f2-jini, HEAD = Jini integ/merge-6-2026-11-19 (d3e78b387) with origin/codex/jb1, origin/codex/jy-pb, origin/codex/bl-jini, origin/codex/dh-jini combined in by the coordinator.
TASK (JINI ONLY; in this order; no sidekicks/subagents): AG0-J, AG2-J, AG3-J, AG3A-J, AG4-J, I2-J EXACTLY as the OVER-ENGINEERING CULL (section at the end) defines them; the CULL wins over the design. AG-UI decisions D1–D4 are YES. New Jini code carries no Tovu name (CUSTOM event names, ids, comments). No package.json / lock / API-baseline edits (cloud).
BASES per sheet: AG0-J needs jb1; AG2-J needs jb1 + jy-pb; AG3-J needs AG2-J; AG3A-J needs AG3-J + jb1; AG4-J needs AG3-J; I2-J needs bl-jini + dh-jini. If a prerequisite branch is missing from HEAD, SKIP that sheet and every sheet after it in its chain.
STOP rules per sheet: AG0-J — the two assertions need a production change. AG2-J — decoding needs a cast, the entry creates a runtime cycle, or a directive needs a second transcript channel. AG3-J — needs a second approval store or a new dependency. AG3A-J — needs held `run-lifecycle.ts`, or a result card gains an executable answer. AG4-J — ownership would expose ungated `invoke`. I2-J — needs a separate batch port or new subpath. Held `codex/ex-err-jini` files are never edited.
COMMIT-PLAN.md: one entry per sheet with its base and the API delta to record (chat: createAgUiFetchAgent, onLiveEvent, confirmationInterrupt, readConfirmationResume, createAgUiPauseStore, resumeAgUiRun, pendingApproval; daemon: begin; cms: list filter). Commit per sheet; message `f2: <sheet id> …`.

## NO OVER-ENGINEERING (owner rule, HARD — read before every edit)
- Do EXACTLY what the sheet names. If the sheet does not name it, do not add it.
- No new helpers, wrappers, adapters, ports, interfaces, types, generics, options, config flags or abstraction layers unless the sheet lists them by name.
- No "just in case" code: no extra validation, defensive checks, fallbacks, try/catch, null guards, retries or default values the moved code did not already have.
- No speculative generality: no parameters "for later", no unused exports, no optional args nobody passes, no `_optional` pads.
- Moves are VERBATIM: same statements, same order, same names. Do not rewrite, rename, "clean up", reformat or modernize the code you move.
- Tests: only the cases the sheet lists (+ the named mutation). No extra test scaffolding, fixtures or factories beyond what those cases need.
- Comments: move existing why-comments verbatim; add NO new comments except a one-line neutral note where the sheet asks for one.
- Smallest diff that satisfies the sheet. If something seems to need more, STOP that step and report it instead of building it.
- Before finishing, re-read your diff and DELETE anything not required by the sheet. List any deletions in COMMIT-PLAN.md.

## OWNER RULES (HARD)
Behaviour identical except the bug fix a sheet names (failing test first); errors never generic (plain words + redacted details; follow the error disclosure contract quoted in the sheet); never raise a debt number; API args (required, optional = {}) for NEW functions only, framework-dictated signatures (Express handlers, React events, comparators, type guards) exempt; every custom hook injected as a prop defaulted to the real hook; no re-export shells (delete + repoint); no new deps; no vendor code in Jini core; no specific server framework in Jini domain code; no product names (Tovu, tovu.dev) anywhere in Jini; no new eslint-disable/@ts-ignore/as any/as never; functions <= 50 lines, complexity <= 10 (HARD). A file over 500 lines is NOT a stop reason: note it in COMMIT-PLAN.md and continue. STOP a sheet (continue the others) if a named declaration is missing, an unlisted PRODUCTION importer appears (`git grep -n -F '<symbol>' -- apps/ development/ packages/`; unlisted TEST importers needing only the same repoint are fine, record in REFRESH.md), a cast is needed, or a hard limit is exceeded. MACHINE RULE: no other repo-wide scans; NO tests, builds, installs, type-checks, linters (Codex 6.1 Sol executors run none; cloud runs them); no codebase-memory-mcp; .git read-only; COMMIT-PLAN.md at repo root, one entry per sheet (sheet ID, base, files touched, tests written, the mutation to run in cloud, STOP/skip reason if any, deletions made in the final diff re-read).

## REPORT (<= 300 words)
Per sheet: DONE / STOPPED (why, file:line) / SKIPPED. List every file touched, every REFRESH.md entry, and anything the cull text did not cover.

## DESIGN (Codex 6.2, r62t-feat2) — sheets for this job only
## Executor rules for both jobs

Copy this block into each brief.

```text
Behaviour identical; API args (required, optional = {}) for NEW functions only; no re-export shells; no new deps; no new eslint-disable/@ts-ignore/as any/as never; functions <= 50 lines and complexity <= 10 (HARD). A file going over 500 lines is NOT a stop reason (owner correction 11-20: note it in COMMIT-PLAN.md and continue). STOP a sheet (continue the others) if a named declaration is missing, an unlisted PRODUCTION importer appears (`git grep -n -F '<symbol>' -- apps/ development/ packages/`; unlisted TEST importers needing only the same repoint are fine, record in REFRESH.md), a cast is needed, or the function/complexity limit is exceeded. MACHINE RULE: no other repo-wide scans; NO tests, builds, installs, type-checks, linters; no codebase-memory-mcp; .git read-only; COMMIT-PLAN.md at repo root. Hooks are injected as props. No vendor code in Jini domain packages (vendors live in provider packages); no specific server framework in Jini domain code (`{ app: Server }` style). Anything needing a lockfile change, a new npm dependency or a new Jini package = OPUS-CLOUD.
```

Framework-dictated signatures are exempt. Move named code verbatim except for the specified edits. Add only the named APIs, fields, and tests. Re-read the diff and record deletions in `COMMIT-PLAN.md`. `BREAKS:` applies to any Jini identifier rename under the owner’s Tovu-name decision. These sheets introduce no such rename. Combine owns test and mutation execution, API baseline regeneration, and ledger shrink.

Below, `W` means `apps/website/src`, `S` means `apps/site-chat/src`, `C` means `packages/chat/src`, and `D` means `packages/daemon/src`.

## Jini sheets

### AG0-J · merge-6 after `jb1` · 2k tokens

**Tests first.** In `C/core/run-events/__tests__/payload.test.ts`, immediately after the text-delta case at `:20` and the tool-result cases at `:49–67`, add the two assertions from Tovu `assistant-ag-ui.wire.unit.test.ts:20–21` using the suite’s existing `translateRunAgentPayload` import. A missing delta yields empty text. A null-content tool result yields empty content, retaining the call ID and the existing truthy `isError` coercion. Mutations emit `"undefined"` and `"null"` respectively.

Test-only. Existing `frames.test.ts:62–64` owns the limit-notice rule. No import repoints, API or debt changes. **STOP** if the two payload assertions require a production change.

### AG2-J · merge-6 after `jb1`, `jy-pb` · 8k tokens

**Tests first.** Add `C/core/assistant-client/__tests__/ag-ui-fetch-agent.test.ts`. Exercise split SSE frames and comments, first-event delivery, abort releasing the reader, and pre-response refusal reporting once. Exercise a registered live directive with a fake visitor callback and assert that it stays out of transcript events. Mutations split by network chunk, omit abort, settle refusal twice, and forward the directive through the reducer.

**Source.** Add `createAgUiFetchAgent` and private `readAgUiResponse` in `C/core/assistant-client/ag-ui-fetch-agent.ts`. Inject the request function from the host. Reuse `readSseFrames` and the existing `AgUiClient` subscription contract. Keep refusal wording and request headers with the host. In `C/core/assistant-client/ag-ui-transport.ts:26–34,76–95`, add optional `onLiveEvent` to the existing ports and consume matching events before reduction. Preserve the existing finish-once and abort paths. Export `createAgUiFetchAgent` directly from the existing `./transports/ag-ui` implementation entry.

```ts
import { readSseFrames } from "../run-events/entry.js";
import type { AgUiClient } from "./ag-ui-transport.js";
```

The new test imports `createAgUiFetchAgent` from `../ag-ui-fetch-agent.js`. AG2-T is the production adopter. `apps/admin/src/lib/assistant-transport-ag-ui.ts:34,67` retains its existing import and injected official agent. Record the new export and optional port member in the chat API baseline delta. Chrome owed on both visitor builds. **STOP** if decoding requires a cast, the published entry creates a runtime cycle, or accepting a directive requires a second transcript channel.

### AG3-J · merge-6 after AG2-J · 11k tokens

**Tests first.** Add `C/core/ag-ui/__tests__/interrupts.test.ts`. Accept one matching allow or deny, interpret dismissed as denial, and reject foreign owner, wrong thread, replay, and second settlement. Exercise an expired approval that denies the tool while keeping its continuation available. Mutations trust `forwardedProps`, omit owner or thread, leave a claimed record claimable, and cancel the run on exchange expiry.

**Source.** Add `confirmationInterrupt`, `readConfirmationResume`, and `createAgUiPauseStore` to the existing `C/core/ag-ui/event-projection.ts` entry. Use the installed `RunAgentInputSchema` for the resume shape. Leave `resolveAgUiRunInput` at `run-input.ts:111` as the new-turn parser. The pause-store methods are `park`, `claim`, `peek`, and `remove`. Store only the active request handoff, with owner, thread, original run and interrupt IDs, retained state, and the abandon deadline. Claim and removal are synchronous. Apply the rev-2 caps atomically across global, IP and guest scopes on the visitor binding and global/principal on admin. Exchange stores still own answer and expiry.

At `C/core/assistant-client/ag-ui-transport.ts:76–95,220–249`, hand interrupt outcomes to the live consumer before ordinary finish and add `resumeAgUiRun` to submit a fresh run ID on the same thread with `parentRunId` and `resume[]`. Keep interrupts out of collected events. The new test imports the three declarations from `../event-projection.js`. Tovu imports are in AG3-T. Record chat baseline deltas for the existing two AG-UI entries. **STOP** if the handoff requires a second approval store or a new dependency.

### AG3A-J · merge-6 after AG3-J and `jb1` · 5k tokens

**Tests first.** In new `D/__tests__/surface-exchange-approval-marker.test.ts`, send a decision prompt followed by a result on the same exchange. Only the prompt carries `pendingApproval`. Mutation stamps every exchange emission. In `C/core/ag-ui/__tests__/run-frames.test.ts`, verify that only a marked pending approval projects an interrupt. Mutation keys off `surfaceExchange` alone.

**Source.** Extend the existing `SurfaceEmission` payload contract at `D/surface-exchanges.ts` and the frame projection at pushed `C/core/ag-ui/event-projection.ts:231–263` to carry opt-in `pendingApproval`. Reuse `confirmationInterrupt`. Pass through ordinary cards and result cards with their current bytes. The explicit producer is Tovu `requireHumanConfirm` in AG3-T. New daemon test imports `createSurfaceExchangeStore` from `../surface-exchanges.js`. Existing frame test imports stay. Record surface and chat type deltas. **STOP** if marking a wait requires modifying held `run-lifecycle.ts`, or if a result card acquires an executable answer.

### AG4-J · merge-6 after AG3-J · 11k tokens

**Tests first.** Add `D/__tests__/frontend-session-ag-ui.test.ts` using the existing registry fixture pattern. A refused tool never yields an executable call even for a client that acts on `TOOL_CALL_END`. A delivered invocation can begin once. Cancel or timeout before begin denies permission to act. Foreign owner, wrong invocation ID and replay all fail. Mutations emit from the model call, skip the live pending check, match by tool name, or leave begin reusable.

**Source.** At `D/frontend-session-registry.ts:111–129,293–299,370–390`, extend the existing scoped handle with `begin` for a delivered, live invocation ID. Claim it once before acknowledgment. At `D/http/frontend-control.ts:98–109,200–224`, expose `begin` through `FrontendControl` using its existing owner and run binding. Keep registry `deliver` as the only source of executable calls. Move the applicable frontend tool wire projection from `packages/agentic/src/core/ag-ui.ts:19–127` only with its first caller. Prefer the existing `EventType` values and keep existing exports until their callers are accounted for. The new registry test imports `createFrontendSessionRegistry` from `../frontend-session-registry.js`. AG4-T uses `@jini-ai/daemon/http`; no new entry. Record the facade API delta and retain the registry error-gate baseline. **STOP** the projection move if the barrel, `messages.contract.test.ts:11`, and the direct tests cannot be repointed with the exact verified import list. **STOP** the relay if ownership would require exposing ungated `invoke`.

### I2-J · merge-6 after `bl-jini`, `dh-jini` · 3k tokens

**Tests first.** Extend `packages/cms/src/media/__tests__/repo.memory.test.ts`. A hash-filtered list returns existing requested hashes in the named workspace, including a same-hash row in a second workspace as a negative witness. Empty hash input returns empty. Mutation ignores the hash or workspace filter.

**Source.** Add optional `{ sha256s?: readonly string[] } = {}` to `AssetBlobRepoPort.list` at `packages/cms/src/media/ports.ts:44–51` and `InMemoryAssetBlobRepo.list` at `repo.memory.ts:83–85`. An omitted filter keeps the existing full-workspace list contract. Existing `@jini-ai/cms/media` entry, memory test imports, and GC callers retain their imports. Record the existing port’s API baseline delta. **STOP** if a separate batch port or new subpath is required.

## OVER-ENGINEERING CULL (Opus) - WINS
The CULL wins over the design text above wherever they differ. Sheets the cull marks DROP / BLOCKED / NEEDS-DECISION / OWNED-ELSEWHERE are NOT done.

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
