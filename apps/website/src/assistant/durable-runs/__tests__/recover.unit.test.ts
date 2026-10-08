import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentEvent } from "@jini-ai/chat/core";
import { createDurableRecovery, EXHAUSTED_NOTICE, SAVED_WORK_NOTICE } from "../recover.js";
import { CONCURRENT_RUN_REFUSAL_MESSAGE } from "../../agent-session-preset.js";
import { createRunAcceptance } from "../accept.js";
import { hasUnknownToolCall, UNKNOWN_MUTATION_ERROR } from "../continuation.js";
import type { DurableRun, DurableRunStore, RecoveryPorts, RunProbe } from "../ports.js";

import { INCIDENT_PARTIAL } from "./incident.fixture.js";
const TIME = 1_790_000_000_000;

test("recovery before any answer does not render a Continued divider on the first answer", async () => {
  const h = harness({ message: { id: "answer", role: "assistant", runId: "old", runStatus: "running", content: "", events: [] } });
  assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "attempt-failed" }, {}), "continued");
  assert.deepEqual(h.run()!.message.events, [{ kind: "status", code: "run_recovering", label: "Continuing…" }]);
});

function harness(overrides: Partial<DurableRun> = {}) {
  let clock = TIME + 20_000;
  let probe: RunProbe = "dead";
  let identityDead = false;
  let ordinal = 0;
  let current: DurableRun | null = {
    messageId: "answer", conversationId: "chat", runId: "old", workspaceId: "ws", principalId: "admin", engine: "daemon",
    request: { agentId: "codex", contextRef: JSON.stringify({ prompt: "Back up my site", conversationId: "chat" }) },
    message: { id: "answer", role: "assistant", runId: "old", runStatus: "running", content: INCIDENT_PARTIAL, events: [
      { kind: "text", text: INCIDENT_PARTIAL },
      { kind: "tool_use", id: "repo", name: "custom_credential_make_request", input: { method: "POST", path: "/user/repos" } },
      { kind: "tool_result", toolUseId: "repo", content: "201 Created", isError: false },
      { kind: "tool_use", id: "plan", name: "site_backup_plan", input: {} },
      { kind: "tool_result", toolUseId: "plan", content: '{"expiresAt":"2026-10-06T10:06:00Z"}', isError: false },
    ] },
    transcript: [{ id: "question", role: "user", content: "Back up my site" }],
    recoveryCount: 0, recoveryDeadline: null, attemptStartedAt: TIME, lastProgressAt: TIME,
    cancelReason: null, sessionId: null, sessionConfirmed: false, child: null, attemptBase: [], ...overrides,
  };
  const launches: Parameters<RecoveryPorts["launch"]>[0][] = [];
  const attached: string[] = [];
  const settlements: Parameters<RecoveryPorts["settle"]>[0][] = [];
  const canceled: string[] = [];
  const probes: string[] = [];
  const store: DurableRunStore = {
    async load() { return current; }, async find() { return current; }, async accept() { return current; },
    async advance({ run, nextRunId, events, now }) {
      if (!current || current.runId !== run.runId || current.cancelReason) return false;
      current = { ...current, runId: nextRunId, recoveryCount: current.recoveryCount + 1, attemptStartedAt: now,
        recoveryDeadline: current.recoveryDeadline ?? now + 300_000, attemptBase: events,
        message: { ...current.message, runId: nextRunId, runStatus: "queued", events: [...events] } };
      return true;
    },
    async cancel({ reason }) { if (current) current = { ...current, cancelReason: reason }; },
    async cancelPending() { return current; },
    async captureSession() { return true; }, async clearSession() {}, async guardTool() { return "allowed"; }, async completeTool() {},
    async recoveryClock() {},
  };
  const ports: RecoveryPorts = {
    store, now: () => clock, mintRunId: () => `next-${++ordinal}`,
    probe: async (run) => { probes.push(run.runId); return probe; }, attach: (run) => attached.push(run.runId),
    launch: async (required) => { launches.push(required); }, cancelAttempt: async (run) => { canceled.push(run.runId); },
    verifyChildDead: async () => identityDead, supportsNativeResume: () => true,
    async settle(value) {
      if (!current || current.runId !== value.runId || !["queued", "running"].includes(current.message.runStatus ?? "")) return false;
      settlements.push(value); current = { ...current, message: { ...current.message, ...value, runStatus: value.status } }; return true;
    },
  };
  const recovery = createDurableRecovery(ports, {});
  return { recovery, ports, launches, attached, settlements, canceled, probes, store, run: () => current,
    setProbe: (value: RunProbe) => { probe = value; }, setTime: (value: number) => { clock = value; },
    verifyDead: () => { identityDead = true; }, deleteBinding: () => { current = null; } };
}

