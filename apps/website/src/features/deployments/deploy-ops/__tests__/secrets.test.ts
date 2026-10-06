import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SurfaceEmitter } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { forceRemove } from "../../../agent-plugins/__tests__/fixtures/force-remove.js";
import { fingerprintSiteKeyHex } from "../../../webhooks/keyring.env.js";
import { SITE_KEY_MANAGE_PERMISSION } from "../../../identity/site-key-permission.js";
import { loadDeployOpsRegistryFromSource } from "../registry.js";
import { runListSecrets, runSetSecret, runUnsetSecret, secretFingerprint, type SecretConfirmRequest } from "../secrets.js";
import { buildDeployOpsRegistrations } from "../tool-registrations.js";
import { fixture, execution } from "./ops-fixture.js";

/**
 * The generic secrets verbs against the real bundled Fly adapter, with a scripted HTTP fake in place of
 * the network. Every case also proves no secret value reaches the result.
 */
const SITE_KEY = "ab".repeat(32);
const OTHER_KEY = "cd".repeat(32);
const API = "https://api.machines.dev/v1/apps/shop/secrets";
type Route = { status: number; body: unknown };

async function harness(table: Record<string, Route>, extra: { siteKey?: string } = {}) {
  const f = await fixture();
  const calls: Array<{ method: string; url: string; body?: string }> = [];
  f.deps.deployOpsHttpClient = { send: async (request: any) => {
    calls.push({ method: request.method, url: request.url, ...(request.body !== undefined ? { body: request.body } : {}) });
    const route = table[`${request.method} ${request.url}`];
    assert.ok(route, `unexpected ${request.method} ${request.url}`);
    return { status: route.status, headers: {}, bodyText: JSON.stringify(route.body) };
  } };
  const deps = { ...f.deps, readSiteKey: () => ("siteKey" in extra ? extra.siteKey : SITE_KEY) };
  return { deps, calls, f };
}
const listed = (...names: string[]): Route => ({ status: 200, body: { secrets: names.map(name => ({ name, digest: `d-${name}`, updated_at: "2026-10-05T00:00:00Z", value: "never-forwarded" })) } });
const shown = (name: string, value: string): Route => ({ status: 200, body: { name, digest: `d-${name}`, value } });
const noSecretIn = (result: unknown, ...values: string[]) => { for (const value of values) assert.equal(JSON.stringify(result).includes(value), false, `result leaked ${value.slice(0, 6)}...`); };
const confirmer = (confirmed: boolean) => {
  const asked: SecretConfirmRequest[] = [];
  return { asked, confirm: async (request: SecretConfirmRequest) => { asked.push(request); return confirmed ? { confirmed: true as const } : { confirmed: false as const, result: { cancelled: true, note: "The user cancelled. Nothing was changed." } }; } };
};

test("list returns names, vendor digests and times, never values, with when writes apply", async () => {
  const h = await harness({ [`GET ${API}`]: listed("ANALYTICS_ROOT_KEY_SEED", "OLD_KEY") });
  const result = await runListSecrets({ deps: h.deps, input: { platform: "fly", target: "shop" } });
  assert.deepEqual(result, { platform: "fly", target: "shop", truncated: false, appliesOn: "next-deploy", supportsStaging: true, deployNeeded: true, secrets: [
    { name: "ANALYTICS_ROOT_KEY_SEED", digest: "d-ANALYTICS_ROOT_KEY_SEED", updatedAt: "2026-10-05T00:00:00Z" },
    { name: "OLD_KEY", digest: "d-OLD_KEY", updatedAt: "2026-10-05T00:00:00Z" },
  ] });
  noSecretIn(result, "never-forwarded");
  assert.deepEqual(h.calls.map(c => `${c.method} ${c.url}`), [`GET ${API}`]);
  assert.deepEqual(h.f.audit.entries.map(e => ({ method: e.method, host: e.host, status: e.status })), [{ method: "GET", host: "api.machines.dev", status: 200 }]);
});

