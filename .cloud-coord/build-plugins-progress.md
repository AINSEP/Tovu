# build-plugins progress (cloud, 2026-10-21, start 16:39Z, stop-new-work 20:19Z)
Branch: cloud/build-plugins-2026-10-21 (Tovu + Jini), based on cloud/wip-build1-2026-10-21.
- [x] Setup: Node 24, Jini pnpm install + build (bg), Tovu npm ci (used pre-WIP package.json for ci only: WIP root package.json adds @jini-ai/capability-providers (comments job) not in lock).
- [ ] J1 Jini compat + requires (keep WIP compatibility.ts; tests)
- [ ] J3 Jini update transaction (keep WIP update.ts/update-store.ts; fix boot reconcile reserved dirs; audit at commit; tests w/ crash points)
- [ ] T1 Tovu wiring + update route/tool/button + admin rows
Architect decisions: settings snapshot = non-secret key/revision summary (vault values never copied to disk); updateAvailable dropped (override 4).
