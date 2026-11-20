BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.
DRAFT (coordinator review before dispatch; cull 11-20). Dispatch only after codex/tv-f2 (AP-T, TV-AG1) is combined and the AG2-J/AG3-J/AG3A-J/AG4-J Jini release plus the site-chat `@ag-ui/core` dependency are in the Tovu lock (OPUS-CLOUD).
You are a refactor programmer. Read <repos>/Tovu/AI-Dev-Shop/agents/refactor/skills.md and <repos>/Tovu/AI-Dev-Shop/skills/refactor-patterns/SKILL.md first.
REPO: your cwd = private Tovu clone, branch codex/tv-f2-2, HEAD = the coordinator's combine of Tovu merge-6 + codex/tv-f2.
TASK (TOVU ONLY; in this order; no sidekicks/subagents): AG2-T, AG3-T, AG4-T EXACTLY as the OVER-ENGINEERING CULL (section at the end) defines them; the CULL wins. E8 is NOT a predecessor. AG-UI D1–D4 YES: replace `/chat` in place (no parallel route); `/confirm` is removed in AG3-T only after the visitor cases pass.
BASES per sheet: AG2-T needs AP-T + TV-AG1 + AG2-J release; AG3-T needs AG2-T + AG3-J/AG3A-J release; AG4-T needs AG3-T + AG4-J release.
STOP rules per sheet: AG2-T — the visitor wire reveals raw tool input, a second route is needed, Ask/disconnect behaviour changes, or the writeAgUiEvent import makes a cycle. AG3-T — admin resume needs the durable replay redesign, visitor resume re-creates the model turn, or two answer paths can settle one promise. AG4-T — a claimed name or model frame can execute before registry delivery, the bind token moves into the browser wire, or the page attachment must go before parity.
COMMIT-PLAN.md: one entry per sheet with its base and the Chrome looks owed. Commit per sheet; message `tv-f2: <sheet id> …`.

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

### AG2-T · after AP-T, TV-AG1 and AG2-J · 12k tokens

**Tests first.** Update `W/server/__tests__/site-chat-stream.golden.test.ts:189–338` and its `goldens/site-chat-stream.golden.json` for the eight AG-UI scenarios. Pin plain reply, allow, deny, expired, no capacity, published navigation, provider error, and visitor abort. `S/__tests__/site-assistant-transport.test.ts` and `tool-confirmation.test.ts:51–78` keep the no-reply, idle-timeout, non-persisted challenge, and abort witnesses. Mutations omit text completion, bypass denial or capacity, serialize the raw provider error or page arguments, and detach abort.

**Source.** In `W/server/runtime/composition/modules/site-assistant.ts:670–727,799–803,845–897`, read the AG-UI new-turn body through the Jini parser, translate the same bounded history into the existing preflight input, and keep the same provider call. Use Jini projection for text and terminal events. For this phase, carry existing sanitized confirmation and navigation directives as host-named CUSTOM events. Keep existing public error wording and safe IDs. Move Express-specific `writeAgUiEvent` from the post-TV-AG1 admin module into `assistant-ag-ui-sse.ts` beside it and import it in both modules using `import { writeAgUiEvent } from "./assistant-ag-ui-sse.js";`. The visitor retains its own response headers and preflight/error owner.

```ts
import { closeAgUiRun, createAgUiTranslationState, resolveAgUiRunInput, translateAgentEventToAgUi } from "@jini-ai/chat/core/ag-ui";
import { createAgUiFetchAgent, createAgUiRunClient } from "@jini-ai/chat/transports/ag-ui";
```

The first import belongs in the website route. The second belongs in `S/site-assistant-transport.ts:91–153,257–316`, replacing its local SSE framing and pump. Keep the transport signature and the existing imports at `SiteAssistantWidget.hooks.ts:4`, `vanilla-host.ts:4`, and the two browser tests. Replace `/chat` in place only with all eight goldens passing on combine. `/confirm` remains through this phase. Rollback is a release revert. **Chrome look owed** on React and vanilla. **STOP** if the visitor wire reveals raw tool input, a second route is needed, or Ask and disconnect cannot retain their current behavior.

