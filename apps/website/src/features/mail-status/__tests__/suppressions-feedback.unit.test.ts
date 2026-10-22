import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext, ToolExecutionOptions } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock } from "@jini-ai/core/primitives";

import type { MailerPort } from "../../../platform/mail/index.js";
import type { MailProviderConfiguration } from "../../../platform/mail/mail-status.js";
import type { MailSuppressionAdminRepo, MailSuppressionEntry } from "../../mail/suppression-admin.repo.js";
import { MailActivityForbiddenError } from "../activity.js";
import { buildMailDeliveryRegistrations, type MailDeliveryToolDeps } from "../delivery-tool-registrations.js";
import { readMailFeedbackSetup, type MailFeedbackSetupDeps } from "../feedback-setup.js";
import {
  listMailSuppressions, MailSuppressionsUnavailableError, planMailSuppressionRemoval, readMailSuppressionQuery, readMailSuppressionRemoval, runMailSuppressionRemoval, type MailSuppressionDeps,
} from "../suppressions.js";

/**
 * @file Email phase 5's shared operations with DI fakes: suppression list input, permission and
 * paging; removal's required reason, plan warnings (never implying consent), re-check at the write
 * and audit hand-off; feedback setup's per-provider state; and the three tools, including the
 * removal card that always asks. The SQL is covered on SQLite and PGlite in `features/mail/__tests__`.
 */

const AT = (s: number) => new Date(Date.parse("2026-10-22T12:00:00.000Z") + s * 1000).toISOString();

function entry(address: string, at: number, overrides: Partial<MailSuppressionEntry> = {}): MailSuppressionEntry {
  return { address, scope: "all", reason: "bounced", createdAt: AT(at), ...overrides };
}

function memoryRepo(rows: MailSuppressionEntry[], removed: unknown[] = []): MailSuppressionAdminRepo {
  let store = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.address.localeCompare(a.address));
  return {
    list: async (required, optional = {}) => store.filter((row) => (!optional.before || row.createdAt <= optional.before.createdAt) && (!optional.scope || row.scope === optional.scope)
      && (!optional.reason || row.reason === optional.reason) && (!optional.search || row.address.includes(optional.search))).slice(optional.before?.skip ?? 0, (optional.before?.skip ?? 0) + required.limit),
    find: async ({ address, scope }) => store.find((row) => row.address === address && row.scope === scope) ?? null,
    remove: async (required) => {
      const found = store.find((row) => row.address === required.address && row.scope === required.scope);
      if (!found) return null;
      store = store.filter((row) => row !== found);
      const removal = { id: "r1", address: found.address, scope: found.scope, suppressionReason: found.reason, suppressedAt: found.createdAt, removalReason: required.removalReason, removedBy: required.removedBy, removedAt: AT(99) };
      removed.push(removal);
      return removal;
    },
    lastFeedbackEvent: async ({ providerId }) => (providerId === "hosted" ? { kind: "delivered", receivedAt: AT(50) } : null),
  };
}

function grantsFor(list: string[]) {
  const allowed = new Set(list);
  return { allowed, authorize: (async ({ permission }: { permission: string }) => ({ allowed: allowed.has("*") || allowed.has(permission), reason: "fixture" })) as MailSuppressionDeps["authorize"] };
}

function deps(rows: MailSuppressionEntry[], list = ["*"], removed: unknown[] = []): MailSuppressionDeps {
  return { workspaceId: "ws", authorize: grantsFor(list).authorize, mailSuppressionAdmin: memoryRepo(rows, removed) };
}

test("readMailSuppressionQuery: defaults, filters, blank search and every refusal", () => {
  assert.deepEqual(readMailSuppressionQuery({ input: {} }), { limit: 25, filter: {} });
  assert.deepEqual(readMailSuppressionQuery({ input: { search: " example.com ", scope: "bulk", reason: "complained", limit: "5" } }), { limit: 5, filter: { search: "example.com", scope: "bulk", reason: "complained" } });
  assert.deepEqual(readMailSuppressionQuery({ input: { search: "   ", scope: "", reason: "" } }).filter, {});
  for (const input of [{ scope: "everything" }, { reason: "spam" }, { search: 5 }, { search: "x".repeat(255) }, { cursor: "%%" }]) {
    assert.throws(() => readMailSuppressionQuery({ input }), { name: "ToolInputError" });
  }
});

