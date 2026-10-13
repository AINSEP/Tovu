/** Fly observer and app-secrets adapter. Auth, HTTP policy, bounded responses and audit belong to the host. */
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
/** App secrets live under one Machines API collection; names are env-var shaped before encoding. */
const secretsUrl = (ctx, target) => `https://api.machines.dev/v1/apps/${app(ctx, target)}/secrets`;
function secretName(ctx, name) {
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name)) ctx.fail("Secret name must be an environment variable name.");
  return encodeURIComponent(name);
}
/** Names, Fly digests and update times only. Values are never requested by a listing. */
async function listSecrets(ctx, { target }) {
  const response = await ctx.get(secretsUrl(ctx, target));
  const secrets = Array.isArray(response.json) ? response.json : response.json?.secrets;
  if (!Array.isArray(secrets) || secrets.some(s => !s || typeof s.name !== "string" || !s.name)) ctx.fail("Secret list response must contain a secrets array.");
  return { secrets: secrets.slice(0, 500).map(s => ({ name: text(s.name), ...(typeof s.digest === "string" ? { digest: text(s.digest) } : {}), ...(typeof s.updated_at === "string" ? { updatedAt: text(s.updated_at) } : {}) })), truncated: secrets.length > 500 };
}
/** Host-only value read for compare/copy. A name absent from the listing is reported, not fetched (Fly 404s it). */
async function readSecret(ctx, { target, name }) {
  const encoded = secretName(ctx, name);
  if (!(await listSecrets(ctx, { target })).secrets.some(s => s.name === name)) return { absent: true };
  const response = await ctx.get(`${secretsUrl(ctx, target)}/${encoded}?show_secrets=true`);
  if (typeof response.json?.value !== "string") ctx.fail("Fly did not return the secret's value; the token may lack permission to read secrets.");
  return { value: response.json.value };
}
/** POST stages the value: running machines keep the old one until the next deploy or machine update. */
async function setSecret(ctx, { target, name, value }) {
  const response = await ctx.send({ method: "POST", url: `${secretsUrl(ctx, target)}/${secretName(ctx, name)}`, body: { value } });
  return { ...(Number.isInteger(response.json?.version) ? { version: response.json.version } : {}) };
}
/** DELETE is staged the same way; the variable stays in running machines until the next deploy. */
async function unsetSecret(ctx, { target, name }) {
  const response = await ctx.send({ method: "DELETE", url: `${secretsUrl(ctx, target)}/${secretName(ctx, name)}` });
  return { ...(Number.isInteger(response.json?.version) ? { version: response.json.version } : {}) };
}
const secretCapabilities = { appliesOn: "next-deploy", supportsStaging: true };
export default { status, logs, listTargets, secretCapabilities, listSecrets, readSecret, setSecret, unsetSecret };
