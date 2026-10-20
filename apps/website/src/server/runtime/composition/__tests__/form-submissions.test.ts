import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test, { after } from "node:test";

import type { FormDefinitionRecord, FormSubmissionRecord } from "@jini-ai/cms/forms";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createCustomCredential, InMemoryCustomCredentialSetRepo, type CustomCredentialWriteDeps } from "#src/features/custom-credentials/index";
import type { DeployHostKit } from "#src/features/deployments/deploy-targets/types";
import { formDestinationKeyLabel, type FormDestinationPage, type FormDestinationRegistry } from "#src/features/form-destinations/index";
import { InMemorySettingsRepo, ensureSettingDefinitions, SCOPE_BIT } from "@jini-ai/core/settings";
import { FORM_PULL_LEASE_MS } from "#src/features/form-destinations/index";
import { closeSqliteConnection, sqliteKernel } from "#src/platform/db/kernel/index";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqlFormPullLeaseRepo } from "#src/platform/db/repos/form-delivery-repo";
import { composeFormSubmissions, type FormSubmissionsCompositionDeps } from "../form-submissions.js";

/** @file The composed form destination pull: saved keys → destination pages → import → acknowledge → outbox. */

const W = "ws-1";
const waitlist: FormDefinitionRecord = { id: "f1", workspaceId: W, slug: "waitlist", name: "Waitlist", status: "active", notify: { enabled: true, recipients: [] },
  createdAt: "t", updatedAt: "t", version: 1, fields: [{ id: "email", label: "Email", type: "email", required: true, maxLength: 254 }] };
const page = (ids: string[], slug = "waitlist"): FormDestinationPage => ({ hasMore: false, nextAfter: ids.length,
  items: ids.map((id, index) => ({ seq: index + 1, id, formSlug: slug, answers: { email: `${id}@example.com` }, submittedAt: "2026-10-19T10:00:00.000Z", ip: null })) });

// The real lease store over an in-memory content.db, so the pins below exercise the shipped claim rules.
const openStores: Parameters<typeof closeSqliteConnection>[0][] = [];
after(() => { for (const store of openStores) closeSqliteConnection(store); });
function realLeases(): SqlFormPullLeaseRepo {
  const db = openContentDb(":memory:");
  openStores.push(db);
  return new SqlFormPullLeaseRepo({ kernel: sqliteKernel(db) });
}