test("dev restart kills the daemon: the incident resumes in the same message, preserving all 182 characters", async () => {
  const h = harness();
  assert.equal(INCIDENT_PARTIAL.length, 182);
  assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "boot" }, {}), "continued");
  assert.equal(h.run()!.messageId, "answer");
  assert.equal(h.run()!.message.content, INCIDENT_PARTIAL);
  assert.equal(h.run()!.runId, "next-1");
  const prompt = JSON.parse(h.launches[0]!.request.contextRef);
  assert.equal(prompt.recoveryMode, "reconstruction");
  assert.equal(prompt.prompt.includes(INCIDENT_PARTIAL), true);
  assert.equal(prompt.prompt.includes("201 Created"), true);
  assert.equal(prompt.prompt.includes("Expired plans or approvals must be re-planned and re-approved; never reuse them."), true);
  assert.equal(prompt.prompt.includes("Do not repeat completed mutations."), true);
  assert.equal(JSON.stringify(h.run()).includes("Send your message again"), false);
  assert.equal(h.settlements.length, 0);
});

test("two concurrent recover callers advance by CAS and launch exactly one attempt", async () => {
  const h = harness();
  await Promise.all([h.recovery.recover({ messageId: "answer", trigger: "boot" }, {}), h.recovery.recover({ messageId: "answer", trigger: "browser" }, {})]);
  assert.equal(h.launches.length, 1);
  assert.equal(h.run()!.recoveryCount, 1);
});

test("two successive dev restarts retain the logical message and start one continuation each", async () => {
  const h = harness();
  await h.recovery.recover({ messageId: "answer", trigger: "boot" }, {});
  h.setTime(TIME + 40_000);
  await h.recovery.recover({ messageId: "answer", trigger: "boot" }, {});
  assert.equal(h.launches.length, 2);
  assert.equal(h.run()!.messageId, "answer");
  assert.equal(h.run()!.recoveryCount, 2);
});

test("live reattaches and uncertain waits without spawning", async () => {
  for (const [probe, expected] of [["live", "reattached"], ["uncertain", "waiting"]] as const) {
    const h = harness(); h.setProbe(probe);
    assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "browser" }, {}), expected);
    assert.deepEqual(h.attached, ["old"]);
    assert.equal(h.launches.length, 0);
  }
});

test("a newly accepted queued attempt is allowed to finish its idempotent launch before a 404 advances it", async () => {
  const h = harness({ attemptStartedAt: TIME + 20_000 });
  assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "browser" }, {}), "waiting");
  assert.equal(h.launches.length, 0);
});

test("native continuation requires both confirmed session and verified death of the old child", async () => {
  for (const verified of [false, true]) {
    const h = harness({ sessionId: "thread", sessionConfirmed: true, child: { pid: 43, startedAt: "old-start" } });
    if (verified) h.verifyDead();
    await h.recovery.recover({ messageId: "answer", trigger: "boot" }, {});
    const context = JSON.parse(h.launches[0]!.request.contextRef);
    assert.equal(context.recoveryMode, verified ? "native" : "reconstruction");
    assert.equal(context.recoverySessionId, verified ? "thread" : undefined);
  }
});

