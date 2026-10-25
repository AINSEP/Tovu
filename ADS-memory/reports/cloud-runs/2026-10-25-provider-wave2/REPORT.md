# Provider wave 2 — run report (in progress)

## Run log (append-only)

## 2026-10-25T22:23Z — STARTED
Tovu `wave2` @ 083acb99 (origin/cloud/prov-wave2-tovu), Jini `wave2` @ 2e4591b1 (origin/cloud/prov-wave2-base); both checkouts OK.
Caps: stop new work 02:51Z, hard end 03:21Z. Next: Node 24 + Jini install/build + Tovu install/link, then step 0 fixes.

## 2026-10-25T23:17Z — PROGRESS
- Setup: Node 24.22.0; Jini `pnpm install --frozen-lockfile` OK; first `pnpm -r build` failed only on my own step-0 edits (infra test typing, daemon `startPromise` optional) — fixed, dependents rebuilt clean. Tovu `npm ci`, sdk build, `link:jini` (59 links) OK.
- ENV: vitest 2 in Jini rejects `--maxWorkers=2` alone ("minThreads and maxThreads must not conflict") → use `--minWorkers=1 --maxWorkers=2`.
- Step 0 a/b/c/d DONE — Jini b1fcb8f1 (each new test red without its fix, green with it).
- Step 1 (OTel + Sentry plugins) DONE — Jini 63bacc58. Step 2 (PostHog plugin) DONE — Jini 212cf50f.
- ASSUMPTION: Open Marketing's plugin identity namespace is not visible from either repo; manifests declare `tovu` and `open-marketing` under one publisher id `jini/<plugin>`. The loader does not require the namespace key to load (the packed test loads with `com.example.host`).
- ASSUMPTION: core provider ids forbid `-`, so the product-analytics contract id is `product_analytics`.

## 2026-10-25T22:55Z — PROGRESS
- CORRECTION: the 23:17Z stamp on the previous entry was wrong; `date -u` read 22:34 at that push.
- Step 0e (Tovu suites, linked Jini): 868 tests, 844 pass, 21 fail, 3 skipped (`node --test`, concurrency 1). A first run was invalid (I rebuilt diagnostics' dist mid-run → ERR_MODULE_NOT_FOUND); rerun on a stable tree. Failures, none fixed (none in this brief's code; LISTED):
  - ENV (no Postgres server): create-site-route-deps.postgres, move-site-storage.postgres, open-site-store.postgres (9 cases).
  - Known pre-existing: mcp-ui-tool-calls-route.ask-choice "real round trip".
  - Stale expectations vs owner's "consent banner on by default" (c5e98fea): 6 pages route cases (`GET /` 500 fallback, member-cookie denial, members-only home, see-more privacy) now receive the injected `#jini-consent` section/private cache headers. Product behavior is the owner's; tests predate it.
  - plugin-host.integration "plugin list/toggle/uninstall": Jini now returns `exports: []` per plugin; test expects no field.
  - analytics-providers.unit "forwards to the selected vendor…": forwarded list empty (expected `plausible`).
  - commerce-data-retention "commerce off": `table members has no column named password_hash` (fixture vs member schema drift).
  - deps-observability-wiring "no OTLP endpoint": content kernel decorated twice — superseded by step 6 rewiring (I rewrite this composition).
- Jini step 4 (Stripe move only) DONE — 31819c82. Guard: 23 → 3 violations; the 3 left are pre-existing and untouched (daemon tool-recovery/observability.ts "Tovu" comment; mcp stdio-hosting HW2 ×2). Jini `scripts` suite: 3 failures identical with my changes stashed (pre-existing).
