#!/usr/bin/env bash
# inv.sh <lane> — repoint inventory from the AST reverse-import index of the tip (/tmp/revidx.tsv)
set -euo pipefail
lane=$1; map=/tmp/claude-0/s/map.tsv; idx=/tmp/revidx.tsv
echo "### Inventory (TypeScript-AST reverse-import index of tip \`2d82735a\`, all of \`apps/website/src\`, prod + tests)"
echo
echo "#### Edges"
awk -F'\t' -v L="$lane" '$3==L{printf "- `%s` -> `%s` [%s] %s\n",$1,$2,$4,$5}' $map
echo
syms=$(awk -F'\t' -v L="$lane" '$3==L && $4 ~ /D|J/{print $5}' $map | sed 's/ ->.*//; s/ <-.*//' | tr ',' '\n' | sed 's/^ *//; s/ .*//' | grep -E '^[A-Za-z_]+$' | sort -u || true)
if [ -n "$syms" ]; then
  echo "#### Every import/re-export of a moved or redirected symbol — repoint each; delete each re-export (no forwarder)"
  for s in $syms; do
    echo "- \`$s\`:"
    awk -F'\t' -v S="$s" '{n=split($5,a,","); for(i=1;i<=n;i++) if(a[i]==S){printf "    - `%s:%s` %s from `%s`\n",$1,$3,$4,$2; break}}' $idx | sort -u
  done
  echo
fi
echo "#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)"
for f in $(awk -F'\t' -v L="$lane" '$3==L{print $1}' $map | sort -u); do
  p=$(awk -F'\t' -v F="features/$f" '$2==F{print $1}' $idx | sort -u | grep -v '__tests__' | paste -sd' ' - || true)
  t=$(awk -F'\t' -v F="features/$f" '$2==F{print $1}' $idx | sort -u | grep '__tests__' | paste -sd' ' - || true)
  echo "- \`features/$f\`"
  echo "    - prod: $(echo $p | sed 's/ /, /g')"
  echo "    - tests: $(echo $t | sed 's/ /, /g')"
done