for (const [name, changes] of [
  ["guest", { principalId: null }], ["public anonymous assistant", { engine: "public" }],
  ["BYOK", { engine: "byok" }], ["AG-UI", { engine: "agui" }],
  ["user Stop", { cancelReason: "user-stop" }], ["inactivity watchdog", { cancelReason: "inactivity-watchdog" }],
  ["auth failure", { message: { id: "answer", role: "assistant", content: INCIDENT_PARTIAL, runStatus: "running", events: [{ kind: "status", label: "Not logged in" }] } }],
] as const) {
  test(`${name} never auto-resumes`, async () => {
    const h = harness(changes as Partial<DurableRun>);
    assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "boot" }, {}), "finalized");
    assert.equal(h.launches.length, 0);
    assert.equal(h.settlements[0]!.content, INCIDENT_PARTIAL);
  });
}

test("deleted conversation binding and terminal rows cannot be reopened", async () => {
  const missing = harness(); missing.deleteBinding();
  assert.equal(await missing.recovery.recover({ messageId: "answer", trigger: "boot" }, {}), "gone");
  const terminal = harness({ message: { id: "answer", role: "assistant", content: INCIDENT_PARTIAL, runStatus: "canceled" } });
  assert.equal(await terminal.recovery.recover({ messageId: "answer", trigger: "boot" }, {}), "terminal");
  assert.equal(terminal.launches.length, 0);
});

test("Stop during uncertain backoff finalizes once and keeps partial text", async () => {
  const h = harness(); h.setProbe("uncertain");
  await h.recovery.recover({ messageId: "answer", trigger: "browser" }, {});
  await h.store.cancel({ runId: "old", reason: "user-stop" }, {});
  await h.recovery.recover({ messageId: "answer", trigger: "browser" }, {});
  await h.recovery.recover({ messageId: "answer", trigger: "boot" }, {});
  assert.equal(h.settlements.length, 1);
  assert.equal(h.settlements[0]!.content, INCIDENT_PARTIAL);
  assert.equal(h.launches.length, 0);
});

test("three attempts, five active recovery minutes, and thirty-minute staleness each finalize once", async () => {
  for (const [change, notice] of [
    [{ recoveryCount: 3 }, EXHAUSTED_NOTICE], [{ recoveryDeadline: TIME }, EXHAUSTED_NOTICE],
    [{ lastProgressAt: TIME - 30 * 60_000 }, SAVED_WORK_NOTICE],
  ] as const) {
    const h = harness(change);
    await h.recovery.recover({ messageId: "answer", trigger: "boot" }, {});
    await h.recovery.recover({ messageId: "answer", trigger: "boot" }, {});
    assert.equal(h.settlements.length, 1);
    assert.deepEqual(h.settlements[0]!.events.at(-1), { kind: "status", label: notice });
    assert.equal(h.settlements[0]!.content, INCIDENT_PARTIAL);
  }
});

test("unknown identical mutating call is recognized independent of key order and a new tool-use id", () => {
  const events: AgentEvent[] = [{ kind: "tool_use", id: "orphan", name: "custom_credential_make_request", input: { path: "/user/repos", method: "POST" } }];
  assert.equal(hasUnknownToolCall({ events, toolId: "custom_credential_make_request", input: { method: "POST", path: "/user/repos" } }, {}), true);
  assert.equal(hasUnknownToolCall({ events: [...events, { kind: "tool_result", toolUseId: "orphan", content: "201", isError: false }], toolId: "custom_credential_make_request", input: { method: "POST", path: "/user/repos" } }, {}), false);
  assert.equal(UNKNOWN_MUTATION_ERROR, "This operation may already be done. Its earlier outcome is unknown; verify the current state before repeating it.");
});

test("acceptance persists before launch, remains watched if dispatch loses its response, and duplicates use one attempt id", async () => {
  const h = harness({ message: { id: "answer", role: "assistant", content: "", runStatus: "queued" } });
  const order: string[] = [];
  h.store.accept = async () => { order.push("persist"); return h.run(); };
  const acceptance = createRunAcceptance({ store: h.store, now: () => TIME, mintRunId: () => "unused",
    launch: async ({ run }) => { order.push(`launch:${run.runId}`); throw new Error("response lost"); },
    attach: (run) => order.push(`watch:${run.runId}`),
  }, {});
  const args = { principalId: "admin", workspaceId: "ws", conversationId: "chat", messageId: "answer", request: h.run()!.request };
  await acceptance.accept(args, {}); await acceptance.accept(args, {});
  assert.deepEqual(order, ["persist", "launch:old", "watch:old", "persist", "launch:old", "watch:old"]);
});

