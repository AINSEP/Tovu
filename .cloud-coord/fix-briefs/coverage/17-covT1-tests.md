Code Inspection(Review): Personas used: code-inspection + security + tdd.

Read-only sampling at `review/cov-T1` (`47ed50a4c`). No tests, builds, or installs run.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | `tovu-int:apps/desktop/src/renderer/App.hooks.render.test.ts:746` | Requires a successfully deleted conversation to become active again when refresh fails. Subsequent messages target a nonexistent conversation and cannot persist. The fake accepts those writes, hiding the failure. **F4.6/F3.3** | Expect surviving conversation `b`, exclude deleted `a` from fallback state, and verify the next message persists. Make the fake refuse writes to deleted conversations. |
| MEDIUM | `tovu-int:apps/desktop/src/workspace-chat-ipc.test.ts:183` | Models an unknown run by throwing. Jini actually returns `{ kind: "unknown-run" }`; the test therefore passes while the real path incorrectly reports `replay-gap`. **F3.3** | Use Jini’s result type and return the real unknown-run result. Keep the expected `closed:unknown-run` assertion; coordinate the resulting implementation fix with the product shard. |
| MEDIUM | `tovu-int:apps/desktop/src/renderer/App.render.test.ts:223` | Enter, Shift+Enter, Next, and Previous share one “at least one find call” assertion. Changing Shift+Enter to call Next remains green. Sibling helper tests do not exercise this UI wiring. **F2.5/F6.1** | Record bridge arguments and assert the query, direction, and continuation flag after each interaction. |
| MEDIUM | `tovu-int:apps/admin/src/__tests__/unit/app-hooks-announcements.unit.test.tsx:54` | The “exactly one publish request” assertion compares the final request ID with itself. Calling `requestPublish(criteria)` twice still passes. **F4.1** | Record `requestPublish` calls and assert exactly one call with the expected criteria under StrictMode. |

**Rules check** — statuses apply to inspected test changes; product compliance belongs to the other shard.

- Plugin imports: **OK** — no cross-plugin imports found.
- Jini/Tovu ownership: **OK** — no parallel runtime owner introduced by inspected tests.
- Two-object public signatures: **OK** — no new public API in inspected test files.
- Injected ports: **OK** — inspected tests use boundary seams.
- React data through props: **OK** — no new violation identified.
- Cyclomatic complexity ≤10: **OK in manual sample**; not mechanically measured.
- Existing “why” comments preserved: **OK** — no removal found.
- ADR-066 migrations only: **OK** — no schema migrations in test scope.
- No data loss: **violated** — test requires an unsafe persistence outcome at `App.hooks.render.test.ts:746`.
- `TEMP: replaced by shared helper`: **OK** — none added in test diff.

**Verdict: MERGEABLE AFTER FIXES** — correct the unsafe persistence expectation and false-positive assertions before accepting this wave’s test evidence.
