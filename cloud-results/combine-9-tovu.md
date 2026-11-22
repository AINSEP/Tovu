`integ/merge-9-2026-11-21` @ `39418fa891` (report commit; the branch tip is the next commit, which only fills in this line). Code tip: `a963e5a78` (+ docs/raw-output commits `f7d697c04`, `f0cdc00cc`). Jini: `origin/integ/merge-10-2026-11-21` `de4e555b9` at start; re-fetched before the final gates: unchanged.

# combine-9 TOVU (2026-11-21) — `integ/merge-9-2026-11-21`

Unattended cloud run, 06:23–09:00 container time (the container clock only advances while a command runs). Node 24.22.3 (`/opt/node24`, npm 11.19.1) for Tovu and Jini; pnpm 10.33.2. No subagents, no codebase-memory tools, nothing pushed to Jini, `main` / `refactor/terra` / `plan/*` / `release/*` untouched (only fetched), no force-push, no `--no-verify`, no `git pull --rebase`, no tags. Branch created from `origin/integ/merge-8-2026-11-21` = `1640fcd85a` (as dispatched).

**Summary:** all 9 listed merges done, **1 textual conflict** (`.dependency-cruiser.mjs`, union). Follow-up commits: 1 build-blocker fix (`a963e5a78`: tv-dgc2 V3 TS7006 ×2 in `typecheck:tests`), 1 FIX-IF-CHEAP commit (`b42ac42a9`: hooks-test `act` braces, admin package-file-tree order, D0a fixture, AG0-T debt-note text), docs/raw outputs. **No relink commit:** merge-8 relinked to Jini merge-10 is red by design (13 `typecheck` errors = Jini R8/R11 + J1 API changes); merge 1 (lockfile-1120) pairs R8/R11 and merge 4 (tv-dgc2, V1) pairs J1, after which every build/typecheck gate is green. Final vs relinked base: typecheck 13 → 0, typecheck:tests 28 → 0, desktop main 12 → 0, typecheck:scripts 9 → the 3 long-standing base-red, **boundaries 12 → 0 errors**, architecture improved (5 cross-feature edges and 1 module cycle gone; still exit 1 on the runtime-propagation ratchet), error gate 0 New / 0 Worse (`--update` changes nothing), worker-import-graph 7/26 both, **why-comments 76 → 82 open (6 new, listed)**, **complexity 0 → 1 new violation (tv-dgc V2)**, size = the 4 owner-accepted files. `npm ci` on the published 0.7.3-next.1 lockfiles: root/admin/desktop 0/0/0; **`apps/site-chat` lockfile was not regenerated (npm ci fails)**. 17 named mutations run, **all KILLED**; RD-T2's flip is required (suites red without it) and stays. Full node suite **COMPLETE** (3,332 files): 166 failing files, **7 NEW-RED** (3 from tv-sharezip T5 = a real behaviour conflict, 3 from tv-w2 I2-T stale test mocks, 2 dialect files = Postgres contention, green alone), 159 identical on the base. Admin 19 fail (= the owner's 19 base-red; package-file-tree fixed), desktop 4 + 2 (1 new = environment).

## Setup
- Jini: `git checkout de4e555b9` (`origin/integ/merge-10-2026-11-21`); `pnpm install --frozen-lockfile` 0; `pnpm --no-bail -r build` 0 (0 `error TS`). No local Jini changes. Re-fetched before the final gates: still `de4e555b9`.
- Tovu: `npm ci --ignore-scripts` root/admin/desktop on merge-8's lockfiles 0/0/0; `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (80 links); `packages/contracts` tsc 0, `packages/sdk` build 0. After merge 1, `npm ci --ignore-scripts` again on **lockfile-1120's lockfiles (registry 0.7.3-next.1)**: root 0, admin 0, desktop 0; relink (74 links, incl. the new `@jini-ai/node-adapters`); contracts/sdk rebuilt 0/0. `origin/refactor/terra`, `origin/main`, `origin/plan/commit-plans-1120` fetched.
- PostgreSQL 16: started; role `la` (superuser); DBs `jini_chat_test_c9` (`TOVU_CHAT_TEST_POSTGRES_URL`) and `commerce_test` (`COMMERCE_PG_URL`); `PGHOST/PGUSER/PGPASSWORD` set.
- Playwright: the repo's playwright wants `chromium_headless_shell-1228`; the image has `-1243`. A scratch `PLAYWRIGHT_BROWSERS_PATH=/home/user/pwb` (symlinks to `/opt/pw-browsers`, `-1228` → `-1243`) was used for the suite runs; nothing installed, nothing in the repo.
- Worktrees (node_modules symlinked to the main tree): `/home/user/tm` per-merge gates, `/home/user/tb` relinked base + mutations, `/home/user/tk` fresh unlinked install for knip (removed after).
- Read first: `cloud-results/combine-8-tovu.md`, Jini `cloud-results/combine-10-jini.md` ("Exported signatures and subpaths"), and every `commit-plans/<job>.{COMMIT-PLAN,REFRESH,report}.md` on `origin/plan/commit-plans-1120` for the 13 jobs (tv-sharezip has no REFRESH).

