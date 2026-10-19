# reverify-d4 report (2026-10-16, 10:14–18:50)

Details: STILL-FAILING.md (this folder). Commands: landing-cmds.json; status: results.tsv; logs: logs/.

- Commits (Tovu): 0c6d3713c (redirects tool test: stale "(REQ-22)" text; RED 2 fail → GREEN 28/28), 47ebd0331 (desktop-shell beforeAll looks for data.nosync/content.db; RED beforeAll fail → beforeAll passes; the suite is still red from UI drift). Both test-only, so mutation N/A. Jini: none.
- Codex rounds: r1 redirects (ok), r2 desktop-shell layout (ok), r3 read-only investigation of desktop Restart/Zoom (ok), r4 openSiteTab readiness (edit left UNCOMMITTED in development/e2e/desktop/_fixtures.ts; GREEN not shown).
- Units: 160 overnight-failing files rerun → 157 green. Still red: Jini infra-retirement (j1, by design), admin devtools-bundle (5 s timeout under load; 2/2 pass isolated = flaky), redirects (fixed). Postgres ×4 not run (env). Charge-refund no longer hangs.
- E2E chromium: byok ×6, agent-page, ask_choice, deployment provider split, pages phone + window.top security: all pass. settings-locale phone baseline fails (UI lane).
- Desktop journeys 24/26. Start/Restart hits "tovu serve did not report a port within 60000ms" under load (dev source mode). Zoom In fail = test readiness gap.
- Not done (stopped at the context budget): base-path test, admin-visual media/mobile, mobile-visual reruns; GREEN check of the r4 fixture fix; 60 s readiness fix.
