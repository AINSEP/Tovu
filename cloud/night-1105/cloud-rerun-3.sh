#!/usr/bin/env bash
# Job F: cloud verify 3. Prepared only; no commands in this script ran locally.
# Disposable Linux CI only. Node 24, pnpm 10, installed dependencies and an isolated
# PostgreSQL service (PGHOST/PGUSER/PGPORT/PGPASSWORD) must already be available.
# Builds/links refresh source artifacts; no installs, git writes, application servers,
# Electron, packaging, publication or deployment. Never point PGHOST at production.
# Usage: CI=true TOVU_REPO=/home/user/Tovu JINI_REPO=/home/user/Jini bash cloud-rerun-3.sh
# Each section runs once, sequentially, bounded to 900 seconds. Complete stdout/stderr
# go to one log per section; console shows at most 20 x 600 characters per failure.
set -uo pipefail
[[ "${CI:-}" == true && "$(uname -s)" == Linux ]] || { echo 'Use a disposable Linux cloud runner with CI=true.' >&2; exit 2; }
TOVU_REPO=${TOVU_REPO:-/home/user/Tovu}
JINI_REPO=${JINI_REPO:-/home/user/Jini}
PNPM_BIN=${PNPM_BIN:-pnpm}
TOVU_REPO=$(cd "$TOVU_REPO" && pwd -P) || exit 2
JINI_REPO=$(cd "$JINI_REPO" && pwd -P) || exit 2
ARTIFACT_DIR=${ARTIFACT_DIR:-${TMPDIR:-/tmp}/cloud-rerun-3}
case "$TOVU_REPO:$JINI_REPO:$ARTIFACT_DIR" in *'/Users/'*) echo 'Refusing local owner checkouts/artifacts.' >&2; exit 2;; esac
mkdir -p "$ARTIFACT_DIR" || exit 2
ARTIFACT_DIR=$(cd "$ARTIFACT_DIR" && pwd -P) || exit 2
case "$ARTIFACT_DIR" in /Users/*) echo 'Refusing owner artifacts.' >&2; exit 2;; esac
export PGHOST=${PGHOST:-127.0.0.1} PGUSER=${PGUSER:-postgres} PGPORT=${PGPORT:-5432} PGCONNECT_TIMEOUT=5
failed=0
printf 'section\texit\tlog\n' > "$ARTIFACT_DIR/results.tsv"
printf '# Exact commands executed by cloud-rerun-3.sh\n' > "$ARTIFACT_DIR/commands.sh"
run() {
  local section=$1 directory=$2
  shift 2
  local log="$ARTIFACT_DIR/$section.txt" result=0
  printf '\nRUN %s\n' "$section"
  { printf '(cd %q && ' "$directory"; printf '%q ' "$@"; printf ')\n'; } >> "$ARTIFACT_DIR/commands.sh"
  if (cd "$directory" && timeout --kill-after=10s 900s "$@") > "$log" 2>&1; then
    printf 'PASS %s\n' "$section"
  else
    result=$?
    failed=1
    printf 'FAIL %s (exit %s); log: %s\n' "$section" "$result" "$log" >&2
    tail -n 20 "$log" | cut -c 1-600 >&2
  fi
  printf '%s\t%s\t%s\n' "$section" "$result" "$log" >> "$ARTIFACT_DIR/results.tsv"
  return "$result"
}

# Check the actual npm artifacts BEFORE linking the source checkout. Linked test passes
# cannot close B14-2/B13-3: release integration still needs new npm versions and lockfiles.
run release-land-gates "$TOVU_REPO" node --input-type=module -e '
const checks = [["@jini-ai/cms/media", ["replaceMediaFile", "mediaReplacementMetadata", "mediaFileReplacementRecord"]],
  ["@jini-ai/agent-plugins/lifecycle", ["classifyBundledPluginFile"]]];
const { readFileSync } = await import("node:fs");
const { createRequire } = await import("node:module");
const { dirname, join } = await import("node:path");
const semver = createRequire(import.meta.url)("semver");
let missing = false;
for (const manifest of ["package.json", "apps/admin/package.json"]) {
  const directory = dirname(manifest);
  const declared = JSON.parse(readFileSync(manifest, "utf8"));
  const locked = JSON.parse(readFileSync(join(directory, "package-lock.json"), "utf8"));
  for (const name of ["@jini-ai/cms", "@jini-ai/agent-plugins"]) {
    const range = declared.dependencies?.[name];
    const floor = semver.minVersion(range ?? "");
    const version = JSON.parse(readFileSync(join(directory, "node_modules", name, "package.json"), "utf8")).version;
    const lockVersion = locked.packages?.[`node_modules/${name}`]?.version;
    if (!floor || semver.lte(floor, "0.6.19") || !semver.valid(version) || semver.lte(version, "0.6.19") ||
        !semver.satisfies(version, range) || lockVersion !== version || locked.packages?.[""]?.dependencies?.[name] !== range) {
      console.error(`${manifest}: ${name} still permits an old or mismatched artifact; publish the new exports, raise the dependency floor above 0.6.19 and regenerate its lockfile.`);
      missing = true;
    }
  }
}
for (const [name, exports] of checks) {
  try { const loaded = await import(name); for (const key of exports) {
    if (typeof loaded[key] !== "function") { console.error(`${name} is missing ${key}; publish the Jini change and update Tovu dependency/lockfiles before landing.`); missing = true; }
  } } catch { console.error(`${name} could not load; install the matching released Jini artifact before landing.`); missing = true; }
}
process.exitCode = missing ? 1 : 0;
' || true

# Never exercise stale registry artifacts. Core's new declarations must exist
# before dependent packages build; refresh all other Jini workspace outputs next.
run node-24 "$JINI_REPO" node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) throw Error("Node 24 is required")' || exit 1
run build-jini-core "$JINI_REPO" "$PNPM_BIN" --filter @jini-ai/core run build || exit 1
run build-jini-dependents "$JINI_REPO" "$PNPM_BIN" -r --if-present --filter '@jini-ai/*' --filter '!@jini-ai/core' run build || exit 1
# Existing host linker covers root, admin, site-chat and desktop. Product patterns
# live in @tovu/contracts, so refresh that workspace AFTER the Jini link.
run link-jini "$TOVU_REPO" env JINI_PACKAGES_DIR="$JINI_REPO/packages" node development/scripts/link-jini.mjs || exit 1
run build-tovu-contracts "$TOVU_REPO" npm --prefix packages/contracts run build || exit 1
run build-desktop-preload "$TOVU_REPO/apps/desktop" npm run build:preload || exit 1

run jini-core "$JINI_REPO/packages/core" npx --no-install vitest run --maxWorkers=2 --minWorkers=1 \
  src/__tests__/redact.characterization.test.ts \
  src/__tests__/redact.gap-audit.test.ts \
  src/__tests__/redact.test.ts \
  src/user-facing-error.test.ts || true
run jini-ui "$JINI_REPO/packages/ui" npx --no-install vitest run --maxWorkers=2 --minWorkers=1 \
  src/features/panel-kit/__tests__/ErrorNotice.test.tsx || true
run jini-http-kit "$JINI_REPO/packages/http-kit" npx --no-install vitest run --maxWorkers=2 --minWorkers=1 \
  src/__tests__/adapter.test.ts src/__tests__/adapter-pins.test.ts || true
run jini-owner-recovery "$JINI_REPO/packages/user-management" npx --no-install vitest run --maxWorkers=2 --minWorkers=1 \
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
run K1-platform-regression "$JINI_REPO/packages/platform" npx --no-install vitest run --maxWorkers=2 --minWorkers=1 \
  src/fs/__tests__/directory-user-config.test.ts || true
run backfill-cli-discovery "$TOVU_REPO" node --import tsx \
  --import ./development/test-support/composed-bundle-env.ts --experimental-test-module-mocks \
  --test --test-timeout=60000 --test-concurrency=2 \
  development/scripts/__tests__/backfill-db-path.test.ts || true
# L's full host typechecks are cloud-only. These commands were NOT run locally.
run tsc-root "$TOVU_REPO" npx --no-install tsc --noEmit -p tsconfig.json || true
run tsc-desktop-main "$TOVU_REPO" npx --no-install tsc --noEmit -p apps/desktop/tsconfig.main.json || true


run O-tovu-website-keys "$TOVU_REPO" env TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/features/project-keys/__tests__/attached-vault.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/reference-only.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/tools.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/site-reference.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/site-sealer.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/create-abort.unit.test.ts \
  apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts \
  apps/website/src/features/custom-credentials/__tests__/set-token-agent-tool.unit.test.ts \
  apps/website/src/features/custom-credentials/__tests__/credential-copy-tool.test.ts \
  apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts \
  apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts \
  apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts \
  apps/website/src/features/vendor-credentials/__tests__/index.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/provider-config-source.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/provider-key-reference-only.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/deps-project-credentials.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/owner-store-location.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/project-store.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-saved-keys.integration.test.ts \
  apps/website/src/cli/__tests__/integration/owner-store.integration.test.ts \
  apps/website/src/server/inbound/admin-http/routes/system/__tests__/custom-credentials-inventory.unit.test.ts \
  apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-share-password.integration.test.ts \
  apps/website/src/features/site-backup/__tests__/saved-keys.test.ts \
  apps/website/src/features/site-backup/__tests__/owner-keys-excluded.unit.test.ts \
  apps/website/src/features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts || true

run O-desktop-ipc "$TOVU_REPO/apps/desktop" node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-timeout=60000 --test-concurrency=2 \
  src/owner-store-ipc.test.ts src/owner-store-cli.test.ts src/preload/preload.test.ts || true

run O-desktop-renderer "$TOVU_REPO/apps/desktop" node --import tsx --test --test-timeout=60000 --test-concurrency=2 \
  src/renderer/SharedKeys.render.test.ts src/renderer/SharedKeys.hooks.test.ts || true

run O-tovu-website-forms "$TOVU_REPO" env TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/features/forms/__tests__/form-file-purge.test.ts \
  apps/website/src/features/forms/__tests__/form-destination-manifest.test.ts \
  apps/website/src/features/site-export/__tests__/download-forms-privacy.test.ts \
  apps/website/src/features/site-export/__tests__/static-copy-policy.unit.test.ts \
  apps/website/src/server/inbound/public-http/routes/site/__tests__/forms-admission.test.ts \
  apps/website/src/server/inbound/admin-http/routes/forms/__tests__/forms-route-failures.unit.test.ts \
  apps/website/src/platform/db/repos/__tests__/form-delivery-repo.dialects.test.ts || true

run O-jini-cf-forms "$JINI_REPO" node --test --test-timeout=60000 --test-concurrency=2 \
  packages/agent-plugins/cloudflare/worker/__tests__/forms-urgent.test.mjs \
  packages/agent-plugins/cloudflare/worker/__tests__/forms-receiver.test.mjs \
  packages/agent-plugins/cloudflare/worker/__tests__/forms-receiver-edges.test.mjs \
  packages/agent-plugins/cloudflare/lib/__tests__/forms.test.mjs \
  packages/agent-plugins/cloudflare/lib/__tests__/forms-edges.test.mjs \
  packages/agent-plugins/cloudflare/targets/__tests__/forms-publish.test.mjs || true

run O-jini-cms "$JINI_REPO/packages/cms" npx --no-install vitest run --maxWorkers=2 --minWorkers=1 --testTimeout=60000 \
  src/forms/__tests__/attachment-purge.test.ts \
  src/forms/__tests__/request-admission.test.ts \
  src/forms/__tests__/attachment-cleanup.test.ts \
  src/media/__tests__/list-page-w2g.unit.test.ts || true

run O-jini-admin "$JINI_REPO/packages/admin" npx --no-install vitest run --maxWorkers=2 --minWorkers=1 --testTimeout=60000 \
  src/forms/react/__tests__/submissions-states.unit.test.tsx || true

run jini-gateway-regression "$JINI_REPO" node --import tsx --test --test-timeout=60000 --test-concurrency=2 \
  packages/core/src/gated-mutations/__tests__/gateway.test.ts || true

run jini-chat-terminal-regression "$JINI_REPO/packages/chat" npx --no-install vitest run --maxWorkers=2 --minWorkers=1 \
  src/react/components/__tests__/MessageRow.terminal-extension.test.tsx \
  src/react/__tests__/ext-event-renderer-registry.test.ts || true

run Q-jini-cms-media "$JINI_REPO/packages/cms" npx --no-install vitest run --maxWorkers=2 --minWorkers=1 \
  src/media/__tests__/replace-media-file.test.ts \
  src/media/__tests__/media-service.test.ts || true

run Q-jini-agent-plugins "$JINI_REPO/packages/agent-plugins" npx --no-install vitest run --maxWorkers=2 --minWorkers=1 \
  src/lifecycle/__tests__/unit/bundled-file-policy.unit.test.ts || true

run Q-tovu-website-media "$TOVU_REPO" env TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --experimental-test-module-mocks --test --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/features/media/__tests__/{publish-content.overwrite,replacement.dialects,import-media-entity,publish-content.apply,publish-content.write,library-publish}.test.ts \
  apps/website/src/features/publish-content/__tests__/{planner,apply-loop,gated-hooks.confirmed-report}.test.ts \
  apps/website/src/features/site-backup/__tests__/{share-zip,bundled-export-file-policy}.unit.test.ts || true

run Q-desktop-renderer "$TOVU_REPO/apps/desktop" node --import tsx --test --test-timeout=60000 --test-concurrency=2 \
  src/renderer/{ResourcesPanel.render,use-resources.hooks.render}.test.ts || true

run Bforms-jini-cf "$JINI_REPO" node --test --test-timeout=60000 --test-concurrency=2 \
  packages/agent-plugins/cloudflare/worker/__tests__/forms-*.test.mjs \
  packages/agent-plugins/cloudflare/lib/__tests__/forms.test.mjs || true

run Bforms-jini-cms "$JINI_REPO/packages/cms" npx --no-install vitest run --maxWorkers=2 --minWorkers=1 \
  src/forms/__tests__/{notify-durable,submission-validation-metadata,attachment-purge,attachment-cleanup,request-admission,submission-ip-retention,notify-subscriber}.test.ts \
  src/media/__tests__/{media-service,rendition-service,replace-media-file}.test.ts || true

run postgres-ready "$TOVU_REPO" psql -X -v ON_ERROR_STOP=1 -d postgres -Atqc "SELECT 1" || true

run Bforms-website "$TOVU_REPO" env TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --experimental-test-module-mocks --test --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/features/forms/__tests__/*.test.ts \
  apps/website/src/features/site-export/__tests__/download-forms-privacy.test.ts \
  apps/website/src/contracts/core/events/__tests__/forms-notification-retry.test.ts \
  apps/website/src/server/inbound/admin-http/http/__tests__/forms-response.test.ts \
  apps/website/src/server/inbound/public-http/routes/site/__tests__/forms-admission.test.ts \
  apps/website/src/server/inbound/public-http/routes/site/__tests__/media-rendition.route.test.ts || true

run website-composition-regressions "$TOVU_REPO" env TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --experimental-test-module-mocks --test --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/server/runtime/composition/__tests__/form-file-cleanup-wiring.test.ts \
  apps/website/src/features/identity/__tests__/owner-reset-env.test.ts || true

run website-daemon-binding-regressions "$TOVU_REPO" env TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --experimental-test-module-mocks --test --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.{attachment-binding,durable-binding,federation-runtime-wiring}.unit.test.ts \
  apps/website/src/server/runtime/composition/modules/__tests__/assistant-tool-exec.unit.test.ts || true

# P25 list provenance: P25-phase1/node-test-files.txt, vitest-test-files.txt, test-commands.txt.

# Retired apps/website/src/features/project-keys/__tests__/adopt-site-keys.unit.test.ts
# Covered by apps/website/src/server/runtime/composition/__tests__/deps-project-credentials.integration.test.ts (no adoption / no inherited keys).

# Retired apps/website/src/features/site-backup/__tests__/integration/saved-keys-orchestration.integration.test.ts
# Covered by apps/website/src/server/runtime/composition/__tests__/site-saved-keys.integration.test.ts (no adoption / no inherited keys).

run B25-keys-node "$TOVU_REPO" env TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --experimental-test-module-mocks --test --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/server/runtime/composition/__tests__/deps-project-credentials.integration.test.ts \
  apps/website/src/features/project-keys/__tests__/create-abort.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/reference-only.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/site-reference.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/site-sealer.unit.test.ts \
  apps/website/src/features/site-backup/__tests__/owner-keys-excluded.unit.test.ts \
  apps/website/src/features/source-control/__tests__/shared-key-reader.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/owner-store-location.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/provider-key-reference-only.unit.test.ts \
  apps/website/src/cli/__tests__/integration/owner-store.integration.test.ts \
  apps/website/src/features/custom-credentials/__tests__/credential-copy-tool.test.ts \
  apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts \
  apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts \
  apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/attached-vault.unit.test.ts \
  apps/website/src/features/project-keys/__tests__/tools.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-saved-keys.integration.test.ts \
  apps/website/src/features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts \
  apps/website/src/features/site-backup/__tests__/saved-keys.test.ts \
  apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts \
  apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/unit/provider-settings-route.unit.test.ts \
  apps/website/src/server/inbound/admin-http/routes/system/__tests__/credential-copy.tw4.pins.test.ts \
  apps/website/src/server/inbound/admin-http/routes/system/__tests__/custom-credentials-inventory.unit.test.ts \
  apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-share-failures.test.ts \
  apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-share-password.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/project-store.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/provider-config-source.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts || true

run B25-keys-admin "$TOVU_REPO/apps/admin" npx --no-install vitest run --maxWorkers=2 \
  src/features/security/__tests__/AccessTokensTab.credential-flows.unit.test.tsx \
  src/features/security/__tests__/AccessTokensTab.unit.test.tsx \
  src/features/security/__tests__/CopyKeysDialog.unit.test.tsx \
  src/features/security/hooks/__tests__/use-access-tokens.unit.test.tsx \
  src/features/security/hooks/__tests__/use-copy-keys.unit.test.tsx \
  src/features/sites/__tests__/site-transfer-saved-keys.journey.test.tsx \
  src/features/sites/__tests__/site-transfer-tabs.unit.test.tsx || true

run admin-navigation-regressions "$TOVU_REPO/apps/admin" npx --no-install vitest run --maxWorkers=2 \
  src/features/security/__tests__/Security.unit.test.tsx \
  src/lib/__tests__/router.unit.test.ts || true

run jini-admin-navigation-regressions "$JINI_REPO/packages/admin" npx --no-install vitest run --maxWorkers=2 --minWorkers=1 \
  src/browser/__tests__/navigation-args.test.ts \
  src/browser/__tests__/shell-navigation.test.ts || true

run F-tovu-complexity "$TOVU_REPO" npx --no-install eslint \
  apps/website/src/features/deployments/publish-credentials/store.ts \
  apps/website/src/features/deployments/publish-agent-tools.ts \
  apps/website/src/features/media/import-media-entity.ts \
  apps/admin/src/components/AssistantDock/AgentFailureCard.hooks.ts \
  apps/admin/src/components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts \
  --rule 'complexity: [error, 10]' || true

run F-jini-complexity "$JINI_REPO" npx --no-install eslint \
  packages/core/src/redact.ts \
  packages/core/src/gated-mutations/gateway.ts \
  packages/chat/src/react/components/MessageRow.tsx \
  packages/chat/src/react/ext-event-renderer-registry.ts \
  --rule 'complexity: [error, 10]' || true

printf "\nResults: %s/results.tsv\nExact commands: %s/commands.sh\n" "$ARTIFACT_DIR" "$ARTIFACT_DIR"
exit "$failed"
