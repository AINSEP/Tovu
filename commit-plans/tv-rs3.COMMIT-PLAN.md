# rs3-tovu dispatch plan

Branch: `codex/tv-rs3`; initial HEAD `0b3eb0ae63` (merge-6 plus tv-split). Merge-6 `776ce6d0f0` is an ancestor; tv-tq `f54179c73f` is not. The dispatch makes `.git` read-only: no commits or pushes are performed. Entries are intended separate commits with prefix `rs3-tovu: <sheet ID>`. Tests, builds, installs, type checks, linters and mutations are deferred to cloud by the machine rule. No baseline was run. No REFRESH.md entries so far.

## AP-T-SPLIT

- Base: merge-6 `776ce6d0f0`.
- Status: source move complete; separate commit owed before AP-T (read-only `.git`).
- Files: `apps/site-chat/src/vanilla-tool-confirmation.ts`.
- Tests written: none; reuse existing vanilla interception/timeout/cleanup/chrome/absent-markup tests.
- Cloud mutations: drop observer cleanup; stop click interception.
- Ledger: none (expected shrink 0).
- STOP/skip: none in source; commit unavailable under machine rule.
- Diff re-read: listener, observer, timer, cleanup and focus statement order retained. Deletions: original moved listener/cleanup statements only; no extraneous edits found.

## AP-T

- Base: merge-6 `776ce6d0f0` after AP-T-SPLIT.
- Status: edits complete, unverified; separate commit owed (read-only `.git`).
- Files: `apps/site-chat/src/SiteToolConfirmation.hooks.ts`, `apps/site-chat/src/SiteAssistantWidget.tsx`, `apps/site-chat/src/vanilla-tool-confirmation.ts`, `apps/site-chat/src/vanilla-host.ts`, `apps/site-chat/src/site-chat-i18n.ts`, `apps/site-chat/src/tool-confirmation.ts`, `apps/site-chat/src/__tests__/SiteToolConfirmation.hooks.test.ts`, `apps/site-chat/src/__tests__/vanilla-tool-confirmation.test.ts`.
- Tests written before behavior edits: explicit Allow/Cancel retry after false; in-flight duplicate suppression; late failure after expiry and replacement in both hosts; vanilla observer restoration of prompt plus notice; success awaits settlement. New retry assertions fail on merge-6's immediate clear (not executed here).
- Cloud mutations: restore clear-then-`void confirm` in each host; remove React stale-settlement identity check; restore transport catch for gate.
- Ledger key: `(apps/site-chat/src/tool-confirmation.ts, catch-reads-error)` row 155, expected shrink −1.
- Chrome owed: React and vanilla offline Allow/Cancel, focus, retry and expiry.
- STOP/skip: none in source; no attempt objects or focus policy changes.
- Diff re-read deletions: immediate prompt clearing and discarded confirmation result, replaced by named retry behavior; transport catch replaced by `orFallback`. No extraneous edits found.

## C08-SPLIT

- Base: merge-6 `776ce6d0f0`.
- Status: verbatim chain move complete; separate commit owed before C08 (read-only `.git`).
- Files: `apps/website/src/server/runtime/composition/site-deps/identity-settings.ts`, `apps/website/src/server/runtime/composition/site-deps/__tests__/identity-settings.characterization.unit.test.ts`.
- Tests written first: replace final two expected declarations with the destructured pair; assert helper declares settings before title readiness. Per cull, existing stale deps.ts URL and composeSiteRouteDeps ordering case remain untouched (known cloud failure to refresh outside this sheet).
- Cloud mutation: swap the two phases or replace either binding.
- Ledger: none (expected shrink 0).
- STOP/skip: none. Same original promises returned without awaiting or wrapping. The different in-memory composeIdentitySettings is excluded per cull.
- Diff re-read deletions: original chain removed only from its former location; no extraneous edits found.

## C08

- Base: merge-6 `776ce6d0f0` after C08-SPLIT.
- Status: edits complete, unverified; separate commit owed (read-only `.git`).
- Files: `apps/website/src/server/runtime/composition/site-deps/identity-settings.ts`, `apps/website/src/server/runtime/composition/memory-deps/slices/site-title-settings.ts`.
- Tests written: none; reuse `app.title-rejection.unit.test.ts` and `boot-settings-rejection.integration.test.ts`.
- Cloud mutations: return swallowed settlement instead of original siteTitleReady; restore both catches for gate.
- Ledger keys: `(apps/website/src/server/runtime/composition/site-deps/identity-settings.ts, catch-reads-error)` C447 −1; `(apps/website/src/server/runtime/composition/memory-deps/slices/site-title-settings.ts, catch-reads-error)` C475 −1.
- STOP/skip: none. Original promise bindings and returned objects preserved.
- Diff re-read deletions: only the two catch observers replaced; comments preserved; no extraneous edits found.

