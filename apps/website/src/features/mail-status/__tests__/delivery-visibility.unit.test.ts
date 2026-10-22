import assert from "node:assert/strict";
import test from "node:test";
import { isReadOnlyTool, type ToolExecutionContext } from "@jini-ai/core";

import type { MailerPort } from "../../../platform/mail/index.js";
import { SenderIdentityNotConfiguredError } from "../../../platform/mail/sender-identity.js";
import { createMailPurposeGateProbe, DISCARDING_MAILER, type MailPurposeGateProbe } from "../../../platform/mail/purpose-gate-probe.js";
import { createPermissionGrantRegistry } from "../../identity/permission-grants.js";
import type { MailActivityRecord, MailActivityRepo } from "../../mail/activity.repo.js";
import type { LaunchGateDeps } from "../../newsletter/launch-gate.js";
import {
  DEFAULT_MAIL_ACTIVITY_LIMIT, getMailActivity, listMailActivity, MailActivityForbiddenError, MailActivityUnavailableError, maskRecipient,
  readMailActivityId, readMailActivityQuery, resolveMailActivityAccess, type MailActivityDeps,
} from "../activity.js";
import { buildMailDeliveryRegistrations, contributeMailDeliveryTools, mailDeliveryDerivedRisk, type MailDeliveryToolDeps } from "../delivery-tool-registrations.js";
import { MAIL_ACTIVITY_READ_PERMISSION, MAIL_SUPPRESSIONS_MANAGE_PERMISSION, registerMailPermissionGrants } from "../permissions.js";
import { mailUseReadinessDepsFrom, readMailUseReadiness, type MailUseReadinessDeps } from "../use-readiness.js";

/**
 * @file Email phase 4's shared operations with DI fakes: the activity access tiers, masking, opaque
 * ids and keyset cursors; per-use readiness over the owners' checks (each failure isolated to its
 * row); the purpose-gate probe against Jini's real gate; the permission declarations; the tools.
 * The SQL projection itself is covered on SQLite and PGlite in `features/mail/__tests__`.
 */

const AT = (s: number) => new Date(Date.parse("2026-10-22T12:00:00.000Z") + s * 1000).toISOString();

function record(key: string, at: number, overrides: Partial<MailActivityRecord> = {}): MailActivityRecord {
  return { cursorKey: key, idempotencyKey: key, recipient: "ann@example.com", lane: "transactional", providerId: "smtp", use: "sign_in", outcome: "accepted", providerMessageId: `m-${key}`, errorCode: null, createdAt: AT(at), updatedAt: AT(at + 1), ...overrides };
}

/** Same ordering and keyset semantics as the SQL repo: newest first, `created_at <= c`, OFFSET skip. */
function memoryActivity(rows: MailActivityRecord[], calls: unknown[] = []): MailActivityRepo {
  const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.idempotencyKey.localeCompare(a.idempotencyKey));
  return {
    list: async (required, optional = {}) => {
      calls.push({ ...required, ...optional });
      const matching = sorted.filter((row) => (!optional.before || row.createdAt <= optional.before.createdAt && (row.createdAt !== optional.before.createdAt || row.cursorKey < optional.before.key)) && (!optional.outcome || row.outcome === optional.outcome)
        && (!optional.use || row.use === optional.use) && (!optional.recipient || row.recipient === optional.recipient));
      return matching.slice(0, required.limit);
    },
    get: async ({ idempotencyKey, recipient }) => {
      const found = sorted.find((row) => row.idempotencyKey === idempotencyKey && row.recipient === recipient);
      return found ? { record: found, feedback: [{ kind: "delivered", hardBounce: false, providerId: "smtp", occurredAt: AT(50), receivedAt: AT(51) }] } : null;
    },
  };
}

function grants(list: string[]): MailActivityDeps["authorize"] {
  return async ({ permission }) => ({ allowed: list.includes("*") || list.includes(permission), reason: "fixture" });
}

function activityDeps(rows: MailActivityRecord[], granted = ["*"], calls: unknown[] = []): MailActivityDeps {
  return { workspaceId: "ws", authorize: grants(granted), mailActivity: memoryActivity(rows, calls) };
}

