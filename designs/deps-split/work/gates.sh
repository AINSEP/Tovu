#!/usr/bin/env bash
# deps-split gates (REVISION-2). One file so every sheet runs the SAME fail-closed checks.
# Contract: every subcommand exits 0 only when its check passed; any finding, any tool error,
# any missing input exits non-zero and prints a line starting with "STOP-". No subcommand turns
# a finding into success: no `|| echo`, no `&& echo`, no `; cd`, no pipeline whose upstream
# status is dropped (pipefail is on and no stage of a pipeline here can fail by truncation).
# Usage (Tovu root): DS_SHEET=S<n> bash designs/deps-split/work/gates.sh <subcommand> [args]
#   setup | link | refs-record | refs | facts | freeze | base-capture | newlines <gate…> | tsc |
#   why | limits | shape | loggers | imports | tests <set> | build | commit | sheet-end | selftest
set -euo pipefail
shopt -s nullglob

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
D=apps/website/src/server/runtime/composition
SD=$D/site-deps
W=designs/deps-split/work
BASE=${DS_BASE_DIR:-$W/base-outputs}
NOW=${DS_NOW_DIR:-${TMPDIR:-/tmp}/ds-now}
NPM=${DS_NPM:-npm}
NPX=${DS_NPX:-npx}
JINI=${DS_JINI_DIR:-$ROOT/../Jini}
mkdir -p "$NOW"

die() { printf 'STOP-%s\n' "$*" >&2; exit 1; }
need() { [ -e "$1" ] || die "MISSING-INPUT $1"; }

# grep exit 0 = match (a finding), 1 = no match (pass), >1 = tool error. Both 0 and >1 stop.
forbid() {
  local tag=$1 pat=$2 st=0; shift 2
  grep -rnE -- "$pat" "$@" || st=$?
  case $st in 1) return 0;; 0) die "$tag";; *) die "TOOL grep ($tag) exit $st";; esac
}
# Number of matching lines; tool errors stop, zero matches is 0.
count() {
  local pat=$1 out st=0; shift
  out=$(grep -rhE -- "$pat" "$@") || st=$?
  [ "$st" -le 1 ] || die "TOOL grep count exit $st"
  if [ -z "$out" ]; then echo 0; else printf '%s\n' "$out" | wc -l | tr -d ' '; fi
}
# Run a command, keep its output and its exact exit status in files; never fails by itself.
capture() {
  local name=$1 st=0; shift
  "$@" > "$NOW/$name.out" 2>&1 || st=$?
  echo "$st" > "$NOW/$name.exit"
}
# Digit runs → N and ANSI stripped, so moved lines and counts do not read as new findings;
# a new finding still differs by path, rule or message text.
normalize() { sed -E 's/\x1b\[[0-9;]*m//g; s/[0-9]+/N/g' "$1" | LC_ALL=C sort > "$2"; }

