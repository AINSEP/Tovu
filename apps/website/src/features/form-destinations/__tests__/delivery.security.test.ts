import assert from "node:assert/strict";
import test from "node:test";

import { FormDeliveryError, type FormDeliveryJob } from "@jini-ai/cms/forms";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { createCustomCredential, InMemoryCustomCredentialSetRepo, updateCustomCredential, type CustomCredentialWriteDeps } from "#src/features/custom-credentials/index";
import type { CustomCredentialSetRecord } from "#src/features/custom-credentials/index";
import { createCustomCredentialConnectionPort } from "../connection-port.js";
import { createFormDestinationDeliverer } from "../deliver.js";
import { buildFormDestinationRegistry } from "../registry.js";
import type { FormDeliveryConnectionPort, FormDestinationCredential, FormDestinationKit, FormDestinationModule } from "../types.js";

/**
 * @file Phase-A security pins for push delivery's host side: the custom-credential connection port
 * opens only the vault entry a binding names (its stable id is re-checked after the label lookup,
 * and other workspaces' entries are invisible), and the deliverer resolves the credential fresh on
 * every attempt, refuses without one, and never puts it in the job.
 */

const W = "ws-delivery";
const kit: FormDestinationKit = { fetch: async () => new Response(null, { status: 204 }), timeouts: {} };
// Built at runtime so no secret-shaped literal is committed.
const token = (tag: string) => `${tag}-${"t".repeat(20)}`;

function credentialDeps(repo = new InMemoryCustomCredentialSetRepo()): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let n = 0;
  return { repo, sealer: new AesGcmSecretSealer(keyring), keyring,
    clock: createFakeClock({ startIso: "2026-10-20T00:00:00.000Z" }), idGen: { newId: () => `cred-${++n}` } };
}

function save(deps: CustomCredentialWriteDeps, required: { workspaceId?: string; label: string; secret: string }) {
  return createCustomCredential(deps, { workspaceId: required.workspaceId ?? W, label: required.label, category: "general",
    baseUrl: "https://rows.example.com", connection: { token: required.secret } });
}

function job(connectionRef: string): FormDeliveryJob {
  return {
    binding: { bindingId: "b1", adapterId: "rows", connectionRef, enabled: true, config: { table: "leads" } },
    snapshot: { form: { slug: "contact", fields: [{ name: "email", required: true, label: "Email", type: "email" }] },
      submission: { id: "s1", answers: { email: "a@example.com" }, submittedAt: "2026-10-20T00:00:00.000Z" } },
    idempotencyKey: JSON.stringify(["s1", "b1"]),
  };
}

function registryWith(module: FormDestinationModule) {
  return buildFormDestinationRegistry({ refusals: [], loaded: [{ descriptor: { id: "rows", label: "Rows", module: "rows.mjs" }, pluginId: "p1", module }] });
}

test("the connection port opens the vault entry whose stable id the binding names", async () => {
  const deps = credentialDeps();
  const saved = await save(deps, { label: "Rows", secret: token("first") });
  const port = createCustomCredentialConnectionPort({ credentials: deps });
  assert.deepEqual(await port({ workspaceId: W, connectionRef: saved.id, adapterId: "rows" }), { token: token("first"), baseUrl: "https://rows.example.com" });
});

test("a label swapped to another entry between the id read and the open yields no credential", async () => {
  // The vault opens by label; this repo renames entries right after the id read, as a concurrent edit would.
  class RacingRepo extends InMemoryCustomCredentialSetRepo {
    swap: (() => Promise<void>) | undefined;
    override async findById(input: { workspaceId: string; id: string }): Promise<CustomCredentialSetRecord | null> {
      const found = await super.findById(input);
      const swap = this.swap;
      this.swap = undefined;
      await swap?.();
      return found;
    }
  }
  const repo = new RacingRepo();
  const deps = credentialDeps(repo);
  const named = await save(deps, { label: "Rows", secret: token("named") });
  const other = await save(deps, { label: "Other", secret: token("other") });
  repo.swap = async () => {
    await updateCustomCredential(deps, { workspaceId: W, id: named.id, label: "Rows (old)" });
    await updateCustomCredential(deps, { workspaceId: W, id: other.id, label: "Rows" });
  };
  const port = createCustomCredentialConnectionPort({ credentials: deps });
  assert.equal(await port({ workspaceId: W, connectionRef: named.id, adapterId: "rows" }), null);
});

