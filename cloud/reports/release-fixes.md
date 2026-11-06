# release-fixes — in progress

Branch: `cloud/release-fixes`. Base: `origin/cloud/combine` at `5358aa594fb6e8c0ca107b1106fbf9ae43871d50`.

Item 1: inspection finds private startup IPC and memory-held daemon/tool credentials already implemented, together with stored live-run/principal authorization. Existing core credential regressions pass (8 tests). Verifying standalone IPC and live-principal route integration after refreshing the build. No product source changes needed so far.

Item 2: plugin release consistency is being addressed in Jini on `cloud/release-fixes`; no Tovu changes planned for it.

Validation in progress: full Jini rebuild after frozen dependency refresh; Tovu contracts/SDK rebuilt and local Jini packages relinked. Initial stale-build and sandbox-network attempts are setup diagnostics, not product regressions.

Passed: `source /workspace/.tovu-build/env.sh && TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks apps/website/src/assistant/__tests__/daemon-access.unit.test.ts apps/website/src/server/runtime/boot/__tests__/startup-secrets.unit.test.ts` — 8 passed, 0 failed, with shell network enabled for local sockets.

Open: verification and final evidence. No deployment, publish, tags, or main/combine pushes.
