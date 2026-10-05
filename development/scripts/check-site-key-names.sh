#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
LIST=$(mktemp); HITS=$(mktemp); trap 'rm -f "$LIST" "$HITS"' EXIT
# Match the binding plan's scan set. Unstaged deletions are absent source, not scan errors.
git ls-files -co --exclude-standard -z -- . \
  ':!ADS-memory/reports' ':!ADS-memory/sessions' ':!ADS-memory/.local-artifacts' ':!AI-Dev-Shop' \
  ':!**/node_modules/**' ':!**/dist/**' ':!sites/*/agent-plugins/**' ':!.claude/harness-tmp/**' \
  ':!development/HANDOFF-session-*' \
  | while IFS= read -r -d '' file; do if [ -f "$file" ]; then printf '%s\0' "$file"; fi; done > "$LIST"
N=$(tr -cd '\0' < "$LIST" | wc -c | tr -d ' '); echo "files scanned: $N"; [ "$N" -gt 1000 ] || { echo "scan set too small"; exit 2; }
# Adjacent shell quotes keep the guard's own source from matching its forbidden vocabulary.
xargs -0 grep -nIiE 'root[ _-]?key|root''key|site[ _-]?token|site''token|integrations[ _-]root|INTEGRATIONS_''ROOT|master (secret|key)|encryption mas''ter' < "$LIST" \
  | grep -v 'static-site-''token' | grep -v 'ANALYTICS_ROOT_''KEY_SEED' | grep -vE 'site-key-(legacy|frozen):' > "$HITS" || true
C=$(wc -l < "$HITS" | tr -d ' '); echo "old-name hits: $C"; [ "$C" -eq 0 ] || { head -50 "$HITS"; exit 1; }
# A no-match grep is a valid zero count; normalize only that status (rc 1) so pipefail does not
# exit silently before the count diagnostics. Actual grep errors (rc 2) still fail the pipeline.
grep_ok() { xargs -0 sh -c 'grep "$@"; rc=$?; [ "$rc" -eq 0 ] || [ "$rc" -eq 1 ]' sh "$@" < "$LIST"; }
count_marker() { grep_ok -hIc "$1" | paste -sd+ - | bc; }
# Frozen: 4 lines whose bytes are the HKDF extraction salt (keyring.env.ts, keyring.memory.ts, the
# keyring.env.test.ts known-answer doc line, and the sealing-wire-format pinned test's independent
# derivation). The plan said 3; the pinned test needs the literal to stay an independent check.
F=$(count_marker 'site-key-''frozen:'); echo "frozen: $F"; [ "$F" -eq 4 ] || { echo "frozen=$F want 4"; exit 1; }
L=$(count_marker 'site-key-''legacy:'); echo "legacy: $L"; [ "$L" -eq "${SITE_KEY_LEGACY_EXPECTED:-16}" ] || { echo "legacy=$L"; exit 1; }
P=$(grep_ok -lI "TOVU_SITE_KEY" | wc -l | tr -d ' '); [ "$P" -gt 0 ] || { echo "positive control failed"; exit 1; }
echo OK
