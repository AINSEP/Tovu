import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { getEffective, InMemorySettingsRepo, set as packageSet, ValueValidationFailedError, type AuthorizeFn, type SetValueRequired } from "@jini-ai/core/settings";

import { createSettingsPrincipalLookup, set } from "../index.js";
import { enforceFormDeliveryBindingsWrite, ensureFormDeliverySettings, parseFormDeliveryBindings, readFormDeliveryBindings, readFormsAutoPull } from "../form-delivery.js";

/**
 * @file Unit tests for the two form delivery settings: their registered defaults, the fresh reads
 * planning and the pull triggers make, the write chokepoint's pass-through for every other setting,
 * and the structural rules of `parseFormDeliveryBindings` (the secret-shape rules are pinned in
 * `form-delivery.security.test.ts`).
 */

const PREFIX = "Form delivery bindings (core.forms.deliveryBindings) ";
const WS = "ws-form-delivery-unit";

function binding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { bindingId: "sheet-a", adapterId: "sheets", connectionRef: "conn-1", enabled: true, config: { sheet: "Leads" }, ...overrides };
}

function refusal(value: unknown): string {
  try {
    parseFormDeliveryBindings({ value });
  } catch (error) {
    assert.ok(error instanceof ValueValidationFailedError, `expected ValueValidationFailedError, got ${String(error)}`);
    return error.message;
  }
  assert.fail("expected the bindings to be refused");
}

/** A settings ledger with an allow-all authorizer; `register: false` leaves both definitions out. */
async function ledger({ register = true }: { register?: boolean } = {}) {
  const clock = { nowIso: () => "2026-10-20T00:00:00.000Z", nowMs: () => Date.parse("2026-10-20T00:00:00.000Z") };
  let next = 0;
  const ids = { newId: () => `form-delivery-unit-${(next += 1)}` };
  const settingsRepo = new InMemorySettingsRepo();
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  const ensureDeps = { settingsRepo, clock, ids, principals };
  if (register) await ensureFormDeliverySettings({ deps: ensureDeps, systemPrincipalId: "system" });
  const authorize: AuthorizeFn = async () => ({ allowed: true, reason: "test" });
  const deps: SetValueRequired["deps"] = { repo: settingsRepo, clock, ids, authorize, principals };
  const write = (key: string, value: SetValueRequired["input"]["value"]) =>
    set({ deps, input: { namespace: "core.forms", key, scope: "workspace", workspaceId: WS, callerPrincipalId: "owner", value } });
  return { settingsRepo, deps, ensureDeps, write };
}

// ---- registered defaults and fresh reads ----

test("ensureFormDeliverySettings registers deliveryBindings defaulting to no bindings and autoPull defaulting to on", async () => {
  const { settingsRepo } = await ledger();
  const read = (key: string) => getEffective({ repo: settingsRepo }, { namespace: "core.forms", key, scopeContext: { workspaceId: WS } });
  assert.deepEqual((await read("deliveryBindings"))?.value, []);
  assert.equal((await read("autoPull"))?.value, true);
});

test("registering again keeps an owner's stored values", async () => {
  const { settingsRepo, ensureDeps, write } = await ledger();
  await write("autoPull", false);
  await write("deliveryBindings", [binding()]);
  await ensureFormDeliverySettings({ deps: ensureDeps, systemPrincipalId: "system" });
  assert.equal(await readFormsAutoPull({ settingsRepo, workspaceId: WS }), false);
  assert.deepEqual(await readFormDeliveryBindings({ settingsRepo, workspaceId: WS }), [binding()]);
});

test("automatic pull reads as on when the definition was never registered", async () => {
  const { settingsRepo } = await ledger({ register: false });
  assert.equal(await readFormsAutoPull({ settingsRepo, workspaceId: WS }), true);
});

test("automatic pull reads the stored value fresh on every call", async () => {
  const { settingsRepo, write } = await ledger();
  assert.equal(await readFormsAutoPull({ settingsRepo, workspaceId: WS }), true);
  await write("autoPull", false);
  assert.equal(await readFormsAutoPull({ settingsRepo, workspaceId: WS }), false);
  await write("autoPull", true);
  assert.equal(await readFormsAutoPull({ settingsRepo, workspaceId: WS }), true);
});

test("delivery bindings read as none when the definition was never registered", async () => {
  const { settingsRepo } = await ledger({ register: false });
  assert.deepEqual(await readFormDeliveryBindings({ settingsRepo, workspaceId: WS }), []);
});

