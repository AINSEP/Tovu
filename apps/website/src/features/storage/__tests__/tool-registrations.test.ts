import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError, type ToolExecutionContext, type ToolExecutionOptions } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock } from "@jini-ai/platform/system";
import { createCleanupPreviewStore } from "@jini-ai/platform/retention";
import { approvalToolHandler } from "#src/contracts/core/human-confirm";
import { createStorageCleanupGate } from "../cleanup-gate.js";
import { createStorageToolContributor } from "../tool-registrations.js";

const COPY = { protectedContent: "Tovu never cleans up your chats, revisions, screenshots or media automatically.", cardTitle: "Clean up old copies?", confirmLabel: "Clean up" };

/**
 * The real approval lifecycle over a real exchange store and the real cleanup gate; `log` records card
 * and runner order. `onCard` runs while the card is open (the window a plan can change in).
 */
function harness({ onCard = () => {} }: { onCard?: (h: { storage: { bytes: number }; gate: ReturnType<typeof createStorageCleanupGate> }) => void | Promise<void> } = {}) {
  let count = 0;
  let tokens = 0;
  const log: string[] = [];
  const storage = { bytes: 5 };
  const gate = createStorageCleanupGate({
    runOnce: async ({ dryRun }) => { log.push(`runOnce:${dryRun}`); return { status: "completed", dryRun, policies: [{ id: "share-files", bytes: storage.bytes, items: 1 }] }; },
    previewStore: createCleanupPreviewStore({ randomToken: () => `grant-${++tokens}`, mono: () => 0 }),
  }, {});
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => `exchange-${++count}` }, defaultChannel: "mcp-ui" });
  const contributor = createStorageToolContributor({
    measure: async (required, optional) => { log.push("measure"); assert.deepEqual([required, optional], [{}, {}]); return { totalBytes: 10 }; },
    cleanup: gate,
    authorizeOwner: async ({ principalId }) => { if (principalId !== "owner") throw new Error("Only the site owner can clean up storage."); },
    approval: { handler: approvalToolHandler }, copy: COPY,
  }, {});
  const tools = contributor.build(undefined, { surfaceExchanges: store });
  const cleanup = tools.find(r => r.descriptor.id === "site_storage_cleanup")!;
  const answer = (decision: "confirm" | "cancel"): ToolExecutionOptions => ({ emitSurface: async () => {
    log.push("card");
    await onCard({ storage, gate });
    store.deliver({ exchangeId: `exchange-${count}`, principalId: "owner", params: { decision } }, { toolId: "site_storage_cleanup" });
  } });
  const ctx = (input: unknown, principal = "owner"): ToolExecutionContext => ({ executionId: "e", principal: { id: principal }, run: { id: "r" }, input, signal: new AbortController().signal });
  return { log, tools, report: (input: unknown, principal?: string) => {
    const report = tools.find(r => r.descriptor.id === "site_storage_report");
    assert.ok(report);
    return report.handler(ctx(input, principal));
  }, call: (input: unknown, decision: "confirm" | "cancel" = "confirm", principal?: string) => cleanup.handler(ctx(input, principal), answer(decision)) };
}

test("cleanup defaults to dryRun", async () => {
  const h = harness();
  const result = await h.call({}) as Record<string, unknown>;
  assert.deepEqual([result.cleaned, result.dryRun], [false, true]);
  assert.deepEqual(h.log, ["runOnce:true"], "no card and no live pass");
});

test("content class refused in plain words", async () => {
  const h = harness();
  for (const kind of ["chats", "revisions", "screenshots", "media"]) await assert.rejects(h.call({ dryRun: false, classes: [kind] }), /never cleans up your chats, revisions, screenshots or media/);
  assert.deepEqual(h.log, []);
});

test("approval card raised", async () => {
  const h = harness();
  await h.call({ dryRun: false });
  assert.ok(h.log.includes("card"));
  assert.equal(h.tools.find(r => r.descriptor.id === "site_storage_report")!.descriptor.id, "site_storage_report");
});

test("human confirmation precedes runOnce({ dryRun: false })", async () => {
  const h = harness();
  const result = await h.call({ dryRun: false }) as Record<string, unknown>;
  assert.deepEqual(h.log, ["runOnce:true", "card", "runOnce:true", "runOnce:false"], "the click re-checks the plan the card showed, then runs live once");
  assert.deepEqual([result.cleaned, result.dryRun], [true, false]);
});

test("decline never calls runOnce live", async () => {
  const h = harness();
  const result = await h.call({ dryRun: false }, "cancel") as Record<string, unknown>;
  assert.equal(result.cleaned, false);
  assert.ok(!h.log.includes("runOnce:false"));
  await assert.rejects(h.call({ dryRun: false }, "confirm", "builtin-admin"), /site owner/);
  assert.ok(!h.log.includes("runOnce:false"), "a non-owner never reaches a live pass");
});

test("a live tool cleanup whose plan changed after the card is refused and deletes nothing", async () => {
  const h = harness({ onCard: ({ storage }) => { storage.bytes = 9; } });
  await assert.rejects(h.call({ dryRun: false }), /changed since you approved it\. Nothing was removed/);
  assert.ok(!h.log.includes("runOnce:false"));
});

test("a live tool cleanup without the card's own grant is refused (another preview replaced it)", async () => {
  const h = harness({ onCard: async ({ gate }) => { await gate.preview({ principalId: "owner" }, {}); } });
  await assert.rejects(h.call({ dryRun: false }), /Nothing was removed/);
  assert.ok(!h.log.includes("runOnce:false"));
});

test("nothing in the tool input can stand in for the grant", async () => {
  const h = harness();
  await assert.rejects(h.call({ dryRun: false, previewToken: "grant-1" }), /'previewToken' is not an input/);
  assert.deepEqual(h.log, []);
});

test("storage report rejects a non-owner without measuring and returns the read-only measurement to the owner", async () => {
  const h = harness();
  await assert.rejects(h.report({}, "other-principal"), { message: "Only the site owner can clean up storage." });
  assert.deepEqual(h.log, []);
  assert.deepEqual(await h.report({}), { totalBytes: 10 });
  assert.deepEqual(h.log, ["measure"]);
  assert.equal(h.tools.find(tool => tool.descriptor.id === "site_storage_report")?.descriptor.readOnly, true);
});

test("cleanup rejects malformed arguments before measuring and accepts a dry run with safe class spellings", async () => {
  const h = harness();
  for (const [input, message] of [
    [{ dryRun: "false" }, "Pass dryRun: true to preview or dryRun: false to clean up."],
    [{ classes: "cache" }, "List the kinds of storage to clean up as words."],
    [{ classes: ["cache", 1, "derived"] }, "List the kinds of storage to clean up as words."],
    [{ classes: ["cache", "uploads", "derived"] }, "Tovu never cleans up your chats, revisions, screenshots or media automatically."],
  ] as const) {
    await assert.rejects(h.call(input), error => error instanceof ToolInputError && error.message === message);
  }
  assert.deepEqual(h.log, []);
  assert.deepEqual(await h.call({ dryRun: true, classes: ["cache", "old-copy"] }), {
    cleaned: false, dryRun: true, pass: { status: "completed", dryRun: true, policies: [{ id: "share-files", bytes: 5, items: 1 }] },
  });
  assert.deepEqual(h.log, ["runOnce:true"]);
});