test("listMailSuppressions needs mail.activity.read, pages with a cursor and labels empty pages", async () => {
  const rows = [entry("a@x.test", 1), entry("b@x.test", 2), entry("c@x.test", 2, { scope: "bulk", reason: "complained" })];
  const first = await listMailSuppressions({ principalId: "p", query: readMailSuppressionQuery({ input: { limit: 2 } }) }, deps(rows));
  assert.deepEqual([first.items.map((row) => row.address), first.empty], [["c@x.test", "b@x.test"], null]);
  const second = await listMailSuppressions({ principalId: "p", query: readMailSuppressionQuery({ input: { limit: 2, cursor: first.nextCursor } }) }, deps(rows));
  assert.deepEqual([second.items, second.nextCursor, second.empty], [[entry("a@x.test", 1)], null, null]);
  assert.equal((await listMailSuppressions({ principalId: "p", query: readMailSuppressionQuery({ input: {} }) }, deps([]))).empty, "none_recorded");
  assert.equal((await listMailSuppressions({ principalId: "p", query: readMailSuppressionQuery({ input: { reason: "manual" } }) }, deps(rows))).empty, "no_matches");
  await assert.rejects(listMailSuppressions({ principalId: "p", query: readMailSuppressionQuery({ input: {} }) }, deps(rows, ["admin.forms.manage"])),
    (err: unknown) => err instanceof MailActivityForbiddenError && err.permission === "mail.activity.read");
  await assert.rejects(listMailSuppressions({ principalId: "p", query: readMailSuppressionQuery({ input: {} }) }, { workspaceId: "ws", authorize: grantsFor(["*"]).authorize }), MailSuppressionsUnavailableError);
});

test("readMailSuppressionRemoval normalizes the address and requires a scope and a 3-500 character reason", () => {
  assert.deepEqual(readMailSuppressionRemoval({ input: { address: " Ann@X.test ", scope: "all", reason: "  mailbox fixed  " } }), { address: "ann@x.test", scope: "all", reason: "mailbox fixed" });
  for (const [input, message] of [
    [{ address: "nobody", scope: "all", reason: "fine" }, /address must be the suppressed email address/],
    [{ address: 3, scope: "all", reason: "fine" }, /address/],
    [{ address: `${"a".repeat(250)}@x.test`, scope: "all", reason: "fine" }, /address/],
    [{ address: "a@x.test", reason: "fine" }, /scope must be one of all, bulk/],
    [{ address: "a@x.test", scope: "all" }, /reason is required/],
    [{ address: "a@x.test", scope: "all", reason: " ok " }, /reason is required/],
    [{ address: "a@x.test", scope: "all", reason: "x".repeat(501) }, /reason is required.*Nothing was changed/],
  ] as const) assert.throws(() => readMailSuppressionRemoval({ input: input as Record<string, unknown> }), { name: "ToolInputError", message });
});