test("a valid list written through the host chokepoint is stored as written and read back parsed", async () => {
  const { settingsRepo, write } = await ledger();
  const list = [binding(), binding({ bindingId: "rows-b", adapterId: "rows", enabled: false, formIds: ["form-1"], config: { table: "t", columns: [1, true, null] } })];
  const saved = await write("deliveryBindings", list);
  assert.deepEqual(saved.value, list);
  assert.deepEqual(await readFormDeliveryBindings({ settingsRepo, workspaceId: WS }), list);
});

test("a stored list that breaks a rule (written past the host chokepoint) is refused when read for planning", async () => {
  const { settingsRepo, deps } = await ledger();
  // The package's own `set` skips the host rules; planning still refuses what it reads.
  await packageSet({ deps, input: { namespace: "core.forms", key: "deliveryBindings", scope: "workspace", workspaceId: WS, callerPrincipalId: "owner", value: [binding(), binding()] } });
  await assert.rejects(readFormDeliveryBindings({ settingsRepo, workspaceId: WS }),
    (error: unknown) => error instanceof ValueValidationFailedError && error.message === `${PREFIX}binding 2 repeats bindingId "sheet-a"; give every binding its own id.`);
});

// ---- the write chokepoint ----

test("enforceFormDeliveryBindingsWrite returns any other setting's input untouched, even a list a binding parser would refuse", () => {
  for (const [namespace, key] of [["core.forms", "autoPull"], ["core.forms", "receiver"], ["other.feature", "deliveryBindings"], ["core.site", "title"]] as const) {
    const input: SetValueRequired["input"] = { namespace, key, scope: "workspace", workspaceId: WS, callerPrincipalId: "owner", value: [{ token: "x" }] };
    assert.equal(enforceFormDeliveryBindingsWrite(input), input, `${namespace}.${key}`);
  }
});

test("enforceFormDeliveryBindingsWrite returns a valid bindings write as the same input, value not rewritten", () => {
  const input: SetValueRequired["input"] = { namespace: "core.forms", key: "deliveryBindings", scope: "workspace", workspaceId: WS, callerPrincipalId: "owner", value: [binding()] };
  assert.equal(enforceFormDeliveryBindingsWrite(input), input);
  assert.deepEqual(input.value, [binding()]);
});

test("enforceFormDeliveryBindingsWrite refuses an invalid bindings write with the parser's message", () => {
  const input: SetValueRequired["input"] = { namespace: "core.forms", key: "deliveryBindings", scope: "workspace", workspaceId: WS, callerPrincipalId: "owner", value: { not: "a list" } };
  assert.throws(() => enforceFormDeliveryBindingsWrite(input),
    (error: unknown) => error instanceof ValueValidationFailedError && error.message === `${PREFIX}must be a JSON list of bindings.`);
});

test("the host chokepoint still applies the site title rule next to the bindings rule", async () => {
  const { deps } = await ledger();
  await assert.rejects(set({ deps, input: { namespace: "core.site", key: "title", scope: "workspace", workspaceId: WS, callerPrincipalId: "owner", value: "   " } }),
    { message: "value for 'core.site.title' must be 1..200 characters after trimming" });
});

// ---- parseFormDeliveryBindings: structure ----

test("an empty list is valid and means no destinations", () => {
  assert.deepEqual(parseFormDeliveryBindings({ value: [] }), []);
});

test("a value that is not a list is refused", () => {
  for (const value of [{}, "[]", null, undefined, 3]) {
    assert.equal(refusal(value), `${PREFIX}must be a JSON list of bindings.`, JSON.stringify(value));
  }
});

test("a list entry that is not an object is refused, naming its 1-based position", () => {
  for (const entry of [null, [], "sheet-a", 1]) {
    assert.equal(refusal([binding(), entry]), `${PREFIX}binding 2 must be an object.`, JSON.stringify(entry));
  }
});

test("enabled must be a boolean", () => {
  for (const enabled of [undefined, "true", 1, null]) {
    assert.equal(refusal([binding({ enabled })]), `${PREFIX}binding 1: enabled must be true or false.`, JSON.stringify(enabled));
  }
});

test("bindingId, adapterId and connectionRef must be non-empty strings of at most 256 characters", () => {
  for (const field of ["bindingId", "adapterId", "connectionRef"]) {
    for (const value of [undefined, "", 7, "x".repeat(257)]) {
      assert.equal(refusal([binding({ [field]: value })]), `${PREFIX}binding 1: ${field} must be a non-empty string of at most 256 characters.`, `${field}=${JSON.stringify(value)}`);
    }
    assert.equal(parseFormDeliveryBindings({ value: [binding({ [field]: "x".repeat(256) })] })[0]?.[field as "bindingId"], "x".repeat(256));
  }
});

test("formIds absent means every form and is left out of the result; an empty list means none and is kept", () => {
  const [every, none] = parseFormDeliveryBindings({ value: [binding(), binding({ bindingId: "b2", formIds: [] })] });
  assert.equal(Object.hasOwn(every!, "formIds"), false);
  assert.deepEqual(none?.formIds, []);
});