const all = (input: Record<string, unknown> = {}) => readMailActivityQuery({ input });

test("readMailActivityQuery: defaults, string limits from a query string, filters and every refusal", () => {
  assert.deepEqual(all(), { limit: DEFAULT_MAIL_ACTIVITY_LIMIT, filter: {} });
  assert.deepEqual(all({ limit: "10", outcome: "bounced", use: "", recipient: " Ann@Example.com ", cursor: "" }), { limit: 10, filter: { outcome: "bounced", recipient: "ann@example.com" } });
  assert.deepEqual(all({ limit: 5, use: "newsletter" }), { limit: 5, filter: { use: "newsletter" } });
  const cursor = Buffer.from(JSON.stringify({ c: AT(1), k: "key-2" })).toString("base64url");
  assert.deepEqual(all({ cursor }).before, { createdAt: AT(1), key: "key-2" });
  for (const [input, message] of [
    [{ outcome: "sent" }, /outcome must be one of accepted, delivered/], [{ use: 3 }, /use must be one of/],
    [{ limit: 0 }, /limit must be a whole number from 1 to 100/], [{ limit: "1.5" }, /limit/], [{ limit: true }, /limit/],
    [{ recipient: "nobody" }, /recipient must be one email address/], [{ recipient: 7 }, /recipient/],
    [{ cursor: "%%%" }, /cursor is not a nextCursor/], [{ cursor: 9 }, /cursor/],
    [{ cursor: Buffer.from(JSON.stringify({ c: AT(1), s: -1 })).toString("base64url") }, /cursor/],
    [{ cursor: Buffer.from(JSON.stringify({ c: 1, s: 0 })).toString("base64url") }, /cursor/],
  ] as const) assert.throws(() => all(input as Record<string, unknown>), { name: "ToolInputError", message });
});

test("maskRecipient keeps the first letter and the domain only", () => {
  assert.equal(maskRecipient({ address: "ann@example.com" }), "a***@example.com");
  assert.equal(maskRecipient({ address: "@example.com" }), "***");
  assert.equal(maskRecipient({ address: "no-at" }), "***");
});

test("access: mail.activity.read is full, admin.forms.manage alone is masked, neither is refused", async () => {
  const deps = (list: string[]) => ({ workspaceId: "ws", authorize: grants(list) });
  assert.equal(await resolveMailActivityAccess({ deps: deps([MAIL_ACTIVITY_READ_PERMISSION]), principalId: "p" }), "full");
  assert.equal(await resolveMailActivityAccess({ deps: deps(["admin.forms.manage"]), principalId: "p" }), "masked");
  await assert.rejects(resolveMailActivityAccess({ deps: deps(["admin.forms.manage"]), principalId: "p" }, { requireFull: true }),
    (err: unknown) => err instanceof MailActivityForbiddenError && err.permission === "mail.activity.read" && /principal 'p' is not authorized for 'mail.activity.read'/.test(err.message));
  await assert.rejects(resolveMailActivityAccess({ deps: deps([]), principalId: "p" }),
    (err: unknown) => err instanceof MailActivityForbiddenError && err.permission === "mail.activity.read or admin.forms.manage");
});

