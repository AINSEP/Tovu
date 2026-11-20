## Disposition

The replacements use the stopped jobs’ original source bases. The batch table gives the branch order for combining them. For M5, the public consent client exposes `get()` and `subscribe()` through its existing bridge API. That supplies the revocation seam for managed pages, live authored pages, and both site-chat boots.

| ID | Disposition | Reason |
|---|---|---|
| J02 | READY-FOR-CODEX | Verified the four production and two test importers of `PageWorkBudget`. The edit is in place. |
| J04 | READY-FOR-CODEX | The requested root export removal is a published API break. No tracked production caller imports the writer from the root. The held test imports through the internal core barrel, which still resolves. |
| J-06 | READY-FOR-CODEX | `call-shape-sweep.tsv:16753` is a generated documentation reference. Explicitly leave it. |
| AP-T-SPLIT → AP-T | READY-FOR-CODEX | Split the 67-line vanilla factory and its 64-line callback, then fix both renderers with failing tests first. |
| C08-SPLIT → C08 | READY-FOR-CODEX | Split the 73-line persistent composition function, then replace the two detached catches. Consumers retain their original promises. |
| B02 | READY-FOR-CODEX | Capture `optional.sources` before the callback and preserve its method receiver. |
| ACP-8 | PARKED | HELD. Switch on only after cloud parity. |
| M5-J → M5-T | READY-FOR-CODEX | Jini owns the browser-native collector. Tovu owns the receiver, route, metric labels, provider selection, and consent wiring. |
| M5 full Web Vitals SDK | OPUS-CLOUD | SDK dependency and lockfile are outside the native receiver slice. |
| AG0-J | READY-FOR-CODEX | `jb1` still lacks the two test assertions. `entry.ts:62–64,136–159` already implements both outcomes. |
| D02-SPLIT → D02 | READY-FOR-CODEX | `tv-tq` and `tv-split` have identical sampler files. Both fallback catches survive. `createDesktopResources` is 61 lines and needs a split first. |
| J03, J05, J06 from `jz2-b` | RETIRE | Executor completed them on `6a156a70e`. `J-06` with a hyphen is the separate CLI sheet above. |
| Hygiene-a/b + practice | OWNED-ELSEWHERE cloud cull | Existing dispatch. |
| Launch-44-41 | OWNED-ELSEWHERE `jy-pay`, `jy-core`, `jy-pads`, `jy-cls`, `jy-pa`, `jy-pb`, `tv-y1`, `tv-y2` | J-06 is the explicitly requested stopped remainder. |
| ACP-3/4/5 redo | OWNED-ELSEWHERE ACP redo | Existing dispatch. |
| RT-J3 | OWNED-ELSEWHERE RT-J3 | Existing dispatch. |
| Tier-2 Tovu class tokens | PARKED | Per-screen work. |
| `todos.md` section L | PARKED | Owner hold. |
| 424 UI functions over 50 lines | PARKED | Owner tabled the sweep. AP-T splits its own bug-fix function. |
| `fn50` / `c6fix` | OWNED-ELSEWHERE size and complexity jobs | Existing sheets. |
| Coverage | OWNED-ELSEWHERE coverage work | Existing scope. |
| Mutation testing | OWNED-ELSEWHERE combine | Mutations below are acceptance witnesses. |
| `ex-err-jini` | OWNED-ELSEWHERE `ex-err-jini` | Held branch’s requested stat lists 89 files. Relevant overlap is `packages/mcp/src/core/__tests__/config.test.ts`. |

## READY sheets

Copy this block into each job brief and apply it before every edit.

```text
Behaviour identical except for the named AP-T and M5 behavior and J04’s
specified root API removal. API args (required, optional = {}) for NEW
functions only, with framework-dictated signatures exempt. No re-export
shells, new deps, eslint-disable, @ts-ignore, as any or as never. Functions
<= 50 lines and complexity <= 10. Record files over 500 lines in root
COMMIT-PLAN.md and continue. STOP the affected sheet if a named declaration
is missing, an unlisted PRODUCTION importer appears (git grep -n -F
'<symbol>' -- apps/ development/ packages/), a cast is needed, or a function
exceeds either cap. Unlisted TEST importers needing only the same repoint
are fine, record in REFRESH.md. Hooks are injected as props. No vendor code
or specific server framework in Jini domain packages. Anything needing a
lockfile change, new npm dependency or new Jini package is OPUS-CLOUD.

Only named source and test edits. No repo-wide scans beyond the specified
symbol checks. No tests, builds, installs, type checks, linters or
codebase-memory-mcp. .git is read-only. Apply the owner’s minimal-diff rule.
Move named statements and why-comments verbatim, in order. Add only the
named helpers, fields, cases and mutations. Re-read the diff, delete
extraneous edits and list those deletions in root COMMIT-PLAN.md.
```

