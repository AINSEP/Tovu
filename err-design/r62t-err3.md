# Merge-7 error-system dispatch

**Seven Jini sheets and three Tovu sheets are ready with the prerequisites below.** The live HTTP reporter, wire-reader migration, and sidecar handler reporter remain blocked. Round two’s 287 Jini census entries are file/rule keys covering **524 findings**. This pass gives a disposition or a specific blocker for 46 keys covering 70 findings. The remaining 241 keys are listed under PARTIAL.

Bases are Jini `06559affb` and Tovu `8d1a4c2742`, both `origin/integ/merge-7-2026-11-20`. Anchors refer to those bases unless a pushed ref is named. I used the dispatched bootstrap exception and the fixed disclosure contract. No files were changed and no checks were run.

## Disposition

| ID | Disposition | Evidence or remaining prerequisite |
|---|---|---|
| E0, E1, E2, E7 shared implementation | RETIRE | Merge-7 carries `scripts/eslint-rules/errors/`, the outbox closed-code path in `infra/src/events/outbox/worker.ts`, and `core/src/errors/{reporter,disclosure,catalog,idioms}.ts`. E7’s remaining work is at call sites. |
| E3-J-SERVER | BLOCKED · E4-J-HTTP and first real catalog binding | `server/src/route-host.ts:34–37` still supplies the HTTP-kit reporter. `create-local-node-daemon.ts:505` supplies an origin-only context. Core’s factory has no live server-preset binding. The first slice needs a host-owned operator sink, a real operation and sentence, and one returned and recorded ID. |
| E3-T-HOST | BLOCKED · E3-J-SERVER, after lockfile release | `apps/website/src/server/runtime/composition/jini-routes.ts:11` still imports `reportRouteInternalError`. Refresh the website logger and route-host inventory against the released seam. Keep the full diagnostic on the operator-only path. |
| E4-J-TRACKER | RETIRE | `jz2-a` `af7df23b6` updates `core/src/errors/reporter.ts` and its tests for original object identity and per-call `exactSecrets`. |
| E4-J-HTTP | OWNED-ELSEWHERE `ex-err-jini` | Merge-7 preserves the overlap at `http-kit/src/internal-error.ts:33–38` and `__tests__/internal-error.test.ts`. The held patch changes diagnostic copy. UUID minting still needs the E4 migration. |
| E4 route seam | NEEDS-DECISION | May the Express adapter carry the existing ID-returning `ReportRouteInternalError` callback? **Recommend yes**, in the same live slice that supplies it and removes HTTP-kit’s separate UUID minting. |
| E4-T-PINS | RETIRE | Culled. Keep the existing `user-facing-failure.test.ts` cases. Put the existing-ID and disk-space cases in the producer sheet. |
| E4-T-READERS | BLOCKED · E6a reader, after lockfile release | `apps/admin/src/lib/admin-failure-channel.ts:128–145` still reads flat and nested references and gates approved copy on session. Freeze both legacy reader directions before the producer changes. Cover flat with and without details, nested `requestId`, UUID, and missing ID. Include the export consumer’s `field: "message"` and extra details. |
| E4-T-BOUNDARY | BLOCKED · E3-T-HOST and E4-T-READERS, after lockfile release | `apps/website/src/server/inbound/shared/admin-failure.ts:69–78` still mints a UUID and includes it in the 507. Reuse a carried `ERR-…` and record one incident. Preserve 507, code and safe words with zero incident or ID for disk space. The fixed refusal contract settles the earlier 507 question. Refresh consent composition after `tv-bg`. |
| E5a-J-CORE, E5a-J-HTTP | BLOCKED · E3-J-SERVER’s first live resolver | Core `json-route.ts:69,152–153` and HTTP-kit `adapter.ts:65,108,130`, `origin.ts:16` still use the base status path. These implementation files are outside the hold. Join them in **one** Jini sheet with the first host passing `catalog.statusFor` for a real refusal. Preserve the default status and the refusal body. |
| E5a-J-DAEMON | BLOCKED · E5a live slice, held fakes, after lockfile release | Nine base callers still use `statusForError` under `daemon/src/http/`: attachment lookup, attachments, message relay, model proxy, remote run events, runs, terminals, tool-execution caller and tool-execution routes. Refresh those adapters and fakes after the release’s daemon changes. Held test files require clearance. |
| E5-J-GUARD | RETIRE | Culled as a standalone pre-emptive script. Put the browser-safe import constraint into the first actual sentence sheet. |
| E5-J-FORMS | BLOCKED · form-code/status/retry mapping | `cms/src/forms/delivery/retry-policy.ts` retains the closed ledger codes. Pin all nine sentence codes to real producers, statuses and retryability before the first live catalog slice. Persisted failure codes stay stable. |
| E5-J-VERSION, E5-T-VERSION | BLOCKED · live resolver and scoped bindings, Tovu after lockfile release | `core/src/errors/sentences.ts` already owns generic version words and the `CONCURRENT_EDIT` alias. Remaining work is scope registration and caller adoption, including current page/post handling. |
| E5-J-RULES, E5-T-RULES | BLOCKED · scoped catalog and parity manifest, Tovu after lockfile release | Verify exact refusal construction sites, statuses, and distinct model-facing text variants before moving bindings. Keep Tovu’s product words with its callers. |
| E6a-J-NOTICE | RETIRE | `jz2-a` `af7df23b6`, `ui/src/features/panel-kit/ErrorNotice.tsx`, implements the two visitor cases. |
| TV-ES1 | READY-FOR-CODEX · after lockfile release containing E6a-J-NOTICE | Both anonymous call sites still use full details on Tovu merge-7. The visible release ref in Jini lacks the new prop. The adoption sheet follows the actual artifact and Tovu lock update. |
| E6a-J-READER, E6a-J-HOOKS | BLOCKED · versioned reader fixtures and live notice owners | The leaf at `ui/src/features/panel-kit/failure-from-response.ts` needs the two-way wire compatibility proof and a real consumer. Bind existing report callbacks at the feature. |
| E6a-T-READER | BLOCKED · E6a Jini reader, after lockfile release | `admin-failure-channel.ts:75–98` can append legacy reply text to a signed-in cause. The approved incident copy is the fixed server-report sentence. Preserve session generation and the authorized export policy. |
| E6-J-CARD, E6-J-W6, E6-T-W6 | BLOCKED · E6a/E4 and feature ownership | Pin the action and notice owner and the existing draft/cache behavior. The design’s 13 Jini W6 points are ten admin, two commerce, one UI. It names no Tovu W6 point for direct replay. |
| E8-J-DAEMON | OWNED-ELSEWHERE `ex-err-jini` for `run-lifecycle.ts` and its tests | Merge-7 retains that overlap. Refresh the carrier after `jm7-a` and the daemon release. |
| E8-J-CHAT, E8-T-AGUI | BLOCKED · finished AG-UI chain and wire proof, Tovu after lockfile release | `jm7-a` `aad0afab7` supplies AG2-J/AG3-J/AG3A-J/AG4-J. The cull puts E8 **after** AG4 adoption. Prove the encoder and actual `HttpAgent` accept the carrier through live and reload, with one terminal incident and intentional abort preserved. The SIMPLE redaction change has separate ownership. |
| E9-J-FRAME | RETIRE | `jz2-a` `af7df23b6`, `sidecar/src/json-ipc.ts`, assigns fixed `BAD_FRAME` text and removes the parse-error reply helper. |
| E9-J-SPLIT | READY-FOR-CODEX · after `jz2-a` | The merge-7 declaration spans `json-ipc.ts:188–389`; the pushed frame fix alone leaves the nested handler container over the limit. The split below gives the handler its own bounded declaration. The held branch has no sidecar overlap. |
| E9-J-HANDLER | BLOCKED · E9-J-SPLIT and live host binding | Merge-7 `json-ipc.ts:352–370` uses a console logger and generic handler words. Direct references found are the sidecar export, tests, and documentation. Before changing the API, identify the real host supplying the reporter. Preserve `HANDLER_ERROR` and `requestId`, with one `ERR-…` in the reply and private record. Use the existing handler canary tests as the behavior witnesses. |
| E9-T-INVENTORY | RETIRE | Culled as a standalone sheet. The updated registration and renderer inventory belongs to E9-T-IPC. |
| E9-T-IPC | BLOCKED · E3-T-HOST, structured refusals, renderer inventory, after lockfile release | Pin live Electron registrations and renderer readers before migrating rejections. Preserve the ID across the error-string boundary. `tv-z3` leaves `desktop-agent-service.ts:305–308` for E9. |
| E10-J-PARAMS | OWNED-ELSEWHERE `ex-err-jini` | `protocol/src/errors.ts` and `src/__tests__/errors.test.ts` still overlap. The held patch changes decoder defaults and does not implement `readErrorParams`. |
| E10-T-I18N | BLOCKED · E10-J-PARAMS, E5 sentences and E6a, after lockfile release | `admin-failure-channel.ts:18` still uses `asPage`. Move to `{noun}` at the actual sentence owner, with the caller and locale keys together. |
| E11-J/T | BLOCKED · a selected clean package and ledger reconciliation | Jini `scripts/check-error-gate.mjs:115` and Tovu `development/scripts/check-error-gate.mjs:118` can still overwrite debt before comparison. Fold shrink-only protection into the first activation, including rejection of a partial `--files` update. Combine-7 reports new entries, and `jm7-b` rebases specific ledger keys. No strict package is selected here. |
| E-V-J / E-V-T | BLOCKED · paired FFmpeg bindings, after lockfile release | Jini `cms/src/media/video-frames.ffmpeg.ts:31,334–336` retains defaults. The Tovu production construction is now `server/runtime/composition/media-video-ports.ts:16`, with a separate caller in `features/media/__tests__/view-video-tool.integration.test.ts:29`. Pin the tool-catalog binding and Jini export/test closure before changing the three public inputs. This is the env slice, outside the error-census batch. |
| Releases, package/lock updates, bundle proof, gate runs and reconciliation | OPUS-CLOUD | Jini first, then Tovu locks and build. A normal full check must report zero `New:` or `Worse:` before shrinking the ledger. Check the resulting counts and named mutations. |
| J01 | RETIRE · KEEP | `adapter-descriptors.ts:170` returns a direct credential-card refusal. The cull rejected the extra sentinel. |
| J02, J04 | RETIRE | Stopped on `jz2-b`, completed on `rs3-jini` `b81a534df`. `page-work-budget.ts:83` uses `observed`; `mcp/src/core/config.ts:279` uses `afterSettled` and its realpath fallback uses `orFallbackSync`. |
| J03, J05, J06 | RETIRE | `jz2-b` `6a156a70e` covers outbox worker, OpenCode config, and plugin runtime. The other two O344 findings have separate dispositions below. |
| A01–A07 | RETIRE | `tv-z2` `7da3e26b33`, including the BYOK fallback and preserved consent event order. |
| D01, D03–D06 | RETIRE | `tv-z3` `9017e3e8fb`. The inventory eviction catch at `desktop-agent-inventory.ts:53–58` stays under the cull. |
| D02-SPLIT, D02 | READY-FOR-CODEX | `tv-rs3` skipped both because `tv-tq` was missing from that worktree. Merge-7 includes it. Reads of `tv-rs3` and `tv-bg` show the same live catches. |
| C01–C05, C07 | RETIRE | `tv-z4` `8ad68c9aea`. |
| C08-SPLIT, C08 | RETIRE | `tv-rs3` `f064021231` finishes the size and readiness steps that stopped in `tv-z4`. |
| B01, B03–B06, C06 | RETIRE | `tv-z5` `c068ba6b3a`. |
| B02 / B02-R | RETIRE | `tv-bg` `14cdf74b4e` finishes the five-file rewrite and drops the unused deployment barrel export that stopped `tv-rs3`. |
| AP-T-SPLIT, AP-T | RETIRE | `tv-rs3` `f064021231` finishes the site-chat split and behavior change. |
| E-C-J, E-O-J | RETIRE | `jz2-a` `af7df23b6` supplies explicit env to the CLI resolver and Node selector. Host adoption and publication follow their existing assignments. |

