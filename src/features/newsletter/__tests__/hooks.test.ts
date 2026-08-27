/**
 * @file T032 — failing-first tests for `runHookChain` (REQ-23, EC-01, behavior.spec.md §1.3/§7).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createHookRegistry } from "../hooks.js";
import type { OutboundEmail } from "../../../mail/index.js";

const baseMessage: OutboundEmail = {
  workspaceId: "ws-1",
  to: { email: "a@a.test" },
  from: { email: "no-reply@newsletter.local" },
  subject: "Hello",
  text: "hi",
};

const recipientFilterContext = {
  workspaceId: "ws-1",
  campaignId: "camp-1",
  listId: "list-1",
  subscriberId: "subscriber-1",
  recipientEmail: "a@a.test",
  status: "subscribed" as const,
};
const beforeSendContext = { workspaceId: "ws-1", campaignId: "camp-1", sendId: "send-1", subscriberId: "subscriber-1" };

test("runHookChain: beforeSend never runs for a row recipient.filter suppressed (EC-01, post-freeze unsubscribe case)", async () => {
  const registry = createHookRegistry();
  let beforeSendCalled = false;
  registry.registerRecipientFilterHook(() => false); // suppress
  registry.registerBeforeSendHook((_ctx, message) => {
    beforeSendCalled = true;
    return message;
  });

  const result = await registry.runHookChain({ recipientFilterContext, beforeSendContext, message: baseMessage });
  assert.equal(result.keep, false);
  assert.equal(beforeSendCalled, false, "beforeSend must never run for a suppressed row");
});

test("runHookChain: a kept row runs beforeSend and returns the transformed message", async () => {
  const registry = createHookRegistry();
  registry.registerRecipientFilterHook(() => true);
  registry.registerBeforeSendHook((_ctx, message) => ({ ...message, subject: "Transformed" }));

  const result = await registry.runHookChain({ recipientFilterContext, beforeSendContext, message: baseMessage });
  assert.equal(result.keep, true);
  assert.equal(result.keep === true ? result.message.subject : "", "Transformed");
});

test("runHookChain: a throwing recipient.filter hook is fail-closed suppression, never 'keep by default' (behavior.spec §7)", async () => {
  const registry = createHookRegistry();
  registry.registerRecipientFilterHook(() => {
    throw new Error("boom");
  });
  const result = await registry.runHookChain({ recipientFilterContext, beforeSendContext, message: baseMessage });
  assert.equal(result.keep, false);
});

test("runHookChain: a throwing beforeSend hook is also fail-closed suppression", async () => {
  const registry = createHookRegistry();
  registry.registerRecipientFilterHook(() => true);
  registry.registerBeforeSendHook(() => {
    throw new Error("boom");
  });
  const result = await registry.runHookChain({ recipientFilterContext, beforeSendContext, message: baseMessage });
  assert.equal(result.keep, false);
});

test("runHookChain: with no hooks registered, the message passes through kept and unmodified", async () => {
  const registry = createHookRegistry();
  const result = await registry.runHookChain({ recipientFilterContext, beforeSendContext, message: baseMessage });
  assert.equal(result.keep, true);
  assert.deepEqual(result.keep === true ? result.message : null, baseMessage);
});

test("runHookChain: multiple recipient.filter hooks — any single suppress wins, subsequent filters don't override it back to keep", async () => {
  const registry = createHookRegistry();
  registry.registerRecipientFilterHook(() => true);
  registry.registerRecipientFilterHook(() => false);
  registry.registerRecipientFilterHook(() => true);
  const result = await registry.runHookChain({ recipientFilterContext, beforeSendContext, message: baseMessage });
  assert.equal(result.keep, false);
});
