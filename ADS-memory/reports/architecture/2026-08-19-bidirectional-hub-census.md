# Bidirectional hub census — the metric formerly named "core size"

**Date:** 2026-08-19
**Trigger:** `ADS-memory/reports/swarm-consensus/runs/2026-08-19-tovu-architecture-redesign-consensus.md` — a six-participant architecture debate ranked this the highest-value fix of the day, because every claim any participant made about "the core" was unfalsifiable: `development/scripts/check-architecture.ts` never tested `src/core` (or any directory) membership, and printed no membership list even under `--list`.

## What the metric actually measures

"Core size" counted files whose **transitive fan-in AND transitive fan-out both exceed the graph medians**, computed on the all-import file graph. It never calls `moduleOf()`, never checks a path against `src/core`, and has no concept of a directory named "core" at all. What it detects is a **bidirectional structural hub**: a file that is both heavily depended-on (high fan-in) and itself reaches wide across the codebase (high fan-out) — a chokepoint any change has to pass through in both directions.

## The rename

- Metric label: `"core size"` → `"bidirectional hub count"`
- Baseline JSON key: `coreSize` → `bidirectionalHubs` (same shape `{ count, total, pct }`, same values — 139/862/16.13 at commit time)
- Internal function: `propagationAndCore()` → `propagationAndHubs()`, now also returns `hubMembers` (path, owning module, transitive fan-in, transitive fan-out)
- `RATCHET_METRICS` set entry updated to the new label so the tier classification (warn-only, count-based) carries forward unchanged
- The ratchet was **not** reset: the baseline count (139) is untouched, so `check:architecture` still compares against the same historical value under the new key

`--list` now prints, under `--- bidirectional hubs ... by combined degree ---`, every hub file with `fanIn`, `fanOut`, owning module, and path, sorted by combined degree (fan-in + fan-out) descending — plus a `--- bidirectional hub membership by module ---` roll-up. Both sections are new; neither existed before this change.

## Real membership, run 2026-08-19 (863 files, 49 modules, production files only)

Full per-file listing: `npx tsx development/scripts/check-architecture.ts --list` (see the two new `---` sections). Module roll-up, 139 hub files total:

| module | count |
|---|---|
| server | 43 |
| seo | 11 |
| features/deployments | 10 |
| newsletter | 10 |
| assistant | 9 |
| widgets | 7 |
| features/theme | 5 |
| features/source-control | 4 |
| members | 4 |
| redirects | 4 |
| export | 3 |
| features/pages | 3 |
| routing | 3 |
| comments | 2 |
| features/post | 2 |
| features/vendor-credentials | 2 |
| 17 modules at 1 file each (content-types, database, entries, plugin-runtime, recovery, settings, taxonomy, workspace, forms, identity, media, navigation, webhooks, connectors, custom-credentials, plugins, site-dir) | 17 |

33 distinct modules touched (server + 32 others).

A second cross-cutting pattern is visible inside the module roll-up, not separate from it: **29 of the 139 hub files** form one tied cluster (`fanIn=75, fanOut=342`) spanning the assistant/tool-registration surface — 25 files literally named `tool-registrations.ts` (one per feature module: comments, content-types, database, deployments, entries, pages, plugin-runtime, post, recovery, settings, source-control, taxonomy, theme, workspace, forms, identity, media, members, navigation, newsletter, redirects, seo, webhooks, widgets), plus 4 closely related assistant-module files (`byok-tool-surface.ts`, `index.ts`, `tool-contribution-registry.ts`, `publish-agent-tools.ts`). These 29 are counted inside their respective module rows above, not on top of them.

## Confirm or refute the prior hypothesis

A prior in-session census (Claude Sonnet 5, read-only, standalone reimplementation of the check's logic — not the shipped code) hypothesized: *43 of 139 under `src/server/`, ~26-28 matching tool-registration/contribution/catalog paths, ≈50% combined, remaining ~70 a long tail across ~30 directories (seo≈11, features/deployments≈10, newsletter≈10, assistant≈9, widgets≈7, features/theme≈5).*

**Running the real tool CONFIRMS this hypothesis on every specific point:**

| claim | hypothesis | real (this run) | verdict |
|---|---|---|---|
| files under `src/server/` | 43 | 43 | exact match |
| tool-registration-pattern cluster | 26-28 | 29 (25 literal `tool-registrations.ts` + 4 adjacent) | close, real is slightly higher |
| server + tool-registration combined share | ≈50% | 72/139 = 51.8% | confirmed |
| seo | ≈11 | 11 | exact match |
| features/deployments | ≈10 | 10 | exact match |
| newsletter | ≈10 | 10 | exact match |
| assistant | ≈9 | 9 | exact match |
| widgets | ≈7 | 7 | exact match |
| features/theme | ≈5 | 5 | exact match |
| long-tail directory spread | ~30 directories | 33 distinct modules | confirmed |

No numbers in the hypothesis were disproved. The real tool's own `--list` output is now the source of truth going forward — the standalone reimplementation should not be cited again once this report exists.

## Explicitly not done here

Per the dispatch scope: no reduction target was set for this metric, no restructuring was started, and `RouteDeps`, `src/features/deployments`, `src/features/source-control`, `src/export/`, and `.dependency-cruiser.cjs` were not touched (other agents were actively editing those files concurrently). Enumerate first, decide later — this report is the enumeration.

## Verification

```
npm run check:architecture        # OK: hard constraints hold, ratchet intact (bidirectional hub count 139 == baseline)
npm run check:architecture -- --list   # membership + by-module roll-up print correctly
npm run typecheck                 # clean
```

One pre-existing, unrelated non-blocking WARNING is present on this run (`propagation cost (all-import)` 12.20% → 12.22%, from one extra file added by a concurrent sibling agent's in-progress work) — not caused by this change and not blocking.
