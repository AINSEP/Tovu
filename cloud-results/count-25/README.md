# FILES LEFT counter (merge-25)

`./count-files-left.sh <tovu> <jini> keep [extra keep files...]` prints `planner=<n> true=<n> rules=<n>` and
writes `true-left.txt`, `areas.txt`, `kept-by-rules.txt` into `$OUT` (default `./out-<tovu basename>`).

- `scan.mjs` = `plans/P9-data/tools/scan.mjs` (from `origin/plan/whats-left-1122`).
- `count-plan.mjs` = `cloud-results/combine-18-plan.mjs` plus one line that dumps the moving set.
  Planner = moving set minus the `theme`/`adm-themes` areas.
- `keep/` = the five `plans/count-1124/*.md`; only each file's "Proposed KEEP_RULES" section counts (507 rules).
- Calibrated: Tovu `01582000b0` + Jini `4e5de358` -> `planner=975 true=447 rules=507` (exactly merge-24's numbers).
- merge-25 adds `plans/count-1125/k0-keeps.md` (Appendix B of `reviews/x4-check-1125.md`, 177 STAYS-HOST paths)
  and `plans/count-1125/x4-keeps.md` (the slices' G3-reviewed binding keeps), both as anchored `^path$` lines.
