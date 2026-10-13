#!/usr/bin/env bash
# `xcrun stapler <staple|validate> <file>`, retried. Both actions look the ticket up in Apple's
# CloudKit, and on the macos-15-intel runner that lookup dropped mid-request ("The network
# connection was lost.", exit 68) on every desktop-v0.1.14 run: validate after a successful
# staple (runs 38318460254 x2), then staple itself (38322482323, where validate passed on its
# third try). A real missing or invalid ticket fails all five tries.
set -uo pipefail
action="$1"; file="$2"
for attempt in 1 2 3 4 5; do
  # The real xcrun, not PATH's: xcrun-retry/xcrun execs this script for its stapler calls.
  /usr/bin/xcrun stapler "$action" "$file" && exit 0
  [ "$attempt" -lt 5 ] && { echo "stapler $action: attempt $attempt failed; retrying in 30s" >&2; sleep 30; }
done
exit 1
