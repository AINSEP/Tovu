import assert from "node:assert/strict";
import test from "node:test";

import { ConsoleMailerAdapter } from "../mailer.console.js";
import type { MailerSendOptions, OutboundEmail } from "../../mail/index.js";

const SEND_OPTIONS: MailerSendOptions = {
  idempotencyKey: "idem-1",
  workspaceId: "ws-1",
  sourceContext: { module: "members" },
};

test("capabilities reports the console driver shape", () => {
  const adapter = new ConsoleMailerAdapter();
  assert.deepEqual(adapter.capabilities(), {
    driver: "console",
    supportsIdempotencyKey: true,
    supportsWebhookFeedback: false,
    maxBatchSize: 1,
    supportsAttachments: false,
  });
});

test("send logs the message and returns an ok result with a generated id + injected clock time", async () => {
  const adapter = new ConsoleMailerAdapter({
    clock: { nowIso: () => "2026-07-10T12:00:00.000Z" },
    ids: { newId: () => "generated-id-1" },
  });
  const message: OutboundEmail = {
    workspaceId: "ws-1",
    to: { email: "member@example.com" },
    from: { email: "no-reply@members.local" },
    subject: "Your sign-in link",
    text: "short body",
  };

  const originalLog = console.log;
  const logCalls: unknown[][] = [];
  console.log = (...args: unknown[]) => {
    logCalls.push(args);
  };
  let result;
  try {
    result = await adapter.send(message, SEND_OPTIONS);
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(result, {
    ok: true,
    providerMessageId: "generated-id-1",
    acceptedAt: "2026-07-10T12:00:00.000Z",
  });
  assert.equal(logCalls.length, 1);
  const loggedLine = String(logCalls[0][0]);
  assert.match(loggedLine, /member@example\.com/);
  assert.match(loggedLine, /short body/);
});

test("send truncates a long body in the log line", async () => {
  const adapter = new ConsoleMailerAdapter();
  const longBody = "x".repeat(500);
  const message: OutboundEmail = {
    workspaceId: "ws-1",
    to: { email: "member@example.com" },
    from: { email: "no-reply@members.local" },
    subject: "Long email",
    text: longBody,
  };

  const originalLog = console.log;
  const logCalls: unknown[][] = [];
  console.log = (...args: unknown[]) => {
    logCalls.push(args);
  };
  try {
    await adapter.send(message, SEND_OPTIONS);
  } finally {
    console.log = originalLog;
  }

  const loggedLine = String(logCalls[0][0]);
  assert.ok(!loggedLine.includes("x".repeat(500)), "the full 500-char body must not appear untruncated");
  assert.match(loggedLine, /…/);
});

test("send fails closed with ATTACHMENTS_UNSUPPORTED instead of silently dropping attachments (/debate D6, 2026-07-15)", async () => {
  const adapter = new ConsoleMailerAdapter();
  const message: OutboundEmail = {
    workspaceId: "ws-1",
    to: { email: "member@example.com" },
    from: { email: "no-reply@members.local" },
    subject: "Has an attachment",
    text: "body",
    attachments: [{ filename: "invoice.pdf", contentType: "application/pdf", contentBase64: "AAAA" }],
  };

  const originalLog = console.log;
  const logCalls: unknown[][] = [];
  console.log = (...args: unknown[]) => {
    logCalls.push(args);
  };
  let result;
  try {
    result = await adapter.send(message, SEND_OPTIONS);
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(result, {
    ok: false,
    retryable: false,
    errorCode: "ATTACHMENTS_UNSUPPORTED",
    message: "ConsoleMailerAdapter does not support attachments (capabilities().supportsAttachments is false)",
  });
  assert.equal(logCalls.length, 0, "must fail before logging/sending anything, not send without the attachment");
});

test("send succeeds normally when attachments is present but empty", async () => {
  const adapter = new ConsoleMailerAdapter({
    clock: { nowIso: () => "2026-07-10T12:00:00.000Z" },
    ids: { newId: () => "generated-id-1" },
  });
  const message: OutboundEmail = {
    workspaceId: "ws-1",
    to: { email: "member@example.com" },
    from: { email: "no-reply@members.local" },
    subject: "Empty attachments array",
    text: "body",
    attachments: [],
  };

  const originalLog = console.log;
  console.log = () => {};
  let result;
  try {
    result = await adapter.send(message, SEND_OPTIONS);
  } finally {
    console.log = originalLog;
  }

  assert.equal(result.ok, true);
});

test("sendBatch loops send() once per message", async () => {
  const adapter = new ConsoleMailerAdapter({ ids: (() => {
    let n = 0;
    return { newId: () => `batch-id-${++n}` };
  })() });
  const messages: OutboundEmail[] = [
    {
      workspaceId: "ws-1",
      to: { email: "one@example.com" },
      from: { email: "no-reply@members.local" },
      subject: "One",
      text: "body one",
    },
    {
      workspaceId: "ws-1",
      to: { email: "two@example.com" },
      from: { email: "no-reply@members.local" },
      subject: "Two",
      text: "body two",
    },
  ];

  const originalLog = console.log;
  console.log = () => {};
  let results;
  try {
    results = await adapter.sendBatch(messages, SEND_OPTIONS);
  } finally {
    console.log = originalLog;
  }

  assert.equal(results.length, 2);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, true);
  if (results[0].ok && results[1].ok) {
    assert.notEqual(results[0].providerMessageId, results[1].providerMessageId);
  }
});