test("list pages newest first with an opaque cursor that resumes inside a shared timestamp", async () => {
  const rows = [record("a", 1), record("b", 2), record("c", 2), record("d", 2), record("e", 3)];
  const deps = activityDeps(rows);
  const first = await listMailActivity({ ...{ principalId: "p", query: all({ limit: 2 }) }, deps: deps });
  assert.deepEqual(first.items.map((item) => item.id && JSON.parse(Buffer.from(item.id, "base64url").toString())[0]), ["e", "d"]);
  assert.deepEqual([first.access, first.empty], ["full", null]);
  assert.deepEqual(first.items[0], { id: first.items[0]!.id, recipient: "ann@example.com", providerMessageId: "m-e", use: "sign_in", outcome: "accepted", lane: "transactional", providerId: "smtp", errorCode: null, createdAt: AT(3), updatedAt: AT(4) });
  const second = await listMailActivity({ ...{ principalId: "p", query: all({ limit: 2, cursor: first.nextCursor }) }, deps: deps });
  assert.deepEqual(second.items.map((item) => item.providerMessageId), ["m-c", "m-b"]);
  // The second page ended at the same timestamp it started in: the skip accumulates.
  assert.deepEqual(JSON.parse(Buffer.from(second.nextCursor as string, "base64url").toString()), { c: AT(2), k: "b" });
  const third = await listMailActivity({ ...{ principalId: "p", query: all({ limit: 2, cursor: second.nextCursor }) }, deps: deps });
  assert.deepEqual([third.items.map((item) => item.providerMessageId), third.nextCursor, third.empty], [["m-a"], null, null]);
  const past = await listMailActivity({ ...{ principalId: "p", query: all({ cursor: Buffer.from(JSON.stringify({ c: AT(0), k: "z" })).toString("base64url") }) }, deps: deps });
  assert.deepEqual([past.items, past.empty], [[], null]);
});

test("masked access hides addresses, ids and message ids; a recipient filter needs full access", async () => {
  const calls: unknown[] = [];
  const deps = activityDeps([record("a", 1, { outcome: "bounced", errorCode: null })], ["admin.forms.manage"], calls);
  const page = await listMailActivity({ ...{ principalId: "p", query: all() }, deps: deps });
  assert.deepEqual(page.items, [{ recipient: "a***@example.com", use: "sign_in", outcome: "bounced", lane: "transactional", providerId: "smtp", errorCode: null, createdAt: AT(1), updatedAt: AT(2) }]);
  assert.equal(page.access, "masked");
  assert.deepEqual(calls, [{ workspaceId: "ws", limit: 26 }]);
  await assert.rejects(listMailActivity({ ...{ principalId: "p", query: all({ recipient: "ann@example.com" }) }, deps: deps }), MailActivityForbiddenError);
});

test("empty first pages say whether nothing was recorded or nothing matched; no repo is unavailable", async () => {
  assert.equal((await listMailActivity({ ...{ principalId: "p", query: all() }, deps: activityDeps([]) })).empty, "none_recorded");
  assert.equal((await listMailActivity({ ...{ principalId: "p", query: all({ outcome: "failed" }) }, deps: activityDeps([record("a", 1)]) })).empty, "no_matches");
  await assert.rejects(listMailActivity({ ...{ principalId: "p", query: all() }, deps: { workspaceId: "ws", authorize: grants(["*"]) } }), MailActivityUnavailableError);
});

test("get returns the full item with its feedback, null when absent, and needs mail.activity.read", async () => {
  const deps = activityDeps([record("a", 1)]);
  const [item] = (await listMailActivity({ ...{ principalId: "p", query: all() }, deps: deps })).items;
  const id = readMailActivityId({ value: item!.id });
  assert.deepEqual(id, { idempotencyKey: "a", recipient: "ann@example.com" });
  const found = await getMailActivity({ ...{ principalId: "p", activityId: id }, deps: deps });
  assert.deepEqual([found?.activity.id, found?.feedback.length], [item!.id, 1]);
  assert.equal(await getMailActivity({ ...{ principalId: "p", activityId: { idempotencyKey: "zz", recipient: "x@y.z" } }, deps: deps }), null);
  await assert.rejects(getMailActivity({ ...{ principalId: "p", activityId: id }, deps: activityDeps([], ["admin.forms.manage"]) }), MailActivityForbiddenError);
  for (const value of [undefined, "", "%%", Buffer.from(JSON.stringify(["only"])).toString("base64url"), Buffer.from(JSON.stringify([1, 2])).toString("base64url")]) {
    assert.throws(() => readMailActivityId({ value }), { name: "ToolInputError", message: /activityId must be an id from mail_list_activity/ });
  }
});

// ---- readiness ------------------------------------------------------------------------------

function mailer(driver: string): MailerPort {
  return { capabilities: () => ({ driver }) } as unknown as MailerPort;
}

