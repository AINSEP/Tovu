/**
 * @file Unit test for `form-delivery-deliverer.ts`'s ownership read: the OAuth port asks the
 * registry again which plugin contributes the binding's adapter, so an adapter removed between the
 * deliverer's own read and that one (a plugin disabled mid-attempt) owns no OAuth ref. The attempt
 * then falls through to the custom-credential port and, with no saved credential, is refused as
 * `authorization-required` without a token being read. The happy paths are in
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
