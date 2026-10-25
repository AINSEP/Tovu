import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { getEffective, InMemorySettingsRepo, ValueValidationFailedError, type AuthorizeFn } from "@jini-ai/core/settings";

import { createSettingsPrincipalLookup, set } from "../index.js";
import { ensureFormDeliverySettings, parseFormDeliveryBindings, readFormDeliveryBindings } from "../form-delivery.js";
import { writeFormDeliveryBindings } from "../form-delivery-write.js";

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

test("the newer secret key names are refused: private/access keys, credential(s), auth/authorization, passphrase, pwd", () => {
  for (const config of [{ privateKey: "a" }, { private_key: "a" }, { AccessKey: "a" }, { credential: "a" }, { credentials: { id: "a" } },
    { auth: "a" }, { Authorization: "a" }, { passphrase: "a" }, { pwd: "a" }]) {
    const error = refusal([binding({ config })]);
    assert.match(error.message, /^Form delivery bindings \(core\.forms\.deliveryBindings\) binding 1: "config\.[^"]+" is named like a secret\. /, JSON.stringify(Object.keys(config)));
  }
});

test("ordinary keys that only contain a shorter word stay allowed (author, authorName)", () => {
  assert.deepEqual(parseFormDeliveryBindings({ value: [binding({ config: { author: "Ana", authorName: "Ana" } })] })[0]?.config, { author: "Ana", authorName: "Ana" });
});

// Built at runtime: an HTTP Basic value ("user:secret" in base64) and a URL carrying user:pass.
const BASIC_LIKE = "Bas" + "ic " + Buffer.from(`user:${"s".repeat(12)}`).toString("base64");
const USERINFO_URL = "https://" + "user:" + "p".repeat(12) + "@" + "rows.example.com/api";

test("an HTTP Basic credential or a URL with user:pass@ is refused as a config value", () => {
  for (const secret of [BASIC_LIKE, USERINFO_URL]) {
    const error = refusal([binding({ config: { endpoint: secret } })]);
    assert.equal(error.message, 'Form delivery bindings (core.forms.deliveryBindings) binding 1: "config.endpoint" holds a value that looks like a credential. Save the secret as a connection and point to it with connectionRef; config holds non-secret settings only.');
  }
});

test("plain words after Basic and URLs without a password stay allowed", () => {
  const config = { plan: "Basic tier", url: "https://rows.example.com/api?x=1", mail: "mailto:a@example.com" };
  assert.deepEqual(parseFormDeliveryBindings({ value: [binding({ config })] })[0]?.config, config);
});