The held tip is `b79994b9c`. Its requested stat lists **89 files**. Direct conflicts include HTTP-kit `internal-error.ts` and its test, protocol `errors.ts` and its test, daemon `run-lifecycle.ts`, its lifecycle tests and HTTP fixtures, and core `contracts/server/request-body.ts` and its test. The relevant merge-7 production blobs stayed unchanged from merge-6. Every file in that stat remains **OWNED-ELSEWHERE `ex-err-jini`**, even where another edit could merge cleanly.

| Excluded item | Disposition |
|---|---|
| Hygiene-a/b and practice | OWNED-ELSEWHERE hygiene/practice cloud cull |
| Launch-44-41 | OWNED-ELSEWHERE `jy-pay`, `jy-core`, `jy-pads`, `jy-cls`, `jy-pa`, `jy-pb`, `tv-y1`, `tv-y2`; incorporated in merge-7 |
| ACP-3/4/5 redo | OWNED-ELSEWHERE ACP redo |
| RT-J3 | OWNED-ELSEWHERE RT-J3 |
| Tier-2 Tovu class tokens | PARKED |
| `todos.md` L | PARKED |
| 424 UI functions over 50 lines | PARKED |
| fn50 / c6fix | OWNED-ELSEWHERE size and complexity work |
| Coverage | PARKED |
| Mutation-testing campaign | PARKED |
| AG-UI features and M5 | OWNED-ELSEWHERE feature dispatches |
| Chat redaction, env and provider adapters | OWNED-ELSEWHERE extraction dispatches |

