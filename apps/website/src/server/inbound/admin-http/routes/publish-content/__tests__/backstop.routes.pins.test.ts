import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";

import type { BackstopAuditRecord } from "#src/features/publish-content/backstop-audit";
import { createPublishContentPeer, InMemoryPublishContentPeerRepo, type PublishContentPeerRecord } from "#src/features/publish-content/peers";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { contentKernel } from "#src/platform/db/content-kernel";
import { createBackstopAuditSqlitePort } from "#src/platform/db/sqlite/publish-backstop-audit.sqlite";
import type { HttpClientPort } from "#src/platform/http/index";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

import { registerPublishBackstopRoutes } from "../backstop.js";
import type { PublishContentRouteDeps } from "../deps.js";
import { BASE, recordingAuthorize, routeApp, routeDeps } from "./route-fixture.js";

/**
 * @file Pins every `backstop.ts` arm the backstop/backstop-ui suites leave open, against the real
 * stack: a SQLite audit log and raw-row table, a sealed peer, and a fake peer HTTP side. Undo's
 * apply loop (which needs raw files on disk) is pinned in `backstop-undo.routes.pins.test.ts`.
 */

const AUDIT_TABLE = `CREATE TABLE publish_backstop_log (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, direction TEXT NOT NULL,
  actor_id TEXT NOT NULL, destination TEXT NOT NULL, reason TEXT NOT NULL, at TEXT NOT NULL, items_json TEXT NOT NULL,
  gap_labels_json TEXT NOT NULL, result TEXT NOT NULL, run_id TEXT, details_json TEXT NOT NULL, inverses_json TEXT NOT NULL)`;
const REASON = "Emergency footer fix";
const LIVE = "https://live.example";

/** In-memory SQLite: the audit log (unless `audit: false`) and one raw-row table with a row. */
function backstopKernel(t: TestContext, options: { audit?: boolean | "broken" } = {}) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  // Test-only schema; no active migration is created or installed.
  if (options.audit === "broken") db.exec("CREATE TABLE publish_backstop_log (id TEXT PRIMARY KEY)");
  else if (options.audit !== false) db.exec(AUDIT_TABLE);
  db.exec("CREATE TABLE p_banner(id TEXT PRIMARY KEY, title TEXT); INSERT INTO p_banner VALUES('one','New footer');");
  return contentKernel(db);
}

/** The peer's side of the wire, answering each publish-content call by path. */
function fakePeer(answers: { entityTypes?: readonly string[] } = {}): HttpClientPort & { calls: string[] } {
  const calls: string[] = [];
  const reply = (body: unknown) => ({ status: 200, headers: {}, bodyText: JSON.stringify(body) });
  return {
    calls,
    send: async (request) => {
      const path = new URL(request.url).pathname;
      calls.push(path.replace(/^.*\/publish-content/, ""));
      if (path.endsWith("/capabilities")) return reply({ entityTypes: answers.entityTypes ?? ["raw-row", "raw-file"], features: ["overwrite-live"] });
      if (path.endsWith("/blobs/probe")) return reply({ missing: (JSON.parse(String(request.body)) as { shas: string[] }).shas });
      if (path.includes("/blobs/")) return reply({ stored: true });
      if (path.endsWith("/bundles")) return reply({ bundleId: "remote-bundle", expiresAt: "2026-10-05T00:00:00.000Z" });
      if (path.endsWith("/import/plan")) return reply({ planId: "plan-1", planHash: "hash-1", details: { rows: [] } });
      if (path.endsWith("/import/confirm")) return reply({ confirmationToken: "token-1" });
      if (path.endsWith("/import/execute")) return reply({ runId: "remote-run", restorePointId: "rp-1", changeSetIds: [] });
      throw new Error(`unexpected peer call ${request.method} ${path}`);
    },
  };
}

/** Deps with a real sealed peer `peer-1` at {@link LIVE}. */
async function backstopDeps(overrides: Partial<PublishContentRouteDeps> = {}): Promise<PublishContentRouteDeps> {
  const keyring = new InMemoryKeyring();
  let serial = 0;
  const deps = routeDeps({
    ownerPrincipalId: Promise.resolve("owner"),
    publishContentPeerRepo: new InMemoryPublishContentPeerRepo(),
    siteAssistantSecretSealer: new AesGcmSecretSealer(keyring),
    siteAssistantSecretKeyring: keyring,
    idGen: { newId: () => (serial++ === 0 ? "peer-1" : `id-${serial}`) },
    publishContentPeerHttpClient: fakePeer(),
    ...overrides,
  });
  await createPublishContentPeer(
    { repo: deps.publishContentPeerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen },
    { workspaceId: deps.workspaceId, label: "Live", baseUrl: LIVE, remoteWorkspaceId: "remote", apiKey: "tovu_live_0123456789abcdef" }
  );
  return deps;
}