Paths below use `P＝packages`, `W＝apps/website/src`, `R＝W/server/runtime/composition`, `S＝apps/site-chat/src`, and `D＝apps/desktop/src`. Import lines shown for in-place changes are retained. Error-gate rows refer to `(file, catch-reads-error)`. Combine runs the tests, applies the named mutations, and updates debt or API baselines once verified.

### J02 · Jini · `jy-core` `949c622a1` · 1.1k tokens

- **Tests first.** Use the existing exhausted-budget late-rejection case in `P/diagnostics/src/web-evidence/__tests__/page-work-budget.test.ts:74–91`. Mutation removes `observed`, leaving the late rejection unhandled. Restoring the original catch exercises the gate.
- **Edit.** In `P/diagnostics/src/web-evidence/page-work-budget.ts`, `PageWorkBudget.release` at `:79–89`, add `import { observed } from "@jini-ai/core/errors/idioms";`. Replace only `void closing.catch(() => {});` at `:82` with `observed({ promise: closing });`. Keep `close()` and the live-budget wait in their original positions.
- **Importers.** `collect-page-evidence.ts:48`, `playwright-browser.ts:25`, `public-page.ts:6` each retain `import { PageWorkBudget, PageWorkTimeout } from "./page-work-budget.js";`. `render-page.ts:2` retains `import { PageWorkBudget, PageWorkDeadline, PageWorkTimeout } from "./page-work-budget.js";`. `__tests__/page-work-budget.test.ts:7` retains `import { PageWorkBudget, PageWorkTimeout } from '../page-work-budget.js';`. `__tests__/render-page.test.ts:9` retains `import { PageWorkBudget } from "../page-work-budget.js";`. All paths are under `P/diagnostics/src/web-evidence/`.
- **Accounting and STOP.** O333 −1. No export, manifest, injection or visual check. STOP if the exhausted path starts waiting or `close()` can be skipped.

### J04 · Jini · `jy-core` `949c622a1` · 1.8k tokens

- **Tests first.** In `P/mcp/src/__tests__/index.test.ts:8–33`, remove `writeMcpConfig` from the positive export list and add `expect(mcp).not.toHaveProperty('writeMcpConfig');` in that test. Restoring the root export makes it red. Use the existing config writer failure, serialization, and missing-path containment cases in `P/mcp/src/core/__tests__/config.test.ts` as combine witnesses. For queue behavior, mutate the new await chain to plain `prev.then(...)` and queue a second write behind a failing first write. For containment, remove the lexical fallback and exercise a missing child under the projects directory.
- **Edit.** In `P/mcp/src/core/config.ts:273–285`, use `const task = afterSettled({ promise: prev }).then(() => doWrite(dataDir, body, files));`. At `:302–308`, return `orFallbackSync({ work: () => realpathSync.native(p), fallback: undefined, step: 'Resolve MCP config path' }) ?? path.resolve(p);`. Add `import { afterSettled, orFallbackSync } from '@jini-ai/core/errors/idioms';`. Delete `writeMcpConfig,` at `P/mcp/src/index.ts:15`.
- **Importers.** The root test keeps `import * as mcp from '../index.js';` at `:2`. `P/mcp/src/__tests__/args-convention.unit.test.ts:2` already imports the writer from `'../core/config.js'`. Under `P/mcp/src/core/__tests__/`, `config.write.unit.test.ts:3` retains `import { writeMcpConfig, type McpConfigFilesPort } from '../config.js';`, and `secret-defaults.test.ts:39` retains `import { writeMcpConfig } from '../config.js';`. The held `config.test.ts:7–19` imports `../index.js`, which resolves to `P/mcp/src/core/index.ts:10` and its existing `export * from './config.js';`. Leave that held test and the internal barrel. `resolveRealOrLexical` has only the local default reference at `config.ts:326`.
- **Accounting and STOP.** O363, two catch sites. Combine removes `writeMcpConfig` from the root baseline at `api-baseline/jini-ai__mcp.json:108` and reconciles the public references in `P/mcp/{API.md,README.md,docs/spec/api.spec.md}`. No manifest, injection or visual change. STOP if a tracked root consumer appears or the queue begins returning its settlement promise. The package declares no public config subpath.
- **BREAKS:** Consumers importing `writeMcpConfig` from published `@jini-ai/mcp` lose that import. There is no supported deep-import replacement in this sheet.

