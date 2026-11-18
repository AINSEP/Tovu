# L00 — ratchet prune (lower the existing baseline; 0 code edges)

**Why first:** the committed `crossFeatureEdges` has 426 rows; 124 no longer exist on the tip
(`facts/stale-baseline.v3.2d82735a.txt`). Each is a re-entry ticket: an edge someone removed could
come back unreported. Deleting them is a pure tightening — the only baseline edit arch-120 makes.

**Change:** run G-RATCHET (INDEX-v3) once. Result verified on the tip during design:
`git diff --numstat` = `0 124`, rows 426 → 302, `check:architecture` still exit 1 with the same 115
NEW lines and `FAILED: 1 metric(s)`. Commit the baseline file only.

**Risk named:** an accidental row *addition* or a rewrite of the other metrics (what `--update`
alone would do — judge 1, over-engineering note). **Check:** numstat added-column is `0`; `git diff`
touches only lines inside `crossFeatureEdges`.

**Gates:** G2 (expects 115 NEW, ARCH=1, `1 metric(s)`), G-RATCHET. No tests (no code change).

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L00.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L00`.