function auditRecord(overrides: Partial<BackstopAuditRecord> = {}): BackstopAuditRecord {
  return {
    id: "log-1", workspaceId: "ws", direction: "source", actorId: "owner", destination: LIVE, reason: REASON, at: "2026-10-04T00:00:00.000Z",
    items: [], gapLabels: [], result: "planned", runId: null, details: { peerId: "peer-1", bundleId: "remote-bundle", plan: { planId: "plan-1", planHash: "hash-1" } }, inverses: [],
    ...overrides,
  };
}

const PLAN_BODY = { peerId: "peer-1", action: "plan", reason: REASON, rows: [{ table: "p_banner", pk: { id: "one" } }] };
const SEND_BODY = { ...PLAN_BODY, action: "send", typedHost: "live.example", logId: "log-1" };
const NOT_INSTALLED = { error: "Send by hand needs its audit storage installed before it can send anything.", code: "BACKSTOP_NOT_INSTALLED" };

/** A peer repo whose lookup throws a non-Error value, the shape a misbehaving driver can throw. */
class ThrowingValuePeerRepo extends InMemoryPublishContentPeerRepo {
  override async findById(): Promise<PublishContentPeerRecord | null> {
    throw "connection dropped";
  }
}

test("status reports installed:true once the audit table exists", async (t) => {
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: backstopKernel(t) }));
  assert.deepEqual(await dispatchJsonRequest(app, "GET", `${BASE}/backstop/status`), { status: 200, body: { allowed: true, installed: true } });
});

test("status answers its own 500 when authorization fails", async () => {
  const app = routeApp(registerPublishBackstopRoutes, routeDeps({ ownerPrincipalId: Promise.resolve("owner"), authorize: async () => { throw new Error("rbac down"); } }));
  assert.deepEqual(await dispatchJsonRequest(app, "GET", `${BASE}/backstop/status`), { status: 500, body: { error: "Manual publishing availability could not be read." } });
});

test("run summary is the 503 when audit storage is not installed", async (t) => {
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: backstopKernel(t, { audit: false }) }));
  assert.deepEqual(await dispatchJsonRequest(app, "GET", `${BASE}/runs/run-1/backstop`), { status: 503, body: { error: "Send by hand needs its audit storage installed.", code: "BACKSTOP_NOT_INSTALLED" } });
});

test("run summary hides a source-side log as not found", async (t) => {
  const kernel = backstopKernel(t);
  await createBackstopAuditSqlitePort({ kernel }).save({ record: auditRecord({ id: "run-1" }) });
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: kernel }));
  assert.deepEqual(await dispatchJsonRequest(app, "GET", `${BASE}/runs/run-1/backstop`), { status: 404, body: { error: "This send was not found on this site." } });
});

test("run summary offers undo for a failure only when it recorded inverses", async (t) => {
  const kernel = backstopKernel(t);
  const audit = createBackstopAuditSqlitePort({ kernel });
  const entity = { entityType: "raw-row", id: 'p_banner:{"id":"one"}', schemaVersion: 1, hashVersion: 1, contentHash: "after", requiredBlobs: [], state: {} };
  await audit.save({ record: auditRecord({ id: "bare", runId: "bare", direction: "destination", result: "failure" }) });
  await audit.save({ record: auditRecord({ id: "partial", runId: "partial", direction: "destination", result: "failure", inverses: [{ kind: "raw-row", entity, before: null, afterHash: "after" }] }) });
  await audit.save({ record: auditRecord({ id: "undone", runId: "undone", direction: "destination", result: "undone" }) });
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: kernel }));
  const canUndo = async (id: string) => ((await dispatchJsonRequest(app, "GET", `${BASE}/runs/${id}/backstop`)).body as { canUndo: boolean }).canUndo;
  assert.deepEqual([await canUndo("bare"), await canUndo("partial"), await canUndo("undone")], [false, true, false]);
});

