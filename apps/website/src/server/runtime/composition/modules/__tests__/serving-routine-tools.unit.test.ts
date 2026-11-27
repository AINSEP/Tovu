import assert from "node:assert/strict";
import test from "node:test";
import { InMemorySettingsRepo } from "@jini-ai/core/settings";
import { approvalText } from "#src/contracts/core/approval-i18n";
import {
  contributeRoutineTools, ROUTINE_CREATE_TOOL_ID, ROUTINE_DELETE_TOOL_ID, ROUTINE_LIST_TOOL_ID, ROUTINE_SET_ENABLED_TOOL_ID,
} from "#src/features/routines/routine-tool-registrations";
import { surfacesWithReceipts } from "#src/assistant/byok-tool-surface";
import type { AssistantRoutinesHandle } from "../assistant-routines.js";
import { servingRoutineToolOptions, settingsLocaleFor } from "../serving-routine-tools.js";
import { ROUTINE_AVAILABILITY_REFUSALS } from "#src/features/routines/routine-commands";

/**
 * Why: the four routine tools and the approval receipt port are only useful if serving composition
 * actually supplies them (P3-T4.T / P3-T3.T). These pin the supply rule, the lazy binding to the
 * EXACT command gate the admin routes use, and the receipt forwarding to the routines handle.
 */

const OWNER = "owner-1";
const FOUR = [ROUTINE_CREATE_TOOL_ID, ROUTINE_DELETE_TOOL_ID, ROUTINE_LIST_TOOL_ID, ROUTINE_SET_ENABLED_TOOL_ID].sort();
const CTX = { run: { id: "durable-run-1" }, principal: { id: OWNER } } as never;

function fakeHandle() {
  const listed: unknown[] = [];
  const bound: unknown[] = [];
  const commands = { list: async (input: unknown) => { listed.push(input); return { ok: true as const, routines: [] }; } };
  const handle = { availability: () => "ready" as const, commands, approvalBindingFor: ({ ctx }: { ctx: unknown }) => { bound.push(ctx); return { onApprovalReceipt: () => {}, restorable: false as const }; } };
  return { handle: handle as unknown as AssistantRoutinesHandle, listed, bound };
}

function deferred() {
  let resolve: (handle: AssistantRoutinesHandle) => void = () => {};
  const promise = new Promise<AssistantRoutinesHandle>((done) => { resolve = done; });
  return { promise, resolve };
}

const base = (ready: Promise<AssistantRoutinesHandle>, over: { canRun?: boolean; releaseEnabled?: boolean; owner?: boolean } = {}) => ({
  canRun: over.canRun ?? true, releaseEnabled: over.releaseEnabled ?? true, ready: () => ready, workspaceId: "ws-1",
  access: async ({ actor }: { actor: { principalId: string } }) => (over.owner ?? true) && actor.principalId === OWNER,
});

const toolIds = (host: NonNullable<ReturnType<typeof servingRoutineToolOptions>["routines"]>) =>
  contributeRoutineTools({ ...host, requireHumanConfirm: (async () => ({ confirmed: false })) as never }).build({} as never, {} as never).map((tool) => tool.descriptor.id).sort();

test("release on and a desktop-eligible host: the four routine tool ids are supplied", () => {
  const options = servingRoutineToolOptions(base(deferred().promise));
  assert.equal(options.routinesReleaseEnabled, true);
  assert.ok(options.routines);
  assert.deepEqual(toolIds(options.routines), FOUR);
});

test("release off (the default) or an ineligible host: no routine tool is supplied", () => {
  const off = servingRoutineToolOptions(base(deferred().promise, { releaseEnabled: false, canRun: false }));
  assert.equal(off.routines, undefined);
  assert.equal(off.routinesReleaseEnabled, false);
  assert.equal(servingRoutineToolOptions(base(deferred().promise, { canRun: false })).routines, undefined);
});

test("the tools resolve the exact routes' command gate lazily, after routines compose", async () => {
  const gate = deferred();
  const host = servingRoutineToolOptions(base(gate.promise)).routines!;
  // Pending composition is "starting", not a store-open failure: discovery stays closed (not "ready").
  assert.equal(host.availability(), "starting");
  const { handle, listed } = fakeHandle();
  const pending = host.commands.list({ actor: { principalId: OWNER, workspaceId: "ws-1" } });
  gate.resolve(handle);
  assert.deepEqual(await pending, { ok: true, routines: [] });
  assert.deepEqual(listed, [{ actor: { principalId: OWNER, workspaceId: "ws-1" } }]);
  assert.equal(host.availability(), "ready");
});

test("pending composition refuses with not-ready copy, distinct from an actual store-open failure", async () => {
  const pending = servingRoutineToolOptions(base(deferred().promise)).routines!;
  assert.notEqual(pending.availability(), "ready");
  assert.equal(pending.availability(), "starting");
  assert.notEqual(ROUTINE_AVAILABILITY_REFUSALS.starting.message, ROUTINE_AVAILABILITY_REFUSALS.error.message);
  assert.notEqual(ROUTINE_AVAILABILITY_REFUSALS.starting.reason, "ROUTINES_STORE_OPEN_FAILED");
  // A composed handle that really failed to open still reports the failure.
  const failed = deferred();
  const host = servingRoutineToolOptions(base(failed.promise)).routines!;
  failed.resolve({ ...fakeHandle().handle, availability: () => "error" as const });
  await failed.promise; await new Promise((r) => setImmediate(r));
  assert.equal(host.availability(), "error");
});