### J-06 · Jini · `jy-pb` `42031785d` · 0.8k tokens

- **Tests first.** Existing `P/cli/src/__tests__/prompt-read-file-settled.test.ts:43,52` covers late error after end and late end after size rejection. Keep the hoisted `node:fs` mock at `:16`. No test edits or mutation plant. Removing the static binding fails the combine build.
- **Edit.** In `P/cli/src/prompt.ts`, immediately after the header ending at `:34`, add `import { createReadStream } from 'node:fs';`. Delete `const { createReadStream } = await import('node:fs');` from `defaultReadFile` at `:110`. Its only executable reference is local at `:105`. **Leave `P/daemon/docs/call-shape-sweep.tsv:16753`**, a generated snapshot of a historical comment.
- **Accounting and STOP.** No caller repoints, export, manifest, baseline, debt or visual change. STOP for another executable reference to `defaultReadFile` or a public baseline entry. The named TSV row is allowed.

### AG0-J · Jini · `jb1` `6da21feaf` · 1.1k tokens

- **Tests first and entire edit.** Add two cases to `P/chat/src/core/run-events/__tests__/payload.test.ts` after the existing cases at `:20–22` and `:59–62`, using the existing wrapper for `translateRunAgentPayload` from `'../entry.js'` at `:3–5`. Port the assertions from Tovu `tv-b2:W/server/runtime/composition/modules/__tests__/assistant-ag-ui.wire.unit.test.ts:20–21` exactly in meaning:
  - `{ type: "text_delta" }` → `{ kind: "text", text: "" }`. Mutation emits `"undefined"`.
  - `{ type: "tool_result", toolUseId: "t1", content: null, isError: 1 }` → `{ kind: "tool_result", toolUseId: "t1", content: "", isError: true }`. Mutation emits `"null"`.
- **Accounting and STOP.** Test-only. No source, imports, exports, manifest, baseline, debt or look. STOP if either assertion needs a production edit. AG0-T can consume the result after this lands.

### M5-J · Jini · merge-6 `d3e78b387` · 2.1k tokens

- **Tests first.** Add `P/diagnostics/src/observability/__tests__/browser-diagnostics.test.ts`, importing `browserDiagnosticsSource` from `'../index.js'`. Evaluate the trusted function expression in the test using the existing analytics browser-contribution test pattern. Use a fake browser target and report callback. A buffered navigation entry emits one duration; error and rejection emit only their respective fixed numeric codes; disposal disconnects the observer, removes both listeners, and aborts the installation’s signal. Mutations emit navigation twice, forward event data, or omit disposal.
- **Edit.** Add `P/diagnostics/src/observability/browser-diagnostics.ts` with `export const browserDiagnosticsSource`, a self-contained JavaScript function expression as source text. It accepts `{ target, report }` and an optional second bag. On installation, use `target.PerformanceObserver` when available, observing buffered `navigation`; report the first positive, finite duration as `{ navigationMs }` and disconnect. Report window `error` as `{ errorKind: 1 }` and `unhandledrejection` as `{ errorKind: 2 }`. Call `report({ body, signal })` with an installation-local abort signal. The returned disposer removes both listeners, disconnects any observer and aborts that signal. The source has no module captures. Add `export { browserDiagnosticsSource } from './browser-diagnostics.js';` to the existing `P/diagnostics/src/observability/index.ts` entry at `:1–14`. Tovu imports `import { browserDiagnosticsSource } from '@jini-ai/diagnostics/observability';` in M5-T.
- **Accounting and STOP.** Combine adds the named export to the existing diagnostics `./observability` API baseline. No manifest, dependency, injection debt or identifier rename. STOP if the serialized function needs a runtime import, a vendor, a browser consent implementation, or a host URL. Chrome is owed under M5-T.