test("a connectionRef saved in another workspace yields no credential", async () => {
  const deps = credentialDeps();
  const foreign = await save(deps, { workspaceId: "ws-other", label: "Rows", secret: token("foreign") });
  const port = createCustomCredentialConnectionPort({ credentials: deps });
  assert.equal(await port({ workspaceId: W, connectionRef: foreign.id, adapterId: "rows" }), null);
});

test("each attempt resolves the credential fresh for the job's workspace and never writes it into the job", async () => {
  const asked: unknown[] = [];
  let current = token("before-rotation");
  const connections: FormDeliveryConnectionPort = async (input) => { asked.push(input); return { token: current, baseUrl: "https://rows.example.com" }; };
  const received: FormDestinationCredential[] = [];
  const registryWorkspaces: string[] = [];
  const deliver = createFormDestinationDeliverer({ connections, kit, loadRegistry: async ({ workspaceId }) => {
    registryWorkspaces.push(workspaceId);
    return registryWith({ deliver: async ({ credential, binding, idempotencyKey }) => { received.push(credential); assert.equal(binding?.bindingId, "b1"); assert.equal(idempotencyKey, '["s1","b1"]'); } });
  } });
  const frozen = job("conn-1");
  const before = JSON.stringify(frozen);

  await deliver({ workspaceId: W, job: frozen });
  current = token("after-rotation");
  await deliver({ workspaceId: W, job: frozen });

  assert.deepEqual(received.map(credential => credential.token), [token("before-rotation"), token("after-rotation")]);
  assert.deepEqual(asked, [{ workspaceId: W, connectionRef: "conn-1", adapterId: "rows" }, { workspaceId: W, connectionRef: "conn-1", adapterId: "rows" }]);
  assert.deepEqual(registryWorkspaces, [W, W]);
  assert.equal(JSON.stringify(frozen), before, "the job is unchanged");
  assert.equal(before.includes("rotation"), false, "no credential in the job");
});

test("no credential for the binding refuses as non-retryable authorization-required without calling the adapter", async () => {
  let calls = 0;
  const deliver = createFormDestinationDeliverer({ connections: async () => null, kit,
    loadRegistry: async () => registryWith({ deliver: async () => { calls += 1; } }) });
  await assert.rejects(deliver({ workspaceId: W, job: job("conn-gone") }), (error: unknown) =>
    error instanceof FormDeliveryError && error.message === "authorization-required" && error.retryable === false);
  assert.equal(calls, 0);
});

test("a loaded receive-only destination (no deliver) refuses as adapter-unavailable before any credential is opened", async () => {
  let opened = 0;
  const receiveOnly = buildFormDestinationRegistry({ refusals: [], loaded: [{ descriptor: { id: "rows", label: "Rows", module: "rows.mjs", receive: "co-hosted", hosts: ["host-a"] },
    pluginId: "p1", module: { pull: async () => ({ items: [], nextAfter: 0, hasMore: false }), ack: async () => ({ acknowledged: 0 }) } }] });
  assert.ok(receiveOnly.get("rows"), "sanity: the destination is loaded");
  const deliver = createFormDestinationDeliverer({ connections: async () => { opened += 1; return null; }, kit, loadRegistry: async () => receiveOnly });
  await assert.rejects(deliver({ workspaceId: W, job: job("conn-1") }), (error: unknown) =>
    error instanceof FormDeliveryError && error.message === "adapter-unavailable" && error.retryable === true);
  assert.equal(opened, 0);
});

test("an adapter id no loaded destination has refuses as adapter-unavailable", async () => {
  const deliver = createFormDestinationDeliverer({ connections: async () => null, kit,
    loadRegistry: async () => buildFormDestinationRegistry({ refusals: [], loaded: [] }) });
  await assert.rejects(deliver({ workspaceId: W, job: job("conn-1") }), (error: unknown) =>
    error instanceof FormDeliveryError && error.message === "adapter-unavailable" && error.retryable === true);
});
