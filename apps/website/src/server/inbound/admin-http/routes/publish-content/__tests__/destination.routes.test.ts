import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { InMemoryPublishContentPeerRepo, saveConnectedDestination } from "#src/features/publish-content/peers";
import {
  listPublishContentContributors,
  registerPublishContentContributor,
  resetPublishContentContributorsForTests,
  type PublishContentContributor,
} from "#src/features/publish-content/type-registry";
import type { PublishTrustProvisioningPort, ProvisioningWrite } from "#src/features/publish-trust/provisioning";
import type { HttpClientPort } from "#src/platform/http/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { PublishContentRouteDeps } from "../deps.js";
import { registerPublishContentDestinationRoutes } from "../destination.js";

/**
 * @file `GET .../publish-content/destination`, `POST .../destination/connect` and
 * `POST .../destination/disconnect` — the desktop Publish dialog's one-click "publish to my live
 * site" surface. Before this file only the GET's candidate lookup was reached over HTTP
 * (`publish-content.destination-root.test.ts`); the zero-setup end-to-end suite calls the features
 * directly. So the route's own decisions — which error code each failure becomes, what the view
 * says, whether a refused connect leaves a peer row behind — shipped unasserted.
 *
 * Faked here, and only here: the network (`publishContentPeerHttpClient`, standing in for the
 * destination's `/api/publish-trust/v1/identity` answer) and the deploy-config writer
 * (`provisioning`). Everything between them — URL normalization, the handshake client, key
 * derivation, the peer repo — is the real code.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/publish-content/destination`;
const CLOCK = { nowMs: () => Date.parse("2026-10-01T00:00:00.000Z"), nowIso: () => "2026-10-01T00:00:00.000Z" };

interface Harness {
  readonly url: string;
  readonly repo: InMemoryPublishContentPeerRepo;
  readonly httpCalls: string[];
  readonly provisioningCalls: string[];
  readonly authorizeCalls: Array<{ permission: string }>;
}

interface HarnessOptions {
  readonly candidate?: string | null;
  readonly allowed?: boolean;
  readonly identity?: { status: number; body: unknown };
  readonly connectWrite?: ProvisioningWrite;
  readonly disconnectWrite?: ProvisioningWrite;
}

const TARGET = { kind: "committed-json", path: "/repo/deploy/publish-trust.json", nextStep: "Commit deploy/publish-trust.json and deploy once." };

async function boot(t: test.TestContext, options: HarnessOptions = {}): Promise<Harness> {
  const repo = new InMemoryPublishContentPeerRepo();
  const httpCalls: string[] = [];
  const provisioningCalls: string[] = [];
  const authorizeCalls: Array<{ permission: string }> = [];
  let nextId = 0;
  const identity = options.identity ?? { status: 200, body: { installationId: "dest-install", workspaceId: "remote-workspace" } };

  const httpClient: HttpClientPort = {
    async send(request) {
      httpCalls.push(`${request.method} ${request.url}`);
      const bodyText = typeof identity.body === "string" ? identity.body : JSON.stringify(identity.body);
      return { status: identity.status, headers: {}, bodyText, bodyBytes: new Uint8Array(Buffer.from(bodyText)) } as Awaited<ReturnType<HttpClientPort["send"]>>;
    },
  } as HttpClientPort;

  const provisioning: PublishTrustProvisioningPort = {
    target: TARGET,
    async readProvisioned() {
      throw new Error("not used by the destination routes");
    },
    async connect({ grant }) {
      provisioningCalls.push(`connect ${grant.workspaceId}`);
      return options.connectWrite ?? { ok: true, grants: [grant], changed: true, target: TARGET };
    },
    async disconnect() {
      provisioningCalls.push("disconnect");
      return options.disconnectWrite ?? { ok: true, grants: [], changed: true, target: TARGET };
    },
  } as PublishTrustProvisioningPort;

  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async (params: { permission: string }) => {
      authorizeCalls.push({ permission: params.permission });
      return options.allowed === false ? { allowed: false, reason: "no_grant" } : { allowed: true, reason: "matched" };
    },
    clock: CLOCK,
    idGen: { newId: () => `peer-${(nextId += 1)}` },
    publishContentPeerRepo: repo,
    siteAssistantSecretKeyring: new InMemoryKeyring(),
    publishContentPeerHttpClient: httpClient,
  } as unknown as PublishContentRouteDeps;

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "operator-1" };
    next();
  });
  const candidate = options.candidate === undefined ? null : options.candidate;
  registerPublishContentDestinationRoutes(app, deps, { provisioning, findCandidate: async () => candidate });

  const url = await startTestServer(app, t);
  return { url, repo, httpCalls, provisioningCalls, authorizeCalls };
}

/** Pins the contributor registry to exactly `entityTypes` for one test, then restores whatever was
 *  registered before — the registry is module-level state shared with every other test in the
 *  process. */