function launchGate(overrides: Partial<LaunchGateDeps> = {}): LaunchGateDeps {
  return {
    isSendingEnabled: async () => true, consentCapability: {} as LaunchGateDeps["consentCapability"],
    originRegistry: { canonicalOrigin: async () => ({ origin: "https://site.test" }) } as unknown as LaunchGateDeps["originRegistry"], mailer: mailer("smtp"), ...overrides,
  };
}

const openGate: MailPurposeGateProbe = async () => true;
const NOTIFY = { notify: { enabled: true, recipients: ["ops@site.test"] } };

function readinessDeps(overrides: Partial<MailUseReadinessDeps> = {}): MailUseReadinessDeps {
  return {
    workspaceId: "ws", mailer: mailer("smtp"), nowIso: () => AT(0),
    mailSenderIdentity: { resolve: async () => ({ email: "hello@site.test" }) },
    mailPurposeGate: openGate,
    formDefinitionRepo: { list: async () => [NOTIFY, { notify: { enabled: false, recipients: ["x@y.z"] } }, { notify: { enabled: true, recipients: [] } }] as never },
    newsletterLaunchGate: launchGate(),
    mailActivity: memoryActivity([record("s", 1, { outcome: "bounced" }), record("f", 2, { use: "form_notification" })]),
    ...overrides,
  };
}

const byUse = async (deps: MailUseReadinessDeps) => Object.fromEntries((await readMailUseReadiness(deps)).uses.map((row) => [row.use, row]));

test("all four uses ready, with sender, lanes, owner, form count and separate evidence", async () => {
  const report = await readMailUseReadiness(readinessDeps());
  assert.equal(report.checkedAt, AT(0));
  assert.deepEqual(report.uses.map((row) => [row.use, row.state, row.reasons.length, row.sendLane, row.mailLane, row.owner, row.sender]), [
    ["sign_in", "ready", 0, "interactive", "transactional", "members", "hello@site.test"],
    ["newsletter_confirmation", "ready", 0, "interactive", "transactional", "newsletter", "hello@site.test"],
    ["form_notifications", "ready", 0, "notification", "transactional", "forms", "hello@site.test"],
    ["newsletter", "ready", 0, "notification", "bulk", "newsletter", "hello@site.test"],
  ]);
  assert.deepEqual(report.uses[0]!.evidence, { outcome: "bounced", at: AT(2) });
  assert.deepEqual(report.uses[2]!.evidence, { outcome: "accepted", at: AT(3) });
  assert.equal(report.uses[2]!.formsConfigured, 1);
  assert.equal(report.uses[3]!.evidence, null);
  assert.equal("formsConfigured" in report.uses[0]!, false);
});

test("the production durable-outbox gate blocks notification uses only; the gate is asked per owner and lane", async () => {
  const asked: string[] = [];
  const gate = createMailPurposeGateProbe({ mode: "production", durableOutboxReady: () => false });
  const rows = await byUse(readinessDeps({ mailPurposeGate: async (q) => { asked.push(`${q.capabilityName}:${q.lane}`); return gate(q); } }));
  assert.deepEqual([rows.sign_in!.state, rows.newsletter_confirmation!.state], ["ready", "ready"]);
  assert.deepEqual([rows.form_notifications!.state, rows.form_notifications!.reasons], ["blocked", ["durable_outbox_not_ready"]]);
  assert.deepEqual([rows.newsletter!.state, rows.newsletter!.reasons], ["blocked", ["durable_outbox_not_ready"]]);
  assert.deepEqual(asked.sort(), ["forms:notification", "members:interactive", "newsletter:interactive", "newsletter:notification"]);
});