### AP-T-SPLIT · Tovu · merge-6 `776ce6d0f0` · 2.2k tokens

- **Tests first.** The existing vanilla tests at `S/__tests__/vanilla-tool-confirmation.test.ts:25,45,69,85` pin decision interception, timeout and cleanup, chrome rerender and absent markup. Mutations stop click interception or omit cleanup of the observer. No test edits.
- **Edit.** In `S/vanilla-tool-confirmation.ts`, add private `bindVanillaToolConfirmation` before `createVanillaToolConfirmation`. Move `:46–64` verbatim into it and `:67–77` verbatim into its returned cleanup callback. Close over the original names. Its required object carries `element`, `document`, `strip`, `label`, `allow`, `cancel`, `directive`, `original`, `previous`, `render`, `decide` and `clear`. Call it at the old listener-registration site as `const unbind = bindVanillaToolConfirmation({ ... , clear: () => clear() });`, spelling out those named fields, with the last callback reading the current `clear` at timeout. Keep `active = false`, `unbind()`, and the reset of `clear` in that order in the outer cleanup. Keep initial render and focus after assigning that cleanup. The existing assertion at `:26` stays in place. No new assertion.
- **Importers.** `S/vanilla-host.ts:8` retains `import { createVanillaToolConfirmation } from './vanilla-tool-confirmation';`; the vanilla unit test `:4` retains `import { createVanillaToolConfirmation } from '../vanilla-tool-confirmation';`; `apps/admin/src/features/ai-assistant/__tests__/VisitorToolsPanel.unit.test.tsx:17` retains `import { createVanillaToolConfirmation } from "../../../../../site-chat/src/vanilla-tool-confirmation";`.
- **Accounting and STOP.** No export, ledger, manifest, baseline or independent look. STOP if listener, observer, timer, cleanup or focus order changes. AP-T follows this sheet.

### AP-T · Tovu · merge-6 after AP-T-SPLIT · 5.8k tokens

- **Tests first.** Extend `S/__tests__/SiteToolConfirmation.hooks.test.ts` and `S/__tests__/vanilla-tool-confirmation.test.ts`. In each, a fake sends once, resolves `false`, leaves the same prompt with a failure notice, then succeeds when the visitor clicks the same decision again. While the first send is unresolved, a second click posts nothing. Exercise late failure after expiry and after a replacement directive. In vanilla, clear the visible label and hide the strip during failure, then assert that the existing observer restores both prompt and notice. Update the existing vanilla success test at `:34–42` to await settlement before asserting teardown. Use the existing harnesses and messages on added or changed assertions. Restore clear-then-`void confirm` to make the retry test red. Remove the stale-settlement check to make the replacement test red.
- **React.** At `S/SiteToolConfirmation.hooks.ts:8–29`, add `sendFailed` state and `inFlight` ref. Give each send its own attempt object. `receive` invalidates the attempt and resets failure. Hook teardown invalidates the attempt. `decide` admits one send at a time, leaves the original timer running, ignores settlement of a superseded attempt, and clears only on `true`. A current `false` sets `sendFailed`. Expose it alongside `pending`. At `S/SiteAssistantWidget.tsx:77–85`, append the translated notice inside the existing `role="status"` label.
- **Vanilla.** In `S/vanilla-tool-confirmation.ts`, add `sending` and `sendFailed` to the per-prompt closure and `sendFailureText` to the existing options, defaulting to `"Couldn't send your decision. Try again."` for existing callers. `decide` checks `sending`, then waits for confirmation. A result after `active` becomes false has no effect. For a live prompt, `true` calls `clear()` and `false` sets `sendFailed` and calls `render()`. Use one local `labelText` callback for both rendering and the observer’s expected-text comparison. At `S/vanilla-host.ts:19–24`, pass `sendFailureText: t("Couldn't send your decision. Try again.")`. Append that key and its translations to every row of `S/site-chat-i18n.ts:2–26`.
- **Transport.** At `S/tool-confirmation.ts:25–31`, add `import { orFallback } from "@jini-ai/core/errors/idioms";`. Wrap the same fetch and `response.ok` calculation with `orFallback`, `fallback: false`, and `step: "site-assistant.confirm.send"`. Preserve the request, timeout, return type, and directive parser.
- **Importers and checks.** The split’s importer list still applies. The hook imports remain `S/SiteAssistantWidget.hooks.ts:7` and `S/__tests__/SiteToolConfirmation.hooks.test.ts:4`. Confirmation transport imports remain `SiteAssistantWidget.hooks.ts:8`, `SiteToolConfirmation.hooks.ts:2`, `vanilla-host.ts:9`, `vanilla-tool-confirmation.ts:2`, `site-assistant-transport.ts:33`, and `__tests__/tool-confirmation.test.ts:3`, under `S`. **Chrome owed** in React and vanilla for offline Allow and Cancel, focus, retry, and expiry. Row 155 −1. No manifest, export or injection debt change. STOP if a transcript error, automatic retry, additional prompt owner, or reworked focus policy is required. Land before AG2-T and AG3-T.

