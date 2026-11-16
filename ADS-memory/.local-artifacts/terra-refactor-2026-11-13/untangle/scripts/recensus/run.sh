#!/bin/bash
# Re-census every lane with the #src/-fixed repoint-census.cjs (sheets-fix3, 2026-11-15). Read-only on the clones.
# Output: scripts/recensus/<lane>.raw.tsv (+ <lane>.post.tsv when the lane has a post.json)
set -u
U=/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle
S=$U/scripts; O=$S/recensus
run() { node $S/repoint-census.cjs $S/census/$2.json > $O/$1.$2.raw.tsv 2> $O/$1.$2.err; }
run C1-plus c1plus & run C2 c2 & run C2-addendum c2add & run C4 c4 & run C4 c4-barrel &
wait
run C5 c5 & run C6 c6 & run C6 c6-diag & run C7 c7 & run C8 c8 & run C10 c10 &
wait
python3 $S/repoint-post.py $S/census/c1plus.post.json $O/C1-plus.c1plus.raw.tsv > $O/C1-plus.post.tsv
python3 $S/repoint-post.py $S/census/c2add.post.json $O/C2-addendum.c2add.raw.tsv > $O/C2-addendum.post.tsv
python3 $S/repoint-post.py $S/census/c4.post.json $O/C4.c4.raw.tsv $O/C4.c4-barrel.raw.tsv > $O/C4.post.tsv
python3 $S/repoint-post.py $S/census/c5.post.json $O/C5.c5.raw.tsv > $O/C5.post.tsv
python3 $S/repoint-post.py $S/census/c8.post.json $O/C8.c8.raw.tsv > $O/C8.post.tsv
python3 $S/repoint-post.py $S/census/c10.post.json $O/C10.c10.raw.tsv > $O/C10.post.tsv
