import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { buildObservabilityRegistrations } from "../tool-registrations.js";

const context = (input: unknown): ToolExecutionContext => ({ executionId: "test", principal: { id: "admin" }, run: { id: "run" }, input, signal: new AbortController().signal });

test("diagnostic tool requires admin permission, runs directly, and shares the injected action", async () => {
  const authorization: unknown[] = [];
  const sent: unknown[] = [];
  const result = { providers: [{ providerId: "errors", signals: ["error" as const] }] };
  const [registration] = buildObservabilityRegistrations({ workspaceId: "site", authorize: async input => {
    authorization.push(input); return { allowed: true, reason: "matched" };
  }, sendTelemetryTest: async input => { sent.push(input); return result; } });
  assert.equal(registration!.descriptor.id, "observability_send_test_error");
  assert.deepEqual(registration!.descriptor.metadata?.approval, { class: "edit", confirmation: "direct" });
  assert.deepEqual(await registration!.handler(context({})), result);
  assert.deepEqual(sent, [{}]);
  assert.deepEqual(authorization, [{ principalId: "admin", workspaceId: "site", permission: "system.write", entityType: "observability" }]);
});

test("diagnostic tool refuses extra arguments and denied callers without sending", async () => {
  let sent = 0;
  const [registration] = buildObservabilityRegistrations({ workspaceId: "site", authorize: async () => ({ allowed: false, reason: "insufficient_permission" }),
    sendTelemetryTest: async () => { sent++; return { providers: [] }; } });
  await assert.rejects(() => registration!.handler(context({ error: "untrusted error" })), { message: "observability_send_test_error takes no arguments." });
  await assert.rejects(() => registration!.handler(context({})), { message: "OBSERVABILITY_FORBIDDEN: principal 'admin' is not authorized for 'system.write' (insufficient_permission)" });
  assert.equal(sent, 0);
});