test("run summary answers its own 500 when the audit read fails", async (t) => {
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: backstopKernel(t, { audit: "broken" }) }));
  assert.deepEqual(await dispatchJsonRequest(app, "GET", `${BASE}/runs/run-1/backstop`), { status: 500, body: { error: "This send could not be read." } });
});

test("gaps: foreign workspace 404, denied 403, uninstalled [], installed list, failure 500", async (t) => {
  const kernel = backstopKernel(t);
  await createBackstopAuditSqlitePort({ kernel }).save({ record: auditRecord({ result: "success", gapLabels: ["table:p_banner"] }) });
  const gaps = `${BASE}/backstop/gaps`;
  assert.deepEqual(await dispatchJsonRequest(routeApp(registerPublishBackstopRoutes, routeDeps()), "GET", gaps.replace("/ws/", "/other/")), { status: 404, body: { error: "workspace was not found" } });
  const denied = recordingAuthorize(false);
  assert.deepEqual(await dispatchJsonRequest(routeApp(registerPublishBackstopRoutes, routeDeps({ authorize: denied })), "GET", gaps), { status: 403, body: { error: "Publishing history is not available to this account." } });
  assert.deepEqual(denied.asked, ["publish_content.read"]);
  assert.deepEqual(await dispatchJsonRequest(routeApp(registerPublishBackstopRoutes, routeDeps()), "GET", gaps), { status: 200, body: { gaps: [] } });
  const installed = await dispatchJsonRequest(routeApp(registerPublishBackstopRoutes, routeDeps({ contentKernel: kernel })), "GET", gaps);
  assert.deepEqual((installed.body as { gaps: Array<{ label: string }> }).gaps.map((gap) => gap.label), ["table:p_banner"]);
  assert.deepEqual(await dispatchJsonRequest(routeApp(registerPublishBackstopRoutes, routeDeps({ authorize: async () => { throw new Error("rbac down"); } })), "GET", gaps), { status: 500, body: { error: "Publishing history could not be read." } });
});

test("send-by-hand refuses a body with no peerId", async () => {
  const app = routeApp(registerPublishBackstopRoutes, routeDeps({ ownerPrincipalId: Promise.resolve("owner") }));
  assert.deepEqual(await dispatchJsonRequest(app, "POST", `${BASE}/backstop`, { action: "plan" }), { status: 400, body: { error: "Choose a connected live site.", code: "VALIDATION_ERROR" } });
});

test("send-by-hand answers an unknown peer with 404", async () => {
  const app = routeApp(registerPublishBackstopRoutes, routeDeps({ ownerPrincipalId: Promise.resolve("owner"), publishContentPeerRepo: new InMemoryPublishContentPeerRepo() }));
  assert.deepEqual(await dispatchJsonRequest(app, "POST", `${BASE}/backstop`, PLAN_BODY), { status: 404, body: { error: "The connected live site was not found." } });
});

test("send-by-hand answers a non-Error failure with its fixed 409 text", async () => {
  const app = routeApp(registerPublishBackstopRoutes, routeDeps({ ownerPrincipalId: Promise.resolve("owner"), publishContentPeerRepo: new ThrowingValuePeerRepo() }));
  assert.deepEqual(await dispatchJsonRequest(app, "POST", `${BASE}/backstop`, PLAN_BODY), { status: 409, body: { error: "This send could not complete." } });
});

test("send-by-hand is the 503 when audit storage is not installed", async (t) => {
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: backstopKernel(t, { audit: false }) }));
  assert.deepEqual(await dispatchJsonRequest(app, "POST", `${BASE}/backstop`, PLAN_BODY), { status: 503, body: NOT_INSTALLED });
});

test("an action that is neither plan nor send is refused after the address check", async (t) => {
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: backstopKernel(t) }));
  assert.deepEqual(await dispatchJsonRequest(app, "POST", `${BASE}/backstop`, { ...SEND_BODY, action: "delete" }), { status: 400, body: { error: "Choose Check what would change or Send to live." } });
});

