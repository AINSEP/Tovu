# fix-tovu 2026-10-21 — progress
Start 08:44Z. Base: origin/cloud/verify-2026-10-21 @0c5698d4. Verify report: cloud/verify-results-2026-10-21 (.cloud-coord/verify-v2).
Non-ENV Tovu failures: ~122 entries in 63 files, grouped into 8 lots (L1 admin media, L2 home-path redaction/desktop, L3 pages regions, L4 oauth, L5 assistant tools, L6 vault/db, L7 server composition, L8 identity/publish).
ENV (listed, not fixed): 122 entries — *.postgres.test.ts, pg-fixture (pg parts), render-form-layout (pg), desktop websites-width (no chromium).

| lot | status | a | b | c fixed | listed | merged commit | rerun |
|---|---|---|---|---|---|---|---|
| L3 pages-regions | merged | 0 | 21 | 0 | 1 follow-up (assign-location.not-live stubs nowIso, passes) | 6a699e08 | 166/166 pass |
| L4 oauth | merged | 2 (api-connections host.ts wrapped unreadable-token cause) | 20 | 0 | 0 | 1d75dba6 | 142/142 pass |
| L5 assistant-tools | merged | 4 (schema-less reader fallback, consent/theme-preview-switcher cross-site classification, deployment_preview_static_publish search queries) | 13 | 0 | 0 | e2f17c05 | 180/180 pass |
| L1 admin-media | merged | 0 | 10 | 0 | 0 | e1c9f896 | 59/59 pass |
| L2 redaction/desktop | merged | 7 (home-path leak when HOME outside /home,/Users → redactLocalText at 13 sites; smoke-bridge over-redacted tool id) | 1 (mcp spawn NODE_V8_COVERAGE) | 0 | 1 d (preload-speech needs pretest build:preload); Jini redaction.ts homeDir option follow-up | fa0a922c | desktop 127/127, website 39/39 |
| L6 vault-db | merged | 1 (surfaces.ts required.run false-positive in raw-SQLite ratchet) | 9 (parity fixture module:{}, consent tables 0021) | 0 | vault-cascade sqlite FK RESTRICT after migration 0020 (needs new migration, forbidden); pg-fixture ENV | eb96e45b | 88 pass / 1 fail (listed) / 1 skip |
| L7 server-composition | merged | 0 | 14 (+1 new test) | 0 | 0 | ff70b1b2 | 134/134 (agent) |
| L8 identity-publish | merged | 0 | 7 (+2 new tests) | 0 | default-credential-exposure x2 = real security regression (a8e48d3d hardcodes default admin password in CreateSiteOnboarding.tsx:352) — product decision, listed | 6558282a | 142/144 (2 listed) |
