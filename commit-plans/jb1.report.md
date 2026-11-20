Five sheets implemented; RD-J1 stopped.

- **RD-J1 — STOPPED:** two entropy-positive fixtures at `user-text-redaction.test.ts:13–14` contradict the source deletion but fall outside the cull’s exact deletion list. No edits.
- **RD-J2 — done:** `durable-run-store.ts`, new accepted-request test, patch changeset. Applied verbatim; both file hashes match the supplied patch.
- **AG-J1 — done:** `event-projection.ts`, new `run-frames.test.ts`, minor changeset.
- **J1 — done:** `stack.ts`, `observability.ts`, new `stack-observability.test.ts`, minor changeset.
- **J2 — done:** `observability.ts`, `observability.test.ts`, minor changeset.
- **J3 — done:** `otel-port.ts`, `opentelemetry.ts`, `observability-otel-surfaces.test.ts`, minor changeset.

[REFRESH.md](REFRESH.md) records the RD-J1 conflict and J3’s direct factory test import. No additional importer repoints were needed.

[COMMIT-PLAN.md](COMMIT-PLAN.md) contains all six entries, full paths, mutations, API deltas, debt notes, and deletions.

Verification remains pending. No tests, builds, installs, typechecks, or linters ran. Changes remain in the working tree.
