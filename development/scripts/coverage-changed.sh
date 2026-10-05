#!/bin/bash
# Logic lives in the TS adapter. No installs, pipes, timeout utility or shared coverage paths.
set -eu
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
exec node --import "$SCRIPT_DIR/../../node_modules/tsx/dist/loader.mjs" "$SCRIPT_DIR/coverage-changed.ts" "$@"
