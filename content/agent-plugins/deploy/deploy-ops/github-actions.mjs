/** Actions observer: requests stay on api.github.com; job-log archive redirects are never requested. */
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
export default { status, logs };