## Jini catch census

`O` numbers are the historical merge-6 ledger ordinals. The comparison to merge-7 uses `(file, rule)` identities. The eight older J1–J7 fixes are outside the 287; their keys are absent from the merge-7 ledger. Source categories below refer to the specific catch at the given line.

| O keys | Disposition by file and site |
|---|---|
| 1, 8, 12, 26, 30, 37, 42, 45 | **KEEP.** The admin conformance runners for agent plugins, forms, media, redirects, security, SEO, source control and widgets deliberately test rejection or convert thrown assertions into the harness’s failed-case result. |
| 47, 51, 53 | **BLOCKED E3/E4.** `external-links.ts:74` needs the host owner for link-opening faults. `connect/executable/register.ts:52` must keep deny on a permission fault; `:137` can use `afterSettled` after a dedicated size split and original-promise proof. `plugin-credential-card.ts:68` needs a private warning owner; its URL refusal at `:42` is exempt. |
| 74, 169, 341 | **KEEP.** `adapter-descriptors.ts:170` is the culled J01 refusal; its `:85` is pure parse. `forms/attachment-purge.ts:94` already sends the closed `invalid-submission` warning through its provided callback. `outbox/drainer.ts:52` isolates a failing diagnostic sink. |
| 88, 123 | **BLOCKED E3/E4.** `json-line-stream.ts:39–42` catches dispatch as well as parsing. `artifacts/manifest.ts:347–351` covers validation as well as parsing. Verify the two failure owners before narrowing either scope. |
| 126, 133, 134, 308, 397 | **READY.** Chat storage, chat tool input and output display, desktop geometry cache, and OAuth cancellation. Six sites on five keys. See sheets. |
| 132, 138 | **BLOCKED E3/E4/E8.** `run-events/entry.ts:390,441,507` mix reason decoding, transport cleanup and wire validation. Refresh those sites after AG-UI integration. `embed-widget/transports/fetch-sse.ts:60,71,181` need cleanup ownership, `:193` needs the safe error-body reader, and `:93` **KEEP** for telemetry isolation. |
| 183, 222, 226 | **BLOCKED E3.** `redirects/hit-sink.ts:80` drops a write failure; keep request isolation. `verified-origin/origin.ts:176` must still fail closed while gaining a private repo-fault owner. `provider-registry.ts:181` needs classification of unexpected validator failure under the existing admission refusal. |
| 218 | **OPUS-CLOUD**, after lockfile release, if selected. `cookie-consent/src/node/index.ts:67` can use `afterSettled` on the previous write and still expose `pending`. The package needs a core dependency. |
| 309, 332 | **KEEP** `desktop-host/src/logging.ts:57` as the logging sink’s own append-failure return. In `lazy-browser.ts`, **BLOCKED E3** at `:56` for cleanup ownership; **KEEP** `:68` for cache eviction and active-count repair. |
| 322 | **PARTIAL.** E-O-J changes env injection in `local-dev/node-runtime.ts`; that change provides no catch disposition. |
| 333, 363, 364, 455 | **RETIRE.** `rs3-jini` closes O333/O363 and `jz2-b` closes O364/O455. Retire source work now; verify ledger reductions at combine. |
| 334, 344, 349 | **BLOCKED E3/E4** for default Chromium launch fallback in `playwright-runtime.ts:104` pending failure-owner proof; uncertain publish in `outbox/worker.ts:388`; and durable outcomes in `operation-runtime.ts:150,192,229`. At O344, **KEEP** the sink self-guard at `:32`; **RETIRE** the gate catch at `:365` on `jz2-b`. |
| 400, 435, 451 | **BLOCKED E3/E4.** `endpoint-safety.ts:93` needs cleanup ownership and must preserve the redirect refusal; `:38` is exempt. `mail/domain-read.ts:25` masks credential failure as absence. `plugins/host/node/install.ts:222,369,432` need distinct private causes for identity, source inspection and rollback; `:183` is parse over an in-memory payload. |
| 430 | **OWNED-ELSEWHERE `bg-jini`** for `platform/src/fs/file-lock.ts`. Recheck the three findings against the lock-owner change and release before assigning any new edit. |
| 478, 481, 484 | **BLOCKED E3/E9.** `create-local-node-daemon.ts:443,545` need preset ownership. `sidecar/src/json-file.ts:22` conflates read and parse failures. `supervision/supervisor-node.ts:79,84,163,232,262` need the IPC/teardown owner while preserving escalation, disposal and settlement. |
| 547, 555 | **BLOCKED E3/E6.** `people.rules.ts:15` must deny when ownership is unknown; add private reporting only at the owner. `vibecoding/src/core/history.ts:152` needs the distinction between missing history and unexpected reads. |