## B02

- Base: merge-6 `776ce6d0f0` (coordinator says five files match optional tv-b2).
- Status: STOPPED before edits: unlisted production re-export/import edge `apps/website/src/features/deployments/index.ts:91` exports loadDeployOpsRegistry from deploy-ops/registry.js. This edge was not in the named production importer list.
- Files touched: none.
- Tests written: none; named existing tests remain for cloud.
- Cloud mutation: restore each named catch after a refreshed sheet authorizes the additional production edge.
- Intended ledger keys/shrink (not claimed): `(apps/website/src/assistant/tool-search-keywords.ts, catch-reads-error)` B169 −2; `(apps/website/src/cli/commands/deploy-config.ts, catch-reads-error)` B172 −1; `(apps/website/src/features/custom-credentials/tool-registrations.ts, catch-reads-error)` B199 −2; `(apps/website/src/features/deployments/deploy-ops/registry.ts, catch-reads-error)` B203 −2; `(apps/website/src/server/inbound/assistant/assistant-runtime-guidance.ts, catch-reads-error)` C392 −1.
- Diff re-read deletions: none; no edits.

## D02-SPLIT

- Base: tv-tq `f54179c73f` after tv-split `9bed9c51cf`.
- Status: SKIPPED as explicitly directed; tv-tq is not an ancestor of HEAD (git merge-base exit 1).
- Files touched/tests written: none.
- Cloud mutation: drop throttle condition when running on correct base.
- Ledger: none (expected shrink 0).
- Diff re-read deletions: none.

## D02

- Base: tv-tq `f54179c73f` after tv-split and D02-SPLIT.
- Status: SKIPPED as explicitly directed; base not an ancestor of HEAD.
- Files touched/tests written: none.
- Cloud mutation: restore both catches; let each respective rejection escape for behavioral witnesses.
- Intended ledger keys/shrink (not claimed): `(apps/desktop/src/desktop-memory-sampler.ts, catch-reads-error)` A106 −1; `(apps/desktop/src/desktop-resources.ts, catch-reads-error)` A107 −1.
- Diff re-read deletions: none.

## M5-T

- Base: merge-6 `776ce6d0f0`; M5-J dropped by cull.
- Status: STOPPED at `apps/website/src/server/runtime/composition/browser-analytics-http.ts:21` (existing request-handler callback). The repository metric uses ESLint's core complexity rule (`development/scripts/code-metrics.py:125–140`). Static counting gives the original handler 10: base 1, surface if/and 2, optional calls/accesses 2, missing-http if 1, method if 1, consent if 1, limiter if 1, catch 1. The exact-path and POST choices add 2, giving 12, above the hard cap of 10. No linter or metric script was executed. A helper or changes outside the named receiver edit would be needed; the cull forbids them.
- Files in final diff: none. Drafted and then restored to HEAD: `apps/website/src/server/runtime/composition/browser-analytics-http.ts`, `apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts`, `apps/website/src/server/runtime/composition/__tests__/browser-analytics-http.unit.test.ts`, `apps/website/src/server/inbound/public-http/middleware/__tests__/declared-consent.unit.test.ts`. Drafted and deleted: `apps/website/src/server/runtime/composition/browser-diagnostics.ts`, `apps/website/src/server/runtime/composition/__tests__/browser-diagnostics.unit.test.ts`.
- Tests drafted before implementation and removed on STOP: default-off/capability/setting reads, consent/origin/rate gates, fixed projections, malformed/extra/string/bounds/method/media/byte cases, managed/live-authored bridge declaration and omission when disabled/exporting, one navigation/codes/disposal. No retained test edits.
- Cloud mutations for a refreshed sheet: bypass enablement or admission, accept an extra key, mount contribution unconditionally, emit navigation twice.
- Ledger: none (expected shrink 0); no dependency, baseline or debt changes.
- Chrome owed after implementation: managed/live-authored pages and both site-chat boots, collection admission and disposal. No admin look under cull.
- Other STOP conditions checked: consent bridge supports subscribe/get; site observability has a metrics port; no second store needed. No diagnostics contribution in deps.browserAnalytics was introduced.
- File over 500 lines: existing `apps/website/src/server/inbound/public-http/middleware/__tests__/declared-consent.unit.test.ts` (not the STOP reason).
- Diff re-read deletions: removed ALL M5-T draft production/test edits after the hard-limit check; no partial feature remains.

## Handoff

No REFRESH.md entries: no test importers needed repointing. Beyond cull: B02's unlisted production re-export and M5-T's handler hard-limit conflict are recorded above. C08-SPLIT intentionally retains the stale characterization URL/case as cull BUGS 2 directs. Nothing was executed to claim green tests, killed mutations, Chrome verification or debt-baseline changes. `.git` remained read-only; commit and push SHAs do not exist for these edits.
