import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";

import type { FormDefinitionRecord, FormSubmissionRecord } from "@jini-ai/cms/forms";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createCustomCredential, InMemoryCustomCredentialSetRepo, type CustomCredentialWriteDeps } from "#src/features/custom-credentials/index";
import type { DeployHostKit, DeployTargetRegistry, FormDestinationPage } from "#src/features/deployments/deploy-targets/types";
import { formDestinationKeyLabel } from "#src/features/deployments/static-publish/index";
import { composeFormSubmissions, type FormSubmissionsCompositionDeps } from "../form-submissions.js";

/** @file The composed form destination pull: saved keys → host pages → import → acknowledge → outbox. */

const W = "ws-1";
const waitlist: FormDefinitionRecord = { id: "f1", workspaceId: W, slug: "waitlist", name: "Waitlist", status: "active", notify: { enabled: true, recipients: [] },
  createdAt: "t", updatedAt: "t", version: 1, fields: [{ id: "email", label: "Email", type: "email", required: true, maxLength: 254 }] };
const page = (ids: string[], slug = "waitlist"): FormDestinationPage => ({ hasMore: false, nextAfter: ids.length,
  items: ids.map((id, index) => ({ seq: index + 1, id, formSlug: slug, answers: { email: `${id}@example.com` }, submittedAt: "2026-10-19T10:00:00.000Z", ip: null })) });

function setup({ hosts }: { hosts: Record<string, { pages?: FormDestinationPage[]; fail?: string }> }) {
  const keyring = new InMemoryKeyring();
  let n = 0;
  const clock = createFakeClock({ startIso: "2026-10-19T12:00:00.000Z" });
  const credentials: CustomCredentialWriteDeps = { repo: new InMemoryCustomCredentialSetRepo(), sealer: new AesGcmSecretSealer(keyring), keyring, clock, idGen: { newId: () => `cred-${++n}` } };
  const rows: FormSubmissionRecord[] = [];
  const acks: Record<string, string[]> = {};
  const outboxReads: string[] = [];
  const inner = new InMemoryOutbox();
  // Counts every outbox call except `enqueue`, i.e. the background delivery pass.
  const outbox = new Proxy(inner, { get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) => { if (prop !== "enqueue") outboxReads.push(String(prop)); return value.apply(target, args); };
  } });
  const modules = new Map(Object.entries(hosts).map(([targetId, host]) => [targetId, { module: {
    pullFormSubmissions: async () => { if (host.fail) throw new Error(host.fail); return host.pages?.shift() ?? { items: [], nextAfter: 0, hasMore: false }; },
    acknowledgeFormSubmissions: async ({ ids }: { ids: readonly string[] }) => { (acks[targetId] ??= []).push(...ids); return { acknowledged: ids.length }; },
  } }]));
  let registryLoads = 0;
  const deps: FormSubmissionsCompositionDeps = {
    formDefinitionRepo: { list: async () => [waitlist], findBySlug: async ({ slug }) => (slug === "waitlist" ? waitlist : null) },
    formSubmissionRepo: { create: async (record) => { rows.push(record); }, transaction: async (work) => work() },
    receipts: { claim: async () => true },
    outbox, bus: new InMemoryEventBus(), clock: { ...clock, nowIso: () => new Date(clock.nowMs()).toISOString() },
    idGen: { newId: () => `id-${++n}` }, credentials,
    loadDeployTargets: async () => { registryLoads += 1; return { get: (id: string) => modules.get(id), list: () => [], refusals: [] } as unknown as DeployTargetRegistry; },
  };
  const save = async (targetId: string, url: string) => createCustomCredential(credentials, { workspaceId: W, label: formDestinationKeyLabel({ targetId }), category: "hosting", baseUrl: url, connection: { token: "k".repeat(43) } });
  return { deps, rows, acks, outboxReads, save, registryLoads: () => registryLoads };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("no saved destination: a next-step message, and no host or registry is touched", async () => {
  const s = setup({ hosts: {} });
  const result = await composeFormSubmissions(s.deps, { kit: {} as DeployHostKit }).pull.pull({ workspaceId: W });
  assert.deepEqual(result.destinations, []);
  assert.match(result.message, /No published site receives form submissions yet\. Publish the site/);
  assert.equal(s.registryLoads(), 0);
});

test("one host imports and is acknowledged; a failing host is reported and does not stop the other", async () => {
  const s = setup({ hosts: { "host-ok": { pages: [page(["r1", "r2"])] }, "host-bad": { fail: "host said no" } } });
  await s.save("host-ok", "https://ok.example");
  await s.save("host-bad", "https://bad.example");
  const result = await composeFormSubmissions(s.deps, { kit: {} as DeployHostKit }).pull.pull({ workspaceId: W });
  await settle();
  assert.equal(s.rows.length, 2);
  assert.deepEqual(s.acks, { "host-ok": ["r1", "r2"] });
  const ok = result.destinations.find((report) => report.targetId === "host-ok");
  const bad = result.destinations.find((report) => report.targetId === "host-bad");
  assert.deepEqual({ imported: ok?.imported, acknowledged: ok?.acknowledged, url: ok?.url, error: ok?.error }, { imported: 2, acknowledged: 2, url: "https://ok.example", error: undefined });
  assert.equal(bad?.imported, 0);
  assert.match(bad?.error ?? "", /host said no/);
  assert.match(result.message, /^Imported 2 new form submissions from 2 published sites\./);
  assert.match(result.message, /https:\/\/bad\.example: .*host said no/);
  assert.ok(s.outboxReads.length > 0, "notification delivery starts once something was imported");
});

test("a target filter pulls only that destination; nothing imported means no delivery pass", async () => {
  const s = setup({ hosts: { "host-a": { pages: [] }, "host-b": { pages: [page(["x"])] } } });
  await s.save("host-a", "https://a.example");
  await s.save("host-b", "https://b.example");
  const result = await composeFormSubmissions(s.deps, { kit: {} as DeployHostKit }).pull.pull({ workspaceId: W }, { targetId: "host-a" });
  await settle();
  assert.deepEqual(result.destinations.map((report) => report.targetId), ["host-a"]);
  assert.equal(result.message, "Imported 0 new form submissions from 1 published site.");
  assert.deepEqual(s.outboxReads, []);
  assert.deepEqual(s.acks, {});
});

test("the message names invalid, skipped and still-waiting rows", async () => {
  const unknown = page(["u1"], "gone");
  const invalid: FormDestinationPage = { hasMore: true, nextAfter: 1, items: [{ seq: 1, id: "i1", formSlug: "waitlist", answers: { email: "not-an-email" }, submittedAt: "x", ip: null }] };
  const s = setup({ hosts: { h: { pages: [invalid, unknown] } } });
  await s.save("h", "https://h.example");
  const result = await composeFormSubmissions(s.deps, { kit: {} as DeployHostKit }).pull.pull({ workspaceId: W });
  await settle();
  assert.match(result.message, /^Imported 1 new form submission from 1 published site\./);
  assert.match(result.message, /1 did not pass the form's checks/);
  assert.match(result.message, /1 belong to forms that no longer exist/);
  assert.equal(result.destinations[0]?.skipped.length, 1);
});

test("the publish-side port lists the site's active forms as the generic manifest", async () => {
  const s = setup({ hosts: {} });
  const forms = await composeFormSubmissions(s.deps).destination.listForms({ workspaceId: W });
  assert.deepEqual(forms.map((form) => form.slug), ["waitlist"]);
});
