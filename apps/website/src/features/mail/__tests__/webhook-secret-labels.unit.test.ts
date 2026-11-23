import assert from "node:assert/strict";
import { test } from "node:test";
import { mailWebhookSecretLabels } from "../index.js";

// Moved from feedback-route.test.ts: the persisted labels stay byte-identical after the move to Jini.
test("vault labels: current then previous, under the site's persisted product prefix", () => {
  assert.deepEqual(mailWebhookSecretLabels({ providerLabel: "Resend" }), ["Tovu Mail — Resend Webhook Secret", "Tovu Mail — Resend Webhook Secret (previous)"]);
});
