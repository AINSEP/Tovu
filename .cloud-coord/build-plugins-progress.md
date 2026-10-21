# build-plugins progress (cloud, 2026-10-21, start 16:39Z, stop-new-work 20:19Z)
Branch: cloud/build-plugins-2026-10-21 (Tovu + Jini), based on cloud/wip-build1-2026-10-21.
- [x] Setup: Node 24, Jini pnpm install + build (bg), Tovu npm ci (used pre-WIP package.json for ci only: WIP root package.json adds @jini-ai/capability-providers (comments job) not in lock).
- [x] J1 Jini compat + requires — Jini d61908b7 + review fixes 98500b71
- [x] J3 Jini update transaction — Jini 4242b710 + review fixes 6918e4eb (B1-B3,S1-S4,N1-N2)
- [x] T1 Tovu wiring + update route/tool/button — wip 848bcd6b + final 7bbbac9a (review fixes incl.)
Architect decisions: settings snapshot = non-secret key/revision summary (vault values never copied to disk); updateAvailable dropped (override 4).
