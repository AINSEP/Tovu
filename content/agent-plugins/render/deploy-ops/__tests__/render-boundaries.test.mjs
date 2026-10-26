// F9 (Stryker L15: render deploy-ops 78.6 %): every id/ref/cursor/limit guard at limit and limit+1,
// the page loop at 99/100 rows and its 5-page cap, the service-type allow-list, the full state map,
// and the log truncation conjuncts one at a time. Strict ordered fake (fixtures.mjs); no network.
import assert from "node:assert/strict";
import test from "node:test";
import render from "../render.mjs";
import { API, TARGET, RUN, SERVICE, AT, context, response } from "./fixtures.mjs";

const INVALID_ID = { message: "Use a valid Render service or deployment ID." };
const SERVICE_URL = `${API}/services/${TARGET}`;

test("service ids: prefix, charset and 1..124-char suffix (128 total) are enforced before any request", async () => {
  for (const target of ["srv-", "xsrv-a", "srv-a/b", "srv-a b", `srv-${"a".repeat(125)}`, 5, undefined, "dep-abc"]) {
    const ctx = context();
    await assert.rejects(render.status(ctx, { target }), INVALID_ID, String(target));
    assert.equal(ctx.calls.length, 0);
  }
  const longest = `srv-${"a".repeat(124)}`;
  const ctx = context([{ url: `${API}/services/${longest}/deploys?limit=1`, json: [] }]);
  assert.equal((await render.status(ctx, { target: longest })).state, "unknown");
});

test("every Render deployment state maps to its overall state; anything else stays unknown", async () => {
  const map = {
    live: "healthy", build_failed: "failing", update_failed: "failing", pre_deploy_failed: "failing", canceled: "stopped", deactivated: "stopped",
    created: "deploying", queued: "deploying", build_in_progress: "deploying", pre_deploy_in_progress: "deploying", update_in_progress: "deploying",
    LIVE: "unknown", "": "unknown", succeeded: "unknown",
  };
  for (const [status, overall] of Object.entries(map)) {
    const ctx = context([{ url: `${SERVICE_URL}/deploys?limit=1`, json: [{ deploy: { id: RUN, status } }] }]);
    const result = await render.status(ctx, { target: TARGET });
    assert.deepEqual([result.state, result.items], [overall, [{ id: RUN, state: status }]], status);
    assert.equal(result.checkedAt, AT);
  }
});

test("a deployment read by id must be that id; a list read must be an array", async () => {
  await assert.rejects(render.status(context([{ url: `${SERVICE_URL}/deploys/${RUN}`, json: { id: "dep-other", status: "live" } }]), { target: TARGET, runId: RUN }), { message: "Render did not return the requested deployment." });
  await assert.rejects(render.status(context([{ url: `${SERVICE_URL}/deploys/${RUN}`, json: { id: RUN, status: 5 } }]), { target: TARGET, runId: RUN }), { message: "Render did not return the requested deployment." });
  await assert.rejects(render.status(context([{ url: `${SERVICE_URL}/deploys?limit=1`, json: { deploy: {} } }]), { target: TARGET }), { message: "Render did not return a deployment list." });
  await assert.rejects(render.status(context([{ url: `${SERVICE_URL}/deploys?limit=1`, response: response([], 200, { truncated: true }) }]), { target: TARGET }), { message: "Render returned an incomplete deployment response." });
});

test("deploy: ref must be exactly 40 hex chars; only server service types are dispatched", async () => {
  for (const ref of ["a".repeat(39), "a".repeat(41), "g".repeat(40), ` ${"a".repeat(40)}`, `${"a".repeat(40)}\n`, 5]) {
    const ctx = context();
    await assert.rejects(render.deploy(ctx, { target: TARGET, ref }), { message: "Render ref must be a full commit SHA; omit it to deploy the connected branch." }, JSON.stringify(ref));
    assert.equal(ctx.calls.length, 0);
  }
  for (const type of ["static_site", "cron_job", undefined]) {
    await assert.rejects(render.deploy(context([{ url: SERVICE_URL, json: { ...SERVICE, type } }]), { target: TARGET }), { message: "Choose an existing Render server service; static sites and cron jobs are not supported." });
  }
  for (const found of [{ ...SERVICE, id: "srv-other" }, null]) {
    await assert.rejects(render.deploy(context([{ url: SERVICE_URL, json: found }]), { target: TARGET }), { message: "Render did not return the requested service." });
  }
  for (const type of ["web_service", "private_service", "background_worker"]) {
    const ctx = context([{ url: SERVICE_URL, json: { ...SERVICE, type } }, { method: "POST", url: `${SERVICE_URL}/deploys`, body: { commitId: "A".repeat(40) }, response: response({ id: RUN }, 201) }]);
    assert.deepEqual(await render.deploy(ctx, { target: TARGET, ref: "A".repeat(40) }), { platform: "render", target: TARGET, started: true, runId: RUN, sha: "A".repeat(40), summary: "Render accepted the deployment. Check its status to see when it is live." });
  }
});

