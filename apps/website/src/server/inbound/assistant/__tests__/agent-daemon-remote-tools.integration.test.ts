/** ADR-070: server tools must resolve uploads through the live daemon-owned store. */
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import ts from "typescript";
import { createDiskAttachmentStore, createRemoteAttachmentLookup } from "@jini-ai/daemon/http";
import { createRunScopedCredentials, registerDaemonAttachmentLookup } from "#src/assistant/daemon-access";
import { startTestServer } from "../../../__tests__/helpers/http-test-server.js";
import { daemonFunction, daemonSource, evaluateDaemonStatements } from "./helpers/daemon-source.js";

/** Execute the real entry's lookup registration without booting its databases or agent CLIs. */
async function bootAttachmentOwner(t: import("node:test").TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), "daemon-attachment-owner-"));
  const store = await createDiskAttachmentStore({ uploadDirectory: directory }, { retainAcrossRestarts: true });
  t.after(async () => { await store.dispose(); await rm(directory, { recursive: true, force: true }); });
  const statements = daemonFunction("start").body!.statements;
  const registration = statements.find(statement => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(daemonSource) === "registerDaemonAttachmentLookup");
  assert.ok(registration, "the daemon must mount its authenticated attachment lookup after creating its store");
  const storeAssignment = statements.find(statement => ts.isExpressionStatement(statement)
    && ts.isBinaryExpression(statement.expression)
    && statement.expression.left.getText(daemonSource) === "attachmentStore");
  assert.ok(storeAssignment);
  assert.ok(statements.indexOf(storeAssignment) < statements.indexOf(registration), "lookup must capture the initialized store");
  const app = express();
  const token = "attachment-owner-test-token";
  await evaluateDaemonStatements([registration], {
    app, attachmentStore: store,
    // Keep the production gate and inject only the boot secret, never a substitute registrar.
    registerDaemonAttachmentLookup: (required: Parameters<typeof registerDaemonAttachmentLookup>[0]) =>
      registerDaemonAttachmentLookup(required, { env: { TOVU_AGENT_DAEMON_TOKEN: token } }),
  });
  const baseUrl = await startTestServer(app, t);
  return { store, token, baseUrl };
}

test("post-boot uploaded attachment resolves through the daemon owner", async t => {
  const { store, token, baseUrl } = await bootAttachmentOwner(t);
  const lookup = createRemoteAttachmentLookup({ baseUrl, token });
  assert.deepEqual(await lookup.listPendingForOwner({ ownerId: "owner" }), []);
  // Upload AFTER mounting the route. A boot-time copy of the store's records would miss this.
  const batchId = "post-boot";
  const directory = await store.createBatchDirectory({ batchId });
  const filePath = path.join(directory, "after-boot.txt");
  await writeFile(filePath, "after boot", { mode: 0o600 });
  const uploaded = await store.register({ input: {
    batchId, path: filePath, name: "after-boot.txt", kind: "file", size: 10, ownerId: "owner",
  } });
  assert.deepEqual(await lookup.listPendingForOwner({ ownerId: "other-owner" }), []);
  assert.deepEqual(await lookup.listPendingForOwner({ ownerId: "owner" }), await store.listPendingForOwner({ ownerId: "owner" }));
  const resolved = await lookup.resolveForRun({ ref: uploaded.path, runId: "owning-run" });
  assert.ok(resolved);
  assert.equal(await readFile(resolved.path, "utf8"), "after boot");
  assert.deepEqual(resolved, await store.resolveForRun({ ref: uploaded.path, runId: "owning-run" }));
  await assert.rejects(lookup.resolveForRun({ ref: uploaded.path, runId: "other-run" }), /claimed/);
});

test("attachment lookup refuses missing and run-scoped credentials before parsing", async t => {
  const { baseUrl } = await bootAttachmentOwner(t);
  const credentials = createRunScopedCredentials({ principalOfLiveRun: ({ runId }) => runId === "owning-run" ? "owner" : undefined }, {});
  const runToken = credentials.mint({ runId: "owning-run" }, {});
  assert.ok(credentials.resolveCaller({ token: runToken }), "the negative probe carries a valid live-run credential");
  for (const authorization of [undefined, `Bearer ${runToken}`]) {
    const response = await fetch(`${baseUrl}/internal/attachment-lookup`, {
      method: "POST", headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
      body: "{invalid-json",
    });
    assert.equal(response.status, 401);
  }
});

/** The real daemon executor expression must route to the site; testing a hand-built remote
 * executor alone would stay green while the product still ran tools in its disconnected store. */