### C08-SPLIT · Tovu · merge-6 `776ce6d0f0` · 1.7k tokens

- **Tests first.** In `R/site-deps/__tests__/identity-settings.characterization.unit.test.ts:8,18–27`, pin the existing call order using `new URL("../boot-phases.ts", import.meta.url)` and `composeSiteServicesPhase`, where `:90–91` now live. The base test still looks in `deps.ts`, which no longer contains that call. Expect the last two composition declarations as `"{ siteSettingsReady, siteTitleReady }"`, and assert in the same ordering case that the helper declares `siteSettingsReady` before `siteTitleReady`. Swapping the phases or replacing either binding breaks the respective assertion.
- **Edit.** In `R/site-deps/identity-settings.ts:51–123`, move `:90–121` verbatim to private `startPersistentSiteSettings`, defined immediately after `composeIdentitySettings`. Its required object carries `analyticsSettingsReady` (`Promise<void>`), `siteTitleSettingsDeps` (the settings repo, existing clock/id types and settings principal lookup), and `siteTitlePreservationStore` (`SqliteSiteTitlePreservationStore`). Return `{ siteSettingsReady, siteTitleReady }`. Destructure that result where the moved chain began. Keep `:83–89`, the final return object, and all promise creation order.
- **Importers.** No repoints. Under `R/site-deps/`, `boot-phases.ts:14` retains `import { composeIdentitySettings } from "./identity-settings.js";`. The same-path type import stays in `after-assembly-forms-search.ts:1`, `content-resolvers-comments.ts:21`, `mail-http.ts:6`, `outbound-connections.ts:8`, `pre-assembly.ts:3`, `publish-apply.ts:6`, `route-deps-assistant-mcp.ts:4`, `route-deps-comments-plugins.ts:3`, `route-deps-members-mail.ts:3`, `route-deps-site-providers.ts:7`, `shared-oauth-commerce.ts:3`, and `site-sharing.ts:3`.
- **Accounting and STOP.** No debt, manifest, baseline or look. STOP if any promise is awaited, rewrapped, or exposed under a different binding. C08 follows this sheet.

### C08 · Tovu · merge-6 after C08-SPLIT · 0.9k tokens

- **Tests first.** Reuse `R/__tests__/app.title-rejection.unit.test.ts:19` and `boot-settings-rejection.integration.test.ts:54`. Mutation returns a swallowed settlement promise in place of `siteTitleReady`.
- **Edit.** In `R/memory-deps/slices/site-title-settings.ts:44` and the moved `R/site-deps/identity-settings.ts:121` catch, use `observed({ promise: siteTitleReady });`. Add `import { observed } from "@jini-ai/core/errors/idioms";` to each. Preserve the comments and original promise bindings.
- **Importers and checks.** Persistent importers are listed in C08-SPLIT. `R/app.ts:14` retains `import { composeSiteTitleSettings } from "./memory-deps/slices/site-title-settings.js";`. `R/memory-deps/route-deps/context.ts:10` retains `import type { composeSiteTitleSettings } from "../slices/site-title-settings.js";`. C447 and C475 each −1. Restoring the catches is the gate mutation. No manifest, baseline, injection or look. STOP if any consumer receives a different promise.

