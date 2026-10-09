import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import { createToolRegistry, type Principal, type ToolRegistration } from "@jini-ai/core";
import { getAgentDef } from "@jini-ai/agent-runtime";
import { sniffContentType } from "@jini-ai/cms/media";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor, prepareMessageAttachments } from "@jini-ai/daemon";
import { createDiskAttachmentStore, delegatedToolExecuteRoute, type DelegatedToolsHttpDeps } from "@jini-ai/daemon/http";
import { constrainPrincipalToReadOnlyTools } from "#src/assistant/read-only-tool-constraint";
import { parseRunStartContextRef } from "#src/assistant/run-start-context";
import { buildListPendingChatAttachmentsTool } from "#src/features/media/list-pending-chat-attachments";
import { readChatAttachmentForOwner } from "#src/features/media/read-chat-attachment";
import { createLiveRunTracker, failRunBeforeStart, waitForStoppingRuns, STOPPING_RUN_WAIT_MS } from "../../../../assistant/agent-session-preset.js";
import { extractSessionRefFromEndEvent, shouldClearSessionOnFailedResume } from "../../../../assistant/agent-session-preset.js";
import { captureDaemonRun, daemonFunction, daemonInitializer, daemonSource, evaluateDaemonExpression } from "./helpers/daemon-source.js";

/** Evaluate the real registration's resolver, not a test-written callback that already knows the
 * refs. Importing the daemon entry would start its server; AST evaluation keeps its binding intact. */
function discoveryRegistration(bindings: Record<string, unknown>): ToolRegistration {
  let call: ts.CallExpression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "buildListPendingChatAttachmentsTool") call = node;
    ts.forEachChild(node, visit);
  };
  visit(daemonSource);
  assert.ok(call, "the daemon must register attachment discovery");
  return evaluateDaemonExpression<ToolRegistration>(call, { buildListPendingChatAttachmentsTool, parseRunStartContextRef, ...bindings });
}

