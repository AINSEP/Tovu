#!/usr/bin/env bash
# Runs `flyctl deploy` with this repo's own root as the build context, regardless of the
# caller's cwd. `@jini-ai/*` packages are consumed from the npm registry now, so the image
# builds from the Tovu checkout alone — this script no longer needs a sibling `Jini` checkout
# or any parent-directory context gymnastics (see `Dockerfile` and `.github/workflows/fly-deploy.yml`'s headers for
# that history). It exists only so "deploy" always resolves to the same directory rather than
# whatever the shell happens to be in.
#
# Usage:
#   content/agent-plugins/fly/scripts/fly-build.sh [extra flyctl flags...]
#   content/agent-plugins/fly/scripts/fly-build.sh --build-only --push --image-label mytag
#
# Requires:
#   - flyctl on PATH, authenticated (`flyctl auth login` or FLY_API_TOKEN)
#   - a generated `Tovu/fly.toml`: run `tovu deploy config --target fly --region <region>
#     --out fly.toml` first, then review deployment-specific env/build args. The Fly plugin
#     owns the renderer and references/fly.template.toml; no root config is checked in.
#
# This script only ASSEMBLES and RUNS the flyctl command; it does not decide
# to deploy for you — that's still your call every time you invoke it.
#
# Lives in the Fly agent plugin (owner rule: vendor scripts stay out of core), four directories
# below the Tovu repo root it deploys; TOVU_ROOT below walks back up to it.

set -euo pipefail

TOVU_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

if [ ! -f "$TOVU_ROOT/fly.toml" ]; then
  echo "error: $TOVU_ROOT/fly.toml does not exist." >&2
  echo "  Generate it: tovu deploy config --target fly --region <region> --out fly.toml" >&2
  echo "  before running this script." >&2
  exit 1
fi

if ! command -v flyctl >/dev/null 2>&1; then
  echo "error: flyctl is not on PATH. Install it: https://fly.io/docs/flyctl/install/" >&2
  exit 1
fi

echo "Build context: $TOVU_ROOT"

exec flyctl deploy "$TOVU_ROOT" "$@"
