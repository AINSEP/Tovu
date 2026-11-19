# L00 — baseline prune and the expected edge set (data, no script) — one repo (Tovu), Codex-ready

**What the tip reports (measured on `2d82735a` with `npm run check:architecture`, recorded in
`facts/check-architecture.v3.2d82735a.txt`):** exit 1; exactly **115** `NEW cross-feature edge`
lines, listed verbatim in `v4/edges/all-115.txt`; `FAILED: 1 metric(s) regressed against a hard
constraint` (cross-feature edges only). `v4/edges/L01.txt … L14.txt` partition that file: every
line appears in exactly one lane file (L00 and L15 own none). This is the expected 115-edge set.

**Change (the only baseline edit in arch-120):** `development/scripts/check-architecture.baseline.json`
has 426 `crossFeatureEdges` rows on the tip. The **124** rows listed in
`facts/stale-baseline.v3.2d82735a.txt` name edges that no longer exist. Delete those 124 strings from
the `crossFeatureEdges` array, keep the other 302 rows in their current order, and change nothing
else in the file (no other key, no added row, no reformatting). This removes re-entry tickets: a
removed edge cannot come back unreported.

**Expected result (data the verifier compares):**
- `git diff --numstat` on the baseline file: `0	124`.
- `check:architecture` output on the candidate equals the parent's output: the same 115 NEW lines,
  exit 1, and the same `1 metric(s)` summary. The prune changes no reported line.
- `check:boundaries` output unchanged.

**STOP:** if the tip's baseline is not 426 rows, or if any of the 124 rows is missing, do not edit;
report the counts. The executor does not run any command to produce the edit. It deletes the
listed strings.

No tests (no code change). Lanes L01–L15 never edit the baseline. Their removed edges are NEW lines,
so the baseline has no row for them. After the last lane, the owner may repeat this prune for any
row that has become stale. That is a separate, data-only change.

---
