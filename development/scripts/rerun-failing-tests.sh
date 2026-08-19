#!/usr/bin/env bash
# ==============================================================================
# rerun-failing-tests.sh -- re-run only the currently-failing test files, together
# ==============================================================================
#
# Part of the local-CI toolkit added 2026-08-19 (see ci-local.sh's header for why).
# Iterating on a large failure list one full-suite run at a time is slow and, per
# ci-local.sh's own memory warning, a full-suite run is itself a resource risk. This
# derives the failing-FILE list from a TAP file and re-runs just those files in one
# `node --test` invocation, then prints the grouped-by-file summary.
#
# Deliberately does NOT depend on a hand-maintained file list: the failing-file list
# is regenerated from a real TAP file every time (via tap-summary.mjs --list-files),
# so it can never drift from what actually failed last.
#
# ## Usage
#   development/scripts/rerun-failing-tests.sh                    # from the last test:ci run
#   development/scripts/rerun-failing-tests.sh path/to/some.tap    # from a specific TAP file
#
# Also wired as `npm run test:rerun-failing`.
#
# Default TAP source is development/coverage/test-results-all.tap -- what `npm run test:ci` /
# `npm run ci:local:tests` writes. Pass a path explicitly to re-run off
# development/coverage/test-results.tap (test:cov:server) instead.
#
# TEST_CONCURRENCY defaults to 2 here too, same reasoning as ci-local.sh: even a
# smaller re-run set can include the heap-limited workers ci.yml's own comments warn
# about (liquid-sandbox.test.ts spawns its own heap-limited Worker on purpose).
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

TAP_SRC="${1:-development/coverage/test-results-all.tap}"

if [[ ! -f "$TAP_SRC" ]]; then
  echo "No TAP file at $TAP_SRC yet." >&2
  echo "Run 'npm run test:ci' (or 'npm run ci:local:tests') first, or pass an existing TAP file path." >&2
  exit 1
fi

# `mapfile` (bash 4+) is NOT available here -- macOS ships bash 3.2 as /bin/bash and that is what
# `#!/usr/bin/env bash` resolves to on this machine (confirmed 2026-08-19: `mapfile: command not
# found` when this used to read `mapfile -t FILES < <(...)`). This read-loop form works on 3.2.
FILES=()
while IFS= read -r line; do
  [[ -n "$line" ]] && FILES+=("$line")
done < <(node development/scripts/tap-summary.mjs "$TAP_SRC" --list-files)

if [[ "${#FILES[@]}" -eq 0 ]]; then
  echo "No failing files found in $TAP_SRC -- nothing to re-run."
  exit 0
fi

echo "Re-running ${#FILES[@]} failing file(s) from $TAP_SRC:"
printf '  %s\n' "${FILES[@]}"

mkdir -p development/coverage
RERUN_TAP="development/coverage/rerun-failing.tap"
rm -f "$RERUN_TAP"

export TEST_CONCURRENCY="${TEST_CONCURRENCY:-2}"
node --import tsx --test \
  --test-concurrency="$TEST_CONCURRENCY" \
  --test-reporter=tap --test-reporter-destination="$RERUN_TAP" \
  --test-reporter=dot --test-reporter-destination=stdout \
  "${FILES[@]}"
EXIT=$?

echo ""
echo "=================== GROUPED FAILURES (still failing) ==================="
node development/scripts/tap-summary.mjs "$RERUN_TAP"
exit $EXIT
