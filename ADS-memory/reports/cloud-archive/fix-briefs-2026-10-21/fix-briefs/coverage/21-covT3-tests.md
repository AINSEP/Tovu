Code Inspection(Review): Personas used: **code-inspection, security, tdd**.

Findings reference `review/cov-T3`; paths are repository-relative.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| MEDIUM | `tovu-int:apps/website/src/server/runtime/boot/__tests__/bootstrap-modules.unit.test.ts:46` | The repeated-start test asserts only module existence. Removing the previous poll’s `stop()` from `start()` leaves its assertions satisfied, hiding duplicate polling and a leaked timer. Sibling tests start once. **F6.1** | Use controlled timers and recording ports; assert one poll after restarting and zero polls after stopping. |
| MEDIUM | `tovu-int:apps/website/src/server/inbound/admin-http/routes/assistant/__tests__/agent-probe-characterization.test.ts:139` | The default-detector test requests an ID absent from every catalog. Replacing the default detector with `async () => []` produces the same asserted response. Injected-detector siblings do not verify this fallback. **F4.3** | Exercise the default detector in an isolated process with a controlled known CLI fixture, and assert its detected result. |
| LOW | `tovu-int:apps/website/src/server/__tests__/helpers/last-route-handler.ts:24` | The new exported helper takes positional `app, method, path`, violating the explicit two-object API rule. | Change it to `lastRouteHandler({ app, method, path }, options = {})` and update callers. |

**Rules check** — sampled test hunks only:

- Plugins never import each other: **OK**.
- Generic runtime code belongs in Jini: **OK**; reviewed additions are test fixtures/helpers.
- Two-object public API signatures: **violated**, `helpers/last-route-handler.ts:24`.
- Dependencies injected as ports: **OK** in sampled fixtures.
- React data through props: **OK**; no components in scope.
- Cyclomatic complexity ≤10: **OK by inspection** in sampled helpers; not mechanically measured.
- Existing “why” comments preserved: **OK**; no verified violation.
- ADR-066 migrations only: **OK**; no migration changes in scope.
- No data loss: **OK**; no verified test-side destructive behavior.
- Unflagged `TEMP: replaced by shared helper`: **OK**; none found.

Tests/builds were not run, as requested. Coverage percentages remain **unverified**: raw T3 coverage artifacts were unavailable to reconcile scoped runs and split module-mocking records.

**Verdict: MERGEABLE AFTER FIXES** — strengthen the two tests’ behavioral evidence and correct the exported helper’s signature.
