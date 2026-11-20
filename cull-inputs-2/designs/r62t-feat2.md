# r62t-feat2 dispatch plan

Reviewed Tovu `776ce6d0f` and Jini `d3e78b387` read-only. The dispatch supplied the bootstrap for this clone, where `AI-Dev-Shop` is absent. The plan has six Jini sheets and eight Tovu sheets. AG-UI D1–D4 are approved. The visitor approval fix can ship before the AG-UI cutover.

## Disposition

| ID | Disposition | Evidence or remaining work |
|---|---|---|
| AG S0, S1, S2.1, OD-6 | RETIRE | Merge-6 has the two Tovu wire goldens and Jini round-trip golden, request parser, and projection/reduction. `cull-agui.md` drops standalone `drained()` and the conversion of ordinary cards into activity snapshots. |
| AG-J1 | RETIRE | `jb1` `6da21feaf` adds `drainRunFramesToAgUi` and `run-frames.test.ts`. |
| TV-AG1 | READY-FOR-CODEX | The Tovu route still calls its local drain at `assistant-ag-ui.ts:389`. Adopt the pushed Jini implementation. |
| TV-AG0, completed portion | RETIRE | `tv-b2` `7e5c158ca6` removes the 18 translation duplicates. |
| TV-AG0, remainder | READY-FOR-CODEX | `tv-b2` retains two unported assertions in `assistant-ag-ui.wire.unit.test.ts:20–21`. AG0-J → AG0-T. |
| AG P1 relocation, admin `HttpAgent` relocation | RETIRE | `cull-agui.md` drops both. Jini’s client stays at `assistant-client/ag-ui-transport.ts`. |
| AG P2 visitor transport | READY-FOR-CODEX | AG2-J → AG2-T. D3 directs an in-place `/chat` replacement after all eight scenarios pass. |
| AG P3 visitor and admin approval | READY-FOR-CODEX | AG3-J + AG3A-J → AG3-T. D1 authorizes parking a visitor turn. D2 limits the admin golden change to a real pending approval and its answer. |
| AG P4 page tools | READY-FOR-CODEX | AG4-J → AG4-T. D4 authorizes sibling `begin` and `stop` using the existing frontend-control owners. |
| AG P4 `page.submit`, S7 shared state | RETIRE | `cull-agui.md` drops both. The existing reviewed submit path is in `page.click`. |
| S6 admin durable replay and default transport | PARTIAL | The current AG-UI client’s reattach at `ag-ui-transport.ts:220` reports completion. The durable and BYOK transport switch needs its accepted-run and replay contract. |
| MCP Apps 1, 2 | PARTIAL | Jini has `resources/read`. The first production app resource and the two negotiated capability bindings need a source sheet together. See handoff. |
| MCP Apps 3, 4, 5 and teardown | PARTIAL | The current card passes HTML to `AppRenderer`. Pin the session-scoped resource read, isolation policy, and handler surface against the selected bridge. |
| MCP client library | NEEDS-DECISION | **Use the official AppBridge directly for new resource-backed cards?** Recommend yes. Keep the current inline renderer for existing cards during rollout. Use the pinned audit’s 1.x bridge as the first compatibility target if separately declaring it is acceptable. |
| MCP dependency changes | OPUS-CLOUD | Remove `@mcp-ui/client` from `apps/site-chat/package.json:22`. Route any direct bridge dependency, SDK v2, or Zod 4 change through the package and lockfile job. |
| I1 thumbnail lazy loading | RETIRE | `apps/admin/src/features/media/Media.tsx:284,1549,1555` already sets `loading="lazy"`. |
| I1 admin cursor paging | PARTIAL | The existing agent cursor at Jini `cms/src/media/list-page.ts:58–74` sorts a whole-workspace read. Admin `routes/media/list.ts:28–38` returns the complete list. The bounded read still needs parity for tab counts, legacy MIME classification, and locale-based alphabetical order. |
| I2 byte-size N+1 | READY-FOR-CODEX | I2-J → I2-T. The per-hash database call is inside `routes/media/byte-size.ts:24–41`, at `:32`. |
| Perfobs J1–J3 | RETIRE | `jb1` `6da21feaf` ships tool-stack observation, counters, and run duration. |
| Perfobs T2, T4–T6 | RETIRE | `tv-po` `8f5a297133` ships import, trash, domain, and go-live spans. |
| Perfobs T1 | READY-FOR-CODEX | The existing BYOK tool surface gets the route deps, and the preset still drops the observability fields. `tv-po` explicitly excludes T1. |
| Perfobs T7 | PARTIAL | The backup-push draft remains open after `tv-xd5-publish`. Its exact pushed anchors and test importers need refresh. |
| M1 other paths, M2 plugin/depth, M6 other schedulers | PARTIAL | Execution owners, queue depth query, and scheduler boundaries remain to be pinned. Existing `outbox.deliver` spans cover deliveries. |
| M3 / J6 BYOK usage | NEEDS-DECISION | **May J6 and M3 queue immediately behind the open T1 sheet?** Recommend yes. `assistant-byok.ts:387–394,813–829` has an AI-trace recorder and span settlement, with usage still absent from settlement. T1 is absent from the inspected branches. |
| M4 trace propagation | PARTIAL | The website send points and daemon start handler are identified. CLI receipt and the Desktop action sender remain open. |
| M5 browser diagnostics | PARTIAL | The receiver and consent policy are approved. The production browser asset and consent-revocation wiring still need exact sheets. |
| M5 full Web Vitals SDK | OPUS-CLOUD | New SDK and lockfile. |
| Perfobs J4, J5, T3, forced roots, background enable gates | RETIRE | Dropped by `cull-perfobs.md`. T1 retains the live gate for tool calls. |
| Visitor approval row 155 | READY-FOR-CODEX | React `SiteToolConfirmation.hooks.ts:23–28` and vanilla `vanilla-tool-confirmation.ts:42–45` discard the prompt before reading the same failed-send result. AP-T covers both renderers. |
| E3–E11, including E8 | OWNED-ELSEWHERE `r62t-err-sys` | Run E8 after AG2-T and before AG3-T. Shared files are listed below. |
| Error-gate ledger sweeps and Jini catch census | OWNED-ELSEWHERE `r62t-err-rows` | AP-T supplies the row 155 shrink key. |
| Env, provider plugins, redaction-blocked rows, arch-120 refresh and redos | OWNED-ELSEWHERE `r62t-ext2` | Media SQL follows S7b where both edit `media-repo.ts`. |
| Hygiene-a/b and practice | OWNED-ELSEWHERE cloud cull | |
| Launch-44-41 | OWNED-ELSEWHERE `jy-pay`, `jy-core`, `jy-pads`, `jy-cls`, `jy-pa`, `jy-pb`, `tv-y1`, `tv-y2` | |
| ACP-3/4/5 redo | OWNED-ELSEWHERE ACP redo lane | |
| RT-J3 | OWNED-ELSEWHERE routing redo lane | |
| Tier-2 shared class tokens | PARKED | Per-screen work. |
| Todos L | PARKED | |
| 424 UI functions over 50 lines | PARKED | |
| `fn50` and `c6fix` size/complexity | OWNED-ELSEWHERE their execution lanes | |
| Coverage | OWNED-ELSEWHERE coverage lane | |
| Mutation testing | OWNED-ELSEWHERE mutation lane | Sheet mutations below are combine acceptance checks. |
| Held `ex-err-jini` write set | OWNED-ELSEWHERE `ex-err-jini` | Held paths relevant to follow-ups include daemon `run-lifecycle.ts` and `http/__tests__/runs.test.ts`, chat `partial-json.ts`, MCP `core/config-shared.ts`, and admin `media/rules.ts`. Leave held files to their owner. |
| Chart version-independent pin, media where-used and import history | PARTIAL | Neighboring §I/§J backlog. They are outside the named feature changes in this round. |

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