## Relink merge-8 → Jini merge-10 (BASE)
- `1640fcd85a` relinked: `typecheck` exit 2, **13 errors** (all Jini R8/R11/J1 API pairs): `features/agent-plugins/lifecycle.ts(24,46)` TS2307 (`@jini-ai/agent-plugins/lifecycle/node` gone); `features/agent-plugins/tool-registrations.ts(114,50)` TS2345 (J1 `requirePermission`); `platform/site-dir/local-site-child.ts(95,49)`, `server/runtime/lifecycle/daemon-supervisor.ts(415,43)`, `server/runtime/lifecycle/local-site-process.ts(200,52)` TS2345 (sidecar `NodeDaemonProcessRequired`); `server/inbound/assistant/agent-daemon-run-launch.ts(185,36)` + `(189,32)`, `agent-daemon-run-start.ts(175,31)` TS2345 (R8b `startupMessage`, `files`); `agent-daemon-scope-runtime.ts(135,43)` + `(174,21)` TS2345 (R8 runtime ports / probe spawn); `agent-daemon-server.ts(28,70)`, `server/runtime/lifecycle/assistant-daemon-registry.ts(34,90)` TS2345 (R11b-1 `writer`); `server/runtime/composition/plugin-runtime.ts(81,5)` TS2741 (`fileLock`). `typecheck:e2e` did not run (chained after the failing tsc).
- `typecheck:tests` exit 2, 28 errors: the 13 above **+** `assistant/__tests__/daemon-access.unit.test.ts(77,47)` TS2345, `platform/site-dir/__tests__/unit/local-site-child.unit.test.ts(115,76)` + `(121,82)` TS2353, `server/inbound/assistant/__tests__/ensure-json-agent-install.unit.test.ts` (23,48) (25,33) (33,31) (41,46) (42,31) (46,46) (54,31) (60,31) (66,48) (72,46) (78,46) TS2345, `server/runtime/composition/modules/__tests__/assistant-run-finalizer.failed-run.integration.test.ts(30,42)` TS2345.
- desktop `tsconfig.main.json` exit 2, 12 errors: `src/desktop-agent-runtime.test.ts(151..156,32)` TS2339 ×6, `src/desktop-agent-service.ts(141,41)` + `(349,66)` TS2345, `src/desktop-agent.ts(261,67)` + `(280,64)` TS2345, `../website/src/features/agent-plugins/lifecycle.ts(24,46)` TS2307, `../website/src/features/agent-plugins/tool-registrations.ts(114,50)` TS2345. preload/renderer/live-verify 0, admin 0.
- `typecheck:scripts` exit 2, 9 errors: 6 of the above + the 3 long-standing base-red `development/scripts/agent-plugin-activation.ts(100,23)` TS2554, `check-size-drift.ts(9,8)` TS5097, `dev-admin-build.ts(6,12)` TS2339.
- **Decision: no relink commit.** Every one of these is exactly what merge 1 (R8/R11 pairs) and merge 4 (V1, J1) supply; writing them again on the base would duplicate those branches. Confirmed per merge (table below): after merge 1 only `tool-registrations.ts(114,50)` (J1) remains; after merge 4 0.
- Other base gates: size exit 1 (4 owner-accepted files); complexity 0; architecture exit 1 (ratchet warning runtime propagation 3.06 → 3.40); boundaries exit 12 (12 errors, 111 warnings); hooks ok; why-comments 76 open; worker-import-graph 7/26 fail; error gate passed (590 findings / 326 entries).
- Jini merge-10 signature checks: J1 `buildAgentPluginSearchRegistrations` — paired by tv-dgc V1 (`tool-registrations.ts:118` binds `requireToolPermission`); `assistant/__tests__/automatic-agent-plugins.integration.test.ts` caller updated by V1 too. cms `updateContentTypeFields`/`updateEntry` signal + `DYNAMIC_SET_LIMIT` — additive, no Tovu change needed (typecheck 0). Admin redirects message key — **Tovu translation not added** (owed, listed). Observability `traceparent` additive.

## Per branch (merged in the listed order with `--no-ff`; each branch's report/REFRESH/COMMIT-PLAN read first)
Per-merge build gates (`typecheck`, `typecheck:tests`, `typecheck:scripts`, admin tsc, desktop tsc ×4) ran on **every** merge commit (`cloud-results/combine-9-tovu-per-merge-typecheck.txt`, every error line). The full gate set ran on the relinked base, on the merged tip before the reinstall (`f3af9031a`), on the pre-fix tip (`b42ac42a9`) and on the final tip; non-typecheck attribution by file ownership (each changed path belongs to one branch).

