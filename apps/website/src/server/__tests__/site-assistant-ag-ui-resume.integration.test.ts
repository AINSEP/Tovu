import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import express from "express";
import { set as setLegacySetting } from "@jini-ai/core/settings";
import { writeVisitorTools } from "@jini-ai/cms/settings/site/visitor-tools-write";

import { setPublicAssistantSettings, setSiteAssistantCredential } from "../../assistant/index.js";
import { VISITOR_TOOLS_HOST, SETTINGS_WRITE_POLICIES } from "#src/features/settings/settings-write-policies";
import { VISITOR_APPROVAL_EXPIRED } from "#src/assistant/site/visitor-ag-ui-resume";
import { createRouteDeps } from "../runtime/composition/app.js";
import { createSiteAssistantModule } from "../runtime/composition/modules/site-assistant.js";
import { startTestServer } from "./helpers/http-test-server.js";
import { startStubProviderServer, type StubProviderReply } from "./helpers/stub-provider-server.js";

/**
 * @file P6-T2.T on the real visitor stack: an Ask-mode tool on the AG-UI wire parks, the interrupt
 * segment closes, and a resume POST to the same `/chat` answers the SAME running call. Provider
 * requests are counted: a resume must continue the held call, never start a fresh provider run.
 */

const alwaysAllow = async () => ({ allowed: true, reason: "test" });
const AG_UI_ACCEPT = "text/event-stream; agui=1";
const chunk = (payload: Record<string, unknown>) => `data: ${JSON.stringify(payload)}\n\n`;
const functionCall = (name: string, id: string): StubProviderReply => ({ status: 200,
  body: chunk({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name, args: {}, id } }] }, index: 0 }] }) });
const text = (reply: string): StubProviderReply => ({ status: 200,
  body: chunk({ candidates: [{ content: { role: "model", parts: [{ text: reply }] }, finishReason: "STOP", index: 0 }] }) });

