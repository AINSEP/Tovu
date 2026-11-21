# KEEP catch standardization

**Nine source sheets are ready.** Eight Tovu files can use the released idioms once the lockfile release lands. One Jini file can use its existing private failure counter. The Jini sheet is ready to join a batch when five compatible sheets are available.

The source anchors are Jini merge-7 `06559affb` and Tovu merge-7 `8d1a4c2742`. Tovu’s fetched merge-7 ref is `4e7f6019d8`, with only report changes after the requested anchor. I used the three named scratchpad culls for debt-a/b/c because their paths are absent from `origin/plan/culls-1120`. I used the main read-only Tovu checkout to inspect the six post-merge refs missing from the dispatch clone.

## 1. Disposition

`O` identifies a historical Jini ledger key. `T` identifies a historical Tovu ledger row. The exception lists below give the disposition for the remaining keys. A reduction is an expected source finding reduction, subject to the combine gate.

| ID | Disposition | Evidence or prerequisite |
|---|---|---|
| O121 | READY-FOR-CODEX | `analytics/src/product/fanout.ts:9–13` already counts each failed delivery through `onFailure`. |
| T167, T195, T197, T243 | READY-FOR-CODEX | The caller already owns each original rejection. After the lockfile release. |
| T321, T326, T391, T459 | READY-FOR-CODEX | The capture race, journal callers, daemon startup, and settings chain own their respective outcomes. After the lockfile release. |
| O333 / J02, O363 / J04 | RETIRE | `rs3-jini` `b81a534df` changes `page-work-budget.ts` and `mcp/src/core/config.ts`. |
| O344 gate / J03, O364 / J05, O455 / J06 | RETIRE | `jz2-b` `6a156a70e` changes outbox `boundedGate`, OpenCode `normalizeAllowedDirectoryVariants`, and runtime `attachWithinDeadline`’s `attached` promise. O344’s diagnostic guard remains below. |
| Debt-a A2 / T41 | RETIRE | Merge-7 `media-providers-port.ts:31–33` already uses `orFallback`. |
| Debt-a A5 / T150 | RETIRE | Merge-7 `session-store.ts:83–95,119–128` already uses `orFallbackSync`. The decode observer clears storage. That shipped behavior is outside these edits. |
| Debt-b B5 / T188 | RETIRE | Merge-7 `new-site-agent-plugin-tokens.ts:75–83,99–103` already uses `orFallback` at both reads. |
| Err-rows A01–A07 | RETIRE | `tv-z2` `7da3e26b33` completed the cull-approved edits. |
| Err-rows D01, D03–D06 | RETIRE | `tv-z3` `9017e3e8fb` completed them. The inventory cache-eviction catch was deliberately retained. |
| Err-rows C01–C05, C07 | RETIRE | `tv-z4` `8ad68c9aea` completed them. |
| Err-rows B01, B03–B06, C06 | RETIRE | `tv-z5` `c068ba6b3a` completed them. |
| Err-rows D02 | OWNED-ELSEWHERE `r62t-err3` | That handoff already has D02-SPLIT and D02, after `tv-rs3` and `tv-bg`. |
| Err-rows B02, C08 | PARTIAL | B02 stopped on callback narrowing at `assistant/tool-search-keywords.ts:28–29`. C08 stopped on the 73-line `composeIdentitySettings`. Re-anchor C08 after `tv-rs3` and `tv-bg`. |
| T226, T454 | PARTIAL | `afterSettled` and `observed` respectively fit, but the containing declarations exceed 50 lines. The edits need size work before dispatch. |
| Core release and Tovu locks | OPUS-CLOUD | Verify that the published artifact exports `./errors/idioms`, then resolve that artifact in the Tovu locks. Debt-c verified that the prior locked `0.7.0` artifact lacked the subpath. |
| Ledger reconciliation | OPUS-CLOUD | Shrink from combined source evidence after `jm7-b` on Jini and `tv-rs3`/`tv-bg` on Tovu. |
| Held 89-file diff | OWNED-ELSEWHERE `ex-err-jini` | Checked the held branch with the requested single merge-base diff. O121 is outside those files. |
| Hygiene-a | OWNED-ELSEWHERE hygiene cloud cull | Includes Express wrapper work. |
| Hygiene-b | OWNED-ELSEWHERE hygiene cloud cull | Existing reservation. |
| Practice | OWNED-ELSEWHERE practice cloud cull | Existing reservation. |
| Launch-44-41 | OWNED-ELSEWHERE `jy-*`, `tv-y1`, `tv-y2` | Merge-7 incorporates the launch work. |
| ACP-3/4/5 redo | OWNED-ELSEWHERE ACP redo | Existing reservation. |
| RT-J3 | OWNED-ELSEWHERE RT-J3 | Existing reservation. |
| Tier-2 class tokens | PARKED | Per-screen pass. |
| `todos.md` §L | PARKED | Owner decision. |
| 424 long UI functions | PARKED | Owner decision. |
| fn50 / c6fix | OWNED-ELSEWHERE size and complexity jobs | Existing reservation. |
| Coverage | OWNED-ELSEWHERE coverage work | Existing reservation. |
| Mutation testing | OWNED-ELSEWHERE combine and mutation work | The sheets name witnesses for the combine runner. |

