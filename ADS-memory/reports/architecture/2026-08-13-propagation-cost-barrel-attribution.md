# Propagation-cost attribution — why `assistant`'s barrel cost 20x what `comments`/`forms`/`newsletter`/`site-dir`'s did

**Status:** Measurement report, not a proposal. No production code touched — every number below comes
from isolated `git worktree` experiments (detached HEAD, `git revert`/`git cherry-pick --no-commit`,
never touching the shared working tree/index). `src/assistant/**` was read-only for this report, per
instruction (`FixAssistant` owns it).

**Commissioned by:** team-lead, after `assistant`'s barrel commits (`b2afd33`, `f4cc88d`, `3e67fa5`)
took propagation cost from ~7.6% to ~12.2% while the four-module trace-A barrels
(`comments`/`forms`/`newsletter`/`site-dir`, this agent's own work) shipped the same kind of narrow
data-contract door with no corresponding regression when first measured. The open question: is
"narrow barrel ⇒ cheap" the real rule, or is something else going on that a general policy should
target instead?

## What propagation cost actually measures

Read `development/scripts/check-architecture.ts` before forming a hypothesis. `buildFileGraph()` /
`reachableCount()` run a BFS over the **full file-level import graph** (not the module-collapsed
graph used for the cycle/SCC metrics) and `propagationCostPct` is the mean, across every file, of
`(files transitively reachable from this file) / (total files - 1)`. A barrel file that re-exports
from N sibling files makes every file that imports *anything* from the barrel transitively reach all
N — even the ones it never needed.

That is a real mechanism. The question this report answers is what makes it expensive in practice.

## Method

All experiments used a `git worktree add --detach` at a fixed base commit, with `node_modules`
symlinked in (never copied, never touching the real install). Reverts/cherry-picks/direct edits
happened only inside the worktree; the shared tree was verified untouched (`git status`/`git log`)
before and after every worktree session. Each worktree was removed with `git worktree remove --force`
+ `git worktree prune` when done. No `check:architecture -- --update` was run at any point.

## Result 1 — isolating `assistant`'s three commits against a fixed backdrop

Reverted `b2afd33`/`f4cc88d`/`3e67fa5`/`4dee6bd` (docs-only) on top of current HEAD, then
`git cherry-pick --no-commit`'d them back one at a time, holding every other agent's concurrent work
(including this agent's own trace-A commits) fixed throughout:

| Step | Change | Propagation cost | Δ |
|---|---|---|---|
| A0 | `assistant` barrel work fully reverted | 7.78% | — |
| A1 | + `b2afd33`: `assistant/index.ts` added, **unused** (pure addition) | 7.80% | +0.02 |
| A2 | + `f4cc88d`: composition roots + daemon-proxy redirected (7 files: `app.ts`, `deps.ts`, `index.ts`, `assistant.ts`, `assistant-byok.ts`, `site-assistant.ts`, `routes/types.ts`) | 12.20% | **+4.40** |
| A3 | + `3e67fa5`: remaining 22 consumers redirected (12 admin CRUD routes, 3 external-mcp routes, 2 public site gates, 3 db/sqlite adapters, 1 plugin) | 12.37% | +0.17 |

Nearly the entire regression (4.40 of 4.59 points, ~96%) lands in **one 7-file commit**. Adding the
barrel with zero consumers costs nothing. Redirecting the last 22 consumers — individually more
numerous than the first 7 — costs almost nothing.

## Result 2 — isolating the one file inside that commit

From A2, reverted **only** `src/server/routes/types.ts`'s 3 assistant import lines back to their
pre-barrel direct-file form (`ChatStoreFactory` from `persistence/tenant-scope`,
`SiteAssistantCredentialRepoPort`/`AdminExecutionCredentialRepoPort` from their own files,
`ExternalMcpServerRepoPort` from its own file), leaving `app.ts`/`deps.ts`/`index.ts`/the three
composition modules still on the barrel:

| Step | Change | Propagation cost |
|---|---|---|
| A2 | all 7 files on the barrel | 12.20% |
| B1 | only `routes/types.ts` reverted to direct imports | **7.86%** |

One file, three import lines, recovers 4.34 of the 4.40-point jump. The other six files in that
commit — two composition roots, the process entrypoint, three composition modules — contribute
essentially nothing (12.20% − 7.86% ≈ 0.06% left over for all six combined once `routes/types.ts` is
accounted for).

**Why this one file dominates:** `RouteDeps` (defined in `routes/types.ts`) is imported, directly or
by type, by 100+ files across `src/server/routes/**` — every admin and site route handler needs it.
Before the barrel, `routes/types.ts` reached exactly 4 of `assistant`'s files (the ones its 3 type
imports actually named). `assistant/index.ts` re-exports from ~24 files across all six of its
sections — including site-assistant runtime (`site/capability-registry.ts`, `site/mode.ts`, …),
full BYOK execution (`byok-provider-turn.ts`, `byok-tool-surface.ts`), and daemon-proxy/MCP-UI
internals (`daemon-auth.ts`, `mcp-ui-tool-calls.ts`, `run-ownership.ts`, …) that `routes/types.ts`
had no prior reason to reach at all. Redirecting `routes/types.ts` to the barrel makes it — and by
transitive closure, **everything that already imports it for `RouteDeps`** — newly reach roughly 20
files it never touched before. That growth is inherited by all 100+ dependents simultaneously. The
composition roots and process entrypoint, by contrast, have very low fan-in (a handful of importers
each, mostly tests and `src/index.ts` itself) — their own reachable-set growth has almost nowhere to
propagate to.

## Result 3 — checking the same mechanism against this agent's own (narrow) barrels

The original comparison that reported "12.37% with vs. 12.37% without" this agent's four commits
(comments/forms/newsletter/site-dir) was run against a backdrop that **already included**
`assistant`'s expensive `routes/types.ts` redirect. That measurement is still correct as far as it
goes, but it couldn't detect a marginal cost from this agent's own (also present in `routes/types.ts`)
comments/forms redirect, because by that point `routes/types.ts`'s reachable set was already
massively inflated by `assistant` — a small further addition doesn't move a 2-decimal percentage once
the file is already saturated.

Rebuilt the same isolation in an `assistant`-free environment (assistant's 4 commits reverted
throughout) to get a clean read:

| Step | Change | Propagation cost | Δ |
|---|---|---|---|
| Z1 | Neither `assistant`'s nor this agent's trace-A work present anywhere, including `routes/types.ts` | 7.42% | — |
| Z0 | + this agent's other ~20 files (3 new barrel `index.ts` files + non-`routes/types.ts` consumer redirects) | 7.58% | +0.16 |
| A0 | + this agent's `routes/types.ts` redirect (`comments`, `forms` — 2 lines, both narrow barrels) | 7.78% | +0.20 |

So: **this agent's barrels are not free, they are cheap** — `routes/types.ts` importing from the
narrow `comments`/`forms` barrels instead of their target files directly costs +0.20pp, not the
+4.34pp `assistant`'s wide barrel cost through the identical file. The same high-fan-in file, two very
different barrel widths, a ~20x cost difference. Correcting the earlier "exactly zero" claim: it
wasn't exactly zero, it was too small to see against a saturated backdrop. The direction of the
finding is unchanged — narrow barrels through the same hub cost proportionally little — but "exactly
zero" overstated it.

## The general rule

Barrel cost through file X ≈ **fan-in(X) × |files newly reachable from X via the barrel that weren't
already reachable from X|**. Two variables, not one:

1. **Fan-in of the redirected consumer.** A barrel redirect on a low-fan-in file (a composition root
   with 1-3 importers, a single-purpose repo adapter, a one-route handler) is nearly free *regardless
   of barrel width* — `assistant`'s own 22-consumer batch (`3e67fa5`) proves this: many files,
   individually low fan-in each, +0.17pp total. `b2afd33` proves it from the other direction: a
   27-file-wide barrel with **zero** consumers costs +0.02pp — width alone, undelivered to any
   consumer, is free.
2. **How much of the barrel's content was already reachable from that consumer some other way.**
   `comments`/`forms`/`newsletter`/`site-dir` all sit inside the same 35-module SCC as `assistant`,
   so SCC membership alone does not predict cost — the target modules in both cases are equally
   "densely connected" at the module level. What differs is that `routes/types.ts` had rich
   pre-existing reasons to already transitively touch most of what the trace-A barrels expose (thin,
   overlapping port/type/error surfaces within already-tightly-coupled hexagonal modules), while it
   had **no prior path at all** into `assistant`'s site-assistant runtime, BYOK execution internals, or
   daemon-proxy code — three genuinely separate concern areas bundled into one door.

Neither variable alone predicts cost: a wide barrel with no high-fan-in consumer is free (`b2afd33`);
a narrow barrel through a high-fan-in consumer is cheap but not zero (`comments`/`forms` through
`routes/types.ts`, this report's Result 3); a wide barrel through a high-fan-in consumer is expensive
(`assistant`'s `f4cc88d`, via `routes/types.ts` specifically). It is the product that matters.

## What this means for the owner's decision

`assistant`'s barrel is not inherently unsalvageable, and it does not need to be abandoned wholesale.
The cost is not spread evenly across its 27 files or its 59 original edges — it is concentrated almost
entirely in one redirect: `routes/types.ts` reaching all six sections through one door when it only
ever needed three files from two of them (`persistence/tenant-scope.ts` for `ChatStoreFactory`;
`site-credential-store.ts` + `execution-credential-store.ts` + `external-mcp-store.ts` for the three
port types — sections F, B, C, E as the barrel's own comments label them).

Two options follow directly from the measurement, in order of surgical-ness:

- **Cheapest fix: revert just `routes/types.ts`'s 3 lines** back to direct per-file imports (as
  `B1` did), leaving the barrel and the other 28 redirected consumers alone. Recovers ~4.3 of the
  ~4.6-point regression for a 3-line change. `routes/types.ts` was never the file the barrel's
  narrative was written for (`b2afd33`'s own docblock names the composition roots and daemon-proxy
  modules as the target); it just happens to be the one file in that commit with catastrophic
  fan-in.
- **Structural fix, if the owner wants every consumer on a barrel:** split `assistant/index.ts` along
  its already-labeled six sections into six section-scoped barrels. `routes/types.ts` would then
  import only the 2-3 sections it actually needs (F, B/C's credential parts, E), never touching
  section A (site-assistant runtime) or section D (daemon-proxy/MCP-UI) at all — the two sections
  responsible for most of the newly-reachable file count. This was not empirically tested in this
  report (would require edits inside `src/assistant/**`, out of scope here) but follows directly from
  Result 2's mechanism and is falsifiable the same way: cherry-pick a real 6-way split into an
  isolated worktree and re-measure `routes/types.ts`'s marginal cost against each section barrel
  individually.

Leaving `assistant`'s deep imports alone entirely is not the finding here — the cost is narrow and
identifiable, not diffuse. "The barrel cannot be made cheap" is not the honest answer for this module;
"one file in the redirect set is doing almost all of the damage" is.

## Raw evidence

Every `check:architecture -- --list` run referenced above was captured to
`/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/277dec4a-e3ce-449c-b55b-4e91a6236db9/scratchpad/`
(`A0`…`A3`, `B1`, `Z0`, `Z1` — filenames match the step labels in this report) at the time of
measurement. That scratchpad is session-local and not committed; the tables above are the durable
record.
