import assert from "node:assert/strict";
import test from "node:test";
import { redactAdminRunContextRef } from "../credential-chat-intake.js";
import { withCredentialPasteGuidance } from "../credential-guidance.js";

test("durable context keeps the remainder and contains no raw credential", () => {
  const secret = "sk-" + "A1b2C3d4E5f6G7h8I9j0";
  const contextRef = redactAdminRunContextRef({ contextRef: JSON.stringify({ prompt: `Connect ${secret} please`, principalId: "owner", conversationId: "chat" }) }, {});
  assert.deepEqual(JSON.parse(contextRef), { prompt: "Connect [token removed] please", principalId: "owner", conversationId: "chat" });
  assert.equal(contextRef.includes(secret), false);
  assert.equal(redactAdminRunContextRef({ contextRef }, {}), contextRef);
});

test("malformed context never echoes the failed input", () => {
  for (const contextRef of ["invalid", "null", "[]"]) assert.throws(() => redactAdminRunContextRef({ contextRef }, {}), { message: "The run context must be a JSON object." });
});

test("a sanitized or client-redacted prompt gets one non-secret card request in model context", () => {
  const once = withCredentialPasteGuidance({ text: "Connect [token removed] please" }, {});
  assert.equal(once, "Connect [token removed] please\n\nThe user tried to share a credential; open the matching card. Do not repeat the removed value. Tell them to rotate it if it was real.");
  assert.equal(withCredentialPasteGuidance({ text: once }, {}), once);
  assert.equal(withCredentialPasteGuidance({ text: "Connect my account" }, {}), "Connect my account");
});
