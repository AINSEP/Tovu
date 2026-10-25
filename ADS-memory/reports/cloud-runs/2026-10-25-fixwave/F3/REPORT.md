# F3 — Jini mcp + agent-runtime (Stryker L3) + chat/memory/search (L5) fix wave

Jini branch `cloud/fixwave-1025-F3` (from `origin/cloud/overnight-1024-jini` @ 3e2fbae8). Tests only, plus one minimal source bug fix and three behaviour-preserving CCN refactors.

## 1. Headline (interim — updated as the run proceeds)
- **Tests added: 560** (measured with `vitest list` per changed test file, base version vs now; no test file lost tests): mcp +148, agent-runtime +169, chat +130, memory +77, search +36.
- **Source bugs: 1 found, 1 fixed** (see §2).
- **Coverage** (vitest v8, `--coverage.reportOnFailure`): mcp all source files 100/100 (only pre-existing `__tests__/fixtures.ts` helpers <100); memory 100/100; search 100/100; agent-runtime 100% lines, 99.94% branches (`defs/claude.ts:139` untouched by F3; `claude-filesystem-policy.ts` 92.85→100 branches by F3). chat: pending.
- **CCN > 10 in scope (non-UI src of the 5 packages, eslint `complexity: 10`): 3 → 0** (chat `collapseDeliveryReceipts`, `selectedAnswerText`, `turnUsage`; tests green before and after, tsc clean).
- **Stryker before → after** (before = lane report; after = F3 re-run, same config: vitest runner, perTest, StringLiteral excluded, `--force`, mutate = touched files): see §3.

## 2. Source bugs
1. **agent-runtime `isDeepSeekAuthFailureText` — every mention of `DEEPSEEK_API_KEY` was classified as "not authenticated".** The qualifier regex `/auth|api[_ -]?key|missing|…/` matches *inside* `DEEPSEEK_API_KEY` itself, so `DEEPSEEK_API_KEY && qualifier` was just `DEEPSEEK_API_KEY`. The tailored classifier's null is authoritative for the auth probe (auth.ts "a null result is authoritative"), so a healthy deepseek probe that merely names the variable (e.g. "using DEEPSEEK_API_KEY from env") reported `status: missing` with sign-in guidance. RED test `8c1c653b` (`'DEEPSEEK_API_KEY loaded' → false` fails), fix `5eea6ef7` (drop the self-matching `api[_ -]?key` term; same qualifier set reasonix already uses minus `invalid`). Behaviour change: text like "DEEPSEEK_API_KEY is empty" (no failure word) is no longer flagged — judged correct, flag if not.

Observation, NOT changed (design question for the owner): `role-marker-guard` withholds only a COMPLETE role keyword; an incomplete prefix split across chunks (`"##"`, `" us"`) is emitted before the marker is recognized, so `"## us"` reaches the UI while the forged turn after it is dropped. Pinned as current behaviour in `role-marker-guard.test.ts` with a comment.

## 3. Per-file Stryker table (score %, before → after)
| package | file | before | after |
|---|---|---|---|
| mcp | server/tools/component-catalog-tools.ts | 64.3 | 100 |
| mcp | server/tools/run-tools.ts | 70.2 | 96.4 (3 left: `x !== undefined` → true, equivalent on the JSON wire; now also key-pinned, not re-scored) |
| mcp | server/tools/tool-catalog-tools.ts | 87.1 | 98.4 |
| mcp | server/message-relay.ts | 83.7 | 100 |
| mcp | bin/serve.ts | 89.4 (3 NoCov) | 93.6 (0 NoCov; rest = main-module guard, `{runId}` option objects) |
| mcp | core/config.ts | 89.3 | 90.1 |
| mcp | core/tokens.ts | 88.4 | 89.9 (then null-shape/strict-key tests added, not re-scored) |
| mcp | federation/stdio/adapter.stdio.ts | 87.7 | 88.0 |
| agent-runtime | prompt-budget.ts | 69.5 | 93.8 |
| agent-runtime | claude-filesystem-policy.ts | 73.2 (12 NoCov) | 86.6 (1 NoCov) |
| agent-runtime | auth.ts | 79.1 | 86.1 → round 2: **90.9** (28 left; ~10 are equivalent `!value.trim()` guards, JSON-vs-text fallbacks) |
| agent-runtime | role-marker-guard.ts | 73.1 | 79.1 → round 2: **83.6** (11 left; 211/239/264/266/293 judged equivalent) |
| agent-runtime | invocation.ts | 76.0 | **84.0** |
| agent-runtime | env.ts | 93.9 | 93.9 (3 left) |
| memory | entry-frontmatter.ts | 72.1 | 83.7 |
| memory | note-store.ts | 83.2 | 86.3 |
| memory | llm-provider.ts | 89.1 | 89.6 |
| memory | verify.ts | 89.1 | 92.0 |
| search | tools.ts | 85.3 | 90.2 (then catalog contract pinned, not re-scored) |
| search | testkit/conformance.ts | 85.4 | 87.0 |
| search | indexer.ts | 93.2 | 93.4 |
| search | registry.ts | 96.0 | 97.0 |
| chat | (10 files) | see L5 table | pending |

## 4. Anti-patterns seen most (feed AI Dev Shop)
1. **Call-history leak in mocks** — `toHaveBeenCalledWith` on a never-reset module mock matches ANY earlier call, so "omits key X" tests passed on a previous test's call (mcp run-tools). Fix: `beforeEach(vi.clearAllMocks)` + `toHaveBeenLastCalledWith`/`NthCalledWith`.
2. **`toEqual` ignores undefined-valued keys** — "key omitted" was asserted with `toEqual`, so `if (x !== undefined) body.x = x` → always-assign survived (mcp run-tools, tool-catalog, tokens; search `present` filter). Fix: `toStrictEqual` or `Object.keys(...)`.
3. **Unasserted declarative contracts** (AP5) — tool inputSchemas/annotations in mcp (4 files), chat `CHAT_CAPABILITIES`, search catalog. Fixed with inline `toEqual` + a real JSON-schema validator (good / extra key / missing required).
4. **Singleton / substring-shortcut inputs** — search `[1]` lists (every↔some), memory verify cases that accidentally matched via the substring path instead of the word-overlap path being tested.
5. **Object-literal `__proto__`** — tokens test wrote `{'__proto__': …}` in a literal (sets the prototype, never an own key), so the guard was never exercised; must come from `JSON.parse`.
6. **Defaults never reached** — `writeSecretText` default port flags were only tested at the primitive; callers' defaults were unpinned.

## 5. NOT done
(updated at the end)

## 6. Commits
(updated at the end)



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

## 2026-10-25T23:16Z — PROGRESS
agent-runtime round-2 re-score done; chat L5 re-score (1936 mutants) still running since 22:07; mcp round-2 started. Jini HEAD pushed through scope-option test.
