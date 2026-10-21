import assert from "node:assert/strict";
import test from "node:test";
import { isReadOnlyTool, type ToolExecutionContext } from "@jini-ai/core";
import { ConsoleMailerAdapter } from "../../members/index.js";
import { SmtpMailerAdapter, type MailerPort } from "../../../platform/mail/index.js";
import { buildMailStatusRegistrations, contributeMailStatusTools, mailStatusDerivedRisk } from "../tool-registrations.js";

const NOTE = "Email sending is not configured: messages are printed to the server console and never leave this machine. Set up a mail provider agent plugin and save its key in Access Tokens to send real email.";
const ctx: ToolExecutionContext = { executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input: {}, signal: new AbortController().signal };
function tool(mailer: MailerPort, allow = true) {
  return buildMailStatusRegistrations({ workspaceId: "ws", mailer, authorize: async (request) => { assert.deepEqual(request, { principalId: "owner", permission: "admin.forms.manage", workspaceId: "ws", entityType: "mail" }); return { allowed: allow, reason: "fixture grant" }; } })[0]!;
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
  const registration = buildMailStatusRegistrations({ workspaceId: "ws", mailer: new ConsoleMailerAdapter(), authorize: async () => ({ allowed: true, reason: "grant" }), mailStatus: async () => report })[0]!;
  assert.deepEqual(await registration.handler(ctx), { mailDeliveryAvailable: false, driver: "console", note: NOTE, ...report });
});

test("the contributor registers the diagnostic under its own domain", () => {
  const contributor = contributeMailStatusTools();
  assert.equal(contributor.domain, "system-mail");
  assert.equal(contributor.build, buildMailStatusRegistrations);
  assert.equal(contributor.risk, mailStatusDerivedRisk);
});
