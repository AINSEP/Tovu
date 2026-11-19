# deps-split v4b — report (continuation run, 2026-11-19)

Branch `plan/design-deps-split-2026-11-17`; design tip Tovu `2d82735a`, Jini `d37821a4`. This run ships design files only (no product code). Commits are listed at the end.

## Sheets added (14; all 39 now written, `v4/`)
| sheet | what it does | measured |
|---|---|---|
| M1 `overrides` | `CreateSiteRouteDepsOverrides` + 5 override helpers → `site-deps/overrides.ts`; 1 importer repointed | probe-applied: all gates green, 2 tests pass |
| M2 `open-store` | `StoreCloseRegistration`, `openCompositionStore` and 5 helpers → `site-deps/open-store.ts`. Includes `hydrateContentDbIfNeeded` (unexported), because leaving it behind would create a cycle. Carries one exact edit to the reader `composition-boot-order.unit` | probe-applied: green, including the reader |
| M3 `provider-identity` | `providerPluginBoot`, `composeProviderConfig`, `credentialProject`, `acceptedSiteId`, `siteIdentityFor`, `projectStoreFor` → `site-deps/provider-identity.ts`; 1 importer repointed | probe-applied: green |
| H1 `chat-orphans-project-keys` | `compositionProjectKeys` → module function (getter for the `bindSharedApiOAuth` cell, with one exact 3-line narrowing edit). `warnCompositionChatOrphans` → module level **of deps.ts**, because a reader test requires it there | hashes ✓ |
| H2 `shared-oauth-commerce` | `compositionSharedOAuth`, `compositionCommerce` → module functions; runs before L2 | hashes ✓ |
| H3 `site-sharing` | `configureSiteSharing` → module function, split 68 → ~28 + ~45 (`shareDeliveryPorts`) | hashes ✓ |
| H4 `site-imports` | `configureSiteImports` → module function | hashes ✓ |
| L1-L6 | the `routeDeps` literal's 260 entries as 12 runs (≤ 44 lines each). No run crosses one of the 7 spreads, and each is typed `Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, keys>`. L3 also moves `resolveSiteBackupSources` + `readTovuVersion` and its error-debt row | hashes ✓ (L2 on the text after H2) |
| R `root-phases` | the owner rule: 7 synchronous phase functions between the root's fixed points (9 awaits, 4 `let`s + 4 writes), 3 `let`s hoisted, 5 helpers moved with the phases, 112 leftover imports deleted, stale size-debt row deleted | **root 49 lines, complexity 7** by ESLint on the synthesized result; phases ≤ 39 lines |

Every new sheet's step-1 anchors and hashes were run against the text that sheet will meet: the tip for M and H, the tip plus H2's edit for L, and the synthesized post-sheet root for R. All pass, and so do B01-B25's checks against the tip.

How R was measured: `evidence/synth.cjs` applies every sheet's exact root-replacement line to the tip text, giving `deps.after-sheets-2d82735a.ts.txt` (root 129 lines). `evidence/phases.cjs` then builds the phases (`deps.after-R-2d82735a.ts.txt`), and ESLint, with the repo's own size config, measures both files. This is measured, not estimated. The phase inputs, outputs and getters come from a scope-aware census that resolves names through the TypeScript checker (`census-rest.cjs`), so locals shadowing root names are never counted as inputs.

## Changes to B01-B25 (real errors only)
1. **B05, B07, B15, B17, B19, B24: the rewrite rule for relative specifiers was wrong.** Each sheet said "`./x.js` becomes `../x.js`", yet each lists imports such as `../../routes/types.js` and `../../../platform/dev-host/dev-tls.js`. Followed literally, those imports would not resolve, so typecheck fails and the executor hits STOP-TYPE. Fix: that one sentence now reads "Relative specifiers gain one `../` (`./x.js` → `../x.js`, `../../x.js` → `../../../x.js`)". The generator `evidence/sheets.cjs` emits it for sheets with such rows.
2. **B05 left out three module helpers.** The range calls `applyAdminPasswordResetFromEnvIfConfigured` and `compositionSiteDisplaySources`; the latter calls `createSiteDisplayNameSource`. All three are used only there and live in deps.ts. The sheet named the first two but gave no action, so `identity-settings.ts` would have had to import deps.ts. That is a cycle step 5's dependency-cruiser rejects, and those helpers are not exported anyway. Fix: B05 now moves all three, verbatim and unexported, with anchor + hash checks in step 1 (verified on the tip) and their import rows. No other B05 text changed.

