# security-release — Tovu Desktop 0.1.30

Status: in progress — desktop gate repairs on cloud/security-release. No tag, publication, deployment or main push performed.

## Changes

- Bumped desktop to **0.1.30**, including both lockfile version fields and `RELEASE-NOTES-0.1.30.md`, following commit `9be473ab5`.
- Refreshed all four lockfiles and installed consumers from the real npm registry using npm **11.20.0**. All 12 published Jini packages use **0.6.23**. Existing floors were already correct; the scoped chat override key now follows its 0.6.23 range.
- Verified npm versions, tarball URLs and registry integrity values. No integrity was invented or edited manually. Changes outside Jini lock entries are limited to the intended root specifications and desktop version metadata.
- Removed **79 local Jini symlinks** and the local link-state marker. All **79 installed/locked Jini entries** across root, admin, desktop and site-chat are registry artifacts, with no local Jini link/file entries.
- Jini repository unchanged. No production function, test assertion, rule, timeout or threshold changed.

## Validation

- Root, desktop, admin and site-chat typechecks: **PASS**.
- Focused tests: **88 PASS** — dependency/catalog/chart pins 31, actual chart bundle 13, desktop version 5, link guard 3, site security integration 13, selected desktop integration 1, desktop tools 10, privacy components 12.
- The previously deferred lockfile-alignment test now **passes**.
- Four installed-tree release link guards and direct registry/lock/install integrity verification: **PASS**.
- Final range secret scan and `git diff --check`: **PASS**.

Exception: published artifacts emit non-failing source-map warnings in the component run. No test failed. Earlier unrelated source-test timeout and strict-lint debt were not rerun for these metadata/dependency changes; their details remain in the [prior report](https://github.com/AINSEP/Tovu/blob/3f83e357477ce692187a111a2eb509e9536c64de/cloud/reports/security-release.md). No full suite was launched. Pushes use the documented hook bypass to honor focused tests only; no hook was modified.

## Published Jini package set

All at **0.6.23**:

- `@jini-ai/agent-plugins`
- `@jini-ai/agent-runtime`
- `@jini-ai/agentic`
- `@jini-ai/chat`
- `@jini-ai/core`
- `@jini-ai/daemon`
- `@jini-ai/mcp`
- `@jini-ai/platform`
- `@jini-ai/ui`
- `@jini-ai/ui-kit`
- `@jini-ai/plugin-catalog`
- `@jini-ai/provider-plugins`

## Commands and evidence

All commands used `source /workspace/.tovu-build/env.sh`. Registry reads requested `version dist --json` for each of the 12 `@jini-ai/<name>@0.6.23` packages with `--registry=https://registry.npmjs.org`.

In each of `.`, `apps/admin`, `apps/desktop` and `apps/site-chat`, ran the following npm 11.20.0 commands after removing the existing Jini symlinks through the repository's consumer inventory:

```sh
node /workspace/Tovu/apps/desktop/node_modules/npm/bin/npm-cli.js install --package-lock-only --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --cache=/workspace/work/security-release/registry-followup/npm-cache
node /workspace/Tovu/apps/desktop/node_modules/npm/bin/npm-cli.js install --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --cache=/workspace/work/security-release/registry-followup/npm-cache
node /workspace/Tovu/development/scripts/check-no-linked-jini.mjs
```

The direct probe `node /workspace/work/security-release/registry-followup/verify.mjs` compares every applicable manifest floor, lock root specification, resolved URL/integrity, installed version and physical directory against the npm metadata; checks all 79 entries; checks the absent link marker; and verifies desktop's three version fields are 0.1.30. Raw logs and metadata are retained under `/workspace/work/security-release/registry-followup`.

Exact focused test and typecheck commands:

```sh
# /workspace/Tovu
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --test-concurrency=1 apps/website/src/server/runtime/composition/__tests__/recharts-package-pin.unit.test.ts apps/website/src/server/runtime/composition/__tests__/product-telemetry.unit.test.ts apps/website/src/server/runtime/composition/__tests__/browser-provider.integration.test.ts
```

```sh
# /workspace/Tovu/apps/desktop
node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test src/app-version-ipc.test.ts
```

```sh
# /workspace/Tovu
node --import tsx --test development/scripts/__tests__/check-no-linked-jini.test.ts
```

```sh
# /workspace/Tovu/apps/admin
node_modules/.bin/vitest run src/integrations/chart-providers/__tests__/recharts-bundle-integer-ticks.unit.test.ts --maxWorkers=1 --pool=threads
```

```sh
# /workspace/Tovu/apps/desktop
node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-isolation=none '--test-name-pattern=runtime registers the built tools' src/desktop-agent.test.ts
```

```sh
# /workspace/Tovu/apps/desktop
node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-isolation=none src/desktop-agent-tools.test.ts
```

```sh
# /workspace/Tovu
node --import tsx --experimental-test-module-mocks --test --test-isolation=none apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.typed-tools.integration.test.ts
```

```sh
# /workspace/Tovu
node_modules/.bin/tsc -p tsconfig.json --noEmit
```

```sh
# /workspace/Tovu
npm --prefix apps/desktop run typecheck
```

```sh
# /workspace/Tovu
npm --prefix apps/site-chat run typecheck
```

```sh
# /workspace/Tovu
npm --prefix apps/admin run typecheck
```

```sh
# /workspace/Tovu/apps/admin
node_modules/.bin/vitest run src/components/__tests__/SecretInput.unit.test.tsx src/features/security/__tests__/SiteKeyTab.agent-secrecy.unit.test.tsx src/features/sites/__tests__/SiteExportTab.secret.unit.test.tsx --maxWorkers=1 --pool=threads
# /workspace/Tovu
/workspace/work/security-release/tools/gitleaks git . --log-opts='e327c07c8..HEAD' --redact
git diff --check
```

## SHAs

Validated implementation tip before the final documentation commit: `8d3fe13e6aaecd03f19daa89259d2b67058661b2`.

This step's implementation commits, both on `cloud/security-release`:

- `bab8d7468bc6fee657c3ea708561cb9269c8f0a0`
- `8d3fe13e6aaecd03f19daa89259d2b67058661b2`

The final response provides the final report-commit SHA; that commit changes documentation only. Earlier integration and checkpoint SHAs remain in the prior report/history.

## Desktop gate repair — in progress

The untruncated main-process baseline found 9 failures across 2,174 tests. Causes include stale shutdown VM dependencies, an outdated staging-path inventory, subprocess timeouts and container-only process/Electron availability. Two requested complexity refactors preserve all thresholds and behavior. The affected source/fixture tests pass 169 checks. All gate configurations, floors and debt inventories remain unchanged. Full gate verification is pending.

Gate checkpoint: the missing locked Electron runtime was installed with checksum verification, and unchanged process-reaping assertions pass under a temporary standard init/subreaper. Strict complexity passes 247 files at 9/9 with zero new debt. The first full gate attempt found a typing mistake in a newly added invalid fixture; the fixture now uses the supported unavailable-snapshot contract and retains every reset assertion. A fresh full gate run will be authoritative.
