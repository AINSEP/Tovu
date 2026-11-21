SHAS_PLACEHOLDER

# cloud-bugs-1120 — triage + fixes of the 46 cloud-only bug rows (2026-11-21)

Unattended cloud run. Node 24.22.3 (`/opt/node24`), pnpm 10.33.2 (corepack). No subagents, no codebase-memory tools, no force-push, no `--no-verify`; `main` / `refactor/terra` / `plan/*` / `integ/*` untouched (only fetched). Lockfiles and package versions untouched (the `release/lockfile-1120` run owns them). The combine-7 "Decisions needed" 1–14 were not touched.

Bases: Tovu `origin/integ/merge-7-2026-11-20` `8d1a4c2742`, Jini `origin/integ/merge-7-2026-11-20` `06559affb`. Input: `origin/plan/culls-1120` → `cloud-bugs/list.md` (46 rows), `cloud-bugs/design-r62t-bugs.md`, `cloud-bugs/open-bugs-snapshot.md` (row ID = its line number), plus `cloud-results/combine-7-tovu.md`.

**Result: 46 rows → FIX-HERE 2 (1 FIXED, 1 confirmed and LEFT as minor), ALREADY-FIXED 17, LOCKFILE-RUN 8, NOT-RUNNABLE 19.** Most of the cloud-only rows were already repaired in code on the merge-7 bases: they stayed open only for a check that needs a packaged app, a real model/provider, or a registry release. The one reproducible defect still present was 552 (repo-scanning check scripts compiled into the server build that the desktop payload ships). It is fixed with a test that fails first. Jini is unchanged, so there is no Jini fix branch.

## Setup
- Jini (`06559affb`): `pnpm install --frozen-lockfile` exit 0, `pnpm --no-bail -r build` exit 0.
- Tovu (`8d1a4c2742`): `npm ci --ignore-scripts` in the root, `apps/admin` and `apps/desktop` (all exit 0); `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` exit 0 (80 links, **including `apps/desktop`**); `packages/contracts` + `packages/sdk` built.
- PostgreSQL was not started. No row in scope needed it.

## Triage (all 46 rows)
Buckets follow the dispatch. Where the code repair is already on the base and only a check in a real environment is owed, the row is NOT-RUNNABLE, with the code evidence and the exact manual check.

