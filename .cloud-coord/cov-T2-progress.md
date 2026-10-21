# cov-T2 progress (tovu lots 019..037)
Start 2026-10-21 15:06 UTC. Base Tovu e0c935bb5, Jini b3c4144b (cloud/integration-2026-10-21). Hard stop for new work 18:46 UTC.
Env: node24 OK; Postgres 5432 role la OK; Playwright download 403 → pre-installed /opt/pw-browsers/chromium.
OWNER UPDATE (15:13): no Postgres or browser test runs in cloud; such tests are written but listed as LOCAL-RUN NEEDED.

| session | lots | branch | status |
|---|---|---|---|
| S1 | 019 | cloud/cov-T2-019 | MERGED 58f16d0b; merged rerun 566/566 pass, 12/12 loadable files 100/100/100; main.tsx unloadable composition root (logic in mount-renderer.ts); websites-width.test.ts LOCAL-RUN |
| S4 | 024,025 | cloud/cov-T2-024 | MERGED 889ab48f; rerun 459/459 + targeted reruns; 25 files 100; open: agent-permission-mode (B90, removal DENIED by classifier as security-weaken → owner decision), live-model-cache F, plugin/install B, tool-approval-policy B, render-ui-tool, mcp-ui-tool-calls-route, mcp-federation/bootstrap, program.ts, tool-registrations; not started adopt.ts serve.ts main.ts external-mcp-vault.ts reload-adapter.ts |
| S7 | 030,031 | cloud/cov-T2-030 | running (16:46) |
| S2 | 020,021 | cloud/cov-T2-020 | MERGED; rerun renderer 602/602, speech 56/56, site-chat 231/231, all loaded lot files 100/100/100; preload-speech.cts unloadable without electron module-mock (listed) |
| S5 | 026,027 | cloud/cov-T2-026 | running |
| S3 | 022,023 | cloud/cov-T2-022 | MERGED 805bf66b; rerun all assistant tests 3318 pass 0 fail; 20/25 at 100 (agents.ts 100 in targeted run, aggregate diff = cache-busted copy); open: content-read-tool 1L/4B, external-mcp-connection-source 1B, external-mcp-revocation 1B, external-mcp-store 1L/8B, index.ts never-loaded (parent-watchdog extracted) |
| S6 | 028,029 | cloud/cov-T2-028 | running (16:23) |