**U, 82 keys.** U550’s roster settlement at `use-members.hooks.ts:164` is ready. Its keyed detail catch at `:210` stays with the existing owner until E6a/E6 pins result and cache handling. U521 is **BLOCKED on size first**: `ResourceRowList.tsx:38–101` is 64 lines. The exact candidate is `observed({ promise: list.dispatchRowAction(id, () => onRowAction(id, kind)) })` at `:96`, with `list.actionError` as owner. A split would need to carry the existing view props and event ordering verbatim; that split is PARTIAL. The other 80 keys remain **BLOCKED E6a/E6**. U198–199 checkout also needs the serialized storefront reader and ID-only behavior. Preserve order ID and save-before-payment ordering.

**W, 111 keys.** **BLOCKED E3/E4**, plus E6a where a reader consumes the response, E8 for chat and E9 for IPC. The earlier W6–7 admin-transport sentinel needs the old parsed-null distinction preserved. W115–116 provider reads need a private cause owner. W383–384 MCP HTTP needs the live E3 reporter. W556–557 vibecoding has a settlement-shaped queue tail and a separate cause already retained by `ProjectError`. The remaining keys need live boundary and test anchors before dispatch.

## READY sheets

### Rules to copy into both job briefs

Behavior identical except for the named TV-ES1 disclosure change. New public APIs use `(required, optional = {})` with meaningful object arguments. Framework-dictated signatures are exempt. No optional pads, re-export shells, new dependencies, `eslint-disable`, `@ts-ignore`, `as any`, or `as never`. Functions at most 50 lines and complexity at most 10. Record files over 500 lines in `COMMIT-PLAN.md` and continue. STOP the affected sheet for a missing declaration, unlisted production importer, required cast, or limit violation. Use the exact symbol lookup `git grep -n -F '<symbol>' -- apps/ development/ packages/`. Record additional test-only references in `REFRESH.md`. No other repo-wide scans, tests, builds, installs, type-checks, linters, codebase-memory-mcp, or Git writes. Keep `COMMIT-PLAN.md` at repo root.