## Tovu sheets

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

### I2-T · after I2-J, `tv-bl`, `tv-dh`, `tv-y2`, and S7b if combined · 5k tokens

**Tests first.** In `W/server/inbound/admin-http/routes/media/__tests__/byte-size.test.ts:8–83`, replace the query-count fixture with a single workspace-scoped call for distinct returned hashes. Keep stat concurrency at eight and verify known, zero, missing and failed stats. Verify zero database calls when the batch is empty or `sizeOf` is absent. Add one SQL repository case for same hash across workspaces. Mutations restore per-hash reads, remove the workspace predicate, or make zero unknown.

**Source.** Extend `SqlAssetBlobRepo.list` in `W/platform/db/repos/media-repo.ts:490–493` using the `getMany` SQL pattern at `:552–569`. Pass the hash filter to one `IN` query, with the existing workspace predicate and row mapper. In `routes/media/byte-size.ts:13–43`, read the batch once, index by SHA, and preserve the bounded stat workers. A lookup failure leaves the batch sizes unknown. Use the existing `orFallback` idiom for that lookup if needed by the error gate, with `import { orFallback } from "@jini-ai/core/errors/idioms";`. The `resolveMediaByteSizes` imports stay at `list.ts:9`, `stored-media-response.ts:4`, `trash.ts:9`, `update.ts:10`, and the test at `:4`. Inherited `SqliteAssetBlobRepo` needs no override. `byte-size.ts` retains the existing isolated-stat debt row. **STOP** if a supported SQL dialect requires splitting the supplied page into multiple queries, a new cast, or dropping the old adapter’s unknown-size behavior.

