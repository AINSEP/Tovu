# cov-fill-T2-2026-10-21 REPORT (Tovu lots tovu-019..037, 395 files)
Branch `cloud/cov-fill-T2-2026-10-21` (Tovu; Jini branch created, untouched) from `cloud/merge-2026-10-21`. Ran 00:41Z–~02:20Z. 6 of 8 Opus subagents used, at most 3 at once (S1–S3, then S4/S5 for handoffs). Changes are mostly tests. The source refactors are listed below.

## Method (read first)
- Node 24.22.0; the website is node:test + tsx lcov, scoped per directory group: the dir's tests, its `__tests__`, and tests that directly import a target. No whole-suite run, no Postgres, no Chromium.
- The tools understate in three ways. Every "before" gap was re-checked in a single run before work started.
  - (a) BRDA block ids differ between processes. Merging runs inflates branch totals, so each per-file figure is the best single run.
  - (b) tsx `minifyWhitespace` without source maps makes lcov *line numbers* wrong. Counts are right, so gaps were located by function name or with S2's `mapl.py`.
  - (c) Tests importing through `#src/` aliases were not picked up by the grouper. Those files were re-run with their own tests.
- Desktop: renderer via tsx (658/658 pass; websites-width.test.ts excluded because it needs Chromium); speech via resolve-ts-ext (56/56). Site-chat via tsx (231/231).

## Measured on this branch (before)
- desktop + site-chat (40): 38 at 100/100/100. Never loaded:
  - `desktop/src/renderer/main.tsx`: 24-line composition root.
  - `desktop/src/speech/preload-speech.cts`: sandboxed CJS preload with a top-level `require("electron")`. Its behaviour is asserted on the built bundle in a VM. tsconfig.preload.json pins it by exact path.
- website (355): ~213 already at 100, ~142 below 100:
  - S1 group: 48 of 92 non-theme files, plus theme.
  - S2 group: 47 of 118.
  - S3 group: ~40 of 111.
  - Per-file CSVs are in the job scratch (S1 br.csv, S2 before.final.csv, S3 before-b1.csv). They are not committed.

## Brought to 100/100/100 (before L/B/F → after)
- theme: page-publish-tool 72.7/100/75 · save-theme-original 79.6/100/50 · preview-refresh B92.6 · preview-switcher B97.3 · -html B90.2 · -tools B84.6 · publish-content B99.2 · set-active-theme-tool B87.5 · static-portability-index B82.9 · template-applicability B96.6/F85.7 · theme-trash 96.7/87.7/81.5 · trash-theme-tool 97.9/90/81.8 · theme-watcher 95.8/100/81.8 · theme.ts B92 · entry-list-render B91.3 · migration/theme-migration-plan B93.1 · build-conformance B85.6 (all → 100). Full theme run: 105 files, 1341 tests, 0 fail.
- theme files whose "before" gaps were split-run artefacts (100 in one run): static-render, tool-registrations, render-contract, static-asset-contract, token-aliases, verify-active-theme, hardcoded-link-lists, asset-path-rewrites, active-theme-publish-content, import-theme-file-tool.
- deployments/tool-registrations 100/95.7/100 · seo/index 95.9/100/80 · seo/settings B96.8 · post/template-options B85.7 · webhooks/seal-aad-invariant B97.9 · webhooks/tool-registrations 99.7/86/93.5 · webhooks/repo.memory 98.6/94.6/97 · widgets/deps B90.9/F69 · widgets/publish-content 95/84.6/80.8 · publish-content seed-hash, backstop-service, planner, peer-transport, gated-hooks (all → 100).
- cli/commands/adopt.ts (in-process 0 → 100; its old tests only spawn a subprocess) · contracts/core/scheduled-publish.ts F16.7 · agent-plugins/switch-on-saved-token 94/95/86 · plugin-runtime/install-consent 67/100/33 · plugin-runtime/built-ins/word-count F66.7 (all → 100).
- S4/S5 results: SEE_S45

