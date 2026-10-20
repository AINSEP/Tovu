import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { getEffective, InMemorySettingsRepo, ValueValidationFailedError, type AuthorizeFn } from "@jini-ai/core/settings";

import { createSettingsPrincipalLookup } from "../index.js";
import { ensureFormDeliverySettings, parseFormDeliveryBindings, readFormDeliveryBindings, writeFormDeliveryBindings } from "../form-delivery.js";

/**
 * @file Phase-A security pins for `core.forms/deliveryBindings`: config never carries a secret
 * (by key name or by value shape), binding ids are unique (a duplicate would abort the whole
 * delivery plan on the job index), the size caps hold, refusals never echo a config value, and the
 * validating write refuses before the ledger is touched.
 */

// Built at runtime so no secret-shaped literal is committed.
const JWT_LIKE = ["eyJ" + "hbGciOiJIUzI1NiJ9", "eyJ" + "zdWIiOiIxIn0", "sig"].join(".");
const BEARER_LIKE = "Bear" + "er " + "x".repeat(24);
const PEM_LIKE = "-----BEGIN " + "RSA PRIVATE KEY-----\nabc";

function binding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { bindingId: "sheet-a", adapterId: "sheets", connectionRef: "conn-1", enabled: true, config: { sheet: "Leads" }, ...overrides };
}

function refusal(value: unknown): ValueValidationFailedError {
  try {
    parseFormDeliveryBindings({ value });
  } catch (error) {
    assert.ok(error instanceof ValueValidationFailedError, `expected ValueValidationFailedError, got ${String(error)}`);
    return error;
  }
  assert.fail("expected the bindings to be refused");
}

test("a config key named like a secret is refused at any depth, naming the field and the fix", () => {
  for (const config of [{ token: "a" }, { client_secret: "a" }, { Password: "a" }, { apiKey: "a" }, { headers: { "X-API-Key": "a" } }, { list: [{ accessToken: "a" }] }]) {
    const error = refusal([binding({ config })]);
    assert.match(error.message, /^Form delivery bindings \(core\.forms\.deliveryBindings\) binding 1: "config\.[^"]+" is named like a secret\. Save the secret as a connection/);
  }
});

test("a credential-shaped value under an innocent key is refused without repeating the value", () => {
  for (const secret of [BEARER_LIKE, JWT_LIKE, PEM_LIKE]) {
    const error = refusal([binding({ config: { header: { value: secret } } })]);
    assert.equal(error.message, 'Form delivery bindings (core.forms.deliveryBindings) binding 1: "config.header.value" holds a value that looks like a credential. Save the secret as a connection and point to it with connectionRef; config holds non-secret settings only.');
  }
});

test("a secret smuggled as an extra top-level binding field is refused, not silently dropped", () => {
  const error = refusal([binding({ token: "a" })]);
  assert.match(error.message, /^Form delivery bindings \(core\.forms\.deliveryBindings\) binding 1 has unknown field "token"; allowed fields are /);
});

test("a repeated bindingId is refused, since the job index would abort the whole delivery plan", () => {
  const error = refusal([binding(), binding({ adapterId: "tables" })]);
  assert.equal(error.message, 'Form delivery bindings (core.forms.deliveryBindings) binding 2 repeats bindingId "sheet-a"; give every binding its own id.');
});

test("at most 100 bindings are accepted", () => {
  const list = (count: number) => Array.from({ length: count }, (_, index) => binding({ bindingId: `b${index}` }));
  assert.equal(parseFormDeliveryBindings({ value: list(100) }).length, 100);
  assert.equal(refusal(list(101)).message, "Form delivery bindings (core.forms.deliveryBindings) has 101 bindings; at most 100 are allowed. Remove some, then save again.");
});

test("at most 1000 formIds per binding are accepted", () => {
  const formIds = (count: number) => Array.from({ length: count }, (_, index) => `form-${index}`);
  assert.equal(parseFormDeliveryBindings({ value: [binding({ formIds: formIds(1000) })] })[0]?.formIds?.length, 1000);
  assert.match(refusal([binding({ formIds: formIds(1001) })]).message, /binding 1: formIds has 1001 entries; at most 1000 are allowed/);
});

test("the validating write refuses a secret-carrying list before the ledger is touched", async () => {
  const workspaceId = "ws-form-delivery";
  const clock = { nowIso: () => "2026-10-20T00:00:00.000Z", nowMs: () => Date.parse("2026-10-20T00:00:00.000Z") };
  let next = 0;
  const ids = { newId: () => `form-delivery-id-${(next += 1)}` };
  const settingsRepo = new InMemorySettingsRepo();
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  await ensureFormDeliverySettings({ deps: { settingsRepo, clock, ids, principals }, systemPrincipalId: "system" });
  let authorizeCalls = 0;
  const authorize: AuthorizeFn = async () => { authorizeCalls += 1; return { allowed: true, reason: "test" }; };
  const deps = { repo: settingsRepo, clock, ids, authorize, principals };

  await assert.rejects(
    writeFormDeliveryBindings({ deps, workspaceId, callerPrincipalId: "owner", value: [binding({ config: { apiKey: "a" } })] }),
    (error: unknown) => error instanceof ValueValidationFailedError && /"config\.apiKey" is named like a secret/.test(error.message),
  );
  assert.equal(authorizeCalls, 0, "refused before the settings chokepoint ran");
  const stored = await getEffective({ repo: settingsRepo }, { namespace: "core.forms", key: "deliveryBindings", scopeContext: { workspaceId } });
  assert.deepEqual(stored?.value, [], "the ledger still holds the default");
  assert.deepEqual(await readFormDeliveryBindings({ settingsRepo, workspaceId }), []);
});
