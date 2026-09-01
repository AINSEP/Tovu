#!/usr/bin/env bash
# Run a local SonarQube scan of Tovu against a SonarQube server already running (see README.md —
# `docker compose -f development/sonarqube/docker-compose.yml up -d`, a step this script does NOT
# take for you).
#
# This script does not start Docker, does not start SonarQube, and does not install anything. It
# only: optionally regenerates coverage, rewrites apps/admin's lcov paths so Sonar can find them,
# and runs the scanner container against a server you already started.
#
# Usage:
#   SONAR_TOKEN=<token> development/sonarqube/scan.sh              # scan with whatever coverage exists
#   SONAR_TOKEN=<token> development/sonarqube/scan.sh --with-coverage   # regenerate coverage first
#
# Env vars:
#   SONAR_TOKEN   required. Generate one in the SonarQube UI: My Account > Security > Generate Token.
#   SONAR_HOST_URL  optional. Defaults to http://host.docker.internal:9000, which is how a
#                   container reaches a docker-compose service published on the Mac host's port
#                   9000. On Linux, the scanner container can instead join the host network
#                   (`docker run --network=host ...`) — see README.md's Linux note.
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [[ -z "${SONAR_TOKEN:-}" ]]; then
  echo "SONAR_TOKEN is not set." >&2
  echo "Generate one at http://localhost:9000 (My Account > Security > Generate Token) and re-run:" >&2
  echo "  SONAR_TOKEN=<token> development/sonarqube/scan.sh" >&2
  exit 1
fi

SONAR_HOST_URL="${SONAR_HOST_URL:-http://host.docker.internal:9000}"

if [[ "${1:-}" == "--with-coverage" ]]; then
  echo "Regenerating coverage (npm run test:cov)…"
  npm run test:cov
  echo "Regenerating apps/admin coverage (npm --prefix apps/admin run test:cov)…"
  npm --prefix apps/admin run test:cov
fi

ROOT_LCOV="development/coverage/lcov.info"
ADMIN_LCOV_SRC="apps/admin/coverage/lcov.info"
ADMIN_LCOV_OUT="development/sonarqube/.generated/admin-lcov.info"

mkdir -p development/sonarqube/.generated

if [[ -f "$ROOT_LCOV" ]]; then
  age_hours=$(( ( $(date +%s) - $(stat -f %m "$ROOT_LCOV" 2>/dev/null || stat -c %Y "$ROOT_LCOV") ) / 3600 ))
  if (( age_hours > 24 )); then
    echo "WARNING: $ROOT_LCOV is ${age_hours}h old. Coverage numbers in this scan will not reflect" >&2
    echo "         current code. Re-run with --with-coverage, or run 'npm run test:cov' yourself." >&2
  fi
else
  echo "WARNING: $ROOT_LCOV does not exist yet. Run 'npm run test:cov' first, or pass --with-coverage." >&2
fi

# apps/admin's lcov uses SF: paths relative to apps/admin/ (e.g. `src/features/...`) because
# vitest runs from that directory. This scan is rooted at the repo root, so those paths need the
# `apps/admin/` prefix restored before Sonar can resolve them — see sonar-project.properties'
# comment on sonar.javascript.lcov.reportPaths for the full explanation. Never edit
# apps/admin/coverage/lcov.info in place; always regenerate the copy.
if [[ -f "$ADMIN_LCOV_SRC" ]]; then
  sed 's#^SF:#SF:apps/admin/#' "$ADMIN_LCOV_SRC" > "$ADMIN_LCOV_OUT"
else
  echo "NOTE: $ADMIN_LCOV_SRC not found — writing an empty placeholder so the scan doesn't fail" >&2
  echo "      on a missing report path. Run 'npm --prefix apps/admin run test:cov' for real admin coverage." >&2
  : > "$ADMIN_LCOV_OUT"
fi

echo "Scanning with sonar.host.url=$SONAR_HOST_URL …"
docker run --rm \
  -e SONAR_HOST_URL="$SONAR_HOST_URL" \
  -e SONAR_TOKEN="$SONAR_TOKEN" \
  -v "$REPO_ROOT:/usr/src" \
  sonarsource/sonar-scanner-cli \
  -Dproject.settings=development/sonarqube/sonar-project.properties \
  -Dsonar.qualitygate.wait=false
