/**
 * @file Unit test for `form-delivery-deliverer.ts`'s ownership read: the OAuth port asks the
 * registry again which plugin contributes the binding's adapter, so an adapter removed between the
 * deliverer's own read and that one (a plugin disabled mid-attempt) owns no OAuth ref. The attempt
 * then falls through to the custom-credential port and, with no saved credential, is refused as
 * `authorization-required` without a token being read. G14c: a plugin disabled between two attempts
 * stops delivery on the very next one (the registry, which loads active plugins only, is read per
 * attempt, never cached), as retryable `adapter-unavailable`. The happy paths are in
 * `form-delivery-oauth.integration.test.ts`. Real host over the local fake provider; no network.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { FormDeliveryError } from "@jini-ai/cms/forms";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";

import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import { buildFormDestinationRegistry, type FormDestinationKit, type FormDestinationRegistry } from "#src/features/form-destinations/index";
import { ACME_PLUGIN, ACME_WORKSPACE, connectHosted, startAcmeHarness, type AcmeHarness } from "../../../../features/api-connections/__tests__/support/acme-harness.js";
import { composeFormDeliveryDeliverer } from "../form-delivery-deliverer.js";

let harness: AcmeHarness;
before(async () => { harness = await startAcmeHarness(); });
after(async () => { await harness.close(); });

const kit: FormDestinationKit = { timeouts: {}, fetch: async (url) => { throw new Error(`no network in this test: ${url}`); } };

test("an adapter gone by the ownership read owns no OAuth ref: no token is read and the attempt is authorization-required", async () => {
  const host = harness.makeHost();
  const { connectionRef } = await connectHosted(harness, host);
  let delivered = 0;
  const withAdapter = buildFormDestinationRegistry({ refusals: [], loaded: [{ descriptor: { id: "acme-office-rows", label: "Rows", module: "rows.mjs" }, pluginId: ACME_PLUGIN,
    module: { deliver: async () => { delivered += 1; } } }] });
  const reads: FormDestinationRegistry[] = [withAdapter, buildFormDestinationRegistry({ refusals: [], loaded: [] })];
  const keyring = new InMemoryKeyring({ hkdfSalt: "form-delivery-deliverer-unit" });
  const deliver = composeFormDeliveryDeliverer({
    apiConnections: { host }, kit, loadRegistry: async () => reads.shift() ?? withAdapter,
    credentials: { repo: new InMemoryCustomCredentialSetRepo(), sealer: new AesGcmSecretSealer({ keyring }) },
  });
  const tokenCalls = harness.provider.tokenCalls;
  const job = { binding: { bindingId: "b1", adapterId: "acme-office-rows", connectionRef, enabled: true, config: { accountId: "acct-1" } }, idempotencyKey: "[\"s1\",\"b1\"]",
    snapshot: { form: { slug: "contact", fields: [{ name: "email", required: true }] }, submission: { id: "s1", answers: { email: "a@example.test" }, submittedAt: "2026-10-20T10:00:00.000Z" } } };

  await assert.rejects(deliver({ workspaceId: ACME_WORKSPACE, job }), (error: unknown) => error instanceof FormDeliveryError && error.code === "authorization-required" && !error.retryable);
  assert.equal(reads.length, 0, "both registry reads happened");
  assert.equal(delivered, 0, "the adapter was never called");
  assert.equal(harness.provider.tokenCalls, tokenCalls, "no token was read or refreshed");
});

test("security: a plugin disabled after an attempt delivers nothing on the next: adapter-unavailable, retryable, no token read", async () => {
  const host = harness.makeHost();
  const { connectionRef } = await connectHosted(harness, host);
  let delivered = 0;
  const active = buildFormDestinationRegistry({ refusals: [], loaded: [{ descriptor: { id: "acme-office-rows", label: "Rows", module: "rows.mjs" }, pluginId: ACME_PLUGIN,
    module: { deliver: async () => { delivered += 1; } } }] });
  // What the lifecycle's active-only loader returns once the plugin is disabled: nothing from it.
  const disabled = buildFormDestinationRegistry({ refusals: [], loaded: [] });
  let current = active;
  const keyring = new InMemoryKeyring({ hkdfSalt: "form-delivery-deliverer-unit" });
  const deliver = composeFormDeliveryDeliverer({
    apiConnections: { host }, kit, loadRegistry: async () => current,
    credentials: { repo: new InMemoryCustomCredentialSetRepo(), sealer: new AesGcmSecretSealer({ keyring }) },
  });
  const job = { binding: { bindingId: "b1", adapterId: "acme-office-rows", connectionRef, enabled: true, config: { accountId: "acct-1" } }, idempotencyKey: "[\"s1\",\"b1\"]",
    snapshot: { form: { slug: "contact", fields: [{ name: "email", required: true }] }, submission: { id: "s1", answers: { email: "a@example.test" }, submittedAt: "2026-10-20T10:00:00.000Z" } } };
  await deliver({ workspaceId: ACME_WORKSPACE, job });
  assert.equal(delivered, 1, "the active plugin's adapter delivered the first attempt");

  current = disabled;
  const tokenCalls = harness.provider.tokenCalls;
  await assert.rejects(deliver({ workspaceId: ACME_WORKSPACE, job }), (error: unknown) => error instanceof FormDeliveryError && error.code === "adapter-unavailable" && error.retryable);
  assert.equal(delivered, 1, "nothing was delivered once the plugin was disabled");
  assert.equal(harness.provider.tokenCalls, tokenCalls, "no token was read for the disabled plugin");
});
