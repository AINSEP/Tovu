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
