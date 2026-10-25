# F3 — Jini mcp + agent-runtime (L3) + chat/memory/search (L5) fix wave

## Run log
## 2026-10-25T21:34Z — STARTED
Jini branch cloud/fixwave-1025-F3 from origin/cloud/overnight-1024-jini @ 3e2fbae8. Tovu reports worktree @ 6e117dc3. Setup (Node 24, pnpm install, build) running. Plan: mcp tool-descriptor contract tests first (musts), then L3 top-10 security items, then L5 top-10.
## 2026-10-25T21:41Z — PROGRESS
Setup OK (Node 24.22, pnpm install, `pnpm -r build` done). Note: Jini vitest 2 needs `--maxWorkers=2 --minWorkers=1` (plain `--maxWorkers=2` → "minThreads and maxThreads must not conflict").
Pushed Jini e7470f19 (mcp tool descriptor contracts — the 4 MUST files), dd3eac5a (serve nonce gate, secret-file default port, tokens `__proto__`), ac08f392 (agent-runtime prompt-budget quoting/boundaries, role-marker-guard tail window). mcp full suite 1381/1381 green; all mcp source files 100% lines/branches (only pre-existing `__tests__/fixtures.ts` helpers <100%).
## 2026-10-25T21:54Z — PROGRESS
SOURCE BUG FOUND+FIXED: agent-runtime `isDeepSeekAuthFailureText` — qualifier `/auth|api[_ -]?key|…/` self-matches inside `DEEPSEEK_API_KEY`, so any mention of the variable (incl. healthy probe output) => "missing auth". RED test 8c1c653b, fix 5eea6ef7.
Pushed through d40d78a7: L3 top-10 #1-#7,#9 + MUSTs; L5 top-10 #1,#2,#4-#9.
mcp Stryker re-score (8 files): component-catalog 64.3→100, run-tools 70.2→96.4, tool-catalog 87.1→98.4, message-relay 83.7→100, serve 89.4→93.6, config 89.3→90.1, tokens 88.4→89.9, adapter.stdio 87.7→88.0 (before = lane L3 report).
