import assert from "node:assert/strict";
import test from "node:test";
import { isReadOnlyTool, type ToolExecutionContext } from "@jini-ai/core";
import { ConsoleMailerAdapter } from "../../members/index.js";
import { SmtpMailerAdapter, type MailerPort } from "../../../platform/mail/index.js";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock } from "@jini-ai/core/primitives";
import type { ToolExecutionOptions } from "@jini-ai/core";
import { nativeToolMetadata } from "#src/contracts/core/tool-metadata/index";
import { buildMailStatusRegistrations, contributeMailStatusTools, mailStatusDerivedRisk, type MailStatusToolDeps } from "../tool-registrations.js";

const NOTE = "Email sending is not configured: messages are printed to the server console and never leave this machine. Set up a mail provider agent plugin and save its key in Access Tokens to send real email.";
function exchanges() {
  let count = 0;
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => `exchange-${++count}` }, defaultChannel: "mcp-ui" });
  /** Options whose card is answered by the owner with `decision`. */
  const answer = (toolId: string, decision: "confirm" | "cancel" = "confirm", before?: () => void): ToolExecutionOptions => ({ emitSurface: async () => {
    before?.();
    store.deliver({ exchangeId: `exchange-${count}`, principalId: "owner", params: { decision } }, { toolId });
  } });
  return { store, answer };
}
const ctx: ToolExecutionContext = { executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input: {}, signal: new AbortController().signal };
function tool(mailer: MailerPort, allow = true) {
  return buildMailStatusRegistrations({ workspaceId: "ws", mailer, authorize: async (request) => { assert.deepEqual(request, { principalId: "owner", permission: "admin.forms.manage", workspaceId: "ws", entityType: "mail" }); return { allowed: allow, reason: "fixture grant" }; } }, { surfaceExchanges: exchanges().store })[0]!;
}

test("console driver reports false and the exact recovery note", async () => {
  assert.deepEqual(await tool(new ConsoleMailerAdapter()).handler(ctx), { mailDeliveryAvailable: false, driver: "console", note: NOTE });
});

test("a real SMTP adapter reports available without sending a message", async () => {
  const mailer = new SmtpMailerAdapter({ sendMail: async () => assert.fail("status must not send") });
  assert.deepEqual(await tool(mailer).handler(ctx), { mailDeliveryAvailable: true, driver: "smtp", note: "Email sending is configured." });
});

test("status permission denial precedes reading capabilities", async () => {
  const mailer = new ConsoleMailerAdapter();
  mailer.capabilities = () => assert.fail("denied capabilities read");
  await assert.rejects(() => tool(mailer, false).handler(ctx), { name: "ToolInputError", message: "MAIL_STATUS_FORBIDDEN: principal 'owner' is not authorized for 'admin.forms.manage' (fixture grant)" });
});

test("mail status descriptor is readOnly with derived none risk", () => {
  assert.equal(isReadOnlyTool({ descriptor: tool(new ConsoleMailerAdapter()).descriptor }), true);
  assert.equal(mailStatusDerivedRisk.get("system_get_mail_status"), "none");
});

test("with a status source the tool adds state, lanes, warnings and providers", async () => {
  const report = { state: "ready" as const, lanes: [], warnings: ["sender_unverified" as const], providers: [], refusals: ["plugin 'x' was not loaded"] };
  const registration = buildMailStatusRegistrations({ workspaceId: "ws", mailer: new ConsoleMailerAdapter(), authorize: async () => ({ allowed: true, reason: "grant" }), mailStatus: async () => report }, { surfaceExchanges: exchanges().store })[0]!;
  assert.deepEqual(await registration.handler(ctx), { mailDeliveryAvailable: false, driver: "console", note: NOTE, ...report });
});

test("the contributor registers the diagnostic under its own domain", () => {
  const contributor = contributeMailStatusTools();
  assert.equal(contributor.domain, "system-mail");
  assert.equal(contributor.build, buildMailStatusRegistrations);
  assert.equal(contributor.risk, mailStatusDerivedRisk);
});

// ---------------------------------------------------------------------------------------------
// mail_set_provider / mail_send_test: approval-gated, never rememberable, fail closed.
// ---------------------------------------------------------------------------------------------

