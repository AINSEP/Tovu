import assert from "node:assert/strict";
import test, { describe } from "node:test";

import type { AgentExecutorRunInput } from "@jini-ai/daemon";
import { resolveHostSignals } from "#src/server/runtime/composition/host-signals";
import { captureDaemonRun } from "./helpers/daemon-source.js";

/**
 * @file Behaviour pins for the last steps of a run launch (`agent-daemon-run-launch.ts`): the
 * withdrawal check right before the executor, the per-run model / effort / picked-folder fields
 * the executor and the chat-settings snapshot receive, and the owner's tool-gap audit failure
 * report. Drives the real `createRunStartHandler` through `captureDaemonRun`.
 */

const RUN_ID = "daemon-test-run";

describe("dispatchRun — a run withdrawn while it was being prepared", () => {
  test("a scope closed after the last tool-access check finishes the run as cancelled without launching the executor", async () => {
    const finishes: unknown[] = [];
    let launched = false;
    // The scope closes in the gap between the final liveness check (which still sees it open)
    // and dispatch: every check before the picked-folder read and that one check see it open.
    let checksAfterFolderRead = -1;
    await assert.rejects(captureDaemonRun({ prompt: "go" }, {
      lifecycle: { waitForTerminal: () => new Promise(() => {}), finish: async (input: unknown) => { finishes.push(input); } },
      bindings: {
        getCustomFsRoot: () => { checksAfterFolderRead = 0; return undefined; },
        isDisposed: () => checksAfterFolderRead >= 0 && ++checksAfterFolderRead > 1,
        agentExecutor: { run: async () => { launched = true; } },
      },
    }), { message: "onStarted did not call the executor" });
    assert.equal(checksAfterFolderRead, 2, "the final liveness check and the dispatch check both ran");
    assert.equal(launched, false);
    assert.deepEqual(finishes, [{ runId: RUN_ID, status: "cancelled", code: null, signal: null, resumable: false }]);
  });

  // Mutation: drop the liveness check after the launch's fresh policy read (the withdrawn run would
  // then record a chat-settings snapshot and read the picked folder before a later check stops it).
  test("a run withdrawn during the launch's fresh tool-policy read stops there: no settings snapshot, folder read, executor or finish", async () => {
    const finishes: unknown[] = [];
    const chatSettingsByRunId = new Map<string, unknown>();
    let folderReads = 0;
    let launched = false;
    // Each tool-policy read resolves the host signals once. Read 1 is the tool-access preparation;
    // read 2 is the launch's own fresh read, during which the scope closes.
    let policyReads = 0;
    await assert.rejects(captureDaemonRun({ prompt: "go" }, {
      lifecycle: { waitForTerminal: () => new Promise(() => {}), finish: async (input: unknown) => { finishes.push(input); } },
      bindings: {
        resolveHostSignals: (input: Parameters<typeof resolveHostSignals>[0]) => { policyReads += 1; return resolveHostSignals(input); },
        isDisposed: () => policyReads >= 2,
        chatSettingsByRunId,
        getCustomFsRoot: () => { folderReads += 1; return undefined; },
        agentExecutor: { run: async () => { launched = true; } },
      },
    }), { message: "onStarted did not call the executor" });
    assert.equal(policyReads, 2);
    assert.equal(chatSettingsByRunId.has(RUN_ID), false);
    assert.equal(folderReads, 0);
    assert.equal(launched, false);
    assert.deepEqual(finishes, []);
  });
});

describe("executeRun — per-run model, effort and picked folder", () => {
  test("the requested model and effort reach the executor and the run's chat-settings snapshot", async () => {
    const chatSettingsByRunId = new Map<string, { model?: string; effort?: string }>();
    const input = await captureDaemonRun({ prompt: "go", model: "model-x", reasoning: "high" }, { bindings: { chatSettingsByRunId } });
    assert.equal(input.model, "model-x");
    assert.equal((input as AgentExecutorRunInput & { reasoning?: string }).reasoning, "high");
    assert.equal(chatSettingsByRunId.get(RUN_ID)?.model, "model-x");
    assert.equal(chatSettingsByRunId.get(RUN_ID)?.effort, "high");
  });

  test("a run without a model or effort sends neither field", async () => {
    const chatSettingsByRunId = new Map<string, { model?: string; effort?: string }>();
    const input = await captureDaemonRun({ prompt: "go" }, { bindings: { chatSettingsByRunId } });
    assert.equal("model" in input, false);
    assert.equal("reasoning" in input, false);
    assert.ok(chatSettingsByRunId.has(RUN_ID));
    assert.equal(chatSettingsByRunId.get(RUN_ID)?.model ?? null, null);
    assert.equal(chatSettingsByRunId.get(RUN_ID)?.effort ?? null, null);
  });

  test("the composer's picked folder is read-only to the CLI and named in the run guidance", async () => {
    const guidance: Array<Record<string, unknown>> = [];
    const roots: unknown[] = [];
    const input = await captureDaemonRun({ prompt: "go" }, { bindings: {
      getCustomFsRoot: (required: unknown) => { roots.push(required); return "/picked/folder"; },
      assistantRuntimeGuidanceContext: { run: (value: Record<string, unknown>, fn: () => unknown) => { guidance.push(value); return fn(); } },
    } });
    assert.deepEqual(input.readOnlyExtraDirs, ["/picked/folder"]);
    assert.equal(guidance.length, 1);
    assert.equal(guidance[0]?.pickedFolder, "/picked/folder");
    assert.equal((roots[0] as { workspaceId: string }).workspaceId, "ws-daemon-test");
  });

  test("without a picked folder the CLI gets no extra directory and the guidance names none", async () => {
    const guidance: Array<Record<string, unknown>> = [];
    const input = await captureDaemonRun({ prompt: "go" }, { bindings: {
      assistantRuntimeGuidanceContext: { run: (value: Record<string, unknown>, fn: () => unknown) => { guidance.push(value); return fn(); } },
    } });
    assert.equal("readOnlyExtraDirs" in input, false);
    assert.equal(guidance.length, 1);
    assert.equal("pickedFolder" in (guidance[0] ?? {}), false);
  });
});

describe("observeRunToolGaps — the owner's audit", () => {
  test("a failed audit write is reported on the error log and the run still launches", async () => {
    const errors: string[] = [];
    const appended: unknown[] = [];
    const input = await captureDaemonRun({ prompt: "go" }, {
      lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async ({ onEvent }: { onEvent: (event: unknown) => void }) => {
        onEvent({ runId: RUN_ID, kind: "agent", ts: 1_000, payload: { type: "tool_use", id: "tool-1", name: "Read", input: { file_path: "a.txt" } } });
      } },
      bindings: {
        console: { error: (...args: unknown[]) => { errors.push(args.map(String).join(" ")); }, log() {}, warn() {} },
        routeDeps: { ownerPrincipalId: Promise.resolve("daemon-test-principal"),
          toolAttemptAuditSink: { append: async (entry: unknown) => { appended.push(entry); throw new Error("disk full"); } } },
      },
    });
    assert.equal(input.runId, RUN_ID);
    const deadline = Date.now() + 2000;
    while (errors.length === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(appended.length >= 1, "the owner's run writes its tool use to the audit sink");
    assert.ok(errors.includes("[tool-gaps] audit write failed"), `errors: ${JSON.stringify(errors)}`);
  });
});
