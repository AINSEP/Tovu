BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.
DRAFT (coordinator review before dispatch; cull 11-20).
You are a refactor programmer. Read <repos>/Tovu/AI-Dev-Shop/agents/refactor/skills.md and <repos>/Tovu/AI-Dev-Shop/skills/refactor-patterns/SKILL.md first.
REPO: your cwd = private Tovu clone, branch codex/tv-f2, HEAD = Tovu integ/merge-6-2026-11-19 (776ce6d0f) plus whatever prerequisites the coordinator combined in.
TASK (TOVU ONLY; in this order; no sidekicks/subagents): AP-T, AG0-T, TV-AG1, T1, I2-T EXACTLY as the OVER-ENGINEERING CULL (section at the end) defines them; the CULL wins. AG2-T, AG3-T, AG4-T are a separate job. Import exactly the Jini exports; no version pins or lock edits; delete Tovu copies (no shells). Tests first (AP-T is a bug fix: its tests must fail on merge-6).
BASES per sheet: AP-T merge-6 (dispatchable now); AG0-T needs origin/codex/tv-b2 + AG0-J release; TV-AG1 needs the jb1 release; T1 needs the jb1 release + origin/codex/tv-c6fix; I2-T needs the I2-J release + origin/codex/tv-bl, tv-dh, tv-y2. SKIP any sheet whose base is not in HEAD and say so.
STOP rules per sheet: AP-T — needs a transcript error, automatic retries or a new prompt owner. AG0-T — any host assertion without a Jini counterpart. TV-AG1 — any wire change. T1 — two executor layers would observe the same call. I2-T — a dialect needs the page split into several queries, a new cast, or unknown-size behaviour changes.
COMMIT-PLAN.md: one entry per sheet with its base; AP-T also records the ledger shrink key (apps/site-chat/src/tool-confirmation.ts, catch-reads-error). Commit per sheet; message `tv-f2: <sheet id> …`.

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

### AG0-T · after `tv-b2` and AG0-J · 2k tokens

**Tests first.** Match the retained missing-delta and null-content cases at `W/server/runtime/composition/modules/__tests__/assistant-ag-ui.wire.unit.test.ts:20–21` to AG0-J and the existing limit-notice case at `:28–30` to Jini `frames.test.ts:62–64`. Use AG0-J’s mutations and change the limit check to admit `end_turn`.

Delete that test file after the counterpart mapping is complete. It has no production importer. `assistant-ag-ui-translate.test.ts` retains its three host witnesses. No API or debt changes. List the deletion in `COMMIT-PLAN.md`. **STOP** for any unmatched host assertion.

### AP-T · merge-6 before AG2-T and AG3-T · 6k tokens

**Tests first.** Extend `S/__tests__/SiteToolConfirmation.hooks.test.ts` and `S/__tests__/vanilla-tool-confirmation.test.ts`. A fake resolves `false` on the first click and `true` on the next. The same prompt and a plain failure notice stay visible after the first result. One click repeats the same decision and clears on success. A late result after expiry or supersession cannot restore the old prompt. Mutation restores clear-then-`void confirm`.

**Source.** In `S/SiteToolConfirmation.hooks.ts:12–29`, keep the current prompt and expiry running while one send is in flight. Clear only on `true` for the still-current prompt. On `false`, expose `sendFailed` with the existing decision control. `S/SiteAssistantWidget.tsx:77–85` renders the translated failure in the confirmation strip. In `S/vanilla-tool-confirmation.ts:35–79`, apply the same settlement to the existing strip and update the existing observer’s expected label so a notice survives chrome rerenders. Pass the translated sentence as `sendFailureText` from `S/vanilla-host.ts:19–24`. Keep the original buttons as the retry action. Add **“Couldn’t send your decision. Try again.”** to `S/site-chat-i18n.ts:2–26` across every locale row.

In `S/tool-confirmation.ts:25–30`, use the existing `orFallback` around the same fetch and `response.ok` computation, with `fallback: false` and `step: "site-assistant.confirm.send"`. The UI now handles that outcome. The only new import is `import { orFallback } from "@jini-ai/core/errors/idioms";`. Hook callers at `SiteAssistantWidget.hooks.ts:7,30` and the hook test at `:4` retain imports, as do the vanilla host/test and transport tests. Visitor copy is words only.

