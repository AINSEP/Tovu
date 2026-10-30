# TARGETED FIX TEST — 2026-10-29 evening (REPORT ONLY)
Tests ONLY what changed after the final-verify snapshot: the chat-safety and tool-call fixes (r46 s1–s5). The final verify (cloud/final-1029-results) covers everything before that.

## HARD CAPS
- Sonnet 5.5, NO subagents, 1h45m wall clock, no new step after minute 90. No product-code edits. Commit + push ONLY ADS-memory/reports/cloud-runs/2026-10-29-fixtest/ to Tovu branch cloud/fixtest-1029-results. RUN-LOG.md: STARTED in the first 2 minutes; push every 15 min.
- Save every tool output as raw/<step>.txt (never .log). RESULTS.md lists EVERY failure (file, test name, first ~15 error lines, re-run alone once → FLAKY if it passes, class REAL/STALE/ENV with likely cause file:line).

## Code
Tovu: this branch (cloud/fixtest-1029). Jini: AINSEP/Jini branch cloud/fixtest-1029.

## Setup (same as the earlier verifies)
Node 24 under ~/.local/node24; corepack enable. Jini: `pnpm install --frozen-lockfile` (if the lockfile is rejected, run `pnpm install` once, record the diff in raw/, continue) then `pnpm --no-bail -r build`. Tovu: `npm ci` fails on unpublished @jini-ai ranges → local UNCOMMITTED overrides/link to the Jini checkout exactly as the previous runs did; build @tovu/sdk before link:jini. Postgres + chromium as before if a listed test needs them.

## Steps
1. Jini: vitest (`--maxWorkers=2 --minWorkers=1`) for the FULL suites of packages agent-runtime, chat, core, daemon, mcp, ui; plus `pnpm -r typecheck` (record only errors in those 6 packages separately).
2. Tovu: run every test file listed in tests-tovu.txt (node:test with the repo's TSX config, `--test-concurrency=1`; admin/desktop files with their own runner), PLUS the whole directories apps/website/src/assistant/**, apps/website/src/features/{agent-plugins,media-import,theme,trash,site-inspection,media}/**, apps/website/src/server/inbound/assistant/**, and admin vitest for apps/admin/src/components/AgentRuntimePicker* and AssistantDock.
3. Tovu typecheck: root, typecheck:tests, admin. Tovu complexity:strict on changed files only (git diff --name-only ab01f88b4..HEAD).
4. RESULTS.md §0 one screen of pass/fail per step; §1 every failure.
