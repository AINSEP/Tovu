import assert from "node:assert/strict";
import { test } from "node:test";

import { redactedTovuError, redactTovuLocalText } from "../diagnostics-redaction.js";

// A full application key as `mintApiKey` produces it: public handle, dot, secret half.
const SECRET = "Zq9xV2mN4bT7cR1kL8pW3sY6hJ0fD5gA2eU9iO4uQ7w";
const KEY = `tovu_ak_0123456789ab.${SECRET}`;

test("redactedTovuError blanks the secret half of a tovu_ak_ key in message and stack", () => {
  const out = redactedTovuError({ error: new Error(`upstream rejected key ${KEY}`) });
  assert.ok(!out.message.includes(SECRET), out.message);
  assert.ok(!String(out.stack).includes(SECRET));
  // The public handle stays greppable so an operator can find and revoke the key.
  assert.ok(out.message.includes("tovu_ak_0123456789ab."), out.message);
});

test("redactedTovuError blanks a tovu_ak_ key in a non-Error throw", () => {
  assert.ok(!redactedTovuError({ error: `boom ${KEY}` }).message.includes(SECRET));
});

test("redactedTovuError keeps forwarding exact secrets", () => {
  assert.ok(!redactedTovuError({ error: new Error("pw=opensesame-literal") }, { exactSecrets: ["opensesame-literal"] }).message.includes("opensesame-literal"));
});

test("redactTovuLocalText blanks a tovu_ak_ key in child output and masks the home", () => {
  const out = redactTovuLocalText({ text: `stderr: ${KEY} at /home/ada/site` }, { homeDir: "/home/ada" });
  assert.ok(!out.includes(SECRET), out);
  assert.ok(out.includes("tovu_ak_0123456789ab."), out);
  assert.ok(!out.includes("/home/ada"), out);
});
