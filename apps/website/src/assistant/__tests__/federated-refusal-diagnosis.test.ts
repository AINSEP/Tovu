import assert from "node:assert/strict";
import test from "node:test";

import type { Principal, RunRef } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";

import type { FederatedAdmissionReport } from "../mcp-federation/trust.js";
import type { FederationAdmissionSnapshotEntry } from "../mcp-federation/refusal-notice.js";
import { withFederatedRefusalDiagnosis, type FederationBootStatus } from "../federated-refusal-diagnosis.js";

/**
 * @file The incident this closes: an operator's higgsfield connection allowlists only
 * `generate_image`/`reveal_generation`; the other 9 tools (the tiktok_* family) are refused
 * `not-in-operator-allowlist`, which is never registered, so `ToolExecutor.execute` throws
 * `unknown tool "mcp__higgsfield__tiktok_publish"`. That throw reaches `@jini-ai/http-kit`'s
 * `delegated-tools.ts`, which redacts EVERY throw to a bare `INTERNAL_ERROR` and sends the real text
 * only to the daemon's log — the model asked to post to TikTok gets an opaque 500 indistinguishable
 * from a genuine server fault. Every test below is written as "what does the CALLER of `execute` get
 * back", because that return value is exactly what reaches `delegated-tools.ts`'s existing
 * `errorKind === 'validation'` -> real `400 BAD_REQUEST` path, unmodified.
 */

const PRINCIPAL: Principal = { id: "principal-under-test" };
const RUN: RunRef = { id: "run-1" };

function report(overrides: Partial<FederatedAdmissionReport> = {}): FederatedAdmissionReport {
  return {
    admitted: [],
    refused: [],
    allowlistedButAbsent: [],
    writeAllowedButNotAllowlisted: [],
    ...overrides,
  };
}

function snapshot(connectionId: string, overrides: Partial<FederatedAdmissionReport> = {}): FederationAdmissionSnapshotEntry[] {
  return [{ connectionId, report: report(overrides) }];
}

/** An `inner` executor that throws the exact `ToolExecutor` contract for every id in `unknownIds`,
 *  and otherwise completes trivially — standing in for `createAssistantToolExecutor`'s composed
 *  stack without needing to boot a real registry (mirrors `read-only-tool-constraint.composition
 *  .test.ts`'s own inline stub `ToolExecutor`, which is the precedent for this shape). */
function stubExecutor(unknownIds: ReadonlySet<string>): ToolExecutor {
  return {
    execute: async (_principal, _run, toolId): Promise<ToolExecutionResult> => {
      if (unknownIds.has(toolId)) throw new Error(`ToolExecutor: unknown tool "${toolId}"`);
      return { executionId: "e", status: "completed", output: { ok: true } };
    },
    resumeConfirmation: () => {},
    cancel: () => {},
    getAuditRecord: () => null,
  };
}

// ---------------------------------------------------------------------------
// The incident itself
// ---------------------------------------------------------------------------

test("an attempted call to a not-in-operator-allowlist federated tool comes back naming the tool, the server, and the fix — not a bare 'unknown tool'", async () => {
  const toolId = "mcp__higgsfield__tiktok_publish";
  const inner = stubExecutor(new Set([toolId]));
  const snap = snapshot("higgsfield", { refused: [{ remoteName: "tiktok_publish", reason: "not-in-operator-allowlist" }] });

  const executor = withFederatedRefusalDiagnosis(inner, () => snap);
  const result = await executor.execute(PRINCIPAL, RUN, toolId, {});

  assert.equal(result.status, "failed");
  assert.equal(result.errorKind, "validation");
  assert.equal(
    result.error,
    'tool "tiktok_publish" on external server "higgsfield" was refused: the administrator has not allowed this tool for this connection. Fix: in Settings → External MCP, add it to "Allowed tools", then restart the assistant.',
  );
  // The exact string this whole file exists to stop the caller from seeing in its place.
  assert.doesNotMatch(result.error ?? "", /^ToolExecutor: unknown tool/);
});

test("this is a REAL 400-mappable outcome, not a thrown exception — the property that lets it reach the model at all", async () => {
  const toolId = "mcp__higgsfield__tiktok_publish";
  const inner = stubExecutor(new Set([toolId]));
  const snap = snapshot("higgsfield", { refused: [{ remoteName: "tiktok_publish", reason: "not-in-operator-allowlist" }] });

  const executor = withFederatedRefusalDiagnosis(inner, () => snap);
  // No try/catch: if this decorator still throws for a refused id, this call rejects and the test fails.
  const result = await executor.execute(PRINCIPAL, RUN, toolId, {});
  assert.equal(result.status, "failed", "must be a returned result, never a thrown error, for a known refusal");
});