Move statements and existing why-comments verbatim. Add only the names and bindings listed. No unrelated edits, defensive paths, new adapters, unused options, or speculative generality. Keep hooks injectable as props, vendor code in provider packages, and framework-specific code at the adapter. Jini domain imports use their own package, core, and protocol. Server/CLI presets are excepted. Keep product identifiers and copy in Tovu. Every approved Jini product-name rename records each compatibility break on a `BREAKS:` line. New packages, dependency changes and lockfiles are OPUS-CLOUD. Re-read the diff and record extraneous deletions in `COMMIT-PLAN.md`.

The sheets below are in-place edits with zero importer repoints or new export entries. Listed existing imports identify the caller closure. Except where stated, there are no manifest, API-baseline, or injection-debt edits, and no Chrome or Electron look. Existing test cases are the acceptance witnesses. Run mutations only in combine.

### Jini

**E9-J-SPLIT · after `jz2-a` `af7df23b6` · 4.8k tokens**

- **Tests first.** Use `sidecar/src/__tests__/json-ipc.contract.test.ts` success trace `:172`, handler failure `:228`, fixed frame refusal `:247`, idle `:309`, byte cap `:323`, second frame `:363`, plus the UTF-8 round trip in `index.test.ts:646`. Keep the pushed BAD_FRAME assertions. Combine mutation removes `clearTimeout(idleTimer)` from `claimFrame`; the after-claim lifetime witness is `index.test.ts:1148` with a handler still pending across the idle deadline. Also drop the `handled` check to prove the second-frame case.
- **Edit** `packages/sidecar/src/json-ipc.ts` only. In `createJsonIpcServer` at merge-7 `:188–389`, replace the `createNetServer` listener body at `:201–373` with a call to private `bindJsonIpcSocket({ socket, socketPath, handler, maxFrameBytes, idleTimeoutMs })`. Import `Socket` as a type in the existing `createConnection` import from `node:net`. The exact moved blocks are below. Apply by contents after the 25-line deletion in `jz2-a`.
  - `bindJsonIpcSocket` owns `:204–246` including `handled`, decoder, connection trace, idle timer and `claimFrame`. At the two existing listener setup positions call `bindJsonIpcSocketTraces` and `bindJsonIpcData`. Pass `isHandled: () => handled` and the existing `claimFrame` to the data binder.
  - `bindJsonIpcSocketTraces` takes `{ socket, socketPath, traceId, startedAt, idleTimer }` and holds the existing error and close listeners `:247–271`.
  - `bindJsonIpcData` takes `{ socket, socketPath, handler, maxFrameBytes, traceId, startedAt, decoder, isHandled, claimFrame }`. It owns `buffer` and `receivedBytes` from `:202–203` and the data listener `:272–303`. The guard uses `isHandled()`. After the existing buffer slice, await `parseAndDispatchJsonIpcFrame({ socket, socketPath, handler, traceId, startedAt, frame })`.
  - `parseAndDispatchJsonIpcFrame` owns `:304–336`, then awaits `dispatchJsonIpcHandler({ socket, socketPath, handler, traceId, startedAt, message, messageSummary })`. `dispatchJsonIpcHandler` owns `:337–371`. Use existing `JsonIpcHandler`, and `ReturnType<typeof summarizeJsonIpcMessage>` for the summary. Preserve the handler invocation and all trace and socket statements.