test("deploy acceptance: 202 is queued without a run id, only 201 with a dep- id (1..124 chars) is accepted", async () => {
  const post = (res) => context([{ url: SERVICE_URL, json: SERVICE }, { method: "POST", url: `${SERVICE_URL}/deploys`, body: {}, response: res }]);
  assert.deepEqual(await render.deploy(post(response(null, 202)), { target: TARGET }), { platform: "render", target: TARGET, started: true, summary: "Render queued the deployment behind one already running. Wait for the service's latest deployment status." });
  for (const res of [response({ id: RUN }, 200), response({ id: RUN }, 201, { truncated: true })]) {
    await assert.rejects(render.deploy(post(res), { target: TARGET }), { message: "Render did not confirm deployment acceptance. Check Render before retrying." });
  }
  for (const id of ["dep-", `dep-${"a".repeat(125)}`, `xdep-a`, "dep-a/b", 7]) {
    await assert.rejects(render.deploy(post(response({ id }, 201)), { target: TARGET }), { message: "Render accepted the request without a usable deployment ID. Check Render before retrying." }, String(id));
  }
  assert.equal((await render.deploy(post(response({ id: `dep-${"a".repeat(124)}` }, 201)), { target: TARGET })).runId, `dep-${"a".repeat(124)}`);
});

const row = (i, cursor = `c${i}`) => ({ cursor, service: { id: `srv-s${i}`, name: `s${i}`, type: "web_service" } });
const pageUrl = (cursor) => `${API}/services?limit=100${cursor ? `&cursor=${cursor}` : ""}`;

test("discovery pages: 99 rows end the scan, 100 rows continue with the last cursor, the 5th full page is a refusal", async () => {
  const ninetyNine = Array.from({ length: 99 }, (_, i) => row(i));
  assert.equal((await render.listTargets(context([{ url: pageUrl(), json: ninetyNine }]), {})).targets.length, 99);
  const full = (p) => Array.from({ length: 100 }, (_, i) => row(p * 100 + i));
  const twoPages = context([{ url: pageUrl(), json: full(0) }, { url: pageUrl("c99"), json: [row(100)] }]);
  assert.equal((await render.listTargets(twoPages, {})).targets.length, 101);
  const steps = [0, 1, 2, 3, 4].map((p) => ({ url: pageUrl(p === 0 ? undefined : `c${p * 100 - 1}`), json: full(p) }));
  await assert.rejects(render.listTargets(context(steps), {}), { message: "Render service discovery reached 500 services. Narrow it with the workspace ID in org." });
});

test("discovery refuses an oversized or truncated page and every unusable cursor", async () => {
  await assert.rejects(render.listTargets(context([{ url: pageUrl(), json: Array.from({ length: 101 }, (_, i) => row(i)) }]), {}), { message: "Render returned an incomplete or invalid list." });
  await assert.rejects(render.listTargets(context([{ url: pageUrl(), response: response([], 200, { truncated: true }) }]), {}), { message: "Render returned an incomplete or invalid list." });
  for (const cursor of [undefined, "", "x".repeat(2001)]) {
    const rows = Array.from({ length: 100 }, (_, i) => row(i, "c"));
    rows[99] = { ...rows[99], cursor };
    await assert.rejects(render.listTargets(context([{ url: pageUrl(), json: rows }]), {}), { message: "Render did not return a usable pagination cursor." }, String(cursor));
  }
  const longCursor = "x".repeat(2000);
  const rows = Array.from({ length: 100 }, (_, i) => row(i, longCursor));
  const repeat = context([{ url: pageUrl(), json: rows }, { url: pageUrl(longCursor), json: rows }]);
  await assert.rejects(render.listTargets(repeat, {}), { message: "Render did not return a usable pagination cursor." });
  assert.equal(repeat.calls.length, 2, "a 2000-char cursor is usable; the SAME cursor twice is not");
});

test("discovery keeps only server types and refuses an invalid entry", async () => {
  const mixed = [row(1), { cursor: "c", service: { id: "srv-static", name: "st", type: "static_site" } }, { cursor: "c", service: { id: "srv-cron", name: "cr", type: "cron_job" } }];
  assert.deepEqual((await render.listTargets(context([{ url: pageUrl(), json: mixed }]), {})).targets, [{ id: "srv-s1", name: "s1" }]);
  await assert.rejects(render.listTargets(context([{ url: pageUrl(), json: [{ service: { id: "srv-a", name: 5, type: "web_service" } }] }]), {}), { message: "Render returned an invalid service entry." });
  const scoped = context([{ url: `${API}/services?ownerId=tea%2F1&limit=100`, json: [] }]);
  await render.listTargets(scoped, { org: "tea/1" });
  scoped.done();
});