| # | branch | tip | merge | conflicts → resolution | red found | fix commits | status |
|---|---|---|---|---|---|---|---|
| 1 | `release/lockfile-1120` | `0740ca85a` | `27b94e9a1` | none | typecheck 13 → 1 (only J1 left, paired at #4); desktop main → 1 (J1); typecheck:scripts → 3 base + J1. Lockfiles kept; `npm ci` root/admin/desktop 0 on them. **`apps/site-chat/package-lock.json` not regenerated → `npm ci` there fails (`C9-site-chat-lockfile-stale`)**. why-comments +2: `server/inbound/assistant/executor-definition-policies.ts:3-4 [554c2ea02b01]` (file deleted, comment not moved), `server/inbound/assistant/agent-daemon-scope.ts:524-527 [e2f8783dbd23]`. Full suite: `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts` expects `^0.7.0`, gets `^0.7.3-next.1` (stale pin after the bump); `agent-daemon-startup-cause.unit.test.ts` no longer sees `Startup stage: attachment preparation` (R8b `startupMessage`); `product-telemetry.unit.test.ts` "Tovu consumes agent and provider subpaths and declares no standalone vendor packages" (reason not traced) — all 3 identical on the base (they need lockfile-1120 + Jini merge-10, i.e. this pair) | — (listed) | DONE, RED listed |
| 2 | tv-sharezip | `6d61166940` | `c965d4734` | none | **3 NEW-RED** (base green): `site-backup/__tests__/credential-warnings.integration.test.ts` "export keeps database values … download requires a durable acknowledgement" and `site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts` (inSite) + (appData): T5 refuses (`UNSAFE_FILE`) before the existing acknowledgement flow → `C9-share-zip-refusal-vs-acknowledgement` | — (listed; needs a decision) | DONE, RED listed |
| 3 | tv-engaps2 (+ tv-engaps) | `2095ffdd47` | `f3b032a1a` | none | none (T1/T3/T4/T6 tests green; T2 STOPPED in-branch) | — | GREEN |
| 4 | tv-dgc2 (+ tv-dgc) | `35723a55ee` | `4692bc9a1` | none | pairs J1 (typecheck 1 → 0, desktop main 1 → 0); **TS7006 ×2** `features/theme/__tests__/theme-file-safety.test.ts(240,54)` + `(240,63)` (V3 `renameSync` mock params untyped) in typecheck:tests; **complexity New violation** `assistant/tool-registrations.ts:317 collectDomainRegistrations#1 [sonarjs/cognitive-complexity] 12` (V2's inline ternary policy wrapper) | `a963e5a78` (type the two mock params `fs.PathLike`) | FIXED (typecheck), complexity LISTED |
| 5 | tv-dg-contract | `7cd473cfe5` | `8f225c932` | none | none (3A/3B/3C/3D/3F green; 3D needs Chromium → green with the browser path) | — | GREEN |
| 6 | tv-dg-durable | `f9bd5307bf` | `a208c78d1` | none | none (8A green against linked Jini merge-10 = the 8 sheet values match; 8B target case SKIPPED: `SEMGREP_BASE` unset, by design) | — | GREEN |
| 7 | tv-dg-bnd2 (+ tv-dg-boundaries) | `c57b87742b` | `2abf2da14` | **`.dependency-cruiser.mjs` `PUBLIC_ENTRIES["features/theme"]`**: merge-8 (tv-c7b) renamed `entry-list-render` → `entry-list-markup`, `preview-refresh` → `preview-policy` + `theme-roster-ports`; bnd2 kept the old names and added 7 leaves. Resolution: union with merge-8's names (the old files no longer exist) + bnd2's `theme-page-eligibility`, `visitor-publication`, `static-render-content`, `static-render-menus`, `static-render-previews`, `static-template-choice`, `static-template-resolution`; `features/seo: ["page-head-contributor"]` and `platform/site-dir: ["moves", "errors"]` came in clean | **boundaries 12 → 0 errors** (DG2-01..06); architecture −5 cross-feature edges, −1 module cycle (`custom-credentials <-> source-control`); why-comments +3 `development/scripts/check-architecture.ts:339-347 [0f9ce469b870]`, `:387-417 [ebad2f5a63be]`, `:714-714 [5d77ef987002]` (DG2-02 rewrote `buildFileGraph` and dropped its comments). worker-import-graph unchanged 7/26 (DG2-06's repoints did not clear any of the 7). `dependency-cruiser.test.ts` "deep-import rules exempt tests and current composition…" red = base-red (scratch fixture lacks `development/boundaries/feature-ranks.json`, as bnd2's REFRESH noted); its new "declared theme leaves…" test green | — (listed) | DONE, LISTED |
| 8 | tv-w1 | `764cbc04a8` | `8c643e088` | none | none. E-O-T = **C8-dev-select-node-runtime-env fixed** (`dev.mjs:861` passes `env: process.env`). K-04b-T deleted `features/seo/cover-image.ts`; **no `error-gate-debt.json` row exists for it** (the dispatch's `:1273` names another file; combine-8's `--update` had already dropped it), same for T1's `validation/manifest-v2.ts` → nothing to shrink | — | GREEN |
| 9 | tv-w3 (+ tv-w2) | `f7811805ae` | `f3af9031a` | none | **3 NEW-RED** (base green): `admin-http/routes/media/__tests__/replace.test.ts` "replace reports the stored size of a sanitized SVG, and null when that size is unknown" (`69 !== null`), `trash-route.unit.test.ts` "media trash: an unknown stored size and public URL are reported as null" (`byteSize: 68` vs null), `upload-route.unit.test.ts` "media upload: an SVG reports its stored (sanitized) size, and null when that size is unknown" (`69 !== null`): I2-T replaced `assetBlobRepo.findByHash` with one `assetBlobRepo.list` call; these 3 tests still force "unknown" by mocking `findByHash` → null (stale test setup the sheet's importer search missed, not a production break). why-comments +1 `composition/modules/__tests__/assistant-ag-ui.wire.unit.test.ts:13-15 [bfd6320e6ccb]` (AG0-T deleted the file). AG0-T debt note: reason text of `190d29e2184f` updated in `b42ac42a9`. **RD-T2: kept** — without its flip both credential suites are red (3/14: DKIM now survives) | — (listed) | DONE, RED listed |

Follow-ups on top: `b42ac42a9` FIX-IF-CHEAP, `a963e5a78` build fix, `f7d697c04` open bugs, `f0cdc00cc` raw outputs, then report commits.

### FIX-IF-CHEAP (from combine-8's red-found column)
- `apps/site-chat/src/__tests__/SiteToolConfirmation.hooks.test.ts` 0 → 5: the three sync `act(() => control.decide(...))` calls wrapped as `act(() => { void control.decide(...); })` → **5/5** (`b42ac42a9`).
- admin `features/plugins/__tests__/package-file-tree.unit.test.ts` 0 → 5: expected orders put `jini-deploy-targets.json` first; ArrowUp-at-top / Home / unknown-path expectations follow → **31/31** (`b42ac42a9`).
- `development/scripts/__tests__/build-server-portable.test.mjs` D0a: fixture + expected message → `tovu-theme/jini-site-guide.json` → **6/6** (`b42ac42a9`).
- `browser-diagnostics.unit.test.ts` TS2339: already fixed in combine-8 (`130d838d1`); typecheck:tests 0 on the final tip.
- Combine-8 production bugs: `C8-dev-select-node-runtime-env` fixed by tv-w1 E-O-T; `C8-github-managed-manifest-path` (bundled-github-commit-site 37 red, unchanged) and `C8-css-unrenamed-jini-classes` listed only.

## Per-sheet tests and mutations
New/changed tests: all 44 changed node test files (`cloud-results/combine-9-tovu-changed-tests.txt`) on the final tree, concurrency 2: **999 tests, 990 pass, 7 fail, 2 skipped** — the 7 are 3× `render-form-layout.test.ts` (Chromium path, **4/4 green** with the browser path: `…-render-form-layout-browser.txt`), 3× `automatic-agent-plugins.integration.test.ts` (base-red since combine-8: identical at merge-8 and at merge-8 + lockfile, `…-base-pm1-autoplugins.txt`) and 1× `dependency-cruiser.test.ts` (base-red, above). Every test a sheet added passes: sharezip ×2, engaps T3 rejection tables + T4 child case + T6 count, dgc V1 witness + V2 ×8 + V4, dgc2 V3 ×2, dg-contract 3A–3D + 3F ×3, dg-durable 8A (+ 8B inline cases; target case skipped) + 3E + 10A, bnd2 DG2-01 + DG2-02 fixture, w1 auth (admin 16/16), w2 I2-T SQL case, w3 BYOK observation. Admin `Login`/`OwnerRecoverySignIn` 16/16.

Mutations (`cloud-results/combine-9-tovu-mutations.txt`; each applied alone in `/home/user/tb` on the final tree, file restored after) — **17 run, 17 KILLED**:
1. tv-sharezip: remove the static-export guard (`share-backend.ts:165`) → "a static export with captured credential content refuses before registration" red (13/1). (raw file label `sharezip-full` is this one; labels were swapped)
2. tv-sharezip: remove the full-share guard (`:185`) → "a full share with prepared credential warnings refuses before delivery or registration" red (13/1).
3. tv-dgc V1: `requirePermission: async () => {}` → "plugin search authorizes the caller before returning installed catalog data through the executor" red (18/1).
4. tv-dgc V2: all four rows back to the generated policy → 8 red (23/8).
5. tv-dgc V2: drop only `assistant_admin_screen_link` → its 2 cases red (29/2).
6. tv-engaps T3: bypass URL validation → "ensure() rejects unusable explicit daemon URLs without disclosing their values" red (9/1). (A first attempt produced a syntax error and was discarded.)
7. tv-engaps T3: bypass port validation → "ensure() rejects blank, zero, fractional and out-of-range proxy ports…" red (9/1).
8. tv-engaps2 T4: bare `Number(process.env.JINI_AGENT_DAEMON_PORT ?? 4319)` → "the standalone daemon rejects an invalid listener port without echoing it" red (2/1).
9. tv-engaps T6: export twice in `adapter.ts:378` → the github-pages success case red (31/1).
10. tv-dgc V4: restore the capped metadata lookup → "an approved saved key remains usable after fifty earlier keys…" red (8/1).
11. tv-dgc2 V3: drop signal forwarding in `fetchImage` → "a cancelled URL import forwards its signal and preserves the destination and revisions" red (27/1).
12. tv-dgc2 V3: drop `signal?.throwIfAborted()` before `persistThemeImport` → same case red (27/1).
13. tv-w3 T1-perfobs: omit the observability forwarding → "a registered BYOK call settles one tool.call and the live gate suppresses the next observation" red (85/1).
14. tv-w1 TV-ES1: drop `disclosure="id-only"` in `Login.tsx` → "shows the error ID without Copy details for an anonymous sign-in failure" red (15/1); 16/16 restored.
15. tv-dg-contract 3F: bypass malformed-body rejection → "the AG-UI route refuses authenticated requests whose messages are not an array" red (8/1).
16. tv-dg-bnd2 DG2-01: remove the `theme-page-eligibility` leaf → "declared theme leaves retain private-file and upward value-import boundaries" red.
17. tv-dg-durable 8A (Tovu-side variant): registry `sheets.submission.id` → `_tovu_submission_id` → "registered persisted names match their production declarations" red (4/1). (The named mutation edits Jini's Sheets constant; Jini is read-only here.)
- RD-T2 check: merge-8 copies of `credential-chat-intake.unit.test.ts` + `credential-noise.unit.test.ts` on the relinked tree → **11 pass / 3 fail** ("a plain URL message is not a credential paste…", "real keys in the current prompt are still caught…", "public DKIM history cannot flag a current public deployment URL…"); with the flip 14/14 → flip kept (`…-rdt2-unflipped.txt`).

NOT-RUN (time; listed per sheet): tv-engaps T1 marker removals (×2), T3 per-criterion bypasses; tv-dgc V2 rows 2–4 individually, QV1–QV4 message removals (×4; test-safety vs merge-8 is OK instead); tv-dg-contract 3A (payload filename), 3B (payload id), 3C (runtime + declaration export), 3D (Worker selector), 3F `runId` omission + session bypass — these mutate Jini/packaged payloads, which this run treats read-only; tv-dg-durable 8A named (Jini constant), 8B (both comparisons), 3E (×3), 10A (×3); tv-dg-boundaries DG2-02 (×3), DG2-03, DG2-04, DG2-05 (×3), DG2-06 (×3), DG2-01 rule suppressions (×2); tv-w1 E-O-T (Jini probe map), K-04b-T (×3), L15.8 (×2), T1 (×2); tv-w2 AG0-T (Jini `end_turn`), I2-T (×3); tv-w3 gate snapshot. Chrome/Electron looks owed (none run, no live app): sharezip refusal + clean download; dgc V2 one allowed admin-assistant call, V4 saved-key adoption; engaps2 T4 packaged daemon start; dg-contract 3D static submit, 3F one authenticated assistant turn; dg-durable 3E owned-site register/refusal/replace; bnd2 Chrome check; w1 failed sign-in ID line, K-04b-T body cover/override/no cover; w2 TV-AG1 (STOPPED).

## Real production bugs found (also in `development/open-bugs.md` → "combine-9")
1. **`C9-share-zip-refusal-vs-acknowledgement`** (confirmed, tv-sharezip T5): the new hard refusal fires before the existing acknowledgement flow (`needsAcknowledgement`, 403 `ACKNOWLEDGE_CREDENTIALS`, `POST …/site-shares/<id>/acknowledge`), so that flow is unreachable and any site whose files carry anything credential-shaped can no longer be exported at all (admin export → 400 `UNSAFE_FILE`). 3 NEW-RED tests.
2. **`C9-site-chat-lockfile-stale`** (confirmed, release/lockfile-1120): `apps/site-chat/package-lock.json` still pins `@jini-ai/{agentic,chat,core,protocol}` 0.7.0 against `^0.7.3-next.1` manifests → `npm ci` fails there (`EUSAGE`).
Not bugs but owed: tv-w2 I2-T's 3 stale `findByHash` mocks (test repoint to `list`); Tovu translation for Jini merge-10's new admin redirects message.

## Gates — relinked base (`1640fcd85a`) vs final (`f7d697c04`, code = `a963e5a78`)
Raw: `cloud-results/combine-9-tovu-base-<gate>.txt` and `cloud-results/combine-9-tovu-<gate>.txt`; summaries `…-base-gates-summary.txt`, `…-gates-summary.txt`, pre-reinstall `…-gates-summary-premerge-reinstall-f3af9031a.txt`, pre-fix `…-gates-summary-prefix-b42ac42a9.txt`; per merge `…-per-merge-typecheck.txt`.

| gate | base | final | note |
|---|---|---|---|
| `npm run typecheck` (+e2e) | exit 2, 13 errors (e2e not reached) | 0 | base = Jini R8/R11/J1 pairs (listed above); 0 from merge 4 on |
| `typecheck:tests` | exit 2, 28 errors | 0 | 2 at merges 4–9 (TS7006 ×2, tv-dgc2), fixed `a963e5a78` |
| `typecheck:e2e` | not reached | 0 | |
| `typecheck:scripts` | exit 2, 9 errors | exit 2, 3 errors | the 3 long-standing base-red: `agent-plugin-activation.ts(100,23)` TS2554, `check-size-drift.ts(9,8)` TS5097, `dev-admin-build.ts(6,12)` TS2339 |
| admin `tsc --noEmit -p .` | 0 | 0 | every merge 0 |
| desktop tsc preload/renderer/main/live-verify | 0/0/**12**/0 | 0/0/0/0 | main red until merge 4 (R8/R11 then J1) |
| `check:size` | exit 1 | exit 1 | both: New `admin-http/dev-auth.ts` 508, New `modules/assistant-byok.ts` 531, Worsened `SiteGrid.tsx` 502 (501), Worsened `publish-agent-tools.ts` 775 (763) — owner-accepted, no rows added |
| `check:complexity` | 0 | **exit 1** | New violation: `apps/website/src/assistant/tool-registrations.ts:317 collectDomainRegistrations#1 [sonarjs/cognitive-complexity] 12` (tv-dgc V2). Listed, not fixed (not a build/typecheck blocker) |
| `check:architecture` | exit 1 | exit 1 | files 2295 → 2292; cross-feature edges 319 → 314; propagation all-import 12.44 → 12.40 %, runtime-only 3.40 → 3.33 % (ratchet WARNING 3.06 → 3.33 remains); module cycles 2 → 1; API surface 685 → 689; hubs 317 → 315. NEW cross-feature edges gone: `custom-credentials/credential-ports.ts → source-control/provider-registry.ts`, `entries/repo.sqlite.ts → media/access-evidence.ts`, `post/repo.memory.ts → media/access-evidence.ts`, `post/repo.ts → media/access-evidence.ts`, `site-backup/plan-content.ts → source-control/provider-module.ts` |
| `check:boundaries` | exit 12: 12 errors, 111 warnings | **0 errors**, 111 warnings | 0 new |
| `check:hooks` | ok | ok | |
| `check:why-comments` | 76 open | **82 open** | 0 gone, 6 new: `check-architecture.ts:339-347 [0f9ce469b870]`, `:387-417 [ebad2f5a63be]`, `:714-714 [5d77ef987002]` (bnd2/DG2-02); `inbound/assistant/executor-definition-policies.ts:3-4 [554c2ea02b01]`, `inbound/assistant/agent-daemon-scope.ts:524-527 [e2f8783dbd23]` (lockfile-1120); `modules/__tests__/assistant-ag-ui.wire.unit.test.ts:13-15 [bfd6320e6ccb]` (tv-w2 AG0-T) |
| `worker-import-graph.test.ts` | 7/26 fail | 7/26 fail | identical: handlebars-worker ×2, liquid-worker ×2, "public page requests do not load feature-wide barrels or assistant tools", `routes/site/products.ts`, `routes/site/member-pages.ts` |
| `check:errors` | passed: 590 findings / 326 entries | passed: 0 New, 0 Worse, 590 / 326 | `--update` run: ledger unchanged (326 entries), so no ledger commit |

Debt files: no textual conflicts in any of `error-gate-debt.json`, `size-debt.json`, `src-complexity-debt.json`, `check-architecture.baseline.json`, `why-comments-debt.json` (only the AG0-T reason text changed, by me).

## Tests
- **Full node suite** (`npm test` globs, 3,332 files, final code tip `a963e5a78`, each file alone under a 15-min watchdog, 3 in parallel, PostgreSQL up, browser path set): **COMPLETE — every file ran.** 35,880 pass / 320 fail (+11 skipped, 1 cancelled) in 166 failing files; 1 watchdog kill: `assistant/persistence/__tests__/run-ledger.dialects.test.ts` (54 pass, then the real-postgres pool close hangs — identical on base, as in combine-8). Every failing file base-diffed on the relinked base + lockfile pair (`27b94e9a1`; merge-8 alone cannot load several modules against Jini merge-10): **159 identical, 7 NEW-RED** (`cloud-results/combine-9-tovu-full-suite-failing-files.txt`, every failing test with its first error line in `…-full-suite-failing-reasons.txt`, per-file results in `…-full-suite-per-file.txt`):
  - tv-sharezip T5: `credential-warnings.integration.test.ts` 0 → 1, `saved-keys-round-trip.integration.test.ts` 0 → 2 (bug 1).
  - tv-w2 I2-T stale mocks: `media/__tests__/replace.test.ts` 0 → 1, `trash-route.unit.test.ts` 0 → 1, `upload-route.unit.test.ts` 0 → 1.
  - Environment (Postgres contention between parallel processes): `persistence/__tests__/durable-run-store.dialects.test.ts` 0 → 2 ("a colliding question ID cannot commit an answer without its question", "an invalid user payload or shared user/assistant identity cannot be accepted": `Missing expected rejection`), `package-adapters.dialects.test.ts` 0 → 3 (`ai_chats: created conversation c was not readable in its own scope`) — **79/79 green run alone** on the final tree (`…-dialects-alone.txt`).
- **vs combine-8's final** (its changed-files + full-suite lists): green now — `SiteToolConfirmation.hooks.test.ts`, `build-server-portable.test.mjs` (FIX-IF-CHEAP), `credential-chat-intake` + `credential-noise` (RD-T2), `render-form-layout`, `site-evidence/…/playwright-browser.integration`, `theme/__tests__/preview-switcher-layout`, `owner-passkey-browser` + `owner-passkey-http` (browser path), `chat-dialect-matrix.ts`. Red now but identical on the relinked base (the relink/lockfile pair, not the codex branches): `agent-daemon-startup-cause.unit.test.ts`, `product-telemetry.unit.test.ts`, `packages/sdk/…/sdk-public-api.unit.test.ts` (row 1 of the branch table). Still red from combine-8 (base-red here): `init-site-branches.integration.test.ts` 1, `no-raw-sqlite.boundary.test.ts` 1, `bundled-github-commit-site` 37, fly `host-signals` 34, `federate-mcp` 4, `automatic-agent-plugins` 3, plus the rest of the list below.
- **Admin vitest full** (final): 905 files, **14,864 pass / 19 fail / 2 skipped** (`…-admin-full.txt`). The 19 = the owner-listed base-red set exactly: `lib/__tests__/admin-literal-copy.unit.test.ts` ×1, `credential-input-autocomplete.unit.test.ts` ×1, `dictionary-lookup-sinks.unit.test.ts` ×1, `components/__tests__/JiniMediaPicker.hooks.unit.test.tsx` ×3 ("MediaPickerDialog under the host picker…", "reports an error when the media list cannot be read", "reports an error when the picked media is no longer active"), `integrations/chart-providers/__tests__/recharts-bundle-integer-ticks.unit.test.ts` ×13. package-file-tree 31/31 (was 5 red).
- **Desktop `npm test` full** (final, both halves run): main **2,211 tests, 2,196 pass, 4 fail, 11 skipped** — the 3 root-chmod cases as in combine-8 (`site-child-registry.test.ts` "an unreadable own file that cannot be moved aside…", `site-dir-store.test.ts` "a torn recent-sites file that cannot be moved aside…", `tracked-sites.test.ts` "a torn projects file that cannot be moved aside…") + **`src/speech/preload-speech.test.ts`** (file-level: `ENOENT …/apps/desktop/dist/speech/preload-speech.cjs` — needs the desktop build output, not built in this container; environment); renderer **916 / 912 / 2** — `use-site-folders.hooks.test.ts` "closing the settings dropdown leaves the sites dialog…", `use-workspace-chat-pane.hooks.test.ts` "WorkspaceChatPane uses no raw React primitives…" (both as combine-8). Raw `…-desktop-main.txt`, `…-desktop-renderer.txt`.
- **`check:test-safety`**: vs merge-8 **OK** — 110 changed `.ts` files, no new message-less assertions (`…-check-test-safety-vs-merge8.txt`); vs `origin/main` FAIL, **111 files** (combine-8: 115; full list `…-check-test-safety-vs-main.txt`).
- **moved-tools golden**: green on the final tip (1/1) → **no re-record**; no tool id/description/inputSchema changed (V2 changes policies only).
- **Knip UNLINKED** (fresh worktree, `npm ci --ignore-scripts` root/admin/desktop 0; site-chat `npm ci` fails (bug 2) so it got a no-lockfile `npm install` in the scratch tree; playwright plugin disabled in a scratch config; `--include dependencies`): Unused dependencies (11): admin `micromark`, `micromark-extension-gfm`; desktop `@jini-ai/integrations`, `@modelcontextprotocol/sdk`, `jszip`, **`node-pty` (new vs combine-8)**; root `@jini-ai/plugin-catalog`, `jszip`, `mammoth`, `unpdf`; contracts `@jini-ai/analytics`. Unused devDependencies (8): desktop `jsdom`, `micromark`, `micromark-extension-gfm`, `npm`; root `@opentelemetry/exporter-trace-otlp-http`, `@types/js-yaml`, `astro`, `drizzle-kit`. List only (`…-knip-unused-deps.txt`).
- **Test hygiene**: the full suite again left `chat.db` and `sites/tovu-dev/agent-plugins/…` in the repo root (as combine-8); deleted, not committed.

## Skipped and why
- Fixing the listed new reds (T5 vs acknowledgement — needs a decision; I2-T's 3 stale mocks; complexity violation; 6 why-comments; site-chat lockfile; sdk/startup-cause/product-telemetry pins): rule "only what blocks build/typecheck + FIX-IF-CHEAP".
- Mutations and Chrome/Electron looks marked NOT-RUN above; e2e/playwright journeys not run.
- Jini-side mutations: Jini is read-only for this run.

## Decisions needed
1. **Share/export with credential warnings** (`C9-share-zip-refusal-vs-acknowledgement`): keep T5's hard refusal (delete the acknowledgement route/state, repoint 3 tests) or scope T5 to public-token shares and keep the acknowledged owner download.
2. **site-chat lockfile**: regenerate `apps/site-chat/package-lock.json` against the published 0.7.3-next.1 (lockfile-1120 owner).
3. **Complexity**: split V2's policy wrapper out of `collectDomainRegistrations` or accept 12 with a debt row.
4. **why-comments +6**: put back DG2-02's `buildFileGraph` comments and the two lockfile-1120 daemon comments, or allow-list them.
5. Carried from combine-8: GitHub ownership manifest path, T-IMPORT-ABORT vs `init-site-branches`, `tovu/<id>` identity + labels, Fly `TOVU_RUNTIME_MODE` advice, the 4 owner-accepted size files.

## Next step
Small test/lockfile follow-up sheet: I2-T's 3 media tests mock `assetBlobRepo.list` instead of `findByHash`; `sdk-public-api` expects `^0.7.3-next.1`; `agent-daemon-startup-cause` (R8b `startupMessage`) and `product-telemetry` (cause not traced) repointed after a read; site-chat lockfile; Tovu translation for Jini's new redirects message. Then decision 1 before releasing tv-sharezip. Then Chrome/Electron looks and the NOT-RUN mutations.

## Appendix — every failing node file on the final tip (verdict, tip rc|pass|fail, base rc|pass|fail)
- SAME `apps/site-chat/src/__tests__/site-assistant-transport.test.ts` tip 1|0|1 base 1|0|1
- SAME `apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts` tip 1|40|3 base 1|40|3
- SAME `apps/website/src/assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts` tip 1|6|1 base 1|6|1
- SAME `apps/website/src/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts` tip 1|9|1 base 1|9|1
- SAME `apps/website/src/assistant/__tests__/mcp-ui-sandbox-proxy-route.test.ts` tip 1|6|1 base 1|6|1
- SAME `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.visitor-isolation.test.ts` tip 1|0|1 base 1|0|1
- NEW-RED `apps/website/src/assistant/persistence/__tests__/durable-run-store.dialects.test.ts` tip 1|64|2 base 0|66|0
- NEW-RED `apps/website/src/assistant/persistence/__tests__/package-adapters.dialects.test.ts` tip 1|10|3 base 0|13|0
- SAME `apps/website/src/assistant/persistence/__tests__/run-ledger.dialects.test.ts` tip 124|54|0 base 124|54|0
- SAME `apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts` tip 1|16|1 base 1|16|1
- SAME `apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts` tip 1|5|2 base 1|5|2
- SAME `apps/website/src/contracts/core/__tests__/unit/describe-error-for-log.unit.test.ts` tip 1|1|1 base 1|1|1
- SAME `apps/website/src/contracts/core/events/__tests__/forms-notification-retry.test.ts` tip 1|2|2 base 1|2|2
- SAME `apps/website/src/contracts/core/events/__tests__/outbox-retry-policies.unit.test.ts` tip 1|6|1 base 1|6|1
- SAME `apps/website/src/contracts/core/events/__tests__/outbox-worker.test.ts` tip 1|18|1 base 1|18|1
- SAME `apps/website/src/features/agent-plugins/__tests__/unit/bundled-automatic-relevance.unit.test.ts` tip 1|2|4 base 1|2|4
- SAME `apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-package.unit.test.ts` tip 1|7|6 base 1|7|6
- SAME `apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-commit-site.unit.test.ts` tip 1|22|37 base 1|22|37
- SAME `apps/website/src/features/agent-plugins/__tests__/unit/federate-mcp.unit.test.ts` tip 1|30|4 base 1|30|4
- SAME `apps/website/src/features/agent-plugins/__tests__/unit/install-upload-update.unit.test.ts` tip 1|17|1 base 1|17|1
- SAME `apps/website/src/features/agent-plugins/__tests__/unit/mail-provider-contribution.unit.test.ts` tip 1|12|1 base 1|12|1
- SAME `apps/website/src/features/agent-plugins/__tests__/unit/tw2-L224-characterization.unit.test.ts` tip 1|3|1 base 1|3|1
- SAME `apps/website/src/features/api-connections/__tests__/vendor-neutrality.test.ts` tip 1|1|1 base 1|1|1
- SAME `apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts` tip 1|0|14 base 1|0|14
- SAME `apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts` tip 1|0|7 base 1|0|7
- SAME `apps/website/src/features/deployments/deploy-targets/__tests__/no-vendor-in-core.boundary.test.ts` tip 1|15|1 base 1|15|1
- SAME `apps/website/src/features/deployments/static-publish/__tests__/publish-run.unit.test.ts` tip 1|17|1 base 1|17|1
- SAME `apps/website/src/features/external-mcp/__tests__/external-mcp-frozen-db.postgres.test.ts` tip 1|0|1 base 1|0|1
- SAME `apps/website/src/features/media-import/__tests__/import-local-file-search.test.ts` tip 1|1|1 base 1|1|1
- SAME `apps/website/src/features/member-login/__tests__/providers.test.ts` tip 1|59|1 base 1|59|1
- SAME `apps/website/src/features/member-login/__tests__/ready-providers.test.ts` tip 1|0|4 base 1|0|4
- SAME `apps/website/src/features/plugins/__tests__/data-module-indexes.test.ts` tip 1|8|1 base 1|8|1
- SAME `apps/website/src/features/plugins/__tests__/data-module.test.ts` tip 1|28|4 base 1|28|4
- NEW-RED `apps/website/src/features/site-backup/__tests__/credential-warnings.integration.test.ts` tip 1|3|1 base 0|4|0
- SAME `apps/website/src/features/site-backup/__tests__/import-restore.unit.test.ts` tip 1|46|1 base 1|46|1
- NEW-RED `apps/website/src/features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts` tip 1|2|2 base 0|4|0
- SAME `apps/website/src/features/sites/__tests__/playwright-site-preview-capture.unit.test.ts` tip 1|13|1 base 1|13|1
- SAME `apps/website/src/features/web-screenshot/__tests__/playwright-page-capture.unit.test.ts` tip 1|24|1 base 1|24|1
- SAME `apps/website/src/features/webhooks/__tests__/secret-scan-guard.test.ts` tip 1|16|2 base 1|16|2
- SAME `apps/website/src/features/webhooks/__tests__/tool-contract.characterization.test.ts` tip 1|13|2 base 1|13|2
- SAME `apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts` tip 1|64|1 base 1|64|1
- SAME `apps/website/src/platform/db/__tests__/seed-content-store.postgres.test.ts` tip 1|3|1 base 1|3|1
- SAME `apps/website/src/platform/db/kernel/__tests__/no-raw-sqlite.boundary.test.ts` tip 1|77|1 base 1|77|1
- SAME `apps/website/src/platform/db/migrations/__tests__/checksums.test.ts` tip 1|3|2 base 1|3|2
- SAME `apps/website/src/platform/db/migrations/__tests__/postgres-baseline.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts` tip 1|37|1 base 1|37|1
- SAME `apps/website/src/platform/headless-browser/__tests__/playwright-loader.unit.test.ts` tip 1|0|2 base 1|0|2
- SAME `apps/website/src/platform/site-dir/__tests__/integration/init-site-branches.integration.test.ts` tip 1|21|1 base 1|21|1
- SAME `apps/website/src/server/__tests__/admin-local-boot-session-route.test.ts` tip 1|26|1 base 1|26|1
- SAME `apps/website/src/server/__tests__/admin-page-html-route.test.ts` tip 1|8|1 base 1|8|1
- SAME `apps/website/src/server/__tests__/admin-trash-routes.test.ts` tip 1|8|4 base 1|8|4
- SAME `apps/website/src/server/__tests__/bare-test-listeners.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/__tests__/helper-teardown.unit.test.ts` tip 1|13|2 base 1|13|2
- SAME `apps/website/src/server/__tests__/integration/credentials-real-composition.unrun.integration.test.ts` tip 1|4|2 base 1|4|2
- SAME `apps/website/src/server/__tests__/integration/forms-real-composition.unrun.integration.test.ts` tip 1|4|4 base 1|4|4
- SAME `apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts` tip 1|7|1 base 1|7|1
- SAME `apps/website/src/server/__tests__/routes/content-post-get-by-slug.test.ts` tip 1|13|1 base 1|13|1
- SAME `apps/website/src/server/__tests__/routes/forms-submit.test.ts` tip 1|39|1 base 1|39|1
- SAME `apps/website/src/server/__tests__/routes/member-password-auth.test.ts` tip 1|29|1 base 1|29|1
- SAME `apps/website/src/server/__tests__/routes/members-public-complete-sign-in.test.ts` tip 1|11|1 base 1|11|1
- SAME `apps/website/src/server/__tests__/routes/newsletter-public-routes.test.ts` tip 1|9|1 base 1|9|1
- SAME `apps/website/src/server/__tests__/routes/pages-update-html-auth.test.ts` tip 1|12|1 base 1|12|1
- SAME `apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts` tip 1|4|2 base 1|4|2
- SAME `apps/website/src/server/__tests__/unit/forms-module-sender.unit.test.ts` tip 1|3|1 base 1|3|1
- SAME `apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled.integration.test.ts` tip 1|30|2 base 1|30|2
- SAME `apps/website/src/server/inbound/admin-http/routes/forms/__tests__/l244-characterization.unit.test.ts` tip 1|17|4 base 1|17|4
- NEW-RED `apps/website/src/server/inbound/admin-http/routes/media/__tests__/replace.test.ts` tip 1|15|1 base 0|16|0
- NEW-RED `apps/website/src/server/inbound/admin-http/routes/media/__tests__/trash-route.unit.test.ts` tip 1|6|1 base 0|7|0
- NEW-RED `apps/website/src/server/inbound/admin-http/routes/media/__tests__/upload-route.unit.test.ts` tip 1|9|1 base 0|10|0
- SAME `apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/integration/browser-provider.integration.test.ts` tip 1|0|1 base 1|0|1
- SAME `apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-backups.integration.test.ts` tip 1|0|1 base 1|0|1
- SAME `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.executable-tools-wiring.unit.test.ts` tip 1|0|1 base 1|0|1
- SAME `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.page-navigate-error-rewrap.unit.test.ts` tip 1|4|2 base 1|4|2
- SAME `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-resume-wiring.unit.test.ts` tip 1|19|1 base 1|19|1
- SAME `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.tool-restriction-wiring.unit.test.ts` tip 1|11|1 base 1|11|1
- SAME `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-startup-cause.unit.test.ts` tip 1|0|1 base 1|0|1
- SAME `apps/website/src/server/inbound/assistant/__tests__/byok-message-attachments.unit.test.ts` tip 1|3|2 base 1|3|2
- SAME `apps/website/src/server/inbound/assistant/__tests__/integration/component-catalog-routes.integration.test.ts` tip 1|0|1 base 1|0|1
- SAME `apps/website/src/server/inbound/public-http/http/site/__tests__/render.golden.characterization.test.ts` tip 1|12|1 base 1|12|1
- SAME `apps/website/src/server/inbound/public-http/http/site/__tests__/tiptap-render-contract.test.ts` tip 1|73|1 base 1|73|1
- SAME `apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts` tip 1|19|7 base 1|19|7
- SAME `apps/website/src/server/runtime/boot/__tests__/fatal-boot-failure.unit.test.ts` tip 1|7|1 base 1|7|1
- SAME `apps/website/src/server/runtime/boot/__tests__/index-bind-host-wiring.unit.test.ts` tip 1|4|1 base 1|4|1
- SAME `apps/website/src/server/runtime/boot/__tests__/mail-send.golden.test.ts` tip 1|0|1 base 1|0|1
- SAME `apps/website/src/server/runtime/boot/__tests__/process-error-guards.unit.test.ts` tip 1|1|1 base 1|1|1
- SAME `apps/website/src/server/runtime/boot/__tests__/resolve-mailer.unit.test.ts` tip 1|32|1 base 1|32|1
- SAME `apps/website/src/server/runtime/boot/__tests__/site-boot-readiness.unit.test.ts` tip 1|4|1 base 1|4|1
- SAME `apps/website/src/server/runtime/boot/__tests__/site-daemon-callback-wiring.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/boot/__tests__/site-key-boot-notice.unit.test.ts` tip 1|26|1 base 1|26|1
- SAME `apps/website/src/server/runtime/composition/__tests__/app-federation-reload.observability.test.ts` tip 1|0|1 base 1|0|1
- SAME `apps/website/src/server/runtime/composition/__tests__/browser-provider.integration.test.ts` tip 1|3|2 base 1|3|2
- SAME `apps/website/src/server/runtime/composition/__tests__/bundled-inactive-gating.integration.test.ts` tip 1|7|1 base 1|7|1
- SAME `apps/website/src/server/runtime/composition/__tests__/create-app-route-table.pin.test.ts` tip 1|3|7 base 1|3|7
- SAME `apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts` tip 1|6|1 base 1|6|1
- SAME `apps/website/src/server/runtime/composition/__tests__/memory-root-route-deps-shape.pin.test.ts` tip 1|1|1 base 1|1|1
- SAME `apps/website/src/server/runtime/composition/__tests__/pages-html-revisions-wiring.integration.test.ts` tip 1|0|2 base 1|0|2
- SAME `apps/website/src/server/runtime/composition/__tests__/plugin-credential-cards.unit.test.ts` tip 1|19|1 base 1|19|1
- SAME `apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts` tip 1|22|3 base 1|22|3
- SAME `apps/website/src/server/runtime/composition/__tests__/portable-plugin-host.unit.test.ts` tip 1|4|2 base 1|4|2
- SAME `apps/website/src/server/runtime/composition/__tests__/process-root-parity.test.ts` tip 1|6|1 base 1|6|1
- SAME `apps/website/src/server/runtime/composition/__tests__/product-telemetry.unit.test.ts` tip 1|18|1 base 1|18|1
- SAME `apps/website/src/server/runtime/composition/__tests__/recharts-package-pin.unit.test.ts` tip 1|4|4 base 1|4|4
- SAME `apps/website/src/server/runtime/composition/__tests__/webhook-delivery-worker.shutdown.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/__tests__/webhook-delivery-worker.test.ts` tip 1|13|1 base 1|13|1
- SAME `apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts` tip 1|5|1 base 1|5|1
- SAME `apps/website/src/server/runtime/composition/modules/__tests__/agent-daemon-core-rpc.integration.test.ts` tip 1|5|1 base 1|5|1
- SAME `apps/website/src/server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.integration.test.ts` tip 1|3|1 base 1|3|1
- SAME `apps/website/src/server/runtime/composition/modules/__tests__/assistant-byok.inputs-pin.test.ts` tip 1|3|1 base 1|3|1
- SAME `apps/website/src/server/runtime/composition/modules/__tests__/site-search.unit.test.ts` tip 1|23|2 base 1|23|2
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/after-assembly-forms-search.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/agent-plugin-bootstrap.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/boot-data.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/chat-orphans-project-keys.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/content-repos.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/content-resolvers-comments.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/content-stores.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/database-journal.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/events-origin.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/mail-http.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/media-storage.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/plugin-runtime.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/pre-assembly.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/provider-identity.characterization.unit.test.ts` tip 1|1|1 base 1|1|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/publish-apply.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/publishing-stores-themes.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/redirects.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-assistant-mcp.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-comments-plugins.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-content-chat.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-members-mail.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-publish-credentials.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/route-deps-site-providers.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/shared-oauth-commerce.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/site-imports.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/site-keys-members.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/site-sharing.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/store-basics.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/trash-adapters.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/trash-follow-up-hooks.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/trash-service.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/composition/site-deps/__tests__/trash-stores.characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `apps/website/src/server/runtime/lifecycle/__tests__/assistant-daemon-demand.unit.test.ts` tip 1|7|1 base 1|7|1
- SAME `content/agent-plugin-overlays/calendly/__tests__/guidance.test.mjs` tip 1|1|1 base 1|1|1
- SAME `content/agent-plugin-overlays/fly/__tests__/deploy-config.test.mjs` tip 1|3|2 base 1|3|2
- SAME `content/agent-plugin-overlays/fly/__tests__/host-signals.test.mjs` tip 1|129|34 base 1|129|34
- SAME `content/agent-plugin-overlays/fly/__tests__/publish-candidates.test.mjs` tip 1|0|1 base 1|0|1
- SAME `content/agent-plugin-overlays/github/__tests__/source-control-credential.test.mjs` tip 1|2|1 base 1|2|1
- SAME `content/agent-plugin-overlays/github/__tests__/source-control-tool-wiring.test.mjs` tip 1|0|1 base 1|0|1
- SAME `content/agent-plugin-overlays/google-login/__tests__/exports.test.mjs` tip 1|5|1 base 1|5|1
- SAME `content/agent-plugin-overlays/google-workspace/__tests__/form-delivery.e2e.test.mjs` tip 1|0|1 base 1|0|1
- SAME `content/agent-plugin-overlays/google-workspace/__tests__/sheets-admin-host-schema.security.test.mjs` tip 1|0|1 base 1|0|1
- SAME `content/agent-plugin-overlays/google-workspace/__tests__/sheets-admin.vertical-slice.test.mjs` tip 1|0|1 base 1|0|1
- SAME `content/agent-plugin-overlays/railway/__tests__/credential-card.test.mjs` tip 1|2|1 base 1|2|1
- SAME `content/agent-plugin-overlays/railway/__tests__/deploy-config.test.mjs` tip 1|1|1 base 1|1|1
- SAME `content/agent-plugin-overlays/render/__tests__/credential-card.test.mjs` tip 1|2|1 base 1|2|1
- SAME `content/agent-plugin-overlays/render/__tests__/deploy-config.test.mjs` tip 1|1|1 base 1|1|1
- SAME `content/agent-plugin-overlays/resend/__tests__/bundled-mail.test.mjs` tip 1|27|1 base 1|27|1
- SAME `content/agent-plugin-overlays/resend/__tests__/resend-mcp.test.mjs` tip 1|0|1 base 1|0|1
- SAME `development/scripts/__tests__/bundled-agent-plugin-selection.test.ts` tip 1|2|1 base 1|2|1
- SAME `development/scripts/__tests__/check-idle-motion.test.ts` tip 1|9|1 base 1|9|1
- SAME `development/scripts/__tests__/dead-path-sweep.test.ts` tip 1|39|2 base 1|39|2
- SAME `development/scripts/__tests__/dependency-cruiser.test.ts` tip 1|1|1 base 1|0|1
- SAME `development/scripts/__tests__/openapi-contract-fixtures.test.ts` tip 1|1|1 base 1|1|1
- SAME `development/scripts/__tests__/unit/script-inventory-characterization.unit.test.ts` tip 1|2|1 base 1|2|1
- SAME `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts` tip 1|12|1 base 1|12|1