- **Imports and STOP.** Existing `sidecar/src/index.ts:57` export and direct test imports in `audit-regressions.test.ts:6`, `json-ipc.contract.test.ts:10` and the `index.test.ts` import block stay at their current entry points. STOP if claiming, timer cancellation, handler start, listener installation or reply order changes; any split requires a new state object or cast; or any resulting declaration exceeds the limits. This sheet records zero ledger delta. The incident behavior is E9-J-HANDLER.

**O126 · merge-7 · 1.4k tokens**

- **Tests first.** `packages/chat/src/core/__tests__/agent-plugin-chat-state.test.ts:55–63,102–118` covers malformed or denied reads, denied writes and change notification. Mutate each idiom call to invoke its `work` directly.
- **Edit** `packages/chat/src/core/agent-plugin-chat-state.ts:19–35`. Add `import { orFallbackSync } from '@jini-ai/core/errors/idioms';`. In `readAgentPluginChatState`, run the existing `usableChatState` expression in `work`, with `fallback: null` and `step: 'Read stored chat plugin state'`; return the result with the existing empty state as the lazy `??` operand. In `writeAgentPluginChatState`, wrap only the original optional storage write with `fallback: undefined` and `step: 'Save chat plugin state'`. Preserve the why-comments and dispatch the existing event afterward. Leave `browserStorage:7–9` alone.
- **Imports and STOP.** Direct references in `core/assistant-client/transport.ts:1`, `core/__tests__/agent-plugin-chat-state.test.ts:5–6`, `core/assistant-client/__tests__/transport.test.ts:16` mock, `react/features/chat-pane/components/AgentPluginUsage.tsx:3`, its test `:4`, and `react/index.ts:397` keep their entry points. Expected `catch-reads-error` −2. STOP if the lookup moves outside the protected work, the empty state becomes shared, or dispatch moves inside the fallback.

**O133 · merge-7 · 0.8k tokens**

- **Tests first.** `packages/chat/src/core/__tests__/tool-call-detail.test.ts:66–71` expects no rendered input for a circular value. Mutation calls `JSON.stringify` directly.
- **Edit** `packages/chat/src/core/tool-call-detail.ts:87–95`, `serializeInput`. Add `import { orFallbackSync } from '@jini-ai/core/errors/idioms';`. Replace only the try/catch with `return orFallbackSync({ work: () => JSON.stringify(input, null, 2) ?? null, fallback: null, step: 'Format tool input for display' });`.
- **Imports and STOP.** `serializeInput` has one local call at `:52`. Existing public consumers use `core/index.ts:12`; `react/components/ToolCard.tsx:27` and `core/__tests__/tool-call-detail.test.ts:2` retain their imports. Expected −1. STOP if an input guard or the later redaction/truncation would move.

**O134 · merge-7 · 0.8k tokens**

- **Tests first.** `packages/chat/src/core/__tests__/tool-output.test.ts:9–16` pins pretty-printed arrays/objects and original malformed text. Mutation removes the wrapper around parse and stringify.
- **Edit** `packages/chat/src/core/tool-output.ts:12–21`, `formatToolOutputForDisplay`. Add `import { orFallbackSync } from '@jini-ai/core/errors/idioms';`. Replace the try/catch with `return orFallbackSync({ work: () => JSON.stringify(JSON.parse(trimmed), null, 2), fallback: text, step: 'Format tool output for display' });`.
- **Imports and STOP.** `core/index.ts:11`, `core/tool-call-detail.ts:7`, `core/__tests__/tool-output.test.ts:2`, and `react/components/__tests__/ToolCard.test.tsx:6` retain their imports and export. Expected −1. STOP if the fallback is trimmed text or stringify leaves the protected work.

**O308 · merge-7 · 0.9k tokens**

