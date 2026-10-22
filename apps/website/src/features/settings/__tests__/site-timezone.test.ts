import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createSettingsPrincipalLookup } from "../index.js";
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemorySettingsRepo, resolveDefinitionRaw, set, type AuthorizeFn, type SettingsRepoPort } from "@jini-ai/core/settings";

import {
  createSiteTimeZonePort,
  ensureSiteTimeZoneSettingDefinition,
  resolveSiteTimeZone,
  SITE_TIMEZONE_KEY,
  SITE_TIMEZONE_NAMESPACE,
} from "../site-timezone.js";

/**
 * @file Bug D (2026-10-22): `core.site.timezone`, the zone public pages format post dates in. Only a
 * workspace-layer value counts as the owner's choice; without one the zone detected when the site was
 * created applies, else UTC. An invalid value at either tier never breaks a render.
 */

const SYSTEM_PRINCIPAL_ID = "system-settings-migration";
const clock = { nowIso: () => "2026-10-22T00:00:00.000Z", nowMs: () => Date.parse("2026-10-22T00:00:00.000Z") };
let idCounter = 0;
const ids = { newId: () => `site-tz-id-${++idCounter}` };
const allowAll: AuthorizeFn = async () => ({ allowed: true, reason: "test" });

async function makeLedger(options: { register?: boolean } = {}) {
  const ledger = { settingsRepo: new InMemorySettingsRepo(), clock, ids, principals: createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) }) };
  if (options.register !== false) await ensureSiteTimeZoneSettingDefinition(ledger, { systemPrincipalId: SYSTEM_PRINCIPAL_ID });
  return ledger;
}

async function ownerSet(ledger: Awaited<ReturnType<typeof makeLedger>>, workspaceId: string, value: string): Promise<void> {
  await set({
    deps: { repo: ledger.settingsRepo, clock, ids, authorize: allowAll, principals: ledger.principals },
    input: { namespace: SITE_TIMEZONE_NAMESPACE, key: SITE_TIMEZONE_KEY, scope: "workspace", workspaceId, value, callerPrincipalId: "owner" },
  });
}

const creationZone = (zone: string | undefined) => ({ read: () => zone });

test("registers core.site.timezone as a per-workspace string setting defaulting to UTC, idempotently", async () => {
  const ledger = await makeLedger();
  await ensureSiteTimeZoneSettingDefinition(ledger, { systemPrincipalId: SYSTEM_PRINCIPAL_ID });
  const definition = await resolveDefinitionRaw({ repo: ledger.settingsRepo }, { namespace: "core.site", key: "timezone", workspaceId: null });
  assert.ok(definition);
  assert.equal(definition.defaultValue, "UTC");
});

test("an owner-set workspace zone wins over the creation zone", async () => {
  const ledger = await makeLedger();
  await ownerSet(ledger, "ws-1", "Asia/Tokyo");
  assert.equal(await resolveSiteTimeZone({ settingsRepo: ledger.settingsRepo, creationTimeZone: creationZone("America/Los_Angeles") }, { workspaceId: "ws-1" }), "Asia/Tokyo");
});

test("an owner's explicit UTC also wins over the creation zone", async () => {
  const ledger = await makeLedger();
  await ownerSet(ledger, "ws-1", "UTC");
  assert.equal(await resolveSiteTimeZone({ settingsRepo: ledger.settingsRepo, creationTimeZone: creationZone("Asia/Tokyo") }, { workspaceId: "ws-1" }), "UTC");
});

test("without an owner value, the zone detected at site creation applies, else UTC", async () => {
  const ledger = await makeLedger();
  assert.equal(await resolveSiteTimeZone({ settingsRepo: ledger.settingsRepo, creationTimeZone: creationZone("America/Los_Angeles") }, { workspaceId: "ws-1" }), "America/Los_Angeles");
  assert.equal(await resolveSiteTimeZone({ settingsRepo: ledger.settingsRepo, creationTimeZone: creationZone(undefined) }, { workspaceId: "ws-1" }), "UTC");
  assert.equal(await resolveSiteTimeZone({ settingsRepo: ledger.settingsRepo }, { workspaceId: "ws-1" }), "UTC");
});

test("an invalid owner value falls through to the creation zone; an invalid creation zone falls to UTC", async () => {
  const ledger = await makeLedger();
  await ownerSet(ledger, "ws-1", "Not/A_Zone");
  assert.equal(await resolveSiteTimeZone({ settingsRepo: ledger.settingsRepo, creationTimeZone: creationZone("Asia/Tokyo") }, { workspaceId: "ws-1" }), "Asia/Tokyo");
  assert.equal(await resolveSiteTimeZone({ settingsRepo: ledger.settingsRepo, creationTimeZone: creationZone("Mars/Base") }, { workspaceId: "ws-1" }), "UTC");
});

test("an unregistered definition or a failing settings read never throws: the creation zone, else UTC", async () => {
  const unregistered = await makeLedger({ register: false });
  assert.equal(await resolveSiteTimeZone({ settingsRepo: unregistered.settingsRepo, creationTimeZone: creationZone("Asia/Tokyo") }, { workspaceId: "ws-1" }), "Asia/Tokyo");
  const failing = new Proxy({} as SettingsRepoPort, { get: () => async () => { throw new Error("settings db down"); } });
  const errors: unknown[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    assert.equal(await resolveSiteTimeZone({ settingsRepo: failing, creationTimeZone: creationZone("Asia/Tokyo") }, { workspaceId: "ws-1" }), "Asia/Tokyo");
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.length, 1);
});

test("createSiteTimeZonePort binds the resolver to its deps for the render ports", async () => {
  const ledger = await makeLedger();
  await ownerSet(ledger, "ws-2", "Asia/Tokyo");
  const port = createSiteTimeZonePort({ settingsRepo: ledger.settingsRepo, creationTimeZone: creationZone("America/Los_Angeles") });
  assert.equal(await port.resolveTimeZone({ workspaceId: "ws-2" }), "Asia/Tokyo");
  assert.equal(await port.resolveTimeZone({ workspaceId: "ws-3" }), "America/Los_Angeles");
});