test("removal plan warns per original reason and never implies consent; run re-checks and records who and why", async () => {
  const removed: unknown[] = [];
  const rows = [entry("a@x.test", 1), entry("b@x.test", 2, { scope: "bulk", reason: "complained" }), entry("c@x.test", 3, { reason: "manual" })];
  const d = deps(rows, ["mail.suppressions.manage"], removed);
  const bounced = await planMailSuppressionRemoval({ principalId: "owner", input: { address: "a@x.test", scope: "all", reason: "fixed" } }, d);
  assert.deepEqual([bounced.suppressionReason, bounced.suppressedAt, bounced.warnings.length], ["bounced", AT(1), 2]);
  assert.match(bounced.warnings[0]!, /hard-bounced/);
  assert.match(bounced.warnings[1]!, /does not subscribe this address or restore newsletter consent/);
  assert.match((await planMailSuppressionRemoval({ principalId: "owner", input: { address: "b@x.test", scope: "bulk", reason: "ok!" } }, d)).warnings[0]!, /marked the site's mail as spam/);
  assert.equal((await planMailSuppressionRemoval({ principalId: "owner", input: { address: "c@x.test", scope: "all", reason: "ok!" } }, d)).warnings.length, 1);
  await assert.rejects(planMailSuppressionRemoval({ principalId: "owner", input: { address: "a@x.test", scope: "bulk", reason: "fixed" } }, d), { name: "ToolInputError", message: /a@x.test is not suppressed for bulk mail/ });
  assert.deepEqual(await runMailSuppressionRemoval({ principalId: "owner", plan: bounced }, d), { removed: true, removal: removed[0] });
  assert.deepEqual(removed[0], { id: "r1", address: "a@x.test", scope: "all", suppressionReason: "bounced", suppressedAt: AT(1), removalReason: "fixed", removedBy: "owner", removedAt: AT(99) });
  assert.deepEqual(await runMailSuppressionRemoval({ principalId: "owner", plan: bounced }, d), { removed: false });
  await assert.rejects(planMailSuppressionRemoval({ principalId: "admin", input: { address: "c@x.test", scope: "all", reason: "ok!" } }, deps(rows, ["mail.activity.read", "admin.forms.manage"])),
    (err: unknown) => err instanceof MailActivityForbiddenError && err.permission === "mail.suppressions.manage");
});

// ---- feedback setup -------------------------------------------------------------------------

function provider(id: string, overrides: Partial<MailProviderConfiguration> = {}): MailProviderConfiguration {
  return { id, label: id === "hosted" ? "Hosted" : "Relay", origin: "plugin", hosted: true, lanes: ["transactional", "bulk"], capabilities: { feedback: true, domainVerification: false },
    credential: { required: true, saved: true }, selectable: true, setup: { fields: [] }, ...overrides };
}

function feedbackDeps(overrides: Partial<MailFeedbackSetupDeps> = {}): MailFeedbackSetupDeps {
  return {
    workspaceId: "ws",
    mailProviderControl: { describe: async () => ({ setting: { transactional: "hosted", bulk: "relay" }, refusals: [], providers: [
      provider("hosted", { lanes: ["transactional"] }), provider("relay", { lanes: ["bulk"] }), provider("idle", { lanes: [] }), provider("smtp", { lanes: ["bulk"], capabilities: { feedback: false, domainVerification: false } }),
    ] }) },
    customCredentialSetRepo: { listByWorkspace: async () => [
      { label: "Tovu Mail — Hosted Webhook Secret", updatedAt: AT(10) }, { label: "Tovu Mail — Relay Webhook Secret (previous)", updatedAt: AT(11) },
    ] as never },
    originRegistry: { canonicalOrigin: async () => ({ scheme: "https", host: "site.test", port: 443, basePath: "/blog" }) as never },
    mailSuppressionAdmin: memoryRepo([]),
    ...overrides,
  };
}

test("feedback setup per active provider: receiving, no events yet on the previous slot, unsupported", async () => {
  const report = await readMailFeedbackSetup(feedbackDeps());
  assert.equal(report.available, true);
  assert.deepEqual(report.providers.map((p) => [p.providerId, p.state, p.webhookUrl]), [
    ["hosted", "receiving", "https://site.test/blog/hooks/mail/hosted"],
    ["relay", "no_events_yet", "https://site.test/blog/hooks/mail/relay"],
    ["smtp", "unsupported", null],
  ]);
  assert.deepEqual(report.providers[0]!.signingSecret, {
    current: { label: "Tovu Mail — Hosted Webhook Secret", configured: true, updatedAt: AT(10) },
    previous: { label: "Tovu Mail — Hosted Webhook Secret (previous)", configured: false, updatedAt: null },
  });
  assert.deepEqual(report.providers[0]!.lastVerifiedEvent, { kind: "delivered", receivedAt: AT(50) });
  assert.deepEqual([report.providers[2]!.signingSecret, report.providers[2]!.lastVerifiedEvent, report.providers[2]!.webhookPath], [null, null, "/hooks/mail/smtp"]);
});

test("feedback setup: missing secrets, unverified origin, non-default ports, and absent seams", async () => {
  const bare = await readMailFeedbackSetup(feedbackDeps({ customCredentialSetRepo: undefined, mailSuppressionAdmin: undefined, originRegistry: undefined }));
  assert.deepEqual(bare.providers.map((p) => [p.state, p.webhookUrl, p.lastVerifiedEvent]), [["secret_missing", null, null], ["secret_missing", null, null], ["unsupported", null, null]]);
  const unverified = await readMailFeedbackSetup(feedbackDeps({ originRegistry: { canonicalOrigin: async () => { throw new Error("unverified"); } } }));
  assert.equal(unverified.providers[0]!.webhookUrl, null);
  const port = await readMailFeedbackSetup(feedbackDeps({ originRegistry: { canonicalOrigin: async () => ({ scheme: "http", host: "localhost", port: 4000 }) as never } }));
  assert.equal(port.providers[0]!.webhookUrl, "http://localhost:4000/hooks/mail/hosted");
  for (const origin of [{ scheme: "http", host: "a.test", port: 80 }, { scheme: "https", host: "a.test" }]) {
    const plain = await readMailFeedbackSetup(feedbackDeps({ originRegistry: { canonicalOrigin: async () => origin as never } }));
    assert.match(plain.providers[0]!.webhookUrl!, /^https?:\/\/a\.test\/hooks\/mail\/hosted$/);
  }
  assert.deepEqual(await readMailFeedbackSetup(feedbackDeps({ mailProviderControl: undefined })), { available: false, providers: [] });
  assert.deepEqual(await readMailFeedbackSetup(feedbackDeps({ mailProviderControl: {} })), { available: false, providers: [] });
});

// ---- tools ----------------------------------------------------------------------------------

const ctx: ToolExecutionContext = { executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input: {}, signal: new AbortController().signal };

function tools(list = ["*"], removed: unknown[] = []) {
  let count = 0;
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => `exchange-${++count}` }, defaultChannel: "mcp-ui" });
  const cards: unknown[] = [];
  const grants = grantsFor(list);
  const answer = (decision: "confirm" | "cancel", before?: () => void): ToolExecutionOptions => ({ emitSurface: async (surface: unknown) => {
    cards.push(surface);
    before?.();
    store.deliver({ exchangeId: `exchange-${count}`, principalId: "owner", params: { decision } }, { toolId: "mail_remove_suppression" });
  } });
  const d: MailDeliveryToolDeps = {
    ...feedbackDeps(), workspaceId: "ws", authorize: grants.authorize, mailer: { capabilities: () => ({ driver: "smtp" }) } as unknown as MailerPort,
    mailSuppressionAdmin: memoryRepo([entry("a@x.test", 1, { reason: "complained", scope: "bulk" }), entry("z@x.test", 0)], removed),
  };
  const registrations = buildMailDeliveryRegistrations(d, { surfaceExchanges: store });
  const call = (name: string, input: unknown = {}, options: ToolExecutionOptions = {}) => registrations.find((r) => r.descriptor.id === name)!.handler({ ...ctx, input }, options);
  return { call, answer, cards, revoke: (permission: string) => grants.allowed.delete(permission) };
}