function setup({ hosts }: { hosts: Record<string, { pages?: FormDestinationPage[]; fail?: string; pull?: () => Promise<FormDestinationPage> }> }) {
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
  // Each saved scope resolves to its own fake destination, as a co-hosted one resolves by host id.
  const pulls: string[] = [];
  const modules = new Map(Object.entries(hosts).map(([scope, host]) => [scope, { module: {
    pull: async () => {
      pulls.push(scope);
      if (host.pull) return host.pull();
      if (host.fail) throw new Error(host.fail);
      return host.pages?.shift() ?? { items: [], nextAfter: 0, hasMore: false };
    },
    ack: async ({ ids }: { ids: readonly string[] }) => { (acks[scope] ??= []).push(...ids); return { acknowledged: ids.length }; },
  } }]));
  let registryLoads = 0;
  const deps: FormSubmissionsCompositionDeps = {
    formDefinitionRepo: { list: async () => [waitlist], findBySlug: async ({ slug }) => (slug === "waitlist" ? waitlist : null) },
    formSubmissionRepo: { create: async (record) => { rows.push(record); }, transaction: async (work) => work() },
    receipts: { claim: async () => true },
    pullLeases: realLeases(),
    outbox, bus: new InMemoryEventBus(), clock: { ...clock, nowIso: () => new Date(clock.nowMs()).toISOString() },
    idGen: { newId: () => `id-${++n}` }, credentials,
    loadFormDestinations: async () => { registryLoads += 1; return { resolve: ({ scope }: { scope: string }) => modules.get(scope), get: () => undefined, list: () => [], refusals: [] } as unknown as FormDestinationRegistry; },
    settingsRepo: new InMemorySettingsRepo(),
  };
  const save = async (scope: string, url: string) => createCustomCredential(credentials, { workspaceId: W, label: formDestinationKeyLabel({ scope }), category: "hosting", baseUrl: url, connection: { token: "k".repeat(43) } });
  return { deps, rows, acks, outboxReads, pulls, clock, save, registryLoads: () => registryLoads };
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
  const s = setup({ hosts: { "host-ok": { pages: [page(["r1", "r2"])] }, "host-bad": { fail: `host said no to ${"k".repeat(43)}` } } });
  await s.save("host-ok", "https://ok.example");
  await s.save("host-bad", "https://bad.example");
  const logged: string[] = [];
  const result = await composeFormSubmissions(s.deps, { kit: {} as DeployHostKit, logError: (line) => logged.push(line) }).pull.pull({ workspaceId: W });
  await settle();
  assert.equal(s.rows.length, 2);
  assert.deepEqual(s.acks, { "host-ok": ["r1", "r2"] });
  const ok = result.destinations.find((report) => report.targetId === "host-ok");
  const bad = result.destinations.find((report) => report.targetId === "host-bad");
  assert.deepEqual({ imported: ok?.imported, acknowledged: ok?.acknowledged, url: ok?.url, error: ok?.error }, { imported: 2, acknowledged: 2, url: "https://ok.example", error: undefined });
  assert.equal(bad?.imported, 0);
  assert.match(bad?.error ?? "", /host said no/);
  // The person gets the next step and a reference; the log has the full cause under it, never the key.
  const reference = /report reference (\S+): the site's server log has the details\.$/.exec(bad?.error ?? "")?.[1];
  assert.ok(reference, "the report names a reference");
  assert.equal(logged.length, 1);
  assert.match(logged[0]!, new RegExp(`^\\[form-submissions\\] pull from https://bad\\.example \\(host-bad\\) failed, reference ${reference}: Error: host said no to \\[redacted\\]\\n\\s+at `));
  assert.ok(!logged[0]!.includes("k".repeat(43)) && !(bad?.error ?? "").includes("k".repeat(43)), "the key is never logged or returned");
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

test("the publish-side port hands the site's active forms, as the generic manifest, to the receiver auto selects", async () => {
  const s = setup({ hosts: {} });
  const cohosted = { descriptor: { id: "dest", label: "Dest", module: "d.mjs", receive: "co-hosted" as const, hosts: ["host-a"] }, pluginId: "p", module: {} };
  s.deps = { ...s.deps, loadFormDestinations: async () => ({ list: () => [cohosted], get: () => cohosted, resolve: () => cohosted, refusals: [] }) };
  const preview = await composeFormSubmissions(s.deps).destination.previewInput({ workspaceId: W, hostingTargetId: "host-a", projectName: "demo", kit: {} as DeployHostKit });
  assert.deepEqual(preview.hosting?.forms.map((form) => form.slug), ["waitlist"]);
});

// ---- Security pins (phase A): the per-receiver pull lease and the automatic pull's admission. ----

/** A receiver whose first page waits until the test releases it, to hold a pull in flight. */
function heldHost() {
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let entered!: () => void;
  const inFlight = new Promise<void>((resolve) => { entered = resolve; });
  return { release, inFlight, host: { pull: async (): Promise<FormDestinationPage> => { entered(); await released; return page(["held-1"]); } } };
}

test("security: a manual pull while the receiver's pull is in flight answers already-running and reads nothing", async () => {
  const held = heldHost();
  const s = setup({ hosts: { h: held.host } });
  await s.save("h", "https://h.example");
  const port = composeFormSubmissions(s.deps, { kit: {} as DeployHostKit }).pull;
  const first = port.pull({ workspaceId: W });
  await held.inFlight;
  const second = await port.pull({ workspaceId: W });
  assert.deepEqual({ ran: second.ran, reason: second.ran ? undefined : second.reason, refused: second.destinations[0]?.refused }, { ran: false, reason: "already-running", refused: "already-running" });
  assert.match(second.message, /https:\/\/h\.example: a pull from this site is already running/);
  assert.deepEqual(s.pulls, ["h"], "the refused pull never reached the receiver");
  held.release();
  const done = await first;
  assert.equal(done.ran, true);
  assert.equal(done.totals.imported, 1);
});

test("security: the automatic pull is skipped within a minute of the last start, while a manual pull still runs", async () => {
  const s = setup({ hosts: { h: { pages: [] } } });
  await s.save("h", "https://h.example");
  const composed = composeFormSubmissions(s.deps, { kit: {} as DeployHostKit });
  await composed.pull.pull({ workspaceId: W });
  s.clock.advanceMs(59_000);
  await composed.autoPull.run({ workspaceId: W });
  assert.deepEqual(s.pulls, ["h"], "an automatic pull 59 s after the last start reads nothing");
  await composed.pull.pull({ workspaceId: W });
  assert.deepEqual(s.pulls, ["h", "h"], "a manual pull bypasses the recent-start check");
  s.clock.advanceMs(60_000);
  await composed.autoPull.run({ workspaceId: W });
  assert.deepEqual(s.pulls, ["h", "h", "h"]);
});

test("security: a lease left by a crashed pull blocks the receiver only until it expires", async () => {
  const s = setup({ hosts: { h: { pages: [] } } });
  await s.save("h", "https://h.example");
  // A pull that claimed the lease and then died without releasing it.
  const crashed = await s.deps.pullLeases.claim({ workspaceId: W, receiverKey: "h:https://h.example", token: "crashed",
    nowIso: s.deps.clock.nowIso(), recentMs: 0, leaseMs: FORM_PULL_LEASE_MS });
  assert.deepEqual(crashed, { claimed: true });
  const port = composeFormSubmissions(s.deps, { kit: {} as DeployHostKit }).pull;
  s.clock.advanceMs(FORM_PULL_LEASE_MS - 1);
  assert.equal((await port.pull({ workspaceId: W })).ran, false);
  s.clock.advanceMs(1);
  assert.equal((await port.pull({ workspaceId: W })).ran, true);
  assert.deepEqual(s.pulls, ["h"]);
});

test("security: core.forms/autoPull false stops the automatic pull, never the manual one", async () => {
  const s = setup({ hosts: { h: { pages: [] } } });
  await s.save("h", "https://h.example");
  // Registered with default OFF here; lot F4 owns the real definition (default ON).
  await ensureSettingDefinitions({ settingsRepo: s.deps.settingsRepo, clock: s.deps.clock, ids: s.deps.idGen, principals: { findActiveById: async ({ id }) => ({ id }) } },
    { namespace: "core.forms", systemPrincipalId: "system", definitions: [{ key: "autoPull", schema: { type: "boolean" }, defaultValue: false, scopes: SCOPE_BIT.workspace }] });
  const composed = composeFormSubmissions(s.deps, { kit: {} as DeployHostKit });
  await composed.autoPull.run({ workspaceId: W });
  assert.deepEqual(s.pulls, []);
  await composed.pull.pull({ workspaceId: W });
  assert.deepEqual(s.pulls, ["h"]);
});

test("the pull reports per-form counts and totals beside the existing per-receiver report", async () => {
  const s = setup({ hosts: { h: { pages: [{ hasMore: false, nextAfter: 3, items: [...page(["a1", "a2"]).items, ...page(["g1"], "gone").items] }] } } });
  await s.save("h", "https://h.example");
  const result = await composeFormSubmissions(s.deps, { kit: {} as DeployHostKit }).pull.pull({ workspaceId: W });
  assert.deepEqual(result.forms, [
    { formId: "f1", formSlug: "waitlist", imported: 2, alreadyImported: 0, unmapped: 0, failed: 0 },
    { formId: null, formSlug: "gone", imported: 0, alreadyImported: 0, unmapped: 1, failed: 0 },
  ]);
  assert.deepEqual(result.totals, { imported: 2, alreadyImported: 0, unmapped: 1, failed: 0 });
  assert.equal(result.ran, true);
  assert.equal(result.destinations[0]?.imported, 2);
});

test("rows of a page whose import fails count as failed for their form; earlier pages keep their counts", async () => {
  const s = setup({ hosts: { h: { pages: [{ ...page(["ok-1"]), hasMore: true }, { ...page(["bad-1", "bad-2"]), hasMore: false }] } } });
  await s.save("h", "https://h.example");
  let claims = 0;
  s.deps = { ...s.deps, receipts: { claim: async () => { claims += 1; if (claims === 2) throw new Error("store offline"); return true; } } };
  const result = await composeFormSubmissions(s.deps, { kit: {} as DeployHostKit, logError: () => {} }).pull.pull({ workspaceId: W });
  assert.deepEqual(result.forms, [{ formId: "f1", formSlug: "waitlist", imported: 1, alreadyImported: 0, unmapped: 0, failed: 2 }]);
  assert.deepEqual(result.totals, { imported: 1, alreadyImported: 0, unmapped: 0, failed: 2 });
  assert.match(result.destinations[0]?.error ?? "", /store offline/);
});
