/** t09: drive the real held-open card and gateway; a model's input never substitutes for a click. */
import assert from "node:assert/strict";
import test from "node:test";
import type { ConfirmationTokenRecord } from "../../../contracts/core/gated-mutations/token.js";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { confirm, ForbiddenError } from "../../../contracts/core/gated-mutations/gateway.js";
import { buildConfirmOnlyHooks } from "../../../contracts/core/gated-mutations/composition.js";
import { isMcpUiToolCallPermitted } from "../../../assistant/mcp-ui-tool-calls.js";
import { fixture, packed, context, tool, OWNER } from "./pull-tool-fixture.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";

const ID = "publish_content_execute_pull";
async function planned() {
  const f = await fixture([packed("new"), packed("conflict", "Owner's article")]);
  f.destination.set("conflict", { version: 1, hash: "local-edits", title: "Local article" });
  const plan = await (await tool(f.deps, "publish_content_plan_pull")).handler(context({ peerId: "live" })) as { bundleId: string };
  return { ...f, bundleId: plan.bundleId };
}
async function start(f: Awaited<ReturnType<typeof planned>>, overwriteEntityKeys = ["pull-fixture:conflict"]) {
  const controller = new AbortController();
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  let resolveSurface!: (value: any) => void;
  const surface = new Promise<any>(resolve => { resolveSurface = resolve; });
  const r = await tool(f.deps, ID, { surfaceExchanges });
  const pending = r.handler(context({ bundleId: f.bundleId, overwriteEntityKeys }, { signal: controller.signal }), { emitSurface: async s => { resolveSurface(s); } });
  const emitted = await Promise.race([surface, pending.then(() => { throw new Error("execute ended before a dialog"); })]);
  const html = emitted.payload.resource.resource.text as string;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.notEqual(match, null);
  const exchangeId = match![1]!;
  const answer = (decision: "confirm" | "cancel", principalId = OWNER) => {
    assert.equal(isMcpUiToolCallPermitted(ID, true), true, "production callback admits the confirm card");
    return surfaceExchanges.deliver({ exchangeId, principalId, params: { decision } }, { toolId: ID });
  };
  return { html, pending, answer, controller, surfaceExchanges };
}
test("the card names the source, counts and every overwritten title; only a human confirm applies", async () => {
  const f = await planned();
  const confirmations: ConfirmationTokenRecord[] = [];
  let redemptions = 0;
  const tokens = f.deps.gatedMutations.gatewayDeps.tokens;
  const save = tokens.save.bind(tokens);
  tokens.save = async record => { confirmations.push(record); return save(record); };
  const tryRedeem = tokens.tryRedeem.bind(tokens);
  tokens.tryRedeem = async args => { redemptions++; return tryRedeem(args); };
  const { html, pending, answer } = await start(f);
  assert.equal(html.includes("Live site"), true);
  assert.match(html, /<dt>Create<\/dt><dd>1<\/dd>/);
  assert.match(html, /<dt>Update<\/dt><dd>1<\/dd>/);
  assert.match(html, /<dt>Unchanged<\/dt><dd>0<\/dd>/);
  assert.match(html, /<dt>Blocked<\/dt><dd>0<\/dd>/);
  assert.match(html, /Owner(?:&#39;|&#x27;|')s article/);
  assert.equal(f.applied.length, 0);
  assert.equal(confirmations.length, 0);
  assert.equal(redemptions, 0);
  assert.deepEqual(answer("confirm"), { ok: true });
  assert.deepEqual(await pending, { executed: true, counts: { create: 1, update: 1, unchanged: 0, blocked: 0 }, entities: [{ entityKey: "pull-fixture:new", title: "Live new", outcome: "created", reason: null }, { entityKey: "pull-fixture:conflict", title: "Owner's article", outcome: "forced", reason: "no prior sync baseline for pull-fixture 'conflict' with this peer — the destination already holds different content" }] });
  assert.equal(f.destination.get("conflict")?.title, "Owner's article");
  assert.equal(f.destination.get("new")?.title, "Live new");
  assert.equal(f.restorePoints.size, 1);
  assert.deepEqual(confirmations.map(record => ({ confirmer: record.confirmerPrincipalId, scope: record.scopeId })), [{ confirmer: OWNER, scope: "local" }]);
  assert.equal(redemptions, 1);
  assert.equal((await tokens.findByToken(confirmations[0]!.confirmationToken))?.status, "redeemed");
  assert.equal(f.applied.length, 1);
  assert.equal(f.applied[0]!.principalId, OWNER);
  const applyAuth = f.authCalls.filter(a => a.permission === "publish_content.apply");
  assert.equal(applyAuth.every(a => a.principalId === OWNER), true);

});
test("decline and unanswered abort never apply or capture a restore point", async () => {
  for (const decision of ["cancel", "abandon"] as const) {
    const f = await planned();
    const before = [...f.destination];
    const call = await start(f);
    if (decision === "cancel") assert.deepEqual(call.answer("cancel"), { ok: true });
    else call.controller.abort();
    const result = await call.pending as { executed: boolean; reason?: string };
    assert.equal(result.executed, false);
    assert.equal(result.reason, decision === "abandon" ? "abandoned" : undefined);
    assert.deepEqual([...f.destination], before);
    assert.equal(f.applied.length, 0);
    assert.equal(f.restorePoints.size, 0);
  }
});
test("a wrong human cannot confirm; a changed plan after the card fails the gateway stale guard", async () => {
  const f = await planned();
  const call = await start(f, []);
  assert.deepEqual(call.answer("confirm", "another-human"), { ok: false, reason: "binding-mismatch" });
  assert.equal(f.applied.length, 0);
  f.destination.set("new", { version: 1, hash: "concurrent-edit", title: "Concurrent edit" });
  call.answer("confirm");
  await assert.rejects(() => call.pending, { message: "The local content changed after the dialog was shown. Run publish_content_execute_pull again to review a fresh plan." });
  assert.equal(f.applied.length, 0);
  assert.equal(f.restorePoints.size, 0);
});
test("the gateway still refuses an agent confirmer, even with apply permission", async () => {
  const f = await planned();
  await assert.rejects(() => confirm({ deps: f.deps.gatedMutations.gatewayDeps, principalId: OWNER, principalKind: "agent", hooks: buildConfirmOnlyHooks({ domain: "publish_content.import", readPermission: "publish_content.read", mutatePermission: "publish_content.apply", scopeId: "local" }), planId: "plan", planHash: "hash" }), (err: unknown) => {
    assert.equal(err instanceof ForbiddenError, true);
    assert.equal((err as ForbiddenError).reasonCode, "AGENT_CANNOT_CONFIRM");
    assert.equal((err as Error).message, "agent principals may not confirm a gated mutation");
    return true;
  });
  assert.equal(f.applied.length, 0);
});
test("permission denied, malformed overwrite selections and forged confirm inputs never open a card", async () => {
  const f = await planned();
  const r = await tool(f.deps, ID);
  for (const keys of [null, "all", [1], Array(1001).fill("pull-fixture:conflict")]) await assert.rejects(() => r.handler(context({ bundleId: f.bundleId, overwriteEntityKeys: keys })), { message: "'overwriteEntityKeys' must be an array of at most 1000 non-empty strings." });
  for (const key of ["confirm", "confirmationToken"]) await assert.rejects(() => r.handler(context({ bundleId: f.bundleId, [key]: true })), { message: `'${key}' is not an input of this tool. Only a click in the confirm dialog confirms it — nothing in the tool input can.` });
  f.denied.add("publish_content.apply");
  await assert.rejects(() => r.handler(context({ bundleId: f.bundleId })), { message: "principal 'human-owner' is not authorized for 'publish_content.apply' (insufficient_permission)" });
  assert.equal(f.applied.length, 0);
});
test("missing/expired bundles, wrong caller and unknown overwrite keys require a fresh plan", async () => {
  const f = await planned();
  const r = await tool(f.deps, ID);
  await assert.rejects(() => r.handler(context({ bundleId: "absent" })), { message: "This pull plan was not found or has expired. Run publish_content_plan_pull again." });
  await assert.rejects(() => r.handler(context({ bundleId: f.bundleId }, { principal: { id: "another-human" } })), { message: "This pull was planned by a different caller. Run publish_content_plan_pull for this conversation." });
  await assert.rejects(() => r.handler(context({ bundleId: f.bundleId, overwriteEntityKeys: ["pull-fixture:not-in-bundle"] })), { message: "'pull-fixture:not-in-bundle' is not in this pull plan. Use entity keys returned by publish_content_plan_pull." });
  f.setNow("2026-10-03T00:00:00.000Z");
  await assert.rejects(() => r.handler(context({ bundleId: f.bundleId })), { message: "This pull plan was not found or has expired. Run publish_content_plan_pull again." });
  assert.equal(f.applied.length, 0);
});
test("restore-point unavailability refuses before any content write, even after confirmation", async () => {
  const f = await planned();
  f.deps.dbOps.getCapabilities = async () => ({ restorePoint: { costClass: "unavailable" } }) as never;
  const call = await start(f);
  call.answer("confirm");
  await assert.rejects(() => call.pending, { message: "This computer cannot capture a restore point. Pulling content is refused until backups are available." });
  assert.equal(f.applied.length, 0);
  assert.equal(f.restorePoints.size, 0);
});
test("success reports the stored apply-time outcomes, including a conflict downgraded during apply", async () => {
  const f = await planned();
  const originalApply = f.deps.publishContentApplyPort.applyReport;
  f.deps.publishContentApplyPort.applyReport = async args => {
    const report = { ...args.report, rows: args.report.rows.map(row => row.entityId === "conflict" ? { ...row, writes: false, outcome: "conflict" as const, reason: "Concurrent edit prevented overwrite" } : row) };
    return originalApply({ ...args, report });
  };
  const call = await start(f);
  call.answer("confirm");
  const result = await call.pending as any;
  assert.deepEqual(result.counts, { create: 1, update: 0, unchanged: 0, blocked: 0 });
  assert.deepEqual(result.entities.find((row: any) => row.entityKey === "pull-fixture:conflict"), { entityKey: "pull-fixture:conflict", title: "Owner's article", outcome: "conflict", reason: "Concurrent edit prevented overwrite" });
  assert.equal(f.destination.get("conflict")?.title, "Local article");
});
test("a headless call cannot apply, and an expired confirmation resolves executed false", async () => {
  const f = await planned();
  await assert.rejects(() => tool(f.deps, ID).then(r => r.handler(context({ bundleId: f.bundleId }))), { message: "PUBLISH_CONTENT_NO_CONFIRMATION_CHANNEL: publish_content_execute_pull: this execution context has no interactive confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed." });
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, { idleTtlMs: 1, maxLifetimeMs: 1000 });
  const r = await tool(f.deps, ID, { surfaceExchanges });
  // The exchange's timer is unref'ed; keep the runner alive until the explicit result settles.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const result = await r.handler(context({ bundleId: f.bundleId }), { emitSurface: async () => undefined });
    assert.deepEqual(result, { executed: false, cancelled: false, reason: "expired", note: "The user did not answer the confirmation dialog before it expired. Nothing was changed." });
  } finally { clearInterval(keepAlive); }
  assert.equal(f.applied.length, 0);
  assert.equal(f.restorePoints.size, 0);
});
test("revoking apply permission while the card is open prevents confirmation and all writes", async () => {
  const f = await planned();
  const call = await start(f);
  f.denied.add("publish_content.apply");
  call.answer("confirm");
  await assert.rejects(() => call.pending, { message: "principal 'human-owner' is not authorized for 'publish_content.apply' (insufficient_permission)" });
  assert.equal(f.applied.length, 0);
  assert.equal(f.restorePoints.size, 0);
  assert.equal(f.destination.get("conflict")?.title, "Local article");
});
