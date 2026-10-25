# L15 — Tovu desktop (our non-UI TS) + content/agent-plugins: StrykerJS measure-only report
Run 2026-10-25 20:06–23:35 UTC (≈3 h 30 m wall of the 4 h cap). StrykerJS 9.6.1 + `@stryker-mutator/tap-runner`, Node 24.22, 4 cores. Report only — no source or test edits. Raw JSON (gz), survivor and no-coverage lists, scripts and configs in `data/`.

## 1. Headline
| Target | Files measured | Mutants scored | Killed(+timeout) | Survived | No-cov | Score |
|---|---|---|---|---|---|---|
| `apps/desktop/src` (our non-UI TS) | 76 | 5,646 | 5,015 | 603 | 28 | **88.82 %** |
| `content/agent-plugins` — mapped tests only | 69 | 9,883 | 7,448 | 1,361 | 1,074 | 75.36 % (**understated**, see §7) |
| `content/agent-plugins` — effective (broad-test re-run where mapping was clearly wrong) | 69 | 10,093 | 8,273 | 1,383 | 437 | **81.97 %** |

Tokens ≈ 0.25 M of ~1 M. Nothing was skipped for time except as listed in §6. StringLiteral mutants excluded, type checks off.

**Method (tap-runner is whole-test-file granularity, coverage analysis off):** per source file, the test set = test files that reference the file's basename. Desktop: `node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test-skip-pattern="through Tovu's actual CLI|desktop source CLI creation"` run from `apps/desktop`. Plugins: `node --import tsx --experimental-test-module-mocks` with `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json` from repo root; files >260 lines sharded by 200-line `mutate` ranges. Where a plugin file scored very low on a mapped set (clear sign the mapping missed the real tests), it was re-run with the plugin's full/sheets/cloudflare/github test set ("broad" column). Baseline of desktop tests before Stryker: 1,766 tests, 1,753 pass; the 3 failures are the env cases below.

**Environment notes (ENV, not fixed):** apps/desktop needs its own `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` (the shared root install lacks `@electron/asar`, `electron-updater`, etc.) plus `npm run build:preload` (reports 2 `electron` type errors but emits). Jini clone was **denied by the auto-mode classifier** in this session, so `@jini-ai/*` was not built: tests that spawn the real Tovu CLI (`site-dir-store.test.ts` "initSiteDir creates a complete blank site…", `site-create-admin-password.test.ts` "desktop source CLI creation…") fail on a missing `SURFACE_QUESTION_META_KEY` export — skipped by name via `--test-skip-pattern`; `nested-sites-migration.test.ts` excluded (known load crash). Stryker's sandbox sits one level deeper (`apps/desktop/.stryker-tmp/sandbox-X`), so tests resolving `../../website` needed symlinks in `.stryker-tmp` (removed after the run; not committed).

## 2. Suspected source bugs
**None found.** No survivor reads as wrong behaviour; all are weak/missing assertions or equivalent mutants.

## 3. Per-file tables
Desktop (worst first; files 100 % omitted — full list in `data/desktop-table.md`):