const logsUrl = (limit) => `${API}/logs?ownerId=tea-owner123&resource=${TARGET}&limit=${limit}&direction=backward`;
const entry = (message = "m") => ({ message, timestamp: AT, labels: [{ name: "level", value: "info" }] });

test("log limit: 1 and 1000 accepted (the request asks for at most 100), 0 and 1001 refused before any request", async () => {
  for (const limit of [0, 1001, 1.5, "10"]) {
    const ctx = context();
    await assert.rejects(render.logs(ctx, { target: TARGET, limit }), { message: "Render log limit must be between 1 and 1000." }, String(limit));
    assert.equal(ctx.calls.length, 0);
  }
  for (const [limit, asked] of [[1, 1], [1000, 100]]) {
    const ctx = context([{ url: SERVICE_URL, json: SERVICE }, { url: logsUrl(asked), json: { logs: [entry()] } }]);
    assert.deepEqual(await render.logs(ctx, { target: TARGET, limit }), { platform: "render", target: TARGET, lines: [{ at: AT, level: "info", message: "m" }], truncated: false });
  }
});

test("log truncation: each reason alone — response truncated, hasMore, more entries than the limit, a message over 2000 chars", async () => {
  const run = async (res) => (await render.logs(context([{ url: SERVICE_URL, json: SERVICE }, { url: logsUrl(2), response: res }]), { target: TARGET, limit: 2 })).truncated;
  assert.equal(await run(response({ logs: [entry(), entry()] })), false);
  assert.equal(await run(response({ logs: [entry("x".repeat(2000))] })), false);
  assert.equal(await run(response({ logs: [entry()] }, 200, { truncated: true })), true);
  assert.equal(await run(response({ logs: [entry()], hasMore: true })), true);
  assert.equal(await run(response({ logs: [entry(), entry(), entry()] })), true);
  assert.equal(await run(response({ logs: [entry("x".repeat(2001))] })), true);
});

test("logs need the service's workspace id and well-formed entries", async () => {
  for (const ownerId of [undefined, "", 5]) {
    await assert.rejects(render.logs(context([{ url: SERVICE_URL, json: { ...SERVICE, ownerId } }]), { target: TARGET, limit: 1 }), { message: "Render did not return the service workspace ID needed for logs." });
  }
  for (const bad of [{ ...entry(), message: 5 }, { ...entry(), timestamp: null }, { ...entry(), labels: "level" }, null]) {
    await assert.rejects(render.logs(context([{ url: SERVICE_URL, json: SERVICE }, { url: logsUrl(1), json: { logs: [bad] } }]), { target: TARGET, limit: 1 }), { message: "Render returned an invalid log entry." });
  }
  const noLevel = context([{ url: SERVICE_URL, json: SERVICE }, { url: logsUrl(1), json: { logs: [{ message: "m", timestamp: AT, labels: [{ name: "lvl", value: "x" }, null] }] } }]);
  assert.deepEqual((await render.logs(noLevel, { target: TARGET, limit: 1 })).lines, [{ at: AT, message: "m" }]);
});

test("env var keys: 1..128 chars, never '.', '..' or a control character; secrets list only names", async () => {
  for (const name of ["", "x".repeat(129), ".", "..", "A\nB", "A\u007fB", 5]) {
    const ctx = context();
    await assert.rejects(render.setSecret(ctx, { target: TARGET, name, value: "v" }), { message: "Use a valid Render environment variable key." }, JSON.stringify(name));
    await assert.rejects(render.unsetSecret(ctx, { target: TARGET, name }), { message: "Use a valid Render environment variable key." });
    assert.equal(ctx.calls.length, 0);
  }
  const key = "K".repeat(128);
  const put = context([{ method: "PUT", url: `${SERVICE_URL}/env-vars/${key}`, body: { value: "v" }, json: {} }]);
  assert.deepEqual(await render.setSecret(put, { target: TARGET, name: key, value: "v" }), {});
  const listed = context([{ url: `${SERVICE_URL}/env-vars?limit=100`, json: [{ cursor: "c", envVar: { key: "A", value: "secret" } }] }]);
  assert.deepEqual(await render.listSecrets(listed, { target: TARGET }), { secrets: [{ name: "A" }], truncated: false });
  for (const envVar of [{ key: "" }, { key: "x".repeat(129) }, { key: 5 }, null]) {
    await assert.rejects(render.listSecrets(context([{ url: `${SERVICE_URL}/env-vars?limit=100`, json: [{ cursor: "c", envVar }] }]), { target: TARGET }), { message: "Render returned an invalid environment variable key." });
  }
  assert.deepEqual(render.secretCapabilities, { appliesOn: "next-deploy", supportsStaging: true });
});