test("set from the site key creates an absent secret without a card and stages it for the next deploy", async () => {
  const h = await harness({ [`GET ${API}`]: listed("OLD_KEY"), [`POST ${API}/TOVU_SITE_KEY`]: { status: 201, body: { name: "TOVU_SITE_KEY", version: 7, value: SITE_KEY } } });
  const c = confirmer(true);
  const result = await runSetSecret({ deps: h.deps, input: { platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "site-key" } } }, { confirm: c.confirm });
  assert.deepEqual(result, {
    platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "site-key" }, comparison: "absent", fingerprint: fingerprintSiteKeyHex(SITE_KEY), fingerprintKind: "site-key",
    appliesOn: "next-deploy", supportsStaging: true, deployNeeded: true, changed: true, version: "7",
    summary: "Set 'TOVU_SITE_KEY' on 'shop' from this site's key. The running app keeps the old environment until the next deploy of 'shop' (deployment_ops_deploy).",
  });
  noSecretIn(result, SITE_KEY);
  assert.deepEqual(c.asked, []);
  const post = h.calls.find(call => call.method === "POST")!;
  assert.deepEqual(JSON.parse(post.body!), { value: SITE_KEY });
});

test("an identical stored value is not rewritten", async () => {
  const h = await harness({ [`GET ${API}`]: listed("TOVU_SITE_KEY"), [`GET ${API}/TOVU_SITE_KEY?show_secrets=true`]: shown("TOVU_SITE_KEY", SITE_KEY) });
  const result = await runSetSecret({ deps: h.deps, input: { platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "site-key" } } });
  assert.equal(result.changed, false); assert.equal(result.comparison, "same"); assert.equal(result.deployNeeded, false);
  assert.equal(result.summary, "'TOVU_SITE_KEY' on 'shop' already holds this site's key; nothing was written.");
  assert.equal(h.calls.some(call => call.method === "POST"), false);
  noSecretIn(result, SITE_KEY);
});

test("replacing a different value asks first; a declined card writes nothing, a confirmed one writes", async () => {
  const table = { [`GET ${API}`]: listed("TOVU_SITE_KEY"), [`GET ${API}/TOVU_SITE_KEY?show_secrets=true`]: shown("TOVU_SITE_KEY", OTHER_KEY), [`POST ${API}/TOVU_SITE_KEY`]: { status: 201, body: { version: 8 } } };
  const declined = await harness(table); const no = confirmer(false);
  const refused = await runSetSecret({ deps: declined.deps, input: { platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "site-key" } } }, { confirm: no.confirm });
  assert.equal(refused.changed, false); assert.equal(refused.cancelled, true); assert.equal(refused.comparison, "different");
  assert.deepEqual(no.asked, [{ action: "overwrite", platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: "this site's key", comparison: "different", appliesOn: "next-deploy" }]);
  assert.equal(declined.calls.some(call => call.method === "POST"), false);
  noSecretIn(refused, SITE_KEY, OTHER_KEY);
  const accepted = await harness(table); const yes = confirmer(true);
  const written = await runSetSecret({ deps: accepted.deps, input: { platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "site-key" } } }, { confirm: yes.confirm });
  assert.equal(written.changed, true); assert.equal(written.version, "8");
  assert.equal(yes.asked.length, 1);
});

test("an existing secret the adapter cannot read compares as unknown and fails closed without a confirm channel", async () => {
  const h = await harness({ [`GET ${API}`]: listed("TOVU_SITE_KEY"), [`GET ${API}/TOVU_SITE_KEY?show_secrets=true`]: { status: 403, body: { error: "forbidden" } } });
  await assert.rejects(runSetSecret({ deps: h.deps, input: { platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "site-key" } } }), { name: "ToolInputError", message: "Changing existing secret 'TOVU_SITE_KEY' needs a human confirmation, and this call has no way to ask. Nothing was changed." });
  assert.equal(h.calls.some(call => call.method === "POST"), false);
  const asked = confirmer(false);
  const result = await runSetSecret({ deps: (await harness({ [`GET ${API}`]: listed("TOVU_SITE_KEY"), [`GET ${API}/TOVU_SITE_KEY?show_secrets=true`]: { status: 403, body: {} } })).deps, input: { platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "site-key" } } }, { confirm: asked.confirm });
  assert.equal(result.comparison, "unknown"); assert.equal(asked.asked[0]!.comparison, "unknown");
});