function withContributors(t: test.TestContext, entityTypes: readonly string[]): void {
  const previous = [...listPublishContentContributors()];
  resetPublishContentContributorsForTests();
  for (const entityType of entityTypes) registerPublishContentContributor({ entityType } as unknown as PublishContentContributor);
  t.after(() => {
    resetPublishContentContributorsForTests();
    for (const contributor of previous) registerPublishContentContributor(contributor);
  });
}

async function post(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function seedConnected(repo: InMemoryPublishContentPeerRepo, baseUrl: string): Promise<void> {
  await saveConnectedDestination(
    { repo, clock: CLOCK, idGen: { newId: () => "seeded-peer" } },
    { workspaceId: WORKSPACE_ID, label: new URL(baseUrl).host, baseUrl, remoteWorkspaceId: "remote-workspace" }
  );
}

test("destination routes: a workspace id that is not this site's is 404 on all three routes, before authorize runs", async (t) => {
  const h = await boot(t);
  const other = `${h.url}/api/admin/v1/workspaces/other-workspace/publish-content/destination`;
  assert.equal((await fetch(other)).status, 404);
  assert.equal((await post(`${other}/connect`, { siteUrl: "https://live.example" })).status, 404);
  assert.equal((await post(`${other}/disconnect`, {})).status, 404);
  assert.deepEqual(h.authorizeCalls, []);
  assert.deepEqual(h.httpCalls, []);
});

test("destination routes: a principal without publish_content.apply is 403 on all three routes and nothing is contacted or written", async (t) => {
  const h = await boot(t, { allowed: false, candidate: "https://live.example" });
  for (const res of [
    await fetch(`${h.url}${BASE}`).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> })),
    await post(`${h.url}${BASE}/connect`, { siteUrl: "https://live.example" }),
    await post(`${h.url}${BASE}/disconnect`, {}),
  ]) {
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "FORBIDDEN");
    assert.deepEqual(res.body.details, { permission: "publish_content.apply", reason: "no_grant" });
  }
  assert.deepEqual(h.authorizeCalls.map((c) => c.permission), ["publish_content.apply", "publish_content.apply", "publish_content.apply"]);
  assert.deepEqual(h.httpCalls, []);
  assert.deepEqual(h.provisioningCalls, []);
  assert.deepEqual(await h.repo.listByWorkspace({ workspaceId: WORKSPACE_ID }), []);
});

test("GET destination: with nothing connected and no deployed site, says so in plain words", async (t) => {
  const h = await boot(t, { candidate: null });
  const res = await fetch(`${h.url}${BASE}`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    connected: false,
    site: null,
    candidateUrl: null,
    message: "No live site is set up yet. Deploy this site once, then come back here.",
    nextStep: null,
  });
});

