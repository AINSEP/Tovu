# Provider wave 2 — FIX run report (BRIEF-FIX.md)

## Run log (append-only)

## 2026-10-26T00:22Z — STARTED
Tovu `w2fix` @ c1e6758f (origin/cloud/prov-wave2-tovu), Jini `w2fix` @ 800d9caf; both checkouts OK.
Caps: stop new work 03:02Z, hard end 03:22Z. Next: Node 24 + Jini install/build + Tovu install/link, then step 1 (Codex HIGHs).

## 2026-10-26T00:45Z — PROGRESS
- Setup: Node 24.22.0; Jini `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build` green; Tovu `npm ci`, `link:jini` (59 links). `@tovu/sdk` build fails against the PUBLISHED `@jini-ai/plugins` (no provider exports) and passes once linked — expected (nothing published).
- Step 1 DONE: Tovu ac543391 (TDZ; integration test red→green), ad5c96ee (retired leases inert); Jini 839dba92 (OTel injected config only).
- Step 2 DONE: Tovu 7ddd0f38 (bounded provider load); Jini 146be48f (Langfuse borrowed client, TS-parser boundary scan), 8395a5f6 + 2ccf809a (fan-out scope containment).
- Each fix's test shown red first (TDZ: PLUGIN_SETUP_FAILED→noop; lease: calls after detach reached the port; load: hung 100 s; OTel: hostile OTEL_* → nothing exported; Langfuse: borrowed client shut down; fan-out: "scope down" reached caller).