test("copying another secret on the same target reads it server side and never returns it", async () => {
  const h = await harness({ [`GET ${API}`]: listed("OLD_KEY"), [`GET ${API}/OLD_KEY?show_secrets=true`]: shown("OLD_KEY", OTHER_KEY), [`POST ${API}/TOVU_SITE_KEY`]: { status: 201, body: {} } });
  const result = await runSetSecret({ deps: h.deps, input: { platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "secret", name: "OLD_KEY" } } });
  assert.equal(result.changed, true); assert.equal(result.comparison, "absent");
  assert.deepEqual({ fingerprint: result.fingerprint, kind: result.fingerprintKind }, { fingerprint: fingerprintSiteKeyHex(OTHER_KEY), kind: "site-key" });
  assert.deepEqual(JSON.parse(h.calls.find(call => call.method === "POST")!.body!), { value: OTHER_KEY });
  assert.equal(result.summary, "Set 'TOVU_SITE_KEY' on 'shop' from secret OLD_KEY. The running app keeps the old environment until the next deploy of 'shop' (deployment_ops_deploy).");
  noSecretIn(result, OTHER_KEY);
  const missing = await harness({ [`GET ${API}`]: listed() });
  await assert.rejects(runSetSecret({ deps: missing.deps, input: { platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "secret", name: "OLD_KEY" } } }), { name: "ToolInputError", message: "Secret 'OLD_KEY' is not set on 'shop', so there is nothing to copy. List the secrets with deployment_ops_list_secrets." });
  await assert.rejects(runSetSecret({ deps: missing.deps, input: { platform: "fly", target: "shop", name: "OLD_KEY", source: { kind: "secret", name: "OLD_KEY" } } }), { message: "source.name must differ from name; a secret cannot be copied onto itself." });
});

test("dryRun compares and writes nothing", async () => {
  const h = await harness({ [`GET ${API}`]: listed() });
  const result = await runSetSecret({ deps: h.deps, input: { platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "site-key" }, dryRun: true } });
  assert.equal(result.changed, false); assert.equal(result.dryRun, true); assert.equal(result.deployNeeded, false);
  assert.equal(result.summary, "Dry run: 'TOVU_SITE_KEY' would be created from this site's key. Nothing was written.");
  assert.deepEqual(h.calls.map(c => c.method), ["GET"]);
});

test("refusals happen before any HTTP: no site key, bad names, platforms without a secrets adapter", async () => {
  const h = await harness({}, { siteKey: undefined });
  await assert.rejects(runSetSecret({ deps: h.deps, input: { platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "site-key" } } }), { message: "This site has no usable site key to copy. Check Security > Site key in the admin first." });
  await assert.rejects(runSetSecret({ deps: h.deps, input: { platform: "fly", target: "shop", name: "1BAD", source: { kind: "site-key" } } }), { message: "name must be an environment variable name (letters, digits and underscores, not starting with a digit, at most 128 characters)." });
  await assert.rejects(runUnsetSecret({ deps: h.deps, input: { platform: "fly", target: "shop", name: "A-B" } }), { message: "name must be an environment variable name (letters, digits and underscores, not starting with a digit, at most 128 characters)." });
  await assert.rejects(runListSecrets({ deps: h.deps, input: { platform: "github-actions", target: "o/r" } }), { name: "ToolInputError", message: "Deployment ops platform 'github-actions' has no secrets adapter. Platforms with one: fly." });
  assert.deepEqual(h.calls, []);
});