test("owner gates: newsletter switched off is disabled, unverified origin blocks both newsletter rows, console is not configured", async () => {
  const off = await byUse(readinessDeps({ newsletterLaunchGate: launchGate({ isSendingEnabled: async () => false }) }));
  assert.deepEqual([off.newsletter!.state, off.newsletter!.reasons, off.newsletter_confirmation!.state], ["disabled", ["sending_enabled_false"], "ready"]);
  const origin = await byUse(readinessDeps({ newsletterLaunchGate: launchGate({ consentCapability: null, originRegistry: { canonicalOrigin: async () => { throw new Error("no origin"); } } as never }) }));
  assert.deepEqual([origin.newsletter_confirmation!.state, origin.newsletter_confirmation!.reasons], ["blocked", ["origin_not_verified"]]);
  assert.deepEqual(origin.newsletter!.reasons, ["consent_capability_unbound", "origin_not_verified"]);
  const console = await byUse(readinessDeps({ mailer: mailer("console"), newsletterLaunchGate: launchGate({ mailer: mailer("console"), isSendingEnabled: async () => false }) }));
  assert.deepEqual([console.sign_in!.state, console.sign_in!.reasons], ["not_configured", ["mail_delivery_unavailable"]]);
  // Blocked outranks not-configured outranks disabled; the launch gate's own mailer code is not repeated.
  assert.deepEqual([console.newsletter!.state, console.newsletter!.reasons], ["not_configured", ["sending_enabled_false", "mail_delivery_unavailable"]]);
});

test("sender, forms and gate failures: a missing sender blocks, a failed check is unknown for its row only", async () => {
  const noSender = await byUse(readinessDeps({ mailSenderIdentity: { resolve: async () => { throw new SenderIdentityNotConfiguredError({ workspaceId: "ws", driver: "smtp" }); } } }));
  assert.deepEqual([noSender.sign_in!.state, noSender.sign_in!.reasons, noSender.sign_in!.sender], ["blocked", ["sender_not_configured"], null]);
  const broken = await byUse(readinessDeps({ mailSenderIdentity: { resolve: async () => { throw new Error("Settings DOWN"); } }, formDefinitionRepo: { list: async () => [] } }));
  assert.deepEqual([broken.sign_in!.state, broken.sign_in!.reasons, broken.sign_in!.evidence?.outcome], ["unknown", ["check_failed"], "bounced"]);
  assert.deepEqual([broken.form_notifications!.state, broken.form_notifications!.reasons, broken.form_notifications!.formsConfigured], ["not_configured", ["no_form_notifications"], 0]);
  const bare = await byUse(readinessDeps({ mailSenderIdentity: undefined, mailPurposeGate: undefined, formDefinitionRepo: undefined, mailActivity: undefined }));
  assert.deepEqual([bare.sign_in!.state, bare.sign_in!.reasons, bare.sign_in!.evidence], ["unknown", ["purpose_gate_unavailable"], null]);
  assert.deepEqual(bare.form_notifications!.reasons, ["forms_unavailable"]);
  const noGateNoSender = await byUse(readinessDeps({ mailSenderIdentity: undefined }));
  assert.deepEqual([noGateNoSender.sign_in!.state, noGateNoSender.sign_in!.sender], ["blocked", null]);
  const evidenceDown = await byUse(readinessDeps({ mailActivity: { list: async () => { throw new Error("db"); } } }));
  assert.deepEqual([evidenceDown.sign_in!.state, evidenceDown.sign_in!.evidence], ["blocked", null]);
});

test("without Newsletter only sign-in and forms are listed; the default clock stamps checkedAt", async () => {
  const report = await readMailUseReadiness({ ...readinessDeps({ newsletterLaunchGate: undefined }), nowIso: undefined });
  assert.deepEqual(report.uses.map((row) => row.use), ["sign_in", "form_notifications"]);
  assert.ok(!Number.isNaN(Date.parse(report.checkedAt)));
});

test("mailUseReadinessDepsFrom maps Newsletter's launch inputs like toNewsletterSendPipelineDeps, or omits them", async () => {
  const base = { workspaceId: "ws", mailer: mailer("smtp") };
  const origin = launchGate().originRegistry;
  assert.equal("newsletterLaunchGate" in mailUseReadinessDepsFrom({ ...base, originRegistry: origin }), false);
  assert.equal("newsletterLaunchGate" in mailUseReadinessDepsFrom({ ...base, newsletterCampaignRepo: {} }), false);
  const defaults = mailUseReadinessDepsFrom({ ...base, originRegistry: origin, newsletterCampaignRepo: {} }).newsletterLaunchGate!;
  assert.deepEqual([await defaults.isSendingEnabled("ws"), defaults.consentCapability, defaults.originRegistry, defaults.mailer], [false, null, origin, base.mailer]);
  const consent = {} as LaunchGateDeps["consentCapability"];
  const given = mailUseReadinessDepsFrom({ ...base, originRegistry: origin, newsletterCampaignRepo: {}, membersConsentCapability: consent, newsletterSendingEnabled: async () => true }).newsletterLaunchGate!;
  assert.deepEqual([await given.isSendingEnabled("ws"), given.consentCapability], [true, consent]);
});