test("formIds that is not a list is refused, saying to omit it for every form", () => {
  for (const formIds of ["form-1", null, { 0: "form-1" }]) {
    assert.equal(refusal([binding({ formIds })]), `${PREFIX}binding 1: formIds must be a list of form ids (omit it for every form).`, JSON.stringify(formIds));
  }
});

test("every formIds entry must be a bounded non-empty string", () => {
  for (const id of ["", 5, "f".repeat(257)]) {
    assert.equal(refusal([binding({ formIds: ["form-1", id] })]), `${PREFIX}binding 1: every formIds entry must be a non-empty string of at most 256 characters.`, JSON.stringify(id));
  }
});

test("a credential-shaped formIds entry is refused without repeating it", () => {
  const bearer = "Bear" + "er " + "y".repeat(24);
  const message = refusal([binding({ formIds: [bearer] })]);
  assert.equal(message, `${PREFIX}binding 1: "every formIds entry" holds a value that looks like a credential. Save the secret as a connection and point to it with connectionRef; config holds non-secret settings only.`);
  assert.equal(message.includes(bearer), false);
});

test("config must be an object; {} is the empty config", () => {
  for (const config of [undefined, null, [], "sheet"]) {
    assert.equal(refusal([binding({ config })]), `${PREFIX}binding 1: config must be an object (use {} when the destination needs none).`, JSON.stringify(config));
  }
  assert.deepEqual(parseFormDeliveryBindings({ value: [binding({ config: {} })] })[0]?.config, {});
});

test("a credential-shaped string inside a config list is refused at its indexed path", () => {
  const bearer = "Bear" + "er " + "z".repeat(24);
  assert.match(refusal([binding({ config: { headers: ["ok", bearer] } })]), /binding 1: "config\.headers\.1" holds a value that looks like a credential\./);
});

test("an HTTP Basic prefix whose base64 decodes without a colon is an ordinary value", () => {
  const config = { plan: "Basic " + Buffer.from("starter").toString("base64") };
  assert.deepEqual(parseFormDeliveryBindings({ value: [binding({ config })] })[0]?.config, config);
});

test("an unknown field name longer than 80 characters is quoted cut short", () => {
  const name = "n".repeat(100);
  assert.equal(refusal([binding({ [name]: 1 })]),
    `${PREFIX}binding 1 has unknown field "${"n".repeat(80)}…"; allowed fields are bindingId, adapterId, connectionRef, enabled, formIds, config.`);
});

test("the parsed config is a deep copy: later changes to the input never reach it", () => {
  const input = binding({ config: { sheet: "Leads", columns: { email: "A" } } });
  const [parsed] = parseFormDeliveryBindings({ value: [input] });
  (input.config as { columns: { email: string } }).columns.email = "Z";
  assert.deepEqual(parsed?.config, { sheet: "Leads", columns: { email: "A" } });
  assert.notEqual(parsed, input);
});

test("the first broken rule is reported for the binding where it occurs", () => {
  assert.equal(refusal([binding(), binding({ bindingId: "b2" }), binding({ bindingId: "b3", enabled: "yes" })]), `${PREFIX}binding 3: enabled must be true or false.`);
});

/** A small deterministic PRNG, so the property below replays identically on every run. */
function seeded(seed: number) {
  let state = seed;
  return () => { state = (state * 1_103_515_245 + 12_345) % 2_147_483_648; return state / 2_147_483_648; };
}

test("property: any list of well-formed bindings with non-secret config parses to an equal list", () => {
  const random = seeded(20261020);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const words = ["Leads", "sheet", "table", "row", "A1", "", "Basic tier", "https://rows.example.com/x"];
  const keys = ["sheet", "table", "range", "author", "mode", "column"];
  const leaf = () => pick<unknown>([pick(words), Math.floor(random() * 100), random() < 0.5, null]);
  for (let run = 0; run < 200; run += 1) {
    const list = Array.from({ length: Math.floor(random() * 6) }, (_, index) => {
      const config = Object.fromEntries(Array.from({ length: Math.floor(random() * 4) }, () => [pick(keys), random() < 0.3 ? { [pick(keys)]: [leaf(), leaf()] } : leaf()]));
      const formIds = random() < 0.5 ? {} : { formIds: Array.from({ length: Math.floor(random() * 3) }, (_, n) => `form-${n}`) };
      return { bindingId: `b-${index}`, adapterId: pick(["sheets", "rows"]), connectionRef: `conn-${run}`, enabled: random() < 0.5, ...formIds, config };
    });
    assert.deepEqual(parseFormDeliveryBindings({ value: list }), list, `run ${run}`);
  }
});