test("unset reports an absent name, asks before deleting, and a declined card deletes nothing", async () => {
  const absent = await harness({ [`GET ${API}`]: listed("OTHER") });
  const none = await runUnsetSecret({ deps: absent.deps, input: { platform: "fly", target: "shop", name: "OLD_KEY" } });
  assert.deepEqual({ removed: none.removed, summary: none.summary }, { removed: false, summary: "'OLD_KEY' is not set on 'shop'; nothing was removed." });
  const table = { [`GET ${API}`]: listed("OLD_KEY"), [`DELETE ${API}/OLD_KEY`]: { status: 200, body: { version: 9 } } };
  const declined = await harness(table); const no = confirmer(false);
  assert.equal((await runUnsetSecret({ deps: declined.deps, input: { platform: "fly", target: "shop", name: "OLD_KEY" } }, { confirm: no.confirm })).removed, false);
  assert.deepEqual(no.asked, [{ action: "remove", platform: "fly", target: "shop", name: "OLD_KEY", appliesOn: "next-deploy" }]);
  assert.equal(declined.calls.some(call => call.method === "DELETE"), false);
  await assert.rejects(runUnsetSecret({ deps: (await harness(table)).deps, input: { platform: "fly", target: "shop", name: "OLD_KEY" } }), { message: "Changing existing secret 'OLD_KEY' needs a human confirmation, and this call has no way to ask. Nothing was changed." });
  const accepted = await harness(table);
  const removed = await runUnsetSecret({ deps: accepted.deps, input: { platform: "fly", target: "shop", name: "OLD_KEY" } }, { confirm: confirmer(true).confirm });
  assert.deepEqual(removed, { platform: "fly", target: "shop", name: "OLD_KEY", appliesOn: "next-deploy", supportsStaging: true, deployNeeded: true, removed: true, version: "9", summary: "Removed 'OLD_KEY' from 'shop'. The running app keeps the old environment until the next deploy of 'shop' (deployment_ops_deploy)." });
  assert.deepEqual(accepted.calls.map(c => `${c.method} ${c.url}`), [`GET ${API}`, `DELETE ${API}/OLD_KEY`]);
});

test("tools: the site-key source needs the site-key permission; a value can never ride in on the input", async () => {
  const h = await harness({ [`GET ${API}`]: listed() });
  const denied = { ...h.deps, authorize: async ({ permission }: { permission: string }) => ({ allowed: permission !== SITE_KEY_MANAGE_PERMISSION, reason: "denied" }) };
  const set = buildDeployOpsRegistrations(denied as typeof h.deps).find(r => r.descriptor.id === "deployment_ops_set_secret")!;
  await assert.rejects(set.handler(execution({ platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "site-key" } })), { message: `principal 'principal' is not authorized for '${SITE_KEY_MANAGE_PERMISSION}' (denied)` });
  for (const [input, message] of [
    [{ platform: "fly", target: "shop", name: "X", source: { kind: "site-key", value: "leak" } }, "source must be {kind:'site-key'} or {kind:'secret', name}."],
    [{ platform: "fly", target: "shop", name: "X", source: { kind: "literal" } }, "source must be {kind:'site-key'} or {kind:'secret', name}."],
    [{ platform: "fly", target: "shop", name: "X", source: { kind: "site-key" }, value: "leak" }, "Unexpected deployment ops input 'value'."],
    [{ platform: "fly", target: "shop", name: "X", source: { kind: "site-key" }, dryRun: "yes" }, "dryRun must be a boolean."],
  ] as const) await assert.rejects(set.handler(execution(input)), { name: "ToolInputError", message });
  assert.deepEqual(h.calls, []);
  const schema = set.descriptor.inputSchema as any;
  assert.deepEqual(Object.keys(schema.properties), ["platform", "target", "credentialLabel", "name", "source", "dryRun"]);
  assert.deepEqual(schema.required, ["platform", "target", "name", "source"]);
  assert.deepEqual(schema.properties.source.properties.kind.enum, ["site-key", "secret"]);
});

test("tools: unset holds the call on a card for the named human and re-checks permission before deleting", async () => {
  const h = await harness({ [`GET ${API}`]: listed("OLD_KEY"), [`DELETE ${API}/OLD_KEY`]: { status: 200, body: {} } });
  const store = createSurfaceExchangeStore();
  const checks: string[] = [];
  const counted = { ...h.deps, authorize: async ({ permission }: { permission: string }) => { checks.push(permission); return { allowed: true, reason: "matched" }; } };
  const unset = buildDeployOpsRegistrations(counted as typeof h.deps, { surfaceExchanges: store }).find(r => r.descriptor.id === "deployment_ops_unset_secret")!;
  assert.equal(unset.descriptor.readOnly, false);
  let emitted = 0;
  const emitSurface: SurfaceEmitter = async emission => {
    emitted++;
    assert.deepEqual(h.calls.map(c => c.method), ["GET"], "the DELETE must wait for the click");
    assert.match(JSON.stringify(emission.payload), /Remove secret OLD_KEY from shop\?/);
    const exchangeId = store.findTypedAnswerTarget({ principalId: "principal", toolId: "deployment_ops_unset_secret" })!;
    assert.deepEqual(store.deliver({ exchangeId, toolId: "deployment_ops_unset_secret", principalId: "principal", params: { decision: "confirm" } }), { ok: true });
  };
  const result = await unset.handler(execution({ platform: "fly", target: "shop", name: "OLD_KEY" }), { emitSurface }) as Record<string, unknown>;
  assert.equal(emitted, 1); assert.equal(result.removed, true);
  assert.deepEqual(h.calls.map(c => c.method), ["GET", "DELETE"]);
  assert.deepEqual(checks, ["custom-credentials.write", "custom-credentials.write"]);
  const headless = buildDeployOpsRegistrations(h.deps, { surfaceExchanges: store }).find(r => r.descriptor.id === "deployment_ops_unset_secret")!;
  await assert.rejects(headless.handler(execution({ platform: "fly", target: "shop", name: "OLD_KEY" })), { message: /^DEPLOY_OPS_NO_CONFIRMATION_CHANNEL: deployment_ops_unset_secret/ });
});

