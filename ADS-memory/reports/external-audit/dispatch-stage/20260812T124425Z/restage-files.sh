#!/usr/bin/env bash
# Rebuild the `files/` tree that `prompt-agy.txt` expects, for packet PKT-TOVU-20260812T124425Z.
#
# `agy` gets no repo access, so its prompt reads everything from `./files/` in its cwd. The original
# staging lived in a session scratchpad (session-scoped, gone on the next session). Rather than commit
# 300K of duplicated source, this script regenerates it from the packet's own tip commit.
#
# ANCHOR: 800bf20, NOT b658e1d. The packet's scope table lists b658e1d last, but 800bf20 (12:23) is
# seven minutes LATER than b658e1d (12:16) and is the actual tip of the audited range. Staging from
# b658e1d silently produces four wrong files (the site routes, pre-Cache-Control) — verified by diffing
# the original staged tree against both commits: 800bf20 -> 14/14 byte-identical, b658e1d -> 10/14.
#
# Usage:  bash ADS-memory/reports/external-audit/dispatch-stage/20260812T124425Z/restage-files.sh [DEST]
# DEST defaults to ./files under this script's directory.

set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${1:-$HERE/files}"
ANCHOR=800bf20

FILES=(
  apps/admin/src/App.hooks.tsx
  apps/admin/src/App.tsx
  apps/admin/src/features/comments/hooks/use-comment-settings.hooks.ts
  apps/admin/src/features/media/hooks/use-edit-media-panel.hooks.ts
  apps/admin/src/features/media/rules.ts
  apps/admin/src/lib/fetch-query/adapter.tanstack.tsx
  development/scripts/check-admin-complexity-drift.ts
  eslint.config.mjs
  src/server/http/site/render.ts
  src/server/routes/site/pages.ts
  src/server/routes/site/products.ts
  src/server/routes/site/robots.ts
  src/server/routes/site/sitemap.ts
  src/server/routes/site/store.ts
)

mkdir -p "$DEST"
cp "$REPO_ROOT/ADS-memory/reports/external-audit/packets/20260812T124425Z-audit-packet.md" \
   "$DEST/AUDIT-PACKET.md"

for f in "${FILES[@]}"; do
  mkdir -p "$DEST/$(dirname "$f")"
  git -C "$REPO_ROOT" show "$ANCHOR:$f" > "$DEST/$f"
done

echo "Staged ${#FILES[@]} source files + AUDIT-PACKET.md from $ANCHOR into $DEST"
echo "Test files are deliberately NOT staged — prompt-agy.txt tells the auditor to say so and lower"
echo "confidence rather than guess about a test it cannot read."
