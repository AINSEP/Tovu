#!/usr/bin/env bash
# Night jobs A, B2, C, D, E, F, H and review J. Run in a disposable CLOUD checkout.
# Requires Node 24, git, Python 3, npm and a C/C++ toolchain for native dependencies.
# macOS-15 arm64 is required for E's packaged app gate. Linux can run the unit phase.
# Usage (all jobs, macOS cloud): CI=true bash night-test-commands.sh
# Usage (Linux unit phase): CI=true NIGHT_PHASE=unit bash night-test-commands.sh
# No source paths or test preloads from the owner's Mac are needed. The appended compressed
# snapshot carries tonight's uncommitted source/test/config edits against the pinned commits.
# It contains no node_modules, builds, reports, credentials or knowledge-graph indexes.
set -euo pipefail
: "${CI:?Run this command list in the cloud with CI=true}"
NIGHT_ROOT=${NIGHT_ROOT:-"${TMPDIR:-/tmp}/tovu-night-2026-11-04"}
export TOVU_REPO="$NIGHT_ROOT/Tovu"
export JINI_REPO="$NIGHT_ROOT/Jini"
NIGHT_PHASE=${NIGHT_PHASE:-all}
[[ "$NIGHT_PHASE" == all || "$NIGHT_PHASE" == unit ]] || { echo 'NIGHT_PHASE must be all or unit' >&2; exit 2; }
node -e 'if (+process.versions.node.split(".")[0] !== 24) throw Error("Use Node 24 for this checkout")'
mkdir -p "$NIGHT_ROOT"
[[ ! -e "$TOVU_REPO" && ! -e "$JINI_REPO" ]] || { echo 'Choose an unused NIGHT_ROOT; this script creates disposable clones.' >&2; exit 2; }
git clone --branch merge-1029 --no-checkout https://github.com/AINSEP/Jini.git "$JINI_REPO"
git -C "$JINI_REPO" checkout --detach 90ce35d53ba02e0e705c8e56a0c673d7b15c9c24
git clone --branch merge-1029 --no-checkout https://github.com/AINSEP/Tovu.git "$TOVU_REPO"
git -C "$TOVU_REPO" checkout --detach 2ff3daf05e0a782075fd6c46728d803a869111b2
# Reproduce the reviewed working trees, including untracked files and deletions, without commits.
python3 - "$0" "$NIGHT_ROOT" <<'PY'
import base64, io, pathlib, sys, tarfile
script, root = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
payload = script.read_text().split('\n__NIGHT_SNAPSHOT__\n', 1)[1]
with tarfile.open(fileobj=io.BytesIO(base64.b64decode(payload)), mode='r:gz') as archive:
    archive.extractall(root / 'snapshot', filter='data')
PY
for repo in Jini Tovu; do
  git -C "$NIGHT_ROOT/$repo" apply --check "$NIGHT_ROOT/snapshot/$repo/tracked.patch"
  git -C "$NIGHT_ROOT/$repo" apply "$NIGHT_ROOT/snapshot/$repo/tracked.patch"
  cp -R "$NIGHT_ROOT/snapshot/$repo/untracked/." "$NIGHT_ROOT/$repo/"
done

# Build Jini FIRST: core's dist must expose decodeToolInputObject and unwrapToolInputEnvelope
# before mcp builds. The remaining workspace packages use pnpm's topological build order.
cd "$JINI_REPO"
pnpm_night() { npx --yes pnpm@10.33.2 "$@"; }
pnpm_night install --frozen-lockfile
pnpm_night --filter @jini-ai/core run build
pnpm_night -r --if-present --filter '@jini-ai/*' --filter '!@jini-ai/core' run build

# Install host dependencies, then use actual packed Jini outputs at every installed package
# location. This exercises the unpublished edits without a stale registry copy or source alias.
# These are disposable CLOUD node_modules trees; no shipping dependency ranges are invented.
cd "$TOVU_REPO"
npm ci
npm ci --prefix apps/admin
npm ci --prefix apps/site-chat
npm ci --prefix apps/desktop
mkdir -p "$NIGHT_ROOT/packs"
for package in "$JINI_REPO"/packages/*; do
  [[ -f "$package/package.json" ]] || continue
  (cd "$package" && npm pack --ignore-scripts --pack-destination "$NIGHT_ROOT/packs" --silent)
done
python3 - "$TOVU_REPO" "$NIGHT_ROOT/packs" <<'PY'
import json, pathlib, shutil, sys, tarfile
repo, packs = map(pathlib.Path, sys.argv[1:])
archives = {}
for packed in packs.glob('*.tgz'):
    with tarfile.open(packed) as archive:
        manifest = json.load(archive.extractfile('package/package.json'))
    archives[manifest['name']] = packed
# Include nested installs, so an older nested core cannot shadow the rebuilt core.
for scope in list(repo.glob('**/node_modules/@jini-ai')):
    for installed in scope.iterdir():
        packed = archives.get('@jini-ai/' + installed.name)
        if not packed: continue
        if installed.is_symlink(): installed.unlink()
        else: shutil.rmtree(installed)
        installed.mkdir()
        with tarfile.open(packed) as archive:
            for member in archive.getmembers():
                member.name = member.name.removeprefix('package/')
                if member.name and member.name != 'package': archive.extract(member, installed, filter='data')