- **Tests first.** `packages/desktop-host/src/electron/usability/__tests__/host-ports.test.ts:33` pins centered geometry with a throwing store; `window-bounds-store.test.ts:56` pins invalid persisted data. Mutation makes the store read escape.
- **Edit** `packages/desktop-host/src/electron/usability/window-bounds-store.ts:16–26`, `readWindowBounds`. Add `import { orFallbackSync } from '@jini-ai/core/errors/idioms';`. Replace try/catch with `return orFallbackSync({ work: () => { …existing body of try… }, fallback: null, step: 'Read saved window bounds' });`. Preserve the original expressions and existing type assertions.
- **Imports and STOP.** `restoreWindowBounds:54` is the local caller. Keep the `usability/index.ts:5` export, `host-ports.test.ts:3` and `window-bounds-store.test.ts:1` imports. Expected −1. STOP if store access or geometry validation leaves the fallback or if any new assertion is needed.

**O397 · merge-7 · 0.8k tokens**

- **Tests first.** `packages/oauth/tests/bounded-json-cleanup.test.ts:8` proves a rejected cancel preserves the original OAuth overflow error and performs one cancellation. Mutation uses `await reader.cancel()` directly.
- **Edit** `packages/oauth/src/bounded-json.ts:33`, `readBoundedOAuthText`. Add `import { afterSettled } from '@jini-ai/core/errors/idioms';`. Replace only the catch chain with `await afterSettled({ promise: reader.cancel() });` inside the existing `finally`.
- **Imports and STOP.** Direct caller `src/guarded-transport.ts:2`; tests `tests/bounded-json-cleanup.test.ts:3` and `tests/bounded-json.test.ts:4`. Other named imports of the same file in `discovery.ts:12`, `oidc.ts:8`, `registration.ts:12`, `revocation.ts:3` and `token-endpoint.ts:9` keep their lines. Expected −1. STOP if cancellation becomes detached, runs twice, or the overflow error can be masked.

**U550 roster only · merge-7 · 0.9k tokens**

- **Tests first.** `packages/user-management/src/react/members/__tests__/fqfix-disable.unit.test.ts:9,39` pins waiting for the roster and preserving the accepted disable when refresh rejects. Mutation awaits the rejecting `listLoader.load()` directly.
- **Edit** `packages/user-management/src/react/members/hooks/use-members.hooks.ts:159–169`, `onDisable`. Add `import { afterSettled } from '@jini-ai/core/errors/idioms';`. Replace `:164` with `await afterSettled({ promise: listLoader.load() });`, keeping the existing inline comment and all neighboring state updates.
- **Imports and STOP.** `src/react/index.ts:17–18`, `members/Members.tsx:8`, `fqfix-disable.unit.test.ts:6`, `use-members.hooks.pins.test.ts:6` and `use-members.ported.test.ts:5` retain their imports and exports. Expected −1; `:210` stays in the ledger. STOP if completion is no longer awaited or the accepted disable can become an action error due to the roster rejection.

### Tovu

**D02-SPLIT · merge-7 after `tv-rs3` and `tv-bg` combine · 1.4k tokens**

- **Tests first.** `apps/desktop/src/desktop-resources.test.ts:319,677` pins labelled RSS, one-minute throttle and newly seen PIDs. Mutation drops the throttle.
- **Edit** `apps/desktop/src/desktop-resources.ts:171–202`, `createDesktopResources`. Move `:172–188` verbatim to private `createDesktopPanelMemorySampler({ ports }: { ports: DesktopResourcesPorts })` in the same file. Return `samplePrivateMemory ? panelMemory : undefined`. At the old location set `const panelMemory = createDesktopPanelMemorySampler({ ports });`, and at `:202` pass `samplePrivateMemory: panelMemory`. Initialize selection and cache before the existing history initialization. The cut takes the 61-line factory below the limit.
- **Imports and STOP.** Existing production import `apps/desktop/src/main/index.ts:142`. Existing tests `desktop-resources.test.ts:6`, `desktop-reported-regressions.test.ts:17`, `product-memory-telemetry.test.ts:6`, `resources-ipc.test.ts:6`, `renderer/ResourcesPanel.render.test.ts:13`, `renderer/use-resources.hooks.render.test.ts:7`. Zero ledger delta. STOP if this adds a timer, changes the optional sampler passed to `readDesktopMemory`, or changes cache lifetime.

**D02 · after D02-SPLIT and lockfile release resolving the existing idioms leaf · 1.4k tokens**

- **Tests first.** `desktop-resources.test.ts:319,539` pins labelled RSS on native failure and unavailable inventory followed by recovery. Mutations allow each respective rejection to escape.
- **Edit** `apps/desktop/src/desktop-memory-sampler.ts:30–46`, `readDesktopMemory`. Add `import { orFallback } from '@jini-ai/core/errors/idioms';`. Keep the early return and wrap the existing try body as async work, with its existing `fallback` and step `'Read desktop private memory'`. In `desktop-resources.ts:197–203`, `sample`, replace the mutable `usages` and try with `const usages = await orFallback({ work: async () => { …existing listUsage and return of readDesktopMemory… }, fallback: [], step: 'Read desktop process inventory' });`. Reuse the import at `:3`.
- **Imports and STOP.** The sampler’s only direct importer is `desktop-resources.ts:7`. Service callers are listed in D02-SPLIT. A106/A107 each −1 in combine. STOP if native failure empties inventory, inventory failure preserves stale CPU history, or `groupSample` moves inside the fallback.

