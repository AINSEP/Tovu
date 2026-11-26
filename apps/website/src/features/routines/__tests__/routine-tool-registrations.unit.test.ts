import assert from "node:assert/strict";
import { test } from "node:test";

import { createContributionRegistry } from "@jini-ai/core";
import type { RoutineActor, RoutineAvailability } from "@tovu/contracts/routines";

import { MCP_UI_REDEEMABLE_TOOL_IDS } from "../../../assistant/mcp-ui-tool-calls.js";
import { nativeToolMetadata } from "../../../contracts/core/tool-metadata/index.js";
import { ROUTINE_TOOL_IDS } from "@jini-ai/core/tool-metadata/routines";
import type { HumanConfirmOutcome } from "@jini-ai/daemon/surface-exchanges/human-confirm";
import { installFirstPartyToolContributors } from "../../../server/runtime/composition/tool-catalog-manifest.js";
import { routineIdsHiddenFrom, withoutHiddenTools } from "../../../assistant/byok-tool-surface.js";
import { contributeRoutineTools, createRoutineToolDiscovery, ROUTINE_TOOL_COPY } from "../routine-tool-registrations.js";

/**
 * @file Routine tools over the serving-site federation (P3-T4.T). The tools are thin: the site's
 * `RoutineCommands` own every write. These tests pin the order that matters, card BEFORE write,
 * and that nothing is disclosed or saved for a non-owner, a declined card, or a changed row.
 */

const OWNER: RoutineActor = { principalId: "owner-1", workspaceId: "ws-1" };
const ROW = { id: "r1", name: "Digest", prompt: "Summarise", schedule: { kind: "hourly", minute: 5 }, agentId: null, model: null, enabled: true, revision: 3 };

type Overrides = {
  confirm?: HumanConfirmOutcome | (() => Promise<HumanConfirmOutcome>);
  availability?: RoutineAvailability;
  owners?: (RoutineActor | null)[];
  writeError?: unknown;
  rowRevision?: number;
};

function rig(overrides: Overrides = {}) {
  const events: string[] = [];
  const owners = [...(overrides.owners ?? [OWNER, OWNER, OWNER])];
  const row = { ...ROW, revision: overrides.rowRevision ?? ROW.revision };
  const commands = {
    list: async () => { events.push("list"); return { ok: true as const, routines: [row], availability: "ready" as const }; },
    get: async () => { events.push("get"); return { ok: true as const, routine: row }; },
    create: async ({ draft }: { draft: unknown }) => { events.push("create"); return { ok: true as const, routine: { ...row, ...(draft as object) } }; },
    setEnabled: async ({ enabled }: { enabled: boolean }) => { events.push("setEnabled"); if (overrides.writeError) throw overrides.writeError; return { ok: true as const, routine: { ...row, enabled } }; },
    delete: async () => { events.push("delete"); if (overrides.writeError) throw overrides.writeError; return { ok: true as const }; },
  };
  const cards: string[] = [];
  const confirm = async ({ spec }: { spec: { toolId: string } }) => {
    events.push("card"); cards.push(spec.toolId);
    return typeof overrides.confirm === "function" ? overrides.confirm() : overrides.confirm ?? { confirmed: true as const };
  };
  const host = {
    commands: commands as never,
    validateSchedule: ({ schedule }: { schedule: unknown }) => { if ((schedule as { kind?: string }).kind === "daily" && !(schedule as { timezone?: string }).timezone) throw new Error("timezone is required"); },
    resolveOwnerActor: async () => owners.length > 0 ? owners.shift()! : null,
    availability: () => overrides.availability ?? "ready",
    copy: ROUTINE_TOOL_COPY,
  };
  const contributor = contributeRoutineTools({ ...host, requireHumanConfirm: confirm as never });
  const registrations = contributor.build({ workspaceId: "ws-1", authorize: async () => ({ allowed: true }) } as never, {} as never);
  const call = (id: string, input: unknown) => registrations.find(r => r.descriptor.id === id)!.handler(
    { input, principal: { id: "owner-1" }, signal: new AbortController().signal } as never, { emitSurface: () => {} } as never) as Promise<Record<string, unknown>>;
  return { events, cards, call, registrations, contributor, host };
}

const CREATE_INPUT = { name: "Digest", prompt: "Summarise", schedule: { kind: "hourly", minute: 5 } };

test("create opens the card before saving", async () => {
  const { events, call } = rig();
  const result = await call("routine_create", CREATE_INPUT);
  assert.deepEqual(events.filter(e => e === "card" || e === "create"), ["card", "create"]);
  assert.equal(result.created, true);
});