### B02 · Tovu · `tv-b2` `7e5c158ca6` · 2.5k tokens

**Tests first.** No edits. Reuse `W/assistant/__tests__/declared-tool-keywords.contract.test.ts:36–37`, `W/cli/__tests__/unit/deploy-config-command.unit.test.ts:125`, deploy-ops `__tests__/registry.test.ts:138,207`, and assistant `__tests__/assistant-runtime-guidance.unit.test.ts:202–204`. Restore each catch to exercise the gate. Combine witnesses are empty optional vocabulary, generic target help, continued credential creation, surviving active deploy routes, and capability denial after a failed probe.

| File under `W` | Exact edit |
|---|---|
| `assistant/tool-search-keywords.ts:22–38` | Replace the mutable enumeration binding and old try with `const sources = optional.sources;`, `if (!sources) return keywords;`, then `const bundledSources = orFallbackSync({ work: () => sources.call(optional, { ...required, filename: 'plugin.json' }), fallback: [], step: 'List tool keyword manifests' });`. Iterate `bundledSources`. Wrap only the existing per-source body in `orFallbackSync` with `undefined` and `Read tool keyword manifest`. Keep its comment. |
| `cli/commands/deploy-config.ts:80–84` | `orFallbackSync` around the existing `formatTargetOptionHelp` computation, with `undefined` and `Read deployment target help`, followed by lazy `?? formatTargetOptionHelp({ ids: [] })`. |
| `features/custom-credentials/tool-registrations.ts:295–305` | Individually await `orFallback` around each existing loop, with `undefined` and `Read hosting credential choices` / `Read source-control credential choices`. Keep comments and iteration order. |
| `features/deployments/deploy-ops/registry.ts:58–64,91–94` | `orFallbackSync` over the existing bundled read/parse body, with `[]` and `Read bundled deployment operations`. Await `orFallback` only around `readTrustedPluginFile`, with `""` and `Read inactive deployment operations`. Keep parsing, admission and registration order. |
| `server/inbound/assistant/assistant-runtime-guidance.ts:153–165` | Return `orFallback` from the existing async probe around its exact try body, with `false` and `Probe assistant Chrome capability`. Keep the existing env precedence. |

Use the exact named idiom imports from `@jini-ai/core/errors/idioms` with local quote style. No caller or export moves. Production import anchors are `cli/program.ts:8`, `features/deployments/deploy-ops/agent-tools.ts:3`, `R/site-deps/route-deps-publish-credentials.ts:23`, and `server/inbound/assistant/{agent-daemon-run-start.ts:31,agent-daemon-scope-runtime.ts:17}`. `readBundledToolKeywords` and `loadCreateCredentialProviders` have local production callers. B169 −2, B172 −1, B199 −2, B203 −2, C392 −1. No manifest, baseline, injection or look. STOP if a fallback swallows a primary action, the receiver of `sources` changes, or parsing moves into the inactive file-read fallback.

### D02-SPLIT · Tovu · `tv-tq` `f54179c73f` after `tv-split` · 1.2k tokens

- **Tests first.** Reuse `D/desktop-resources.test.ts:319,677` for RSS fallback, minute throttle, and newly seen PIDs. Mutation drops the throttle condition. No test edits.
- **Edit.** At `D/desktop-resources.ts:171–188`, move `:172–188` verbatim to private `createDesktopPanelMemorySampler({ ports }: { ports: DesktopResourcesPorts })`. Return `samplePrivateMemory ? panelMemory : undefined` from it. At the old setup position, bind `const panelMemory = createDesktopPanelMemorySampler({ ports });`. Pass `samplePrivateMemory: panelMemory` at `:202`. Keep selection and state initialization before history/cache initialization.
- **Importers and STOP.** `D/main/index.ts:142` retains `import { createDesktopResources } from "../desktop-resources.ts";`. Keep existing imports in `desktop-resources.test.ts:6`, `desktop-reported-regressions.test.ts:17`, `product-memory-telemetry.test.ts:4`, `resources-ipc.test.ts:6`, `renderer/ResourcesPanel.render.test.ts:13`, and `renderer/use-resources.hooks.render.test.ts:7`. No debt, baseline, manifest or independent look. STOP if the sampler gains a timer, changes its cache lifetime, or changes the optional sampler passed to `readDesktopMemory`.