async function bootDaemonRpc(t: import("node:test").TestContext, options: { dropResponse?: boolean } = {}) {
  const { createToolRegistry } = await import("@jini-ai/core");
  const { createToolExecutor, createRoutingToolExecutor } = await import("@jini-ai/daemon");
  const { withReadOnlyToolConstraint } = await import("#src/assistant/read-only-tool-constraint");
  const { createRouteDeps } = await import("#src/server/runtime/composition/app");
  const { registerAssistantToolExecRoutes } = await import("#src/server/runtime/composition/modules/assistant-tool-exec");
  const { acceptToolRun, startResettingToolProxy } = await import("#src/server/runtime/composition/modules/__tests__/assistant-tool-exec.fixture");
  const { ensureToolExecToken } = await import("#src/assistant/daemon-access");
  const { createDaemonSiteTools } = await import("../agent-daemon-site-tools.js");
  const { daemonInitializer, evaluateDaemonExpression } = await import("./helpers/daemon-source.js");
  const deps = createRouteDeps();
  await deps.identityReady;
  const principal = { id: await deps.ownerPrincipalId };
  await acceptToolRun({ deps, runId: "remote-run", principalId: principal.id });
  let writes = 0;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let aborted!: () => void;
  const serverAborted = new Promise<void>(resolve => { aborted = resolve; });
  const serverRegistry = createToolRegistry({});
  serverRegistry.register({ descriptor: { id: "site_write_probe", readOnly: false }, policy: { authorize: () => "allow" }, handler: async () => {
    writes++;
    await deps.postRepo.save({ id: "remote-post", workspaceId: deps.workspaceId, title: "Remote site write", slug: "remote-post", status: "draft", kind: "post",
      bodyJson: { type: "doc", content: [] }, bodyFormat: "doc", bodyHtml: null, updatedAt: deps.clock.nowIso(), version: 1 });
    return { id: "remote-post" };
  } });
  serverRegistry.register({ descriptor: { id: "site_wait_probe", readOnly: true }, policy: { authorize: () => "allow" }, handler: async ({ signal }) => {
    entered();
    await new Promise<void>(resolve => { signal.addEventListener("abort", () => { aborted(); resolve(); }, { once: true }); });
    return { stopped: true };
  } });
  const serverApp = express();
  registerAssistantToolExecRoutes({ router: serverApp, toolSurface: { daemonCalls: {
    executor: createToolExecutor({ registry: serverRegistry }), listToolsFor: () => serverRegistry.list({}),
  } }, runStore: deps.chatRunLedger.durable, workspaceId: deps.workspaceId });
  const siteUrl = await startTestServer(serverApp, t);
  const baseUrl = options.dropResponse ? await startResettingToolProxy(t, new URL(siteUrl)) : siteUrl;
  const registry = createToolRegistry({});
  const siteTools = createDaemonSiteTools({ baseUrl, token: ensureToolExecToken({}, {}), localRegistry: registry, contextFor: () => ({}) });
  await siteTools.start({ runId: "remote-run", principalId: principal.id });
  t.after(() => siteTools.finish({ runId: "remote-run" }));
  const toolExecutor = evaluateDaemonExpression<import("@jini-ai/daemon").ToolExecutor>(daemonInitializer("toolExecutor"), {
    createRoutingToolExecutor, withReadOnlyToolConstraint, registry, siteTools,
    localToolExecutor: createToolExecutor({ registry }),
  });
  const events: Record<string, unknown>[] = [];
  let cancel = () => {};
  const lifecycle = {
    emit: async ({ input }: { input: { data: Record<string, unknown> } }) => { events.push(input.data); },
    onCancelRequested: ({ listener }: { listener: () => void }) => { cancel = listener; return () => {}; },
  } as unknown as import("@jini-ai/daemon").RunLifecycle;
  const { createDelegatedToolBridge } = await import("@jini-ai/daemon");
  const bridge = createDelegatedToolBridge({ lifecycle, toolExecutor });
  const execute = (toolId: string) => siteTools.withRun({ runId: "remote-run", fn: () => bridge.execute({
    runId: "remote-run", principal, toolUseId: "remote-use", toolId, input: {},
  }) });
  return { execute, events, started, serverAborted, cancel: () => cancel(), deps, writes: () => writes };
}

test("delegation records tool_use and tool_result", async t => {
  const fixture = await bootDaemonRpc(t);
  assert.equal((await fixture.execute("site_write_probe")).status, "completed");
  assert.deepEqual(fixture.events.map(event => event.type), ["tool_use", "tool_result"]);
  assert.equal(fixture.events[0]?.id, "remote-use");
  assert.equal(fixture.events[1]?.toolUseId, "remote-use");
});

test("cancel aborts the server handler", { timeout: 5000 }, async t => {
  const fixture = await bootDaemonRpc(t);
  const pending = fixture.execute("site_wait_probe");
  await fixture.started;
  fixture.cancel();
  await pending.catch(() => undefined);
  await fixture.serverAborted;
});

test("committed write with dropped response dispatches once", async t => {
  const fixture = await bootDaemonRpc(t, { dropResponse: true });
  await assert.rejects(fixture.execute("site_write_probe"), (error: { code?: string }) => error.code === "TOOL_OUTCOME_UNKNOWN");
  assert.equal(fixture.writes(), 1);
  assert.ok(await fixture.deps.postRepo.findById({ id: "remote-post", workspaceId: fixture.deps.workspaceId }));
  assert.equal(fixture.events.at(-1)?.type, "tool_result");
});

test("memory site writes are visible in the server", async t => {
  const fixture = await bootDaemonRpc(t);
  await fixture.execute("site_write_probe");
  assert.equal((await fixture.deps.postRepo.findById({ id: "remote-post", workspaceId: fixture.deps.workspaceId }))?.title, "Remote site write");
  assert.equal(fixture.writes(), 1);
});
