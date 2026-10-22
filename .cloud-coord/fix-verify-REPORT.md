# fix-verify REPORT (lane A) — 2026-10-22, 05:34–05:55 UTC
Branch `cloud/fix-verify-2026-10-22` (Tovu, from origin/cloud/deploy-2026-10-22 1dc9a8fa). No Jini change needed (Jini has no
`cloud/deploy-2026-10-22` on origin; built/linked Jini main 8322f717; local Jini branch not pushed — nothing to push).
Setup: npm ci OK (root/admin/desktop, no --no-save fallback needed), sdk build OK, link:jini OK, Jini `pnpm -r build` rc 0.

| finding | result | root cause |
|---|---|---|
| eslint single-fetch-query-provider (10) | stale test updated 287b5ab6 | fixtures used `/Users/la/...` paths; ESLint 10 flat config ignores files outside Linter cwd → `new Linter({cwd:'/repo'})` |
| request-cost-cacheability (4) | stale test updated 277d0f97 | pages with `data-comments-surface` are `private, no-store` by owner decision (6664d6df); Starter template places it |
| create-app-comments-rate-limit (3) | stale test updated 56c1b41d | since 65882a7e submit goes through the active comments provider; fake now wraps that provider |
| vault-write-parity media (3) | stale test updated e7caa589 | 7bb4f6c3/7a1447ab stopped deleting non-built-in media rows on whole-map save; all 3 backends agree; recorded as reviewed PARITY_DELTAS entry |
| navigation publish-content (2) | stale test updated d9db78a9 | InMemoryOutbox now dedupes `event.id` (matches SQL outbox); tests used constant ids |
| descriptor-fields 'mediaBucket' (1) | stale test updated 849d6e53 | 4a675744 added mediaBucket/mediaKeyPrefix to s3-compatible |
| publish-agent-tools propose-credential (1) | stale test updated 849d6e53 | same: expected message lists the s3 field set |
| media-generation providers-tools (1) | FLAKE (passes alone 36/36) | load-induced; no change |
| write-region-discovery (1) | stale test updated 96a74c9b | batching default-on → required fields in per-item contract (same as 6664d6df sibling); + refusal test |
| no-mail-vendor-in-core (1) | fixed f56b2720 | core mail-status.ts search metadata named Resend → generic; baseline json updated |
| composition-boot-order (1) | fixed 18c3f5f8 | 70ae06c0 awaited loadMediaProviderRegistry after fire-and-forget boot promises; moved unchanged into prelude |
| check-idle-motion (1) | allowlist entries 9918f360 | 2 admin spinners shown only during uploads/transfers, already reduced-motion gated; no CSS change |
| sites-move-home partial copy (1) | stale test updated 555b65f1 | Jini 03c49210 copies per top-level entry; test fake wrote at the wrong path |
| desktop renderer/contracts (2) websites-width | not run → LOCAL-RUN NEEDED | Chromium-based (Playwright headless shell missing in container) |
| boot "NO USABLE SITE KEY ... no key file at ." | fixed 2826d01a | notice ran BEFORE ensureSiteKeyForBoot and without siteDir → per-site key never a candidate; now after ensure, with siteDir (index.ts + serve.ts; AST pin test + characterization order updated) |
| agent-daemon "jini bridge preflight FAILED jini-mcp: HTTP 401" | fixed 8f52399c | af84bc598 added startupToolIds → jini-mcp fetches schemas (authenticated) before initialize; token-less preflight got 401. Preflight entry now omits startupToolIds (new bridge-preflight-entry.ts + unit test); real runs keep it |

## Tests run (all node:test --test-concurrency=1, each file alone, on merged head e8869bc6)
All 13 source-list files + site-key-boot-notice (27), index-boot.characterization (7), serve-command-wiring (7),
bridge-preflight-entry (1), agent-daemon-server.typed-tools.integration (6): **0 failures**. Fixers also ran sibling dirs
(deployments, deploy-targets, parity, server/__tests__/unit, platform/mail unit, navigation non-pg, pages): pass.
`tsc -p tsconfig.json --noEmit`: clean. Live smoke (fresh `tovu init` in isolated HOME, `tovu serve --port 3111`):
healthz 200, `[agent-daemon] jini bridge preflight ok (279ms)`, no site-key warning; SIGTERM left no processes.
Known pre-existing, not touched: cross-site-read-catalog (KNOWN), dead-path-sweep / openapi-contract-fixtures / repair-site (ENV:
coverage dir / HOME isolation). `tsc -p tsconfig.tests.json` reports 62 errors, none in touched files (base not compared).

## LOCAL-RUN NEEDED
- desktop `src/renderer/websites-width.test.ts` (2, Chromium); all *.postgres.* suites (navigation publish-content.postgres
  etc.); Chromium render-form-layout.

## Owner questions
1. Starter post template pages carry live comments → always `private, no-store` (no CDN cache). OK for sites that never get comments?
2. OK that the media provider registry load now sits in the boot prelude (vs allowing a second post-boot await)?
3. Confirm: whole-map media save keeps non-built-in (`media-test`/plugin vendor) rows — intended?
4. Plugins contributing search keywords for core tools (so "use Resend" still finds mail_set_provider) — wanted?
5. Boot preflight now doesn't exercise the startup-tool fetch path; want a token-scoped preflight run instead?