test("the purpose-gate probe asks Jini's real gate and sends nothing", async () => {
  const production = createMailPurposeGateProbe({ mode: "production", durableOutboxReady: (name) => name === "forms" });
  assert.equal(await production({ capabilityName: "members", lane: "interactive" }), true);
  assert.equal(await production({ capabilityName: "newsletter", lane: "notification" }), false);
  assert.equal(await production({ capabilityName: "forms", lane: "notification" }), true);
  assert.equal(await createMailPurposeGateProbe({ mode: "local", durableOutboxReady: () => false })({ capabilityName: "forms", lane: "notification" }), true);
  // The gate's inner mailer is a sink: a memory driver, nothing delivered, batches empty.
  assert.equal(DISCARDING_MAILER.capabilities({}).driver, "memory");
  assert.deepEqual(await DISCARDING_MAILER.sendBatch({ messages: [], idempotencyKey: "k", workspaceId: "w", sourceContext: { module: "m" } }), []);
  await assert.rejects(createMailPurposeGateProbe({ mode: "production", durableOutboxReady: () => { throw new Error("readiness down"); } })({ capabilityName: "forms", lane: "notification" }), /readiness down/);
  await assert.rejects(createMailPurposeGateProbe({ mode: "production", durableOutboxReady: () => { throw "bare"; } })({ capabilityName: "forms", lane: "notification" }), (err: unknown) => err === "bare");
});

test("permissions: both catalogued, mail.activity.read granted to admin, suppression management to no role", () => {
  const registry = createPermissionGrantRegistry({});
  registerMailPermissionGrants({ registry });
  const mine = registry.roleGrants.list({}).filter((grant) => grant.permission.startsWith("mail."));
  assert.deepEqual(mine.map((grant) => [grant.role, grant.permission]), [["admin", MAIL_ACTIVITY_READ_PERMISSION]]);
  assert.equal(registry.roleGrants.list({}).some((grant) => grant.permission === MAIL_SUPPRESSIONS_MANAGE_PERMISSION), false);
});

// ---- tools ----------------------------------------------------------------------------------

const ctx: ToolExecutionContext = { executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input: {}, signal: new AbortController().signal };

function tools(overrides: Partial<MailDeliveryToolDeps> = {}, granted = ["*"]) {
  const { newsletterLaunchGate: _gate, ...host } = readinessDeps();
  const deps: MailDeliveryToolDeps = { ...host, authorize: grants(granted), mailActivity: memoryActivity([record("a", 1)]), ...overrides };
  // No card is shown by these read-only tools; the removal card is exercised in suppressions-feedback.unit.test.ts.
  const registrations = buildMailDeliveryRegistrations(deps, {} as never);
  return { registrations, call: (name: string, input: unknown = {}) => registrations.find((r) => r.descriptor.id === name)!.handler({ ...ctx, input }) };
}

test("the phase-4 delivery tools are read-only with derived none risk under their own contributor", () => {
  const { registrations } = tools();
  assert.deepEqual(registrations.map((r) => r.descriptor.id).slice(0, 3), ["mail_get_readiness", "mail_list_activity", "mail_get_activity"]);
  for (const registration of registrations.slice(0, 3)) {
    assert.equal(isReadOnlyTool({ descriptor: registration.descriptor }), true);
    assert.equal(mailDeliveryDerivedRisk.get(registration.descriptor.id), "none");
  }
  const contributor = contributeMailDeliveryTools();
  assert.deepEqual([contributor.domain, contributor.build, contributor.risk], ["system-mail-delivery", buildMailDeliveryRegistrations, mailDeliveryDerivedRisk]);
});

