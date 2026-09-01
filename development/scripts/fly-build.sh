#!/usr/bin/env bash
# Runs `flyctl deploy` with this repo's own root as the build context, regardless of the
# caller's cwd. `@jini-ai/*` packages are consumed from the npm registry now, so the image
# builds from the Tovu checkout alone — this script no longer needs a sibling `Jini` checkout
# or any parent-directory context gymnastics (see `Dockerfile` and `fly.toml`'s own headers for
# that history). It exists only so "deploy" always resolves to the same directory rather than
# whatever the shell happens to be in.
#
# Usage:
#   development/scripts/fly-build.sh [extra flyctl flags...]
#   development/scripts/fly-build.sh --build-only --push --image-label mytag
#
# Requires:
#   - flyctl on PATH, authenticated (`flyctl auth login` or FLY_API_TOKEN)
#   - `Tovu/fly.toml` to exist (create it from `fly launch` or the checked-in
#     starting point before first use — see that file's own header)
#
# This script only ASSEMBLES and RUNS the flyctl command; it does not decide
# to deploy for you — that's still your call every time you invoke it.

set -euo pipefail

TOVU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [ ! -f "$TOVU_ROOT/fly.toml" ]; then
  echo "error: $TOVU_ROOT/fly.toml does not exist." >&2
  echo "  Create it (see the file's own header for the required [build] shape)" >&2
  echo "  before running this script." >&2
  exit 1
fi

if ! command -v flyctl >/dev/null 2>&1; then
  echo "error: flyctl is not on PATH. Install it: https://fly.io/docs/flyctl/install/" >&2
  exit 1
fi

echo "Build context: $TOVU_ROOT"

exec flyctl deploy "$TOVU_ROOT" "$@"
