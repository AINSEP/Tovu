import assert from "node:assert/strict";
import test from "node:test";
import { redactAdminRunContextRef } from "../credential-chat-intake.js";
import { parseRunStartContextRef } from "../run-start-context.js";
import { CREDENTIAL_PASTE_MODEL_NOTE } from "../credential-guidance.js";

test("cold-session history is redacted before durable acceptance", () => {
  const secret = "sk-" + "A1b2C3d4E5f6G7h8I9j0";
  const contextRef = redactAdminRunContextRef({ contextRef: JSON.stringify({ prompt: 'continue', principalId: 'owner', coldStartContext: `Earlier credential: ${secret}` }) }, {});
  assert.equal(contextRef.includes(secret), false);
  assert.equal(JSON.parse(contextRef).coldStartContext, 'Earlier credential: [token removed]');
  assert.equal(redactAdminRunContextRef({ contextRef }, {}), contextRef);
});

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
  assert.equal(once, `Connect api_key=[token removed] please\n\n${CREDENTIAL_PASTE_MODEL_NOTE}`);
  assert.equal(parseRunStartContextRef(JSON.stringify({ prompt: once, principalId: "owner", secretRedacted: true })).prompt, once);
  assert.equal(parseRunStartContextRef(JSON.stringify({ prompt: "Connect [token removed] please", principalId: "owner", secretRedacted: true })).prompt, `Connect [token removed] please\n\n${CREDENTIAL_PASTE_MODEL_NOTE}`);
  assert.equal(parseRunStartContextRef(JSON.stringify({ prompt: "Connect my account", principalId: "owner" })).prompt, "Connect my account");
});

test("placeholder prose is not a redaction signal", () => {
  const contextRef = redactAdminRunContextRef({ contextRef: JSON.stringify({ prompt: "Explain [token removed]", principalId: "owner" }) }, {});
  assert.deepEqual(JSON.parse(contextRef), { prompt: "Explain [token removed]", principalId: "owner" });
  assert.equal(parseRunStartContextRef(contextRef).prompt, "Explain [token removed]");
  assert.equal(parseRunStartContextRef(JSON.stringify({ prompt: "Explain [token removed]", principalId: "owner", secretRedacted: "true" })).prompt, "Explain [token removed]");
});

test("a plain URL message is not a credential paste, even when earlier history in the cold-start context held a key-shaped value", () => {
  // The owner's exact message. Earlier turns of a Resend setup chat carried a DKIM record, a long
  // high-entropy base64 value the history redaction rightly removes; that must not flag THIS message.
  const message = "https://resend.com/ I really like it";
  const dkim = "p=" + "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDl4ZwX9vR2kT7yQp8sN3uB6hJ";
  const contextRef = redactAdminRunContextRef({ contextRef: JSON.stringify({ prompt: message, principalId: "owner", coldStartContext: `Assistant: add this TXT record ${dkim}\nUser: ${message}` }) }, {});
  const envelope = JSON.parse(contextRef) as Record<string, unknown>;
  assert.equal(envelope.secretRedacted, undefined, "only the current prompt's own redaction is a paste signal");
  assert.equal(String(envelope.coldStartContext).includes(dkim.slice(2)), false, "history is still redacted before storage");
  const parsed = parseRunStartContextRef(contextRef);
  assert.equal(parsed.prompt, message);
  assert.equal(parsed.coldStartContext?.includes(CREDENTIAL_PASTE_MODEL_NOTE), false);
});

test("real keys in the current prompt are still caught and still get the card note", () => {
  const note = CREDENTIAL_PASTE_MODEL_NOTE;
  for (const secret of ["sk-" + "A1b2C3d4E5f6G7h8I9j0", "aB3dE5gH7jK9mN1pQ3sT5vX7zA9cE1gI3kM5oQ7sU9"]) {
    const contextRef = redactAdminRunContextRef({ contextRef: JSON.stringify({ prompt: `here it is ${secret}`, principalId: "owner", coldStartContext: "User: hi" }) }, {});
    assert.equal(contextRef.includes(secret), false);
    assert.equal(JSON.parse(contextRef).secretRedacted, true);
    assert.ok(parseRunStartContextRef(contextRef).prompt.includes(note));
  }
});
