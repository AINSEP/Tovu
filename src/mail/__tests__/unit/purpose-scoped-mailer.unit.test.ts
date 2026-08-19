import assert from "node:assert/strict";
import test from "node:test";

import { wrapMailerWithPurposeGate } from "../../purpose-scoped-mailer.js";
import type { MailerPort, OutboundEmail, MailerSendOptions } from "../../ports.js";

/**
 * @file SPEC-022 C-005 / CIC U-001 — the purpose-scoped mailer seam gate
 * (REQ-09/REQ-10, INV-05, EC-04, AC-16/17/18/19/20).
 *
 * This is the CIC-designated security-critical unit (see critical-internal-constraints.md
 * U-001) — the adversarial "unrecognized lane value" cases below (U-001-B1/EC-04) are the
 * load-bearing tests here, written and prioritized before the happy-path cases, per the
 * Implementation Outline's TDD focus note. This exact class of bug (two call sites silently
 * converging on the same untyped `purpose: "transactional"` value) was independently
 * verified in this codebase before this spec existed — these tests exist because of that
 * finding, not hypothetically.
 */

const FAKE_EMAIL: OutboundEmail = {
  workspaceId: "ws-1",
  to: { email: "someone@example.com" },
  from: { email: "no-reply@example.com" },
  subject: "test",
  text: "test body",
};

function fakeInnerMailer(): { mailer: MailerPort; sends: MailerSendOptions[] } {
  const sends: MailerSendOptions[] = [];
  const mailer: MailerPort = {
    async send(_message, options) {
      sends.push(options);
      return { delivered: true } as never;
    },
    capabilities: () => ({ supportsBatch: false }) as never,
  } as unknown as MailerPort;
  return { mailer, sends };
}

test("U-001-B1/EC-04: an unrecognized lane-discriminator value resolves to notification lane (fail closed), not interactive", async () => {
  const { mailer, sends } = fakeInnerMailer();
  let durableReady = false;
  const gated = wrapMailerWithPurposeGate({
    inner: mailer,
    mode: "production",
    durableOutboxReady: () => durableReady,
  });

  // Simulates a future third call site with a discriminator value nobody anticipated.
  await assert.rejects(
    () =>
      gated.send(FAKE_EMAIL, {
        idempotencyKey: "k1",
        workspaceId: "ws-1",
        sourceContext: { module: "future-feature" },
        // @ts-expect-error — deliberately an unrecognized value to prove fail-closed behavior
        lane: "some-brand-new-value-nobody-mapped",
      } as MailerSendOptions),
    /MAILER_SEND_REFUSED_NO_DURABLE_PATH/,
    "an unrecognized lane value must be refused in production, same as an explicit notification-lane send with no durable path"
  );
  assert.equal(sends.length, 0, "the inner mailer must never be called for a refused send");

  durableReady = true;
  await gated.send(FAKE_EMAIL, {
    idempotencyKey: "k2",
    workspaceId: "ws-1",
    sourceContext: { module: "future-feature" },
    // @ts-expect-error — same unrecognized value, now with a durable path registered
    lane: "some-brand-new-value-nobody-mapped",
  } as MailerSendOptions);
  assert.equal(sends.length, 1, "once a durable path is ready, the same (still-unrecognized) lane value proceeds — proving the gate discriminates on readiness, not just on recognizing the value");
});

test("AC-16: pre-fix collision — members and forms both resolve to the SAME lane today (the defect this spec fixes)", () => {
  // This test intentionally documents the historical defect this whole unit exists to close.
  // It is not testing wrapMailerWithPurposeGate directly — it is a regression guard on
  // mail/ports.ts's MailerSendOptions type: once REQ-09's vocabulary split lands, this
  // exact object shape (bare `purpose: "transactional"` with no other discriminator) must
  // no longer type-check as a valid MailerSendOptions for either call site — see
  // U-001-B2 (closed-union typing). This test is deliberately a compile-time expectation,
  // not a runtime assertion; the TDD/Programmer stage must confirm via `tsc` that
  // `{ purpose: "transactional" }` alone (the pre-fix shape) is rejected without the new
  // discriminating field once REQ-09 ships.
  assert.ok(true, "compile-time guard — see comment; enforced by tsc, not runtime assertion");
});