## 2. Shapes and real examples

`observed` and `afterSettled` preserve an existing rejection owner. They emit no diagnostic themselves. `orFallback` and `orFallbackSync` record a failure only when an existing observer is supplied. When a fallback has no private owner, adding a step label alone falls short of the disclosure contract.

| Shape | Idiom | Before → after |
|---|---|---|
| Handle a promise early, with the original rejection still available to its owner | `observed` | T195 `provider-selection.ts:83` changes `ready.catch(() => undefined)` to `observed({ promise: ready })`. The provider still awaits `ready`. |
| Wait for an owned failure or success before continuing | `afterSettled` | T167 `visitor-tool-budgets.ts:52` changes `pending = result.catch(() => undefined)` to `pending = afterSettled({ promise: result })`. `charge` still returns `result`. |
| Skip one failed asynchronous item with an existing private counter | `orFallback` | O121 `fanout.ts:11–14` replaces the sync and async catches around `send(port)` with one fallback whose observer calls the existing `onFailure`. |
| Read optional synchronous state with an explicit default | `orFallbackSync` | The cull’s storage `getItem` catch becomes the deployed form in `session-store.ts:84`, `orFallbackSync({ work: () => storage.getItem(TRANSCRIPT_STORAGE_KEY), fallback: null, step: "Read visitor transcript" })`. The existing null branch returns `EMPTY_STATE`. New unexpected-failure conversions need a private observer. |
| Treat only a specific code or class as absence | `absentWhen` | `site-backup/sources.ts:165–171` catches `ENOENT`, returns `[]`, and rethrows other errors. The equivalent expression is `(await absentWhen({ work: () => fileSystem.readdir({ dir }), codes: ["ENOENT"], kinds: [] })) ?? []`. This neighboring example is distinct from T289’s two invalid-layout catches. |
| Run post-result cleanup through an already-injected warning logger | `bestEffort` | `cms/src/forms/submit-service.ts:280–285` awaits a discard and guards its private warning. The shape is `await bestEffort({ work: () => deps.files!.discard({ workspaceId: input.workspaceId, reference }), step: "Discard form upload", logger: deps.logger })`. This illustrates the idiom. O178 already has a separate sheet that preserves the existing warning text. |
| Branch on a failure, rethrow, or return a closed refusal | Documented exception | T333 `async-route.ts:29–32` continues to forward the original rejection, with its existing nullish-rejection handling. There is no fallback value. |
| Update state or evict a failed cache entry | Documented exception | T440 `analytics-providers.ts:54–55` continues to evict only the matching failed promise and return that promise to its caller. An `observe` callback here would own application state. |
| Contain a diagnostic sink that already received the error | Documented exception | O188 `content-deletion-cleanup.ts:34–39` continues to await the existing warning, including asynchronous sinks, and contain sink failure. Another wrapper would neither preserve that logger contract nor give the sink failure a separate owner. |
| Protect a committed result or continue iteration without a private sink | Documented exception | O38 `seo-entry.controller.ts:45–47` keeps its separate analysis refresh and generation guard. The save succeeds independently. No existing private sink was established for the refresh. |
| Capture an expected rejection in a test or preserve raw development evidence | Documented exception | O342 `fenced-conformance.ts:49–54` continues to turn the losing contender’s rejection into the harness’s `'rejected'` assertion value. |

## 3. Ready sheets