### D02 · Tovu · `tv-tq` after `tv-split` and D02-SPLIT · 1.3k tokens

- **Tests first.** Use `D/desktop-resources.test.ts:319` for labelled RSS and `:539` for unavailable inventory and recovery. Mutations let the respective rejection escape. No test edits.
- **Edit.** At `D/desktop-memory-sampler.ts:30–46`, return `orFallback` around the surviving try body with the existing `fallback` and `step: 'Read desktop private memory'`. Add `import { orFallback } from '@jini-ai/core/errors/idioms';`. At `D/desktop-resources.ts:197–203`, bind `const usages = await orFallback({ work: async () => { ... }, fallback: [], step: 'Read desktop process inventory' });`. Move the two existing statements into `work`, returning the `readDesktopMemory` result. Reuse the import at `:3`.
- **Importers and checks.** `D/desktop-resources.ts:7` retains `import { groupMemoryMetric, readDesktopMemory, type MemoryUsage, type PrivateMemorySampler } from './desktop-memory-sampler.ts';`; `D/desktop-resources.test.ts:8` retains its `PrivateMemorySampler` type import. A106 and A107 each −1. Restore the catches for the gate. No manifest, baseline, injection or Electron look. STOP if native failure empties inventory, or inventory failure preserves stale history. `tv-y1`, `tv-y2`, and `tv-z1` through `tv-z5` have no additional sampler edits.

### M5-T · Tovu · merge-6 after M5-J is linked · 6.6k tokens

