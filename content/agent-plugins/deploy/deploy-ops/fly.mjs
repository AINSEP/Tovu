/** Fly read-only adapter. Auth, HTTP policy, bounded responses and audit belong to the host. */
const text = value => String(value ?? "").slice(0, 2000);
/** An app is a single path segment; encode only after validation to prevent path injection. */
function app(ctx, target) {
  if (typeof target !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(target)) ctx.fail("Target must be a Fly app name.");
  return encodeURIComponent(target);
}
/** Reduce mixed machine states without treating unchecked warnings or unknown states as health. */
function overall(machines) {
  if (machines.some(m => m.checks?.some(c => c.status === "critical"))) return "failing";
  if (machines.some(m => ["replacing", "starting", "updating"].includes(m.state))) return "deploying";
  if (machines.some(m => !["started", "stopped", "suspended", "created", "destroyed", "destroying", "stopping"].includes(m.state))) return "unknown";
  const started = machines.filter(m => m.state === "started");
  if (!started.length) return "stopped";
  return started.every(m => (m.checks ?? []).every(c => c.status === "passing")) ? "healthy" : "unknown";
}
/** Prefer the resolved image over a mutable config tag when the Machines API supplies it. */
function imageRef(machine) {
  const ref = machine.image_ref;
  if (typeof ref === "string") return ref;
  if (ref?.repository) return `${ref.registry ? `${ref.registry}/` : ""}${ref.repository}${ref.tag ? `:${ref.tag}` : ""}${ref.digest ? `@${ref.digest}` : ""}`;
  return machine.config?.image;
}
/** Return only machine identity/state and a bounded detail with region, image, checks and update time. */
async function status(ctx, { target }) {
  const response = await ctx.get(`https://api.machines.dev/v1/apps/${app(ctx, target)}/machines`);
  if (!Array.isArray(response.json) || response.json.some(m => !m || typeof m.id !== "string" || typeof m.state !== "string" || (m.checks !== undefined && (!Array.isArray(m.checks) || m.checks.some(c => !c || typeof c.status !== "string"))))) ctx.fail("Machine status response must be an array.");
  const machines = response.json; const state = overall(machines);
  return { platform: "fly", target, state, summary: `${machines.length} machines: ${state}`, items: machines.slice(0, 500).map(m => ({ id: text(m.id), state: text(m.state), detail: text(`region=${text(m.region)}; image=${text(imageRef(m))}; checks=${(m.checks ?? []).map(c => `${text(c.name)}:${text(c.status)}`).join(",")}; updated_at=${text(m.updated_at)}`) })), checkedAt: ctx.nowIso() };
}
/** HTTP logs endpoint not verified live. Accept array, logs wrapper, JSON lines or plain log text. */
async function logs(ctx, { target, limit }) {
  const response = await ctx.get(`https://api.fly.io/api/v1/apps/${app(ctx, target)}/logs`);
  let entries = Array.isArray(response.json) ? response.json : response.json?.logs;
  if (!Array.isArray(entries)) entries = response.text.split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return { message: line }; } });
  if (entries.some(entry => entry === null || (typeof entry !== "string" && (typeof entry !== "object" || Array.isArray(entry))))) ctx.fail("Log response contains an invalid entry.");
  const lines = entries.slice(0, limit).map(entry => {
    if (typeof entry === "string") return { message: text(entry) };
    return { ...(entry.timestamp || entry.at ? { at: text(entry.timestamp ?? entry.at) } : {}), ...(entry.instance || entry.source ? { source: text(entry.instance ?? entry.source) } : {}), ...(entry.level ? { level: text(entry.level) } : {}), message: text(entry.message ?? entry.msg ?? "") };
  });
  return { platform: "fly", target, lines, truncated: response.truncated === true || entries.length > limit || entries.some(e => String(typeof e === "string" ? e : e.message ?? e.msg ?? "").length > 2000) };
}
/** List apps in personal (default) or the explicitly supplied organization. No credential is exposed. */
async function listTargets(ctx, { org = "personal" } = {}) {
  const response = await ctx.get(`https://api.machines.dev/v1/apps?org_slug=${encodeURIComponent(org)}`);
  const apps = Array.isArray(response.json) ? response.json : response.json?.apps;
  if (!Array.isArray(apps)) ctx.fail("App list response must contain an apps array.");
  if (apps.some(a => !a || typeof a.name !== "string" || !a.name)) ctx.fail("App list response contains an invalid app.");
  return { platform: "fly", targets: apps.slice(0, 500).map(a => ({ id: text(a.name), name: text(a.name), ...(a.status ? { state: text(a.status) } : {}) })) };
}
export default { status, logs, listTargets };