test("delete opens the card before deleting", async () => {
  const { events, call } = rig();
  const result = await call("routine_delete", { id: "r1", revision: 3 });
  assert.deepEqual(events.filter(e => e === "card" || e === "delete"), ["card", "delete"]);
  assert.equal(result.deleted, true);
});

test("set-enabled opens the card before changing and names Pause or Resume", async () => {
  const { events, call } = rig();
  assert.equal((await call("routine_set_enabled", { id: "r1", enabled: false, revision: 3 })).changed, true);
  assert.deepEqual(events.filter(e => e === "card" || e === "setEnabled"), ["card", "setEnabled"]);
});

test("decline saves nothing", async () => {
  for (const [id, input] of [["routine_create", CREATE_INPUT], ["routine_set_enabled", { id: "r1", enabled: false, revision: 3 }], ["routine_delete", { id: "r1", revision: 3 }]] as const) {
    const { events, call } = rig({ confirm: { confirmed: false, reason: "declined" } as HumanConfirmOutcome });
    const result = await call(id, input);
    assert.deepEqual(events.filter(e => ["create", "setEnabled", "delete"].includes(e)), [], id);
    assert.match(String(result.note), /Nothing was changed\./);
  }
});

test("a missing confirmation channel changes nothing", async () => {
  const { events, call } = rig({ confirm: async () => { throw new Error("ROUTINES_NO_CONFIRMATION_CHANNEL: nothing ran"); } });
  const result = await call("routine_create", CREATE_INPUT);
  assert.equal(result.created, false);
  assert.match(String(result.note), /Nothing was changed\./);
  assert.equal(events.includes("create"), false);
});

test("policy cache cannot skip routine cards", async () => {
  for (const id of ["routine_create", "routine_set_enabled", "routine_delete"]) {
    assert.deepEqual(nativeToolMetadata.approvals[id], { class: "edit", confirmation: "direct" });
    assert.equal(nativeToolMetadata.policyConfirmationIds.has(id), false, `${id} is never a remembered policy grant`);
  }
  const { cards, call } = rig();
  await call("routine_delete", { id: "r1", revision: 3 });
  await call("routine_delete", { id: "r1", revision: 3 });
  assert.deepEqual(cards, ["routine_delete", "routine_delete"], "the second identical call still asks");
});

test("stale row on delete is refused", async () => {
  const before = rig({ rowRevision: 4 });
  const refused = await before.call("routine_delete", { id: "r1", revision: 3 });
  assert.equal(refused.deleted, false);
  assert.match(String(refused.error), /This routine changed since you looked\. List routines again\./);
  assert.equal(before.events.includes("card") || before.events.includes("delete"), false, "stale input never reaches the card");

  const staleError = { apiError: { code: "CONFLICT", message: "Routine changed", details: { reason: "ROUTINE_CHANGED" } } };
  const during = rig({ writeError: staleError });
  const result = await during.call("routine_delete", { id: "r1", revision: 3 });
  assert.match(String(result.error), /This routine changed since you looked\. List routines again\./);
  assert.equal(during.events.filter(e => e === "delete").length, 1, "no automatic retry");
});

test("a revision change while the card is open is refused with the stale sentence and not retried", async () => {
  // The store's transactional expectedRevision is the authority: it throws once the row moved on.
  const staleError = { apiError: { code: "CONFLICT", message: "Routine changed", details: { reason: "ROUTINE_CHANGED" } } };
  const { events, call } = rig({ writeError: staleError });
  const result = await call("routine_set_enabled", { id: "r1", enabled: false, revision: 3 });
  assert.equal(result.changed, false);
  assert.match(String(result.error), /This routine changed since you looked\. List routines again\./);
  assert.deepEqual(events.filter(e => e === "card" || e === "setEnabled"), ["card", "setEnabled"], "the write was attempted once, after the card");
});

test("owner revoked while the card is open writes nothing", async () => {
  const { events, call } = rig({ owners: [OWNER, null] });
  const result = await call("routine_create", CREATE_INPUT);
  assert.equal(result.created, false);
  assert.match(String(result.note), /Nothing was changed\./);
  assert.deepEqual(events.filter(e => e === "card" || e === "create"), ["card"]);
});