test("Claude Local-CLI claiming and delegated discovery share the actual accepted-message binding", async () => {
  const root = await mkdtemp(join(tmpdir(), "tovu-cli-attachment-binding-"));
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const principalByRunId = new Map<string, Principal>();
  const messageAttachmentRefsByRunId = new Map<string, readonly string[]>();
  try {
    const store = await createDiskAttachmentStore({ uploadDirectory: root }, { retainAcrossRestarts: true });
    const bytes = new Uint8Array(334);
    bytes.set([0x1a, 0x45, 0xdf, 0xa3]); // A file-kind WebM, matching the live upload's generic claim path.
    const stage = async (batchId: string, ownerId: string) => {
      const directory = await store.createBatchDirectory({ batchId }, {});
      const path = join(directory, "clip.webm");
      await writeFile(path, bytes);
      return store.register({ input: { batchId, path, name: "clip.webm", kind: "file", size: bytes.length, ownerId } }, {});
    };
    const video = await stage("accepted-message", "uploading-admin");
    const unrelated = await stage("other-conversation", "uploading-admin");
    const otherOwner = await stage("other-admin-message", "other-admin");
    const otherClaim = await stage("other-run-message", "uploading-admin");
    await store.claim({ attachments: [otherClaim], runId: "other-run" }, {});

    const context = { prompt: "describe this video", principalId: "uploading-admin", conversationId: "current-chat",
      assistantMessageId: "durable-answer-id", attachmentIds: [video.path] };
    const { run } = await lifecycle.start({ contextRef: JSON.stringify(context) }, { runId: "daemon-test-run", agentId: "claude" });
    // This is the contract the old unit test bypassed: get() exposes status, never contextRef.
    assert.equal("contextRef" in (await lifecycle.get({ runId: run.id }))!, false);
    const registration = discoveryRegistration({ lifecycle, attachmentStore: store, messageAttachmentRefsByRunId });
    const resolveAttachmentRunFields = evaluateDaemonExpression<(required: unknown, optional: {}) => Promise<unknown>>(
      daemonFunction("resolveAttachmentRunFields"),
      { attachmentStore: store, DEFAULT_AGENT_ID: "claude", getAgentDef, prepareMessageAttachments, readFile, sniffContentType, failRunBeforeStart },
    );
    const launched = await captureDaemonRun(context, {
      lifecycle, request: { agentId: "claude" }, bindings: {
        principalByRunId, messageAttachmentRefsByRunId, attachmentStore: store, resolveAttachmentRunFields,
        liveRunTracker: createLiveRunTracker({}, {}), waitForStoppingRuns, STOPPING_RUN_WAIT_MS,
        extractSessionRefFromEndEvent, shouldClearSessionOnFailedResume,
        runCredentials: { revoke() {} }, runOwners: { record() {}, forget() {} }, RUN_OWNER_RETENTION_MS: 0,
        routeDeps: { workspaceId: "ws-attachment-regression", chatRunLedger: {}, agentSessions: {
          getSessionId: async () => null, setSessionId: async () => {}, clearSessionId: async () => {},
        } },
      },
    });
    assert.equal(launched.runId, run.id);
    assert.equal(launched.agentId, "claude");
    assert.match(launched.prompt, /clip\.webm/u);
    assert.ok(launched.uploadRoot, "the real claim/preparation path must grant the batch directory");
    assert.equal((await store.listPendingForOwner({ ownerId: context.principalId }, {})).some(item => item.ref === video.path), false,
      "startup must have claimed the video before delegated tools run");

    const registry = createToolRegistry({});
    registry.register(registration);
    const resolvePrincipal = evaluateDaemonExpression<DelegatedToolsHttpDeps["resolvePrincipal"]>(daemonInitializer("resolvePrincipal"),
      { principalByRunId, constrainPrincipalToReadOnlyTools });
    const deps = { lifecycle, resolvePrincipal, toolRegistry: registry, toolExecutor: createToolExecutor({ registry }) };
    const result = await delegatedToolExecuteRoute.handle({ input: {
      runId: launched.runId, toolUseId: "claude-discover", toolId: registration.descriptor.id, input: {}, requireReadOnly: true,
    }, deps });
    if (!result.ok) assert.fail(result.error.message);
    const output = result.value.result.output as { attachments: { attachmentRef: string }[] };
    assert.deepEqual(output.attachments.map(item => item.attachmentRef), [video.path]);
    const read = await readChatAttachmentForOwner({ uploadDirectory: root }, { ref: output.attachments[0]!.attachmentRef, ownerId: context.principalId });
    assert.equal(read.ok, true, "the discovered opaque ref must pass the video tool's actual owner-scoped reader");
    if (read.ok) assert.deepEqual(Uint8Array.from(read.bytes), bytes);
    assert.equal((await readChatAttachmentForOwner({ uploadDirectory: root }, { ref: otherOwner.path, ownerId: context.principalId })).ok, false);

    // Unknown bindings fail closed even while this owner has other pending uploads.
    assert.deepEqual(await registration.handler({ executionId: "unbound", principal: { id: context.principalId },
      run: { id: "unbound-run" }, input: {}, signal: new AbortController().signal }), { attachments: [] });
    await lifecycle.finish({ runId: run.id, status: "succeeded", code: 0, signal: null, resumable: false });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(messageAttachmentRefsByRunId.has(run.id), false, "terminal cleanup must release the message binding");
    assert.equal(principalByRunId.has(run.id), false);
    assert.deepEqual(await registration.handler({ executionId: "terminal", principal: { id: context.principalId },
      run: { id: run.id }, input: {}, signal: new AbortController().signal }), { attachments: [] });
    assert.ok((await store.listPendingForOwner({ ownerId: context.principalId }, {})).some(item => item.ref === unrelated.path));
  } finally {
    // Release lifecycle subscriptions/watchdogs even if the regression assertion fails.
    await lifecycle.finish({ runId: "daemon-test-run", status: "failed", code: null, signal: null, resumable: false }).catch(() => {});
    await new Promise<void>(resolve => setImmediate(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
