Code Inspection(Review) + TDD: selected for source correctness and test validity. Reviewed F2 through `e9f82ec3`.

- **Medium — `packages/registry/src/__tests__/static-backend.verification-gate.test.ts:34` (AP2):** Every matching entry scores `1`; repeated “chart” text adds no weight. Reversing score ordering still passes, including the limit check. Smallest fix: use two query terms producing different scores, then assert literal expected ordering and the first limited result. Existing sibling tests do not cover unequal-score ordering.

- **Medium — `packages/sidecar/src/__tests__/json-ipc.contract.test.ts:82`:** The spawned child has no registered cleanup while awaiting stdout readiness. If readiness stalls, timeout cleanup only removes the directory; the child can remain alive. Smallest fix: register child termination/reaping immediately, and bound readiness with error/exit handling.

- **Low — `packages/plugins/src/host/__tests__/integration/package-files-limits.integration.test.ts:71`:** The test claims hard-linked files are omitted but creates only a symlink. The viewer currently reads hard links, so this security assurance is false. Smallest fix: remove the unsupported hard-link claim from the title; snapshot hard-link rejection is tested separately.

All three source changes pass static review: the DNS null-entry bug is real, its regression test was committed first, and the fix correctly refuses those entries. Both refactors preserve behavior. The owner-approved Tovu behaviors are untouched.

No edits, tests, or servers were run; reported coverage and passing-test counts were not independently reproduced.