test("three failed continuation dispatches exhaust once without losing saved text", async () => {
  const h = harness();
  const recovery = createDurableRecovery({ ...h.ports, launch: async () => { throw new Error("daemon unavailable"); } }, {});
  for (let attempt = 1; attempt <= 3; attempt++) {
    h.setTime(TIME + attempt * 20_000);
    assert.equal(await recovery.recover({ messageId: "answer", trigger: "attempt-failed" }, {}), "continued");
    assert.equal(h.run()!.recoveryCount, attempt);
  }
  assert.equal(await recovery.recover({ messageId: "answer", trigger: "attempt-failed" }, {}), "finalized");
  assert.equal(await recovery.recover({ messageId: "answer", trigger: "boot" }, {}), "terminal");
  assert.equal(h.settlements.length, 1);
  assert.equal(h.settlements[0]!.content, INCIDENT_PARTIAL);
  assert.deepEqual(h.settlements[0]!.events.at(-1), { kind: "status", label: EXHAUSTED_NOTICE });
});

test("a stream timeout keeps an uncertain attempt waiting while its five-minute budget remains", async () => {
  const h = harness(); h.setProbe("uncertain");
  assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "timeout" }, {}), "waiting");
  assert.equal(h.settlements.length, 0); assert.equal(h.launches.length, 0);
});

test("a positively live quiet attempt keeps waiting on its approval beyond thirty minutes", async () => {
  const h = harness({ recoveryCount: 3, recoveryDeadline: TIME });
  h.setProbe("live"); h.setTime(TIME + 30 * 60_000);
  assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "timeout" }, {}), "reattached");
  assert.equal(h.launches.length, 0); assert.deepEqual(h.attached, ["old"]);
  assert.equal(h.settlements.length, 0); assert.deepEqual(h.canceled, []);
  assert.deepEqual(h.probes, ["old"]);
});

for (const probe of ["dead", "uncertain"] as const) {
  test(`a stale ${probe} executor still finalizes with saved work`, async () => {
    const h = harness({ lastProgressAt: TIME - 30 * 60_000 }); h.setProbe(probe);
    assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "timeout" }, {}), "finalized");
    assert.equal(h.settlements[0]!.content, INCIDENT_PARTIAL);
    assert.deepEqual(h.settlements[0]!.events.at(-1), { kind: "status", label: SAVED_WORK_NOTICE });
  });
}

for (const label of [
  "HTTP 400: invalid_request_error", "HTTP 403: permission denied", "HTTP 404: model not found",
  "HTTP 402: payment required", "HTTP 429: insufficient_quota", "credit balance is too low",
  "context_length_exceeded", "model_not_found", "This model does not support images", CONCURRENT_RUN_REFUSAL_MESSAGE,
]) {
  test(`permanent attempt failure finalizes once: ${label}`, async () => {
    const h = harness({ message: { id: "answer", role: "assistant", runStatus: "running", content: INCIDENT_PARTIAL,
      events: [{ kind: "text", text: INCIDENT_PARTIAL }, { kind: "status", label }] } });
    assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "attempt-failed" }, {}), "finalized");
    assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "boot" }, {}), "terminal");
    assert.equal(h.launches.length, 0); assert.equal(h.settlements.length, 1);
    assert.equal(h.settlements[0]!.status, "failed");
    assert.equal(h.settlements[0]!.content, INCIDENT_PARTIAL);
    assert.equal(h.settlements[0]!.events.some((event) => event.kind === "status" && event.label === label), true);
  });
}

for (const label of ["HTTP 408: request timeout", "HTTP 429: too many requests", "HTTP 503: overloaded", "ECONNRESET", "request timed out"]) {
  test(`transient attempt failure continues: ${label}`, async () => {
    const h = harness({ message: { id: "answer", role: "assistant", runStatus: "running", content: INCIDENT_PARTIAL,
      events: [{ kind: "status", label }] } });
    assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "attempt-failed" }, {}), "continued");
    assert.equal(h.launches.length, 1); assert.equal(h.settlements.length, 0);
  });
}

