#!/usr/bin/env bash
# Typed lint (floating/misused promises) per unit. Usage: run-promises.sh <repo> <unitdir> [project-csv]
# Writes raw/promises-<repo>-<unit>.json (eslint json) and .err.txt; lists files via git ls-files.
set -u
export PATH=$HOME/.local/node24/bin:$PATH
SEC=/home/user/Tovu/development/cloud/quality-1111/sec
export SEC_TOOLS=${SEC_TOOLS:?}
repo=$1; unit=$2; proj=${3:-}
case $repo in tovu) base=/home/user/Tovu;; jini) base=/home/user/Jini;; esac
name=$(echo "$unit" | tr '/' '_')
out=$SEC/raw/promises-$repo-$name
cd "$base/$unit" || { echo "SKIPPED no dir" > "$out.err.txt"; exit 0; }
git ls-files -- '*.ts' '*.tsx' '*.mts' '*.cts' \
  | grep -Ev '(^|/)(__tests__|__mocks__|__fixtures__|fixtures?|mocks?|test|tests|e2e|dist|build|node_modules|vendor)/' \
  | grep -Ev '\.(test|spec|stories|story|typecheck)\.[cm]?tsx?$|\.d\.[cm]?ts$' \
  | grep -Ev '^plugins/[^/]+/[0-9][^/]*/' \
  | { if [ "$repo" = jini ]; then grep -E '^src/'; else cat; fi; } > "$out.files.txt"
n=$(wc -l < "$out.files.txt")
echo "$repo $unit files=$n start=$(date +%T)"
[ "$n" -eq 0 ] && { echo "SKIPPED no files" > "$out.err.txt"; exit 0; }
export SEC_ROOT="$base/$unit" SEC_PROJECT="$proj"
start=$(date +%s)
xargs -s 1800000 -a "$out.files.txt" -d '\n' node --max-old-space-size=6144 "$SEC_TOOLS/node_modules/eslint/bin/eslint.js" \
  --no-config-lookup -c "$SEC/scripts/promises.eslint.config.mjs" -f json -o "$out.json" --no-error-on-unmatched-pattern \
  > "$out.err.txt" 2>&1
echo "exit=$? secs=$(( $(date +%s) - start ))" >> "$out.err.txt"
tail -n1 "$out.err.txt"