test("fingerprints: site-key-shaped values match the Security page; others are a short sha256", () => {
  assert.deepEqual(secretFingerprint(SITE_KEY), { fingerprint: fingerprintSiteKeyHex(SITE_KEY), fingerprintKind: "site-key" });
  assert.deepEqual(secretFingerprint("hunter2"), { fingerprint: "f52fbd32b2b3", fingerprintKind: "sha256" });
});

test("registry refuses a half secrets adapter and missing capabilities", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "deploy-ops-secrets-"));
  try {
    await mkdir(path.join(root, "m"));
    const manifest = (module: string) => JSON.stringify({ schemaVersion: 1, platforms: [{ id: "example", label: "Example", hosts: ["api.example.com"], module }] });
    const base = "const status = async () => ({}); const logs = async () => ({}); const f = async () => ({});";
    for (const [file, body, refusal] of [
      ["half.mjs", `${base} export default { status, logs, listSecrets: f, setSecret: f };`, "a secrets adapter must export listSecrets(), setSecret() and unsetSecret() together"],
      ["nocaps.mjs", `${base} export default { status, logs, listSecrets: f, setSecret: f, unsetSecret: f };`, "secretCapabilities must declare appliesOn and supportsStaging"],
      ["readonly.mjs", `${base} export default { status, logs, readSecret: f };`, "secretCapabilities and readSecret need listSecrets(), setSecret() and unsetSecret()"],
    ] as const) {
      await writeFile(path.join(root, "m", file), body);
      await writeFile(path.join(root, "tovu-deploy-ops.json"), manifest(`m/${file}`));
      assert.deepEqual((await loadDeployOpsRegistryFromSource({ pluginId: "deploy", packageRoot: root })).refusals, [`deploy ops platform 'example' was not loaded: ${refusal}`]);
    }
  } finally { await forceRemove(root); }
});

test("the default site-key reader resolves this site's sources; no bound site means no key to copy", async () => {
  const h = await harness({ [`GET ${API}`]: listed() });
  const { readSiteKey: _ignored, ...deps } = h.deps;
  await assert.rejects(runSetSecret({ deps, input: { platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "site-key" }, dryRun: true } }), { message: "This site has no usable site key to copy. Check Security > Site key in the admin first." });
  const siteDir = await mkdtemp(path.join(tmpdir(), "deploy-ops-site-"));
  const previous = { key: process.env.TOVU_SITE_KEY, mode: process.env.TOVU_RUNTIME_MODE };
  process.env.TOVU_SITE_KEY = OTHER_KEY; delete process.env.TOVU_RUNTIME_MODE;
  try {
    const result = await runSetSecret({ deps: { ...deps, siteBinding: { dir: siteDir } }, input: { platform: "fly", target: "shop", name: "TOVU_SITE_KEY", source: { kind: "site-key" }, dryRun: true } });
    assert.equal(result.fingerprint, fingerprintSiteKeyHex(OTHER_KEY));
  } finally {
    if (previous.key === undefined) delete process.env.TOVU_SITE_KEY; else process.env.TOVU_SITE_KEY = previous.key;
    if (previous.mode !== undefined) process.env.TOVU_RUNTIME_MODE = previous.mode;
    await forceRemove(siteDir);
  }
});
