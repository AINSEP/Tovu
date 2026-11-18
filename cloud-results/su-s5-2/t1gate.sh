# usage: t1gate.sh <label> <TOVU_BASE> <delete-stem-regex>
export PATH=~/.local/node24/bin:$PATH
cd /home/user/Tovu
L=$1; B=$2; S=$3
O=/tmp/claude-0/gate-$L; mkdir -p $O
npm run typecheck > $O/typecheck.txt 2>&1; echo "typecheck exit $?" >> $O/summary.txt
npm run typecheck:tests > $O/typecheck-tests.txt 2>&1; echo "typecheck:tests exit $?" >> $O/summary.txt
git diff $B..HEAD -- development/scripts/write-path-inventory.baseline.json | rg '^\+[^+]' > $O/baseline-added.txt; echo "baseline added lines $(wc -l < $O/baseline-added.txt)" >> $O/summary.txt
npm run check:boundaries 2>&1 | rg '^\s+error ' | sort | comm -13 /tmp/claude-0/bound-before.txt - > $O/bound-new.txt; echo "boundaries new lines $(wc -l < $O/bound-new.txt)" >> $O/summary.txt
npm run check:architecture 2>&1 | rg '^\s+regressed:' > $O/arch-after.txt
sed -E 's/^\s+//; s/ {2,}.*//' $O/arch-after.txt | sort | comm -13 <(sed -E 's/^\s+//; s/ {2,}.*//' /tmp/claude-0/arch-before.txt | sort) - > $O/arch-newmetric.txt; echo "architecture new regressed metrics $(wc -l < $O/arch-newmetric.txt)" >> $O/summary.txt
diff /tmp/claude-0/arch-before.txt $O/arch-after.txt > $O/arch-diff.txt
P='^(Added debt|Increased debt|New violation|Worsened violation|Delete stale debt entry)'
for c in size complexity; do npm run check:$c 2>&1 | rg "$P" | sed -E 's/:[0-9]+ / /' | sort | comm -13 /tmp/claude-0/$c-before.txt - > $O/$c-new.txt; echo "check:$c new lines $(wc -l < $O/$c-new.txt)" >> $O/summary.txt; done
source /tmp/claude-0/limits.sh; BASE=$B limits > $O/limits.txt 2>&1; echo "limits lines $(wc -l < $O/limits.txt)" >> $O/summary.txt
rg -n "$S" apps development -g '!**/node_modules/**' > $O/stem.txt; echo "stem hits $(wc -l < $O/stem.txt)" >> $O/summary.txt
npm run check:why-comments > $O/why.txt 2>&1; echo "check:why-comments exit $?" >> $O/summary.txt
echo finished >> $O/summary.txt