| file | mutants | killed+timeout | survived | no-cov | score |
|---|---|---|---|---|---|
| src/site-discovery-scan.ts | 13 | 5 | 0 | 8 | 38.5% |
| src/keyed-serializer.ts | 8 | 4 | 4 | 0 | 50% |
| src/site-scan-policy.ts | 61 | 44 | 17 | 0 | 72.1% |
| src/desktop-i18n.ts | 90 | 66 | 24 | 0 | 73.3% |
| src/owner-store-ipc.ts | 191 | 149 | 32 | 10 | 78% |
| src/remove-site-tree.ts | 20 | 16 | 0 | 4 | 80% |
| src/auto-update-controller.ts | 15 | 12 | 3 | 0 | 80% |
| src/sites-mcp-tools.ts | 99 | 81 | 18 | 0 | 81.8% |
| src/site-preview-store.ts | 33 | 27 | 6 | 0 | 81.8% |
| src/external-site-stop.ts | 115 | 96 | 19 | 0 | 83.5% |
| src/site-folders.ts | 152 | 127 | 25 | 0 | 83.6% |
| src/desktop-agent.ts | 250 | 210 | 40 | 0 | 84% |
| src/site-theme-preview.ts | 103 | 87 | 16 | 0 | 84.5% |
| src/tracked-sites.ts | 295 | 250 | 44 | 1 | 84.7% |
| src/site-discovery.ts | 33 | 28 | 5 | 0 | 84.8% |
| src/agent-plugin-tokens.ts | 138 | 118 | 20 | 0 | 85.5% |
| src/tovu-server.ts | 249 | 215 | 34 | 0 | 86.3% |
| src/site-name-policy.ts | 22 | 19 | 3 | 0 | 86.4% |
| src/spellcheck-menu.ts | 31 | 27 | 4 | 0 | 87.1% |
| src/shared-sites.ts | 167 | 146 | 21 | 0 | 87.4% |
| src/desktop-chat-main.ts | 24 | 21 | 3 | 0 | 87.5% |
| src/desktop-resources.ts | 159 | 140 | 16 | 3 | 88.1% |
| src/update-manifest-merge.ts | 68 | 60 | 8 | 0 | 88.2% |
| src/window-bounds-store.ts | 17 | 15 | 2 | 0 | 88.2% |
| src/sites-mcp-registration.ts | 175 | 155 | 20 | 0 | 88.6% |
| src/admin-dev-proxy.ts | 44 | 39 | 5 | 0 | 88.6% |
| src/site-relocation.ts | 168 | 149 | 19 | 0 | 88.7% |
| src/site-theme-preview-ipc.ts | 72 | 64 | 8 | 0 | 88.9% |
| src/desktop-agent-tools.ts | 95 | 85 | 10 | 0 | 89.5% |
| src/site-power-verify.ts | 106 | 95 | 11 | 0 | 89.6% |
| src/shell-staleness.ts | 29 | 26 | 3 | 0 | 89.7% |
| src/find-in-page-ipc.ts | 30 | 27 | 3 | 0 | 90% |
| src/project-ipc.ts | 678 | 612 | 66 | 0 | 90.3% |
| src/site-supervisor.ts | 21 | 19 | 2 | 0 | 90.5% |
| src/project-delete-guard.ts | 64 | 58 | 6 | 0 | 90.6% |
| src/js-backslide-guard.ts | 11 | 10 | 1 | 0 | 90.9% |
| src/site-config.ts | 78 | 71 | 7 | 0 | 91% |
| src/site-process-registry.ts | 242 | 221 | 21 | 0 | 91.3% |
| src/move-to-applications.ts | 126 | 115 | 11 | 0 | 91.3% |
| src/site-name.ts | 12 | 11 | 1 | 0 | 91.7% |
| src/update-check-now.ts | 74 | 68 | 5 | 1 | 91.9% |
| src/sites-mcp-server.ts | 37 | 34 | 3 | 0 | 91.9% |
| src/desktop-user-data-dir.ts | 26 | 24 | 2 | 0 | 92.3% |

Plugins (mapped vs broad): see `data/plugins-table.md` (69 rows). Key credential/deploy rows, effective score: github write-files 95.5 %, backup-push 96.7 %, deployments/github 95.3 %, source-control/github 92 %, **commit-site 53.6 % (broad, 459 mutants, 81 no-cov)**; vercel 83.2 %; netlify 86.8 %; fly deploy-ops 95.7 %; cloudflare target 86.3 %, api 80.5 %, forms 85.7 %, domains 88 %, dns 83.8 %, zones 75.8 %, domain-status 69.4 %, forms-receiver worker 91.9 %; resend adapter 90.5 %, domains 91.7 %, feedback 85.4 %; **s3-compatible targets 76.3 % (123 surv)**, object-stores 95.1 %; github-pages 87.9 %; railway deploy-ops 84.1 %; render deploy-ops 78.6 %; google-workspace auth 93 %, http 88.7 %, request-policy 83.7 %, drive-files 88.9 %, sheets-client 89.8 %, picker-flow 92.7 %; **meilisearch provider 15–20 % (real gap)**.