**TV-ES1 · merge-7 after lockfile release containing `jz2-a`’s UI prop · 2.7k tokens**

- **Tests first.** In `apps/admin/src/features/auth/__tests__/Login.unit.test.tsx:32`, convert the Spanish incident case to assert the existing ID, `Informa de este ID de error.` and absence of details/copy controls. Remove only that case’s obsolete clipboard setup. In `OwnerRecoverySignIn.unit.test.tsx:50`, use the existing injected-hook case with a formatted incident carrying an ID; assert the ID and absence of copy controls. In the existing rate-limit case at `:31`, keep the refusal text and private-password assertions and change the copy-control expectation to absence. Mutation removes `disclosure="id-only"` at each call site independently.
- **Edit** `Login.tsx:52` and `OwnerRecoverySignIn.tsx:26` to pass `disclosure="id-only"` on the existing `ErrorNotice`. Append `Report this error ID.` to `auth-i18n.ts:32` `DETAILS_KEYS` and append its translation to every existing `DETAILS_COPY` array at `:34–54`. Merge-7 has **21 translated rows**, including Indonesian, so use all rows despite the cull’s stated count of 20. `Login.hooks.ts:1,4` uses this dictionary and `Login.tsx:58` passes the bound translator to recovery.
- **Imports and STOP.** Keep `Login.tsx:6` and `OwnerRecoverySignIn.tsx:2` imports from `@jini-ai/ui/panel-kit`; `features/auth/index.ts:8`, `App.tsx:26`, the two affected test imports, `login-default-credential.unit.test.tsx:9`, and the two app-session test imports at `:8` and `:10` retain their entry points. No debt delta. Combine Chrome look on both signed-out screens with an incident fixture. STOP if another production recovery mount bypasses the verified translator or the packed UI entry has no disclosure prop.

## Job order

| Order | Branch | Base and sequence | Executor estimate |
|---|---|---|---:|
| 1 | `codex/j-err3` | Jini merge-7 plus `jz2-a`. E9-J-SPLIT → O126 → O133 → O134 → O308 → O397 → U550 roster. `rs3-jini` and `jz2-b` supply retired work. Reconcile debt after `jm7-b`. | 10.4k |
| 2 | `codex/tv-err3` | Tovu merge-7 after the `tv-rs3`/`tv-bg` combine and the applicable lockfile release. D02-SPLIT → D02 → TV-ES1. Use the Jini release that actually contains E6a-J-NOTICE. | 5.5k |

The Tovu reservation has three verified sheets. Hold it for compatible ready work if the 6–8-sheet size is mandatory. Replaying retired edits or splitting the two coupled resource fallbacks would add dispatch work without advancing the extraction.

## PARTIAL

The unresolved **241 O keys / 454 findings** are listed below by historical ordinal. Their ledger identities are accounted for, but their source disposition is still open. A ledger count, a historical line, or a filename alone cannot establish a current catch’s behavior. The remaining review needs the live catch, its return or settlement behavior, and its diagnostic owner before assigning KEEP, an idiom, or a particular E blocker.

`2–3, 38, 48, 52, 54–55, 60, 62–64, 73, 75–82, 89, 93–95, 97, 99–102, 104–112, 114, 117–118, 120–122, 124–125, 127, 129–130, 157–158, 160–161, 165–166, 171, 175–176, 178, 182, 184, 186–190, 193–197, 200, 202, 205–208, 210–217, 219–220, 228, 230–234, 237–240, 242, 244–255, 257, 260–261, 264, 267–274, 276–278, 280–290, 293–294, 296–299, 301–302, 305–307, 310–311, 314–316, 319–321, 323–326, 328–331, 335–338, 342, 345–348, 350–352, 369–373, 375, 380–382, 385–387, 393–394, 406, 409, 416–418, 421–428, 433–434, 436–442, 444, 447–450, 452, 454, 456–458, 460, 465–466, 468–475, 477, 479–480, 485, 545–546, 552–554`.

O322 is a separately identified partial key in the table. The U521 and O51 size cuts also lack executable split sheets. U/W classifications beyond the named exceptions are group-level. The 287-key result therefore remains a **partial source census**, and combine still owes the named acceptance checks and ledger reconciliation.
