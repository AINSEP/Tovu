import assert from "node:assert/strict";
import test from "node:test";

import { withCustomCredentialSetup } from "../credential-recovery.js";
import { CustomCredentialNotFoundError } from "../store.js";
import { issueCredentialSetup } from "../../../contracts/core/tool-failure-diagnostics.js";

/** @file A failing credentialed call offers the credential_save card it can actually use, and keeps provider output. */

const setupFor = (prefill: Record<string, string>) => issueCredentialSetup({ setupToolId: "credential_save", prefill }, {});

test("a successful call's output is returned untouched", async () => {
  const output = { status: 200, body: "ok" };
  assert.equal(await withCustomCredentialSetup({ invoke: async () => output, label: "Stripe" }), output);
});

test("a missing credential becomes a setup card prefilled with the label and the URL's origin", async () => {
  const result = await withCustomCredentialSetup({ invoke: async () => { throw new CustomCredentialNotFoundError("missing"); }, label: "Stripe", url: "https://api.stripe.com/v1/charges?limit=1" });
  assert.deepEqual(result, { executed: false, credentialSetup: setupFor({ kind: "api", label: "Stripe", baseUrl: "https://api.stripe.com" }) });
});

test("a missing credential with no URL or an unparseable URL omits the base URL prefill", async () => {
  const missing = async () => { throw new CustomCredentialNotFoundError("missing"); };
  const expected = { executed: false, credentialSetup: setupFor({ kind: "api", label: "Stripe" }) };
  assert.deepEqual(await withCustomCredentialSetup({ invoke: missing, label: "Stripe" }), expected);
  assert.deepEqual(await withCustomCredentialSetup({ invoke: missing, label: "Stripe", url: "not a url" }), expected);
});

test("any other failure propagates unchanged", async () => {
  const failure = new Error("network down");
  await assert.rejects(withCustomCredentialSetup({ invoke: async () => { throw failure; }, label: "Stripe" }), (error) => error === failure);
});

test("a 401 response keeps the provider output and adds a rotation card targeting the label", async () => {
  const output = { status: 401, body: "unauthorized" };
  assert.deepEqual(await withCustomCredentialSetup({ invoke: async () => output, label: "Stripe" }), { credentialSetup: setupFor({ kind: "api", target: "Stripe" }), ...output });
});

test("an 'invalid' verification status means rotation only for verification calls", async () => {
  const output = { status: "invalid" };
  assert.deepEqual(await withCustomCredentialSetup({ invoke: async () => output, label: "Stripe", verification: true }), { credentialSetup: setupFor({ kind: "api", target: "Stripe" }), ...output });
  assert.equal(await withCustomCredentialSetup({ invoke: async () => output, label: "Stripe" }), output);
});
