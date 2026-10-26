Code Inspection(Review): Persona selected for source correctness and AP1–AP15 test review. Reviewed F1 at `d6def36f`.

- **Medium — incomplete SigV4 fix**, [aws-sigv4.ts:87](/Users/la/Programming/tovu-integration-clones/jini-prov1025/packages/platform/src/aws-sigv4.ts:87). Case-colliding headers use last-value-wins for signing, while both spellings remain in the outgoing map. For example, supplying `X-Amz-Date` leaves it alongside the generated `x-amz-date`; a transport that combines them sends a different value from the one signed. [AWS requires multi-value headers to be comma-separated](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html). **Smallest fix:** normalize the outgoing map before adding generated headers, and sign those exact values; add a collision regression.

- **Medium — malformed-metadata test misses its stated guarantees (AP3; F6.1)**, [run-lifecycle.rehydrate.f1.test.ts:69](/Users/la/Programming/tovu-integration-clones/jini-prov1025/packages/daemon/src/__tests__/run-lifecycle.rehydrate.f1.test.ts:69). Removing either metadata string-type check still passes: `get()` exposes status only, and numeric key `9` never matches the test’s string `'9'`. **Smallest fix:** test each malformed field separately and probe the original numeric value through filtering/replay.

- **Medium — SQLite handles leak on test failure (AP10)**, [sqlite.f1.test.ts:17](/Users/la/Programming/tovu-integration-clones/jini-prov1025/packages/daemon/src/store/event-log/__tests__/sqlite.f1.test.ts:17). An assertion failure before the trailing `close()` leaves the database open; teardown only removes the directory. Mutation runs deliberately trigger these failures. **Smallest fix:** register every acquired handle for unconditional teardown, closing handles before removing files.

The two source extraction refactors preserve behavior. The mixed-case signing defect is real, and failing-test commit `b921a100` precedes fix `d951a507`. F1 does not touch the three owner-protected behaviors.

Static review only; no edits, tests, or servers ran.
