import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { createCustomCredential, InMemoryCustomCredentialSetRepo, listCustomCredentials, resolveCustomCredentialByLabel, type CustomCredentialWriteDeps } from "#src/features/custom-credentials/index";
import { createFormDestinationPort } from "../port.js";
import { buildFormDestinationRegistry } from "../registry.js";
import type { FormDestinationForm, FormDestinationKit, FormDestinationModule } from "../types.js";

/** @file The publish-side receiver port: selection, keys by scope, and an external receiver's prepare. */

const W = "ws-1";
const KEY = "k".repeat(43);
const kit = { marker: "kit" } as unknown as FormDestinationKit;
const FORMS: FormDestinationForm[] = [{ slug: "waitlist", fields: [{ name: "email", required: true }] }];
const receiving: FormDestinationModule = { pull: async () => ({ items: [], nextAfter: 0, hasMore: false }), ack: async () => ({ acknowledged: 0 }) };
const input = (hostingTargetId: string) => ({ workspaceId: W, hostingTargetId, projectName: "demo", kit });

function credentials(): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let n = 0;
  return { repo: new InMemoryCustomCredentialSetRepo(), sealer: new AesGcmSecretSealer(keyring), keyring,
    clock: createFakeClock({ startIso: "2026-10-19T00:00:00.000Z" }), idGen: { newId: () => `cred-${++n}` } };
}

function setup(required: { setting?: string; forms?: FormDestinationForm[]; relay?: FormDestinationModule; credentialLabel?: string }) {
  const creds = credentials();
  const prepared: unknown[] = [];
  const relay: FormDestinationModule = required.relay ?? { ...receiving, prepare: async (args) => { prepared.push(args); return { submitUrl: "https://relay.example/in/" }; } };
  const registry = buildFormDestinationRegistry({ refusals: [], loaded: [
    { descriptor: { id: "co", label: "Co", module: "co.mjs", receive: "co-hosted", hosts: ["host-a"] }, pluginId: "p1", module: receiving },
    { descriptor: { id: "relay", label: "Relay", module: "relay.mjs", receive: "external", ...(required.credentialLabel ? { credentialLabel: required.credentialLabel } : {}) }, pluginId: "p2", module: relay },
  ] });
  const port = createFormDestinationPort({ listForms: async () => required.forms ?? FORMS, credentials: creds,
    loadRegistry: async () => registry, readSetting: async () => required.setting }, { newSecret: () => KEY });
  return { port, creds, prepared };
}
const labels = async (creds: CustomCredentialWriteDeps) => (await listCustomCredentials(creds, { workspaceId: W })).map((summary) => summary.label);

test("co-hosted (auto): the host gets forms and key, no post address, and the key saves under the host scope at the published origin", async () => {
  const s = setup({});
  const plan = await s.port.prepare(input("host-a"));
  assert.deepEqual({ ...plan, save: typeof plan.save }, { hosting: { forms: FORMS, secret: KEY }, save: "function" });
  await plan.save!({ url: "https://site.example/page" });
  const saved = await resolveCustomCredentialByLabel(s.creds, { workspaceId: W, label: "Form submissions key: host-a" });
  assert.deepEqual([saved?.connection.token, saved?.baseUrl], [KEY, "https://site.example"]);
  assert.deepEqual(await s.port.previewInput(input("host-a")), { hosting: { forms: FORMS } });
});

test("external: prepare gets forms, key and site, returns the validated post address, and the key saves at the receiver's origin", async () => {
  const s = setup({ setting: "relay" });
  const plan = await s.port.prepare(input("host-z"));
  assert.equal(plan.submitUrl, "https://relay.example/in");
  assert.equal(plan.hosting, undefined, "the host gets no form add-on");
  assert.deepEqual(s.prepared, [{ kit, forms: FORMS, secret: KEY, site: { projectName: "demo" } }]);
  await plan.save!({ url: "https://site.example/" });
  const saved = await resolveCustomCredentialByLabel(s.creds, { workspaceId: W, label: "Form submissions key: relay" });
  assert.deepEqual([saved?.connection.token, saved?.baseUrl], [KEY, "https://relay.example"]);
});

test("external: the destination's own saved connection is passed when its descriptor names one, and named when missing", async () => {
  const s = setup({ setting: "relay", credentialLabel: "Relay key" });
  await assert.rejects(s.port.prepare(input("host-z")), /form destination 'relay' could not prepare its receiver: form destination 'relay' needs its saved connection "Relay key"\. Save it under Custom credentials with exactly that label, then try again/);
  await createCustomCredential(s.creds, { workspaceId: W, label: "Relay key", category: "hosting", baseUrl: "https://relay.example", connection: { token: "vendor-token", username: "me" } });
  await s.port.prepare(input("host-z"));
  assert.deepEqual((s.prepared.at(-1) as { credential: unknown }).credential, { token: "vendor-token", baseUrl: "https://relay.example", username: "me" });
});

