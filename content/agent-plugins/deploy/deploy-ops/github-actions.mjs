/** Actions observer and deploy dispatcher: requests stay on api.github.com; job-log archive redirects are never requested. */
const text = value => String(value ?? "").slice(0, 2000);
/** Reject path injection and build a fixed-host repository URL. */
function base(ctx, target) {
  if (typeof target !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+$/.test(target) || [".", ".."].includes(target.split("/")[1])) ctx.fail("Target must be owner/repo.");
  return `https://api.github.com/repos/${target.split("/").map(encodeURIComponent).join("/")}`;
}
/** Select the requested run or latest branch run, then fetch at most 100 jobs. O(1) requests. */
async function readRun(ctx, input) {
  const repo = base(ctx, input.target); const runs = `${repo}/actions/runs`;
  let run;
  if (input.runId !== undefined) {
    if (!/^\d+$/.test(input.runId)) ctx.fail("runId must contain only digits.");
    run = (await ctx.get(`${runs}/${input.runId}`)).json;
  } else {
    const response = (await ctx.get(`${runs}?per_page=5${input.branch ? `&branch=${encodeURIComponent(input.branch)}` : ""}`)).json;
    if (!Array.isArray(response?.workflow_runs)) ctx.fail("Workflow response must contain workflow_runs.");
    run = response.workflow_runs[0];
  }
  if (!run) return { repo, run: undefined, jobs: [], moreJobs: false };
  if (!/^\d+$/.test(String(run.id)) || typeof run.status !== "string") ctx.fail("Workflow run response is invalid.");
  const result = (await ctx.get(`${runs}/${run.id}/jobs?per_page=100`)).json;
  if (!Array.isArray(result?.jobs)) ctx.fail("Workflow jobs response must contain jobs.");
  if (result.jobs.some(j => !j || !/^\d+$/.test(String(j.id)) || typeof j.status !== "string" || (j.steps !== undefined && (!Array.isArray(j.steps) || j.steps.some(s => !s || typeof s.name !== "string"))))) ctx.fail("Workflow jobs response contains an invalid job.");
  return { repo, run, jobs: result.jobs.slice(0, 100), moreJobs: result.total_count > result.jobs.length || result.jobs.length > 100 };
}
/** Unknown conclusions remain unknown so wait-until-finished cannot invent completion. */
function state(run) {
  if (["queued", "in_progress", "waiting", "requested", "pending"].includes(run.status)) return "deploying";
  if (run.status !== "completed") return "unknown";
  if (run.conclusion === "success") return "healthy";
  if (["failure", "timed_out", "action_required", "startup_failure", "stale"].includes(run.conclusion)) return "failing";
  if (["cancelled", "skipped", "neutral"].includes(run.conclusion)) return "stopped";
  return "unknown";
}
const failedSteps = job => (Array.isArray(job.steps) ? job.steps : []).filter(s => ["failure", "timed_out", "cancelled"].includes(s.conclusion));
/** Normalize a run and its jobs; never return the raw workflow/job bodies. */
async function status(ctx, input) {
  const { run, jobs, moreJobs } = await readRun(ctx, input);
  if (!run) return { platform: "github-actions", target: input.target, state: "unknown", summary: "No workflow runs found.", items: [], checkedAt: ctx.nowIso() };
  return { platform: "github-actions", target: input.target, state: state(run), summary: text(`${text(run.name)}: ${text(run.status)}/${text(run.conclusion)}; head_sha=${text(run.head_sha)}${moreJobs ? "; jobs truncated" : ""}`), items: jobs.map(j => ({ id: text(j.id), name: text(j.name), state: text(j.conclusion ?? j.status), detail: text(`status=${text(j.status)}; conclusion=${text(j.conclusion)}; failed steps: ${failedSteps(j).map(s => text(s.name)).join(", ")}`) })), ...(typeof run.html_url === "string" && run.html_url.startsWith("https://github.com/") ? { url: text(run.html_url) } : {}), checkedAt: ctx.nowIso() };
}
/** Return failed steps plus bounded check-run annotations; stop fetching once the line cap is full. */
async function logs(ctx, input) {
  const { repo, jobs, moreJobs } = await readRun(ctx, input);
  const lines = []; let truncated = moreJobs;
  const failed = jobs.filter(j => ["failure", "timed_out", "action_required", "cancelled"].includes(j.conclusion) || failedSteps(j).length);
  const add = line => { if (lines.length < input.limit) lines.push(line); else truncated = true; if (String(line.message).length > 2000) truncated = true; };
  // Bound per-job I/O: at most 10 annotation requests plus the run/jobs requests.
  if (failed.length > 10) truncated = true;
  for (const [index, job] of failed.slice(0, 10).entries()) {
    for (const step of failedSteps(job)) {
      const message = `Failed step: ${String(step.name ?? "")}`;
      if (message.length > 2000) truncated = true;
      add({ source: text(job.name), level: "error", message: text(message) });
    }
    if (!/^\d+$/.test(String(job.id))) ctx.fail("Workflow job id is invalid.");
    // The API supports at most 100 annotations per page. Read enough to determine overflow, never redirect.
    const response = await ctx.get(`${repo}/check-runs/${job.id}/annotations?per_page=100`);
    if (!Array.isArray(response.json)) ctx.fail("Check annotations response must be an array.");
    for (const annotation of response.json) {
      if (!annotation || typeof annotation !== "object") ctx.fail("Check annotations response contains an invalid entry.");
      const message = `${annotation.path ? `${String(annotation.path)}:${String(annotation.start_line ?? "")}: ` : ""}${String(annotation.message ?? "")}`;
      if (message.length > 2000) truncated = true;
      add({ source: text(job.name), level: text(annotation.annotation_level ?? "error"), message: text(message) });
    }
    if (response.truncated || response.json.length >= 100) truncated = true;
    if (lines.length >= input.limit && index < failed.length - 1) { truncated = true; break; }
  }
  return { platform: "github-actions", target: input.target, lines, truncated };
}
/** The repo's deploy workflow. Its dispatch input `expected_sha` makes it refuse to deploy a ref that moved. */
const DEPLOY_WORKFLOW = "fly-deploy.yml";
const FULL_SHA = /^[0-9a-f]{40}$/;
const RUN_LOOKUPS = 5;
const RUN_LOOKUP_DELAY_MS = 2000;
/** Host and GitHub clocks differ; a run created this long before our dispatch can still be ours. */
const CLOCK_SKEW_MS = 30_000;
/** Branch or tag names only: the dispatch API runs a workflow on a ref, never at a bare commit. */
function refName(ctx, ref) {
  const value = ref ?? "main";
  if (typeof value !== "string" || value.length > 200 || !/^[A-Za-z0-9._/-]+$/.test(value) || /^[-/.]|[/.]$|\.\.|\/\/|\.lock$/.test(value)) ctx.fail("ref must be a branch or tag name.");
  if (/^[0-9a-fA-F]{40}$/.test(value)) ctx.fail("ref must be a branch or tag name; GitHub cannot dispatch a workflow at a bare commit SHA. Push the commit to a branch first.");
  return value;
}
/** Find our run: this workflow, this exact SHA, created no earlier than just before the dispatch. At most RUN_LOOKUPS GETs. */
async function findRun(ctx, workflow, sha, since) {
  for (let attempt = 0; attempt < RUN_LOOKUPS; attempt++) {
    if (attempt > 0) await ctx.sleep(RUN_LOOKUP_DELAY_MS);
    const response = (await ctx.get(`${workflow}/runs?event=workflow_dispatch&head_sha=${sha}&per_page=10`)).json;
    if (!Array.isArray(response?.workflow_runs)) ctx.fail("Workflow runs response must contain workflow_runs.");
    // A run on another SHA is never reported as this deploy, even if it is the newest.
    const run = response.workflow_runs.find(r => r && r.head_sha === sha && /^\d+$/.test(String(r.id)) && Date.parse(r.created_at) >= since);
    if (run) return run;
  }
  return undefined;
}
/** Resolve ref -> full SHA, dispatch the deploy workflow pinned to it, then return the run id. O(1) + bounded lookups. */
async function deploy(ctx, input) {
  const repo = base(ctx, input.target);
  const ref = refName(ctx, input.ref);
  const commit = (await ctx.get(`${repo}/commits/${ref.split("/").map(encodeURIComponent).join("/")}`)).json;
  if (typeof commit?.sha !== "string" || !FULL_SHA.test(commit.sha)) ctx.fail(`Could not resolve '${ref}' to a full commit SHA.`);
  const sha = commit.sha;
  const workflow = `${repo}/actions/workflows/${DEPLOY_WORKFLOW}`;
  const since = Date.parse(ctx.nowIso()) - CLOCK_SKEW_MS;
  const dispatched = await ctx.send({ method: "POST", url: `${workflow}/dispatches`, body: { ref, inputs: { expected_sha: sha } } });
  // Newer API versions may answer with the run directly; otherwise (204) look it up by SHA.
  const directId = dispatched.json?.workflow_run_id;
  const run = directId !== undefined && /^\d+$/.test(String(directId)) ? { id: directId, html_url: dispatched.json.html_url } : await findRun(ctx, workflow, sha, since);
  const pinned = `The workflow refuses to deploy if '${ref}' no longer resolves to ${sha} when it starts.`;
  if (!run) return { platform: "github-actions", target: input.target, started: true, sha, summary: text(`Dispatched ${DEPLOY_WORKFLOW} on '${ref}' at ${sha}, but its run was not visible yet. ${pinned} Check deployment_ops_status with branch '${ref}' in a minute.`) };
  return { platform: "github-actions", target: input.target, started: true, sha, runId: String(run.id), ...(typeof run.html_url === "string" && run.html_url.startsWith("https://github.com/") ? { url: text(run.html_url) } : {}), summary: text(`Dispatched ${DEPLOY_WORKFLOW} on '${ref}' at ${sha}; run ${run.id}. ${pinned}`) };
}
export default { status, logs, deploy };
