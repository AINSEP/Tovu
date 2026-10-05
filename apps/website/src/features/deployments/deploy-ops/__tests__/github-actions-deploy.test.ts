import assert from "node:assert/strict";
import test from "node:test";
import { runDeploy } from "../run-ops.js";
import { buildDeployOpsRegistrations } from "../tool-registrations.js";
import { fixture, execution } from "./ops-fixture.js";
import { AT } from "./module-fixture.js";
const github = (await import(new URL("../../../../../../../content/agent-plugins/deploy/deploy-ops/github-actions.mjs", import.meta.url).href)).default;

const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "fedcba9876543210fedcba9876543210fedcba98";
const repo = "https://api.github.com/repos/owner/repo";
const workflow = `${repo}/actions/workflows/fly-deploy.yml`;
const lookup = `${workflow}/runs?event=workflow_dispatch&head_sha=${SHA}&per_page=10`;
const run = (id: number, extra: Record<string, unknown> = {}) => ({ id, head_sha: SHA, created_at: AT, html_url: `https://github.com/owner/repo/actions/runs/${id}`, ...extra });

/** Recorded-shape fake: GET answers come from a queue per URL; every send and sleep is captured. */
function ctx(gets: Record<string, unknown[]>, dispatched: { status: number; json?: unknown } = { status: 204 }) {
  const calls: string[] = []; const sends: any[] = []; const sleeps: number[] = [];
  return {
    calls, sends, sleeps, nowIso: () => AT,
    fail: (message: string): never => { throw new Error(message); },
    sleep: async (ms: number) => { sleeps.push(ms); },
    get: async (url: string) => {
      calls.push(url);
      const queue = gets[url]; assert.ok(queue?.length, `unexpected GET ${url}`);
      const json = queue.length > 1 ? queue.shift() : queue[0];
      return { status: 200, json, text: JSON.stringify(json) };
    },
    send: async (request: any) => { sends.push(request); return { status: dispatched.status, ...(dispatched.json ? { json: dispatched.json } : {}), text: "" }; },
  };
}

test("resolves ref to a full SHA, dispatches fly-deploy.yml pinned to it, and finds the run after it appears", async () => {
  const c = ctx({ [`${repo}/commits/release/next`]: [{ sha: SHA }], [lookup]: [{ workflow_runs: [] }, { workflow_runs: [run(77)] }] });
  assert.deepEqual(await github.deploy(c, { target: "owner/repo", ref: "release/next" }), {
    platform: "github-actions", target: "owner/repo", started: true, sha: SHA, runId: "77", url: "https://github.com/owner/repo/actions/runs/77",
    summary: `Dispatched fly-deploy.yml on 'release/next' at ${SHA}; run 77. The workflow refuses to deploy if 'release/next' no longer resolves to ${SHA} when it starts.`,
  });
  assert.deepEqual(c.sends, [{ method: "POST", url: `${workflow}/dispatches`, body: { ref: "release/next", inputs: { expected_sha: SHA } } }]);
  assert.deepEqual(c.calls, [`${repo}/commits/release/next`, lookup, lookup]);
  assert.deepEqual(c.sleeps, [2000]);
});

test("ref defaults to main; a run id in the dispatch response is used without lookups", async () => {
  const c = ctx({ [`${repo}/commits/main`]: [{ sha: SHA }] }, { status: 200, json: { workflow_run_id: 91, html_url: "https://github.com/owner/repo/actions/runs/91" } });
  const result = await github.deploy(c, { target: "owner/repo" });
  assert.equal(result.runId, "91"); assert.equal(result.sha, SHA);
  assert.equal(c.sends[0].body.ref, "main");
  assert.deepEqual(c.calls, [`${repo}/commits/main`]);
});

test("runs on another SHA or from before the dispatch are never reported as this deploy", async () => {
  const stale = { ...run(5), created_at: "2026-10-01T11:00:00.000Z" };
  const c = ctx({ [`${repo}/commits/main`]: [{ sha: SHA }], [lookup]: [{ workflow_runs: [run(4, { head_sha: OTHER }), stale] }] });
  const result = await github.deploy(c, { target: "owner/repo", ref: "main" });
  assert.equal(result.runId, undefined);
  assert.equal(result.started, true);
  assert.equal(result.summary, `Dispatched fly-deploy.yml on 'main' at ${SHA}, but its run was not visible yet. The workflow refuses to deploy if 'main' no longer resolves to ${SHA} when it starts. Check deployment_ops_status with branch 'main' in a minute.`);
  assert.deepEqual(c.sleeps, [2000, 2000, 2000, 2000]);
  assert.equal(c.calls.filter(u => u === lookup).length, 5);
});

test("bare SHAs, bad refs, injected targets and unresolvable refs are refused before any dispatch", async () => {
  for (const [input, gets, message] of [
    [{ target: "owner/repo", ref: SHA }, {}, "ref must be a branch or tag name; GitHub cannot dispatch a workflow at a bare commit SHA. Push the commit to a branch first."],
    [{ target: "owner/repo", ref: "../main" }, {}, "ref must be a branch or tag name."],
    [{ target: "owner/repo", ref: "main?x=1" }, {}, "ref must be a branch or tag name."],
    [{ target: "owner/../repo" }, {}, "Target must be owner/repo."],
    [{ target: "owner/repo", ref: "main" }, { [`${repo}/commits/main`]: [{ sha: "abc" }] }, "Could not resolve 'main' to a full commit SHA."],
  ] as const) {
    const c = ctx(gets as Record<string, unknown[]>);
    await assert.rejects(github.deploy(c, input), { message });
    assert.deepEqual(c.sends, []);
  }
});

test("through the real registry: runDeploy sends one JSON dispatch and deployment_ops_wait accepts the returned runId", async () => {
  const f = await fixture(["gh"], "https://api.github.com", []);
  const answers: Record<string, unknown> = {
    [`${repo}/commits/main`]: { sha: SHA },
    [lookup]: { workflow_runs: [run(77)] },
    [`${repo}/actions/runs/77`]: { id: 77, name: "Deploy to Fly.io", status: "completed", conclusion: "success", head_sha: SHA, html_url: "https://github.com/owner/repo/actions/runs/77" },
    [`${repo}/actions/runs/77/jobs?per_page=100`]: { jobs: [] },
  };
  f.deps.deployOpsHttpClient = { send: async (request: any) => {
    f.calls.push(request);
    if (request.method === "POST") return { status: 204, headers: {}, bodyText: "" };
    assert.ok(Object.hasOwn(answers, request.url), `unexpected ${request.method} ${request.url}`);
    return { status: 200, headers: {}, bodyText: JSON.stringify(answers[request.url]) };
  } };
  const started = await runDeploy({ deps: f.deps, input: { platform: "github-actions", target: "owner/repo" } });
  assert.equal(started.runId, "77"); assert.equal(started.sha, SHA);
  const post = f.calls.filter(c => c.method === "POST");
  assert.equal(post.length, 1);
  assert.equal(post[0].url, `${workflow}/dispatches`);
  assert.deepEqual(JSON.parse(post[0].body), { ref: "main", inputs: { expected_sha: SHA } });
  const wait = buildDeployOpsRegistrations(f.deps).find(r => r.descriptor.id === "deployment_ops_wait")!;
  const waited = await wait.handler(execution({ platform: "github-actions", target: "owner/repo", runId: started.runId, until: "finished" })) as any;
  assert.equal(waited.reached, true);
  assert.equal(waited.last.state, "healthy");
});
