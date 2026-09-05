# Session handoff — 2026-09-02 (overnight)

## Landed tonight — every commit independently re-verified by me, not taken on an agent's report

| commit | repo | what | my own verification |
|---|---|---|---|
| `7fb47f55` | Tovu | member gating + per-visitor cache fix | 4/4 + 16/16, tsc exit 0 |
| `45400a0f` | Tovu | schema<->migration drift guard | 12/12 |
| `0354db2b` | Tovu | dead-path sweep guard | 21/21 |
| `a3a964ef` | Tovu | `?tab=admin` / `?tab=visitor` | 17/17 |
| `35cc8361` | Tovu | Posts+Pages column sorting | 90/90, 53/53 |
| `678b6464` | Tovu | 4 CI-gate dead `src/` paths repointed | sweep 21/21 |
| `97e3caa7` | Tovu | `list-server-test-files.ts` repointed | 174 unit / 27 integration (was 0) |
| `8ffd2d68` | Tovu | persist Local CLI reasoning-effort pick | — |
| `30597119` | Tovu | carry effort into the agent CLI invocation | — |
| `ec4fb6e8` | Tovu | migrate Posts/Pages onto DataTable sorting | −508 lines net |
| `64a170ec` | Jini | antigravity live model list via `agy models` | 32/32 |
| `060d8ef5` | Jini | antigravity effort as a model-id suffix | — |
| `73f88e76` | Jini | per-base-model effort control | 22/22 |
| `e139350c` | Jini | controlled click-to-sort in `DataTable` | — |

Also: free-claude-code fully removed; `@jini-ai/agent-runtime` + `@jini-ai/ui` rebuilt (scoped, never `pnpm -r`);
dev server restarted with a cleared Vite cache.

## TOMORROW — in dependency order

1. **Route coverage.** Never run. `list-server-test-files.ts` now yields 174 unit / 27 integration.
   `check-route-coverage-diff.ts` finds 218 measurable changed files but needs lcov to reach a verdict.
   `npm run test:cov:server:unit` then `:integration`. Expect `check:route-coverage-floor` to fail against
   real data for the first time — that is correct, not a regression.
2. **2 hard architecture regressions** (`check:architecture` now measures 961 files / 45 modules, was an
   EMPTY graph): module cycles/SCC 0 -> 3 (`features/post <-> platform`, `features/presentation <-> platform`),
   API surface 202 -> 232. Plus 3 non-blocking ratchet warnings.
3. **78 complexity violations** across 8 previously-unscoped areas. Decide fix-worst vs baseline-and-ratchet.
   Worst: `features/external-mcp/save-form.ts` cognitive 36, `features/skills/tool-registrations.ts` 21,
   `assistant/tool-failure-recovery.ts` (4 violations). Debt file deliberately NOT regenerated.
4. **Effort control not visible in the UI.** Owner saw no effort selector on the Antigravity card.
   LIKELY CAUSE, not yet confirmed: `LocalCliAgentCard.tsx:119-126` — `activeGroup` is null while the model
   is `Default (CLI config)`, so `reasoningOptions` is empty and the control does not render at all.
   FIRST STEP: select a real model (e.g. Gemini 3.1 Pro) and see whether High/Low appear. If they do, the
   defect is discoverability from the default state, not the derivation.
5. **Hooks sweep across `apps/admin/**/*.tsx`.** Owner: functions and derived logic never live in a
   component body. KNOWN INSTANCE, still committed in `ec4fb6e8`: `Posts.tsx:44-48` computes
   `postHandles` via `buildAgentListHandles(...)` and rebuilds `rowMenuHandleById = new Map(posts.map(...))`
   on every render; the file has ZERO `useMemo`/`useCallback` while its own header claims "markup only".
   `features/posts/hooks/` already exists. Sweep must look for DERIVED WORK in the render body, not just
   `function`/arrow declarations, or it misses most cases.
6. **DataTable Phase 3** — rollout to Collections, CollectionEntries, Menus, WidgetsLibrary, WidgetRegions,
   Taxonomy, FormsList. Phases 1+2 done; needs owner go-ahead.
7. **Move `DataTableSortState`/`DataTableSortDirection` off the `/react` subpath.** `posts/rules.ts` and
   `pages/rules.ts` (plain `.ts`) `import type` them from `@jini-ai/admin/react`. Type-only so the
   architecture gate does not flag it, but a data type should not live behind a React entry point.
8. **`check-architecture.ts` doc/code mismatch**: prose says `ENFORCE_HARD_CONSTRAINT_TIERS` defaults
   `false`; the constant is hardcoded `true`.
9. **Dead-path sweep blind spot**: `classifyRepoRelativeString`'s `trailing-separator` rule skips any
   literal ending in `/`, which is how `route-coverage-lib.ts`'s dead prefix escaped the audited 35.
   Estimated under an hour to tighten, adversarial test included.

## NOT CODE — do this
- **Revoke the `NVIDIA_NIM_API_KEY`.** It sat in plaintext in `~/.fcc/.env` from 2026-09-01 until deleted
  tonight, placed there by free-claude-code (unpinned third-party, installed from a branch zip).
  Deleting the file does not un-expose the key.
- **Jini has 25 dirty files from Aug 31**, including 7 `package.json` version bumps. Nothing has been swept
  yet, but `git commit -- <path>` ignores staging, so any agent working in Jini can pull them in. Commit or
  stash that work before running more agents there.
- `apps/admin/package.json` + root `package.json` still carry the unrelated `@jini-ai` 0.3.3 -> 0.3.4 bump.
  Kept out of all 14 commits tonight.

## Process notes that cost real time
- **Running subagents do NOT reliably receive mid-flight messages.** Hit three times tonight. Everything
  must go in the spawn prompt; a message only lands once the agent goes idle.
- **There is no "pause" for a subagent** — only TaskStop, which is destructive and loses uncommitted work.
  Brief every agent to commit each coherent piece rather than batching.
- Run `apps/website` tests from the REPO ROOT; fixtures resolve via `process.cwd()` and a wrong cwd looks
  like a real assertion failure.
