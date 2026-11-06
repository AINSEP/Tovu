# security-release — assistant catalog admission

Status: complete; packaged macOS verification remains pending. Tovu `cloud/security-release` only. No tag, publication, deployment or main push. Jini and published packages unchanged.

The 403 came from Tovu's live-attempt/principal authorization on the private tool catalog. The journey supplied a valid site bearer over loopback, without a browser Origin, but posted only a prompt: no persisted conversation/message binding meant no accepted site-owned attempt existed. The refusal was correct; the caller bypassed the durable acceptance path used by staff chat. CLI discovery, PATH and the fixture shebang had not been reached.

The smallest fix changes only the release caller: create a real authenticated chat, then send its conversation/message identity through the existing run acceptance route. All child-PID, session, no-key reason, concurrency, ownership and cleanup assertions remain. No refusal, retry, timeout, rule or threshold changed. No production route changed.

## Proof

A failing-first regression invokes the actual journey callback over real HTTP site and daemon routes, session/bearer guards, durable acceptance/store and catalog authorization. Electron IPC and CLI execution are outside this test; the actual callback and HTTP admissions execute. Before the fix, the catalog returned the exact live-attempt 403. After the fix, the actual daemon catalog client discovers tools. Wrong bearers, unknown attempts, another principal and cancellation remain refused. **16 focused checks pass, zero skipped.**

Commands from the repository root after sourcing `/workspace/.tovu-build/env.sh`:

```sh
node --import tsx --test --test-isolation=none development/scripts/__tests__/desktop-assistant-admission.integration.test.ts development/scripts/__tests__/desktop-assistant-evidence.unit.test.ts development/scripts/__tests__/desktop-assistant-release-gate.unit.test.ts apps/website/src/server/runtime/composition/modules/__tests__/assistant-tool-exec-principal.integration.test.ts
node_modules/.bin/tsc -p tsconfig.json --noEmit
node_modules/.bin/tsc -p development/tsconfig.e2e.json
node_modules/.bin/tsc -p /workspace/work/security-release/catalog-admission/focused-tsconfig.json
node_modules/.bin/eslint --no-inline-config --rule 'complexity:[error,10]' --rule 'sonarjs/cognitive-complexity:[error,10]' development/e2e/desktop/_assistant-release-gate.ts
/workspace/work/security-release/tools/gitleaks git . --log-opts='8ea4f216b..HEAD' --redact
git diff --check
```

Typechecks and secret/whitespace checks pass. The scratch typecheck adds the three affected reporting/admission test files to the existing strict E2E configuration, using the repository's Node types. A test adapter's initially omitted required configuration names were corrected; no casts or suppressions were added for that error.

Lint exception: strict harness lint reports the existing SSE reader's cognitive complexity of 11 and nesting warning. The exact same violations occur when linting the starting commit through stdin; they are unchanged by this fix. No debt list or configuration was changed. The new regression has no strict lint errors.

The packaged arm64 journeys were not rerun here. The real-route reproduction proves this admission failure and its correction; it does not claim a full packaged-app pass. Run the same two journeys on macOS with the patched harness to verify later CLI/process stages. The previous incomplete Electron probe's uncommitted DISPLAY adjustment was restored; the workspace is clean after final commits.

Behavioral fix checkpoint pushed: `6ec62bfbdf774a7147b3aad19e1438ed89dcb503`. The final response gives the subsequent test-typing/report SHA. Previous investigation: [report](https://github.com/AINSEP/Tovu/blob/8ea4f216bf7f3a799a6bf1e01620e9f6ad3482a4/cloud/reports/security-release.md).
