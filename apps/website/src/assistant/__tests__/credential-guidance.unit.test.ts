import assert from "node:assert/strict";
import test from "node:test";
import { CREDENTIAL_GUIDANCE } from "../credential-guidance.js";
import { buildBaseSystemOverlay } from "../../server/inbound/assistant/assistant-system-overlay.js";
import { SYSTEM_PREAMBLE } from "../../server/runtime/composition/modules/assistant-byok.js";

test("daemon and BYOK pin the same credential-card policy", () => {
  for (const prompt of [buildBaseSystemOverlay(false), buildBaseSystemOverlay(true), SYSTEM_PREAMBLE]) {
    assert.equal(prompt.includes(CREDENTIAL_GUIDANCE), true);
    for (const clause of [
      "Never ask the human to type or paste a key, token, password or connection string into chat, assistant_ask_choice or a question-form.",
      "Open credential_save with kind media-provider for AI image/video keys, source-control for git host credentials, publish-host for static hosting, or api for any other API (Stripe, Mailchimp, registrars, Fly).",
      "After a successful card save, retry the original request exactly once; never start a second recovery cycle.",
      "If a secret was pasted, or the message contains [token removed], do not repeat it.",
    ]) assert.equal(prompt.includes(clause), true);
  }
});
