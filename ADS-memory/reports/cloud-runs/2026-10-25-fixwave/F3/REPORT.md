# F3 — Jini mcp + agent-runtime (L3) + chat/memory/search (L5) fix wave

## Run log
## 2026-10-25T21:34Z — STARTED
Jini branch cloud/fixwave-1025-F3 from origin/cloud/overnight-1024-jini @ 3e2fbae8. Tovu reports worktree @ 6e117dc3. Setup (Node 24, pnpm install, build) running. Plan: mcp tool-descriptor contract tests first (musts), then L3 top-10 security items, then L5 top-10.
## 2026-10-25T21:41Z — PROGRESS
Setup OK (Node 24.22, pnpm install, `pnpm -r build` done). Note: Jini vitest 2 needs `--maxWorkers=2 --minWorkers=1` (plain `--maxWorkers=2` → "minThreads and maxThreads must not conflict").
Pushed Jini e7470f19 (mcp tool descriptor contracts — the 4 MUST files), dd3eac5a (serve nonce gate, secret-file default port, tokens `__proto__`), ac08f392 (agent-runtime prompt-budget quoting/boundaries, role-marker-guard tail window). mcp full suite 1381/1381 green; all mcp source files 100% lines/branches (only pre-existing `__tests__/fixtures.ts` helpers <100%).
