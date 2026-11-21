All four sheets implemented in order; none STOPPED. Tests were edited before production changes.

- **AG-J1 — done:** Extended `run-frames.test.ts` to require message closure before interrupt and exclude trailing text. Expected to pass on base and fail under either named mutation.
- **AG-J2 — done:** Extended `frontend-session-ag-ui.test.ts` with bound-other-run and unbound-original-run refusals. Expected to fail under the respective guard mutations.
- **ACP-J1 — done:** Changed `session.test.ts`, `constants.ts`, and `session-results.ts`. Added the refusal test, shared internal helper, and early failure. Before the fix, version 2 continued to session creation.
- **ACP-J2 — done:** Changed `models.test.ts` and `models.ts`. Parameterized the handshake test and added probe refusal. Before the fix, version 2 resolved models.

No checks or mutations were executed, per machine rule. No commits made. Existing argument pads remain intact.

`REFRESH.md` records six combine mutations, runtime verification, and the existing projection-complexity finding. No unexpected importers appeared.

Diff re-read found no extraneous edits to delete. Authorized replacements, file lengths, unchanged API baselines, and per-sheet accounting are recorded in root `COMMIT-PLAN.md`.
