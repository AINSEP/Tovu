#!/usr/bin/env bash
# `xcrun stapler validate`, retried. Each call looks the ticket up in Apple's CloudKit, and on the
# macos-15-intel runner that lookup dropped mid-request ("The network connection was lost.",
# exit 68) on two runs in a row for desktop-v0.1.14, right after `stapler staple` had itself
# validated the same file. A real missing or invalid ticket fails all three tries.
set -uo pipefail
for attempt in 1 2 3; do
  xcrun stapler validate "$1" && exit 0
  [ "$attempt" -lt 3 ] && { echo "stapler validate: attempt $attempt failed; retrying in 20s" >&2; sleep 20; }
done
exit 1