**Copy into each job brief.** Preserve behavior and all user-visible text. Make only the named source edits. No new helpers, ports, adapters, types, options, abstraction layers, dependencies, re-export shells, `eslint-disable`, `@ts-ignore`, `as any`, or `as never`. New functions use `(required, optional = {})` with meaningful object arguments. Framework signatures are exempt. Keep existing statements and why-comments verbatim except for the named replacements. Hooks are injected as props. Jini domain imports stay within the package, core, and protocol, with server/CLI presets excepted. Vendor and framework code stay at their adapters.

Functions are at most 50 lines and complexity 10. Record files over 500 lines in root `COMMIT-PLAN.md` and continue. STOP the affected sheet for a missing declaration, unlisted production importer, required cast, or limit violation. Check exact symbols with `git grep -n -F '<symbol>' -- apps/ development/ packages/`. Record extra test-only references in `REFRESH.md`. No other repo-wide scans, tests, builds, installs, type-checks, linters, codebase-memory-mcp, or Git writes. Re-read the diff, remove anything outside the sheet, and list deletions in `COMMIT-PLAN.md`. New dependencies, packages, and lock edits go to OPUS-CLOUD.

All edits are in place. The only new import lines are the idiom imports specified below. Existing importers keep their lines. Each sheet has zero export, API-baseline, injection-debt, and manifest changes. No Chrome or Electron look is owed for these swaps. For parity cases, use existing tests without edits. A **gate mutation** restores the old catch and must restore its finding. Combine owns executable mutations and ledger edits.

### Jini

**O121 · merge-7 · 1.1k executor tokens.** In `packages/analytics/src/product/fanout.ts:7–16`, `fanOutProductAnalytics`, add `import { orFallback } from "@jini-ai/core/errors/idioms";`. Delete `failed` and replace the map body at `:11–14` with:

```ts
const admissions = ports.map(port => orFallback({
  work: () => send(port), fallback: undefined, step: "Deliver product analytics",
}, { observe: () => onFailure?.() }));
```

Keep both existing why-comments with the call and retain `Promise.all(admissions).then(() => {})`. The observer passes no provider error or event data. Existing references are `product/index.ts:28` and `__tests__/{product-fanout,product-analytics}.test.ts:2,4` respectively. Existing cases at `product-fanout.test.ts:9,22,49` pin rejected delivery, synchronous throw, and a throwing observer. Remove `observe` to fail the count assertions at `:18` and `:31`. No test edit. Debt `catch-reads-error` −2 in `scripts/error-gate-debt.json` at combine. STOP if vendor starts are deferred, the counter runs twice, or the fanout result can reject. No listed post-merge source overlap.

### Tovu

All eight sheets use merge-7 **after the lockfile release**, and add `import { <named idioms> } from "@jini-ai/core/errors/idioms";` using the named import below. Paths in this subsection are relative to `apps/website/src/`. No listed post-merge source branch touches these eight files. Combine updates their `catch-reads-error` keys in `development/scripts/error-gate-debt.json`.

