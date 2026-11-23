import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import type { SmtpMailPayload } from "@jini-ai/core/contracts/mail";
import { createNodemailerSmtpTransport } from "../smtp.nodemailer.js";

/**
 * @file `createNodemailerSmtpTransport` — exercised at nodemailer's createTransport boundary, without opening a socket.
 * SMTP delivery and failure classification are tested on Jini's `SmtpMailerAdapter`
 * (`packages/platform/src/mail/__tests__/smtp.test.ts`).
 */

test("createNodemailerSmtpTransport maps configuration and forwards the complete payload", async (t) => {
  const nodemailer = createRequire(import.meta.url)("nodemailer") as typeof import("nodemailer");
  const configurations: unknown[] = [];
  const payloads: SmtpMailPayload[] = [];
  t.mock.method(nodemailer, "createTransport", (configuration: unknown) => {
    configurations.push(configuration);
    return { sendMail: async (mail: SmtpMailPayload) => {
      payloads.push(mail);
      return { messageId: "factory-message-id", accepted: ["to@example.com"] };
    } };
  });
  const payload: SmtpMailPayload = {
    from: { name: "Fixture", address: "from@example.com" }, to: { address: "to@example.com" },
    subject: "Factory delivery", html: "<p>Hello</p>", headers: { "X-Fixture": "yes" },
  };
  for (const secure of [false, true]) {
    const config = { host: "smtp.example.com", port: secure ? 465 : 587, secure, auth: { user: "fixture-user", pass: "fixture-password" }, timeoutMs: 3210 };
    const transport = createNodemailerSmtpTransport(config);
    assert.deepEqual(configurations.at(-1), {
      host: config.host, port: config.port, secure, auth: config.auth, connectionTimeout: 3210,
    });
    assert.deepEqual(await transport.sendMail({ mail: payload }), { messageId: "factory-message-id" });
    assert.deepEqual(payloads.at(-1), payload);
  }
  assert.equal(configurations.length, 2);
  assert.equal(payloads.length, 2);
});