| row | bucket | evidence (base unless noted) | fix commit | test |
|---|---|---|---|---|
| 1319 Recharts integrity pin | LOCKFILE-RUN | `charts-recharts-source.ts:27-33` pins `@jini-ai/provider-plugins` **0.7.1** bytes (published tarball). Against linked Jini merge-7, `recharts-package-pin.unit.test.ts` is 2 red (combine-7). Re-pin after the next provider-plugins publish. | — | `recharts-package-pin.unit.test.ts` |
| 1327 MCP isolation | ALREADY-FIXED | Jini `agent-runtime/src/__tests__/mcp-isolation-claim.unit.test.ts`: 24-cell matrix (userMcp true/false/**unset** × staged × parity+bypass × folder limit). Every per-run claim is checked against the built args. Claude makes no claim, so unset/off → `ASK userMcp`. Each claim must carry a `<name>@<cli version>@<date>` stamp. Planner: unset → off at `native-tool-policy.ts:91-97`. **Ran: 5/5 pass.** Remaining manual check: compare the stamp with a real installed CLI version when a def adds a claim. | — | same file |
| 1365 desktop local Jini link | ALREADY-FIXED | `9132a6300` link-jini discovers every app under `apps/`. Verified: this run's link log has an `apps/desktop:` section, and `apps/desktop/node_modules/@jini-ai/*` are symlinks. The "release Jini before packaging" half belongs to the lockfile run. | — | `development/scripts/__tests__/link-jini.test.mjs` |
| 1374 desktop stage / closure flag | ALREADY-FIXED | `apps/desktop/package.json:25` `stage` exists. `desktop-release.yml:87,162` calls it. The closure audit runs with `--experimental-import-meta-resolve` (`apps/desktop/scripts/verify-package.ts:49`). Manual: one green release workflow run. | — | `apps/desktop/src/staged-closure.test.ts`, `verify-package-cli.test.ts` |
| 1409 http-kit workspace specifier | ALREADY-FIXED | Jini `pnpm install --frozen-lockfile` exit 0 at `06559affb`. `packages/server/package.json:106` `workspace:^` = `pnpm-lock.yaml:1340-1341`. | — | recorded command (exit 0) |
| 1435 core export/pin | LOCKFILE-RUN | `package-lock.json:3178-3180` still resolves `@jini-ai/core` **0.7.0**, while `apps/desktop/src/desktop-resources.ts:3` imports `@jini-ai/core/errors/idioms`. Needs the core release + both lockfiles. | — | — |
| 103 Shared Keys cancellation | NOT-RUNNABLE | Code fixed: `custom-credentials/credential-copy-tool.ts:31` returns `dismissed` / `interrupted` / `nothing-to-pick`. Manual: real admin chat in Chrome — close the Shared Keys card, then send a message while it is open — and the same in packaged desktop. | — | — |
| 104 site-to-site key reuse | NOT-RUNNABLE | Same code (`0b05623ba` per the log). Manual: in packaged desktop, pick a key saved only on another site, approve it, and check that it lands in Shared Keys and is granted here. | — | — |
| 152 offline model picker / Escape | ALREADY-FIXED | Jini chat `model-options.ts:44` shows "Offline fallback" only once discovery is no longer pending (`model-options.test.ts:147-168`). Escape closes the picker and returns focus (`AgentRuntimePicker.test.tsx:289,328,385`). **Ran: 57/57.** | — | those two files |
| 156 summary vs live nav | NOT-RUNNABLE | Model wording about a theme's nav. Manual: a real agent turn on the practice theme; compare the reply with the rendered header. | — | — |
| 176 seven items for six | NOT-RUNNABLE | Model wording. Manual: a real cleanup turn; compare the receipts' counts with the reply. | — | — |
| 217 Antigravity per-tool limits | NOT-RUNNABLE | Needs the real Antigravity CLI and its current capability surface. | — | — |
| 218 desktop memory pill | NOT-RUNNABLE | Native process accounting in packaged Electron. | — | — |
| 404–412 user-path checks | NOT-RUNNABLE | Code + tests per the log. Manual: packaged Codex isolation parser (0.1.26+); cross-build import in packaged app; legacy CMS banner path; site-timezone post dates in UI; `zoran-new` start (readiness, see 607); `npm run desktop` native imports; blank landing; retried rows; chart legend. | — | — |
| 443 agent closes another Chrome tab group | NOT-RUNNABLE | Needs Claude in Chrome with two concurrent sessions. | — | — |
| 444 video upload > Chrome cap | NOT-RUNNABLE | Chrome tool upload cap. The 50 MiB local-file import works. | — | — |
| 495 minified Recharts donor | ALREADY-FIXED | No Recharts payload is tracked in Tovu (`git ls-files` has only `charts-recharts-source.ts`), and no app declares `recharts`. The provider ships from `@jini-ai/provider-plugins` (`charts-recharts-source.ts:13`). `plugin.recharts` as the default is deliberate (`:16`). | — | `recharts-package-pin.unit.test.ts` |
| 523 unpublished agentic range | ALREADY-FIXED | Root `package.json:138` `@jini-ai/agentic ^0.7.0`. `npm ci` exit 0. | — | recorded command |
| 525 / 553 node-pty spawn-helper | NOT-RUNNABLE | Code fixed: staging chmods every `spawn-helper` (`apps/desktop/src/stage-payload-lib.ts:638`), and verify-package fails on a non-executable one (`verify-package-cli.ts:146`). The 0.1.26 backport is moot. Manual: open a terminal in a packaged **arm64** build. | — | `stage-payload-lib.test.ts`, `pty-helpers.test.ts` |
| 531 / 545 staged `tsx` closure | NOT-RUNNABLE | Code fixed: `daemon-supervisor.ts` no longer resolves `tsx` (only argv strings remain). Closure false positives fixed per row 555. Manual: one release build (stage + verify-package) in CI. | — | `staged-closure.test.ts` |
| 541 linked UI dist export | ALREADY-FIXED | Built Jini `ui/dist/features/charts/catalog-manifests.js` exists. **Ran** `tool-catalog-query.entries.test.ts`: 9/9. | — | same file |
| **552 build scripts shipped** | **FIX-HERE → FIXED** | `secret-scan-guard.ts` and `default-credential-exposure.ts` (run from source by `check:secret-scan` / `check:default-credential`) were compiled by `tsconfig.json` into `dist/src`, which the desktop payload stages whole. Only `seal-aad-invariant` had been excluded. | `f57b409e0` | new case in `development/scripts/__tests__/app-runtime-dependencies.test.ts` (red on base: lists both files; green after: 6/6) |
| 558 post-publish deps and pins | LOCKFILE-RUN | Pins are real now (no `sha256-PENDING`), but they track a published provider-plugins build (see 1319). `fly-deploy.yml` now imports the published `fly.mjs` from the packed plugin (`:246`). | — | — |
| 561 isolated devops resolution | ALREADY-FIXED | Fresh `pnpm install --frozen-lockfile`, then `pnpm run test:agent-plugins:content`: **1391/1391**. Stale clone install, as 563 suspected. | — | recorded command |
| 564 clone migrated live DB | NOT-RUNNABLE | Owner's live tree and process. Manual: point a disposable clone's dev server at a scratch sites dir only. | — | — |
| 571 second-tab draft lost | NOT-RUNNABLE | Needs two live admin tabs and a real running chat. | — | — |
| 582 tests miss bundle env | ALREADY-FIXED | `package.json:39` `test` (and `test:ci` / `test:cov*`) preloads `development/test-support/composed-bundle-env.ts`, which sets `TOVU_BUNDLED_AGENT_PLUGINS_DIR` before discovery. | — | — |
| 590 cookie banner default | ALREADY-FIXED | `features/consent/config.ts:21` `enabled: false`. Pinned by `app.consent-capture.test.ts:44` ("a site that never chose shows visitors no cookie banner"). Manual: the owner's :3000 site in a fresh browser (a saved `enabled:true` still wins). | — | same |
| 591 attachment read via Bash | NOT-RUNNABLE | Guidance fixed: `assistant-system-overlay.ts:177` ("Never use Bash … to inspect attachments"). Manual: a real picture-to-theme CLI run. | — | — |
| 596 desktop memory by process | NOT-RUNNABLE | Packaged process attribution. | — | — |
| 601 chart install root | NOT-RUNNABLE | `charts-recharts-source.ts:128-131` resolves from `here`, `<installRoot>/tovu` and `<installRoot>/app.asar`. Manual: packaged app shows a chart, not the table fallback. | — | — |
| 602 Higgsfield wait | NOT-RUNNABLE | Real Higgsfield MCP. `jobs_wait` is now allow-listed (`higgsfield-media/__tests__/connection-contract.test.mjs:20-24`). GUIDANCE.md:210 says to poll `job_status` but names no wait tool (listed as a decision). | — | — |
| 603 duplicated cover image | NOT-RUNNABLE | Guidance fixed: `post/post-tool-schemas.ts:34` ("set featuredImage and do not also insert that image into bodyJson…"). Manual: a real "publish with that photo as the cover" run. | — | — |
| 607 TLS site-start readiness | ALREADY-FIXED | Jini `platform/src/net/local-http-probe.ts:24` trusts the configured mkcert leaf (`ca` + `allowPartialTrustChain`). Tovu passes it at `local-site-process.ts:320-321`. **Ran** platform suite 3353 pass / 6 skipped, incl. `local-http-probe.integration.test.ts` "accepts the configured non-CA leaf with a mkcert-style issuer chain". | — | same |
| 613 restart screen, no API | NOT-RUNNABLE | Same live-tree incident as 564. | — | — |
| 619 Chrome resize | NOT-RUNNABLE | Claude-in-Chrome tooling behaviour. | — | — |
| 622 running-site refusal | ALREADY-FIXED | `index.ts:164-165` returns the attached lease instead of refusing (`site-running.ts:29`). **Ran** `site-running.unit.test.ts` 6/6 ("a second app attaches without changing the owner token…", `:37`). | — | same |
| 626 touch tooltips | ALREADY-FIXED | Jini `TooltipLayer.tsx:218-270`: a touch tap on a trigger toggles the tip instead of hiding it. **Ran** ui suite: `TooltipLayer.test.tsx` 46/46. | — | same |
| 770 infra retirement | LOCKFILE-RUN | **Ran** `infra-retirement.integration.test.ts`: 3 pass / 3 fail. The 3 fail on purpose ("retain infra until its release gate and outbox ownership are resolved"; Tovu consumers still import/declare it). Clears with the shim release. | — | same |
| 775 desktop import verification | NOT-RUNNABLE | Packaged import, owner recovery, a real share link. | — | — |
| 778 desktop import residuals | NOT-RUNNABLE | Code fixed: quitting stops running import children (`apps/desktop/src/site-archive-import.ts:40-56`, `stopRunningImports` in `main/index.ts:163`). A tampered ZIP maps to the changed-file message (`use-import-website.hooks.ts:36`). Desktop tsc 0 at combine-7. Manual: Electron quit mid-import; packaged import. | — | `site-archive-import.test.ts`, `use-import-website.hooks.render.test.ts` |
| 786 import platform checks | NOT-RUNNABLE | Windows, packaged mode, tidy-after-an-hour timer. Google Fonts are still referenced (`content/themes/static/tovu-starter/css/theme.css`, `tovu-theme/css/theme.css`, two templated `theme.json`): see decisions. | — | — |
| 1254 Recharts pin gate | LOCKFILE-RUN | Process row: `recharts-package-pin.unit.test.ts` runs in `npm test` but nothing runs it on a Jini bump. Belongs with the pin bump (1319). | — | — |
| 1263 Apple notarization | NOT-RUNNABLE | Account holder must accept the agreement at developer.apple.com, then re-run the failed jobs. | — | — |
| 1265 unused site-chat package | LOCKFILE-RUN | `apps/site-chat/package.json:24` still declares `@mcp-ui/client` 7.1.1, and no `apps/site-chat/src` file imports it. Removing it changes the lockfile. | — | — |
| 1280 C0 package resolution | FIX-HERE → confirmed, LEFT (minor) | After a clean install: `plugin-package-gates.test.ts` / `@jini-ai/plugins/host/node` loads (plugins suite **1015/1015**), coupling-isolation owner lists pass (platform suite **3353 pass**). **Still red:** `scripts/__tests__/optional-peer-contract.test.ts`, 3 of 151 cases (see Red lines). These are stale pins and manifest classification text, not a user-facing defect. Listed, not fixed. | — | same |

## Red lines (everything seen red in this run)
1. **Jini `scripts/__tests__/optional-peer-contract.test.ts` — 3 failing** (base `06559affb`; `pnpm test:scripts` was not run by combine-7):
   - "keeps ui → lexical an explicitly classified opt-in peer": `packages/ui/package.json` has no `lexical` at all, and no ui source imports it. The pin is stale.
   - "keeps default-entry host framework daemon → express required": `packages/daemon/package.json` has `express` only in devDependencies, and no daemon source imports express (HTTP moved to http-kit). The pin is stale.
   - "all real default entries keep runtime libraries required and classify opt-in subpaths": 4 `jini.optionalPeers` texts do not name their opt-in subpaths: `@jini-ai/agentic` → `@jini-ai/protocol` (`./render-surface`); `@jini-ai/platform` → `parse5` (`./mail/email-template`, `./mail/email-template-operations`, `./web`); `@jini-ai/user-management` → `@jini-ai/ui-kit` and `react-dom` (`./admin/react`).
2. **Jini `infra-retirement.integration.test.ts` — 3 failing on purpose** (row 770).
3. **Tovu `typecheck:scripts` — the 3 base-red lines** (unchanged): `agent-plugin-activation.ts(100)` TS2554, `check-size-drift.ts(9)` TS5097, `dev-admin-build.ts(6)` TS2339.
4. Gate deltas vs the combine-7 final tree: see Gates.

## Gates (final Tovu tree)
GATES_PLACEHOLDER

## Tests run for the changed files
- `development/scripts/__tests__/app-runtime-dependencies.test.ts` (the only changed test; `tsconfig.json` has no other test importer): base **5 pass / 1 fail** (the new case lists `secret-scan-guard.ts` and `default-credential-exposure.ts`), after `f57b409e0` **6/6**. Both files still type-check through `tsconfig.tests.json` (`typecheck:tests` exit 0), and `check:secret-scan` / `check:default-credential` still run them from source with tsx.

## Decisions needed
1. **1280 / optional-peer-contract**: approve dropping the two stale pins (`ui → lexical`, `daemon → express`), or restore those dependencies. Then add the four missing "import <subpath> —" texts to `jini.optionalPeers` in agentic / platform / user-management. These are package.json edits, left out here because the lockfile run is editing the same manifests.
2. **602 Higgsfield waits**: should the overlay GUIDANCE name `jobs_wait` (with its live argument names) as the way to wait between `job_status` polls, instead of nothing? It needs one real agent run to confirm the argument name.
3. **786 Google Fonts**: the starter/default static themes and two templated themes load fonts from `fonts.googleapis.com`. Self-host them or keep them? This is a privacy/consent question for visitors, not a crash.
4. Lockfile run (not this job): 1319 / 1254 / 558 re-pin Recharts against the next published `@jini-ai/provider-plugins`. 1435 core `./errors/idioms` release + both Tovu lockfiles. 1265 drop `@mcp-ui/client` from site-chat. 770 shim release + outbox handoff.

## Next step
- Owner: decisions 1–3. Merge `fix/cloud-bugs-1120` (Tovu, 1 fix commit + report) into the next integration.
- Manual checks (NOT-RUNNABLE rows) in priority order: 525/553 arm64 packaged terminal; 531/545 + 1374 one green desktop release workflow; 601 packaged chart (not table); 103/104 Shared Keys in real chat + packaged; 778 quit mid-import in Electron; 590 owner site banner in a fresh browser; 1263 Apple agreement.