test("GET destination: a connected peer is reported as the destination, and the deploy-config candidate is not consulted", async (t) => {
  const h = await boot(t, { candidate: "https://some-other-candidate.example" });
  await seedConnected(h.repo, "https://live.example");
  const res = await fetch(`${h.url}${BASE}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { connected: boolean; site: { label: string; baseUrl: string; remoteWorkspaceId: string }; candidateUrl: unknown; message: string; nextStep: unknown };
  assert.equal(body.connected, true);
  assert.equal(body.site.label, "live.example");
  assert.equal(body.site.baseUrl, "https://live.example");
  assert.equal(body.site.remoteWorkspaceId, "remote-workspace");
  assert.equal(body.candidateUrl, null);
  assert.equal(body.message, "This computer publishes to live.example.");
  assert.equal(body.nextStep, null);
});

test("POST connect: no siteUrl and no deployed site is 400 NO_DESTINATION and contacts nothing", async (t) => {
  withContributors(t, ["post"]);
  const h = await boot(t, { candidate: null });
  const res = await post(`${h.url}${BASE}/connect`, { siteUrl: "   " });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: "No live site is set up yet. Deploy this site once, then come back here.", code: "NO_DESTINATION" });
  assert.deepEqual(h.httpCalls, []);
  assert.deepEqual(h.provisioningCalls, []);
});

test("POST connect: an address that is not a URL is 400 VALIDATION_ERROR and contacts nothing", async (t) => {
  withContributors(t, ["post"]);
  const h = await boot(t, { candidate: "https://live.example" });
  const res = await post(`${h.url}${BASE}/connect`, { siteUrl: "not a website" });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: "That does not look like a website address.", code: "VALIDATION_ERROR" });
  assert.deepEqual(h.httpCalls, []);
});

test("POST connect: with no publishable content types registered it is 409 NO_PUBLISHABLE_TYPES and writes no grant", async (t) => {
  withContributors(t, []);
  const h = await boot(t);
  const res = await post(`${h.url}${BASE}/connect`, { siteUrl: "https://live.example" });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "NO_PUBLISHABLE_TYPES");
  assert.deepEqual(h.httpCalls, []);
  assert.deepEqual(h.provisioningCalls, []);
});

test("POST connect: falls back to the deployed-site candidate, learns the destination's workspace, records the peer, and answers 201", async (t) => {
  withContributors(t, ["post", "page"]);
  const h = await boot(t, { candidate: "https://Live.Example/" });
  const res = await post(`${h.url}${BASE}/connect`, {});
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(h.httpCalls, ["GET https://live.example/api/publish-trust/v1/identity"]);
  // The grant names the DESTINATION's workspace as the destination itself reported it.
  assert.deepEqual(h.provisioningCalls, ["connect remote-workspace"]);

  const site = res.body.site as { label: string; baseUrl: string; remoteWorkspaceId: string };
  assert.equal(res.body.connected, true);
  assert.equal(site.label, "live.example");
  assert.equal(site.baseUrl, "https://live.example");
  assert.equal(site.remoteWorkspaceId, "remote-workspace");
  assert.equal(res.body.message, "This computer publishes to live.example.");
  assert.equal(res.body.nextStep, TARGET.nextStep);

  const rows = await h.repo.listByWorkspace({ workspaceId: WORKSPACE_ID });
  assert.deepEqual(rows.map((row) => [row.baseUrl, row.remoteWorkspaceId]), [["https://live.example", "remote-workspace"]]);
});

test("POST connect: a destination that is not a Tovu site is 502 PUBLISH_TRUST_HANDSHAKE_FAILED with the plain sentence, and nothing is saved", async (t) => {
  withContributors(t, ["post"]);
  const h = await boot(t, { identity: { status: 404, body: { error: "not found" } } });
  const res = await post(`${h.url}${BASE}/connect`, { siteUrl: "https://live.example" });
  assert.equal(res.status, 502);
  assert.deepEqual(res.body, {
    error: "live.example answered, but it does not look like a Tovu site. Check the address.",
    code: "PUBLISH_TRUST_HANDSHAKE_FAILED",
  });
  assert.deepEqual(h.provisioningCalls, []);
  assert.deepEqual(await h.repo.listByWorkspace({ workspaceId: WORKSPACE_ID }), []);
});

test("POST connect: a deploy config that cannot be written is 500 PUBLISH_TRUST_NOT_SAVED, and no peer row claims a connection", async (t) => {
  withContributors(t, ["post"]);
  const h = await boot(t, { connectWrite: { ok: false, reason: "file is read-only" } });
  const res = await post(`${h.url}${BASE}/connect`, { siteUrl: "https://live.example" });
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: "This site's publishing settings could not be saved: file is read-only", code: "PUBLISH_TRUST_NOT_SAVED" });
  assert.deepEqual(await h.repo.listByWorkspace({ workspaceId: WORKSPACE_ID }), []);
});

test("POST disconnect: forgets the connected peer and reports the address it published to as the next candidate", async (t) => {
  const h = await boot(t, { candidate: "https://unrelated-candidate.example" });
  await seedConnected(h.repo, "https://live.example");
  const res = await post(`${h.url}${BASE}/disconnect`, {});
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    connected: false,
    site: null,
    candidateUrl: "https://live.example",
    message: "This computer no longer publishes to live.example.",
    nextStep: TARGET.nextStep,
  });
  assert.deepEqual(h.provisioningCalls, ["disconnect"]);
  assert.deepEqual(await h.repo.listByWorkspace({ workspaceId: WORKSPACE_ID }), []);
});

test("POST disconnect: when nothing was connected and the config did not change, says so and offers no next step", async (t) => {
  const h = await boot(t, { candidate: "https://live.example", disconnectWrite: { ok: true, grants: [], changed: false, target: TARGET } });
  const res = await post(`${h.url}${BASE}/disconnect`, {});
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    connected: false,
    site: null,
    candidateUrl: "https://live.example",
    message: "This computer was not publishing anywhere.",
    nextStep: null,
  });
});

test("POST disconnect: a deploy config that cannot be written is 500 PUBLISH_TRUST_NOT_SAVED and the peer row is put back", async (t) => {
  const h = await boot(t, { disconnectWrite: { ok: false, reason: "file is read-only" } });
  await seedConnected(h.repo, "https://live.example");
  const res = await post(`${h.url}${BASE}/disconnect`, {});
  assert.equal(res.status, 500);
  assert.equal(res.body.code, "PUBLISH_TRUST_NOT_SAVED");
  const rows = await h.repo.listByWorkspace({ workspaceId: WORKSPACE_ID });
  assert.deepEqual(rows.map((row) => row.baseUrl), ["https://live.example"]);
});
