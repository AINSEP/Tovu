# fix-providers-a REPORT (2026-10-21, 21:31–22:10 UTC)
Branches `cloud/fix-{provfix,storage,mediagen,analytics}-2026-10-21` in Tovu + Jini, all pushed, no rebase/force. Shared contract fix (core registry + agent-plugins contribution, Jini 54fdc917/e9fdc5e9/1d2b5200/244c1f11) cherry-picked onto all 4 Jini branches (storage 8332cda9..b6b02a44, mediagen 778babe1..9eaec4f9, analytics f8de99dd..b894c011). No LOW findings in these reviews. All HIGH/MEDIUM reproduced except where noted.

## 22-provfix
| finding | outcome |
|---|---|
| H core registry.ts:145 throwing validator escapes contribute() | fixed Jini 54fdc917 (invalid_provider refusal; core register still throws) |
| H provider-contribution.ts:57 failures propagate; test encoded wrong contract | fixed Jini e9fdc5e9+1d2b5200 (default onReadError/importErrorReason, guarded parse + per-descriptor) |
| H webhook worker stop() strands `delivering` claims | fixed Jini ef77fd83, Tovu 77b5e609 (abort signal, releaseClaim, lease in next_attempt_at, fencing; no schema change) |
| M no total request deadline | fixed same commits (totalDeadlineMs 30s + shutdown signal) |
| M agent-plugins peer core ^0.4.3 lacks subpath | fixed e9fdc5e9 + 244c1f11 (peer ^0.4.9); devDep left ^0.4.2 (workspace-linked; changing it changes lockfile) |
| M Jini-first: sender resolver + worker lifecycle in Tovu | fixed Jini ef77fd83/611c87d5/ec8b6fec, Tovu 77b5e609/27cfe1af |
| M registry public methods/factories lack optional object | fixed 54fdc917 |
| M email-dns mail-adapter hyphen ids | listed: not on this job's branches (file here is 137 lines; cited lines absent) |

## 05-storage
| finding | outcome |
|---|---|
| H lockfile pins old Jini | listed (release order) |
| H local-fs.ts:28 symlink escape | fixed Jini c5ed8307 (realpath containment, O_NOFOLLOW, lstat) |
| H mediaBucket == public bucket | fixed Tovu a75b7edb |
| H setting-selected remote media → incomplete backups | fixed Tovu 0cfc60d6 |
| M s3 header override case-sensitive | fixed Tovu 9735c608 (native Headers) |
| rule parseObjectStoresFile(raw) | fixed Tovu 2d74a37e |

## 06-mediagen
| finding | outcome |
|---|---|
| H cross-surface model-id misroute | fixed Jini ded15940, a0bb2596 (refused across all surfaces) |
| H admin save deletes unregistered plugin keys | fixed Tovu 7a1447ab |
| H `models:[undefined]` throws; Tovu contributes outside recovery | fixed Jini ded15940, Tovu 48a25737, 23eaa889 (test follows shared refusal) |
| M no per-plugin read/import recovery; outer catch drops batch | fixed Tovu 48a25737 |
| M two-object signatures | fixed Tovu 48a25737 |

## 07-analytics
| finding | outcome |
|---|---|
| H lockfile pins analytics 0.2.1 | listed (release order) |
| H path PII forwarded | fixed Jini b84e9a71 (email-shaped segments, literal + %-encoded → `:redacted`) |
| H thrown text logged | fixed Jini b84e9a71 (fixed codes), Tovu 246eeaf2 (fixed text) |
| M shared mutable projection | fixed Jini b84e9a71 (per-vendor deep copy) |
| M no recovery policies | fixed Tovu d7dce500 |
| M TTL cache in Tovu | fixed Jini b2b98b78 (cacheAnalyticsProviderLoad), Tovu 246eeaf2 |
| M two-object (parser, factories) | fixed Tovu d7dce500 + core 54fdc917 |
| M F6.1 local loads plugins, untested | fixed Tovu 246eeaf2 (short-circuit + assert load==0) |

## Tests (touched packages; all green; red seen first for behaviour bugs)
Jini: core 1241/1241; agent-plugins 1173 pass (2 skip); analytics 141; platform 2364 (6 skip); integrations 1641 (mediagen) / 1626 (provfix). Tovu (node:test, concurrency 1): object-storage+s3 71, storage related 204; media/media-generation 744 (+23 after port); analytics 14; webhooks 433; sender 62.
Tovu `tsc -p tsconfig.json`: 10 pre-existing errors on each branch, none in touched files. Jini `pnpm guard` self-test fails (agent-runtime fixture), pre-existing.

## Coverage (line/branch/func)
100/100/100: core provider-registry.ts, agent-plugins provider-contribution.ts, analytics forwarding.ts + ingest.ts, platform local-fs.ts, Tovu media-store.ts, object-storage registry.ts, s3-compatible.mjs, analytics forwarding.ts, analytics-provider-registry.ts, media provider-credential-store.ts, media-generation media-provider-registry.ts + agent-tools.ts, Jini media-provider-registry.ts, webhook files. Exceptions: Tovu sources.ts branch 99.51 (untouched walkOwnedDir:253); Tovu webhooks repo.memory.ts 99.64/96.2 (untouched comment lines, source-map artifact); deps.ts not measured whole-file.

## Complexity (touched functions, cyclomatic/cognitive ≤10)
`complexity:strict` 0 errors on all touched files. Highest: attemptOneDelivery 8/8, parseObjectStoresFile 9/8 (logic unchanged), resolveProcessDueDeliveriesOptions 8, processDueDeliveries 7/4; registry/contribution/forwarding functions ≤5.

## LOCAL-RUN NEEDED (Postgres)
routes/media/__tests__/integration/providers.integration.test.ts; platform/db/repos/__tests__/media-provider-credential-repo.test.ts; media parity harness; webhook repo Postgres contract (PGlite + SQLite ran).

## LOCAL VISUAL CHECK
None — no UI changes.

## Owner questions
1. local-fs now refuses symlinked subfolders inside uploads (symlinked root still OK). Intended?
2. Media credential save now keeps rows of ids that are neither built-in nor registered plugin (e.g. `xai-grok-imagine`). OK, or explicit cleanup?
3. Webhook attempt interrupted by shutdown counts as an attempt (normal backoff). Resend immediately instead? Lease is stored in `next_attempt_at` while `delivering` — OK?
4. Analytics path redaction covers email shapes only (same heuristic as event props). Extend (phones, long ids)?
5. Release order: publish Jini core 0.4.9 (provider-registry) first; agent-plugins peer now ^0.4.9; Tovu imports unreleased integrations/webhooks worker, platform/mail sender-identity, analytics cacheAnalyticsProviderLoad.

## Noticed, not done
local-fs intermediate-directory TOCTOU window remains; Tovu parseDescriptor (internal) positional args; vitest `--maxWorkers=2` needs `--minWorkers=1` on Jini's vitest 2 config.
