import assert from "node:assert/strict";
import test from "node:test";

import { InMemorySettingsRepo, type SettingsRepoPort } from "@jini-ai/core/settings";

import { createTelemetryConsent, TELEMETRY_CONSENT } from "../telemetry-consent.js";

/** @file The operator's telemetry consent over a real in-memory settings repo (no network). */

const T0 = "2026-10-25T00:00:00.000Z";
const WORKSPACE = "workspace-1";

async function repoWith({ value }: { value?: unknown }): Promise<InMemorySettingsRepo> {
  const repo = new InMemorySettingsRepo();
  await repo.saveDefinition({ settingId: "s-telemetry", version: 1, workspaceId: null, ...TELEMETRY_CONSENT, ownerKind: "core", ownerId: null,
    schema: { type: "boolean" }, defaultValue: false, scopes: 2, secret: false, status: "active", aliasOfNamespace: null, aliasOfKey: null, coercionTag: null, createdAt: T0, updatedAt: T0 });
  if (value !== undefined) await repo.saveWorkspaceValue(record({ value }));
  return repo;
}

const record = ({ value }: { value: unknown }) => ({ settingId: "s-telemetry", scope: "workspace" as const, workspaceId: WORKSPACE, principalId: null,
  valueJson: value as never, state: "set" as const, defVersion: 1, seq: 1, updatedBy: "owner", updatedAt: T0, originPluginId: null });

test("only an explicit true allows sending; unset, false and a non-boolean mean no", async () => {
  for (const [value, allowed] of [[undefined, false], [false, false], [true, true], ["true", false], [1, false]] as const) {
    const { consent } = createTelemetryConsent({ settingsRepo: await repoWith(value === undefined ? {} : { value }), workspaceId: WORKSPACE });
    assert.equal(await consent({ userId: "p-1" }), allowed, `value ${String(value)}`);
  }
});

test("a settings read error rejects (the guard treats a rejected consent as no)", async () => {
  const repo = await repoWith({ value: true });
  repo.findActiveDefinition = async () => { throw new Error("db down"); };
  const { consent } = createTelemetryConsent({ settingsRepo: repo, workspaceId: WORKSPACE });
  await assert.rejects(Promise.resolve(consent({ userId: "p-1" })), { message: "db down" });
});

test("the revision changes before and after every value write, so an in-flight approval is invalidated", async () => {
  const repo = await repoWith({ value: true });
  const { consentRevision } = createTelemetryConsent({ settingsRepo: repo, workspaceId: WORKSPACE });
  const start = consentRevision({ userId: "p-1" });
  const pending = repo.saveWorkspaceValue(record({ value: false }));
  const during = consentRevision({ userId: "p-1" });
  await pending;
  const after = consentRevision({ userId: "p-1" });
  assert.notEqual(during, start);
  assert.notEqual(after, during);
  for (const method of ["saveGlobalValue", "saveUserValue"] as const) {
    const before = consentRevision({ userId: "p-1" });
    await (repo as SettingsRepoPort)[method]({ ...record({ value: true }), scope: method === "saveGlobalValue" ? "global" : "user", workspaceId: method === "saveGlobalValue" ? null : WORKSPACE, principalId: method === "saveUserValue" ? "p-1" : null });
    assert.notEqual(consentRevision({ userId: "p-1" }), before, method);
  }
});

test("a failed write still advances the revision and rethrows", async () => {
  const repo = await repoWith({});
  repo.saveWorkspaceValue = async () => { throw new Error("disk full"); };
  const { consentRevision } = createTelemetryConsent({ settingsRepo: repo, workspaceId: WORKSPACE });
  const before = consentRevision({ userId: "p-1" });
  await assert.rejects(repo.saveWorkspaceValue(record({ value: true })), { message: "disk full" });
  assert.equal(consentRevision({ userId: "p-1" }), Number(before) + 2);
});