**Combine shrink key** is `(apps/site-chat/src/tool-confirmation.ts, catch-reads-error)`, row 155. Confirm zero new or worse rows before updating the ledger. **Chrome look owed** for offline Allow and Cancel, focus and retry in React and vanilla. **STOP** if the change needs a transcript error, automatic retries, or a new prompt owner.

### TV-AG1 · merge-6 after `jb1` · 3k tokens

**Tests first.** Use `W/server/__tests__/assistant-ag-ui-wire.golden.test.ts` and `assistant-ag-ui-routes.test.ts` as the unchanged wire witnesses. Mutations omit the emitted terminal event or cancel the wrong reader on disconnect.

In `W/server/runtime/composition/modules/assistant-ag-ui.ts`, delete only `streamFromReader`, `AgUiFrameContext`, `writeAllAgUiEvents`, `writeFrameOutcome` at `:156–223`, and `drainAgUiStream` at `:278–308`. Add `drainRunFramesToAgUi` to the existing `@jini-ai/chat/core/ag-ui` import. At `:389`, use:

```ts
const outcome = await drainRunFramesToAgUi({
  reader: subscribedReader, threadId: run.threadId, runId: run.runId,
  state, notices: RUN_NOTICES, write: (event) => writeAgUiEvent(res, event),
});
res.end();
```

Remove only now-unused moved imports and update the old drain-name references in comments. The module and test importers retain their imports. Record deleted declarations and refresh the file’s `catch-reads-error` baseline during combine. **Chrome look owed** for the admin canary, disconnect and Stop. **STOP** on any wire change.


### I2-T · after I2-J, `tv-bl`, `tv-dh`, `tv-y2`, and S7b if combined · 5k tokens

**Tests first.** In `W/server/inbound/admin-http/routes/media/__tests__/byte-size.test.ts:8–83`, replace the query-count fixture with a single workspace-scoped call for distinct returned hashes. Keep stat concurrency at eight and verify known, zero, missing and failed stats. Verify zero database calls when the batch is empty or `sizeOf` is absent. Add one SQL repository case for same hash across workspaces. Mutations restore per-hash reads, remove the workspace predicate, or make zero unknown.

**Source.** Extend `SqlAssetBlobRepo.list` in `W/platform/db/repos/media-repo.ts:490–493` using the `getMany` SQL pattern at `:552–569`. Pass the hash filter to one `IN` query, with the existing workspace predicate and row mapper. In `routes/media/byte-size.ts:13–43`, read the batch once, index by SHA, and preserve the bounded stat workers. A lookup failure leaves the batch sizes unknown. Use the existing `orFallback` idiom for that lookup if needed by the error gate, with `import { orFallback } from "@jini-ai/core/errors/idioms";`. The `resolveMediaByteSizes` imports stay at `list.ts:9`, `stored-media-response.ts:4`, `trash.ts:9`, `update.ts:10`, and the test at `:4`. Inherited `SqliteAssetBlobRepo` needs no override. `byte-size.ts` retains the existing isolated-stat debt row. **STOP** if a supported SQL dialect requires splitting the supplied page into multiple queries, a new cast, or dropping the old adapter’s unknown-size behavior.

### T1 · merge-6 after `jb1` J1/J2 and `tv-c6fix` · 3k tokens

**Tests first.** Extend `W/assistant/__tests__/byok-tool-surface.test.ts`. A registered BYOK call settles one observed `tool.call`; changing the live gate to false suppresses observation on the next call while preserving its return. Mutations omit the forwarding or snapshot the gate at construction.

At `W/assistant/tool-recovery-preset.ts:99–112`, declare the two observability fields using the existing daemon executor input type and forward via the existing `...deps`. At `W/assistant/byok-tool-surface.ts:48,409,563–579,801`, forward them through `ByokToolSurfaceDeps`, `composeSurfaceExecutor`, and its construction call. Replace the existing import with `import { createAssistantToolExecutor, type AssistantToolExecutorDeps } from "./tool-recovery-preset.js";`. `assistant-byok.ts` already passes `routeDeps`. The other preset consumer, `agent-daemon-scope-tools.ts:138`, retains its call. No manifest or new debt fields. **STOP** if two executor layers observe the same call.


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
