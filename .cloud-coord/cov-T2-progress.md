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
| S5 | 026,027 | cloud/cov-T2-026 | MERGED 40cd79de0; rerun changed tests 253/253; targeted reruns: uninstall-tool, token-sign-in, mail-adapter-registry 100; memory-bus 98.7 in aggregate = subprocess-loaded copy (outbox-drainer.scheduling.test.ts:53), subagent 100; open: install-tool, access-token-tool, connect-tool, executable-tools/register, federate-mcp, install-upload, lifecycle, agent-plugins/tool-registrations, api-connections/host, custom-credentials (copy-tool, store, tool-registrations, credentialed-request 2 port guards), database-transfer (destination-store, table-catalog, tool-registrations), database/tool-registrations; LOCAL-RUN copy-engine.postgres + tool-registrations.postgres |
| S8 | 032,033 | cloud/cov-T2-032 | MERGED 0720b4710; rerun changed tests pass 284 fail 0; 27 files 100 (21 raised, 6 already); open: settings/tool-registrations B43/44, site-profile B64/65, share-registry B82/84; ~19 files not started |
| S7 | 030,031 | cloud/cov-T2-030 | MERGED f15c4a59b; rerun changed tests 409/409; ~40 files 100; open: host-binding (2-byte V8 range), featured-image (100 alone; existing mock.module test corrupts merge), post/publish-content B99.22, search-index B96, search-index.postgres (LOCAL-RUN), apply-loop, backstop-service, export-bundle, gated-hooks, peer-transport, disconnect-tool |
| S10 | 036 | cloud/cov-T2-036 | running (20:41, stop 21:15) |
| S9 | 034 | cloud/cov-T2-034 | running (20:40, stop 21:15) |
| — | rate-limit 17:2x–19:52 | S6/S7/S8 paused, resumed 19:53; owner moved hard stop to 21:45Z | |
| S3 | 022,023 | cloud/cov-T2-022 | MERGED 805bf66b; rerun all assistant tests 3318 pass 0 fail; 20/25 at 100 (agents.ts 100 in targeted run, aggregate diff = cache-busted copy); open: content-read-tool 1L/4B, external-mcp-connection-source 1B, external-mcp-revocation 1B, external-mcp-store 1L/8B, index.ts never-loaded (parent-watchdog extracted) |
| S6 | 028,029 | cloud/cov-T2-028 | running (16:23) |
