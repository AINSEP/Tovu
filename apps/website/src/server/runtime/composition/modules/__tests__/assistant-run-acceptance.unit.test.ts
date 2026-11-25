import assert from "node:assert/strict";
import test from "node:test";

import { ROUTINES_RELEASE_ENABLED } from "@tovu/contracts/routines";
import { acceptOwnedAssistantRun, cancelOwnedRun, createOwnerChatAcceptance, sanitizeBrowserRunContext } from "../assistant-run-acceptance.js";

/**
 * @file Owner-chat acceptance seam. The marker tests are the security-relevant ones: a routine marker
 * exists only when the TRUSTED optional `routine` supplies it, never from the browser context.
 */

const MARKER = { routineId: "r1", runId: "run1", catchUp: false, slotAt: 5 } as const;

function harness(options: { polls?: Array<{ cursor: string; messageJson?: string } | null> } = {}) {
  const accepted: Array<{ request: { agentId?: string; contextRef: string }; principalId: string; conversationId: string; messageId: string }> = [];
  const launched: string[] = [];
  const attached: string[] = [];
  const cancels: Array<{ runId: string; reason: string }> = [];
  const recovered: string[] = [];
  const sleeps: number[] = [];
  const polls = [...(options.polls ?? [])];
  const store = {
    accept: async (input: never) => {
      const i = input as { request: { agentId?: string; contextRef: string }; principalId: string; conversationId: string; messageId: string; runId: string };
      accepted.push(i);
      return { runId: i.runId, messageId: i.messageId, conversationId: i.conversationId, request: i.request, message: { runStatus: "queued" }, recoveryCount: 0, cancelReason: null, principalId: i.principalId, workspaceId: "ws" };
    },
    poll: async () => polls.shift() ?? null,
    head: async () => ({ runId: "run-x", messageId: "m1", conversationId: "c1", principalId: "owner", workspaceId: "ws" }),
    cancel: async (input: { runId: string; reason: string }) => { cancels.push(input); },
    cancelPending: async () => null,
  };
  const acceptance = createOwnerChatAcceptance({
    store: store as never, now: () => 1, mintRunId: () => "run-x",
    launch: async ({ run }) => { launched.push(run.messageId); },
    attach: (run) => { attached.push(run.messageId); },
    recover: async ({ messageId }) => { recovered.push(messageId); },
    sleep: async ({ ms }) => { sleeps.push(ms); },
  }, {});
  return { acceptance, accepted, launched, attached, cancels, recovered, sleeps };
}

const base = { principalId: "owner", workspaceId: "ws", conversationId: "c1", messageId: "m1" };

test("browser-supplied context.routine is stripped", async () => {
  const h = harness();
  await h.acceptance.acceptOwnerChatRun({ ...base, context: { prompt: "hi", routine: { routineId: "evil", runId: "x", catchUp: true, slotAt: 1 } } }, {});
  const context = JSON.parse(h.accepted[0]!.request.contextRef) as Record<string, unknown>;
  assert.equal("routine" in context, false);
  assert.equal(context.principalId, "owner");
  // The browser proxy fallback shares the same strip.
  const forwarded = sanitizeBrowserRunContext({ decoded: { prompt: "hi", routine: MARKER, recoveryMode: "native", recoverySessionId: "s" } }, {});
  assert.deepEqual(forwarded, { prompt: "hi" });
});

test("a trusted routine option replaces any browser marker with the trusted values", async () => {
  const h = harness();
  await h.acceptance.acceptOwnerChatRun({ ...base, context: { prompt: "p", routine: { routineId: "evil" } } }, { agentId: "claude", routine: MARKER });
  const context = JSON.parse(h.accepted[0]!.request.contextRef) as Record<string, unknown>;
  assert.deepEqual(context.routine, MARKER);
  assert.equal(h.accepted[0]!.request.agentId, "claude");
});

test("acceptance commits before launch and the launch and attach use the accepted message", async () => {
  const h = harness();
  const run = await h.acceptance.acceptOwnerChatRun({ ...base, context: { prompt: "p" } }, {});
  assert.equal(run?.messageId, "m1");
  assert.deepEqual(h.launched, ["m1"]);
  assert.deepEqual(h.attached, ["m1"]);
});

test("settlement maps the saved run status, backing off 1 to 5 seconds and sharing one read per tick", async () => {
  const running = JSON.stringify({ runStatus: "running", content: "", events: [] });
  const done = JSON.stringify({ runStatus: "succeeded", content: "All  done.\nThanks", events: [{ kind: "x" }] });
  const h = harness({ polls: [{ cursor: "a", messageJson: running }, { cursor: "a" }, { cursor: "a" }, { cursor: "a" }, { cursor: "b", messageJson: done }] });
  const seen: unknown[][] = [];
  const result = await h.acceptance.watchSettlement({ principalId: "owner", workspaceId: "ws", messageId: "m1" }, { onEvents: (events) => { seen.push([...events]); } });
  assert.deepEqual(result, { status: "completed", text: "All  done.\nThanks" });
  assert.deepEqual(h.sleeps, [1000, 2000, 4000, 5000]);
  assert.equal(seen.length, 2);
});