Checked and found correct, so not changed:
- An independent, symbol-resolved census of every B range agrees with all 25 sheets on inputs and on getter-vs-value mode (`CHECK_B=1 node census-rest.cjs`): 0 differences.
- Every other module helper a B range reads is already handled: B01 by its note, B04 via M1, B06/B25 via a `consoleLogger` input, B16 by its note, B18 via M3.

Known, not changed (it never stops a gate):
- B-sheets' copy/move column was measured on the tip. When a later sheet moves the last user of an import, that import stays in deps.ts unused. The repo has no `noUnusedLocals` and no unused-import gate, so nothing fails, but it is dead code. R step e deletes the exact list of 112 specifiers, and TypeScript rejects the deletion of any import still in use.
- B01's "leading comment lines 965-964" is an empty range (there is no leading comment). This is cosmetic.

## Test run (finishing what the previous run left)
The 70-file slice set ran on the tip with `--test-concurrency=1`, Node 24.22.3, as root:
- **646 s, 360 tests: 352 pass, 8 fail.** It finished inside the 25-minute cap. Evidence: `v4/evidence/tests-2d82735a.txt`, plus one line in `gates-2d82735a.txt`.
- The 8 failures are base-red source-anchor and wiring tests: `serve-command-wiring` ×2, `composition-boot-order` ×2, `agent-plugin-set-enabled` ×2, `index-bind-host-wiring` ×1. The eighth is the EACCES test in `deps-provider-plugin-boot`, which fails only because root ignores chmod.
- INDEX-v4 now says step 6 is compared by failing-test **names** against this list.

**M1-M3 probe tests.** The 70-file set plus the 3 M tests ran on the probe: 366 tests, 357 pass, 9 fail. Eight are the base-red names. The ninth, `composition-boot-order` "storage choice … chat sweep", reads `openCompositionStore`, `prepareCompositionStorage` and `startOwnerSweeps` from deps.ts. **M2 now spells out that reader edit exactly.** With it applied, that file fails only its 2 base-red tests.

The probe also showed that M2 exported and imported `hydrateContentDbIfNeeded` only because a doc comment mentions it. "Still used" is now resolved through the TypeScript checker; M2 imports 3 names, M1 and M3 are unchanged.

M1-M3 were also applied in a scratch worktree (never pushed) and all the sheets' gate commands were run on it (`v4/evidence/probe-m-2d82735a.txt`):
- typecheck 0;
- architecture, parent-relative: 0;
- size 0, complexity 0;
- ESLint ≤ 50 / ≤ 500: 0;
- depcruise identical to the tip;
- the sheets' own 6 characterization tests pass.

## INDEX-v4 / REVISION-4
- **INDEX-v4:**
  - Order: M1 → M2, M3 → B01-B25 → H1, H2 → L1-L6 → H3, H4 → R, with the reason for each prerequisite.
  - Parallel groups, for preparation only; commits still land serially, and the only manual rebase merge allowed is in deps.ts's import block.
  - Per-sheet tables and token estimates: ≈ 2.25M executor tokens in total, R ≈ 110k.
  - The test status above.
- **REVISION-4:** a "Root plan" section with the owner rule and how R satisfies it. The open items are now the three that remain, listed below.

## Left / risks
- **Types were compiled only for M1-M3.** B, H, L and R type their fields by the mechanical rule, which now also covers renamed and curried awaits. R carries 262 typed fields and is the largest compile risk; the fallback is "use the type TypeScript names", otherwise STOP-TYPE.
- **R's step-1 hash spans the whole root after 38 sheets.** It drops comment and blank lines, so any deviation in an earlier sheet's replacement line stops R. That is by design; regenerate R with `evidence/{synth,phases,r-imports,leftover,r-sheet}.cjs` on the real file.
- **deps.ts stays over 500 lines after R** (its `<file>` debt row shrinks). Splitting the remaining module code (`createSiteRouteDeps`, `createSiteRouteDepsForWorkspace`, imports) is not in this plan.
- `warnCompositionChatOrphans` stays in deps.ts because of `chat-orphan-check.integration.test.ts`'s contract. Changing that is the owner's decision.
- H3 now creates two stateless closures per share delivery instead of once per boot. Behaviour is the same; the sheet documents it.

## Next step
The Codex judge reviews the 14 new sheets plus the two B-sheet fixes. Then an executor runs M1 (60k budget) from `v4/M1-overrides.md`; its result is already de-risked by the probe.

## Commits (this run)
`9b42de05a` (14 sheets + census evidence + B relative-specifier fix + test run), `b992f89e8` (B05 helpers, L3 readTovuVersion/error debt, type rule, INDEX-v4/REVISION-4), `50a7c6252` (M1-M3 probe evidence), `293e70fcb` (this report, M2 reader edit), and the commit that adds this list.