PY
npm --prefix packages/contracts run build

# Jini tests: redaction first; every vitest process is capped at two workers.
vitest_pkg() { (cd "$JINI_REPO/packages/$1" && shift && npx --no-install vitest run --maxWorkers=2 --minWorkers=1 "$@"); }
vitest_pkg core src/__tests__/{redact,redact.gap-audit,redact.exact-only,redact.characterization,redaction-union}.test.ts src/__tests__/format-error-for-log.test.ts src/__tests__/tool-input-normalization.test.ts
vitest_pkg diagnostics src/__tests__/secret-patterns.test.ts src/__tests__/secrets-only.test.ts src/__tests__/mask-local-paths.test.ts
vitest_pkg sidecar src/__tests__/supervisor.test.ts
vitest_pkg agent-plugins src/lifecycle/__tests__/unit/{activation-reader,enable-grants,off-plugin-visibility,automatic-use,search-projection}.unit.test.ts
vitest_pkg plugins src/host/__tests__/unit/source-drafts.unit.test.ts
vitest_pkg mcp src/federation/__tests__/{reload-frozen-grants,reload-empty-grants,mcp-federation.reload}.test.ts src/server/__tests__/tool-argument-recovery.test.ts
vitest_pkg devops src/deploy/__tests__/{publish-jobs,host-kit}.test.ts
vitest_pkg daemon src/tool-recovery/__tests__/redaction.test.ts src/http/__tests__/delegated-tools-host-described-internal-error.test.ts src/agent-executor/__tests__/{agent-executor,sanitized-line-stream}.test.ts
vitest_pkg agent-runtime src/defs/__tests__/antigravity.test.ts src/__tests__/{antigravity-audit.unit,model-discovery,native-tool-compatibility.unit}.test.ts src/providers/__tests__/oauth-retirement.test.ts
vitest_pkg chat src/react/components/__tests__/{MessageList,MessageRow}.test.tsx
vitest_pkg platform src/fs/__tests__/reviewed-file.test.ts src/__tests__/{aws-sigv4,aws-sigv4.f1}.test.ts
vitest_pkg analytics src/__tests__/ingest.test.ts
(cd "$JINI_REPO" && node --test --test-timeout=60000 --test-concurrency=2 packages/agent-plugins/vercel/__tests__/{vercel,publish-recovery}.test.mjs)

