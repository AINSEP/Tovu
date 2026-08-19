#!/usr/bin/env bash
# ==============================================================================
# ci-local.sh -- local mirror of .github/workflows/ci.yml, for when Actions can't run
# ==============================================================================
#
# ## Why this exists (2026-08-19)
#
# GitHub Actions is billing-blocked on this account: every job dies in ~3s with
# "recent account payments have failed or your spending limit needs to be increased,"
# zero steps executed. The owner's call: stop depending on Actions tonight and run CI
# locally instead. This script is that local runner.
#
# ## What it runs, and in what order
#
# Default (no flags): the `build-and-test` job's 8 BLOCKING gates, same order as
# ci.yml, each one run even if an earlier one failed -- see `run_gate` below. That
# mirrors the "report every gate in one run" behavior ci.yml's own Gate summary step
# got in commit a4331961, for the same reason: GitHub (and a plain `&&` chain) halts
# at the first failure, so a run reports exactly one problem even when several exist.
#
#   typecheck (root) -> check:boundaries -> check:architecture -> check:inventory ->
#   check:src-complexity-drift -> complexity (eslint) -> typecheck (admin) -> admin:build
#
# `--with-tests` additionally runs `npm run test:ci` (the full repo-wide suite) --
# SEE THE MEMORY WARNING BELOW before using this flag.
#
# `--route-coverage` additionally runs the `route-coverage` job's 5 gates, scoped to
# `src/server/**` (test:cov:server, test:cov:server:tiered, then the 3 real gates:
# check:route-coverage-floor, check:route-coverage-diff, check:route-test-baseline).
# check:route-coverage-diff needs a diff base to compare against -- it reads
# $ROUTE_COVERAGE_DIFF_BASE if set, else falls back to `origin/main` locally (there is
# no GITHUB_BASE_REF / GITHUB_EVENT_BEFORE outside Actions). See that script's own
# header for the full fallback chain.
#
# Non-blocking steps from ci.yml (the `test` step in build-and-test, `npm run lint`
# [Biome]) are deliberately NOT included here -- they're `continue-on-error: true` in
# the workflow and don't gate the job, so a local runner that's meant to answer "would
# this branch pass CI" doesn't need them either. `--with-tests` covers the same ground
# as that non-blocking `test` step, just opt-in and reported as a real gate here.
#
# ## Deliberately differs from ci.yml -- do not try to make this identical
#
# - **No Jini clone/build.** ci.yml clones AINSEP/Jini fresh and runs `pnpm -r run
#   build` because a GitHub runner starts with nothing on disk. Locally, the Jini
#   sibling at ../Jini is already checked out and already built -- rebuilding it here
#   would be slow and is not this script's job.
# - **No Postgres service container.** ci.yml spins up a throwaway `postgres:14`
#   Docker container. Locally, a real Postgres is expected to already be running (see
#   `reference_tovu_local_postgres`: `pg_ctl -D /usr/local/var/postgresql@14 start`,
#   socket at /tmp, role `la`, matching src/db/migration/pg-fixture.ts's own fallback
#   defaults). `--with-tests` checks for it with `pg_isready` and fails with an
#   actionable message instead of letting Postgres-dependent tests fail confusingly.
#   (`--route-coverage`'s tests are scoped to src/server/**, which ci.yml's own header
#   notes needs no psql/pg-fixture/PGHOST, so no Postgres check runs for that flag.)
#
# ## MEMORY WARNING -- read before using --with-tests
#
# The full local test suite is a memory bomb. `npm run test:cov:server` measured on
# this machine 2026-08-19: fanned out to one worker per CPU (13 workers) and hit
# 5.4 GB RAM, had to be killed, and orphaned 9 child processes that survived killing
# the parent. `TEST_CONCURRENCY=2` fixed it -- measured 0.42 GB the same night. Both
# `--with-tests` and `--route-coverage` below therefore default TEST_CONCURRENCY to 2
# unless the caller already set it. The npm scripts only apply the flag when the env
# var is set (`${TEST_CONCURRENCY:+--test-concurrency=$TEST_CONCURRENCY}`), so setting
# it here is load-bearing -- an unset TEST_CONCURRENCY silently reverts to full
# per-CPU fan-out.
#
# ## Dated baseline (2026-08-19, NOT a permanent fact -- re-check before citing)
#
# All 8 blocking gates PASS on general-work as of tonight. `npm run test:ci` (full
# repo-wide suite) had 75 failures across 23 files -- five other agents were actively
# fixing those at the time this script was written, so treat that count as stale; use
# `npm run check:test-baseline` / `check:route-test-baseline` to see what's genuinely
# new vs already-known debt.
#
# ## Usage
#   development/scripts/ci-local.sh                    # 8 fast gates only (default)
#   development/scripts/ci-local.sh --with-tests        # + full suite (npm run test:ci)
#   development/scripts/ci-local.sh --route-coverage    # + route-coverage job's 5 gates
#   development/scripts/ci-local.sh --with-tests --route-coverage   # everything
#
# Also wired as npm scripts: `npm run ci:local`, `ci:local:tests`, `ci:local:route-coverage`.
#
# No `set -e`: a failed gate must not stop the rest from running (that's the entire
# point -- see "report every gate in one run" above). `set -uo pipefail` still catches
# unset-variable typos and broken pipes without aborting on a gate's own non-zero exit.
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" || exit 1