## 4. Triaged survivors (a = test gap, b = equivalent; samples, rest in `data/*survivors*.txt`)
Desktop:
- **site-scan-policy.ts (72 %, 17 surv)** (a): the home/Tovu-root guard `normalized === ${home}/Tovu` (L15) never flips a test; regex anchors on the "dangerous scan root" patterns (L29: `~/x`, `/Users|/home`, `C:`) survive anchor removal — no test passes a path that distinguishes them (e.g. `/home/u/deep/dir` must be allowed, `/home` rejected); trailing-slash trims (L19, L24) (b/a).
- **keyed-serializer.ts (50 %)** (a): `clearSlot` (`chains.get(key)===next → chains.delete`) — nothing asserts the map is cleaned (leak) or that a later-queued tail is not deleted.
- **owner-store-ipc.ts (78 %, 32 surv, 10 no-cov)** (a, security): the shared-key request validator (L29–34) — `!input || typeof !== object`, per-action allowed-field table, 64 KiB cap off-by-one — survives; `sync/status/list/delete` port dispatch bodies (L98, L135–138) never executed (no-cov).
- **agent-plugin-tokens.ts (85.5 %)** (a, credentials): `PLUGIN_ID_PATTERN` $-anchor, `MAX_TOKENS`/`MAX_TOKEN_LENGTH` boundary (`<=` vs `<`), `raw===undefined/null → {}`, and the CLI-output regex `agent-plugin-tokens: (saved|failed) …` anchors.
- **project-delete-guard.ts (90.6 %, 6 surv)** (a, data-loss guard): `relative === "" → true` (deleting the root itself), `row.origin !== SITE_ORIGIN.created → false` (never delete non-created sites), `meta?.siteId` non-string/empty guards.
- webview-guest-policy.ts (1 surv): `preloadPath` empty-string check is untested. window-navigation-policy.ts (1): `isSupervisedGuestUrl` delegate never asserted.
- desktop-i18n (73 %), site-folders (83.6 %), tracked-sites (84.7 %, 44 surv), desktop-agent (84 %, 40 surv), tovu-server (86 %, 34 surv), external-site-stop (83.5 %), sites-mcp-tools (82 %): not individually triaged (token budget); survivors in `data/desktop-survivors.txt`.
Plugins:
- **github commit-site.mjs** (a): `GIT_SHA_PATTERN` anchors/length (40|64) all survive (L36); `liveResult.kind==="unverifiable" → "diverged"` and `liveResult.sha === recordedSha ? "delete":"diverged"` (L401–402) — the delete-vs-diverged decision on remote files is untested; non-JSON GitHub response and timeout branches (L89–101) uncovered.
- **s3-compatible targets** (a): upload/manifest `resp.status >= 500` boundary (L265, L422), manifest-read failure path (L407–422), diverged/stale key handling (L601–663), the AWS-only public-read bucket policy (L859–863), endpoint normalisation `.replace(/\/+$/)`.
- **cloudflare zones.mjs** (a): domain validator `name.length>253 || !includes('.') || label regex` — every operand survives (no test for a 254-char, dotless, or bad-label domain).
- **meilisearch provider** (a): `mapFailure` (L206–210, 5xx → `provider_unavailable`), `encodeSearchKey`, `rejected/unknown` result builders — about half the file is not executed by its 2–3 tests.
- **google-workspace request-policy** (a): the `REASON` table entries (`retryable`, `nextAction` per code) are never asserted.

## 5. No-coverage ranges
Desktop (28): `site-discovery-scan.ts` L12–30 (the whole `discoverForInput` + default `remove`; 8), `owner-store-ipc.ts` L98,135–138 (10), `remove-site-tree.ts` (4), `desktop-resources.ts` (3), 1 each in `site-dir-store.ts`, `tracked-sites.ts`, `update-check-now.ts` (`data/desktop-nocov.txt`).
Plugins (437 effective): **meilisearch provider** 171 in L1–330 even with all of the plugin's tests (+ more in the unre-run lines 331–651 under the mapped set); **github commit-site** 81 (broad); several google-workspace `sheets-admin` files only look uncovered under the mapped set (not real — see §7). Full: `data/plugins-pnocov-broad.txt`, `-mapped.txt`.