| Sheet | Exact edit, existing references, and acceptance |
|---|---|
| **T167 · 0.7k** | `assistant/site/visitor-tool-budgets.ts:24–56`, `createVisitorToolBudgets`. Import `afterSettled`. At `:52` use `pending = afterSettled({ promise: result });`. References `server/runtime/composition/modules/site-assistant.ts:13`, `assistant/site/__tests__/visitor-tool-budgets.unit.test.ts:3`. The case around `:52` rejects the first charge and allows a successor. Mutation assigns `pending = result`. Debt −1. STOP if `charge` returns the settlement promise or the charge ordering changes. |
| **T195 · 0.7k** | `features/comments/provider-selection.ts:65–111`, `createCommentsCapability`. Import `observed`. At `:83` use `observed({ promise: ready });`. References `server/runtime/composition/memory-deps/slices/comments.ts:6`, `server/runtime/composition/site-deps/content-resolvers-comments.ts:10`, and `features/comments/__tests__/provider-selection.test.ts:6`. Use that test’s provider cases at `:45,76` and the gate mutation. Debt −1. STOP if `ready` changes identity, provider resolution fails to await it, or early observation moves after registration. |
| **T197 · 0.7k** | `features/consent/settings.ts:34–44`, `createSiteConsentReadiness`. Import `observed`. At `:42` use `observed({ promise: ready });`. References `features/consent/__tests__/adapters.test.ts:5`, `server/runtime/composition/{app.ts:68,memory-deps/route-deps/context.ts:27,site-deps/pre-assembly.ts:22,__tests__/site-consent.ports.unit.test.ts:70}`. Existing adapters case at `:124–128` pins the original rejection and definition-before-defaults order. Use the gate mutation for the observation line. Debt −1. STOP if the original readiness can fulfill on registration failure, or the existing privacy-defaults warning moves. |
| **T243 · 0.7k** | `features/members/repo.memory.ts:56–68`, `createInMemoryCredentialLifecycle`. Import `afterSettled`. At `:62` use `tail = afterSettled({ promise: run });`. References `features/members/index.ts:71`, `features/members/__tests__/password-auth.test.ts:10`, and the barrel consumer `server/runtime/composition/http-app/mount-members-newsletter.ts:6`. Existing test `password-auth.test.ts:357–369` pins rejection and FIFO continuation. Mutation assigns `tail = run`. Debt −1. STOP if the caller receives the tail or a successor starts before the predecessor settles. |
| **T321 · 0.7k** | `features/web-screenshot/playwright-page-capture.ts:108–156`, `createPlaywrightPageCapture`. Import `observed`. At `:140` use `observed({ promise: work });`. References `features/web-screenshot/desktop-page-capture.ts:7` and the three tests `__tests__/playwright-page-capture.{deadlines.characterization,deadlines.unit,unit}.test.ts:5,5,7`. Use the hard-deadline and caller-cancel cases in `deadlines.unit.test.ts:42,150`. Gate mutation only for observation, since the race also handles the rejection. Debt −1. STOP if the race stops receiving `work`, cancellation loses its original reason, or the browser teardown moves. |
| **T326 · 0.9k** | `platform/db/journal-kernel.ts:84–116`, `gateJournalKernel`. Import `afterSettled, observed`. At `:86` use `observed({ promise: ready });`. At `:112` use `await afterSettled({ promise: ready });`. References `platform/db/sqlite/database-journal-db.ts:3`, `platform/db/__tests__/journal-kernel.test.ts:5`. Use the readiness ordering and close cases at `:49,93,110`. Mutate close to `await ready`, which masks the close result at `:110`. Use the gate mutation for observation. Debt −2. STOP if database operations cease to await the original `ready` or close skips the underlying handle. |
| **T391 · 0.8k** | `server/inbound/assistant/agent-daemon-server.ts:38–59`, `exitDaemon`. Import `afterSettled`. At `:47` use `await afterSettled({ promise: registryPublication });`. `start` awaits the original at `:222` and the startup catch reports at `:247–250`. The entry point is spawned, with no module import repoint. Existing process test `server/inbound/assistant/__tests__/integration/daemon-boots.integration.test.ts:48` addresses the entry point. Use the gate mutation for the exact catch. Debt −1. STOP if registry removal can start before publication settles or be skipped after publication fails. |
| **T459 · 0.8k** | `server/runtime/composition/modules/site-search.ts:227–257`, `createSiteSearchRuntime`. Import `afterSettled`. At `:236` use `await afterSettled({ promise: Promise.resolve(settingsReady) });`. References `server/runtime/composition/site-deps/after-assembly-forms-search.ts:27`, `server/runtime/composition/__tests__/site-search-tools.test.ts:15`, `assistant/__tests__/real-tool-catalog.fixture.ts:12`, `server/runtime/composition/modules/__tests__/site-search.unit.test.ts:20`. Cases in that last file at `:178,207` pin provider registration after both outcomes. Mutation awaits `Promise.resolve(settingsReady)` directly. Debt −1. STOP if optional readiness changes meaning or provider registration moves ahead of settlement. |

### Job order

| Order | Branch | Base and execution order | Estimate |
|---|---|---|---:|
| 1 | Jini `codex/j-keepstd` reservation | Merge-7, O121. Hold for five to seven compatible Jini sheets. O121 can follow the listed post-merge branches without a source conflict. Reconcile debt after `jm7-b`. | 1.1k for O121 |
| 2 | Tovu `codex/tv-keepstd` | Merge-7 after the lockfile release. T167 → T195 → T197 → T243 → T321 → T326 → T391 → T459. No source dependency on O121. Reconcile ledger after `tv-rs3` and `tv-bg`. | 6.0k |