async function boot({ t, ask }: { t: TestContext; ask: boolean }, { clockFails = () => false }: { clockFails?: () => boolean } = {}) {
  const requests: Record<string, unknown>[] = [];
  const logged: Array<{ code: string; diagnostic: unknown }> = [];
  const deps = createRouteDeps();
  // A clock that can be switched off mid-test: the module binds its clock once, at creation.
  const clock = Object.assign(Object.create(deps.clock) as typeof deps.clock, {
    nowMs: () => { if (clockFails()) throw new Error("clock offline"); return deps.clock.nowMs(); } });
  await deps.siteTitleReady;
  await setPublicAssistantSettings({ settingsRepo: deps.settingsRepo, getEffective: deps.getEffective, set: setLegacySetting,
    clock: deps.clock, ids: deps.idGen, authorize: alwaysAllow, principals: deps.principalRepo },
  { workspaceId: deps.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" });
  await writeVisitorTools({ visitorTools: VISITOR_TOOLS_HOST, writePolicies: SETTINGS_WRITE_POLICIES, deps: { repo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen, authorize: alwaysAllow, principals: deps.principalRepo },
    workspaceId: deps.workspaceId, callerPrincipalId: "test-caller", value: { version: 1, tools: { list_categories: { mode: ask ? "ask" : "auto" } } } });
  let siteOrigin: URL | undefined;
  deps.originRegistry.canonicalOrigin = async () => ({ scheme: "http", host: siteOrigin!.hostname, port: Number(siteOrigin!.port),
    source: "dev-capability", verifiedAt: deps.clock.nowIso() });
  const providerUrl = await startStubProviderServer(t, (count: number, body: Record<string, unknown>) => {
    requests.push(body);
    return count === 1 ? functionCall("list_categories", "ask-call") : text("Finished.");
  });
  await setSiteAssistantCredential({ repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
  { workspaceId: deps.workspaceId, apiKey: "test-fake-key-not-real", model: "gemini-flash-latest", baseUrl: providerUrl });
  const app = express();
  app.use(express.json());
  const handle = createSiteAssistantModule({ deps: { ...deps, clock, siteAssistantErrorLog: (entry: { code: string; diagnostic: unknown }) => { logged.push(entry); } } as typeof deps, reporter: createRouteIncidentReporter().reporter },
    { env: { ...process.env, GEMINI_API_KEY: "test-fake-key-not-real", TOVU_SITE_ASSISTANT_BASE_URL: providerUrl, TOVU_VISITOR_TOOLS_POLICY: "on" } });
  handle.registerRoutes?.({ app });
  const baseUrl = await startTestServer(app, t);
  siteOrigin = new URL(baseUrl);
  return { baseUrl, requests, deps, handle, logged };
}

/** A visitor tab's approval identity: guest cookie + tab credential, and NO page publication. */
async function guestTab(baseUrl: string): Promise<Record<string, string>> {
  const origin = { origin: baseUrl, "sec-fetch-site": "same-origin" };
  const issued = await fetch(`${baseUrl}/api/site-assistant/frontend-sessions/credentials`, { method: "POST", headers: origin });
  assert.equal(issued.status, 200);
  const { tabCredential } = await issued.json() as { tabCredential: string };
  return { ...origin, cookie: issued.headers.get("set-cookie")!.split(";")[0]!, "x-frontend-tab": tabCredential };
}

function post(baseUrl: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${baseUrl}/api/site-assistant/chat`, { method: "POST", headers: { "content-type": "application/json", accept: AG_UI_ACCEPT, ...headers }, body: JSON.stringify(body) });
}
const empty = { tools: [], context: [], state: {}, forwardedProps: {} };
const start = (baseUrl: string, tab: Record<string, string>) => post(baseUrl, tab, { ...empty, threadId: "thread-1", runId: "run-1",
  messages: [{ id: "m1", role: "user", content: "List the categories." }] });
const resume = (baseUrl: string, tab: Record<string, string>, interruptId: string, payload: string, runId = "run-2") => post(baseUrl, tab, { ...empty,
  threadId: "thread-1", runId, parentRunId: "run-1", messages: [], resume: [{ interruptId, status: "resolved", payload }] });
const cancelResume = (baseUrl: string, tab: Record<string, string>, interruptId: string) => post(baseUrl, tab, { ...empty,
  threadId: "thread-1", runId: "run-2", parentRunId: "run-1", messages: [], resume: [{ interruptId, status: "cancelled" }] });

function events(raw: string): Array<Record<string, any>> {
  return [...raw.matchAll(/^data: (.+)$/gm)].map((match) => JSON.parse(match[1]!) as Record<string, any>);
}
/** The whole interrupt segment: it must END (not hang) and its last event is the standard interrupt. */
async function interruptOf(response: Response): Promise<string> {
  const all = events(await response.text());
  const last = all.at(-1)!;
  assert.equal(last.type, "RUN_FINISHED");
  assert.equal(last.outcome?.type, "interrupt");
  return last.outcome.interrupts[0].id as string;
}
const toolResultSeen = (request: Record<string, unknown> | undefined) => JSON.stringify(request ?? {}).includes("functionResponse");

test("accept resumes the parked call exactly once (end to end)", { timeout: 10_000 }, async (t) => {
  const { baseUrl, requests } = await boot({ t, ask: true });
  const tab = await guestTab(baseUrl);
  const interruptId = await interruptOf(await start(baseUrl, tab));
  assert.equal(requests.length, 1, "the model gets no continuation while its tool is held");
  const resumed = await resume(baseUrl, tab, interruptId, "allow");
  assert.equal(resumed.status, 200);
  const segment = events(await resumed.text());
  assert.deepEqual([segment[0]?.type, segment[0]?.runId], ["RUN_STARTED", "run-2"]);
  assert.equal(segment.at(-1)?.type, "RUN_FINISHED");
  assert.equal(requests.length, 2, "one continuation of the SAME provider call, not a fresh run");
  assert.ok(toolResultSeen(requests[1]) && !JSON.stringify(requests[1]).includes("not allowed"));
  const replay = await resume(baseUrl, tab, interruptId, "allow", "run-3");
  assert.deepEqual([replay.status, (await replay.json() as { error: string }).error], [400, VISITOR_APPROVAL_EXPIRED]);
  assert.equal(requests.length, 2);
});

test("closing the interrupt response leaves the parked invocation alive", { timeout: 10_000 }, async (t) => {
  const { baseUrl, requests } = await boot({ t, ask: true });
  const tab = await guestTab(baseUrl);
  const interruptId = await interruptOf(await start(baseUrl, tab)); // body fully read: the segment closed
  await new Promise((resolve) => setTimeout(resolve, 50));
  const resumed = await resume(baseUrl, tab, interruptId, "allow");
  assert.equal(resumed.status, 200, "a closed interrupt segment must not have released or aborted the held call");
  await resumed.text();
  assert.equal(requests.length, 2);
});

test("visitor approval without a page publication remains answerable", { timeout: 10_000 }, async (t) => {
  const { baseUrl, requests } = await boot({ t, ask: true });
  const tab = await guestTab(baseUrl);
  assert.equal(tab["x-visitor-publication"], undefined);
  const interruptId = await interruptOf(await start(baseUrl, tab));
  const declined = await resume(baseUrl, tab, interruptId, "deny");
  assert.equal(declined.status, 200);
  assert.equal(events(await declined.text()).at(-1)?.type, "RUN_FINISHED");
  assert.equal(requests.length, 2, "the turn continues with a refusal");
});

test("resume on the route requires the authenticated owner and does not consume the claim", { timeout: 10_000 }, async (t) => {
  const { baseUrl, requests } = await boot({ t, ask: true });
  const tab = await guestTab(baseUrl);
  const stranger = await guestTab(baseUrl);
  const interruptId = await interruptOf(await start(baseUrl, tab));
  const { cookie: _cookie, "x-frontend-tab": _tab, ...ownerless } = tab;
  for (const headers of [ownerless, stranger]) {
    const refused = await resume(baseUrl, headers, interruptId, "allow");
    assert.deepEqual([refused.status, (await refused.json() as { error: string }).error], [400, VISITOR_APPROVAL_EXPIRED]);
  }
  assert.equal(requests.length, 1);
  const resumed = await resume(baseUrl, tab, interruptId, "allow");
  assert.equal(resumed.status, 200);
  await resumed.text();
  assert.equal(requests.length, 2);
});

test("ordinary non-approval cards still render", { timeout: 10_000 }, async (t) => {
  const { baseUrl, requests } = await boot({ t, ask: false });
  const tab = await guestTab(baseUrl);
  const all = events(await (await start(baseUrl, tab)).text());
  assert.equal(all.at(-1)?.type, "RUN_FINISHED");
  assert.equal(all.at(-1)?.outcome?.type, undefined, "an allowed tool is not an interrupt");
  assert.equal(requests.length, 2);
  assert.ok(toolResultSeen(requests[1]));
});

test("visitor Stop while an approval is parked sends one cancelled resume and runs nothing", { timeout: 10_000 }, async (t) => {
  const { baseUrl, requests } = await boot({ t, ask: true });
  const tab = await guestTab(baseUrl);
  const interruptId = await interruptOf(await start(baseUrl, tab));
  const stopped = await cancelResume(baseUrl, tab, interruptId);
  assert.equal(stopped.status, 204, "Stop gets no segment: there is nothing more to stream");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(requests.length, 1, "the held call ended: the model gets no continuation, so nothing runs");
  const late = await resume(baseUrl, tab, interruptId, "allow");
  assert.deepEqual([late.status, (await late.json() as { error: string }).error], [400, VISITOR_APPROVAL_EXPIRED]);
  assert.equal(requests.length, 1);
});

test("a visitor resume with new messages, multiple answers or a foreign origin does not consume the held call", { timeout: 10_000 }, async (t) => {
  const { baseUrl, requests } = await boot({ t, ask: true });
  const tab = await guestTab(baseUrl);
  const interruptId = await interruptOf(await start(baseUrl, tab));
  const answer = { interruptId, status: "resolved", payload: "allow" };
  const valid = { ...empty, threadId: "thread-1", runId: "run-2", parentRunId: "run-1", messages: [], resume: [answer] };
  for (const [headers, body] of [
    [tab, { ...valid, messages: [{ id: "new-1", role: "user", content: "New turn" }] }],
    [tab, { ...valid, resume: [answer, answer] }],
    [{ ...tab, origin: "https://other.example", "sec-fetch-site": "cross-site" }, valid],
  ] as const) {
    const refused = await post(baseUrl, headers, body);
    assert.equal(refused.status, 400);
    assert.equal(refused.headers.get("cache-control"), "no-store");
    assert.deepEqual(await refused.json(), { error: "I can't help with that request here." });
  }
  assert.equal(requests.length, 1);
  const continued = await resume(baseUrl, tab, interruptId, "allow");
  assert.equal(continued.status, 200);
  assert.equal(events(await continued.text()).at(-1)?.type, "RUN_FINISHED");
  assert.equal(requests.length, 2);
});

test("process shutdown denies a parked approval: the held call ends and a later answer is the expired request", { timeout: 10_000 }, async (t) => {
  const { baseUrl, requests, handle, logged } = await boot({ t, ask: true });
  const tab = await guestTab(baseUrl);
  const interruptId = await interruptOf(await start(baseUrl, tab));
  handle.shutdown();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(requests.length, 1, "the held call ended: the model gets no continuation");
  const late = await resume(baseUrl, tab, interruptId, "allow");
  assert.deepEqual([late.status, (await late.json() as { error: string }).error], [400, VISITOR_APPROVAL_EXPIRED]);
  assert.equal(requests.length, 1);
  assert.deepEqual(logged.map((entry) => [entry.code, String(entry.diagnostic)]), [["provider_error", "The operation was aborted"]],
    "the only incident is the held provider call being aborted; the denial itself succeeded");
});

test("a shutdown denial that fails is logged once as a visitor_tools_confirm incident", { timeout: 10_000 }, async (t) => {
  let clockDown = false;
  const { baseUrl, requests, handle, logged } = await boot({ t, ask: true }, { clockFails: () => clockDown });
  const tab = await guestTab(baseUrl);
  await interruptOf(await start(baseUrl, tab));
  clockDown = true;
  handle.shutdown();
  await new Promise((resolve) => setTimeout(resolve, 50));
  clockDown = false;
  const confirmIncidents = logged.filter((entry) => entry.code === "visitor_tools_confirm");
  assert.equal(confirmIncidents.length, 1);
  assert.match(String(confirmIncidents[0]?.diagnostic), /clock offline/);
  assert.equal(requests.length, 1, "the held call still ended: no continuation reached the model");
});

/** A visitor tab's credential request, sent from `origin` as a same-origin fetch. */
const canonicalCredentials = (baseUrl: string, origin: string) => fetch(`${baseUrl}/api/site-assistant/frontend-sessions/credentials`, {
  method: "POST", headers: { origin, "sec-fetch-site": "same-origin" } });

test("a canonical-origin lookup that fails refuses the visitor credential and logs one visitor_frontend_control incident", { timeout: 10_000 }, async (t) => {
  const { baseUrl, deps, logged } = await boot({ t, ask: false });
  deps.originRegistry.canonicalOrigin = async () => { throw new Error("origin registry offline"); };
  const refused = await canonicalCredentials(baseUrl, "https://shop.example");
  assert.equal(refused.status, 403);
  assert.equal(refused.headers.get("set-cookie"), null);
  assert.deepEqual(logged.map((entry) => entry.code), ["visitor_frontend_control"]);
  assert.match(String(logged[0]?.diagnostic), /origin registry offline/);
});
