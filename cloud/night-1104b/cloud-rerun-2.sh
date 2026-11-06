#!/usr/bin/env bash
# Job N: all L-rerun sections, B9, B2b and Part 3 regression tests.
# CLOUD ONLY. Prerequisites: Node 24, pnpm 10, installed dependencies in both
# disposable repositories and Tovu's admin/site-chat/desktop consumers. No installs,
# servers, Electron, packaging, git writes or production deployment in this script.
# Usage: CI=true TOVU_REPO=/home/user/Tovu JINI_REPO=/home/user/Jini bash cloud-rerun-2.sh
set -uo pipefail
[[ "${CI:-}" == true && "$(uname -s)" == Linux ]] || { echo 'Use a disposable Linux cloud runner with CI=true.' >&2; exit 2; }
TOVU_REPO=${TOVU_REPO:-/home/user/Tovu}
JINI_REPO=${JINI_REPO:-/home/user/Jini}
PNPM_BIN=${PNPM_BIN:-pnpm}
case "$TOVU_REPO:$JINI_REPO" in *'/Users/'*) echo 'Refusing local owner checkouts.' >&2; exit 2;; esac
failed=0
run() {
  local section=$1 directory=$2
  shift 2
  printf '\n%s\n' "$section"
  if (cd "$directory" && "$@"); then
    printf 'PASS %s\n' "$section"
  else
    local result=$?
    printf 'FAIL %s (exit %s)\n' "$section" "$result" >&2
    failed=1
    return "$result"
  fi
}

# Never exercise stale registry artifacts. Core's new declarations must exist
# before dependent packages build; refresh all other Jini workspace outputs next.
run node-24 "$JINI_REPO" node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) throw Error("Node 24 is required")' || exit 1
run build-jini-core "$JINI_REPO" "$PNPM_BIN" --filter @jini-ai/core run build || exit 1
run build-jini-dependents "$JINI_REPO" "$PNPM_BIN" -r --if-present --filter '@jini-ai/*' --filter '!@jini-ai/core' run build || exit 1
# Existing host linker covers root, admin, site-chat and desktop. Product patterns
# live in @tovu/contracts, so refresh that workspace AFTER the Jini link.
run link-jini "$TOVU_REPO" env JINI_PACKAGES_DIR="$JINI_REPO/packages" node development/scripts/link-jini.mjs || exit 1
run build-tovu-contracts "$TOVU_REPO" npm --prefix packages/contracts run build || exit 1

run jini-core "$JINI_REPO/packages/core" npx --no-install vitest run --maxWorkers=2 \
  src/__tests__/redact.characterization.test.ts \
  src/__tests__/redact.gap-audit.test.ts \
  src/__tests__/redact.test.ts \
  src/user-facing-error.test.ts || true
run jini-ui "$JINI_REPO/packages/ui" npx --no-install vitest run --maxWorkers=2 \
  src/features/panel-kit/__tests__/ErrorNotice.test.tsx || true
run jini-http-kit "$JINI_REPO/packages/http-kit" npx --no-install vitest run --maxWorkers=2 \
  src/__tests__/adapter.test.ts src/__tests__/adapter-pins.test.ts || true
run jini-owner-recovery "$JINI_REPO/packages/user-management" npx --no-install vitest run --maxWorkers=2 \
  src/server/__tests__/recovery-codes.test.ts src/server/__tests__/owner-reset-input.test.ts || true
run jini-vercel-node "$JINI_REPO" node --test --test-timeout=60000 --test-concurrency=2 \
  packages/agent-plugins/vercel/__tests__/vercel.test.mjs || true
run jini-eslint-complexity "$JINI_REPO" npx --no-install eslint \
  packages/agent-plugins/vercel/targets/vercel.mjs \
  packages/devops/src/deploy/publish-jobs.ts \
  packages/core/src/redact.ts packages/http-kit/src/adapter.ts \
  packages/user-management/src/server/recovery-codes.ts \
  packages/user-management/src/server/owner-reset-input.ts \
  packages/ui/src/features/panel-kit/ErrorNotice.tsx --rule 'complexity: [error, 10]' || true