test("only the live owner resolves, bound to the mounted workspace; copy follows the owner's locale", async () => {
  const asked: string[] = [];
  const localeFor = async ({ principalId }: { principalId: string }) => { asked.push(principalId); return "it"; };
  const host = servingRoutineToolOptions(base(deferred().promise), { localeFor }).routines!;
  assert.equal(await host.resolveOwnerActor({ principalId: "visitor" }), null);
  assert.deepEqual(await host.resolveOwnerActor({ principalId: OWNER }), { principalId: OWNER, workspaceId: "ws-1" });
  assert.deepEqual(asked, [OWNER]);
  assert.equal(host.copy({ key: "Create routine" }), approvalText({ locale: "it", key: "Create routine" }));
  assert.throws(() => host.validateSchedule({ schedule: { kind: "daily", time: "25:00", timezone: "UTC" } as never }));
});

test("the receipt port forwards to the routines handle binding, and is undefined before routines exist", async () => {
  const gate = deferred();
  const { routineApprovalReceiptsFor } = servingRoutineToolOptions(base(gate.promise));
  assert.equal(routineApprovalReceiptsFor({ ctx: CTX }), undefined);
  const { handle, bound } = fakeHandle();
  gate.resolve(handle);
  await gate.promise;
  await Promise.resolve();
  const binding = routineApprovalReceiptsFor({ ctx: CTX });
  assert.equal(binding?.restorable, false);
  assert.equal(typeof binding?.onApprovalReceipt, "function");
  assert.equal(bound.length, 1);
  // The routine run handler tracks the accepted durable `run.runId`; the daemon launches with that same id, so ctx.run.id matches it.
  assert.equal((bound[0] as { run: { id: string } }).run.id, "durable-run-1");
});

test("the byok surfaces carry the receipt port to human-confirm only when supplied", () => {
  const surfaceExchanges = {} as never;
  const receipts = () => undefined;
  assert.equal((surfacesWithReceipts({ surfaceExchanges }, { approvalReceiptsFor: receipts }) as { approvalReceiptsFor?: unknown }).approvalReceiptsFor, receipts);
  assert.deepEqual(Object.keys(surfacesWithReceipts({ surfaceExchanges })), ["surfaceExchanges"]);
});


test("passes the existing localized desktop availability notice and only that host copy", async () => {
  const host = servingRoutineToolOptions(base(deferred().promise), { localeFor: async () => "it" }).routines!;
  await host.resolveOwnerActor({ principalId: OWNER });
  assert.equal(host.copy({ key: "This routine runs only while Tovu is open and your computer is awake" }), "Questa routine viene eseguita solo mentre Tovu è aperto e il computer è attivo");
  assert.equal(host.copy({ key: "Create routine" }), "Crea routine");
  assert.equal(host.copy({ key: "Unknown catalog title" as Parameters<typeof host.copy>[0]["key"] }), "Unknown catalog title");
});

test("routine approval copy reads the owner's scoped locale and falls back to English for absent or invalid settings", async () => {
  const iso = "2026-10-04T10:00:00.000Z";
  const settingsRepo = new InMemorySettingsRepo({
    definitions: [{
      settingId: "locale-def", version: 1, workspaceId: null, namespace: "core.language", key: "locale",
      ownerKind: "core", ownerId: null, schema: { type: "string", nullable: true }, defaultValue: null,
      scopes: 7, secret: false, status: "active", aliasOfNamespace: null, aliasOfKey: null, coercionTag: null,
      createdAt: iso, updatedAt: iso,
    }],
    userValues: [
      { settingId: "locale-def", scope: "user", workspaceId: "ws-1", principalId: OWNER, valueJson: "it",
        state: "set", defVersion: 1, seq: 1, updatedBy: OWNER, updatedAt: iso, originPluginId: null },
      { settingId: "locale-def", scope: "user", workspaceId: "ws-2", principalId: OWNER, valueJson: "fr",
        state: "set", defVersion: 1, seq: 2, updatedBy: OWNER, updatedAt: iso, originPluginId: null },
    ],
  });
  const localeFor = settingsLocaleFor({ settingsRepo, workspaceId: "ws-1" });
  assert.equal(await localeFor({ principalId: OWNER }), "it");
  assert.equal(await localeFor({ principalId: "other-owner" }), "en");
  assert.equal(await settingsLocaleFor({ settingsRepo, workspaceId: "ws-2" })({ principalId: OWNER }), "fr");
  assert.equal(await settingsLocaleFor({ settingsRepo: new InMemorySettingsRepo(), workspaceId: "ws-1" })({ principalId: OWNER }), "en");
});

test("a locale lookup failure does not refuse the live owner or reuse another request's localized copy", async () => {
  let calls = 0;
  const host = servingRoutineToolOptions(base(deferred().promise), {
    localeFor: async () => { if (++calls === 1) return "it"; throw new Error("settings offline"); },
  }).routines!;
  const actor = { principalId: OWNER, workspaceId: "ws-1" };
  assert.deepEqual(await host.resolveOwnerActor({ principalId: OWNER }), actor);
  assert.equal(host.copy({ key: "Create routine" }), "Crea routine");
  assert.deepEqual(await host.resolveOwnerActor({ principalId: OWNER }), actor);
  assert.equal(host.copy({ key: "Create routine" }), "Create routine");
});
