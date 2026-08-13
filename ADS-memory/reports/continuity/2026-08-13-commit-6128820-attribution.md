# Commit `6128820` contains work its message does not describe

**Date:** 2026-08-13
**Status:** Accepted as-is. Do NOT attempt to repair the history.

## What happened

Two agents were committing concurrently against one shared git index. Agent A staged its two
files, ran `git diff --cached --stat`, confirmed only its own files were listed, then ran
`git commit -F <msgfile>` **without a trailing `-- <paths>` restriction**. In the window between
that check and the commit, Agent B staged two files of its own. Agent A's commit swept them in.

Both agents reported this independently and unprompted. Neither attempted recovery.

## The mechanism — this is the transferable part

`git diff --cached --stat` before a commit is **necessary but not sufficient** with concurrent
agents. It is a check with a race window after it: it describes the index at *inspection* time,
and says nothing about the index at *execution* time.

**Only `-- <paths>` on the `git commit` command itself is race-safe**, because it constrains what
the commit captures when it runs. This was proven immediately afterward: the same agent's next
commit (`02ba946`) stayed at exactly 1 file while 5 unrelated files sat staged.

## What `6128820` actually contains

Message: `fix(admin): revert plugin source catalog to an explicit 44-entry list`

| File | Owner | Real content |
|---|---|---|
| `apps/admin/src/features/plugins/agent-plugin-source-catalog.ts` | Agent A | matches the message |
| `apps/admin/src/features/plugins/AgentPluginDetailsModal.tsx` | Agent A | matches the message |
| `src/features/post/reverters.ts` (new, 192 lines) | Agent B | **unrelated** — `createPostReverters(deps)` / `createPostRevertRegistry(deps)`, `PostReverterDeps` with the dead `settingsRepo` field dropped |
| `src/features/post/index.ts` (+1) | Agent B | **unrelated** — barrel export for the above |

Content verified intact via `git show --stat 6128820` and
`git cat-file -e HEAD:src/features/post/reverters.ts`. Nothing lost, dropped, or corrupted. The
defect is purely that the commit message does not describe half of what the commit contains.

## Full Job B file-to-commit map (the `appliers.ts` inversion)

Recorded because `6128820` breaks `git log --follow`-style archaeology for this work.

| Commit | Files |
|---|---|
| `6437183` invert appliers.ts to the generic registry only | `src/core/commands/appliers.ts`, `src/core/commands/revert.ts` |
| `6128820` *(mislabeled — see above)* | `src/features/post/reverters.ts`, `src/features/post/index.ts` |
| `42957f0` register the post revert registry on RouteDeps | `src/server/deps.ts`, `src/server/app.ts`, `src/server/routes/admin/change-sets/revert.ts`, `src/server/routes/admin/content/deps.ts`, `src/server/routes/types.ts` |
| `1b08e11` update reverter tests for the deps-closure signature | `src/core/commands/__tests__/post-delete-reverter.test.ts`, `src/core/commands/__tests__/integration/revert-plugin-ext.integration.test.ts` |
| `28f8f18` promote core-no-server-or-app-imports to error | `.dependency-cruiser.cjs` |

## Why no repair

`reset`, `amend`, `revert`, and cherry-pick were all declined deliberately. With multiple agents
committing against one index and further commits already stacked on top, a history rewrite risks
real work from two agents to fix a cosmetic problem. A mislabeled commit whose contents are
documented is strictly safer than a rewrite that races another agent's `git add`.
