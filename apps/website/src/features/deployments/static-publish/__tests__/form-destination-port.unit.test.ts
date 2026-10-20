import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { InMemoryCustomCredentialSetRepo, listCustomCredentials, resolveCustomCredentialByLabel, type CustomCredentialWriteDeps } from "#src/features/custom-credentials/index";
import { createFormDestinationPort, formDestinationKeyLabel, listFormDestinations } from "../form-destination-port.js";

/** @file The form destination key lifecycle over the real credential store (in-memory repo, real sealer). */

const W = "ws-1";
const KEY_A = "a".repeat(43);
const KEY_B = "b".repeat(43);

function credentials(overrides: Partial<CustomCredentialWriteDeps> = {}): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let n = 0;
  return { repo: new InMemoryCustomCredentialSetRepo(), sealer: new AesGcmSecretSealer(keyring), keyring,
    clock: createFakeClock({ startIso: "2026-10-19T00:00:00.000Z" }), idGen: { newId: () => `cred-${++n}` }, ...overrides };
}

const forms = async () => [{ slug: "waitlist", fields: [{ name: "email", required: true }] }];

test("a first publish mints a key and saves it only when told the published address", async () => {
  const creds = credentials();
  const port = createFormDestinationPort({ listForms: forms, credentials: creds }, { newSecret: () => KEY_A });
  assert.deepEqual(await port.listForms({ workspaceId: W }), await forms());
  const key = await port.receiverKey({ workspaceId: W, targetId: "host-a" });
  assert.equal(key.secret, KEY_A);
  assert.deepEqual(await listCustomCredentials(creds, { workspaceId: W }), [], "nothing is saved before the host has the key");
  await key.save!({ url: "https://site-a.example/some/path" });
  const saved = await resolveCustomCredentialByLabel(creds, { workspaceId: W, label: formDestinationKeyLabel({ targetId: "host-a" }) });
  assert.equal(saved?.connection.token, KEY_A);
  assert.equal(saved?.baseUrl, "https://site-a.example");
  assert.equal(saved?.category, "hosting");
});

test("a republish reuses the saved key and moves its address only when the published origin changed", async () => {
  const repo = new InMemoryCustomCredentialSetRepo();
  let updates = 0;
  const update = repo.update.bind(repo);
  repo.update = async (record) => { updates += 1; await update(record); };
  const creds = credentials({ repo });
  const port = createFormDestinationPort({ listForms: forms, credentials: creds }, { newSecret: () => KEY_A });
  await (await port.receiverKey({ workspaceId: W, targetId: "host-a" })).save!({ url: "https://old.example" });
  const again = await port.receiverKey({ workspaceId: W, targetId: "host-a" });
  assert.equal(again.secret, KEY_A);
  await again.save!({ url: "https://old.example/" });
  const label = formDestinationKeyLabel({ targetId: "host-a" });
  assert.equal(updates, 0, "same origin: no write");
  await again.save!({ url: "https://renamed.example/" });
  assert.equal(updates, 1);
  assert.equal((await resolveCustomCredentialByLabel(creds, { workspaceId: W, label }))?.baseUrl, "https://renamed.example");
});

test("a concurrent first save keeps the winner's key; other save failures propagate", async () => {
  const creds = credentials();
  const port = createFormDestinationPort({ listForms: forms, credentials: creds }, { newSecret: (() => { const keys = [KEY_A, KEY_B]; return () => keys.shift()!; })() });
  const first = await port.receiverKey({ workspaceId: W, targetId: "host-a" });
  const second = await port.receiverKey({ workspaceId: W, targetId: "host-a" });
  await first.save!({ url: "https://a.example" });
  await second.save!({ url: "https://a.example" });
  assert.equal((await resolveCustomCredentialByLabel(creds, { workspaceId: W, label: formDestinationKeyLabel({ targetId: "host-a" }) }))?.connection.token, KEY_A);
  const broken = credentials({ repo: Object.assign(new InMemoryCustomCredentialSetRepo(), { insert: async () => { throw new Error("database is locked"); } }) });
  const failing = await createFormDestinationPort({ listForms: forms, credentials: broken }).receiverKey({ workspaceId: W, targetId: "host-a" });
  assert.match(failing.secret, /^[A-Za-z0-9_-]{43}$/, "the default key is 32 random bytes, base64url");
  await assert.rejects(failing.save!({ url: "https://a.example" }), /database is locked/);
});

test("pull destinations are the saved keys, optionally one target's, with their published address", async () => {
  const creds = credentials();
  const port = createFormDestinationPort({ listForms: forms, credentials: creds }, { newSecret: (() => { const keys = [KEY_A, KEY_B]; return () => keys.shift()!; })() });
  await (await port.receiverKey({ workspaceId: W, targetId: "host-a" })).save!({ url: "https://a.example" });
  await (await port.receiverKey({ workspaceId: W, targetId: "host-b" })).save!({ url: "https://b.example" });
  assert.deepEqual(await listFormDestinations({ credentials: creds, workspaceId: W }), [
    { targetId: "host-a", destination: { url: "https://a.example", secret: KEY_A } },
    { targetId: "host-b", destination: { url: "https://b.example", secret: KEY_B } },
  ]);
  assert.deepEqual((await listFormDestinations({ credentials: creds, workspaceId: W }, { targetId: "host-b" })).map((entry) => entry.targetId), ["host-b"]);
  assert.deepEqual(await listFormDestinations({ credentials: creds, workspaceId: "other" }), []);
});