test("settlement preserves failed and canceled and treats a missing run as failed", async () => {
  const failed = harness({ polls: [{ cursor: "a", messageJson: JSON.stringify({ runStatus: "failed", content: "boom" }) }] });
  assert.equal((await failed.acceptance.watchSettlement({ principalId: "owner", workspaceId: "ws", messageId: "m1" }, {})).status, "failed");
  const canceled = harness({ polls: [{ cursor: "a", messageJson: JSON.stringify({ runStatus: "canceled", content: "" }) }] });
  assert.equal((await canceled.acceptance.watchSettlement({ principalId: "owner", workspaceId: "ws", messageId: "m1" }, {})).status, "canceled");
  const missing = harness({ polls: [null] });
  assert.equal((await missing.acceptance.watchSettlement({ principalId: "owner", workspaceId: "ws", messageId: "m1" }, {})).status, "failed");
});

test("settlement stops when the signal aborts", async () => {
  const h = harness({ polls: [{ cursor: "a", messageJson: JSON.stringify({ runStatus: "running", content: "" }) }] });
  const controller = new AbortController();
  controller.abort();
  const result = await h.acceptance.watchSettlement({ principalId: "owner", workspaceId: "ws", messageId: "m1" }, { signal: controller.signal });
  assert.equal(result.status, "canceled");
});

test("cancelChatRun cancels the owned run by saved message id and recovers it once", async () => {
  const h = harness();
  assert.equal(await h.acceptance.cancelChatRun({ ...base }, { reason: "routine-interrupted" }), true);
  assert.deepEqual(h.cancels, [{ runId: "run-x", reason: "routine-interrupted" }]);
  assert.deepEqual(h.recovered, ["m1"]);
  // Another owner's run is not cancelable through this seam.
  assert.equal(await h.acceptance.cancelChatRun({ ...base, principalId: "other" }, {}), false);
  assert.equal(h.cancels.length, 1);
});

/** Codex FIX 14: P6's AG-UI entry (`acceptOwnedAssistantRun`) and P3's trusted routine acceptance share one seam. */
function agUiPorts(h: ReturnType<typeof harness>) {
  const store = { accept: async (input: never) => { const i = input as { runId: string; messageId: string; principalId: string; conversationId: string; request: unknown };
    h.accepted.push(i as never); return { ...i, workspaceId: "ws", message: { runStatus: "queued" }, recoveryCount: 0, cancelReason: null }; } };
  return { store: store as never, now: () => 1, mintRunId: () => "run-x", onAccepted: () => {}, launch: async ({ run }: { run: { messageId: string } }) => { h.launched.push(run.messageId); }, watch: () => {} } as never;
}

test("the AG-UI entry strips a browser routine marker: no browser path can stamp routine authority", async () => {
  const h = harness();
  const run = await acceptOwnedAssistantRun({ ...base, request: { contextRef: JSON.stringify({ prompt: "hi", routine: MARKER, recoveryMode: "native" }) }, ports: agUiPorts(h) }, {});
  assert.ok(run);
  const context = JSON.parse(h.accepted[0]!.request.contextRef) as Record<string, unknown>;
  assert.equal("routine" in context, false);
  assert.equal("recoveryMode" in context, false);
  assert.equal(context.prompt, "hi");
});

test("Stop from the owner-chat seam reaches the SAME run the AG-UI entry accepted", async () => {
  const h = harness();
  const run = await acceptOwnedAssistantRun({ ...base, request: { contextRef: "{}" }, ports: agUiPorts(h) }, {});
  const store = { head: async () => run, cancel: async (input: { runId: string; reason: string }) => { h.cancels.push(input); } };
  assert.equal(await cancelOwnedRun({ store: store as never, recover: async ({ messageId }) => { h.recovered.push(messageId); } }, { ...base }), true);
  assert.deepEqual(h.cancels, [{ runId: run!.runId, reason: "user-stop" }]);
  assert.deepEqual(h.recovered, ["m1"]);
});

test("durable ownership is authorized before Stop: another principal or workspace cannot cancel", async () => {
  for (const [name, scope] of [["principal", { ...base, principalId: "intruder" }], ["workspace", { ...base, workspaceId: "ws-other" }]] as const) {
    const h = harness();
    const run = await acceptOwnedAssistantRun({ ...base, request: { contextRef: "{}" }, ports: agUiPorts(h) }, {});
    const store = { head: async () => run, cancel: async (input: { runId: string; reason: string }) => { h.cancels.push(input); } };
    assert.equal(await cancelOwnedRun({ store: store as never, recover: async () => {} }, scope), false, name);
    assert.deepEqual(h.cancels, [], name);
  }
});

test("Codex FIX 3: routines stay dark — the release flag is off at the host root", () => {
  assert.equal(ROUTINES_RELEASE_ENABLED, false);
});