const SEND_MISMATCHES: ReadonlyArray<[string, Partial<BackstopAuditRecord> | null, Record<string, unknown>]> = [
  ["no logId", null, { logId: undefined }],
  ["unknown log", null, {}],
  ["destination-side log", { direction: "destination" }, {}],
  ["another actor's plan", { actorId: "someone-else" }, {}],
  ["a plan for another address", { destination: "https://other.example" }, {}],
  ["a plan already sent", { result: "success" }, {}],
  ["a different reason", { reason: "Another emergency fix" }, {}],
  ["a plan for another peer", { details: { peerId: "peer-2" } }, {}],
];

for (const [name, record, body] of SEND_MISMATCHES) {
  test(`send refuses ${name} with 409 before dialing the peer`, async (t) => {
    const kernel = backstopKernel(t);
    if (record) await createBackstopAuditSqlitePort({ kernel }).save({ record: auditRecord(record) });
    const peer = fakePeer();
    const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: kernel, publishContentPeerHttpClient: peer }));
    assert.deepEqual(await dispatchJsonRequest(app, "POST", `${BASE}/backstop`, { ...SEND_BODY, ...body }), { status: 409, body: { error: "Check what would change again before sending." } });
    assert.deepEqual(peer.calls, []);
  });
}

test("send confirms and executes the checked plan on the peer and records the run", async (t) => {
  const kernel = backstopKernel(t);
  const audit = createBackstopAuditSqlitePort({ kernel });
  await audit.save({ record: auditRecord({ details: { ...auditRecord().details, overwriteEntityKeys: ['raw-row:p_banner:{"id":"one"}'] } }) });
  const peer = fakePeer();
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: kernel, publishContentPeerHttpClient: peer }));
  const result = await dispatchJsonRequest(app, "POST", `${BASE}/backstop`, SEND_BODY);
  assert.deepEqual(result, { status: 200, body: { runId: "remote-run", restorePointId: "rp-1", changeSetIds: [], logId: "log-1", destination: LIVE } });
  assert.deepEqual(peer.calls, ["/import/confirm", "/capabilities", "/import/execute"]);
  assert.equal((await audit.get({ workspaceId: "ws", id: "log-1" }))?.result, "success");
});

test("plan with nothing to send answers an empty plan and records nothing", async (t) => {
  const peer = fakePeer();
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: backstopKernel(t), publishContentPeerHttpClient: peer }));
  const result = await dispatchJsonRequest(app, "POST", `${BASE}/backstop`, { ...PLAN_BODY, rows: [{ table: "p_banner", pk: { id: "absent" } }] });
  assert.equal(result.status, 200);
  const body = result.body as { entities: unknown[]; skipped: Array<{ entityType: string }>; logId: unknown };
  assert.deepEqual([body.entities, body.logId, body.skipped.map((entry) => entry.entityType)], [[], null, ["raw-row"]]);
  assert.deepEqual(peer.calls, []);
});

for (const [name, overwriteEntityKeys] of [["a non-array", "raw-row:x"], ["a key outside the selection", ["post:1"]], ["a non-string key", [1]]] as const) {
  test(`plan refuses overwrite keys that are ${name}`, async (t) => {
    const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: backstopKernel(t) }));
    assert.deepEqual(await dispatchJsonRequest(app, "POST", `${BASE}/backstop`, { ...PLAN_BODY, overwriteEntityKeys }), {
      status: 400, body: { error: "Only selected items can be overwritten.", code: "VALIDATION_ERROR" },
    });
  });
}

test("plan pushes the selected rows with their audit metadata and records the planned send", async (t) => {
  const kernel = backstopKernel(t);
  const peer = fakePeer();
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: kernel, publishContentPeerHttpClient: peer }));
  const result = await dispatchJsonRequest(app, "POST", `${BASE}/backstop`, PLAN_BODY);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const body = result.body as { logId: string; peerId: string; bundleId: string; entities: Array<{ id: string }>; overwriteEntityKeys?: unknown };
  assert.deepEqual([body.peerId, body.bundleId, body.entities.map((e) => e.id), "overwriteEntityKeys" in body], ["peer-1", "remote-bundle", ['p_banner:{"id":"one"}'], false]);
  assert.deepEqual(peer.calls, ["/capabilities", "/bundles", "/import/plan"]);
  const log = await createBackstopAuditSqlitePort({ kernel }).get({ workspaceId: "ws", id: body.logId });
  assert.deepEqual([log?.result, log?.direction, log?.reason, log?.gapLabels], ["planned", "source", REASON, ["table:p_banner"]]);
});

