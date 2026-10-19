Programmer(Execution): Programmer + TDD personas—recovery tracing and regression coverage.

**CHANGED FILES:**

- [/Users/la/Programming/Tovu/apps/website/src/server/__tests__/assistant-run-finalizer.restart.test.ts:79](/Users/la/Programming/Tovu/apps/website/src/server/__tests__/assistant-run-finalizer.restart.test.ts:79) — added a regression test seeding a running row, returning daemon 404, and asserting boot persists `canceled`, preserved content, and the existing interruption notice.

**ROOT CAUSE:**

- `apps/website/src/server/runtime/composition/serving-app.ts:47`: serving boots already enable recovery, including after site switches.
- `apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts:523`: boot delegates to durable recovery and retains every result except `"gone"`.
- `/Users/la/Programming/Jini/packages/chat/src/server/durable-runs/recover.ts:155`: a missing attempt enters continuation rather than immediate cancellation.
- `/Users/la/Programming/Jini/packages/chat/src/store/runtime/run-ledger.ts:204`: adopted rows bypass the existing atomic cancellation fallback.
- The reported **permanent** hang remains unverified; the inspected recovery path includes retry and time limits.

**NOT DONE:**

Tests, typecheck, builds, package scripts, and Git operations were not run. RED is expected from inspection, not execution.

The production change belongs in a forbidden composition file. Exact unapplied patch below reuses the ledger’s existing cancellation path. It changes boot policy and conflicts with the existing boot-continuation expectation in `assistant-durable-finalizer.unit.test.ts:11`.

```diff
--- a/apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts
+++ b/apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts
@@ -520,3 +520,10 @@
-        recover: async ({ message }) => {
+        recover: async ({ principalId, message }) => {
           if (!message.runId) return false;
+          // A confirmed-missing running attempt is interrupted at serving boot.
+          // Let the ledger preserve its checkpoint and apply its guarded cancellation.
+          if (principalId && message.runStatus === "running" && isDaemonRunId(message.runId)) {
+            const status = await probe(
+              { runId: message.runId, principalId },
+              { client: options.recoveryDaemon ?? daemon });
+            if (status === 404) return false;
+          }
           if (recovery) {
```
