import assert from "node:assert/strict";
import test from "node:test";
import { redactSecretShapes } from "../secret-redaction.js";

test("application-key redaction keeps both public handles, removes both secret tails, and is idempotent", () => {
  const first = "tovu_ak_0123456789ab.";
  const second = "tovu_ak_abcdef012345.";
  const input = `Retry ${first}${"a1-b_".repeat(5)} and ${second}${"k_9z-".repeat(5)} at /srv/site`;
  const output = "Retry tovu_ak_0123456789ab.[REDACTED:tovu_api_key] and tovu_ak_abcdef012345.[REDACTED:tovu_api_key] at /srv/site";
  for (const options of [{}, { vendorOnly: true }]) {
    assert.deepEqual(redactSecretShapes({ text: input }, options), { text: output, redactions: 2 });
    assert.deepEqual(redactSecretShapes({ text: output }, options), { text: output, redactions: 0 });
  }
});

test("code-aware mode redacts a short secret assigned as a source literal without redacting a neighboring label", () => {
  const text = 'const password = "apricotjam"; const label = "spring";';
  assert.deepEqual(redactSecretShapes({ text }, { codeAware: true }), {
    text: 'const password = "[REDACTED:labeled_secret]"; const label = "spring";',
    redactions: 1,
  });
  assert.deepEqual(redactSecretShapes({ text }, { vendorOnly: true }), { text, redactions: 0 });
});
