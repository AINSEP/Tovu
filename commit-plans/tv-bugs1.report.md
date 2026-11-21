Implemented all six sheets’ edits on `codex/tv-bugs1`; runtime validation remains unverified.

- **T1 — done:** `agent-daemon-core-rpc.integration.test.ts`. Shared the fixture’s chat store; preserved assertions. Existing red: session locator uses a different store.
- **T2 — done:** `list-send-log.ts` and its test. Added cursor pagination and exact-100/101-row coverage. Previously capped results lacked continuation.
- **T3 — done:** `admin-failure.ts` and `unexpected-admin-escape-paths.unit.test.ts`. Added standard incident-ID assertion and minting. Raw UUIDs fail the required format.
- **T4 — done:** `assistant-ag-ui.ts` and its wire test. Added dropped-stream coverage and approved interruption copy. Previously the catch exposed the transport message.
- **SHARE-ZIP — done:** Changed `share-backend.ts`, `share-service.ts`, `share-registry.ts`, `tool-registrations.ts`, `site-shares.ts`, and the four named test files. Applied the coordinator’s storage-object ruling. Tests cover private acknowledged downloads, provider refusal, static ZIP retention, and public-token denial. Prior guards reject owner exports; prior token logic permits acknowledged warned ZIPs.
- **AG-T0 — done:** Added the named approval payload in the wire test. Golden bytes remain untouched; this characterization should stay green until the packed-drain mutation introduces early interruption.

No tests, builds, installs, type checks, linters, commits, or pushes were performed, as instructed. Static boundary review found no sheet STOP condition.

[COMMIT-PLAN.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-bugs1/COMMIT-PLAN.md) records every file, mutation, API delta, deletion, and look owed. [REFRESH.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-tv-bugs1/REFRESH.md) lists combine checks, including the three SHARE-ZIP reds and installed API resolution. No unrelated deletions were needed at final diff review.