test("mail_get_readiness needs admin.forms.manage; activity tools page, detail and refuse with stable codes", async () => {
  const readiness = await tools().call("mail_get_readiness") as { uses: unknown[] };
  assert.equal(readiness.uses.length, 2);
  await assert.rejects(tools({}, [MAIL_ACTIVITY_READ_PERMISSION]).call("mail_get_readiness"), /MAIL_DELIVERY_FORBIDDEN: .*admin\.forms\.manage/);
  const page = await tools().call("mail_list_activity", { limit: 1 }) as { items: { id: string }[] };
  const detail = await tools().call("mail_get_activity", { activityId: page.items[0]!.id }) as { activity: { id: string } };
  assert.equal(detail.activity.id, page.items[0]!.id);
  await assert.rejects(tools().call("mail_get_activity", { activityId: Buffer.from(JSON.stringify(["x", "y"])).toString("base64url") }), { name: "ToolInputError", message: /No email send with that id/ });
  await assert.rejects(tools({}, ["admin.forms.manage"]).call("mail_get_activity", { activityId: page.items[0]!.id }), /MAIL_DELIVERY_FORBIDDEN: .*mail\.activity\.read/);
  await assert.rejects(tools({ mailActivity: undefined }).call("mail_list_activity"), /MAIL_DELIVERY_UNAVAILABLE: Email activity is unavailable/);
  await assert.rejects(tools().call("mail_list_activity", { outcome: "nope" }), { name: "ToolInputError" });
});

test("activity defaults empty limit/recipient and rejects overlong recipients and fractional cursor skips", () => {
  assert.deepEqual(all({ limit: "", recipient: "" }), { limit: 25, filter: {} });
  assert.throws(() => all({ recipient: "a".repeat(250) + "@x.test" }), { name: "ToolInputError", message: "recipient must be one email address." });
  assert.throws(() => all({ cursor: Buffer.from(JSON.stringify({ c: AT(1), s: 1.5 })).toString("base64url") }), { name: "ToolInputError", message: "cursor is not a nextCursor this server returned." });
});

test("readiness isolates non-Error, forms, newsletter-setting and supplied-probe failures", async () => {
  const cases: [Partial<MailUseReadinessDeps>, string[], string][] = [
    [{ formDefinitionRepo: { list: async () => { throw "opaque"; } } }, ["form_notifications"], "check_failed"],
    [{ formDefinitionRepo: { list: async () => { throw new Error("forms_offline"); } } }, ["form_notifications"], "forms_offline"],
    [{ newsletterLaunchGate: launchGate({ isSendingEnabled: async () => { throw new Error("setting_offline"); } }) }, ["newsletter"], "setting_offline"],
    [{ mailPurposeGate: async q => { if (q.capabilityName === "members") throw new Error("probe_offline"); return true; } }, ["sign_in"], "probe_offline"],
  ];
  for (const [overrides, affected, reason] of cases) {
    const rows = (await readMailUseReadiness(readinessDeps(overrides))).uses;
    for (const row of rows) {
      if (affected.includes(row.use)) { assert.equal(row.state, "unknown", row.use); assert.deepEqual(row.reasons, [reason]); }
      else assert.equal(row.state, "ready", row.use);
    }
  }
});

test("split lanes check bulk independently; absent SMTP sender never reports ready", async () => {
  const rows = await byUse(readinessDeps({ mailLaneReady: async ({ lane }) => lane === "transactional" }));
  assert.equal(rows.sign_in!.state, "ready"); assert.equal(rows.newsletter!.state, "not_configured"); assert.deepEqual(rows.newsletter!.reasons, ["mail_delivery_unavailable"]);
  const absent = await byUse(readinessDeps({ mailSenderIdentity: undefined }));
  assert.deepEqual([absent.sign_in!.state, absent.sign_in!.reasons, absent.sign_in!.sender], ["blocked", ["sender_not_configured"], null]);
});