### T1 · merge-6 after `jb1` J1/J2 and `tv-c6fix` · 3k tokens

**Tests first.** Extend `W/assistant/__tests__/byok-tool-surface.test.ts`. A registered BYOK call settles one observed `tool.call`; changing the live gate to false suppresses observation on the next call while preserving its return. Mutations omit the forwarding or snapshot the gate at construction.

At `W/assistant/tool-recovery-preset.ts:99–112`, declare the two observability fields using the existing daemon executor input type and forward via the existing `...deps`. At `W/assistant/byok-tool-surface.ts:48,409,563–579,801`, forward them through `ByokToolSurfaceDeps`, `composeSurfaceExecutor`, and its construction call. Replace the existing import with `import { createAssistantToolExecutor, type AssistantToolExecutorDeps } from "./tool-recovery-preset.js";`. `assistant-byok.ts` already passes `routeDeps`. The other preset consumer, `agent-daemon-scope-tools.ts:138`, retains its call. No manifest or new debt fields. **STOP** if two executor layers observe the same call.

## Batches

| Order | Branch | Base and execution order | Executor estimate |
|---|---|---|---:|
| 1 | Jini `codex/feat2-jini` | Merge-6 plus the named pushed and in-flight prerequisites. **AG0-J → AG2-J → AG3-J → AG3A-J → AG4-J → I2-J**. `jb1` precedes AG work, `jy-pb` precedes the existing AG client edit, and `bl-jini`/`dh-jini` precede CMS work. | 40k |
| 2 | Tovu `codex/feat2-tovu` | Merge-6 plus the named refs and combined Jini build. **AG0-T → AP-T → TV-AG1 → AG2-T → AG3-T → AG4-T → I2-T → T1**. `tv-b2` precedes AG0-T. Merge E8 between AG2-T and AG3-T. I2-T follows `tv-bl`, `tv-dh`, `tv-y2` and S7b where applicable. T1 follows `tv-c6fix`. | 57k |

E8 overlaps pushed Jini `C/core/ag-ui/event-projection.ts` (`writeFrameOutcome` and `drainRunFramesToAgUi`), Jini `C/core/assistant-client/ag-ui-transport.ts` (`handleAgUiEvent`), and Tovu `assistant-ag-ui.ts` plus the new visitor error-emission seam in `site-assistant.ts`. Rebase the E8 sheet onto the extracted frame owner and the P2 visitor seam. Keep its failure round trip distinct from P3’s confirmation golden delta.

## Partial handoff