### AG3-T · after AG2-T, AG3-J, AG3A-J and E8 · 15k tokens

**Tests first.** Extend `site-chat-stream.golden.test.ts` for same-turn park/resume, allow, deny, expiry, quota refusal, wrong owner, replay, second settle, Stop, and disconnect on both sides of the park handoff. In `assistant-ag-ui-wire.golden.test.ts` and `W/assistant/__tests__/agent-daemon-server.page-confirmation.integration.test.ts`, pin a real pending approval and its answer alongside an unchanged result card. Mutations reopen the provider, leave the disconnect handler active after park, bypass the exchange owner, or treat every MCP card as an interrupt.

**Source.** At `site-assistant.ts:610–615,641–655,689–727,799–803`, use `confirmationInterrupt`, `readConfirmationResume` and `createAgUiPauseStore` from `@jini-ai/chat/core/ag-ui`. Register resume on `CHAT_PATH`, and Stop at its sibling path. Park the original bounded provider turn before closing the old response. Retain its frontend release handle and attach the new response’s abort handler at resume. Reuse `W/assistant/site/visitor-confirmations.ts:17–41` `confirm` with the same owner and admission checks from `W/server/inbound/public-http/routes/site-assistant-confirm.ts:46`. Retain the 60-second exchange deadline and rev-2 10-second abandon grace and 256-event buffer. A timeout denies one tool. Stop or abandonment releases the run once.

Bind the existing React and vanilla confirmation controls to transport resume through `S/SiteAssistantWidget.hooks.ts:29–32` and `vanilla-host.ts:22–25`, retaining AP-T’s failed-send behavior. Remove the old `/confirm` registration and client POST, including their now-unused imports, after the new path passes all visitor cases. Verify remaining route constant imports and record the deletion.

In `W/contracts/core/human-confirm.ts:108–141`, mark only the live `askOnce` emission. Route admin resume into the existing `deliverSurfaceCallback` binding used by `W/assistant/mcp-ui-tool-calls-route.ts:10,231`. At `apps/admin/src/lib/assistant-transport-ag-ui.ts:34,67`, reuse the existing client import for resume. The approval outcome is the only intentional admin golden change. **Chrome look owed** on all three chat views. **STOP** if admin resume requires its durable replay redesign, visitor resume re-creates the model turn, or an old and new answer path can both settle the same promise.

### AG4-T · after AG4-J and AG3-T · 11k tokens

**Tests first.** Extend `site-chat-stream.golden.test.ts` for published navigation and the existing reviewed submit path. Add rejection-before-effect and repeated-invocation assertions in `S/__tests__/visitor-page-control.test.ts`, with the existing admin approval integration suite as the authenticated witness. Mutations execute on an observed tool name, skip `begin`, reuse the invocation ID, or bypass publication matching.

**Source.** Wire admin `assistant-ag-ui.ts` and visitor `W/assistant/site/visitor-frontend-control.ts:87–118` to the existing control facade from `@jini-ai/daemon/http`. Mount sibling `begin` and `stop` through each route’s current owner checks. In `S/visitor-page-control.ts:22–52,102–117` run the existing page effect only after the authorized delivery’s invocation ID receives a successful begin. Use that ID for the response. Retain publish revision, same-site target checks, and navigation save-before-leave. Preserve the reviewed submit behavior of `page.click`. Existing browser host imports of `createVisitorPageControl` stay. Record new authenticated route rows in `COMMIT-PLAN.md`. **Chrome look owed** in admin and visitor chat. **STOP** if a claimed name or model-generated frame can execute before registry delivery, the bind token would move into the new browser wire, or the existing page attachment must be removed before the new route proves parity.


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
