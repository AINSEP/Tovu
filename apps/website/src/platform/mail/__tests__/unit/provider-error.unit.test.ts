/** Provider diagnostics use the existing Jini secret owner, before truncating for activity/UI. */
import assert from "node:assert/strict";
import test from "node:test";
import { safeMailProviderText } from "../../provider-error.js";
import { createProviderMailer } from "#src/server/runtime/boot/mail-provider-catalog";

const message = { workspaceId: "w", to: { email: "a@example.com" }, from: { email: "b@example.com" }, subject: "Test" };
const options = { workspaceId: "w", idempotencyKey: "k", purpose: "transactional" as const, sourceContext: { module: "mail" } };

test("redacts exact credentials, URL tokens and bearer values before capping", () => {
  const secret = "unshaped-saved-secret";
  const text = `Verify domain first. ${secret} https://site.test/auth?token=private-link Authorization: Bearer private-header ${"x".repeat(1500)}`;
  const result = safeMailProviderText({ text }, { secrets: [secret] });
  assert.match(result, /^Verify domain first/); assert.equal(result.length, 1000);
  for (const value of [secret, "private-link", "private-header"]) assert.ok(!result.includes(value));
  assert.equal(safeMailProviderText({ text: "" }), "");
});

test("redacts bare URL tokens and fragment suffixes before the cap can split their values", () => {
  for (const url of [
    "https://site.test/auth?token=private-link",
    "https://site.test/auth?ok=1&token=private-link#private-fragment",
    "https://site.test/auth#token=private-link",
    "https://site.test/auth#access_token=private-link",
    "https://site.test/auth?refresh_token=private-link#private-fragment",
    "https://site.test/hook?api_key=private-link",
    "https://site.test/s3?X-Amz-Signature=private-link&x=1",
    "https://site.test/cb?code=private-link",
  ]) {
    const text = `Verify domain first. ${url}`;
    const result = safeMailProviderText({ text });
    assert.match(result, /^Verify domain first/);
    assert.ok(!result.includes("private-link"));
    assert.ok(!result.includes("private-fragment"));
    const prefix = "x".repeat(990 - url.indexOf("private-link"));
    const capped = safeMailProviderText({ text: `${prefix}${url} ${"x".repeat(1500)}` });
    assert.equal(capped.length, 1000);
    assert.ok(!capped.includes("private"));
  }
});

test("provider send and batch diagnostics redact their actual credential, retaining useful copy", async () => {
  const secret = "short-key";
  const failure = { ok: false, retryable: false, errorCode: "validation_error", message: `Verify the sender domain. Key ${secret}` };
  const provider = { create: () => ({ capabilities: () => ({ driver: "hosted" }), send: async () => failure, sendBatch: async () => [failure] }) };
  const mailer = createProviderMailer({ deps: { httpClient: {} } as never, provider: provider as never, credential: { token: secret } });
  const sent = await mailer.send(message, options);
  assert.equal(sent.ok, false); assert.match(JSON.stringify(sent), /Verify the sender domain/); assert.ok(!JSON.stringify(sent).includes(secret));
  assert.ok(!JSON.stringify(await mailer.sendBatch([message], options)).includes(secret));
});

test("a provider throw is scrubbed while its exact credential is still known", async () => {
  const provider = { create: () => ({ capabilities: () => ({ driver: "hosted" }), send: async () => { throw new Error("Transport failed with short-key"); } }) };
  const mailer = createProviderMailer({ deps: { httpClient: {} } as never, provider: provider as never, credential: { token: "short-key" } });
  await assert.rejects(mailer.send(message, options), error => error instanceof Error && error.message.startsWith("Transport failed with ") && !error.message.includes("short-key"));
});