test("mail_list_suppressions and mail_get_feedback_setup read through the shared operations under their permissions", async () => {
  assert.deepEqual(((await tools().call("mail_list_suppressions", { scope: "bulk" })) as { items: unknown[] }).items, [entry("a@x.test", 1, { reason: "complained", scope: "bulk" })]);
  await assert.rejects(tools(["admin.forms.manage"]).call("mail_list_suppressions"), /MAIL_DELIVERY_FORBIDDEN: .*mail\.activity\.read/);
  assert.equal(((await tools(["admin.forms.manage"]).call("mail_get_feedback_setup")) as { providers: unknown[] }).providers.length, 3);
  await assert.rejects(tools(["mail.activity.read"]).call("mail_get_feedback_setup"), /MAIL_DELIVERY_FORBIDDEN: .*admin\.forms\.manage/);
});

test("mail_remove_suppression asks every time, records the reason, and re-checks the grant at the write", async () => {
  const removed: unknown[] = [];
  const f = tools(["mail.suppressions.manage"], removed);
  const input = { address: "a@x.test", scope: "bulk", reason: "asked to be re-added" };
  assert.deepEqual(await f.call("mail_remove_suppression", input, f.answer("cancel")), { removed: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
  assert.equal(removed.length, 0);
  const done = await f.call("mail_remove_suppression", input, f.answer("confirm")) as { removed: boolean; removal: { removalReason: string; removedBy: string } };
  assert.deepEqual([done.removed, done.removal.removalReason, done.removal.removedBy], [true, "asked to be re-added", "owner"]);
  const card = JSON.stringify(f.cards[1]);
  for (const text of ["Allow email to a@x.test again?", "Newsletters (bulk mail)", "complained", "asked to be re-added", "restore newsletter consent", "Remove from do-not-send list"]) assert.ok(card.includes(text), text);
  assert.equal(card.includes("remember"), false, "the card offers no remembered approval");
  const g = tools(["mail.suppressions.manage"]);
  await assert.rejects(g.call("mail_remove_suppression", input, g.answer("confirm", () => g.revoke("mail.suppressions.manage"))), /MAIL_DELIVERY_FORBIDDEN/);
  const scoped = tools(["mail.suppressions.manage"]);
  assert.match(JSON.stringify(await scoped.call("mail_remove_suppression", { ...input, scope: "all" }, scoped.answer("confirm")).catch((err: Error) => err.message)), /not suppressed for all mail/);
  const all = tools(["*"]);
  await all.call("mail_remove_suppression", { address: "z@x.test", scope: "all", reason: "mailbox restored" }, all.answer("confirm"));
  assert.ok(JSON.stringify(all.cards[0]).includes("<dd>All email</dd>"), "scope all reads as All email");
  assert.ok(JSON.stringify(all.cards[0]).includes("hard-bounced"), "bounce warning");
});
