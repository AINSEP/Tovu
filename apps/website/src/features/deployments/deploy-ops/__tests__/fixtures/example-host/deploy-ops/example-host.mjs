/**
 * @file Test fixture: a neutral deploy-ops adapter so core proves the generic runners (credential
 * resolution, host policy, bounded responses, secrets verbs, cards) without depending on any real
 * vendor's adapter. Real adapters are tested in their own plugins.
 * Wire shape: GET /v1/targets/{t}/instances, /v1/targets/{t}/logs, /v1/targets and
 * /v1/targets/{t}/secrets[/{name}?reveal=true]; POST/DELETE /v1/targets/{t}/secrets/{name}.
 */
const API = "https://api.example-host.dev/v1/targets";
const text = value => String(value ?? "").slice(0, 2000);
function target(ctx, value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(value)) ctx.fail("Target must be an example-host target name.");
  return encodeURIComponent(value);
}
function secretName(ctx, name) {
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name)) ctx.fail("Secret name must be an environment variable name.");
  return encodeURIComponent(name);
}
async function status(ctx, { target: t }) {
  const response = await ctx.get(`${API}/${target(ctx, t)}/instances`);
  if (!Array.isArray(response.json) || response.json.some(i => !i || typeof i.id !== "string" || typeof i.state !== "string")) ctx.fail("Instance status response must be an array.");
  const instances = response.json;
  const state = instances.length && instances.every(i => i.state === "running") ? "healthy" : "unknown";
  return { platform: "example-host", target: t, state, summary: `${instances.length} instances: ${state}`, items: instances.map(i => ({ id: text(i.id), state: text(i.state) })), checkedAt: ctx.nowIso() };
}
async function logs(ctx, { target: t, limit }) {
  const response = await ctx.get(`${API}/${target(ctx, t)}/logs`);
  const entries = Array.isArray(response.json) ? response.json : response.text.split(/\r?\n/).filter(Boolean);
  return { platform: "example-host", target: t, lines: entries.slice(0, limit).map(entry => ({ message: text(typeof entry === "string" ? entry : entry?.message) })), truncated: response.truncated === true || entries.length > limit };
}
async function listTargets(ctx) {
  const response = await ctx.get(API);
  if (!Array.isArray(response.json)) ctx.fail("Target list response must be an array.");
  return { platform: "example-host", targets: response.json.map(t => ({ id: text(t.name), name: text(t.name) })) };
}
const secretsUrl = (ctx, t) => `${API}/${target(ctx, t)}/secrets`;
async function listSecrets(ctx, { target: t }) {
  const response = await ctx.get(secretsUrl(ctx, t));
  const secrets = response.json?.secrets;
  if (!Array.isArray(secrets) || secrets.some(s => !s || typeof s.name !== "string" || !s.name)) ctx.fail("Secret list response must contain a secrets array.");
  return { secrets: secrets.map(s => ({ name: text(s.name), ...(typeof s.digest === "string" ? { digest: text(s.digest) } : {}) })), truncated: false };
}
async function readSecret(ctx, { target: t, name }) {
  const encoded = secretName(ctx, name);
  if (!(await listSecrets(ctx, { target: t })).secrets.some(s => s.name === name)) return { absent: true };
  const response = await ctx.get(`${secretsUrl(ctx, t)}/${encoded}?reveal=true`);
  if (typeof response.json?.value !== "string") ctx.fail("Example host did not return the secret's value.");
  return { value: response.json.value };
}
async function setSecret(ctx, { target: t, name, value }) {
  const response = await ctx.send({ method: "POST", url: `${secretsUrl(ctx, t)}/${secretName(ctx, name)}`, body: { value } });
  return { ...(Number.isInteger(response.json?.version) ? { version: response.json.version } : {}) };
}
async function unsetSecret(ctx, { target: t, name }) {
  const response = await ctx.send({ method: "DELETE", url: `${secretsUrl(ctx, t)}/${secretName(ctx, name)}` });
  return { ...(Number.isInteger(response.json?.version) ? { version: response.json.version } : {}) };
}
const secretCapabilities = { appliesOn: "next-deploy", supportsStaging: true };
export default { status, logs, listTargets, secretCapabilities, listSecrets, readSecret, setSecret, unsetSecret };