test("plan forwards selected overwrite keys to the peer and echoes them", async (t) => {
  const key = 'raw-row:p_banner:{"id":"one"}';
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: backstopKernel(t) }));
  const result = await dispatchJsonRequest(app, "POST", `${BASE}/backstop`, { ...PLAN_BODY, overwriteEntityKeys: [key] });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual((result.body as { overwriteEntityKeys: unknown }).overwriteEntityKeys, [key]);
});

test("plan to a live site that cannot take raw rows fails the send with 409 and records the failure", async (t) => {
  const kernel = backstopKernel(t);
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: kernel, publishContentPeerHttpClient: fakePeer({ entityTypes: [] }) }));
  assert.deepEqual(await dispatchJsonRequest(app, "POST", `${BASE}/backstop`, PLAN_BODY), {
    status: 409, body: { error: "Live can't accept send by hand yet; update live and enable its backstop grant." },
  });
});

test("undo is the 503 when audit storage is not installed", async (t) => {
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: backstopKernel(t, { audit: false }) }));
  assert.deepEqual(await dispatchJsonRequest(app, "POST", `${BASE}/runs/run-1/undo-backstop`), { status: 503, body: { error: "Send by hand needs its audit storage installed." } });
});

test("undo refuses a run with no undo available: missing, source-side, undone, or a failure without inverses", async (t) => {
  const kernel = backstopKernel(t);
  const audit = createBackstopAuditSqlitePort({ kernel });
  await audit.save({ record: auditRecord({ id: "source" }) });
  await audit.save({ record: auditRecord({ id: "undone", direction: "destination", result: "undone" }) });
  await audit.save({ record: auditRecord({ id: "bare", direction: "destination", result: "failure" }) });
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: kernel }));
  for (const id of ["missing", "source", "undone", "bare"]) {
    assert.deepEqual(await dispatchJsonRequest(app, "POST", `${BASE}/runs/${id}/undo-backstop`), { status: 404, body: { error: "This send has no undo available." } }, id);
  }
});

test("undo answers a failure with the error's own message as 409", async (t) => {
  const app = routeApp(registerPublishBackstopRoutes, await backstopDeps({ contentKernel: backstopKernel(t, { audit: "broken" }) }));
  const result = await dispatchJsonRequest(app, "POST", `${BASE}/runs/run-1/undo-backstop`);
  assert.equal(result.status, 409);
  assert.match((result.body as { error: string }).error, /no such column/);
});

test("every backstop route 404s a foreign workspace before anything else", async () => {
  const app = routeApp(registerPublishBackstopRoutes, routeDeps());
  const other = `${BASE}`.replace("/ws/", "/other/");
  for (const [method, suffix] of [["GET", "/backstop/status"], ["GET", "/runs/run-1/backstop"], ["POST", "/backstop"], ["POST", "/runs/run-1/undo-backstop"]] as const) {
    assert.deepEqual(await dispatchJsonRequest(app, method, `${other}${suffix}`), { status: 404, body: { error: "workspace was not found" } }, suffix);
  }
});

test("run summary refuses a machine credential before reading the audit log", async (t) => {
  const server = await startTestServer(routeApp(registerPublishBackstopRoutes, routeDeps()), t);
  const response = await fetch(`${server}${BASE}/runs/run-1/backstop`, { headers: { "x-kind": "api_key" } });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "Only the owner and built-in admins can send items by hand.", code: "FORBIDDEN",
    details: { permission: "publish.backstop", reason: "credential_kind_not_permitted" },
  });
});

test("plan uploads a selected file's bytes the peer is missing before staging the bundle", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backstop-plan-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "assets", "footer.txt"), "live footer");
  const peer = fakePeer();
  const base = await backstopDeps({ contentKernel: backstopKernel(t), publishContentPeerHttpClient: peer });
  const app = routeApp(registerPublishBackstopRoutes, { ...base, siteBinding: { ...base.siteBinding, dir } });
  const result = await dispatchJsonRequest(app, "POST", `${BASE}/backstop`, { peerId: "peer-1", action: "plan", reason: REASON, files: ["assets/footer.txt"] });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(peer.calls.filter((call) => call.startsWith("/blobs/")).length, 2, peer.calls.join(","));
  assert.deepEqual((result.body as { blobsUploaded: unknown[] }).blobsUploaded.length, 1);
});