Combine should update the ledgers only when there are zero `New:` or `Worse:` findings and every changed counter shrinks. The expected reductions from this handoff are two Jini findings and nine Tovu findings.

## 4. Owner exception list

**RETIRE from this conversion round** means keep the existing catch and any live ledger entry. Where a file has multiple catches, the reason applies to the cited sites. Entries drawn only from the prior reports still need the source confirmation described at the end.

### Jini

| ID / site | Plain reason |
|---|---|
| O1 agent-plugin conformance | Expected failure belongs to the conformance assertion. |
| O8 forms conformance | Expected failure belongs to the conformance assertion. |
| O12 media conformance | Expected failure belongs to the conformance assertion. |
| O26 redirects conformance | Expected failure belongs to the conformance assertion. |
| O30 security conformance | Expected failure belongs to the conformance assertion. |
| O37 SEO conformance | Expected failure belongs to the conformance assertion. |
| O38 `seo-entry.controller:47` | Detached refresh has no private sink. The save and generation guard own the visible result. |
| O42 source-control conformance | Expected failure belongs to the conformance assertion. |
| O45 widgets conformance | Expected failure belongs to the conformance assertion. |
| O52 token import `:194` | Existing safe warning. Import errors can contain tokens. |
| O60 activation `:895` | Post-rename directory sync has no private logger at this site. |
| O63 bundled file policy `:20` | Read failure requires a full scan. No private sink is available. |
| O74 adapter descriptors `:85,170` | Pure parse and direct credential-card refusal. The cull dropped the sentinel rewrite. |
| O75 package paths `:100,127` | Ancestor selection and containment depend on the catch. |
| O76 provider contribution `:85,97` | Each failing descriptor or parser produces its existing closed refusal. |
| O79 set enabled `:101` | Optional post-commit observer has no private sink. |
| O81 capability tools `:135,156` | Uninspectable output fails closed. A rewrite would need to preserve sensitive inspection semantics. |
| O95 filesystem policy `:84,106` | Inconclusive probe preserves launch eligibility and retry order. No private sink is established. |
| O97 executable resolution `:34` | Rejects an unusable candidate with no private sink. |
| O100 Pi `:56` | Optional probe returns unavailable with no private sink. |
| O102 executables `:244` | Runnability check returns false with no private sink. |
| O107 OpenCode logs `:67,79,89` | Diagnostic inputs are optional. There is no separate private sink for the diagnostic reader. |
| O117 Qoder `:50,187` | Original display value and raw stream line are deliberate outputs. No private sink is established. |
| O122 product analytics `:77,118,133–150` | Unsafe properties are refused, diagnostic faults are contained, and consent failure advances generation. Vendor handling preserves synchronous returns. |
| O125 JWT `:111` | Unreadable credential yields the existing safe verification refusal. |
| O138 fetch SSE `:93` | The lifecycle callback is the telemetry sink. Other catches in the file remain under their prior E3/E4 dispositions. |
| O166 form collection `:39,69` | Malformed plugin output and a failed provider plan remain unavailable. No private sink is established. |
| O169 attachment purge `:94` | Closed warning already goes to the supplied callback. |
| O171 form pull trigger `:23` | Original cause already reached the reporter. This handles reporter failure. |
| O175 subscriber notification `:124` | Terminal logger self-guard. |
| O188 taxonomy cleanup `:37` | Awaited optional logger already owns the cleanup cause. |
| O189 trash sweeper `:170` | Last error callback cannot stop polling. |
| O190 trash write `:68` | Reporter failure cannot reverse the completed transition. |
| O195 widget regions `:95` | REQ-27 preserves other regions. No private sink is established. |
| O196 widget instances `:39` | REQ-27/28 preserve the unresolved placeholder. No private sink is established. |
| O213 consent bridges `:11,31,34` | Mount, module-load and disposal failures leave consent authoritative. No client notice owner is established. |
| O214 consent DOM `:42,159` | Denied storage and malformed declarations leave optional content inert. |
| O215 consent runtime `:22,73,106–107,233,244` | Listener, revocation, receipt and stale-policy failures preserve retry and consent state. No applicable client diagnostic owner is established. |
| O216 consent plugins `:23` | Listener isolation keeps delivering to other subscribers. No private sink is established. |
| O217 consent extensions `:11` | Broken configuration leaves optional assets inert. |
| O220 consent region `:39` | Strict default preserves consent policy with no private resolver sink. |
| O230 settings stream `:144` | Diagnostic sink failure must leave cleanup and retry active. |
| O237 child stream `:142` | Diagnostic probe must preserve the original bridge failure. Cleanup reporting has a distinct purpose. |
| O238 event cleanup `:42,128` | Keeps terminal settlement and last-resort process cleanup independent of secondary faults. |
| O244 OpenCode MCP staging `:58,118` | Invalid inherited config selects the existing rebuild. No private owner is established. |
| O246 trace lifecycle `:55,100` | Diagnostic guard and conditional recorder eviction have control-flow effects. |
| O247 tool gaps `:27,121` | Invalid diagnostic input has a closed fallback. The host reporter already owns emission failures. |
| O249 frontend registry `:376` | Closed-channel cancellation remains authoritative. Catch persists in `jm7-a` `aad0afab7` at `:391`. |
| O254 daemon status `:95` | Failure after the reply has no private shutdown-wiring sink. |
| O257 guest scope `:24` | Unreadable signed credentials are uniformly refused. |
| O270 routine schedule `:104,128,283` | Invalid schedule or timezone yields the same unusable outcome. |
| O273 run events `:84` | One subscriber failure leaves the fanout active. No private sink is established. |
| O277 SQLite event log `:87` | Secondary synchronous close failure must preserve setup failure. No logger is in scope. |
| O282 tool handler `:66` | Optional guidance has no private sink at this write-preserving fallback. |
| O283 tool analytics `:38` | Synchronous telemetry isolation has no private sink. |
| O284 tool recovery `:329` | Unsafe prefill receives the fixed credential-free refusal. |
| O285 tool redaction `:185` | A throwing redaction observer cannot expose its own exception. |
| O286 result diagnostics `:31` | Optional summarization retains the original line. No second diagnostic sink is established. |
| O287 result media `:119` | Serialization failure keeps the existing text result. No private sink is established. |
| O289 disk headroom `:55` | `measurementFailed` already distinguishes unavailable capacity from a successful reading. |
| O301 desktop config `:19` | Optional local probe returns false. No private sink is established. |
| O309 desktop logging `:57` | Append failure is the sink’s own terminal outcome. |
| O311 install location `:64` | Unreadable launcher is skipped. No private sink is established. |
| O323 server retirement `:34` | Uncertainty preserves the server and the fence is cleared. |
| O326 repository paths `:21,42` | Invalid path input is refused without echo. |
| O329 delivery `:40,72` | Safe diagnostic classification fallback and warning-sink self-guard. |
| O330 observability fanout `:25,69,88,103,108,121,136` | Secondary sink containment preserves the operation and other adapters. |
| O331 tracker `:25,80,106` | Tracker and diagnostic callback failures are terminal at this boundary. |
| O332 lazy browser `:68` | Rejection evicts the launch and repairs active count. |
| O341 outbox drainer `:52` | Diagnostic sink self-guard. |
| O342 fenced conformance `:51,132` | Losing contender and rollback catch belong to the test harness. |
| O344 outbox worker `:32` | Diagnostic self-guard. Gate catch at `:365` is retired separately. |
| O348 credential tools `:352,455` | Closed refusal and value-free label fallback protect credentials. |
| O369 remembered approval `:74` | Callback already received the original cause. |
| O370 revocation `:78` | Sink failure cannot change the refusal. |
| O375 hosted store `:64` | A stale key can omit the token hint while preserving safe metadata. |
| O381 stdio launcher `:155` | Unusable executable is refused with no private sink established. |
| O382 federation trust `:957` | Unserializable output gets a safe report without echoing it. |
| O385 message relay `:57` | Closed result preserves unclaimed browser input. |
| O386 stdio hosting `:155` | The stop signal owns drain interruption. The catch also covers stream failure, so narrowing to abort would change behavior. |
| O394 verification `:257` | Deferred listener failure cannot undo the stored outcome. No private sink is established. |
| O409 sealed OAuth state `:77` | Tampered and otherwise unreadable state receive the same refusal. |
| O425 atomic write `:84,87` | Cleanup faults preserve the original write failure. No matching sync/async logger is established. |
| O426 boot identity `:34` | Permission or OS failure leaves identity unknown. No private sink is established. |
| O427 directory sync `:17` | Lazy lexical fallback has no private sink. |
| O428 directory user config `:88` | Validation failure enters the existing warning and quarantine policy. |
| O434 mail delivery `:63,66` | One warning per wrapper is existing state. The inner catch contains the warning sink. |
| O438 process `:141,310,335` | Process stamp and sample failures return the established unavailable values. No private sink is established. |
| O439 proxy environment `:423` | Optional system lookup can return no answer. No private sink is established. |
| O440 resource paths `:194` | Failure to resolve a user name preserves formatting of the original error. |
| O441 sandbox env `:106,129` | Canonicalization and ancestor selection follow the existing fallback policy. |
| O442 vault archive `:53` | The omission count is the safe diagnostic. Raw credential failures stay private. |
| O448 toolchain `:270` | An unreadable root preserves previously collected candidates. No private sink is established. |
| O458 quarantine `:47` | Optional observer cannot undo durable quarantine. No private sink is established. |
| O465 PostHog consent `:60,162,173` | Optional delivery, purge, and load failures cannot change consent. No private sink is established. |
| O468 OTel `:166` | Terminal exporter containment persists on `rs3-jini`. |
| O471 telemetry reporter `:36,40` | Borrowed logger and diagnostic callback are terminal sinks. |
| O472 certificate trust `:69` | Issuer or signature failure is a closed denial. |
| O479 kernel `:114` | Synchronous close cannot replace boot failure. No compatible private sink is established. |
| O480 legacy SQLite `:52` | Synchronous close cannot replace bootstrap failure. No compatible private sink is established. |
| O545 user-management conformance `:38,46,112,140,153,158` | Deliberate rejected requests belong to the harness. |
| O546 users controller `:136` | Failed identity lookup withholds actions. The feature reporter changes user-visible state. |
| O552 hasher `:99` | Invalid or foreign hashes are refused without disclosing them. |
| O553 login providers `:57` | Invalid configuration returns a closed reason. |

