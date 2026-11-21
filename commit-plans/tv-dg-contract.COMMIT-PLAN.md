# Contract sheet handoff

Branch: `codex/tv-dg-contract`. Base: `2095ffdd47c1764d682ad0b28899fc6f62e89521` (`codex/tv-engaps2`).
Executed in order: 3A, 3B, 3C, 3D, 3F. All five named test edits are done; runtime verification remains owed.

Jini source reference: `origin/integ/merge-9-2026-11-21`; combine also owes `codex/jx-engaps2`. Other repositories were read only through named git objects. No production files, manifests, lockfiles, dependencies, existing optional pads, or argument rules changed. No commits or other git writes performed.

Tests were written without production changes: these sheets add missing contract witnesses. No RED/GREEN results are claimed. The machine rule prohibits tests, builds, installs, type-checks, and linters. The unmutated contracts may already pass; the named mutations below must establish RED in combine. This clone has no installed `@jini-ai/agent-plugins` or `@jini-ai/chat` candidate, so linked and packed resolution cannot be established here.

## 3A — done

- Base: `2095ffdd47`; `codex/tv-c7a` already included.
- Files: `apps/website/src/features/deployments/deploy-targets/__tests__/registry.unit.test.ts` (shipped-host case at line 349).
- Tests: existing shipped-host case now passes `bundledAgentPluginsDir()` to the real registry and asserts Cloudflare owns `cloudflare-workers`; empty-refusal and complete-target assertions retained. Before this edit the case created private bundle bytes, so a broken staged payload was not its input.
- Mutation owed to combine: rename `jini-deploy-targets.json` in the staged Cloudflare payload, then start a fresh test process. The missing Workers entry must fail the complete-target and ownership assertions. Confirm runtime and test resolve the same staged root; STOP this sheet if they use different entries.
- API-baseline delta (Jini): none; no package-manifest or injection-debt rows.
- Look owed: none; no browser look specified.
- Diff reread deletions: the sole `composedBundledSourceRoot` import, this case's private bundle creation and disposal, and its unused `t` callback parameter. No other deletion or out-of-sheet cleanup.

## 3B — done

- Base: `2095ffdd47`; combine owes `codex/tv-rs3`. Its named activation binding was inspected through `origin/codex/tv-rs3` and matches this base's explicit-root binding.
- Files: `apps/website/src/features/agent-plugins/__tests__/unit/lifecycle-binding.unit.test.ts` (new case at line 233).
- Tests: one case after the bundled-seed case, using `boundLifecycle(t)` and the disposable selected Cloudflare source. It seeds through the lifecycle, lists the installed short identity, checks `id === "jini/cloudflare"`, and resolves inactive activation by the installed `pluginId`. No provider configuration added. Previously no such qualified-identity/activation witness existed in this suite.
- Mutation owed to combine: change only `extensions.jini.id` to `tovu/cloudflare` in a disposable payload; the installed-ID assertion must fail. STOP if seeding requires provider setup or the combined activation binding differs. Installed-state upgrades remain with `r62t-breaks`.
- API-baseline delta (Jini): none.
- Look owed: none; saved-embed witness remains outside this sheet.
- Diff reread deletions: none.

## 3C — done

- Base: `2095ffdd47`; merge-7 anchors were re-found by the existing disabled-chat static-home case.
- Files: `apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts` (extended call at line 506).
- Tests: the real static-home render receives the exact requested `extraHead` marker, asserted once and before `</head>`; disabled-chat assertions retained. The fixture is static tier with `render/pages/index.html`, and the named static-home implementation calls the public CMS HTML subpath. Previously this case did not exercise extra-head insertion.
- Mutations owed to combine: separately remove runtime export resolution for `./presentation/html` and require runtime failure; remove its declaration target and require the packed-candidate Tovu type-check to fail. The inspected export also has a `default` runtime target: the runtime mutation must actually make the runtime entry unavailable. STOP if the static fixture ceases to take `renderStaticTierHomePage`.
- API-baseline delta (Jini): none.
- Look owed: none.
- File over 500 lines: `render.test.ts` is 3,299 lines; continue under the owner's correction.
- Diff reread deletions: none; the existing call was extended in place.

## 3D — done

- Base: `2095ffdd47`; `codex/tv-c7a` included.
- Files: `apps/website/src/server/inbound/public-http/http/site/__tests__/render-form-layout.test.ts` (extended successful case at line 39).
- Tests: dynamic import through the shipped Cloudflare wildcard entry; first `sentNoticeHandlers` selector tuple locates exactly one real rendered slot with its initial hidden attribute. The same locator must become visible after the existing success render. The form's computed `display: none` assertion and adjacent stylesheet-color case remain intact. Previously a hard-coded host selector could pass while the Worker's class selector drifted.
- Mutation owed to combine: mutate only the Worker's first class selector, leaving its attribute selector intact; the exact-one-slot assertion must fail independently. STOP if loading requires a Jini checkout path or package-manifest change.
- API-baseline delta (Jini): none; the reference package already exports `./cloudflare/*`.
- Look owed: Chrome static form submission with visible, styled success feedback.
- Diff reread deletions: none; the old hard-coded success locator assertion was replaced by the same-slot assertion.

## 3F — done

- Base: `2095ffdd47`; combine must supply the specified Jini merge-9/jm7-a/b/engaps candidate plus `codex/jx-engaps2`.
- Files: `apps/website/src/server/__tests__/assistant-ag-ui-wire.golden.test.ts` (three cases after `boot(t)`, beginning at line 199).
- Tests: shipped `createAgUiFetchAgent` drives an authenticated real fetch with a complete normal run input, checks HTTP 200/event-stream headers, awaits reader completion, and checks IDs and text through `RUN_FINISHED`. Separate requests require 401 without a cookie and 400 for authenticated `messages: "not an array"`. Existing golden table, fixture, update path, production writer and routes tests are untouched. Previously the suite pinned bytes without the shipped reader or these two rejection witnesses.
- Mutations owed to combine: independently omit `runId` from emitted `RUN_STARTED` (reader schema rejection must fail success case), bypass the session check (401 case must fail), and bypass malformed-body rejection (400 case must fail). The reader and its export are present in the inspected Jini reference; linked candidate availability is unverified because dependencies are absent. STOP if the actual candidate lacks the reader, needs an error-boundary change, or needs a package edit.
- API-baseline delta (Jini): none; only the existing shipped entry is imported.
- Look owed: one authenticated assistant turn in Chrome; packed run must prove reader resolution from the candidate tarball.
- Diff reread deletions: none.

## Scope and source review

No changed production declarations and no production importer repoints; same-repoint test importers are not needed. Every new or changed assertion has a plain-words message. Changed/new test callbacks are within 50 lines and complexity 10 by source inspection; no metric tool was run. Existing golden assertions were preserved. No new helper, interface, type alias, wrapper, cast, option, comment, or abstraction was introduced. Final source/diff review found no additional deletions to make. Architecture review is limited to the requested test-only boundary; no architecture or public API was changed. Runtime, browser, type and mutation evidence remain explicitly unverified.