## Improved, still below 100 (after L/B/F, reason)
- theme-files 100/99.04/100: the `parent === probe` filesystem-root break (Windows only) and the readdir→lstat vanish race. Both are guards, kept.
- handlebars-allowlist B91 / liquid-allowlist B97.6 F90: parser always fills the optional-chained AST nodes; the render_block stub is inert by design; sync generators never yield. Kept.
- trash-item-tool 99.8/92.3/93.8: generic `!moved.ok` throw and `snapshot.version ?? undefined` are race-only.
- deployments/publish-agent-tools 99.4/97/100: 8 arms in propose-credential/verify (hint fallbacks, "run already in progress" guard). One test fails, and it failed before this run too (see Tests).
- publish-content: disconnect-tool B20/22 (its defaults read or write the real repo-root deploy config); tool-registrations B150/158 F48/52 (chooseDestination, connect-grant lambdas, `peerLabel ?? "Live site"`).
- webhooks/site-key-sources B65/66: the open range is tsx's injected `__name` helper, not source.
- widgets/media-html 100/98.3/100: a non-text `<style>` child after parse5, and a non-element/non-text node after sanitize. Believed unreachable, kept.
- assistant: agents.ts B76/79 · render-ui-tool B29/30 (the schema-rejected guard; the message is built internally) · mcp-federation/bootstrap (2 branches) · cli/program.ts 241/244 23/27 21/22 (one anonymous action; could not be located because of the line-number mapping).
- access-token-tool 291/296 76/89 · external-mcp-vault 106/112 F11/15 (fail-closed policy callbacks no public path reaches) · live-model-cache (required fail-closed `discover` default).
- Not started (no time left), from the before CSVs: publish-content apply-loop, export-bundle, peers, publish-tool B81/106, repo-handler, raw-row-contributor; static-publish/adapter; site-export site-exporter, theme-preview-manifest; post post.ts, publish-content, repo.ts, tool-registrations; site-evidence/collect-page-evidence L84 F53; site-inspection/tool-registrations B76; trash/adapters/directory (fs error arms → needs an fs port); source-control/* (credential-setup F58); recovery and skills tool-registrations; assistant/tool-registrations, mcp-federation/reload-adapter; src/index.ts (needs a `bootSite(ports)` extraction); cli/main.ts (process entry).
- Owner decisions, unchanged: agent-permission-mode.ts:36 arm; theme/validation/structure.ts duplicate issue; provider-kit adapter; external-mcp-revocation mapping; post featured-image `mock.module` test; forms/publish-content `state.notify ?? undefined` (only reachable if NOTIFY becomes "local", OQ2).
- Listed, not forced: blob-store.s3.ts (reachable only from the S3 integration test); platform/db migrations 0002/0012/index/legacy-sqlite (index `pinned()` throw needs a migrations-dir export; history is not edited); webhooks/secret-scan-guard.ts (no edit by rule).

## Refactors for testability (behaviour identical, "why" comments kept)
- deployments/tool-registrations.ts: `pickExportSiteOptions` exported. The "omit absent clean" contract cannot be reached through callers that always pass a boolean.
- deployments/publish-agent-tools.ts: `abortGuardedCredentialRepo({store, signal})` extracted from saveProposedCredential, so its forwarders and vault proxy are tested against a hand-written repo.
- theme/theme-files.ts: `copyThemeFile` gets an optional `{ copyFile }` port (default copyFileSync), so the lost-race EEXIST mapping and the rethrow are tested. `filesHaveSameBytes` `for(;;)` → do/while, which removes a phantom dead fall-through.
- trash/trash-item-tool.ts: `moveToTrashOutcomeToError` exported, so each refusal message is asserted.
- Dead code removed (why comment in the code): theme-watcher.ts refresh `if (closed) return` (every path that sets closed clears `pending` first); entry-list-render.ts `name ?? ""` (the regex's attribute branch always captures name).
- SEE_S45_REFACTOR

## Pre-existing regression fixed
- 172b9652: backstop-preview.test.ts now builds the PEM marker at runtime; the cov-T2 REPORT no longer quotes it. secret-scan-guard 18/18 pass, backstop-preview 8/8 pass.

## LOCAL-RUN NEEDED
- post/search-index.postgres.ts B14/15 (only *.postgres tests); platform/db migration-manifest-postgres + schema-postgres-parity; database-transfer copy-engine/tool-registrations .postgres; desktop websites-width.test.ts (Chromium). Plus everything in merge-REPORT's list.

## Tests run
- All touched test files pass on node 24. desktop renderer 658/658, speech 56/56, site-chat 231/231, theme 1341/1341, trash dir 343/343.
- Failures seen that are not from this job:
  - publish-agent-tools.unit "propose-credential: a secret field is refused as a pre-fill hint" (fails in the before run too).
  - bundled-mail-resend.unit "send() maps a 429…".
  - "complete production catalog classifies every reader…" in an assistant batch.
  - seo/index.unit (2 tests): fixed in this job, 0e8e032f.
- Scoped tsc on S3's test files: 1 error, which S3 introduced and fixed (0d66f0f3); the rest are in base files. `npm run typecheck:tests` on an idle machine is advised.

## Complexity
eslint (development/sonarjs config, `complexity` 10 + `sonarjs/cognitive-complexity` 10) on every touched source file gives 0 errors: deployments/tool-registrations, publish-agent-tools, theme-watcher, theme-files, entry-list-render, trash-item-tool SEE_S45_CX. Warnings remain only on unchanged lines.
