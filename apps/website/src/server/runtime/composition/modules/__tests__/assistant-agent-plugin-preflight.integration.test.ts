import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import express from "express";
import { createRouteDeps } from "../../app.js";
import { ensureToolExecToken } from "#src/assistant/daemon-access";
import { registerAssistantToolExecRoutes } from "../assistant-tool-exec.js";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { AutomaticPluginRun } from "@jini-ai/agent-plugins/site/automatic-agent-plugins";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createTempSiteLayoutFixture } from "#src/__tests__/fixtures/site-layout-context";
import { resolveAgentPluginRefs } from "#src/features/agent-plugins/lifecycle";
import { createAssistantByokModule } from "../assistant-byok.js";
import { testToolReporter } from "#src/assistant/__tests__/helpers/tool-reporter";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { createDaemonSiteTools } from "#src/server/inbound/assistant/agent-daemon-site-tools";

test("preflight keeps pinned guidance when its credential-bearing controller fails", async (t) => {
  const source = ts.createSourceFile("assistant-tool-exec.ts", readFileSync(new URL("../assistant-tool-exec.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "prepareAutomaticSitePlugins");
  assert.ok(declaration, "the preflight function exists");
  const code = ts.transpileModule(`return (${declaration.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const warnings = t.mock.method(console, "warn", () => undefined);
  const prepare = new Function("delegatedAssistantDaemonConnection", "getAgentDef", "describeErrorForLog", code)(
    () => ({ token: "private", url: "http://localhost" }), () => undefined, describeErrorForLog,
  );
  const result = await prepare({ run: { runId: "run", principalId: "owner", conversationId: "chat", request: {} },
    context: { pluginRefIds: [], prompt: "question" }, pinnedPrefix: "pinned guidance", res: { once() {} }, lookup: async () => undefined,
    plugins: { controller: { start: async () => { throw Object.assign(new Error("boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET"), { code: "EIO" }); }, forget() {} }, emit: async () => {} },
  });
  assert.equal(result, "pinned guidance");
  assert.equal(warnings.mock.calls[0]?.arguments[0], "[agent-plugins] automatic preflight unavailable");
  assert.match(String(warnings.mock.calls[0]?.arguments[1]), /Error/);
  assert.match(String(warnings.mock.calls[0]?.arguments[1]), /EIO/);
  assert.doesNotMatch(JSON.stringify(warnings.mock.calls.map(call => call.arguments)), /boom|SECRETSECRETSECRETSECRET/);
});

test("plugin preflight uses the site's live run identity and releases terminal consent", async t => {
  const deps = createRouteDeps();
  const conversationId = "plugin-chat";
  await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: "member" }).create({ id: conversationId });
  await deps.chatRunLedger.durable!.accept({ conversationId, messageId: "plugin-answer", runId: "plugin-run", principalId: "member", workspaceId: deps.workspaceId,
    now: Date.now(), request: { contextRef: JSON.stringify({ prompt: "use the plugin", userPrompt: "the user's own words", principalId: "forged-context", conversationId: "forged-chat", pluginRefIds: ["picked"] }) } }, {});
  const contexts: AutomaticPluginRun[] = [];
  const messages: (string | undefined)[] = [];
  const forgotten: string[] = [];
  const app = express();
  registerAssistantToolExecRoutes({ router: app, workspaceId: deps.workspaceId, runStore: deps.chatRunLedger.durable,
    toolSurface: { daemonCalls: { executor: { execute: async () => ({ executionId: "unused", status: "completed" }), cancel() {}, getAuditRecord: () => null, resumeConfirmation: () => { throw new Error("unused"); } }, listToolsFor: async () => [] } },
    plugins: {
      controller: { start: async ({ context, messageId }) => { contexts.push(context); messages.push(messageId); await context.publish({ conversationId: context.conversationId, state: context.state, plugins: [] }); return "automatic guidance"; }, forget: ({ runId }) => { forgotten.push(runId); } },
      pinnedPrefix: async ({ pluginRefIds }) => { assert.deepEqual(pluginRefIds, ["picked"]); return "pinned guidance"; },
      emit: async ({ principalId, runId, payload }) => { assert.equal(principalId, "member"); assert.equal(runId, "plugin-run"); assert.equal(payload.type, "agent_plugins"); },
      refusalPrefix: () => "withheld tools",
    }, reporter: createRouteIncidentReporter().reporter }, {});
  const baseUrl = await startTestServer(app, t);
  // Boot installs the RPC token before serving, including before an unauthenticated first request.
  const token = ensureToolExecToken({}, {});
  const post = (body: unknown, authenticated = true) => fetch(`${baseUrl}/internal/agent-plugin-preflight`, { method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post({ runId: "plugin-run" }, false)).status, 401);
  for (const body of [{}, { runId: "missing" }, { runId: "plugin-run", principalId: "owner" }]) assert.ok([400, 404].includes((await post(body)).status));
  assert.equal(contexts.length, 0);
  const response = await post({ runId: "plugin-run" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { prefix: "pinned guidance\n\nautomatic guidance", refusalPrefix: "withheld tools", pluginIds: [] });
  assert.equal(contexts[0]?.principal.id, "member");
  assert.equal(contexts[0]?.conversationId, conversationId);
  assert.equal(contexts[0]?.query, "the user's own words");
  assert.deepEqual(messages, ["plugin-answer"]);
  await deps.chatRunLedger.durable!.cancel({ runId: "plugin-run", reason: "user-stop" }, {});
  assert.equal((await post({ runId: "plugin-run" })).status, 404);
  assert.ok(forgotten.includes("plugin-run"));
});

test("a stopped run cannot publish late plugin consent or receive a prepared prefix", { timeout: 5000 }, async t => {
  const deps = createRouteDeps();
  const conversationId = "stopped-plugin-chat";
  await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: "member" }).create({ id: conversationId });
  await deps.chatRunLedger.durable!.accept({ conversationId, messageId: "stopped-answer", runId: "stopped-run", principalId: "member", workspaceId: deps.workspaceId,
    now: Date.now(), request: { contextRef: JSON.stringify({ prompt: "hello", principalId: "member" }) } }, {});
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  t.after(() => release());
  let emissions = 0;
  const forgotten: string[] = [];
  const app = express();
  registerAssistantToolExecRoutes({ router: app, workspaceId: deps.workspaceId, runStore: deps.chatRunLedger.durable,
    toolSurface: { daemonCalls: { executor: { execute: async () => ({ executionId: "unused", status: "completed" }), cancel() {}, getAuditRecord: () => null, resumeConfirmation: () => { throw new Error("unused"); } }, listToolsFor: async () => [] } },
    plugins: { controller: { start: async ({ context }) => { assert.equal(context.query, "hello", "a missing userPrompt falls back to the saved prompt"); entered(); await waiting; await context.publish({ conversationId, state: context.state, plugins: [] }); return "late"; }, forget: ({ runId }) => { forgotten.push(runId); } },
      pinnedPrefix: async () => "", emit: async () => { emissions++; }, refusalPrefix: () => "" }, reporter: createRouteIncidentReporter().reporter }, {});
  const baseUrl = await startTestServer(app, t);
  const pending = fetch(`${baseUrl}/internal/agent-plugin-preflight`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${ensureToolExecToken({}, {})}` }, body: JSON.stringify({ runId: "stopped-run" }) });
  assert.equal(await Promise.race([started.then(() => "started"), pending.then(() => "responded")]), "started", "a valid preflight must reach the server controller");
  await deps.chatRunLedger.durable!.cancel({ runId: "stopped-run", reason: "user-stop" }, {});
  release();
  assert.equal((await pending).status, 404);
  assert.equal(emissions, 0);
  assert.ok(forgotten.includes("stopped-run"));
});

test("pinned preflight always inlines text and carries its identity, even with pointer environment delivery", async t => {
  const previous = process.env.TOVU_AGENT_PLUGIN_DELIVERY;
  process.env.TOVU_AGENT_PLUGIN_DELIVERY = "pointer";
  t.after(() => { if (previous === undefined) delete process.env.TOVU_AGENT_PLUGIN_DELIVERY; else process.env.TOVU_AGENT_PLUGIN_DELIVERY = previous; });
  const site = createTempSiteLayoutFixture({});
  t.after(site.cleanup);
  const deps = { ...createRouteDeps(), ...site.deps };
  await Promise.all([deps.pluginRuntimeReady, deps.siteTitleReady]);
  const pluginId = "preflight-notes", digest = "a".repeat(64);
  const workspace = deps.agentPluginLayout.forWorkspace({ workspaceId: deps.workspaceId });
  const packageDir = path.join(workspace.pluginPackagesDir({ pluginId }), digest);
  await mkdir(path.join(packageDir, "skills", pluginId), { recursive: true });
  await writeFile(path.join(packageDir, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" }));
  const guidance = `---\nname: ${pluginId}\ndescription: Notes\n---\nPINNED_BEGIN\n${"Full guidance. ".repeat(700)}\nPINNED_END`;
  await writeFile(path.join(packageDir, "skills", pluginId, "SKILL.md"), guidance);
  await writeFile(path.join(workspace.root, "activations.json"), JSON.stringify({ schemaVersion: 1, plugins: { [pluginId]: { enabled: true, origin: "bundled", updatedAt: "2026-10-18T00:00:00.000Z", updatedBy: "fixture" } } }));
  await writeFile(path.join(workspace.root, "bundled-digests.json"), JSON.stringify({ schemaVersion: 1, plugins: { [pluginId]: { archiveDigest: digest } } }));
  const expected = await resolveAgentPluginRefs({ pluginRefIds: [pluginId], workspaceLayout: workspace }, { deliveryMode: 'inject' });
  assert.equal(expected.ok, true);
  if (!expected.ok) throw new Error("fixture guidance unavailable");
  assert.ok(expected.promptPrefix.includes(guidance));
  const principalId = await deps.ownerPrincipalId, conversationId = "pinned-pointer-chat", runId = "pinned-pointer-run";
  await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: principalId }).create({ id: conversationId });
  await deps.chatRunLedger.durable!.accept({ conversationId, messageId: "pinned-pointer-answer", runId, principalId, workspaceId: deps.workspaceId,
    now: Date.now(), request: { contextRef: JSON.stringify({ prompt: "Read notes", pluginRefIds: [pluginId] }) } }, {});
  const app = express();
  createAssistantByokModule({ reporter: testToolReporter(), routeDeps: deps }).registerToolExecRoutes({ router: app });
  const baseUrl = await startTestServer(app, t);
  const response = await fetch(`${baseUrl}/internal/agent-plugin-preflight`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${ensureToolExecToken({}, {})}` }, body: JSON.stringify({ runId }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { prefix: expected.promptPrefix, refusalPrefix: "", pluginIds: [pluginId] });
});

/** A real BYOK-composed site with one pinned plugin; `bump` advances the stored attempt like a recovery would. */
async function pinnedOfferSite(t: import("node:test").TestContext, { runId }: { runId: string }) {
  const site = createTempSiteLayoutFixture({});
  t.after(site.cleanup);
  const base = { ...createRouteDeps(), ...site.deps };
  await Promise.all([base.pluginRuntimeReady, base.siteTitleReady]);
  const pluginId = "offer-notes", digest = "b".repeat(64);
  const workspace = base.agentPluginLayout.forWorkspace({ workspaceId: base.workspaceId });
  const packageDir = path.join(workspace.pluginPackagesDir({ pluginId }), digest);
  await mkdir(path.join(packageDir, "skills", pluginId), { recursive: true });
  await writeFile(path.join(packageDir, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" }));
  await writeFile(path.join(packageDir, "skills", pluginId, "SKILL.md"), `---\nname: ${pluginId}\ndescription: Notes\n---\nOFFER_PINNED_TEXT`);
  await writeFile(path.join(workspace.root, "activations.json"), JSON.stringify({ schemaVersion: 1, plugins: { [pluginId]: { enabled: true, origin: "bundled", updatedAt: "2026-10-18T00:00:00.000Z", updatedBy: "fixture" } } }));
  await writeFile(path.join(workspace.root, "bundled-digests.json"), JSON.stringify({ schemaVersion: 1, plugins: { [pluginId]: { archiveDigest: digest } } }));
  const durable = base.chatRunLedger.durable!;
  let bump = 0;
  const store = Object.assign(Object.create(durable) as typeof durable, {
    find: async (required: Parameters<typeof durable.find>[0], optional: Parameters<typeof durable.find>[1]) => {
      const head = await durable.find(required, optional);
      return head && { ...head, recoveryCount: head.recoveryCount + bump };
    },
  });
  const deps = { ...base, chatRunLedger: { ...base.chatRunLedger, durable: store } };
  const principalId = await deps.ownerPrincipalId, conversationId = `${runId}-chat`;
  await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: principalId }).create({ id: conversationId });
  await durable.accept({ conversationId, messageId: `${runId}-answer`, runId, principalId, workspaceId: deps.workspaceId,
    now: Date.now(), request: { contextRef: JSON.stringify({ prompt: "Read notes", pluginRefIds: [pluginId] }) } }, {});
  const app = express();
  createAssistantByokModule({ routeDeps: deps, reporter: testToolReporter() }).registerToolExecRoutes({ router: app });
  const baseUrl = await startTestServer(app, t);
  const post = (body: unknown) => fetch(`${baseUrl}/internal/agent-plugin-preflight`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${ensureToolExecToken({}, {})}` }, body: JSON.stringify(body) });
  return { post, pluginId, durable, baseUrl, principalId, recover: () => { bump++; } };
}