- **I1 paging.** Start from Tovu `SqlMediaRepo.list` at `W/platform/db/repos/media-repo.ts:245–250` after `tv-bl` and S7b. Created order is `(created_at DESC, id DESC)`. Reuse Jini `core/keyset-cursor.ts` for that position. A filtered query must apply workspace, visibility, trash and MIME membership before `LIMIT + 1`. `Media.tsx:1469–1515`, `use-media.hooks.ts:136,288`, and `use-media-item-link.hooks.ts:39–58` anchor the UI. The next sheet must pin a database sort matching `rules.ts:291–304` on both dialects and preserve global counts, legacy sniff classification, and deep links outside page one. The grid keeps loaded rows and actions live during a second-page fetch. Reset continuation on sort, tab and mutation changes. Preserve the existing full-list API for picker, dashboard and forms callers. **Chrome look owed** with a delayed second page and an out-of-page deep link.
- **MCP Apps.** For publishing, use Jini `mcp/src/server/tool-protocol.ts:130,212` for the declared `_meta.ui.resourceUri` and `tool-server.ts:290–332` for `resources/read` and server `extensions`. Verify the production registration that owns the first template URI before dispatch. The corresponding client negotiation goes in `federation/mcp-protocol.ts:82–95`, with HTTP `adapter.http.ts:224` and stdio `stdio/adapter.stdio.ts:230` as witnesses. Advertise the extension when that side can serve or render it. Then pin one admitted server/session/tool call through URI lookup, resource read, `_meta.ui.csp`, and tool-input/result notifications. UI owners are `ui/src/react/mcp-ui/useMcpUiHost.ts:152–177,273–329`, `ui/src/features/mcp-ui/sandbox-proxy.ts:206`, and chat `McpUiSurfaceCard.tsx:219`. The next slice covers scoped `ui/message`, `ui/update-model-context`, live `hostContext` updates, fullscreen/PiP, and draft `ui/notifications/request-teardown`. Verify that teardown closes the originating card and that card messages and model context cannot cross sessions. Tovu’s admin renderer binding is `use-dock-renderer-registry.hooks.ts:109`; product copy and host policy stay there.
- **M4 traceparent.** Start with authenticated website → daemon. The website anchors are `assistant-daemon-client.ts:155–160,223–245,336–351` and `run-daemon-http-client.ts:75–86,129–147`. Jini ingress is `daemon/src/http/runs.ts:215–230`. Use an optional opaque carrier on the existing core observability contract. The provider owns parse, serialize, and actual sampling flags. Start an outbound child before injection and retain its parent at run start through the explicit root at `otel-port.ts:171–176` after `jb1`. Prove parent/child IDs, invalid-carrier handling, and untouched disabled headers. Daemon → CLI has the post-filter handoff at `agent-executor/launch.ts:1646–1665` after `jb2`; it still needs a receiving CLI capability. Desktop startup is `tovu-server.ts:878–906` after `tv-c6fix`. An already-running site needs a separate per-action request sender identified before a sheet can claim propagation. **Electron look owed** on packaged startup and two actions against a running site.
- **M5 receiver.** Reuse `browser-analytics-http.ts:11–48` origin, rate and consent checks and `http-app/public-middleware.ts:74–76` for the receiver mount ahead of public JSON parsing. Public and site chat require full consent. Admin requires the existing session and operator setting. Require a live site observability provider as well. Use a closed body of numeric navigation timing and scrubbed error classes, with server-owned metric names. Browser URLs, messages, stacks and identifiers stay out of that body. The remaining sheet must pin one Jini diagnostics browser asset, the consent declaration and static loader at `site-cookie-consent.ts:264–302,342–364`, and stop-on-revocation wiring. Reuse the admin’s existing listeners at `apps/admin/src/main.tsx:58` where possible. Check managed and authored static pages and both site-chat boots. Disabled setup must install zero diagnostics observers and send zero diagnostics requests. **Chrome look owed** before opt-in, after opt-in, and after revocation.
- **M3 and metrics.** After T1, pair J6 settlement fields with the real BYOK producer. Use normalized totals from the recorder logic at `core/src/contracts/ai-trace/recorder.ts:189–217,283–285,340–345`, including when the AI-trace exporter is absent. Pin delta versus cumulative usage, zero versus absent, failure, and single settlement. J6’s provider files follow `jb1`; Tovu follows `tv-c6fix` and T1. Daemon usage still needs a normalized terminal summary from its execution owner. M1 needs one observation at each actual dispatch boundary. M2 needs an attach terminal boundary and an outstanding-work count. M6 needs individual webhook, form-pull, search, and plugin activation pass boundaries.

The source anchors and branch evidence above are read-only findings. Builds, tests, mutations and browser checks remain combine work. The main implementation choices in this plan are to fix both confirmation renderers together and preserve the existing exchange stores as the sole approval owners through the transport cutover.