- **Tests first.** Extend `R/__tests__/browser-analytics-http.unit.test.ts:10–48` with a recording metric port using the existing no-op port fixture pattern. Cover default-off and missing metrics capability, full consent success, anonymous/withdrawn and foreign-origin denial, rate exhaustion, and admin refusal without a session. Check that malformed JSON, extra keys, strings, out-of-range values, and non-POST requests produce no metric. Mutations bypass the default-off or admission check, or accept an extra key. In `W/server/inbound/public-http/middleware/__tests__/declared-consent.unit.test.ts`, use the managed and live authored-static construction cases at `:558,578` to check the same bridge declaration and its omission when off or exporting. In `R/__tests__/browser-analytics.unit.test.ts`, extend the existing admin HTML capture fixture to pin contribution admission with a session and enabled metrics, and omission otherwise. Mutate each production mount to add the contribution unconditionally.
- **Receiver.** At `R/browser-analytics-http.ts:19–36`, recognize exact `/site/diagnostics` and `/admin/diagnostics` paths within the existing `/_jini/browser-analytics` mount. Only POST is admitted for these paths. Use the existing `collectionAllowed` and shared limiter at `:29–33` for them. For the exact paths, supply the existing `deliver` function an HTTP contribution whose `handle` calls `receiveBrowserDiagnostics` with `body`, `contentType`, `deps`, and `surface`. Keep vendor dispatch as the other branch. Use the existing HTTP contribution type from `deliver` as the local type. Keep `R/http-app/public-middleware.ts:74–88` and its pre-JSON mount order.
- **Host implementation.** Add `R/browser-diagnostics.ts` with `browserDiagnosticsEnabled`, `receiveBrowserDiagnostics`, `readBrowserDiagnostics`, `siteBrowserDiagnosticsBridge`, `siteBrowserDiagnosticsModule`, and `adminBrowserDiagnosticsContribution`. Import `browserDiagnosticsSource` from `@jini-ai/diagnostics/observability`, `getEffective` from `@jini-ai/core/settings`, `orFallbackSync` and `orFallback` from `@jini-ai/core/errors/idioms`, and `TELEMETRY_CONSENT` from `./telemetry-consent.js`. Enable only with a live site observability provider, `supportsMetric === true`, and the existing operator setting explicitly true. A setting failure denies. Read at request time. The receiver returns 404 when disabled, 415 for non-JSON, 413 beyond 256 bytes, 400 for an invalid body, and 204 after delivering one metric. Parse JSON as `unknown`. Accept precisely one own key, either `{ navigationMs }` as a finite number greater than zero and at most `600_000`, or `{ errorKind }` as `1` or `2`. Project only fixed server labels `browser.navigation.duration`, `browser.error`, or `browser.unhandled_rejection`, with histogram milliseconds for navigation and a counter increment of one for errors. The surface label comes from the matched route. Use `deps.observability.metric`; the body never supplies a metric name, URL, identifier, message, or stack.
- **Public and site chat.** Import `browserDiagnosticsEnabled`, `siteBrowserDiagnosticsBridge`, and `siteBrowserDiagnosticsModule` from `../../../runtime/composition/browser-diagnostics.js` in `W/server/inbound/public-http/middleware/site-cookie-consent.ts`. In `documentPlugins` at `:447–450`, add the bridge through the existing `plugins` payload only for live documents with diagnostics enabled. Extend the existing `Pick` at `:264,290,447` with optional settings/provider fields for callers that supply a narrower dependency object. In `applySiteCookieConsent:423–445`, serve the module at `/_jini/browser-analytics/site/diagnostics.js` with `private, no-store` and an enable check. The module’s default bridge mounts through Jini `cookie-consent/src/client/bridges.ts:26–35`. Subscribe to `api` and reconcile `api.get()` immediately. Start one installation on `analyticsLevel === 'full'`, dispose it on any other level, and unsubscribe and dispose when the bridge unmounts. Use `doc.defaultView` as target. The live authored-static loader already carries the same plugin markup at `site-cookie-consent.ts:342–365`. Both site-chat boots run in that document and use that one collection owner.
- **Admin.** In `R/browser-analytics.ts:13–34`, import `adminBrowserDiagnosticsContribution` from `./browser-diagnostics.js` and `currentCredential` from `../../inbound/admin-http/dev-auth.js`. Append the diagnostics contribution at the existing `injectBrowserAnalytics` call only if the existing `allowed` value is true, the credential is a session, and the live provider supports metrics. Allow the capture when only diagnostics is configured. The contribution uses the existing admin consent bridge’s `full` mode to start and its `pending` mode to dispose, including the operator withdrawal event. Keep `apps/admin/src/main.tsx:58` on its existing telemetry path. Both host contributions use same-origin JSON POST, the installation signal, and handled fetch rejection. Leave the analytics provider list and pageview suppression input intact.
- **Accounting and STOP.** No Tovu export entry, dependency, manifest, or existing debt row changes. Combine verifies the revised Jini artifact. **Chrome owed** on managed and live authored pages, React and vanilla site chat, and admin. Confirm zero diagnostics observers, error listeners and requests before admission, collection after admission, and disposal with no new sends after withdrawal. STOP if the public bridge cannot subscribe to effective consent, the app needs a second consent store, or the only metrics port is the desktop/product exporter.

## Batched Codex jobs

| Order | Branch | Base, prerequisites, sheet order | Executor estimate |
|---|---|---|---|
| 1 | Jini `codex/resheet3-jini` | Combine `jy-core`, `jy-pb`, and `jb1` with merge-6. Keep `jz2-b`’s completed siblings. **J02 → J04 → J-06 → AG0-J → M5-J**. Review the held J04 test through its existing internal entry. | 6.9k sheet tokens, about 9k with targeted checks |
| 2 | Tovu `codex/resheet3-tovu` | Combined merge-6 with `tv-b2`, `tv-split`, and `tv-tq` first. Retain `tv-z3`, `tv-z4`, and `tv-z5` sibling edits. Use the linked Jini result for the idioms and M5 export. **AP-T-SPLIT → AP-T → C08-SPLIT → C08 → B02 → D02-SPLIT → D02 → M5-T**. Dispatch AP-T before AG2-T and AG3-T. | 22.2k sheet tokens, about 27k with targeted checks |

The Jini job contains five in-scope sheets. The Tovu job contains eight.

## PARTIAL and verification

- J04’s downstream published-package users are outside the tracked source evidence. The root removal, internal test path, API-baseline row and documentation follow-up are explicit in the sheet.
- The Tovu clone lacks `AI-Dev-Shop` as expected by the dispatch. I read architecture sections 13 and 14 from the owner checkout. The requested `tv-z*` refs were already present locally.
- This was a read-only design pass. Test outcomes, mutations, build and API checks, and Chrome observations remain combine verification. No files or refs changed.
