import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext, ToolExecutionOptions } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock } from "@jini-ai/platform/system";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { capture, DAY, keys, MAIL_TABLES, NOW, seed, workspaces, type Db } from "../../mail/__tests__/capture-fixtures";
import { planMailDeliveryCaptureClear } from "#src/server/runtime/composition/mail-capture-clear-planner";
import { mailDeliveryDerivedRisk } from "@jini-ai/user-management/mail/status/delivery-tool-registrations";
import { buildMailDeliveryRegistrations, type MailDeliveryToolDeps } from "../delivery-tool-registrations.js";

/**
 * `mail_clear_captured` (owner decision 2026-11-23, bt2-todos G7-7/848): the assistant's "clear all
 * captured test emails". It previews the count on the approval card every time and deletes only
 * after the person confirms, only this workspace's captured test emails, and only if nothing new
 * arrived between the card and the click.
 */
const ctx: ToolExecutionContext = { executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input: {}, signal: new AbortController().signal };

function tool(db: Db | undefined, granted = ["mail.capture.clear"]) {
  let count = 0;
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => `exchange-${++count}` }, defaultChannel: "mcp-ui" });
  const cards: unknown[] = [];
  const answer = (decision: "confirm" | "cancel", before?: () => Promise<void>): ToolExecutionOptions => ({ emitSurface: async (surface: unknown) => {
    cards.push(surface);
    await before?.();
    store.deliver({ exchangeId: `exchange-${count}`, principalId: "owner", params: { decision } }, { toolId: "mail_clear_captured" });
  } });
  const deps = { workspaceId: "w", ownerPrincipalId: Promise.resolve("owner"),
    authorize: async ({ permission }: { permission: string }) => ({ allowed: granted.includes(permission), reason: "fixture" }),
    ...(db ? { contentKernel: db } : {}) } as unknown as MailDeliveryToolDeps;
  const registration = buildMailDeliveryRegistrations(deps, { surfaceExchanges: store }, { planCaptureClear: planMailDeliveryCaptureClear }).find(r => r.descriptor.id === "mail_clear_captured")!;
  return { call: (options: ToolExecutionOptions) => registration.handler({ ...ctx, input: {} }, options), answer, cards };
}

const everything = async (db: Db) => Promise.all((["mail_capture", "mail_send_ledger", "mail_activity_attempts"] as const).map(t => keys(db, t)));

describeEachDialect("mail_clear_captured", { tables: MAIL_TABLES, make: db => db }, make => {
  async function seeded() {
    const db = make(); await workspaces(db);
    await seed(db, { workspaceId: "w", at: NOW - DAY, key: "one" }); await seed(db, { workspaceId: "w", at: NOW, key: "two" });
    await seed(db, { workspaceId: "other", at: NOW, key: "kept" });
    return db;
  }

  test("cancelling the card deletes nothing, and the card shows how many will be deleted", async () => {
    const db = await seeded(); const before = await everything(db);
    const t = tool(db);
    assert.deepEqual(await t.call(t.answer("cancel")), { cleared: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
    assert.deepEqual(await everything(db), before);
    const card = JSON.stringify(t.cards[0]);
    for (const text of ["Delete 2 captured test emails?", "Sent-email records", "Delete test emails"]) assert.ok(card.includes(text), text);
    assert.equal(card.includes("remember"), false, "the card offers no remembered approval");
    assert.equal(mailDeliveryDerivedRisk.get("mail_clear_captured"), "mutates-durable-state");
  });

  test("approved, it deletes only this workspace's captured test emails; sent-email records and attempts stay", async () => {
    const db = await seeded();
    const t = tool(db);
    assert.deepEqual(await t.call(t.answer("confirm")), { cleared: true, deleted: 2 });
    assert.deepEqual(await everything(db), [["other:kept"], ["other:kept", "w:one", "w:two"], ["other:kept", "w:one", "w:two"]]);
  });

  test("a test email that arrives after the preview makes the approval stale: nothing is deleted", async () => {
    const db = await seeded();
    const t = tool(db);
    await assert.rejects(t.call(t.answer("confirm", () => capture(db, { workspaceId: "w", at: NOW + 1, key: "late" }))), /New test emails arrived/);
    assert.deepEqual(await keys(db, "mail_capture"), ["other:kept", "w:late", "w:one", "w:two"]);
  });

  test("nothing to clear answers empty without a card; without the owner grant nothing is read or deleted", async () => {
    const db = make(); await workspaces(db); await seed(db, { workspaceId: "other", at: NOW, key: "kept" });
    const empty = tool(db);
    assert.deepEqual(await empty.call(empty.answer("confirm")), { cleared: false, empty: true });
    assert.equal(empty.cards.length, 0);
    await seed(db, { workspaceId: "w", at: NOW, key: "one" });
    const editor = tool(db, ["mail.activity.read"]);
    await assert.rejects(editor.call(editor.answer("confirm")), /MAIL_DELIVERY_FORBIDDEN/);
    assert.deepEqual(await keys(db, "mail_capture"), ["other:kept", "w:one"]);
    const none = tool(undefined);
    await assert.rejects(none.call(none.answer("confirm")), /MAIL_DELIVERY_UNAVAILABLE/);
  });
});