# L's original website list plus B9, B2b and new direct regressions, deduplicated.
errors_http=apps/website/src/server/inbound/admin-http
run tovu-website "$TOVU_REPO" env TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json \
  node --import tsx --import ./development/test-support/composed-bundle-env.ts \
  --experimental-test-module-mocks --test --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/__tests__/index-boot.characterization.test.ts \
  apps/website/src/assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts \
  apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts \
  apps/website/src/assistant/__tests__/mcp-ui-tool-calls.test.ts \
  apps/website/src/assistant/__tests__/tool-metadata-projections.test.ts \
  apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-families.test.ts \
  apps/website/src/assistant/__tests__/tool-registrations.plugins.test.ts \
  apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts \
  apps/website/src/features/agent-plugins/__tests__/unit/apply-connect-defaults.unit.test.ts \
  apps/website/src/features/agent-plugins/__tests__/unit/enable-access.regression.test.ts \
  apps/website/src/features/agent-plugins/__tests__/unit/grant-signed-in-defaults.unit.test.ts \
  apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts \
  apps/website/src/features/deployments/static-publish/__tests__/adapter.unit.test.ts \
  apps/website/src/features/external-mcp/__tests__/external-mcp-connection-revocation.test.ts \
  apps/website/src/features/external-mcp/__tests__/external-mcp-oauth.test.ts \
  apps/website/src/features/external-mcp/__tests__/external-mcp-store.memory.unit.test.ts \
  apps/website/src/features/newsletter/__tests__/repo.dialects.test.ts \
  apps/website/src/features/site-backup/__tests__/sources.unit.test.ts \
  apps/website/src/features/site-backup/__tests__/share-backend.unit.test.ts \
  apps/website/src/features/site-backup/__tests__/share.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts \
  apps/website/src/features/identity/__tests__/recovery-codes.repo.dialects.test.ts \
  apps/website/src/features/identity/__tests__/owner-reset-env.test.ts \
  apps/website/src/cli/__tests__/unit/reset-owner.unit.test.ts \
  apps/website/src/platform/db/migrations/__tests__/owner-recovery-codes-step.test.ts \
  apps/website/src/platform/db/migrations/__tests__/checksums.test.ts \
  apps/website/src/platform/db/__tests__/schema-migration-drift.test.ts \
  apps/website/src/platform/db/kernel/__tests__/database-types.test.ts \
  apps/website/src/platform/db/__tests__/schema-postgres-parity.test.ts \
  apps/website/src/platform/db/__tests__/schema-postgres-drift.test.ts \
  "$errors_http"/__tests__/owner-recovery-routes.test.ts \
  "$errors_http"/http/__tests__/ranked-user-facing-errors.test.ts \
  "$errors_http"/http/__tests__/unexpected-route-errors.test.ts \
  "$errors_http"/routes/system/__tests__/site-share-failures.test.ts \
  "$errors_http"/routes/system/__tests__/user-facing-failure.test.ts \
  "$errors_http"/routes/pages/__tests__/pages-route-gaps.test.ts \
  "$errors_http"/routes/posts/__tests__/update.test.ts \
  "$errors_http"/routes/settings/__tests__/shared.unit.test.ts \
  "$errors_http"/routes/settings/__tests__/json-route-parity.unit.test.ts \
  "$errors_http"/routes/media/__tests__/upload-concurrent.test.ts \
  "$errors_http"/routes/media/__tests__/replace.test.ts \
  "$errors_http"/routes/publish-content/__tests__/import-errors.test.ts || true

run tovu-admin "$TOVU_REPO/apps/admin" npx --no-install vitest run --maxWorkers=2 \
  src/lib/__tests__/api-user-facing-fallback.unit.test.ts \
  src/lib/__tests__/api-describe-error.unit.test.ts \
  src/lib/__tests__/api-request-onok-and-null-body.unit.test.ts \
  src/lib/__tests__/api-request-unreachable.unit.test.ts \
  src/components/AssistantDock/__tests__/AgentFailureCard.unit.test.tsx \
  src/components/AssistantDock/__tests__/agent-failure.unit.test.ts \
  src/components/AssistantDock/__tests__/agent-failure-transport.unit.test.ts \
  src/features/sites/__tests__/SiteExportTab.static.unit.test.tsx \
  src/features/sites/__tests__/site-export-error.unit.test.ts \
  src/features/deployment/hooks/__tests__/use-static-publish.unit.test.tsx \
  src/features/security/__tests__/RecoveryCodesCard.unit.test.tsx \
  src/features/auth/__tests__/OwnerRecoverySignIn.unit.test.tsx \
  src/features/security/__tests__/Security.unit.test.tsx \
  src/features/auth/__tests__/Login.unit.test.tsx || true

run tovu-desktop-auth "$TOVU_REPO" node --import tsx \
  --test --test-timeout=60000 --test-concurrency=2 \
  apps/desktop/src/desktop-auth.test.ts \
  apps/desktop/src/desktop-reported-regressions.test.ts || true
run tovu-eslint-complexity "$TOVU_REPO" npx --no-install eslint \
  packages/contracts/src/secret-redaction.ts apps/admin/src/lib/api.ts \
  apps/admin/src/lib/owner-recovery-api.ts \
  apps/admin/src/components/AssistantDock/AgentFailureCard.tsx \
  apps/admin/src/features/auth/OwnerRecoverySignIn.tsx \
  apps/admin/src/features/security/RecoveryCodesCard.tsx \
  apps/website/src/features/site-backup/share-backend.ts \
  apps/website/src/server/inbound/admin-http/owner-recovery-routes.ts \
  apps/website/src/features/identity/owner-reset-env.ts \
  apps/website/src/features/identity/recovery-codes.repo.ts \
  --rule 'complexity: [error, 10]' || true
run tovu-desktop-complexity "$TOVU_REPO" npx --no-install eslint \
  apps/desktop/src/desktop-auth.ts --rule 'complexity: [error, 9]' || true

run tovu-eslint-rule-tests "$TOVU_REPO" node --import tsx \
  --test --test-timeout=60000 --test-concurrency=2 \
  development/scripts/__tests__/desktop-assistant-release-gate.unit.test.ts || true
run K1-dev-scripts "$TOVU_REPO" node --test --test-timeout=60000 --test-concurrency=2 \
  development/scripts/__tests__/dev-sites-home.test.mjs || true
run K1-platform-regression "$JINI_REPO/packages/platform" npx --no-install vitest run --maxWorkers=2 \
  src/fs/__tests__/directory-user-config.test.ts || true
run backfill-cli-discovery "$TOVU_REPO" node --import tsx \
  --import ./development/test-support/composed-bundle-env.ts --experimental-test-module-mocks \
  --test --test-timeout=60000 --test-concurrency=2 \
  development/scripts/__tests__/backfill-db-path.test.ts || true
# L's full host typechecks are cloud-only. These commands were NOT run locally.
run tsc-website-root-tsconfig "$TOVU_REPO" npx --no-install tsc --noEmit -p tsconfig.json || true
run tsc-desktop-main "$TOVU_REPO" npx --no-install tsc --noEmit -p apps/desktop/tsconfig.main.json || true
exit "$failed"