test("failure classification ignores answer text and tool errors from completed work", async () => {
  const h = harness({ message: { id: "answer", role: "assistant", runStatus: "running", content: INCIDENT_PARTIAL,
    events: [{ kind: "text", text: "Not logged in; HTTP 400" }, { kind: "tool_result", toolUseId: "read", content: "inactivity watchdog", isError: true }] } });
  assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "attempt-failed" }, {}), "continued");
});

test("a permanent error in executor stderr is finalized through the same classification", async () => {
  const h = harness({ message: { id: "answer", role: "assistant", runStatus: "running", content: INCIDENT_PARTIAL,
    events: [{ kind: "raw", line: 'API Error: 400 {"error":{"type":"invalid_request_error"}}' }] } });
  assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "attempt-failed" }, {}), "finalized");
  assert.equal(h.launches.length, 0); assert.equal(h.settlements[0]!.status, "failed");
});

test("boot and browser recovery also honor a persisted permanent attempt failure", async () => {
  for (const trigger of ["boot", "browser"] as const) {
    const h = harness({ message: { id: "answer", role: "assistant", runStatus: "running", content: INCIDENT_PARTIAL,
      events: [{ kind: "status", label: CONCURRENT_RUN_REFUSAL_MESSAGE }] } });
    assert.equal(await h.recovery.recover({ messageId: "answer", trigger }, {}), "finalized");
    assert.equal(h.launches.length, 0); assert.equal(h.settlements[0]!.status, "failed");
  }
});

test("a compacted continuation still classifies its current failure after the recovery marker", async () => {
  const oldFailure: AgentEvent = { kind: "status", label: "HTTP 400: invalid_request_error" };
  const marker: AgentEvent = { kind: "status", code: "run_recovering", label: "Continuing…" };
  const base: AgentEvent[] = [oldFailure, { kind: "text", text: "Partial" }, { kind: "text", text: "\nContinued\n" }, marker];
  for (const [label, expected] of [["HTTP 400: invalid_request_error", "finalized"], ["HTTP 503: overloaded", "continued"]] as const) {
    const h = harness({ attemptBase: base, message: { id: "answer", role: "assistant", runStatus: "running", content: INCIDENT_PARTIAL,
      events: [oldFailure, { kind: "text", text: "Partial\nContinued\n" }, marker, { kind: "status", label }] } });
    assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "attempt-failed" }, {}), expected);
  }
});

test("fresh liveness from the watcher reattaches without a second probe", async () => {
  const h = harness();
  assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "timeout", expectedRunId: "old" }, { liveRunId: "old" }), "reattached");
  assert.deepEqual(h.probes, []); assert.equal(h.launches.length, 0);
});

test("live evidence from an older attempt does not suppress the current attempt's probe", async () => {
  const h = harness();
  assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "browser" }, { liveRunId: "previous" }), "continued");
  assert.deepEqual(h.probes, ["old"]);
});

test("a failed end outranks a fresh live HTTP record", async () => {
  const h = harness();
  assert.equal(await h.recovery.recover({ messageId: "answer", trigger: "attempt-failed" }, { liveRunId: "old" }), "continued");
  assert.deepEqual(h.probes, []); assert.equal(h.launches.length, 1);
});

test("run acceptance removes pasted credentials before the durable store sees its envelope", async () => {
  const h = harness();
  let captured = "";
  const acceptance = createRunAcceptance({
    store: { ...h.store, async accept({ request }) { captured = request.contextRef; return null; } },
    now: () => TIME, mintRunId: () => "safe-attempt", launch: async () => assert.fail("not accepted"), attach: () => assert.fail("not accepted"),
  }, {});
  const secret = "sk-" + "A1b2C3d4E5f6G7h8I9j0";
  assert.equal(await acceptance.accept({ principalId: "admin", workspaceId: "ws", conversationId: "chat", messageId: "answer",
    request: { agentId: "codex", contextRef: JSON.stringify({ prompt: `Save ${secret} please`, conversationId: "chat" }) },
  }, {}), null);
  assert.equal(captured.includes(secret), false);
  assert.deepEqual(JSON.parse(captured), { prompt: "Save [token removed] please", conversationId: "chat", secretRedacted: true });
});
