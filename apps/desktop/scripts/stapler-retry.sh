#!/usr/bin/env bash
# `xcrun stapler <staple|validate> <file>`, retried. Both actions look the ticket up in Apple's
# CloudKit, and on the macos-15-intel runner that lookup dropped mid-request ("The network
# connection was lost.", exit 68) on every desktop-v0.1.14 run: validate after a successful
# staple (runs 38318460254 x2), then staple itself (38322482323, where validate passed on its
# third try). A real missing or invalid ticket fails all five tries.
#
# STAPLER_CLOUDKIT_SOFT=1 (the mac-x64 release row only): if all five tries fail and EVERY one
# failed with the CloudKit network drop (NSURLErrorDomain Code=-1005), warn loudly, record
# "<action> <file>" in $RUNNER_TEMP/stapler-cloudkit-degraded.txt and exit 0. From 2026-10-12
# the macos-15-intel pool could not hold a connection to api.apple-cloudkit.com
# (actions/runner-images#14924); desktop-v0.1.15 run 38457905825 failed all five validates that
# way after Apple had accepted the notarization. Stapling only embeds Apple's ticket for offline
# Gatekeeper checks; the notarization verdict is checked separately and stays mandatory, and the
# recorded files are stapled + validated on a Mac with working CloudKit before the draft.
# A validate of a file whose staple was skipped that way finds no ticket and is skipped too
# (matched by file name: the zip check validates a re-extracted copy of the same Tovu.app).
# Any other failure (no ticket after a real staple, invalid ticket, ...) still exits 1.
set -uo pipefail
action="$1"; file="$2"
list="${RUNNER_TEMP:-/tmp}/stapler-cloudkit-degraded.txt"
skipped_staple=0
grep -qE "^staple (.*/)?$(basename "$file" | sed 's/[.[\*^$]/\\&/g')\$" "$list" 2>/dev/null && skipped_staple=1
network_only=1; no_ticket=0
for attempt in 1 2 3 4 5; do
  # The real xcrun, not PATH's: xcrun-retry/xcrun execs this script for its stapler calls.
  out="$(/usr/bin/xcrun stapler "$action" "$file" 2>&1)"; code=$?; echo "$out"
  [ "$code" -eq 0 ] && exit 0
  if [ "$action" = validate ] && [ "$skipped_staple" = 1 ] && grep -q "does not have a ticket stapled" <<<"$out"; then
    no_ticket=1; break
  fi
  grep -q "NSURLErrorDomain Code=-1005" <<<"$out" || network_only=0
  [ "$attempt" -lt 5 ] && { echo "stapler $action: attempt $attempt failed; retrying in 30s" >&2; sleep 30; }
done
if [ "${STAPLER_CLOUDKIT_SOFT:-}" = 1 ] && { [ "$network_only" = 1 ] || [ "$no_ticket" = 1 ]; }; then
  echo "::warning title=stapler $action skipped (CloudKit unreachable)::$file: Apple's CloudKit could not be reached (-1005). Staple + validate it locally before the draft."
  echo "$action $file" >> "$list"
  exit 0
fi
exit 1