// ---------------------------------------------------------------------------
// Secret redaction (2026-09-16) — this layer is composed OUTERMOST in
// `agent-daemon-server.ts`, outside `withRedactedToolFailures`, so a `failed` result it mints
// itself never passes back through that decorator. `remoteName` is the one upstream-influenced
// piece of the diagnosis text: it is the external server's OWN advertised tool name, sanitized by
// `safeRemoteName` only against injection characters, never against secret shapes.
// ---------------------------------------------------------------------------

test("a refused tool whose remote-advertised name is secret-shaped is redacted, not leaked verbatim", async () => {
  // Passes SAFE_REMOTE_NAME (`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$`) — a real external MCP server can
  // advertise a tool under exactly this name — and also matches the anthropic_key redaction rule.
  const secretShapedName = "sk-ant-api03-ABCDEFGHIJ1234567890";
  const toolId = "mcp__higgsfield__" + secretShapedName;
  const inner = stubExecutor(new Set([toolId]));
  const snap = snapshot("higgsfield", { refused: [{ remoteName: secretShapedName, reason: "not-in-operator-allowlist" }] });

  const result = await withFederatedRefusalDiagnosis(inner, () => snap).execute(PRINCIPAL, RUN, toolId, {});

  assert.equal(result.status, "failed");
  assert.doesNotMatch(result.error ?? "", /sk-ant-api03-ABCDEFGHIJ1234567890/, "the secret-shaped remote name must never reach the model verbatim");
  assert.match(result.error ?? "", /\[REDACTED:anthropic_key\]/);
  // The rest of the message (server id and fix text) must still be intact — this is redaction, not
  // an opaque replacement of the whole diagnosis.
  assert.match(result.error ?? "", /on external server "higgsfield" was refused/);
  assert.match(result.error ?? "", /Allowed tools", then restart/);
});

// ---------------------------------------------------------------------------
// Every other reason still gets a real, distinct explanation
// ---------------------------------------------------------------------------

test("a write-grant refusal attempted directly is also legible, with its own distinct fix text", async () => {
  const toolId = "mcp__higgsfield__generate_image";
  const inner = stubExecutor(new Set([toolId]));
  const snap = snapshot("higgsfield", { refused: [{ remoteName: "generate_image", reason: "remote-declares-not-read-only" }] });

  const result = await withFederatedRefusalDiagnosis(inner, () => snap).execute(PRINCIPAL, RUN, toolId, {});

  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /Allowed to make changes/);
  assert.doesNotMatch(result.error ?? "", /Allowed tools", then restart/, "must not reuse the allowlist reason's fix text for a different reason");
});

// ---------------------------------------------------------------------------
// Pass-through — nothing else changes
// ---------------------------------------------------------------------------

test("an admitted federated tool's normal completion is untouched", async () => {
  const toolId = "mcp__higgsfield__generate_image";
  const inner = stubExecutor(new Set());
  const result = await withFederatedRefusalDiagnosis(inner, () => []).execute(PRINCIPAL, RUN, toolId, {});

  assert.deepEqual(result, { executionId: "e", status: "completed", output: { ok: true } });
});

test("a native (non-federated) unknown tool id still throws unchanged — this decorator only ever touches mcp__-prefixed ids", async () => {
  const toolId = "some_native_typo";
  const inner = stubExecutor(new Set([toolId]));

  await assert.rejects(
    () => withFederatedRefusalDiagnosis(inner, () => []).execute(PRINCIPAL, RUN, toolId, {}),
    /unknown tool "some_native_typo"/,
  );
});

test("a federated-SHAPED id this boot never refused still throws unchanged — no snapshot entry means nothing to diagnose", async () => {
  const toolId = "mcp__higgsfield__some_tool_nobody_ever_refused";
  const inner = stubExecutor(new Set([toolId]));
  const snap = snapshot("higgsfield", { refused: [{ remoteName: "tiktok_publish", reason: "not-in-operator-allowlist" }] });

  await assert.rejects(() => withFederatedRefusalDiagnosis(inner, () => snap).execute(PRINCIPAL, RUN, toolId, {}), /unknown tool/);
});

test("a genuinely unrelated throw (not 'unknown tool') passes straight through, never reinterpreted as a refusal", async () => {
  const toolId = "mcp__higgsfield__tiktok_publish";
  const inner: ToolExecutor = {
    execute: async () => {
      throw new Error("connection reset");
    },
    resumeConfirmation: () => {},
    cancel: () => {},
    getAuditRecord: () => null,
  };
  const snap = snapshot("higgsfield", { refused: [{ remoteName: "tiktok_publish", reason: "not-in-operator-allowlist" }] });

  await assert.rejects(() => withFederatedRefusalDiagnosis(inner, () => snap).execute(PRINCIPAL, RUN, toolId, {}), /connection reset/);
});

// ---------------------------------------------------------------------------
// Late-bound snapshot — the whole reason `getSnapshot` is a function, not a value
// ---------------------------------------------------------------------------

test("the snapshot is read LIVE at call time — a refusal that only exists after boot is still diagnosed", async () => {
  const toolId = "mcp__higgsfield__tiktok_publish";
  const inner = stubExecutor(new Set([toolId]));
  let live: FederationAdmissionSnapshotEntry[] = []; // pre-boot: nothing known yet, matches agent-daemon-server.ts's module-load state
  const executor = withFederatedRefusalDiagnosis(inner, () => live);

  // Composed before "boot" finished — captured with the empty snapshot, exactly like
  // `agent-daemon-server.ts` composing `toolExecutor` at module scope before `start()` runs.
  await assert.rejects(() => executor.execute(PRINCIPAL, RUN, toolId, {}), /unknown tool/, "pre-boot: nothing to diagnose yet, so the original throw still surfaces");

  // "start()" resolves and reassigns the module-scope binding `getSnapshot` closes over.
  live = snapshot("higgsfield", { refused: [{ remoteName: "tiktok_publish", reason: "not-in-operator-allowlist" }] });

  const result = await executor.execute(PRINCIPAL, RUN, toolId, {});
  assert.equal(result.status, "failed", "the SAME executor instance now diagnoses the call, with no re-composition");
});

// ---------------------------------------------------------------------------
// resumeConfirmation / cancel / getAuditRecord delegate straight through
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getBootStatus (2026-09-24) — "still connecting" / "failed to connect", reached only when the
// snapshot itself has no refusal entry for this id (never even admitted yet). Regression tests for
// commit 3e87d71c5, called out as missing in
// `ADS-memory/.local-artifacts/handoffs/2026-09-24-mcp-connect-ux.md`.
// ---------------------------------------------------------------------------

test("a federated id with no snapshot refusal, while the boot pass has not settled, is diagnosed as still connecting", async () => {
  const toolId = "mcp__echo-server__echo";
  const inner = stubExecutor(new Set([toolId]));
  const status: FederationBootStatus = { settled: false, connectFailures: [] };

  const result = await withFederatedRefusalDiagnosis(inner, () => [], () => status).execute(PRINCIPAL, RUN, toolId, {});

  assert.equal(result.status, "failed");
  assert.equal(result.errorKind, "validation");
  assert.equal(result.error, "External MCP server 'echo-server' is still connecting — try again in a moment.");
  // The exact throw text this diagnosis exists to stop the caller from seeing in its place.
  assert.doesNotMatch(result.error ?? "", /unknown tool/i);
});

test("a federated id with no snapshot refusal, once the boot pass has settled with a recorded connect failure, gets that failure's own reason", async () => {
  const toolId = "mcp__echo-server__echo";
  const inner = stubExecutor(new Set([toolId]));
  const status: FederationBootStatus = { settled: true, connectFailures: [{ connectionId: "echo-server", reason: "connect ECONNREFUSED" }] };

  const result = await withFederatedRefusalDiagnosis(inner, () => [], () => status).execute(PRINCIPAL, RUN, toolId, {});

  assert.equal(result.status, "failed");
  assert.equal(result.errorKind, "validation");
  assert.equal(result.error, "External MCP server 'echo-server' failed to connect: connect ECONNREFUSED");
});

test("a settled boot pass with no matching connect failure still throws unchanged — a genuinely unrelated/hallucinated id is not reinterpreted as 'still connecting'", async () => {
  const toolId = "mcp__echo-server__echo";
  const inner = stubExecutor(new Set([toolId]));
  const status: FederationBootStatus = { settled: true, connectFailures: [] };

  await assert.rejects(
    () => withFederatedRefusalDiagnosis(inner, () => [], () => status).execute(PRINCIPAL, RUN, toolId, {}),
    /unknown tool "mcp__echo-server__echo"/,
  );
});

test("getBootStatus omitted (the daemon's own call site) is byte-identical to before this parameter existed — still throws for an undiagnosed federated id", async () => {
  const toolId = "mcp__echo-server__echo";
  const inner = stubExecutor(new Set([toolId]));

  await assert.rejects(() => withFederatedRefusalDiagnosis(inner, () => []).execute(PRINCIPAL, RUN, toolId, {}), /unknown tool/);
});

test("resumeConfirmation, cancel, and getAuditRecord are untouched pass-throughs", () => {
  let resumed: [string, string] | null = null;
  let cancelled: string | null = null;
  const inner: ToolExecutor = {
    execute: async () => ({ executionId: "e", status: "completed" }),
    resumeConfirmation: (id, decision) => {
      resumed = [id, decision];
    },
    cancel: (id) => {
      cancelled = id;
    },
    getAuditRecord: (id) => ({ executionId: id, toolId: "t", principalId: "p", runId: "r", events: [] }),
  };
  const executor = withFederatedRefusalDiagnosis(inner, () => []);

  executor.resumeConfirmation("exec-1", "confirm");
  assert.deepEqual(resumed, ["exec-1", "confirm"]);

  executor.cancel("exec-2");
  assert.equal(cancelled, "exec-2");

  assert.deepEqual(executor.getAuditRecord("exec-3"), { executionId: "exec-3", toolId: "t", principalId: "p", runId: "r", events: [] });
});