test("external: a failing prepare or a bad post address stops the publish, and the key never appears in the error", async () => {
  const failing = setup({ setting: "relay", relay: { ...receiving, prepare: async ({ secret }) => { throw new Error(`rejected ${secret}`); } } });
  await assert.rejects(failing.port.prepare(input("host-z")), (error: Error) => error.message === "form destination 'relay' could not prepare its receiver: rejected [redacted]");
  const insecure = setup({ setting: "relay", relay: { ...receiving, prepare: async () => ({ submitUrl: "http://relay.example" }) } });
  await assert.rejects(insecure.port.prepare(input("host-z")), /could not prepare its receiver: the form destination returned a post address that is not a plain https URL/);
});

test("external preview: the destination's own answer, or a plain on line when it has no preview; a failure becomes an off line", async () => {
  const answer = { status: "on" as const, forms: 1, message: "Relay will create one inbox.", changes: [{ action: "create" }] };
  const own = setup({ setting: "relay", relay: { ...receiving, prepare: async () => ({ submitUrl: "https://r.example" }), preview: async () => answer } });
  assert.deepEqual(await own.port.previewInput(input("host-z")), { formSubmissions: answer });
  const plain = setup({ setting: "relay" });
  assert.deepEqual(await plain.port.previewInput(input("host-z")), { formSubmissions: { status: "on", forms: 1, message: "Form submissions: on (1 forms), received by Relay.", changes: [] } });
  const missing = setup({ setting: "relay", credentialLabel: "Relay key" });
  assert.equal((await missing.port.previewInput(input("host-z"))).formSubmissions?.status, "off");
  assert.deepEqual(await labels(plain.creds), [], "a preview never creates a key");
});

test("no destination for this host, or none: nothing is sent, no key is minted, and the preview says submissions are off", async () => {
  for (const [setting, host] of [[undefined, "host-z"], ["none", "host-a"]] as const) {
    const s = setup({ ...(setting ? { setting } : {}) });
    assert.deepEqual(await s.port.prepare(input(host)), {});
    const preview = await s.port.previewInput(input(host));
    assert.equal(preview.formSubmissions?.status, "off");
    assert.match(preview.formSubmissions?.message ?? "", /^Form submissions: off, because .+\. Submissions on the published site will not reach Tovu\. Install or turn on a form destination, or set the site's form receiver \(core\.forms receiver\), then preview again\.$/);
    assert.deepEqual(await labels(s.creds), []);
  }
});

test("a refused selection stops the publish with its message and shows it in the preview", async () => {
  const s = setup({ setting: "co" });
  await assert.rejects(s.port.prepare(input("host-z")), /^Error: form destination 'co' receives submissions only on host-a, not on host-z\./);
  assert.deepEqual(await s.port.previewInput(input("host-z")), { formSubmissions: { status: "off", forms: 1, changes: [],
    message: "Form submissions: form destination 'co' receives submissions only on host-a, not on host-z. Publish to one of those hosts, or set the site's form receiver (core.forms receiver) to auto or none, then publish again." } });
  assert.deepEqual(await labels(s.creds), []);
});

test("no active forms: the host still gets an empty list, nothing is selected and no key is minted; the preview adds nothing", async () => {
  const s = setup({ forms: [], setting: "co" });
  assert.deepEqual(await s.port.prepare(input("host-z")), { hosting: { forms: [] } });
  assert.deepEqual(await s.port.previewInput(input("host-z")), {});
  assert.deepEqual(await labels(s.creds), []);
});

test("external preview receives a saved connection without a username; non-Error throws from preview or prepare are reported by their string form", async () => {
  const previews: unknown[] = [];
  const answer = { status: "on" as const, forms: 1, message: "Relay ready.", changes: [] };
  const own = setup({ setting: "relay", credentialLabel: "Relay key", relay: { ...receiving, prepare: async () => ({ submitUrl: "https://r.example" }), preview: async (args) => { previews.push(args); return answer; } } });
  await createCustomCredential(own.creds, { workspaceId: W, label: "Relay key", category: "hosting", baseUrl: "https://relay.example", connection: { token: "vendor-token" } });
  assert.deepEqual(await own.port.previewInput(input("host-z")), { formSubmissions: answer });
  assert.deepEqual((previews[0] as { credential: unknown }).credential, { token: "vendor-token", baseUrl: "https://relay.example" });

  const throwing = setup({ setting: "relay", relay: { ...receiving, prepare: async () => { throw "relay offline"; }, preview: async () => { throw "preview offline"; } } });
  assert.deepEqual(await throwing.port.previewInput(input("host-z")), { formSubmissions: { status: "off", forms: 1, message: "Form submissions: preview offline.", changes: [] } });
  await assert.rejects(throwing.port.prepare(input("host-z")), { message: "form destination 'relay' could not prepare its receiver: relay offline" });
});