WITH_TESTS=0
ROUTE_COVERAGE=0
for arg in "$@"; do
  case "$arg" in
    --with-tests) WITH_TESTS=1 ;;
    --route-coverage) ROUTE_COVERAGE=1 ;;
    -h|--help)
      cat <<'EOF'
Usage:
  development/scripts/ci-local.sh                    # 8 fast gates only (default)
  development/scripts/ci-local.sh --with-tests        # + full suite (npm run test:ci)
  development/scripts/ci-local.sh --route-coverage    # + route-coverage job's 5 gates
  development/scripts/ci-local.sh --with-tests --route-coverage   # everything

See this file's own header comment for what each mode runs, how it differs from
.github/workflows/ci.yml, and the TEST_CONCURRENCY memory warning for --with-tests.
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg (expected --with-tests and/or --route-coverage)" >&2
      exit 1
      ;;
  esac
done

RESULTS=()
run_gate() {
  local label="$1"; shift
  echo ""
  echo "=================================================================="
  echo ">>> GATE: $label"
  echo "=================================================================="
  if "$@"; then
    RESULTS+=("PASS  $label")
  else
    RESULTS+=("FAIL  $label")
  fi
}

# Fails the calling flag's block with a clear message instead of letting Postgres-
# dependent tests fail confusingly (see "Deliberately differs from ci.yml" above).
postgres_available() {
  command -v pg_isready >/dev/null 2>&1 && pg_isready -h "${PGHOST:-/tmp}" ${PGPORT:+-p "$PGPORT"} >/dev/null 2>&1
}

# --- build-and-test job: the 8 blocking gates, same order as ci.yml -------------
run_gate "typecheck (root)"            npm run typecheck
run_gate "check:boundaries"            npm run check:boundaries
run_gate "check:architecture"          npm run check:architecture
run_gate "check:inventory"             npm run check:inventory
run_gate "check:src-complexity-drift"  npm run check:src-complexity-drift
run_gate "complexity (eslint)"         npm run complexity
run_gate "typecheck (admin)"           npm --prefix apps/admin run typecheck
run_gate "admin:build"                 npm run admin:build

# --- optional: full test suite (memory-heavy -- see header) ---------------------
if [[ "$WITH_TESTS" -eq 1 ]]; then
  if ! postgres_available; then
    echo ""
    echo "=================================================================="
    echo ">>> GATE: test:ci (full suite)"
    echo "=================================================================="
    echo "FAIL: no local Postgres server detected (pg_isready against PGHOST=${PGHOST:-/tmp}${PGPORT:+:$PGPORT} failed)." >&2
    echo "src/db/__tests__/migration-manifest-postgres.test.ts is fail-closed against a real Postgres" >&2
    echo "server -- it does not skip when one is absent, it fails, and every downstream failure in" >&2
    echo "this run would be confusing noise rather than this one clear cause." >&2
    echo "Start one, e.g.: pg_ctl -D /usr/local/var/postgresql@14 start" >&2
    echo "Then re-run with --with-tests. Falls back to PGHOST=/tmp, PGUSER=la, no PGPORT -- same" >&2
    echo "defaults src/db/migration/pg-fixture.ts itself uses for local development." >&2
    RESULTS+=("FAIL  test:ci (full suite) -- no local Postgres detected")
  else
    export TEST_CONCURRENCY="${TEST_CONCURRENCY:-2}"
    echo ""
    echo "NOTE: TEST_CONCURRENCY=$TEST_CONCURRENCY. Full per-CPU fan-out hit 5.4 GB / 13 workers and" \
         "had to be killed on 2026-08-19 -- see this script's header before raising this."
    run_gate "test:ci (full suite)" npm run test:ci
  fi
fi

# --- optional: route-coverage job's 5 gates (src/server/** scoped) --------------
if [[ "$ROUTE_COVERAGE" -eq 1 ]]; then
  export TEST_CONCURRENCY="${TEST_CONCURRENCY:-2}"
  run_gate "test:cov:server"            npm run test:cov:server
  run_gate "test:cov:server:tiered"     npm run test:cov:server:tiered
  run_gate "check:route-coverage-floor" npm run check:route-coverage-floor
  run_gate "check:route-coverage-diff"  npm run check:route-coverage-diff
  run_gate "check:route-test-baseline"  npm run check:route-test-baseline
fi

echo ""
echo "=================================================================="
echo "GATE SUMMARY"
echo "=================================================================="
FAILED=0
for r in "${RESULTS[@]}"; do
  echo "  $r"
  [[ "$r" == FAIL* ]] && FAILED=1
done
exit $FAILED
