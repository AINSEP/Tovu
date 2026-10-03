# t09 self-validation — PARTIAL

Loaded the mandatory programmer/TDD and adversarial test instructions and COMMON.md. Runtime validation is required because this changes an HTTP pull adapter and assistant import execution.

The host declaration (`ADS-memory/governance/contracts/runtime-validation.md`) remains DRAFT with placeholder boot/healthy-signal commands. COMMON.md disallows sandbox port binding. No server boot or supertest execution was attempted, so this is PARTIAL, not an end-to-end acceptance claim.

Critical path exercised in process: real staged bundle, shared gated planner, human confirmation card, shared confirm/execute, persisted import outcome report. Negative paths: permission denial/revocation, agent confirmer refusal, wrong human, stale plan, unavailable restore point, expired/missing/foreign bundle, corrupt second blob, decline/abort/headless call. Fake remote transport; no external provider request.

Attempts: initial RED 0/25; implementation run 8/25 revealed the inherited fake's uppercase Authorization assertion; corrected fake to the transport's lowercase authorization header; rerun 25/25. Final combined runtime/contract/search run 60/61, with only an unrelated stale deployment descriptor assertion failing. One focused broader regression pass found a push-search ranking regression; vocabulary correction was confirmed by the final operator-search tests. Two deliberate security mutants were killed and restored. Compiler checks subsequently corrected the complete contributor port projection; final tsc exit 0. No sidecar or separate bounded diagnosis pass was used.

Coordinator action: run existing port-binding route suite under a machine slot:

```bash
cd /Users/la/Programming/Tovu
S=/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/test-slots
SLOT=""
while [ -z "$SLOT" ]; do
  for n in 1 2 3; do
    if mkdir "$S/slot$n"; then SLOT="$S/slot$n"; break; fi
  done
  [ -z "$SLOT" ] && sleep 5
done
trap 'rmdir "$SLOT"' EXIT
env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peers.routes.test.ts
rc=$?
rmdir "$SLOT"
trap - EXIT
echo rc=$rc
exit "$rc"
```

Evidence logs: `/private/tmp/t09-red.log`, `/private/tmp/t09-green2.log`, `/private/tmp/t09-final-tests.log`, `/private/tmp/t09-regressions.log`, `/private/tmp/t09-tsc7.log`, `/private/tmp/t09-boundaries.log`, `/private/tmp/t09-mutation-owner.log`, `/private/tmp/t09-mutation-confirmer.log`. Exact counts and durable summarized evidence are in `ADS-memory/.local-artifacts/tool-gaps/codex/t09-publish-content-pull-result.md`.