test("bindingId, adapterId and connectionRef holding a credential-shaped value are refused without repeating it", () => {
  for (const field of ["bindingId", "adapterId", "connectionRef"]) {
    for (const secret of [BEARER_LIKE, BASIC_LIKE, USERINFO_URL, JWT_LIKE]) {
      const error = refusal([binding({ [field]: secret })]);
      assert.equal(error.message, `Form delivery bindings (core.forms.deliveryBindings) binding 1: "${field}" holds a value that looks like a credential. Save the secret as a connection and point to it with connectionRef; config holds non-secret settings only.`);
    }
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

async function ledger() {
  const clock = { nowIso: () => "2026-10-20T00:00:00.000Z", nowMs: () => Date.parse("2026-10-20T00:00:00.000Z") };
  let next = 0;
  const ids = { newId: () => `form-delivery-id-${(next += 1)}` };
  const settingsRepo = new InMemorySettingsRepo();
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  await ensureFormDeliverySettings({ deps: { settingsRepo, clock, ids, principals }, systemPrincipalId: "system" });
  const counter = { authorizeCalls: 0 };
  const authorize: AuthorizeFn = async () => { counter.authorizeCalls += 1; return { allowed: true, reason: "test" }; };
  return { settingsRepo, counter, deps: { repo: settingsRepo, clock, ids, authorize, principals } };
}

const WS = "ws-form-delivery";

test("the validating write refuses a secret-carrying list before the ledger is touched", async () => {
  const { settingsRepo, counter, deps } = await ledger();
  await assert.rejects(
    writeFormDeliveryBindings({ deps, workspaceId: WS, callerPrincipalId: "owner", value: [binding({ config: { apiKey: "a" } })] }),
    (error: unknown) => error instanceof ValueValidationFailedError && /"config\.apiKey" is named like a secret/.test(error.message),
  );
  assert.equal(counter.authorizeCalls, 0, "refused before the settings write ran");
  const stored = await getEffective({ repo: settingsRepo }, { namespace: "core.forms", key: "deliveryBindings", scopeContext: { workspaceId: WS } });
  assert.deepEqual(stored?.value, [], "the ledger still holds the default");
  assert.deepEqual(await readFormDeliveryBindings({ settingsRepo, workspaceId: WS }), []);
});

test("the host settings chokepoint (generic settings route and tools) refuses the same list", async () => {
  const { settingsRepo, counter, deps } = await ledger();
  await assert.rejects(
    set({ deps, input: { namespace: "core.forms", key: "deliveryBindings", scope: "workspace", workspaceId: WS, callerPrincipalId: "owner",
      value: [{ bindingId: "b", adapterId: "a", connectionRef: "c", enabled: true, config: { header: BEARER_LIKE } }] } }),
    (error: unknown) => error instanceof ValueValidationFailedError && /"config\.header" holds a value that looks like a credential/.test(error.message),
  );
  assert.equal(counter.authorizeCalls, 0);
  assert.deepEqual(await readFormDeliveryBindings({ settingsRepo, workspaceId: WS }), []);
});

// F6 fix wave (L7 Stryker: 12 Regex survivors in SECRET_KEY / SECRET_VALUES / BASIC_VALUE). Each
// near-miss below is allowed ONLY because a pattern is anchored or bounded; dropping that anchor
// would refuse it. Each refused case is the minimal shape that must still be caught.
const B64_USER_PASS = Buffer.from(`user:${"s".repeat(12)}`).toString("base64");
const JWT_HEAD = "eyJ" + "hbGciOiJIUzI1NiJ9";
const JWT_BODY = "eyJ" + "zdWIiOiIxIn0";

test("whole-key secret names are anchored: words merely containing auth/pwd stay allowed", () => {
  const config = { reauth: "a", authx: "a", pwdHint: "a", myPwd: "a" };
  assert.deepEqual(parseFormDeliveryBindings({ value: [binding({ config })] })[0]?.config, config);
});

for (const [label, value, refused] of [
  ["Bearer with leading spaces", "  bearer abc", true],
  ["upper-case BEARER", "BEARER abc", true],
  ["prose mentioning bearer tokens", "use bearer tokens here", false],
  ["bearer with nothing after it", "Bearer ", false],
  ["a JWT-shaped value", `${JWT_HEAD}.${JWT_BODY}.sig`, true],
  ["a JWT glued to a preceding word", `x${JWT_HEAD}.${JWT_BODY}.sig`, false],
  ["two JWT segments without the trailing dot", `${JWT_HEAD}.${JWT_BODY}`, false],
  ["a public key block", "-----BEGIN " + "PUBLIC KEY-----\nabc", false],
  ["a URL with user:pass@", "ftp://" + "u:" + "p".repeat(8) + "@files.example.com", true],
  ["a URL with only a user@", "https://user@rows.example.com/api", false],
  ["a colon-at pair in the URL path", "https://rows.example.com/a:b@c", false],
  ["Basic with trailing whitespace", `Basic ${B64_USER_PASS}  `, true],
  ["Basic followed by more words", `Basic ${B64_USER_PASS} and more`, false],
  ["Basic preceded by a word", `My Basic ${B64_USER_PASS}`, false],
] as const) {
  test(`credential-shaped value table: ${label} is ${refused ? "refused" : "allowed"}`, () => {
    const config = { note: value };
    if (refused) assert.match(refusal([binding({ config })]).message, /"config\.note" holds a value that looks like a credential\./);
    else assert.deepEqual(parseFormDeliveryBindings({ value: [binding({ config })] })[0]?.config, config);
  });
}