## 6. NOT RUN
Desktop (not mutated): `main.ts` (needs the Electron binary/app; ENV), `preload/preload.mts`, `speech/*`, `smoke-*.ts`, `stage-payload-lib.ts`, `stage-payload-run.ts`, `quality-gates.ts`, `complexity-debt.ts`, `coverage-floors.ts`, `packaged-gate-isolation.ts`, `verify-package-cli.ts`, `site-discovery-worker.ts`, `nested-sites-migration.ts` (test crashes at load), `contracts/*` (type/contract files, not mutated), renderer/.tsx. **Dry-run failed in the sandbox** (test file passes normally in-repo; likely sandbox layout/repo-root paths): `owner-store-cli.ts` ("S3 put sends the complete private request only on stdin"), `jini-mcp-peers.ts` ("both packaged bridge consumers declare the installed MCP runtime peers"). 
Plugins (not mutated): `github/deploy-ops/github-actions.mjs` (dry-run failure of "upgrade: a site holding the previous github digest…" in installed-deploy-verb.test.mjs in the sandbox; drop-and-retry logic was added afterwards but this file was not re-queued), `cloudflare/lib/{pages-upload,domain-inventory,workers-upload}.mjs`, `resend/lib/errors.mjs`, `google-workspace/ui/{connection-panel,destination-panel,picker}.handler.mjs`, `form-destinations/delivery-result.mjs`, `lib/surface-actions.mjs`, and 14 `tools/sheets/*.mjs` (values-get/-append/-update/-clear/-batch-*, copy, copy-tab, create, find, find-replace, get-by-data-filter, values-by-data-filter) — **"no direct test"** by basename mapping (they are probably exercised only through `sheets.contract.test.mjs`; not measured). `github/source-control/commit-site.mjs` lines 201–400 in the mapped run (covered by the broad re-run instead). Plugins with **no .mjs of their own** (nothing to mutate): composio, google-login, higgsfield-media, how-tovu-works, jev, site-compliance, site-import, supabase, tovu-theme, ui-ux-design, wordpress (their `.test.mjs` files test manifests/website code). Meilisearch lines 331–651 were not re-run with the broad set.

## 7. What these numbers do NOT catch
- Type checks disabled; StringLiteral mutants excluded (error messages, setting keys, SQL/URL fragments, tool ids).
- tap-runner: one `node` process per test *file* per mutant, coverage off — "killed" = any mapped test file failed (indirect/accidental kills count). **Test mapping by basename is heuristic**: plugin files scored 8–42 % under it (google-workspace sheets-*, drive-files, cloudflare target/zones/dns) jumped to 76–100 % with a broader test set, so mapped-only plugin numbers (75.4 %) understate; the 82 % effective figure still mixes the two sets and files not re-run may also be understated. No-coverage under the mapped set means "the mapped files didn't load it", not "no test anywhere".
- Desktop mapped sets exclude renderer tests and the Electron main process; the 2 real-CLI tests were skipped (no Jini build), so `site-dir-store.ts` "init via real CLI" paths are untested here.
- Equivalent mutants (regex anchors on already-redundant guards, trailing-slash trims) are not removed. Tests with real sleeps/retries (vercel 15 min, s3-compatible) produce timeouts counted as killed.
- Plugin runs used concurrency 4 and 20 s per-test timeout; no flake re-runs.

## 8. Top 10 tests to write first (by risk)
1. **github commit-site**: SHA pattern (39/41/63-char, non-hex), `unverifiable` live result → "diverged", `recorded===live → delete`, non-JSON / timeout responses.
2. **s3-compatible targets**: 4xx vs 5xx boundary on upload and manifest read, manifest-read failure, stale/diverged key handling, AWS-only public-read policy.
3. **desktop owner-store-ipc**: reject non-object / array / extra-field / >64 KiB shared-key requests per action; exercise status/list/delete/sync dispatch.
4. **desktop agent-plugin-tokens**: plugin-id pattern anchors, token count/length boundaries, null/undefined input, malformed CLI output.
5. **desktop project-delete-guard**: deleting the root itself, non-"created" origin, non-string/empty siteId.
6. **meilisearch provider**: failure mapping (4xx/5xx/timeouts → rejected/unknown), key encoding, result builders — half the file is unexecuted.
7. **desktop site-scan-policy**: anchored dangerous-root patterns (`/home`, `/Users/x`, `C:`, UNC) vs deep valid paths; `$HOME/Tovu` equal-home case.
8. **cloudflare zones/dns/domain-status**: domain validator boundaries (254 chars, no dot, bad label) and per-status mapping.
9. **google-workspace request-policy**: assert every `REASON` entry's `retryable`/`nextAction`; add direct tests for the 14 `tools/sheets/*.mjs` and the three UI `.handler.mjs` files.
10. **desktop keyed-serializer / site-discovery-scan / remove-site-tree**: cleanup of per-key chains, `discoverForInput` end-to-end, default `remove`. Plus: a Jini build in the desktop CI lane so the real-CLI tests run, and make the sandbox-sensitive tests (owner-store-cli, jini-mcp-peers, installed-deploy-verb) path-independent.

L15 DONE 2026-10-25T23:27Z · wall ≈3 h 30 m of 4 h · tokens ≈ 0.25 M of ~1 M
