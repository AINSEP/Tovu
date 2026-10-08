import assert from "node:assert/strict";
import test from "node:test";
import { redactAdminRunContextRef } from "../credential-chat-intake.js";
import { parseRunStartContextRef } from "../run-start-context.js";

test("durable context keeps the remainder and contains no raw credential", () => {
  const secret = "sk-" + "A1b2C3d4E5f6G7h8I9j0";
  const contextRef = redactAdminRunContextRef({ contextRef: JSON.stringify({ prompt: `Connect ${secret} please`, principalId: "owner", conversationId: "chat" }) }, {});
  assert.deepEqual(JSON.parse(contextRef), { prompt: "Connect [token removed] please", principalId: "owner", conversationId: "chat", secretRedacted: true });
  assert.equal(contextRef.includes(secret), false);
  assert.equal(redactAdminRunContextRef({ contextRef }, {}), contextRef);
});

test("malformed context never echoes the failed input", () => {
  for (const contextRef of ["invalid", "null", "[]"]) assert.throws(() => redactAdminRunContextRef({ contextRef }, {}), { message: "The run context must be a JSON object." });
});

test("a sanitized or client-redacted prompt gets one non-secret card request in model context", () => {
  const contextRef = redactAdminRunContextRef({ contextRef: JSON.stringify({ prompt: "Connect api_key=x please", principalId: "owner" }) }, {});
  const once = parseRunStartContextRef(redactAdminRunContextRef({ contextRef }, {})).prompt;
  assert.equal(once, "Connect api_key=[token removed] please\n\nThe user tried to share a credential; open the matching card. Do not repeat the removed value. Tell them to rotate it if it was real.");
  assert.equal(parseRunStartContextRef(JSON.stringify({ prompt: once, principalId: "owner", secretRedacted: true })).prompt, once);
  assert.equal(parseRunStartContextRef(JSON.stringify({ prompt: "Connect [token removed] please", principalId: "owner", secretRedacted: true })).prompt, "Connect [token removed] please\n\nThe user tried to share a credential; open the matching card. Do not repeat the removed value. Tell them to rotate it if it was real.");
  assert.equal(parseRunStartContextRef(JSON.stringify({ prompt: "Connect my account", principalId: "owner" })).prompt, "Connect my account");
});

test("placeholder prose is not a redaction signal", () => {
  const contextRef = redactAdminRunContextRef({ contextRef: JSON.stringify({ prompt: "Explain [token removed]", principalId: "owner" }) }, {});
  assert.deepEqual(JSON.parse(contextRef), { prompt: "Explain [token removed]", principalId: "owner" });
  assert.equal(parseRunStartContextRef(contextRef).prompt, "Explain [token removed]");
  assert.equal(parseRunStartContextRef(JSON.stringify({ prompt: "Explain [token removed]", principalId: "owner", secretRedacted: "true" })).prompt, "Explain [token removed]");
});
