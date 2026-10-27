import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createContributionRegistry, type Principal, type SurfaceEmission } from "@jini-ai/core";
import { createDelegatedToolBridge, createRemoteToolExecutor, type RunLifecycle } from "@jini-ai/daemon";
import { SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { createApp, createRouteDeps } from "../../app.js";
import { bootAuthenticated, loginAsBarePrincipal } from "../../../../__tests__/helpers/http-test-server.js";
import { ALL_CHAT_DELETE_TOOLS } from "../../../../../assistant/permanent-delete-tool-gate.js";
import { ASSISTANT_PERMANENT_DELETES_NAMESPACE, ASSISTANT_PERMANENT_DELETES_KEY } from "../../../../../contracts/headless/assistant-permanent-deletes-policy.js";
import { set as setSiteSetting } from "../../../../../features/settings/index.js";
import { toWriteServiceDeps } from "../../../../inbound/admin-http/routes/settings/shared.js";
import { POST_ENTITY_TYPE } from "../../../../../features/trash/adapters/post.js";
import { MCP_UI_TOOL_CALLS_PATH, createByokToolSurface, type DerivedToolContributor, type ToolContributor } from "../../../../../assistant/index.js";
import { installFirstPartyToolContributors } from "../../tool-catalog-manifest.js";
import { constrainPrincipalToReadOnlyTools } from "../../../../../assistant/read-only-tool-constraint.js";
import { ensureAgentDaemonToken, ensureToolExecToken, TOOL_EXEC_TOKEN_ENV_VAR } from "../../../../../assistant/daemon-access.js";
import { hasUnknownToolCall } from "#src/assistant/durable-runs/continuation";
import type { RouteDeps } from "../../../../routes/types.js";

/**
 * @file The server end of the agent daemon's tool RPC (ADR-070), through the real `createApp` on a
 * real socket with Jini's real `createRemoteToolExecutor` as the client: the daemon side of the hop
 * once W3-C cuts over. What a site tool does when the daemon asks must equal what it does in-process.
 */

const TOKEN = ensureToolExecToken({}, {});
const DAEMON_TOKEN = ensureAgentDaemonToken({}, {});

async function boot(t: import("node:test").TestContext) {
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const ownerId = await deps.ownerPrincipalId;
  return { deps, baseUrl, cookie, owner: { id: ownerId } as Principal };
}

function remote(baseUrl: string, context?: unknown) {
  return createRemoteToolExecutor({ baseUrl, token: TOKEN }, context === undefined ? {} : { contextFor: () => context });
}

function stripExecutionId<T extends { executionId?: unknown }>(result: T): Omit<T, "executionId"> {
  const { executionId: _executionId, ...rest } = result;
  return rest;
}

function firstPartyContributions() {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  return contributions;
}

async function grantChatDeletes(deps: RouteDeps) {
  await deps.identityReady; await deps.settingsUiTabsReady;
  await setSiteSetting({ deps: toWriteServiceDeps(deps), input: {
    namespace: ASSISTANT_PERMANENT_DELETES_NAMESPACE, key: ASSISTANT_PERMANENT_DELETES_KEY,
    scope: "workspace", value: ALL_CHAT_DELETE_TOOLS, workspaceId: deps.workspaceId,
    authWorkspaceId: deps.workspaceId, callerPrincipalId: await deps.ownerPrincipalId,
  } });
}

async function trashRowFor(deps: RouteDeps, postId: string): Promise<string | undefined> {
  const page = await deps.trash.list({ workspaceId: deps.workspaceId, now: deps.clock.nowIso(), limit: 50 });
  return page.items.find((item) => item.entityType === POST_ENTITY_TYPE && item.entityId === postId)?.id;
}

async function seedTrashedPost(deps: RouteDeps, postId: string): Promise<string> {
  await deps.postRepo.save({ id: postId, workspaceId: deps.workspaceId, title: "RPC purge probe", slug: postId,
    bodyJson: { type: "doc", content: [] }, bodyFormat: "doc", bodyHtml: null, status: "draft", kind: "post", updatedAt: deps.clock.nowIso(), version: 1 });
  const marker = await deps.trash.trash({ workspaceId: deps.workspaceId, entityType: POST_ENTITY_TYPE, entityId: postId,
    actor: { principalId: "seed" }, display: { title: "RPC purge probe" }, at: deps.clock.nowIso(), expectedVersion: 1 });
  assert.equal(marker.ok, true);
  const trashItemId = await trashRowFor(deps, postId);
  assert.ok(trashItemId);
  return trashItemId;
}

function extractExchangeId(emission: SurfaceEmission): string {
  const found = /__exchangeId\\*":\\*"([^"\\]+)/.exec(JSON.stringify(emission))?.[1];
  assert.ok(found, `expected an interpolated ${SURFACE_EXCHANGE_ID_PARAM} in the relayed surface`);
  return found;
}

function postTool(baseUrl: string, body: string, headers: Record<string, string>): Promise<Response> {
  return fetch(`${baseUrl}/internal/tool-executions`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
}

const call = (principal: Principal, toolId: string, input: unknown, runId = "rpc-run") => ({ principal, run: { id: runId }, toolId, input });

test("the tool RPC route is mounted on the real app and answers like the in-process executor", async (t) => {
  const { deps, baseUrl, owner } = await boot(t);
  const remoteResult = await remote(baseUrl).execute(call(owner, "content_read.site", {}));
  assert.equal(remoteResult.status, "completed");
  const local = createByokToolSurface(deps, { contributions: firstPartyContributions(), installExtensions: false });
  const localResult = await local.executor.execute(call(owner, "content_read.site", {}));
  assert.deepEqual(stripExecutionId(remoteResult), stripExecutionId(localResult));
});

test("the server's own gates refuse a bare principal and a read-only-constrained one", async (t) => {
  const { deps, baseUrl, owner } = await boot(t);
  await loginAsBarePrincipal(deps, baseUrl, { username: "rpc-bare" });
  const bare = await remote(baseUrl).execute(call({ id: "bare-rpc-bare" }, "content_read.site", {}));
  assert.equal(bare.status, "failed");
  assert.match(String((bare as { error?: unknown }).error), /'bare-rpc-bare' is not authorized .*no_grant/);
  const before = (await deps.postRepo.list({ workspaceId: deps.workspaceId })).length;
  const readOnly = constrainPrincipalToReadOnlyTools(owner);
  const refused = await remote(baseUrl).execute(call(readOnly, "content_post_create", { kind: "post", title: "Must not exist", slug: "must-not-exist" }));
  assert.equal(refused.status, "denied");
  assert.equal((await deps.postRepo.list({ workspaceId: deps.workspaceId })).length, before);
});

test("a gated tool parks, its surface is relayed over the stream, and the browser's confirm purges", async (t) => {
  const { deps, baseUrl, cookie, owner } = await boot(t);
  await grantChatDeletes(deps);
  const postId = `rpc-purge-${Date.now()}`;
  const trashItemId = await seedTrashedPost(deps, postId);
  let resolveSurface!: (emission: SurfaceEmission) => void;
  const surface = new Promise<SurfaceEmission>((resolve) => { resolveSurface = resolve; });
  // A failed assertion below must not leave the call parked until the production TTL.
  const controller = new AbortController();
  t.after(() => controller.abort());
  const pending = remote(baseUrl).execute(call(owner, "trash_purge_item", { trashItemId }), { signal: controller.signal, emitSurface: async (emission) => resolveSurface(emission) });
  const exchangeId = extractExchangeId(await surface);
  const redeem = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, { method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ toolName: "trash_purge_item", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" } }) });
  assert.equal(redeem.status, 202);
  assert.equal((await pending).status, "completed");
  assert.equal(await trashRowFor(deps, postId), undefined);
});

test("aborting the daemon's call while it is parked cancels it on the server", async (t) => {
  const { deps, baseUrl, owner } = await boot(t);
  await grantChatDeletes(deps);
  const trashItemId = await seedTrashedPost(deps, `rpc-abort-${Date.now()}`);
  const controller = new AbortController();
  let surfaced!: () => void;
  const parked = new Promise<void>((resolve) => { surfaced = resolve; });
  const pending = remote(baseUrl).execute(call(owner, "trash_purge_item", { trashItemId }, "rpc-abort-run"), { signal: controller.signal, emitSurface: async () => surfaced() });
  await parked;
  controller.abort();
  await pending.catch(() => undefined);
  const sink = deps.toolAttemptAuditSink as unknown as { events: Array<{ phase?: string; runId?: string }> };
  for (let i = 0; i < 50 && !sink.events.some((event) => event.phase === "cancelled"); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(sink.events.some((event) => event.phase === "cancelled"), `audit phases: ${sink.events.map((event) => event.phase).join(",")}`);
});

test("the catalog is per principal and fresh on every request", async (t) => {
  const { deps, baseUrl, owner } = await boot(t);
  await loginAsBarePrincipal(deps, baseUrl, { username: "rpc-cat" });
  const catalog = async (principalId: string) => {
    const res = await fetch(`${baseUrl}/internal/tool-catalog?principalId=${encodeURIComponent(principalId)}`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(res.status, 200);
    return ((await res.json()) as { tools: Array<{ id: string }> }).tools.map((tool) => tool.id);
  };
  assert.ok(!(await catalog("bare-rpc-cat")).includes("trash_purge_item"));
  assert.ok((await catalog(owner.id)).includes("trash_purge_item"));
  assert.ok(!(await catalog("bare-rpc-cat")).includes("trash_purge_item"));
});

test("site_describe_capabilities lists the tools the daemon runs itself", async (t) => {
  const { baseUrl, owner } = await boot(t);
  const result = await remote(baseUrl, { localToolIds: ["page_rpc_probe_local"] }).execute(call(owner, "site_describe_capabilities", {}));
  assert.equal(result.status, "completed");
  assert.match(JSON.stringify(result), /page_rpc_probe_local/);
  // Listed under the caller's own delete grant (owners hold all), as `executeMetaTool` lists it.
  assert.match(JSON.stringify(result), /trash_purge_item/);
  const without = await remote(baseUrl).execute(call(owner, "site_describe_capabilities", {}));
  assert.doesNotMatch(JSON.stringify(without), /page_rpc_probe_local/);
});

test("the route takes a 1 MB authed body, refuses it unauthed, and refuses the daemon token", async (t) => {
  const { baseUrl, owner } = await boot(t);
  const big = JSON.stringify({ executionId: "e-big", principal: owner, run: { id: "r" }, toolId: "content_post_list", input: { pad: "x".repeat(1024 * 1024) } });
  const authed = await postTool(baseUrl, big, { authorization: `Bearer ${TOKEN}` });
  assert.equal(authed.status, 200);
  assert.match(await authed.text(), /"type":"(result|throw)"/);
  assert.equal((await postTool(baseUrl, big, {})).status, 401);
  assert.equal((await postTool(baseUrl, big, { authorization: `Bearer ${DAEMON_TOKEN}` })).status, 401);
});

test("the tool-exec token never reaches process.env, refusals, the catalog, or the browser auth routes", async (t) => {
  const { baseUrl, cookie, owner } = await boot(t);
  assert.equal(process.env[TOOL_EXEC_TOKEN_ENV_VAR], undefined);
  assert.ok(!Object.values(process.env).includes(TOKEN));
  const texts = [
    await (await postTool(baseUrl, "{}", {})).text(),
    await (await fetch(`${baseUrl}/internal/tool-catalog?principalId=${owner.id}`, { headers: { authorization: `Bearer ${TOKEN}` } })).text(),
    await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).text(),
    await (await fetch(`${baseUrl}/api/admin/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "tovu-dev" }) })).text(),
  ];
  for (const text of texts) assert.ok(!text.includes(TOKEN));
});

/** A loopback TCP hop that RSTs the client the moment a `"type":"result"` line arrives from the server. */
async function startResettingProxy(t: import("node:test").TestContext, target: URL): Promise<string> {
  const proxy = net.createServer((client) => {
    const upstream = net.connect(Number(target.port), "127.0.0.1");
    client.pipe(upstream);
    upstream.on("data", (chunk: Buffer) => {
      if (chunk.toString("utf8").includes('"type":"result"')) { client.resetAndDestroy(); upstream.destroy(); return; }
      client.write(chunk);
    });
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
  });
  proxy.listen(0, "127.0.0.1");
  await new Promise((resolve) => proxy.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => proxy.close(() => resolve())));
  return `http://127.0.0.1:${(proxy.address() as net.AddressInfo).port}`;
}

test("a committed write whose response is dropped is OUTCOME UNKNOWN, ran once, and blocks a blind repeat", async (t) => {
  const { deps, baseUrl, owner } = await boot(t);
  const proxyUrl = await startResettingProxy(t, new URL(baseUrl));
  const events: Array<Record<string, unknown>> = [];
  const lifecycle = { emit: async ({ input }: { input: { data: Record<string, unknown> } }) => { events.push(input.data); }, onCancelRequested: () => () => {} } as unknown as RunLifecycle;
  const bridge = createDelegatedToolBridge({ lifecycle, toolExecutor: remote(proxyUrl) });
  const input = { kind: "post", title: "RPC dropped response", slug: `rpc-dropped-${Date.now()}` };
  await assert.rejects(bridge.execute({ runId: "rpc-drop-run", toolUseId: "tu-1", toolId: "content_post_create", principal: owner, input }),
    (error: { name?: string; code?: string }) => error.name === "ToolRpcError" && error.code === "TOOL_OUTCOME_UNKNOWN");
  const created = (await deps.postRepo.list({ workspaceId: deps.workspaceId })).filter((post) => post.slug === input.slug);
  assert.equal(created.length, 1);
  const agentEvents = events.map(({ type, ...rest }) => ({ kind: type, ...rest })) as never;
  assert.equal(hasUnknownToolCall({ events: agentEvents, toolId: "content_post_create", input }), true);
});

test("app.ts reaches neither the daemon server nor a disk attachment store", async () => {
  const { build } = await import("esbuild");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const result = await build({ entryPoints: [path.join(here, "../../app.ts")], bundle: true, write: false, metafile: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(!inputs.some((input) => input.endsWith("agent-daemon-server.ts")), "app.ts must not bundle agent-daemon-server.ts");
  const bundled = result.outputFiles.map((file) => file.text).join("\n");
  assert.ok(!bundled.includes("createDiskAttachmentStore"), "the server must not construct an attachment store");
});