test("visitors never see the tools", async () => {
  const visitor = rig({ owners: [] });
  const result = await visitor.call("routine_list", {});
  assert.equal(result.routines, undefined);
  assert.deepEqual(visitor.events, [], "a non-owner reaches neither the card nor the commands");
  const discovery = createRoutineToolDiscovery({ resolveOwnerActor: async () => null, availability: () => "ready" });
  assert.equal(await discovery.isVisible({ principalId: "visitor-9" }), false);
  const owner = createRoutineToolDiscovery({ resolveOwnerActor: async () => OWNER, availability: () => "ready" });
  assert.equal(await owner.isVisible({ principalId: "owner-1" }), true);
});

test("an owner on a site that is not ready does not see the tools and is refused on invocation", async () => {
  const notReady = createRoutineToolDiscovery({ resolveOwnerActor: async () => OWNER, availability: () => "desktop-only" });
  assert.equal(await notReady.isVisible({ principalId: "owner-1" }), false);
  const { events, call } = rig({ availability: "desktop-only" });
  const result = await call("routine_create", CREATE_INPUT);
  assert.equal(result.created, false);
  assert.match(String(result.error), /Routines run only while the desktop app is open\./);
  assert.deepEqual(events, []);
});

test("invalid schedule is refused before the card with a plain reason", async () => {
  const { events, call } = rig();
  const result = await call("routine_create", { ...CREATE_INPUT, schedule: { kind: "daily", time: "09:00" } });
  assert.equal(result.created, false);
  assert.match(String(result.error), /timezone/);
  assert.deepEqual(events, []);
});

test("unbound discovery: without a bound host the routines domain is not registered and the ids are not discoverable", async () => {
  const contributions = { contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: { domain: string } }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: { domain: string } }) => contribution.domain }) };
  installFirstPartyToolContributors({ contributions: contributions as never });
  const domains = contributions.contributors.list({}).map((c: { domain: string }) => c.domain);
  assert.equal(domains.includes("routines"), false);
});

test("release flag off: the host supplies no routines binding, so the tools stay unexposed; supplied, they register once", async () => {
  const make = () => ({ contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: { domain: string } }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: { domain: string } }) => contribution.domain }) });
  const off = make();
  installFirstPartyToolContributors({ contributions: off as never }, {});
  assert.equal(off.contributors.list({}).some((c: { domain: string }) => c.domain === "routines"), false);
  const on = make();
  const { host } = rig();
  installFirstPartyToolContributors({ contributions: on as never }, { routines: host });
  assert.equal(on.contributors.list({}).filter((c: { domain: string }) => c.domain === "routines").length, 1);
});

test("the four ids carry the reviewed metadata: three card-opening and redeemable, list read-only and not redeemable", () => {
  assert.deepEqual([...ROUTINE_TOOL_IDS].sort(), ["routine_create", "routine_delete", "routine_list", "routine_set_enabled"]);
  assert.deepEqual(nativeToolMetadata.approvals.routine_list, { class: "read", confirmation: "direct" });
  assert.equal(MCP_UI_REDEEMABLE_TOOL_IDS.has("routine_list"), false);
  for (const id of ["routine_create", "routine_set_enabled", "routine_delete"]) {
    assert.equal(MCP_UI_REDEEMABLE_TOOL_IDS.has(id), true, `${id} redeemable`);
    assert.equal(nativeToolMetadata.exchangeOnlyIds.has(id), true, `${id} exchange-only`);
  }
});

test("routine_list returns rows only for a ready owner and never opens a card", async () => {
  const { events, call } = rig();
  const result = await call("routine_list", {});
  assert.equal((result.routines as unknown[]).length, 1);
  assert.equal(events.includes("card"), false);
});

test("the BYOK surface hides all four ids from an unbound, visitor or not-ready view and shows them to the ready owner", async () => {
  const hit = (id: string) => ({ id, description: "", score: 1 });
  const base = { search: () => [hit("routine_create"), hit("media_list"), hit("routine_list")], describe: ({ id }: { id: string }) => ({ id }) } as never;
  const hidden = async (isVisible?: boolean) => routineIdsHiddenFrom({ discovery: isVisible === undefined ? undefined : { isVisible: async () => isVisible }, principalId: "p" });
  for (const view of [await hidden(undefined), await hidden(false)]) {
    const catalog = withoutHiddenTools({ catalog: base, hidden: view }) as { search: (i: unknown) => { id: string }[]; describe: (i: { id: string }) => unknown };
    assert.deepEqual(catalog.search({}).map(h => h.id), ["media_list"]);
    assert.equal(catalog.describe({ id: "routine_delete" }), null);
  }
  const owner = withoutHiddenTools({ catalog: base, hidden: await hidden(true) }) as { search: (i: unknown) => { id: string }[] };
  assert.equal(owner.search({}).length, 3);
});