test("a recovered run's old offer cannot commit", async t => {
  const site = await pinnedOfferSite(t, { runId: "recovered-run" });
  const offered = await site.post({ op: "offer", runId: "recovered-run" });
  assert.equal(offered.status, 200);
  assert.equal(offered.headers.get("cache-control"), "no-store");
  const first = await offered.json() as { prefix: string; pluginIds: string[]; offer: { offerId: string } | null };
  assert.match(first.prefix, /OFFER_PINNED_TEXT/);
  assert.deepEqual(first.pluginIds, [], "offering records nothing");
  assert.ok(first.offer?.offerId);
  site.recover();
  const stale = await site.post({ op: "commit", runId: "recovered-run", offerId: first.offer.offerId, deliveredIds: [] });
  assert.equal(stale.status, 409);
  assert.doesNotMatch(await stale.text(), /OFFER_PINNED_TEXT/);
  const current = await (await site.post({ op: "offer", runId: "recovered-run" })).json() as { pluginIds: string[]; offer: { offerId: string } };
  assert.deepEqual(current.pluginIds, [], "the refused commit changed no delivery");
  assert.notEqual(current.offer.offerId, first.offer.offerId, "a replacement attempt does not inherit an old offer");
  const committed = await site.post({ op: "commit", runId: "recovered-run", offerId: current.offer.offerId, deliveredIds: [] });
  assert.equal(committed.status, 200);
  assert.deepEqual(await committed.json(), { pluginIds: [site.pluginId] });
  const replay = await site.post({ op: "commit", runId: "recovered-run", offerId: current.offer.offerId, deliveredIds: [] });
  assert.deepEqual(await replay.json(), { pluginIds: [site.pluginId] }, "a lost reply's retry returns the cached receipt");
});

