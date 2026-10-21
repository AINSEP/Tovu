# Verify v3 report — 2026-10-21
Tovu HEAD 90ed13f60 (cloud/verify-v3-2026-10-21), Jini HEAD f2d86eaf3. Report-only: no source/test edits.

## Env + timings
- 4 cores, 16 GB, Node v24.22.0, no Postgres, no Playwright chromium, running as root. Start 09:30 UTC, end ~11:25 UTC (~1h55m).
- Setup: Jini `pnpm install --frozen-lockfile` ok; `pnpm --no-bail -r build` EXIT=1: only `packages/mcp` tsc failed (src/bin/__tests__/serve.test.ts + src/server/__tests__/tool-server.wire.test.ts: TS2307 cannot find ../../../../daemon/dist/index.js, .../http/delegated-tools.js, .../core/read-only-tools.js; TS7031 implicit any at tool-server.wire.test.ts:556). packages/mcp/dist/bin/serve.js is therefore not produced (jini-mcp bin link warns ENOENT). Other packages built.
- Tovu npm ci x4 + build:preload ok; sdk built before link; link:jini linked 58 packages.
- Lane J (Jini vitest, 1 core): 09:34–10:30 (ui 858 s, admin 275 s). Desktop ~10 min, admin vitest 1305 s. Website: 8 shards, 3 parallel, each 25–50 min, done ~11:06.

## Tests per suite (files / tests / pass / fail / skip)
- Jini vitest (35 pkgs w/ config): 2567 files / 41757 / 41743 / 0 / 14.
- Jini extra (artifacts, plugins have `vitest run` but no config; run with defaults, not requested): artifacts 43 f / 202 / 202 / 0 / 0; plugins 59 f / 618 / 617 / 1 / 0.
- Tovu admin vitest: 763 files / 12510 / 12508 / 0 / 2.
- Tovu desktop node:test: part1 1457 / 1447 / 0 / 10 skip; part2 530 / 528 / 2 / 0.
- Tovu website+plugins+packages+site-chat node:test: 2303 files / 27561 tests / 27403 pass / 105 fail + 19 cancelled / 34 skip (126 failing entries incl. file-level).

## Failures vs v2 (details: failures.md)
- Jini: 1 now (NEW, likely root-ENV) vs 58 in v2 -> FIXED 58.
- admin: 0 vs 10 -> FIXED 10. desktop: 2 ENV (chromium) vs 8 -> FIXED 6. website: 126 vs 225.
- NEW 2 / STILL 2 (known) / FIXED 174 (Jini 58 + admin 10 + desktop 6 + web 100) / ENV 125 (web 123 + desktop 2).
- Full non-ENV list:
  - [NEW] website agent-daemon-server.attachment-binding.unit.test.ts :: "Claude Local-CLI claiming and delegated discovery share the actual accepted-message binding" :: AssertionError: the discovered opaque ref must pass the video tool's actual owner-scoped reader (false !== true). Deterministic on solo re-run.
  - [NEW, likely root-ENV] jini plugins install.unit.test.ts :: "install lock and helpers lock creation rethrows faults other than EEXIST" :: promise resolved instead of rejecting.
  - [STILL, expected] website default-credential-exposure.test.ts (2): "REGRESSION: the shipped admin UI source does not contain the seeded default password"; "the credential checker CLI succeeds when invoked as the entry point". create-site-admin-password.unit.test.tsx now passes.
- ENV: 119 Postgres-only entries (*.postgres.test.ts incl. 19 cancelled vault-read-parity.postgres, pg-fixture.unit x4, postgres-baseline), 5 missing chromium (desktop 2, website render-form-layout 3). IPv6 test now skipped, not failing.

## TRUE vs RUNNER coverage (coverage-all-files; Jini incl. artifacts+plugins)
| repo | metric | TRUE | RUNNER |
| Jini | lines | 157079/173189 (90.70%) | 96.57% |
| Jini | branches | 72319/81643 (88.58%) | 97.79% |
| Jini | functions | 15922/19264 (82.65%) | 96.97% |
| Tovu | lines | 290084/298295 (97.25%) | 99.19% |
| Tovu | branches | 69058/75048 (92.02%) | 95.35% |
| Tovu | functions | 26072/28791 (90.56%) | 95.00% |
- Never-loaded: Jini 254/2716 files; Tovu 45/2654.
- Jini areas <90% lines: commerce 8.96% (lipay-plugin/gateway, catalog repo load but 0 hits), devops 15.25% (33 never loaded), sqlite 12.5%, chat 35.43% (138 never loaded), db 80.81%, charts-recharts 85.71%, agent-runtime 87.94%.
- Tovu areas: desktop 79.5% lines / 60.4% br / 50.0% fn (18 never loaded), site-chat 87.9%, admin 98.35%, website 99.25%, content 98.74%, sdk 99.0%.
- Tovu coverage note: web lcov records ../Jini/packages/*/dist files (15090 unmatched, ignored) and some malformed-LCOV records skipped (listed in coverage-all-files.md).

## Top 10 by uncovered lines
Jini: commerce/payments/lipay-plugin.ts 603; chat/.../useChatPane.hooks.ts 341 (NL); commerce/providers/lipay-gateway.ts 263; chat/embed-widget/vanilla/index.ts 243 (NL); commerce/catalog/repo.ts 233; chat/react/hooks/assistant-chats.ts 230 (NL); devops/checks/hardwiring.ts 220 (NL); chat/react/components/Markdown.tsx 216 (NL); agent-plugins/core/persistent-state.js 198 (NL); chat/.../QuestionForm.tsx 189 (NL).
Tovu: desktop vendor/kuinetic/kuinetic.js 3123 (NL); desktop/main.ts 467 (NL); website agent-daemon-server.ts 444 (NL); desktop renderer/App.hooks.ts 301; desktop scripts/verify-find-in-page.ts 227 (NL); verify-site-power.ts 210 (NL); smoke-packaged-chat.ts 177 (NL); website/src/index.ts 150 (NL); desktop scripts/stage-payload.ts 141 (NL); desktop renderer/App.tsx 128 (NL).
(NL = never loaded.) Per-area top 20: top20-jini.md, top20-tovu.md; full tables: jini/ and tovu/coverage-all-files.{md,json}.

## NOT RUN / caveats
- Postgres suites, Playwright browser tests: not runnable (no server/chromium) -> counted ENV; their code paths count as uncovered in TRUE coverage.
- Jini packages/mcp failed to build (above); its tests ran only if vitest resolves sources.
- artifacts/plugins had no vitest.config.ts (spec said configs only); run additionally with defaults.
- Coverage runner for node:test counted built dist via links; vitest json coverage per package, no shared run.
