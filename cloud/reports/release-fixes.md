# release-fixes — complete

Item 1 was already fixed and is verified. Item 2 is implemented and verified in Jini.

## Branch and commits

- Tovu: `cloud/release-fixes`, based on `origin/cloud/combine` at `5358aa594fb6e8c0ca107b1106fbf9ae43871d50`.
- Pushed progress commits: `a72678623c4b5bc168eeb596617c4b73e93aee2a`, `8a63b7aed3fb3dfacf63a9f8b165ac6ac50cba22`.
- Jini: `cloud/release-fixes`, based on `origin/cloud/combine` at `b0cc1371b5e739f9cd1b26f14aa5a21a82416b60`. Pushed Jini commits: `941a2611251d2571b3a7c4db183b790870263680`, `01f07ef34baaba8d1c4e9ca389eb1931d26f643f`, `0088658fe032118c86ca580e57b6a4a4e64b6400`. Final report commits are the respective branch heads.

## Item 1 — already fixed on the requested base

No product source change was needed. The existing implementation was introduced in `e327c07c8fc220fa8612ba1eb60c81c28b8a900f`, which is included in the requested base.

- `apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts:422`: `splitNodeStartupSecrets` removes daemon/tool capabilities from the child's OS environment. The node adapter supplies them through private startup IPC.
- `apps/website/src/server/runtime/boot/startup-secrets.ts:18`: startup consumes inherited/manual credentials into memory, removing secret environment keys before child creation.
- `apps/website/src/assistant/daemon-access.ts:34`: daemon/tool tokens remain in dedicated holders, independent of ordinary child environments.
- `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:166`: scope configuration separates proxy authority, consumes the site tool token, then creates the native agent runtime at lines 201–202. All agent CLI adapters share that sanitized runtime environment; this is not a CLI-specific bypass.
- `apps/website/src/server/runtime/composition/modules/assistant-tool-exec.ts:203`: requests require the current stored live attempt, workspace and recorded principal. Wire roles are removed; read-only attenuation is preserved.

The existing boot behavior is unchanged. No new boot refusal, schema, table, option, background polling, or runtime state was added. Product state/read/write cost is unchanged.

## Item 2 — implemented in Jini

Both existing Jini release commands now prepare archives, validate the exact catalog against selected archives or skipped immutable registry versions, and upload those same archives only after verification. Changed agent content requires a strictly newer independent manifest version. Cloudflare advances to 0.3.2; unchanged Vercel retains 0.1.0. The affected distributions/catalog advance from published 0.6.23 to pending 0.6.24.

Jini changed files: `scripts/check-plugin-packages.ts`, `scripts/publish-pending.ts`, `scripts/publish-all.ts`, `scripts/__tests__/plugin-release-consistency.test.ts`, `scripts/__tests__/plugin-release-prepare.test.ts`, `packages/plugin-catalog/{README.md,package.json,catalog.json,scripts/generate.ts}`, `packages/provider-plugins/{package.json,catalog.json}`, `packages/agent-plugins/package.json`, `packages/agent-plugins/cloudflare/plugin.json`, and its report. See Jini's report for exact validation commands: 40 focused release tests, 62 catalog tests, three typechecks and the real no-upload preflight passed. Two unchanged baseline complexity findings and the preexisting distribution-local catalog omission remain listed there. Tovu changes only this report.

## Validation

All commands source `/workspace/.tovu-build/env.sh`; socket-based tests run with shell network enabled.

- `cd /workspace/Jini && CI=true pnpm install --frozen-lockfile --store-dir /workspace/work/pnpm-store` — passed. The initial install found the default home store read-only; copying its cache into the writable workspace resolved setup.
- `cd /workspace/Jini && pnpm -r build` — passed after dependency refresh. Initial attempts identified missing dependencies/stale outputs; they were setup diagnostics, not product regressions.
- `cd /workspace/Tovu && npm --prefix packages/contracts run build` — passed.
- `cd /workspace/Tovu && npm --prefix packages/sdk run build` — passed.
- `cd /workspace/Tovu && JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini` — passed after the Jini rebuild.
- `cd /workspace/Tovu && TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks apps/website/src/assistant/__tests__/daemon-access.unit.test.ts apps/website/src/server/runtime/boot/__tests__/startup-secrets.unit.test.ts apps/website/src/server/runtime/lifecycle/__tests__/daemon-startup-secrets.unit.test.ts apps/website/src/server/runtime/composition/modules/__tests__/assistant-tool-exec-principal.integration.test.ts` — **17 passed, 0 failed, 0 skipped**. Covers private startup IPC, omitted host capabilities, memory-held credentials, denied cross-principal/foreign/cancelled/superseded attempts, stripped wire roles and preserved read-only constraints.
- `cd /workspace/Tovu && npm exec -- tsc -p tsconfig.json --noEmit` — passed after the full rebuild and final relink. An earlier overlapping run saw stale Jini declarations; the final run is green.
- Complexity lint: no Tovu production/test source changed; not applicable to the report-only diff.

Full test suites were not run, as directed. No tests or rules were disabled, skipped, weakened or deleted.

## Open observations

Warning: the disposable bundled-plugin fixture logged `charts-recharts` `INTEGRITY_FAILED` during the passing principal integration test. No unrelated fixture or runtime change was made.

Setup residue: Jini has an untracked `packages/plugin-ui-ux-design/` directory from the supplied/build setup. It was not committed or removed.

No outstanding item 1 defect was reproduced. No main/combine push, force-push, publish, tag, deployment or live/owner-data operation was performed.