test("stopped and replaced attempts cannot commit a live offer", async t => {
  const site = await pinnedOfferSite(t, { runId: "stopped-offer-run" });
  const { offer } = await (await site.post({ op: "offer", runId: "stopped-offer-run" })).json() as { offer: { offerId: string } };
  site.recover();
  assert.equal((await site.post({ op: "commit", runId: "stopped-offer-run", offerId: offer.offerId, deliveredIds: [] })).status, 409, "a replaced attempt is refused");
  const replacement = await (await site.post({ op: "offer", runId: "stopped-offer-run" })).json() as { offer: { offerId: string } };
  await site.durable.cancel({ runId: "stopped-offer-run", reason: "user-stop" }, {});
  assert.equal((await site.post({ op: "commit", runId: "stopped-offer-run", offerId: replacement.offer.offerId, deliveredIds: [] })).status, 404, "a stopped attempt is refused");
  assert.equal((await site.post({ op: "commit", runId: "stopped-offer-run", offerId: "forged-offer", deliveredIds: ["offer-notes"], attempt: 0 })).status, 400);
});

test("preflight refusal logs neither server secrets nor candidate text", async t => {
  const deps = createRouteDeps();
  await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: "member" }).create({ id: "canary-chat" });
  await deps.chatRunLedger.durable!.accept({ conversationId: "canary-chat", messageId: "canary-answer", runId: "canary-run", principalId: "member", workspaceId: deps.workspaceId,
    now: Date.now(), request: { contextRef: JSON.stringify({ prompt: "CANDIDATE_PROMPT_CANARY" }) } }, {});
  const warnings = t.mock.method(console, "warn", () => undefined);
  const leak = () => Object.assign(new Error("tovu_ak_0123456789ab.SERVER_SECRET_CANARY CANDIDATE_PROMPT_CANARY"), { code: "EIO" });
  const app = express();
  registerAssistantToolExecRoutes({ router: app, workspaceId: deps.workspaceId, runStore: deps.chatRunLedger.durable,
    toolSurface: { daemonCalls: { executor: { execute: async () => ({ executionId: "unused", status: "completed" }), cancel() {}, getAuditRecord: () => null, resumeConfirmation: () => { throw new Error("unused"); } }, listToolsFor: async () => [] } },
    plugins: { controller: { start: async () => { throw leak(); }, offer: async () => { throw leak(); }, commit: async () => { throw leak(); }, forget() {} },
      pinnedPrefix: async () => "", emit: async () => {}, refusalPrefix: () => "" },
    reporter: testToolReporter(),
  }, {});
  const baseUrl = await startTestServer(app, t);
  const post = (body: unknown) => fetch(`${baseUrl}/internal/agent-plugin-preflight`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${ensureToolExecToken({}, {})}` }, body: JSON.stringify(body) });
  const offered = await post({ op: "offer", runId: "canary-run" });
  assert.equal(offered.status, 200, "optional guidance stays fail-open");
  assert.deepEqual(await offered.json(), { prefix: "", refusalPrefix: "", pluginIds: [], offer: null });
  const refused = await post({ op: "commit", runId: "canary-run", offerId: "offer-1", deliveredIds: [] });
  assert.equal(refused.status, 409);
  assert.doesNotMatch(await refused.text(), /CANARY/);
  const logged = JSON.stringify(warnings.mock.calls.map(call => call.arguments.map(String)));
  assert.match(logged, /EIO/, "safe diagnostics remain");
  assert.doesNotMatch(logged, /SERVER_SECRET_CANARY|CANDIDATE_PROMPT_CANARY|tovu_ak_/);
  assert.equal(warnings.mock.calls.length, 2);
});

for (const lost of ["retry", "abort"] as const) test(lost === "retry" ? "cached retry does not double-commit" : "an aborted run never retries a lost commit reply", async t => {
  const runId = `lost-commit-${lost}`;
  const site = await pinnedOfferSite(t, { runId });
  const abort = new AbortController();
  const commits: string[] = [];
  const lossy: typeof fetch = async (input, init) => {
    if (!String(init?.body).includes('"op":"commit"')) return fetch(input, init);
    // Count every attempted send, including one an aborted signal would stop before the network.
    commits.push(String(init?.body));
    const reply = await fetch(input, init);
    if (commits.length > 1) return reply;
    // The server recorded the commit; only its reply is lost on the way back.
    if (lost === "abort") abort.abort();
    throw new Error("socket hang up");
  };
  const host = createDaemonSiteTools({ baseUrl: site.baseUrl, token: ensureToolExecToken({}, {}), localRegistry: { list: () => [] }, contextFor: () => ({}) }, { fetch: lossy });
  await host.start({ runId, principalId: site.principalId });
  t.after(() => host.finish({ runId }));
  const { offer } = await host.offerPluginGuidance({ runId });
  assert.ok(offer);
  if (lost === "abort") {
    await assert.rejects(host.commitPluginGuidance({ runId, offerId: offer.offerId, deliveredIds: [] }, { signal: abort.signal }));
    assert.equal(commits.length, 1, "an aborted run sends one commit request only");
    return;
  }
  assert.deepEqual(await host.commitPluginGuidance({ runId, offerId: offer.offerId, deliveredIds: [] }), { pluginIds: [site.pluginId] });
  assert.equal(commits.length, 2, "exactly one retry");
  assert.equal(commits[0], commits[1], "the retry repeats the same run, offer and ids");
  const different = await site.post({ op: "commit", runId, offerId: offer.offerId, deliveredIds: [site.pluginId] });
  assert.equal(different.status, 409, "a recorded receipt is never re-keyed to another selection");
});