# Tovu website A/C/D/E/F/J, using the repository's disposable bundled-plugin fixture.
cd "$TOVU_REPO"
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts \
  --experimental-test-module-mocks --test --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/features/{agent-plugins,plugin-runtime}/__tests__/unit/*.regression.test.ts \
  apps/website/src/features/agent-plugins/__tests__/unit/{apply-connect-defaults,grant-signed-in-defaults}.unit.test.ts \
  apps/website/src/features/plugin-runtime/__tests__/unit/{plugins-set-enabled-consent,plugins-tool-registrations,set-enabled-confirmation-ui}.unit.test.ts \
  apps/website/src/assistant/__tests__/{plugin-enable-federation.regression,plugin-guidance-reload.integration,tool-registrations.plugins-set-enabled-families,tool-registrations.plugins,federated-approval-policy,external-mcp-connection-source,external-mcp-connection-source.operator-read-only}.test.ts \
  apps/website/src/features/external-mcp/__tests__/{external-mcp-oauth,external-mcp-connection-revocation}.test.ts \
  apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts \
  apps/website/src/features/deployments/static-publish/__tests__/{adapter.unit,publish-run.unit,domain-publish-tool.unit}.test.ts \
  apps/website/src/assistant/__tests__/{mcp-ui-tool-calls-route.static-publish.integration,mcp-ui-tool-calls,tool-metadata-projections}.test.ts \
  apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts \
  apps/website/src/server/runtime/composition/modules/__tests__/assistant-cold-start.unit.test.ts \
  apps/website/src/server/inbound/assistant/__tests__/{agent-daemon-scope-control.unit,shared-agent-daemon.integration}.test.ts \
  apps/website/src/features/site-backup/__tests__/{sources.unit,sources-no-follow.unit,share-zip.unit,share-refusals.integration,share.integration,tool-registrations.unit}.test.ts \
  apps/website/src/features/site-backup/__tests__/unit/archive-extensions.unit.test.ts \
  apps/website/src/features/newsletter/__tests__/{campaign-write-service,repo.dialects}.test.ts \
  apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/{create,update}-campaign.test.ts \
  apps/website/src/server/runtime/boot/__tests__/boot-readiness-gate.unit.test.ts \
  apps/website/src/platform/site-dir/__tests__/unit/{site-running,shared-sites-home}.unit.test.ts \
  apps/website/src/__tests__/index-boot.characterization.test.ts \
  apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts

# E identity/workflow regressions; D activation errors; H dependency fingerprint and TLS cache.
node --import tsx --test --test-timeout=60000 --test-concurrency=2 \
  development/eslint-rules/__tests__/site-identity-keys.unit.test.ts \
  development/scripts/__tests__/desktop-assistant-release-gate.unit.test.ts
npm run quality:site-identity
(cd apps/admin && npx --no-install vitest run --maxWorkers=2 --minWorkers=1 \
  src/lib/__tests__/assistant-daemon-activation.unit.test.ts \
  src/components/AssistantDock/__tests__/daemon-prewarm-error.unit.test.tsx \
  __tests__/dev-jini-deps.unit.test.ts __tests__/vite-config-dev-tls.unit.test.ts)

# B2/E daemon ownership and H resources, using the desktop's normal Node resolver.
(cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts \
  --test --test-timeout=60000 --test-concurrency=2 src/desktop-agent-service.test.ts src/desktop-resources.test.ts)
node --import tsx --test --test-timeout=60000 --test-concurrency=2 \
  apps/desktop/src/renderer/ResourcesPanel.render.test.ts \
  apps/desktop/src/renderer/use-resources.hooks.render.test.ts \
  apps/desktop/src/renderer/SiteGrid.jsdom.test.ts

# F1/J: report complexity with the established sensor, without installing analysis tools.
python3 development/scripts/code-metrics.py --target ../Jini/packages/core/src \
  --out "$NIGHT_ROOT/metrics-core" --skip duplication,type_safety,dead_code,structure,coverage
# Enforce the ceilings against the specific changed source paths too; no inline suppressions.
(cd "$JINI_REPO" && npx --no-install eslint --no-inline-config \
  --rule 'complexity:[error,10]' --rule 'sonarjs/cognitive-complexity:[error,10]' \
  packages/core/src/redact.ts packages/agent-plugins/vercel/targets/vercel.mjs \
  packages/daemon/src/{http/delegated-tools,tool-recovery/redaction}.ts packages/devops/src/deploy/publish-jobs.ts)
npx --no-install eslint --no-inline-config --rule 'complexity:[error,9]' --rule 'sonarjs/cognitive-complexity:[error,9]' apps/desktop/src/desktop-agent-service.ts

# E's packaged gate is a macOS cloud job. Unit-only explicitly leaves this verification open.
if [[ "$NIGHT_PHASE" == unit ]]; then
  echo 'Unit phase finished. E packaged gate still requires NIGHT_PHASE=all on macOS-15 arm64.'
  exit 0
fi
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'E packaged gate requires a macOS-15 arm64 cloud runner. Unit checks do not replace it.' >&2; exit 2; }
night_gate_started=$SECONDS
npm run build
(cd apps/admin && npx --no-install vite build)
(cd apps/site-chat && npx --no-install vite build)
(cd apps/desktop && npm run build && TOVU_TARGET_ARCH=arm64 npm run stage && CSC_IDENTITY_AUTO_DISCOVERY=false npx --no-install electron-builder --mac --arm64 --dir --publish never)
TOVU_E2E_DESKTOP_APP="$TOVU_REPO/apps/desktop/release/mac-arm64/Tovu.app" \
  npm run e2e:desktop:app -- two-sites-assistant.desktop.ts shared-agent-daemon.desktop.ts --workers=1 --retries=0
echo "E packaged gate wall time: $((SECONDS-night_gate_started)) seconds"
exit 0