sheet_num() { local s=${DS_SHEET:?STOP-DS_SHEET unset (S0..S13)}; s=${s#S}; [[ $s =~ ^[0-9]+$ ]] || die "BAD-DS_SHEET $DS_SHEET"; echo "$s"; }

cmd_setup() {
  if [[ "$(node -v 2>/dev/null || true)" != v24.* ]]; then
    local dir=$HOME/.local/node24 tmp; tmp=$(mktemp -d)
    curl -fsSL -o "$tmp/SHASUMS256.txt" https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt || die "SETUP-NODE-INDEX"
    local file; file=$(awk '$2 ~ /^node-v24\.[0-9.]+-linux-x64\.tar\.xz$/ {print $2; exit}' "$tmp/SHASUMS256.txt")
    [ -n "$file" ] || die "SETUP-NODE-NO-TARBALL"
    curl -fsSL -o "$tmp/$file" "https://nodejs.org/dist/latest-v24.x/$file" || die "SETUP-NODE-DOWNLOAD"
    (cd "$tmp" && grep -F " $file" SHASUMS256.txt > one.sha && sha256sum -c one.sha) || die "SETUP-NODE-CHECKSUM"
    mkdir -p "$dir" && tar -xJf "$tmp/$file" -C "$dir" --strip-components=1 || die "SETUP-NODE-EXTRACT"
    export PATH=$dir/bin:$PATH
    [[ "$(node -v)" == v24.* ]] || die "SETUP-NODE-VERSION"
    echo "node $(node -v) installed; run: export PATH=$dir/bin:\$PATH"
  fi
  [ "$(basename "$JINI")" = Jini ] || die "SETUP-JINI-NAME $JINI (host deps are file:../Jini/packages/*)"
  (cd "$JINI" && pnpm install --frozen-lockfile && pnpm --no-bail -r build) || die "SETUP-JINI-BUILD (see output above; pnpm --no-bail still exits non-zero on any failed package)"
  "$NPM" ci || die "SETUP-NPM-CI"
  JINI_PACKAGES_DIR="$(cd "$JINI/packages" && pwd)" node development/scripts/link-jini.mjs || die "SETUP-LINK"
  cmd_link
}

cmd_link() {
  # lesson 47: every app with its own node_modules, plus the root, must resolve @jini-ai/* to ../Jini.
  local bad=0 any=0 p real jroot
  jroot=$(cd "$JINI/packages" && pwd -P) || die "LINK-NO-JINI $JINI/packages"
  for p in node_modules/@jini-ai/* apps/*/node_modules/@jini-ai/*; do
    any=1
    real=$(readlink -f "$p") || { echo "unresolvable: $p"; bad=1; continue; }
    case "$real" in "$jroot"/*) ;; *) echo "not linked to Jini: $p -> $real"; bad=1;; esac
  done
  [ "$any" = 1 ] || die "LINK-NOTHING-FOUND (no node_modules/@jini-ai entries; run setup)"
  [ "$bad" = 0 ] || die "LINK"
}

cmd_refs_record() {
  mkdir -p "$BASE"
  { echo "TOVU_BASE=$(git rev-parse HEAD)"; echo "JINI=$(git -C "$JINI" rev-parse HEAD)"; echo "NODE=$(node -v)"; } > "$BASE/refs.env"
  cat "$BASE/refs.env"
}

cmd_refs() {
  need "$BASE/refs.env"
  local TOVU_BASE JINI_SHA
  TOVU_BASE=$(sed -n 's/^TOVU_BASE=//p' "$BASE/refs.env"); JINI_SHA=$(sed -n 's/^JINI=//p' "$BASE/refs.env")
  [ -n "$TOVU_BASE" ] && [ -n "$JINI_SHA" ] || die "REFS-EMPTY $BASE/refs.env"
  git merge-base --is-ancestor "$TOVU_BASE" HEAD || die "REFS-TOVU base $TOVU_BASE is not an ancestor of HEAD"
  [ "$(git -C "$JINI" rev-parse HEAD)" = "$JINI_SHA" ] || die "REFS-JINI ../Jini is not at $JINI_SHA (setup must use the pinned Jini)"
}

cmd_facts() {
  # lesson 43: regenerate every census on this tree; the committed TSVs must match byte for byte.
  local s
  for s in closure-census module-census literal-keys deps-importers; do
    need "$W/$s.tsv"
    if [ "$s" = deps-importers ]; then node "$W/$s.cjs" . --rows > "$NOW/$s.tsv" || die "TOOL $s.cjs"
    else node "$W/$s.cjs" . > "$NOW/$s.tsv" || die "TOOL $s.cjs"; fi
    diff -u "$W/$s.tsv" "$NOW/$s.tsv" > "$NOW/$s.diff" || { head -40 "$NOW/$s.diff"; die "FACTS $s drifted (full diff: $NOW/$s.diff)"; }
  done
  echo "facts: 4 censuses match"
}

# Paths no other lane may change while the split runs (exclusive), and files shared with named lanes
# (a lane may change them only if its merge into the candidate is conflict-free).
EXCLUSIVE=("$D/deps.ts" "$SD" "$D/outbound-http.ts")
SHARED=("$D/app.ts" "apps/website/src/index.ts" "development/scripts/size-debt.json" "development/scripts/error-gate-debt.json"
  "$D/memory-deps/slices/outbound-http.ts" "$D/__tests__" "apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts"
  "apps/website/src/platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts"
  "apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts"
  "apps/website/src/server/__tests__/unit/serving-app-boot-wiring.unit.test.ts"
  "apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts"
  "development/scripts/check-capability-inventory.ts" "development/scripts/__tests__/site-plugin-directories.test.mjs"
  "development/scripts/backfill-slug-collision-defaults.ts")

cmd_freeze() {
  # Checked on the CANDIDATE commit (index as it would be committed), before every commit.
  local n; n=$(sheet_num)
  local lanes=${DS_FREEZE_LANES:-$W/freeze-lanes.tsv}; need "$lanes"
  if [ -z "${DS_NO_FETCH:-}" ]; then
    git fetch -q origin '+refs/heads/wave*:refs/remotes/origin/wave*' '+refs/heads/refactor/*:refs/remotes/origin/refactor/*' \
      '+refs/heads/integ/*:refs/remotes/origin/integ/*' || die "FREEZE-FETCH"
  fi
  local tree cand refs r st out mtree conflicted hit allowed row tip until self
  tree=$(git write-tree) || die "TOOL write-tree"
  cand=$(git commit-tree "$tree" -p HEAD -m "freeze probe") || die "TOOL commit-tree"
  self=$(git rev-parse --abbrev-ref HEAD)
  local fbase=${DS_FREEZE_BASE:-}
  if [ -z "$fbase" ]; then need "$BASE/refs.env"; fbase=$(sed -n 's/^TOVU_BASE=//p' "$BASE/refs.env"); fi
  git rev-parse -q --verify "$fbase^{commit}" > /dev/null || die "FREEZE-NO-BASE '$fbase' (run refs-record in S0 first)"
  if [ -n "${DS_FREEZE_ONLY:-}" ]; then refs=$DS_FREEZE_ONLY
  else refs=$(git for-each-ref --format='%(refname:short)' refs/remotes/origin/wave2 refs/remotes/origin/wave3 refs/remotes/origin/refactor refs/remotes/origin/integ) || die "TOOL for-each-ref"; fi
  [ -n "$refs" ] || die "FREEZE-NO-LANES (fetch returned no lane refs)"
  local stop=0
  while IFS= read -r r; do
    case "$r" in "origin/$self"|origin/refactor/terra) continue;; esac
    git merge-base --is-ancestor "$r" "$cand" && continue          # already in the candidate
    row=$(awk -F'\t' -v l="$r" '$1==l' "$lanes") || die "TOOL awk $lanes"
    if [ -n "$row" ] && [ "$(printf '%s\n' "$row" | cut -f5)" = stale ]; then   # coordinator-confirmed dead lane, pinned tip
      [ "$(git rev-parse "$r")" = "$(git rev-parse "$(printf '%s\n' "$row" | cut -f2)^{commit}")" ] && continue
      echo "STOP-FREEZE-STALE-MOVED $r (listed stale, but its tip moved)"; stop=1; continue
    fi
    git merge-base "$cand" "$r" > /dev/null || { echo "STOP-FREEZE-NO-MERGE-BASE $r"; stop=1; continue; }
    st=0; out=$(git merge-tree --write-tree --name-only --no-messages "$cand" "$r") || st=$?
    [ "$st" -le 1 ] || { echo "STOP-FREEZE-TOOL merge-tree $r exit $st"; stop=1; continue; }
    mtree=$(printf '%s\n' "$out" | sed -n 1p); conflicted=$(printf '%s\n' "$out" | sed -n '2,$p')
    hit=0; git diff --quiet "$cand" "$mtree" -- "${EXCLUSIVE[@]}" || hit=$?
    [ "$hit" -le 1 ] || { echo "STOP-FREEZE-TOOL diff $r"; stop=1; continue; }
    # Conflicts the lane already has with the sheet base are its own rebase work (reported); a
    # frozen/shared file that conflicts only once the candidate is applied is a STOP.
    local bst=0 bout bconf p c newc=""
    bout=$(git merge-tree --write-tree --name-only --no-messages "$fbase" "$r") || bst=$?
    [ "$bst" -le 1 ] || { echo "STOP-FREEZE-TOOL merge-tree(base) $r exit $bst"; stop=1; continue; }
    bconf=" $(printf '%s\n' "$bout" | sed -n '2,$p' | tr '\n' ' ') "
    for c in $conflicted; do
      for p in "${EXCLUSIVE[@]}" "${SHARED[@]}"; do case "$c" in "$p"|"$p"/*)
        case "$bconf" in *" $c "*) echo "freeze: NOTE $r already conflicts with the base on $c (lane's own rebase)";; *) newc="$newc $c";; esac;;
      esac; done
    done
    if [ -n "$newc" ]; then echo "STOP-FREEZE-CONFLICT $r: this commit creates a conflict on$newc"; stop=1; continue; fi
    [ "$hit" = 0 ] && continue
    # The lane changes an exclusive path cleanly: allowed only if listed with this exact tip and
    # the current sheet is before the sheet that needs the lane merged first.
    allowed=0
    if [ -n "$row" ]; then
      tip=$(printf '%s\n' "$row" | cut -f2); until=$(printf '%s\n' "$row" | cut -f4); until=${until#S}
      if [ "$(git rev-parse "$r")" = "$(git rev-parse "$tip^{commit}")" ] && [ "$n" -lt "$until" ]; then allowed=1; fi
    fi
    if [ "$allowed" = 1 ]; then echo "freeze: $r edits an exclusive path; allowed until S$until (tip $tip)"
    else echo "STOP-FREEZE $r changes $(git diff --name-only "$cand" "$mtree" -- "${EXCLUSIVE[@]}" | tr '\n' ' ')(not listed, tip moved, or must be merged before S$n)"; stop=1; fi
  done <<< "$refs"
  [ "$stop" = 0 ] || exit 1
  echo "freeze: clean for S$n"
}

GATES=(check:boundaries check:architecture check:size check:complexity check:errors check:inventory)

run_gate() { # name → captured as $NOW/<name>.{out,exit}
  case $1 in
    tsc) capture tsc "$NPX" tsc -p tsconfig.json --noEmit;;
    tsc-tests) NODE_OPTIONS=--max-old-space-size=6144 capture tsc-tests "$NPX" tsc -p tsconfig.tests.json --noEmit;;
    build) capture build "$NPM" run build:server;;
    check:*) capture "${1#check:}" "$NPM" run "$1";;
    *) die "UNKNOWN-GATE $1";;
  esac
}

cmd_base_capture() {
  mkdir -p "$BASE"
  local g name
  for g in tsc tsc-tests build "${GATES[@]}"; do
    run_gate "$g"; name=${g#check:}
    cp "$NOW/$name.out" "$BASE/$name.out"; cp "$NOW/$name.exit" "$BASE/$name.exit"
    echo "base $g: exit $(cat "$BASE/$name.exit")"
  done
  count 'createConsoleLogger\(' --include='*.ts' --exclude='*.test.ts' --exclude-dir=__tests__ apps/website/src > "$BASE/loggers.count"
  echo "base loggers: $(cat "$BASE/loggers.count")"
  local set; for set in sr wide; do cmd_tests_run "$set"; cp "$NOW/tests-$set.tap" "$BASE/tests-$set.tap"; done
  tests_summarize "$BASE/tests-sr.tap" "$BASE/tests-sr"; tests_summarize "$BASE/tests-wide.tap" "$BASE/tests-wide"
}

# A gate passes when its exit status equals the base's (or is 0) and no normalized output line is new.
# Expected new lines are fixed strings listed per sheet in expected-new-lines.tsv (gate<TAB>line).
cmd_newlines() {
  local g name st bst stop=0 exp
  for g in "$@"; do
    name=${g#check:}; need "$BASE/$name.out"; need "$BASE/$name.exit"
    run_gate "$g"
    st=$(cat "$NOW/$name.exit"); bst=$(cat "$BASE/$name.exit")
    normalize "$BASE/$name.out" "$NOW/$name.base.norm"; normalize "$NOW/$name.out" "$NOW/$name.now.norm"
    LC_ALL=C comm -13 "$NOW/$name.base.norm" "$NOW/$name.now.norm" > "$NOW/$name.new"
    exp=$NOW/$name.expected; : > "$exp"
    if [ -f "$W/expected-new-lines.tsv" ]; then awk -F'\t' -v g="$g" -v s="${DS_SHEET:-}" '$1==s && $2==g {print $3}' "$W/expected-new-lines.tsv" > "$exp"; fi
    if [ -s "$exp" ]; then
      local gst=0; grep -vxF -f "$exp" "$NOW/$name.new" > "$NOW/$name.left" || gst=$?   # exit 1 = every new line expected
      [ "$gst" -le 1 ] || die "TOOL grep expected-new-lines"
      mv "$NOW/$name.left" "$NOW/$name.new"
    fi
    if [ -s "$NOW/$name.new" ]; then echo "STOP-NEWLINE $g:"; cat "$NOW/$name.new"; stop=1; fi
    if [ "$st" != 0 ] && [ "$st" != "$bst" ]; then echo "STOP-EXIT $g exit $st (base $bst)"; stop=1; fi
    [ "$stop" = 1 ] || echo "gate $g: exit $st (base $bst), no new line"
  done
  [ "$stop" = 0 ] || exit 1
}

cmd_why() {
  local b; b=$(sed -n 's/^TOVU_BASE=//p' "$BASE/refs.env"); [ -n "$b" ] || die "MISSING-INPUT TOVU_BASE"
  "$NPM" run check:why-comments -- --merge-base --base "$b" || die "WHY-COMMENTS"
}

# Owner limits (50 code lines per function, complexity 10, 500 code lines per file) on every .ts file
# the candidate adds or changes, tests included. Added files: zero findings. Changed files: no new
# (rule, normalized message) and no size number above the same entry's number at HEAD.
cmd_limits() {
  local cfg=$W/limits.eslint.config.mjs files f st stop=0
  files=$(git diff --cached --name-only --diff-filter=AMR HEAD -- '*.ts' '*.mts' '*.tsx') || die "TOOL git diff"
  [ -n "$files" ] || { echo "limits: no .ts file in the candidate"; return 0; }
  while IFS= read -r f; do
    st=0; "$NPX" eslint --no-config-lookup -c "$cfg" -f json "$f" > "$NOW/limits.now.json" || st=$?
    [ "$st" -le 1 ] || { echo "STOP-TOOL eslint exit $st on $f"; stop=1; continue; }
    if git cat-file -e "HEAD:$f" 2>/dev/null; then
      git show "HEAD:$f" > "$NOW/limits.old.ts" || die "TOOL git show"
      st=0; "$NPX" eslint --no-config-lookup -c "$cfg" -f json --stdin --stdin-filename "$f" < "$NOW/limits.old.ts" > "$NOW/limits.old.json" || st=$?
      [ "$st" -le 1 ] || { echo "STOP-TOOL eslint(old) exit $st on $f"; stop=1; continue; }
    else echo '[]' > "$NOW/limits.old.json"; fi
    node -e '
      const fs = require("fs");
      const rows = (p) => JSON.parse(fs.readFileSync(p, "utf8")).flatMap((r) => r.messages).map((m) => {
        if (m.fatal) throw new Error("eslint parse error: " + m.message);
        const num = Number((/\((\d+)\)/.exec(m.message) || [])[1] ?? NaN);
        return { key: m.ruleId + "|" + m.message.replace(/\d+/g, "N"), num };
      });
      const old = rows(process.argv[1]), now = rows(process.argv[2]);
      const pool = new Map(); for (const o of old) pool.set(o.key, [...(pool.get(o.key) || []), o.num]);
      const bad = [];
      for (const n of now) {
        const list = pool.get(n.key) || [];
        if (!list.length) { bad.push("new: " + n.key); continue; }
        const max = Math.max(...list); list.splice(list.indexOf(max), 1);
        if (!Number.isNaN(n.num) && n.num > max) bad.push("grew: " + n.key + " " + max + " -> " + n.num);
      }
      if (bad.length) { console.log(bad.join("\n")); process.exit(1); }
    ' "$NOW/limits.old.json" "$NOW/limits.now.json" || { echo "STOP-LIMITS $f"; stop=1; }
  done <<< "$files"
  [ "$stop" = 0 ] || exit 1
  echo "limits: ok"
}

cmd_shape() {
  [ -d "$SD" ] || { echo "shape: $SD absent (before S3), nothing to check"; return 0; }
  forbid "SHAPE module let/var or re-export in site-deps" '^(export )?(let|var) |^export \* |^export \{[^}]*\} from ' "$SD"
  forbid "MODULE-CELL in site-deps" '^(export )?const [A-Za-z_$][A-Za-z0-9_$]* *(:[^=]+)?= *(new |create[A-Z]|\[|\{|await )' "$SD"
  forbid "LOGGER-IN-SLICE" 'createConsoleLogger' "$SD"
  echo "shape: ok"
}

cmd_loggers() {
  # E3 inventory: production createConsoleLogger( lines in apps/website/src stay at the base count.
  need "$BASE/loggers.count"
  local n b; b=$(cat "$BASE/loggers.count")
  n=$(count 'createConsoleLogger\(' --include='*.ts' --exclude='*.test.ts' --exclude-dir=__tests__ apps/website/src)
  [ "$n" = "$b" ] || die "LOGGERS $n production constructions (base $b)"
  echo "loggers: $n"
}

# Module evaluation order (DESIGN R5): the four modules that must load last stay deps.ts's last
# imports in this order, and nothing under site-deps imports them, app.ts or deps.ts.
TAIL='#src/features/site-export/index ./app.js ./site-app-boot-work.js ./settings-registration.js'
cmd_imports() {
  local got
  got=$(node -e '
    const ts = require("typescript"), fs = require("fs");
    const f = process.argv[1], sf = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);
    const specs = sf.statements.filter(ts.isImportDeclaration).filter((s) => !s.importClause?.isTypeOnly).map((s) => s.moduleSpecifier.text);
    console.log(specs.slice(-4).join(" "));' "$D/deps.ts") || die "TOOL imports parse"
  [ "$got" = "$TAIL" ] || die "IMPORT-ORDER last runtime imports of deps.ts are [$got], expected [$TAIL]"
  if [ -d "$SD" ]; then
    forbid "IMPORT site-deps loads a late module" "from ['\"](\.\./)+(app|deps|site-app-boot-work|settings-registration)\.js['\"]|features/site-export" "$SD"
  fi
  echo "imports: ok"
}

# Test sets. sr = every source reader of the moved code + composition tests (lesson 45, every commit);
# wide = server unit + integration + routes (sheet end).
SR_FILES=(apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts
  apps/website/src/platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts
  apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts
  apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts
  apps/website/src/server/__tests__/unit/serving-app-boot-wiring.unit.test.ts
  apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts
  development/scripts/__tests__/dependency-cruiser.test.ts
  apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts
  apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts
  apps/website/src/__tests__/no-first-party-require.boundary.test.ts
  'apps/website/src/server/runtime/composition/__tests__/*.test.ts'
  'apps/website/src/server/runtime/composition/memory-deps/__tests__/*.test.ts')
WIDE_FILES=('apps/website/src/server/__tests__/unit/*.test.ts' 'apps/website/src/server/__tests__/integration/*.test.ts'
  'apps/website/src/server/__tests__/routes/*.test.ts' 'apps/website/src/server/__tests__/*.test.ts')
cmd_tests_run() {
  local set=$1 files=()
  case $set in sr) files=("${SR_FILES[@]}");; wide) files=("${WIDE_FILES[@]}");; *) die "UNKNOWN-TEST-SET $set";; esac
  local st=0
  if [ -n "${DS_TEST_RUNNER:-}" ]; then "$DS_TEST_RUNNER" "${files[@]}" > "$NOW/tests-$set.tap" 2>&1 || st=$?
  else
    TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts \
      --test --experimental-test-module-mocks --test-concurrency=2 --test-reporter=tap "${files[@]}" > "$NOW/tests-$set.tap" 2>&1 || st=$?
  fi
  echo "$st" > "$NOW/tests-$set.exit"
}
tests_summarize() { # tap → <prefix>.fail (sorted names), <prefix>.count (# tests)
  local tap=$1 prefix=$2
  grep -qE '^# duration_ms ' "$tap" || die "TAP-INCOMPLETE $tap (no final summary: runner crashed or was cut short)"
  local n; n=$(sed -n -E 's/^# tests ([0-9]+)$/\1/p' "$tap")
  [ -n "$n" ] || die "TAP-INCOMPLETE $tap (no '# tests' line)"
  echo "$n" > "$prefix.count"
  local st=0; grep -E '^ *not ok ' "$tap" > "$prefix.raw" || st=$?
  [ "$st" -le 1 ] || die "TOOL grep $tap"
  sed -E 's/^ *not ok [0-9]+ - //; s/ # .*$//' "$prefix.raw" | LC_ALL=C sort -u > "$prefix.fail"
}
cmd_tests() {
  local set=${1:?set}; need "$BASE/tests-$set.fail"; need "$BASE/tests-$set.count"
  cmd_tests_run "$set"
  local st; st=$(cat "$NOW/tests-$set.exit")
  tests_summarize "$NOW/tests-$set.tap" "$NOW/tests-$set"
  local nfail; nfail=$(sed -n -E 's/^# fail ([0-9]+)$/\1/p' "$NOW/tests-$set.tap")
  local ncanc; ncanc=$(sed -n -E 's/^# cancelled ([0-9]+)$/\1/p' "$NOW/tests-$set.tap")
  local stop=0
  case $st in 0|1) ;; *) echo "STOP-RUNNER tests-$set exit $st"; stop=1;; esac
  if [ "$st" != 0 ] && [ "${nfail:-0}" = 0 ] && [ "${ncanc:-0}" = 0 ]; then echo "STOP-RUNNER tests-$set exit $st with no failing test"; stop=1; fi
  LC_ALL=C comm -13 "$BASE/tests-$set.fail" "$NOW/tests-$set.fail" > "$NOW/tests-$set.newfail"
  if [ -s "$NOW/tests-$set.newfail" ]; then echo "STOP-NEWFAIL tests-$set:"; cat "$NOW/tests-$set.newfail"; stop=1; fi
  local now base; now=$(cat "$NOW/tests-$set.count"); base=$(cat "$BASE/tests-$set.count")
  if [ "$now" -lt "$base" ]; then echo "STOP-TESTCOUNT tests-$set $now < base $base"; stop=1; fi
  [ "$stop" = 0 ] || exit 1
  echo "tests-$set: $now tests (base $base), exit $st, no new failure"
}

cmd_commit() {  # run with the commit's changes staged (git add -A first)
  [ -n "$(git diff --cached --name-only)" ] || die "COMMIT-NOTHING-STAGED"
  local stat; stat=$(git status --porcelain --untracked-files=all) || die "TOOL git status"
  if printf '%s\n' "$stat" | grep -qvE '^([MADR] |$)'; then die "COMMIT-UNSTAGED (stage everything with git add -A; the gates judge the candidate)"; fi
  cmd_refs; cmd_freeze
  cmd_newlines tsc tsc-tests "${GATES[@]}"
  cmd_why; cmd_limits; cmd_shape; cmd_loggers; cmd_imports
  cmd_tests sr
  echo "commit gates: all passed for $(git write-tree)"
}

cmd_sheet_end() {
  cmd_newlines build
  cmd_tests wide
  cmd_facts
}

# ---- self-test: every gate is shown to exit non-zero on a planted case (lesson 40). ----------
expect_fail() { local tag=$1 st=0; shift; ( "$@" ) > "$NOW/selftest.$tag.log" 2>&1 || st=$?
  if [ "$st" = 0 ]; then echo "SELFTEST-FAILED $tag: gate passed on a planted failure"; cat "$NOW/selftest.$tag.log"; return 1; fi
  # It must fail BY a STOP line: exit 127 (command not found) or a shell error is not a gate firing.
  local why; why=$(grep -m1 'STOP-' "$NOW/selftest.$tag.log") || { echo "SELFTEST-FAILED $tag: exit $st without a STOP line"; cat "$NOW/selftest.$tag.log"; return 1; }
  echo "selftest $tag: fired (exit $st): $why"; }
expect_pass() { local tag=$1 st=0; shift; ( "$@" ) > "$NOW/selftest.$tag.log" 2>&1 || st=$?
  if [ "$st" != 0 ]; then echo "SELFTEST-FAILED $tag: gate failed on a clean case"; cat "$NOW/selftest.$tag.log"; return 1; fi
  echo "selftest $tag: clean case passes"; }

cmd_selftest() {
  # Logic self-tests use stub tools in a scratch dir, so they run before `npm ci`. S0 also runs
  # the real plants of COMMON §6 (type error, failing test, 51-line function, …) after setup.
  local tmp fails=0; tmp=$(mktemp -d)
  local SB=$tmp/base SN=$tmp/now; mkdir -p "$SB" "$SN" "$tmp/sd"
  local G="env DS_BASE_DIR=$SB DS_NOW_DIR=$SN"; local GS="bash $ROOT/$W/gates.sh"
  # newlines: stub npm whose output stays / gains a line / exits differently with no output.
  printf '%s\n' '#!/usr/bin/env bash' 'case "$DS_STUB" in' \
    ' same) echo "x 15 errors"; exit 15;;' ' newline) echo "x 15 errors"; echo "src/new.ts: no-deep-imports"; exit 15;;' \
    ' fixed) echo "x 0 errors"; exit 0;;' ' crash) exit 2;;' 'esac' > "$tmp/npm"; chmod +x "$tmp/npm"
  echo "x 15 errors" > "$SB/boundaries.out"; echo 15 > "$SB/boundaries.exit"
  expect_pass newlines-same  $G DS_STUB=same DS_NPM="$tmp/npm" $GS newlines check:boundaries || fails=1
  expect_pass newlines-fixed $G DS_STUB=fixed DS_NPM="$tmp/npm" $GS newlines check:boundaries || fails=1
  expect_fail newlines-new   $G DS_STUB=newline DS_NPM="$tmp/npm" $GS newlines check:boundaries || fails=1
  expect_fail newlines-crash $G DS_STUB=crash DS_NPM="$tmp/npm" $GS newlines check:boundaries || fails=1
  # tests: stub runner — known failure only (pass); new failure, crash without failures, cut-short TAP, fewer tests (all stop).
  printf '%s\n' '#!/usr/bin/env bash' 'S="# fail 1\n# cancelled 0\n# duration_ms 5\n"' 'case "$DS_STUB" in' \
    ' known) printf "not ok 1 - pg only\n# tests 3\n$S"; exit 1;;' \
    ' newfail) printf "not ok 1 - pg only\n  not ok 2 - moved slice\n# tests 3\n$S"; exit 1;;' \
    ' crash) printf "# tests 3\n# fail 0\n# cancelled 0\n# duration_ms 5\n"; exit 7;;' \
    ' silent) printf "ok 1 - a\n# tests 3\n# fail 0\n# cancelled 0\n# duration_ms 5\n"; exit 1;;' \
    ' cut) printf "ok 1 - a\n"; exit 1;;' \
    ' fewer) printf "not ok 1 - pg only\n# tests 2\n$S"; exit 1;;' 'esac' > "$tmp/runner"; chmod +x "$tmp/runner"
  echo "pg only" > "$SB/tests-sr.fail"; echo 3 > "$SB/tests-sr.count"
  local s
  for s in newfail crash silent cut fewer; do
    expect_fail "tests-$s" $G DS_STUB=$s DS_TEST_RUNNER="$tmp/runner" $GS tests sr || fails=1
  done
  expect_pass tests-known $G DS_STUB=known DS_TEST_RUNNER="$tmp/runner" $GS tests sr || fails=1
  # grep-based gates (same patterns as cmd_shape) on a scratch tree, plus a grep tool error.
  printf 'let planted = 1;\n' > "$tmp/sd/a.ts";                  expect_fail shape-let  forbid SHAPE '^(export )?(let|var) ' "$tmp/sd" || fails=1
  printf 'export const cell = new Map();\n' > "$tmp/sd/a.ts";    expect_fail shape-cell forbid CELL '^(export )?const [A-Za-z_$][A-Za-z0-9_$]* *(:[^=]+)?= *(new |create[A-Z]|\[|\{|await )' "$tmp/sd" || fails=1
  printf 'export function f() { return 1; }\n' > "$tmp/sd/a.ts"; expect_pass shape-fn   forbid CELL '^(export )?const [A-Za-z_$][A-Za-z0-9_$]* *(:[^=]+)?= *(new |create[A-Z]|\[|\{|await )' "$tmp/sd" || fails=1
  expect_fail grep-tool-error forbid MISSING 'x' "$tmp/does-not-exist" || fails=1
  # freeze: a synthetic lane that appends one line to deps.ts. Unlisted → stop; listed with its tip
  # before its sheet → pass; same row at its sheet → stop; listed with a moved tip → stop.
  local lane=refs/remotes/origin/wave3/zz-selftest-freeze blob newtree laneSha
  if git cat-file -e "HEAD:$D/deps.ts" 2>/dev/null; then
    blob=$(git show "HEAD:$D/deps.ts" > "$tmp/deps.ts" && echo "// planted by gates.sh selftest" >> "$tmp/deps.ts" && git hash-object -w "$tmp/deps.ts")
    GIT_INDEX_FILE=$tmp/index git read-tree HEAD
    GIT_INDEX_FILE=$tmp/index git update-index --cacheinfo "100644,$blob,$D/deps.ts"
    newtree=$(GIT_INDEX_FILE=$tmp/index git write-tree); laneSha=$(git commit-tree "$newtree" -p HEAD -m "selftest lane")
    git update-ref "$lane" "$laneSha"
    local F="env DS_BASE_DIR=$SB DS_NOW_DIR=$SN DS_NO_FETCH=1 DS_FREEZE_BASE=$(git rev-parse HEAD) DS_FREEZE_ONLY=origin/wave3/zz-selftest-freeze DS_FREEZE_LANES=$tmp/lanes.tsv"
    : > "$tmp/lanes.tsv"
    expect_fail freeze-unlisted $F DS_SHEET=S1 $GS freeze || fails=1
    printf 'origin/wave3/zz-selftest-freeze\t%s\tdeps.ts\tS5\tallow\tselftest\n' "$laneSha" > "$tmp/lanes.tsv"
    expect_pass freeze-listed-before $F DS_SHEET=S1 $GS freeze || fails=1
    expect_fail freeze-listed-at     $F DS_SHEET=S5 $GS freeze || fails=1
    printf 'origin/wave3/zz-selftest-freeze\t%s\tdeps.ts\tS5\tallow\tselftest\n' "$(git rev-parse HEAD)" > "$tmp/lanes.tsv"
    expect_fail freeze-tip-moved     $F DS_SHEET=S1 $GS freeze || fails=1
    git update-ref -d "$lane"
  else echo "STOP-SELFTEST no $D/deps.ts at HEAD"; fails=1; fi
  rm -rf "$tmp"
  [ "$fails" = 0 ] || die "SELFTEST (a gate failed open or closed wrongly; fix gates.sh before any sheet runs)"
  echo "selftest: every planted case fired, every clean case passed"
}

sub=${1:-}; [ -n "$sub" ] || die "USAGE gates.sh <subcommand>"; shift
case $sub in
  setup) cmd_setup;; link) cmd_link;; refs-record) cmd_refs_record;; refs) cmd_refs;; facts) cmd_facts;;
  freeze) cmd_freeze;; base-capture) cmd_base_capture;; newlines) cmd_newlines "$@";; tsc) cmd_newlines tsc tsc-tests;;
  why) cmd_why;; limits) cmd_limits;; shape) cmd_shape;; loggers) cmd_loggers;; imports) cmd_imports;;
  tests) cmd_tests "$@";; build) cmd_newlines build;; commit) cmd_commit;; sheet-end) cmd_sheet_end;; selftest) cmd_selftest;;
  *) die "USAGE unknown subcommand $sub";;
esac