function controls(overrides: Partial<MailStatusToolDeps> = {}, grants: string[] = ["admin.forms.manage", "settings.workspace.write"]) {
  const x = exchanges();
  const selected: unknown[] = [];
  const sent: { message: { to: { email: string }; from: { email: string } }; options: Record<string, unknown> }[] = [];
  const allowed = new Set(grants);
  const mailer: MailerPort = {
    capabilities: () => ({ driver: "smtp", supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
    send: async (message, options) => { sent.push({ message, options: options as never }); return { ok: true, providerMessageId: "pm-1", acceptedAt: "2026-10-21T00:00:00.000Z" }; },
    sendBatch: async () => [],
  };
  const deps: MailStatusToolDeps = {
    workspaceId: "ws", mailer,
    authorize: async ({ permission }) => ({ allowed: allowed.has(permission), reason: "fixture grant" }),
    mailProviderControl: {
      check: async ({ id }) => (id === "smtp" ? { ok: true, label: "SMTP server" } : { ok: false, reason: `'${id}' is not an installed mail provider` }),
      select: async (input) => { selected.push(input); },
    },
    userRepo: { findByPrincipalId: async () => ({ principalId: "owner", workspaceId: "ws", username: "owner", email: "owner@example.com", passwordHash: "x" }) },
    mailSenderIdentity: { resolve: async () => ({ email: "news@example.com", name: "Site" }) },
    ...overrides,
  };
  const registrations = buildMailStatusRegistrations(deps, { surfaceExchanges: x.store });
  const call = (name: string, input: unknown = {}, options: ToolExecutionOptions = {}) =>
    registrations.find((r) => r.descriptor.id === name)!.handler({ ...ctx, input }, options);
  return { ...x, deps, call, selected, sent, revoke: (name: string) => allowed.delete(name), registrations };
}

test("mail_set_provider and mail_send_test are approval cards, never read-only, with derived write risk", () => {
  const f = controls();
  for (const name of ["mail_set_provider", "mail_send_test"]) {
    assert.equal(f.registrations.find((r) => r.descriptor.id === name)!.descriptor.readOnly, false);
    assert.equal(mailStatusDerivedRisk.get(name), "mutates-durable-state");
    assert.ok(nativeToolMetadata.redeemableIds.has(name), `${name} is redeemable only through its card`);
  }
});

test("mail_set_provider sets both lanes only after the person confirms", async () => {
  const f = controls();
  await assert.rejects(f.call("mail_set_provider", { providerId: "smtp" }), /NO_CONFIRMATION_CHANNEL/);
  assert.deepEqual(await f.call("mail_set_provider", { providerId: "smtp" }, f.answer("mail_set_provider", "cancel")), { set: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
  assert.deepEqual(f.selected, []);
  assert.deepEqual(await f.call("mail_set_provider", { providerId: " smtp " }, f.answer("mail_set_provider")), { set: true, providerId: "smtp" });
  assert.deepEqual(f.selected, [{ id: "smtp", principalId: "owner" }]);
  // Not rememberable: the next call asks again.
  await assert.rejects(f.call("mail_set_provider", { providerId: "smtp" }), /NO_CONFIRMATION_CHANNEL/);
});

test("mail_set_provider refuses an unknown or keyless provider, bad input, a missing seam and a revoked grant", async () => {
  const f = controls();
  await assert.rejects(f.call("mail_set_provider", { providerId: "postal" }, f.answer("mail_set_provider")), /Cannot switch to 'postal' is not an installed mail provider\. Nothing was changed\./);
  await assert.rejects(f.call("mail_set_provider", { providerId: "" }), /providerId must be an installed provider id/);
  await assert.rejects(f.call("mail_set_provider", { providerId: 3 }), /providerId must be an installed provider id/);
  await assert.rejects(f.call("mail_set_provider", { providerId: "smtp", confirm: true }));
  await assert.rejects(controls({ mailProviderControl: undefined }).call("mail_set_provider", { providerId: "smtp" }), /selection is unavailable/);
  await assert.rejects(f.call("mail_set_provider", { providerId: "smtp" }, f.answer("mail_set_provider", "confirm", () => f.revoke("settings.workspace.write"))), /not authorized/);
  assert.deepEqual(f.selected, []);
});

test("mail_send_test sends one transactional, interactive message to the operator's own address after approval", async () => {
  const f = controls();
  await assert.rejects(f.call("mail_send_test"), /NO_CONFIRMATION_CHANNEL/);
  // `.length`, not deepEqual([]): an assertion signature would narrow `sent` to never[] below.
  assert.equal(f.sent.length, 0);
  assert.deepEqual(await f.call("mail_send_test", {}, f.answer("mail_send_test")), { sent: true, to: "owner@example.com", providerMessageId: "pm-1" });
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0]!.message.to.email, "owner@example.com");
  assert.equal(f.sent[0]!.message.from.email, "news@example.com");
  assert.deepEqual(f.sent[0]!.options, { idempotencyKey: "mail:test:e", workspaceId: "ws", sourceContext: { module: "mail", ref: "e" }, purpose: "transactional", lane: "interactive" });
});

test("mail_send_test reports a refusal, uses a username address, and refuses an account with no address", async () => {
  const refusing = controls();
  refusing.deps.mailer.send = async () => ({ ok: false, retryable: false, errorCode: "MAIL_UNCONFIGURED", message: "no provider" });
  assert.deepEqual(await refusing.call("mail_send_test", {}, refusing.answer("mail_send_test")), { sent: false, to: "owner@example.com", errorCode: "MAIL_UNCONFIGURED", message: "no provider" });
  const byUsername = controls({ userRepo: { findByPrincipalId: async () => ({ principalId: "owner", workspaceId: "ws", username: "ops@example.com", passwordHash: "x" }) } });
  assert.equal((await byUsername.call("mail_send_test", {}, byUsername.answer("mail_send_test")) as { to: string }).to, "ops@example.com");
  const none = controls({ userRepo: { findByPrincipalId: async () => null } });
  await assert.rejects(none.call("mail_send_test"), /Your account has no email address/);
  await assert.rejects(controls({ userRepo: undefined }).call("mail_send_test"), /Your account has no email address/);
  const denied = controls({}, ["settings.workspace.write"]);
  await assert.rejects(denied.call("mail_send_test"), /not authorized/);
  const revoked = controls();
  await assert.rejects(revoked.call("mail_send_test", {}, revoked.answer("mail_send_test", "confirm", () => revoked.revoke("admin.forms.manage"))), /not authorized/);
  assert.deepEqual(revoked.sent, []);
});

test("mail_send_test without a composed sender resolver falls back to the mailer's own (a delivering mailer then refuses)", async () => {
  const f = controls({ mailSenderIdentity: undefined });
  await assert.rejects(f.call("mail_send_test", {}, f.answer("mail_send_test")), /No sender address is configured/);
  assert.deepEqual(f.sent, []);
});