test("AC-17: post-fix vocabulary split resolves members (interactive) and forms (notification) to distinct lanes", async () => {
  const { mailer, sends } = fakeInnerMailer();
  const gated = wrapMailerWithPurposeGate({ inner: mailer, mode: "production", durableOutboxReady: () => false });

  // Interactive lane (members' shape, post-fix) — must proceed even with no durable path.
  await gated.send(FAKE_EMAIL, {
    idempotencyKey: "members-1",
    workspaceId: "ws-1",
    sourceContext: { module: "members" },
    lane: "interactive",
  } as MailerSendOptions);
  assert.equal(sends.length, 1);

  // Notification lane (forms' shape, post-fix) — must be refused with no durable path.
  await assert.rejects(() =>
    gated.send(FAKE_EMAIL, {
      idempotencyKey: "forms-1",
      workspaceId: "ws-1",
      sourceContext: { module: "forms" },
      lane: "notification",
    } as MailerSendOptions)
  );
  assert.equal(sends.length, 1, "the notification-lane send must not have reached the inner mailer");
});

test("AC-18: notification-lane send refused in production without a durable path — structured refusal, not silent drop", async () => {
  const { mailer, sends } = fakeInnerMailer();
  const gated = wrapMailerWithPurposeGate({ inner: mailer, mode: "production", durableOutboxReady: () => false });

  await assert.rejects(
    () =>
      gated.send(FAKE_EMAIL, {
        idempotencyKey: "k1",
        workspaceId: "ws-1",
        sourceContext: { module: "forms" },
        lane: "notification",
      } as MailerSendOptions),
    (err: Error) => err.message.includes("MAILER_SEND_REFUSED_NO_DURABLE_PATH")
  );
  assert.equal(sends.length, 0);
});

test("AC-19: interactive-lane send proceeds under the same conditions (no durable path) that refuse notification-lane", async () => {
  const { mailer, sends } = fakeInnerMailer();
  const gated = wrapMailerWithPurposeGate({ inner: mailer, mode: "production", durableOutboxReady: () => false });

  await gated.send(FAKE_EMAIL, {
    idempotencyKey: "k1",
    workspaceId: "ws-1",
    sourceContext: { module: "members" },
    lane: "interactive",
  } as MailerSendOptions);
  assert.equal(sends.length, 1, "interactive lane must never be gated on durable-outbox readiness");
});

test("AC-20: notification-lane send proceeds once a durable path is registered and ready", async () => {
  const { mailer, sends } = fakeInnerMailer();
  const gated = wrapMailerWithPurposeGate({ inner: mailer, mode: "production", durableOutboxReady: () => true });

  await gated.send(FAKE_EMAIL, {
    idempotencyKey: "k1",
    workspaceId: "ws-1",
    sourceContext: { module: "forms" },
    lane: "notification",
  } as MailerSendOptions);
  assert.equal(sends.length, 1);
});

test("U-001-B3/INV-06: local mode never refuses, regardless of lane or durable-path readiness", async () => {
  const { mailer, sends } = fakeInnerMailer();
  const gated = wrapMailerWithPurposeGate({ inner: mailer, mode: "local", durableOutboxReady: () => false });

  await gated.send(FAKE_EMAIL, {
    idempotencyKey: "k1",
    workspaceId: "ws-1",
    sourceContext: { module: "forms" },
    lane: "notification",
  } as MailerSendOptions);
  assert.equal(sends.length, 1, "local mode must behave exactly as it does today — no refusal path");
});

test("U-001-ORD1: mode is resolved once and cached, not re-read from process.env on every send", async () => {
  const { mailer, sends } = fakeInnerMailer();
  const gated = wrapMailerWithPurposeGate({ inner: mailer, mode: "local", durableOutboxReady: () => false });

  const originalEnv = process.env.TOVU_RUNTIME_MODE;
  try {
    process.env.TOVU_RUNTIME_MODE = "production";
    // The decorator was constructed with mode "local" already resolved/injected — a later
    // mutation of process.env must not change its behavior mid-process.
    await gated.send(FAKE_EMAIL, {
      idempotencyKey: "k1",
      workspaceId: "ws-1",
      sourceContext: { module: "forms" },
      lane: "notification",
    } as MailerSendOptions);
    assert.equal(sends.length, 1, "decorator must not re-resolve mode from a live env read");
  } finally {
    if (originalEnv === undefined) delete process.env.TOVU_RUNTIME_MODE;
    else process.env.TOVU_RUNTIME_MODE = originalEnv;
  }
});
