# cov-fill-rest-2026-10-21 REPORT
- Ran 00:40Z to 01:42Z. Branch `cloud/cov-fill-rest-2026-10-21` in both repos, cut from `cloud/merge-2026-10-21`.
- Used 5 Opus workers out of the 8 allowed; at most 3 ran at once. Nothing was force-pushed.
- Nothing was coverage-ignored, skipped or excluded, and no threshold or coverage config was changed.
- **Result: every file in scope (J1/J2/J3/T1, minus the untestable-in-place ones) now measures 100/100/100 on this branch.**

## Before -> after (L/B/F, vitest v8 or node:test lcov from the run that loads the real file)
- Jini chat `chat-pane/rules.ts` 100/99.2/100 -> 100/100/100: new test for a running turn that has no events yet.
- Jini chat `hooks/assistant-chats.ts` 100/99.47/100 -> 100/100/100: new test where persistUserTurn runs on a chat that was never selected.
- Jini cms `consent/html/gate.ts` 100/99.33/100 -> 100/100/100. The "does not converge" throw is reachable: an mXSS-shaped page triggers it. The test asserts the message.
- Jini core `fetch/cache.ts` 100/99.15/100 -> 100/100/100: offline read adopts the replacement during a connectivity flap.
- Jini daemon `http/xai.ts` 100/99.45/100 -> 100/100/100. Refactor 1 below.
- Jini oauth `oidc.ts` 100/96.67/100 -> 100/100/100. Refactor 2.
- Jini platform `net/address.ts` 100/92.86/100 -> 100/100/100. Refactor 3.
- Jini ui `mcp-ui/host-message-source.ts` B 75 -> 100/100/100. The 75 came from merging the jsdom and SSR runs; jsdom alone was already 100. Refactor 4.
- Jini ui `utils/smooth-scroll-to-top.ts` 100/96.55/100 -> 100/100/100, plus the new `unit-bezier.ts` at 100. Refactor 5.
- Jini ui `panel-kit/fetch-query/adapter.tanstack.tsx` 100/97.7/100 -> 100/100/100 (I re-measured it after the last refactor).
  - b219: a loader that joins a failing in-flight read now rejects.
  - b212 is reachable. A write that invalidates and then replaces in the same tick on a loader-only key leaves `query.promise` undefined (query-core 5.104.1, query.ts:277 and 811-815).
  - Mutation check: with the fallback removed, the new test fails with a TypeError.
- Jini user-management `server/agent-tool-registrations.ts` 98.67/97.22/100 -> 100/100/100. Refactor 6.
- Jini agent-runtime remotion `avatarLibrary.tsx` 100/50/100 -> 100/100/100. It is testable in place with the BubbleScene harness (a typed fake for remotion).
- Weak J2 test `useChatPane.cov-j2.test.tsx`: the `toBeDefined` wait now asserts that startRun was called once with the queued prompt as the last history entry, and that queuedPrompt is null.
- **BUG FIXED, T1 admin `use-agent-plugins.hooks.ts`** 100/93.75/100 -> 100/100/100 (52f06f8f).
  - The bug: a toggle that settled before the list loaded wrote [] into the cache and wiped the list.
  - The regression test failed first (`expected [] to deeply equal [...]`).
  - The fix is a pure `withToggledRow`, which returns null when nothing is cached.
- T1 admin `lib/page-lifecycle.ts` B 50 -> 100/100/100. Refactor 7.
- T1 admin `AssistantDock.hooks.tsx` B 98.91 -> 100/100/100. Refactor 8.
- T1 admin `use-package-file-tree.hooks.ts` B 96.77 -> 100/100/100. Refactor 9.
- T1 admin `use-publish-content-confirm.hooks.ts` B 99.02 -> 100/100/100: a late overwrite re-plan after confirm, and a site the peer list does not name.
- T1 admin `AdminAppearance.tsx` B 95.83 -> 100/100/100. Refactor 10.
- T1 admin `ThemeExplore.tsx` B 99.14 -> 100/100/100. Refactor 11.
- T1 admin `use-theme-explore.hooks.ts` F 99.21, `ExternalMcpSettingsPanel.tsx` F 91.67, `UsersPanel.tsx` F 85.71 -> all 100/100/100. Refactor 12.
- T1 desktop `site-process-registry.ts` 99.2/95.61/100 -> 100/100/100.
  - A fake process table now covers: a pid vanishing between check and ps, reaping an orphan whose parent is pid 1 on Linux, SIGKILL withheld when identity is unconfirmed, and SIGKILL finding the process already gone.
- T1 desktop `renderer/App.tsx` 96.32/100/97.14 -> 100/100/100 (Refactor 13). `App.hooks.ts` B 99.42 -> 100 (Refactor 14).
- T1 desktop `desktop-agent.ts` 100/99.15/98 -> 100/100/100 (Refactor 15). `shared-sites.ts` 100/98.75/95 -> 100/100/100 (Refactor 16).

