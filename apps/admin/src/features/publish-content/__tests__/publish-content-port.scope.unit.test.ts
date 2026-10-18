import { afterEach, expect, test, vi } from "vitest";
import type { PublishContentReport, PublishScope } from "@tovu/publish-content-ui";

import { createFakePublishContentPort, defaultPublishContentPort } from "../hooks/publish-content-dependencies.hooks";

/**
 * @file plan-publish-sections-2026-09-25.md §1 — the LIVE port's last hop to the wire. Every dialog
 * test runs against `createFakePublishContentPort`, which filters by `scope` itself, so a real port
 * or `api.planPublishContent` that dropped `scope` from the body would leave all of them green while
 * a "Publish pages" dialog staged and published every section. This pins the actual request body.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetchCapturing(): Array<{ url: string; init?: RequestInit }> {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    })
  );
  return calls;
}

test("planPublish sends scope in the push/plan body, alongside the row selection", async () => {
  const calls = stubFetchCapturing();
  await defaultPublishContentPort.planPublish({
    peerId: "peer-prod",
    selectedEntityKeys: ["page:p1"],
    scope: { entityTypes: ["page"] },
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toMatch(/\/publish-content\/peers\/peer-prod\/push\/plan$/);
  expect(calls[0].init?.method).toBe("POST");
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({
    selectedEntityKeys: ["page:p1"],
    scope: { entityTypes: ["page"] },
  });
});

test("planPublish with only a scope still sends a body carrying it", async () => {
  const calls = stubFetchCapturing();
  await defaultPublishContentPort.planPublish({ peerId: "peer-prod", scope: { entityTypes: ["theme-files"] } });
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({ scope: { entityTypes: ["theme-files"] } });
});

test("planPublish with no scope sends no scope key", async () => {
  const calls = stubFetchCapturing();
  await defaultPublishContentPort.planPublish({ peerId: "peer-prod", overwriteEntityKeys: ["post:a"] });
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({ overwriteEntityKeys: ["post:a"] });
});


test("the live publishing port carries destination and confirmation data through the real HTTP client", async () => {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const destination = { connected: false, site: null, candidateUrl: "https://live.test", message: "Connect", nextStep: null };
  const confirm = { confirmationToken: "confirmed-token" };
  const executed = { restorePointId: "restore-7", runId: "run-7", changeSetIds: ["change-7"] };
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body === undefined ? null : JSON.parse(String(init.body));
    calls.push({ url: String(url), method, body });
    let response: unknown;
    if (String(url).endsWith("/destination/connect") && method === "POST") response = destination;
    else if (String(url).endsWith("/destination") && method === "GET") response = destination;
    else if (String(url).endsWith("/push/confirm") && method === "POST") response = confirm;
    else if (String(url).endsWith("/push/execute") && method === "POST") response = executed;
    else throw new Error(`Unexpected request: ${method} ${url}`);
    return new Response(JSON.stringify(response), { headers: { "content-type": "application/json" } });
  });
  await expect(defaultPublishContentPort.getDestination()).resolves.toEqual(destination);
  await expect(defaultPublishContentPort.connectDestination({ siteUrl: "https://chosen.test" })).resolves.toEqual(destination);
  await expect(defaultPublishContentPort.confirmPublish({ peerId: "peer-prod", planId: "plan-7", planHash: "hash-7" })).resolves.toEqual(confirm);
  await expect(defaultPublishContentPort.executePublish({ peerId: "peer-prod", bundleId: "bundle-7", confirmationToken: "confirmed-token", overwriteEntityKeys: ["page:7"] })).resolves.toEqual(executed);
  expect(calls.map(({ method, body }) => ({ method, body }))).toEqual([
    { method: "GET", body: null },
    { method: "POST", body: { siteUrl: "https://chosen.test" } },
    { method: "POST", body: { planId: "plan-7", planHash: "hash-7" } },
    { method: "POST", body: { bundleId: "bundle-7", confirmationToken: "confirmed-token", overwriteEntityKeys: ["page:7"] } },
  ]);
  expect(calls[2].url).toMatch(/\/peers\/peer-prod\/push\/confirm$/);
  expect(calls[3].url).toMatch(/\/peers\/peer-prod\/push\/execute$/);
});

test("the fake's fresh-install defaults provide a complete publish lifecycle", async () => {
  const port = createFakePublishContentPort();
  await expect(port.listPeers()).resolves.toEqual({ peers: [] });
  await expect(port.getDestination()).resolves.toEqual({ connected: false, site: null, candidateUrl: null,
    message: "No live site is set up yet. Deploy this site once, then come back here.", nextStep: null });
  const connection = await port.connectDestination();
  expect(connection.site).toEqual({ id: "peer-connected", label: "example.test", baseUrl: "https://example.test",
    remoteWorkspaceId: "workspace-local", masked: null, hasCredential: false });
  await expect(port.planPublish({ peerId: "peer-connected" })).resolves.toEqual({
    planId: "fake-plan", planHash: "fake-plan-hash", bundleId: "fake-bundle",
    details: { refused: false, refusalReason: null, applyOrder: [], rows: [] }, liveCanOverwrite: true,
  });
  await expect(port.confirmPublish({ peerId: "peer-connected", planId: "fake-plan", planHash: "fake-plan-hash" })).resolves.toEqual({ confirmationToken: "fake-token" });
  await expect(port.executePublish({ peerId: "peer-connected", bundleId: "fake-bundle", confirmationToken: "fake-token" })).resolves.toEqual({
    restorePointId: "fake-restore-point", runId: "fake-run", changeSetIds: ["fake-change-set"],
  });
});

test("the fake connects to an explicit URL before its configured candidate", async () => {
  const port = createFakePublishContentPort({ destination: { connected: false, site: null,
    candidateUrl: "https://candidate.test", message: "Connect", nextStep: null } });
  expect((await port.connectDestination({})).site?.baseUrl).toBe("https://candidate.test");
  expect((await port.connectDestination({ siteUrl: "https://chosen.test" })).site?.baseUrl).toBe("https://chosen.test");
});


const scopeReport: PublishContentReport = {
  refused: false, refusalReason: null, applyOrder: ["post", "media"], rows: [
    { entityType: "post", entityId: "a", outcome: "created", writes: true, reason: null },
    { entityType: "post", entityId: "b", outcome: "created", writes: true, reason: null },
    { entityType: "media", entityId: "a", outcome: "unchanged", writes: false, reason: null },
  ],
};

for (const { label, scope, keys } of [
  { label: "no filters", scope: {}, keys: ["post:a", "post:b", "media:a"] },
  { label: "empty key list", scope: { entityKeys: [] }, keys: ["post:a", "post:b", "media:a"] },
  { label: "keys only", scope: { entityKeys: ["post:b"] }, keys: ["post:b"] },
  { label: "empty type list", scope: { entityTypes: [] }, keys: [] },
] satisfies Array<{ label: string; scope: PublishScope; keys: string[] }>) {
  test(`the fake applies a scope with ${label} before row selection`, async () => {
    const port = createFakePublishContentPort({ report: scopeReport, planId: "plan-9", planHash: "hash-9", bundleId: "bundle-9" });
    const plan = await port.planPublish({ peerId: "peer-prod", scope, overwriteEntityKeys: [] });
    expect(plan.planId).toBe("plan-9-scoped");
    expect(plan.planHash).toBe("hash-9-scoped");
    expect(plan.bundleId).toBe("bundle-9-scoped");
    expect(plan.details.rows.map((row) => `${row.entityType}:${row.entityId}`)).toEqual(keys);
    expect(plan.overwriteEntityKeys).toEqual([]);
    expect(scopeReport.rows.map((row) => row.outcome)).toEqual(["created", "created", "unchanged"]);
  });
}