### Tovu

| ID / site | Plain reason |
|---|---|
| T14 login | Existing signed-out notice owner handles the failure. |
| T15 entry editor | Existing save and draft state own failure. |
| T16 collections | Existing mutation and clipboard fallback own failure. |
| T17 fields dialog | Existing edit state owns failure. |
| T18 JSON field | Parse failure updates validity and visible parse state. |
| T19 content type dialog | Existing create state owns failure. |
| T20 content analysis | Existing analysis state owns failure. |
| T23 migration | Existing migration status and retry own failure. |
| T36 integrations | Existing query and action owners retain results. |
| T39 media | Existing read and mutation state own failure. |
| T40 remote image | Invalid URL is refused before mutation. The import has its own failure state. |
| T50 plugins | Existing plugin action/query owners hold the failure. |
| T53 recovery | Existing recovery notice owns failure. |
| T54 roles | Role and policy action errors already have owners. |
| T55 access tokens | Existing action owner keeps credentials out of notices. |
| T60 site key | Existing key action owns failure. |
| T75 skills | Existing query and mutation owners retain their state. |
| T79 taxonomy form | Existing form owns failure and keeps edits. |
| T80 term form | Existing form owns failure and keeps edits. |
| T81 term picker | Existing create and load state own failure. |
| T85 `admin-http/request.ts:405` | Secondary notice publication cannot replace the request rejection. |
| T91 telemetry `:38` | Malformed escapes keep their literal route segment. |
| T125 import website | Merge-7 source has operation-specific failure reporting. The cull’s older clipboard anchor needs refresh. |
| T143 packaged smoke `:109,121` | Raw non-JSON CLI lines are legitimate smoke evidence. |
| T154 comparison `:14` | Cross-origin embed opts out of the admin comparison channel. |
| T156 vanilla host `:49` | Remove invalid image URLs before fragment insertion. Persists on `tv-rs3` at `:50`. |
| T163 run ledger | Committed settlement already goes through one redacted tracker diagnostic. |
| T165 public content | Unevaluable visibility denies. Repository failure still propagates. |
| T178 reset owner | Existing actionable refusal redacts the exact reset password. |
| T180 error formatter | Secondary formatter failure cannot replace the original error. |
| T193 vault import | Existing result counts the omission. |
| T196 consent service | Existing receipt-storage readiness problem owns the outcome. |
| T210 domain publish | Existing publish refusals preserve retry guidance. |
| T217 deliver catch | Closed configuration refusal avoids disclosing URLs that can contain answers. |
| T218 deliver text rule | Same closed configuration refusal. |
| T221 form expiry sweep | Secondary diagnostic callback cannot own the sweep outcome. |
| T229 provider operation | Existing mail refusal owns the result. |
| T230 mail test `:175` | Rejection conditionally evicts the matching cached promise. |
| T235 chat preview `:32–33` | Optional preview preserves the original media reply without a private sink in this Tovu leaf. |
| T244 member sign-in `:150` | Optional analytics cannot change the committed member. No private sink is established. |
| T245 member challenge | Typed refusal translates the known error and rethrows other errors. |
| T246 newsletter delivery | Secondary diagnostic callback cannot replace delivery. |
| T247 newsletter delivery | Existing newsletter refusal retains its guidance. |
| T249 newsletter tool | Secondary hook cannot replace the tool result. |
| T253 go-live sweep `:73` | Original error already went to `onError`. Its fault cannot stop the timer. |
| T254 preview tool | Existing preview refusal carries the guidance. |
| T268 publish order `:45` | Default collator is constructed only after failure. No private sink is established. |
| T276 visitor-tools write | Existing settings refusal owns the outcome. |
| T281 restore placement `:57` | Unreadable theme manifest selects quarantine. No private sink is established. |
| T285 share registry | Known token collision receives the existing conflict result. |
| T288 share zip | Known cap error becomes the fixed refusal. Other errors propagate. |
| T289 backup sources `:323,351` | Invalid layout names are intentionally excluded. The catches control traversal. |
| T291 static export `:47` | Invalid path segment receives the existing refusal. |
| T293 media URLs `:19,35` | Invalid origin or malformed escape excludes the media key. |
| T296 live URL | Existing egress refusal owns the result. |
| T304 provider registry `:136` | Existing per-package refusal is already safe. |
| T333 async route | Original rejection is forwarded and nullish rejection remains routable. |
| T336 server logs | Fatal capture sink self-guard. |
| T337 log buffer | Faulting listener cannot stop other subscribers. |
| T358 site trash | Malformed or externally edited entries are omitted under the existing policy. |
| T369 media provider PUT | Known write failure keeps its closed refusal. |
| T376 sites home | Unavailable folder keeps its existing refusal. |
| T384 user creation | Known identity failure keeps its existing refusal. |
| T387 daemon idle park | Disconnected passive observer cannot control shutdown. |
| T393 durable run `:19` | Invalid run context gives the existing 400. |
| T399 consent middleware `:31` | Malformed request host preserves the configured origin. |
| T407 mail feedback | Reports an incident with the same ID and leaves retry to the provider. |
| T434 boot warnings | Secondary boot notice fault cannot replace readiness. |
| T436 mail provider catalog | Diagnostic sink fault cannot replace catalog outcome. |
| T437 process guards | Fatal reporting and drain preserve shutdown ordering. |
| T439 site-key notice | Secondary notice fault cannot replace the boot outcome. |
| T440 analytics providers `:54` | Evicts only the matching rejection and preserves it for the caller. Persists on `tv-bg` at the same line. |
| T446 domain DNS | Existing egress refusal already supplies caller-safe words. |
| T458 run finalizer report | Terminal report self-guard. |
| T468 provider config `:104–105` | Secondary existence failure preserves the original open error. That probe has no separate private reporter. |
| T480 tool catalog | Known refusal translates. Other errors propagate. |
| T481 trash user tool | Known refusal translates. Other errors propagate. |

## 5. Partial verification

- **Source confirmation for inherited exceptions.** I matched the historical keys to file paths and checked the candidate sources and pushed overlaps above. The remaining exception reasons come from the supplied census and cull reports. Their exact live catch lines and any residual finding counts still need confirmation. T125 is the specific stale anchor found in this pass.
- **Size-stopped conversions.** T226 and T454 have a matching idiom but no size-compliant sheet. Err-rows B02 and C08 retain their executor STOPs. D02 already has a separate handoff.
- **Jini batch minimum.** O121 is the only new Jini sheet for which this pass verified both a drop-in idiom and an existing private diagnostic. It remains a batch reservation.
- **Verification state.** This was a read-only design pass. The named assertions, mutations, source reductions, and packed export resolution are combine checks.