## Refactors for testability (behaviour identical, why-comments kept)
1. xai: token mapping moved to a pure `toStoredOAuthToken`. The `token_type ?? 'Bearer'` default can't be reached through openid-client, which rejects a response without token_type.
2. oidc: the fail-closed `!claims` check is now `requireValidatedClaims`. `requireIdToken` made it unreachable via `validateOidcIdToken`; the check is kept and tested directly.
3. address: an `isIP` rejection now goes through the same `?? 'reserved'` default. That default was dead before: `classifyAddressLiteral` never returned null for an IP that isIP accepts (300k strings fuzzed).
4. host-message-source: added `forwardWindowMessages(scope, into)`, which takes the global scope as a parameter so both paths are tested in one environment.
5. smooth-scroll: `unitBezier` moved to its own module, and its flat-derivative guard is tested with the curve (0,0,0,1).
6. agent-tool-registrations: `requireIdentityCatalogEntry` and `identityInput` exported from the module with named arguments, as the package's public-args rule requires. Both drift guards are tested directly.
7. page-lifecycle: `createPageLifecycle(target)` takes the page-event port, so the no-window path runs in-process. Before, it ran only in a separate SSR process that coverage could not see.
8. AssistantDock: `createAgentsLoader(loader)` takes the CachedLoader as a port. The fallbacks for `peek()` returning undefined are tested with a plain loader.
9. file tree: pure `applyPackageFileTreeKeyAction` tests the "act without moving focus" case. The contract allows it; Jini's current key map never produces it.
10. AdminAppearance: pure `adminThemeAccentDefaults` covers the hex fallback for a theme with no accent.
11. ThemeExplore: pure `dispatchPublishToggle`. React never fires click on a disabled button, so the locked-switch guard could not be reached through the DOM.
12. **Jini API, backward compatible for callers:** each callback is now required only where it can actually be called. Tovu's dead stubs are removed (775eaf26).
    - core/ui `useCachedLoader`: the default fetch is optional, and a bare `load()` with no fetch rejects with a named error.
    - ui source-config: `onTrustChange` is required only together with `trustOptions` (a union type).
    - user-management `Users`: `translate` is optional when a custom hook is given. One cast, explained in a comment.
    - Two edge cases: anyone with a custom FetchQueryAdapter must accept the wider param, and anyone who `extends` the SourceConfig props interfaces would break. Neither exists in Jini or Tovu.
13. desktop: `WorkspaceChatPane` (deliberately unreferenced) moved out of App.tsx into its own tested module, with optional ports and component seams.
14. App.hooks `flush`: removed an unreachable `?? new Set()`. Every id gets its set before it can be flushed, and `remove` marks the id deleted first; a comment says so.
15. desktop-agent: the `tool_gaps_list` policy is exported as `authorizeOperatorOnly`. Its deny branch is defense in depth, tested directly.
16. shared-sites: `sitesSettingsFile` extracted, so the lock-timeout notice is tested with a real lock.

## Still below 100 (untestable in place, unchanged)
- J1 shadcn-ui `examples/*.tsx`: they import `@/components/ui/*`, which is not in the repo.
- J1 remotion-template `Root`, `chatSpec`, `index`, `ChatMotionOverlay`, `DeviceFrame`: template files, not part of the scope here.
- J1 `charts-recharts/scripts/build-artifact.mjs`; J3 `ui-kit/scripts/headless-smoke.mjs` and `ui/scripts/generate-agent-icon-data-uris.mjs`: build scripts.
- J3 `*.typecheck.ts` and oauth `tests/*.types.ts`: compile-only.
- J3 oauth `tests/{dispatcher-stub,fixtures,helpers}.ts`: test support.
- T1 desktop `main.ts` (Electron entry) and `scripts/verify-*.ts` (manual verify scripts).
- LOCAL-RUN NEEDED: none for this scope. desktop `renderer/websites-width.test.ts` needs Chromium and was not run.

## Tests (after)
- Jini, 0 failures:
  - Full suites: platform 2497 (6 skipped), core 1353, oauth 691, cms 3925, ui 8673, user-management 1047.
  - Partial: daemon `src/http` 1614, agent-runtime `src/skills` 231, ui panel-kit 308 (re-run by me).
- Jini chat hooks + chat-pane: 859 passed, 1 failed. The failure is `useChatPaneRuntimeInventory` "retries with backoff", a file nobody touched. It failed only while 3 suites ran at once and passed 25/25 twice when run alone. Logged as a load flake, not ours.
- Jini `pnpm guard`: its self-test fails at startup ("R2 must NOT flag endpoint-policy.parity…"). It fails the same way on the unmodified base, so it was already broken.
- Tovu admin full suite: 795 files, 13137 passed, 2 skipped (already skipped), 0 failed. Later the 25 files that import the 3 stub files: 804/804.
- Tovu desktop main: 1743 tests, 0 failed, 10 skipped (macOS-only). Renderer + contracts (without websites-width): 676/676.
- tsc:
  - Clean: Jini oauth, daemon, user-management, ui; desktop renderer.
  - desktop main: 2 errors, already there (`smoke-native.test.ts:296`, `log-buffer.ts:94`).
  - admin: 171 errors, already there (kysely, from ../website). None are in touched files.

## Complexity
- Every touched or new function is ≤10 under eslint `complexity` and `sonarjs/cognitive-complexity`; most are ≤5.
- The desktop `check-complexity.ts` gate was already red, at exactly 10, on functions nobody touched: `migrateNestedSitesHome`, `App`, `SiteCard`, `SitesFoldersDialog`.

## Release note
core, ui and user-management must be version-bumped and published before Tovu can use 775eaf26 from npm; until then Tovu resolves them only through `link:jini`. The package.json and lockfile changes in Tovu (the temporary @jini-ai/search removal) were not committed.

## SHAs
- Jini: 60394cea c85e4c79 10392220 b812fa30 c878ffdf 645e1365 5149e055 fdca8041 f031d3cf 583b5aa1 3a88a543 58b60618 979b374b a03d6052
- Tovu: 52f06f8f f0a82371 6a5f8312 a9b2ef6b 52ce6add 4faccda1 38621c2f b4763f31 27454326 bb3c1d4f 775eaf26, plus progress commits.
