import assert from "node:assert/strict";
import test from "node:test";

import { defaultMailProviderSetup, parseMailProviderSetup, parseMailProviderSetupProperty } from "../../mail-provider-setup.js";
import { parseMailAdaptersFile } from "../../mail-adapter-registry.js";

/**
 * @file Declarative mail provider setup metadata (email phase 2): a plugin's `setup` block is
 * validated field by field, a secret can never be plain text or carry a default, and undeclared
 * credential keys keep a plain default field.
 */

const AT = "adapters[0]";

test("default setup: one plain field per credential key, plus the always-stored baseUrl", () => {
  assert.deepEqual(defaultMailProviderSetup({ credentialKeys: ["token"] }).fields.map((f) => [f.key, f.type, f.label]), [["token", "secret", "API key"], ["baseUrl", "url", "API base URL"]]);
  assert.deepEqual(defaultMailProviderSetup({ credentialKeys: ["baseUrl", "username", "region"] }).fields.map((f) => [f.key, f.type]), [["baseUrl", "url"], ["username", "text"], ["region", "text"]]);
});

test("a declared setup keeps its order and help links and appends the undeclared defaults", () => {
  const setup = parseMailProviderSetup({ at: AT, credentialKeys: ["token", "username"], value: {
    helpUrl: "https://example.test/keys",
    fields: [
      { key: "baseUrl", label: " Server ", type: "url", defaultValue: "https://smtp.example.test:587", placeholder: "https://host:port", help: "Your server", helpUrl: "https://example.test/smtp" },
      { key: "token", label: "Password", type: "secret", required: false },
    ],
  } });
  assert.deepEqual(setup, { helpUrl: "https://example.test/keys", fields: [
    { key: "baseUrl", label: "Server", type: "url", required: true, defaultValue: "https://smtp.example.test:587", placeholder: "https://host:port", help: "Your server", helpUrl: "https://example.test/smtp" },
    { key: "token", label: "Password", type: "secret", required: false },
    { key: "username", label: "Username", type: "text", required: true },
  ] });
  assert.deepEqual(parseMailProviderSetup({ at: AT, credentialKeys: ["token"], value: {} }), defaultMailProviderSetup({ credentialKeys: ["token"] }));
  assert.equal(parseMailProviderSetup({ at: AT, credentialKeys: ["token"], value: undefined }), undefined);
  assert.deepEqual(parseMailProviderSetup({ at: AT, credentialKeys: ["token"], value: { fields: [{ key: "baseUrl", label: "Endpoint" }] } })!, { fields: [{ key: "baseUrl", label: "Endpoint", type: "text", required: true }, { key: "token", label: "API key", type: "secret", required: true }] });
});

test("every malformed setup names what is wrong", () => {
  const cases: [unknown, RegExp][] = [
    ["nope", /setup must be an object/],
    [{ helpUrl: "http://insecure.test" }, /setup\.helpUrl must be an https URL/],
    [{ helpUrl: 7 }, /setup\.helpUrl must be an https URL/],
    [{ helpUrl: "not a url" }, /setup\.helpUrl must be an https URL/],
    [{ fields: "x" }, /setup\.fields must be an array/],
    [{ fields: ["x"] }, /fields\[0\] must be an object/],
    [{ fields: [{ key: "apiSecret", label: "X" }] }, /fields\[0\]\.key must be one of/],
    [{ fields: [{ key: 3, label: "X" }] }, /fields\[0\]\.key must be one of/],
    [{ fields: [{ key: "token", label: "" }] }, /fields\[0\]\.label must be a non-empty string/],
    [{ fields: [{ key: "token", label: "K", type: "password" }] }, /type must be one of secret, text, url, email/],
    [{ fields: [{ key: "token", label: "K", type: "text" }] }, /the token field must be type secret/],
    [{ fields: [{ key: "token", label: "K" }] }, /the token field must be type secret/],
    [{ fields: [{ key: "baseUrl", label: "B", help: "" }] }, /fields\[0\]\.help must be a non-empty string/],
    [{ fields: [{ key: "baseUrl", label: "B", helpUrl: "ftp://x" }] }, /fields\[0\]\.helpUrl must be an https URL/],
    [{ fields: [{ key: "token", label: "K", type: "secret", defaultValue: "sk_live" }] }, /defaultValue is not allowed on a secret field/],
    [{ fields: [{ key: "baseUrl", label: "B" }, { key: "baseUrl", label: "C" }] }, /fields\[1\]\.key 'baseUrl' is declared twice/],
  ];
  for (const [value, reason] of cases) {
    const parsed = parseMailProviderSetup({ at: AT, credentialKeys: ["token"], value });
    assert.equal(typeof parsed, "string", JSON.stringify(value));
    assert.match(parsed as string, reason);
  }
});

test("the descriptor property form: {} when absent, {setup} when valid, the reason otherwise", () => {
  assert.deepEqual(parseMailProviderSetupProperty({ at: AT, credentialKeys: ["token"], value: undefined }), {});
  assert.deepEqual(parseMailProviderSetupProperty({ at: AT, credentialKeys: ["token"], value: {} }), { setup: defaultMailProviderSetup({ credentialKeys: ["token"] }) });
  assert.match(parseMailProviderSetupProperty({ at: AT, credentialKeys: ["token"], value: 1 }) as string, /must be an object/);
});

test("tovu-mail-adapters.json v2 carries setup through, and a bad setup refuses the file", () => {
  const entry = { id: "acme", label: "Acme", module: "a.mjs", credentialKeys: ["token"], feedback: false };
  const ok = parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [{ ...entry, setup: { helpUrl: "https://acme.test/keys" } }] }));
  assert.ok(ok.ok);
  assert.equal(ok.descriptors[0]!.setup!.helpUrl, "https://acme.test/keys");
  const absent = parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [entry] }));
  assert.ok(absent.ok);
  assert.equal("setup" in absent.descriptors[0]!, false);
  const bad = parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [{ ...entry, setup: { fields: [{ key: "token", label: "K", type: "text" }] } }] }));
  assert.deepEqual(bad, { ok: false, reason: "adapters[0].setup.fields[0]: the token field must be type secret" });
});

test("setup rejects null/array boundaries and non-string or oversized field text exactly", () => {
  const parse = (value: unknown) => parseMailProviderSetup({ at: AT, credentialKeys: ["token"], value });
  for (const value of [null, []]) assert.equal(parse(value), "adapters[0].setup must be an object");
  for (const entry of [null, []]) assert.equal(parse({ fields: [entry] }), "adapters[0].setup.fields[0] must be an object");
  for (const label of [7, null, "x".repeat(501)]) assert.equal(parse({ fields: [{ key: "baseUrl", label }] }), "adapters[0].setup.fields[0].label must be a non-empty string");
  for (const key of ["defaultValue", "placeholder", "help"]) assert.equal(parse({ fields: [{ key: "baseUrl", label: "Endpoint", [key]: "x".repeat(501) }] }), `adapters[0].setup.fields[0].${key} must be a non-empty string`);
});

test("v2 preserves the credential card and setup together under an explicit or default saved label", () => {
  const credentialCard = { title: "Connect Acme", baseUrl: "https://api.acme.test", helpUrl: "https://acme.test/keys", keyHint: "Sending access" };
  const setup = { fields: [{ key: "baseUrl", label: "Endpoint", type: "url", defaultValue: "https://api.acme.test" }] };
  const entry = { id: "acme", label: "Acme", module: "a.mjs", credentialKeys: ["token"], feedback: false, credentialCard, setup };
  for (const credentialLabel of [undefined, "Acme sending key"]) {
    const parsed = parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [{ ...entry, credentialLabel }] }));
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.descriptors[0], {
      schemaVersion: 2, id: "acme", label: "Acme", module: "a.mjs", credentialKeys: ["token"], feedback: false,
      credentialLabel: credentialLabel ?? "Tovu Mail — Acme API", credentialCard,
      setup: { fields: [
        { key: "baseUrl", label: "Endpoint", type: "url", required: true, defaultValue: "https://api.acme.test" },
        { key: "token", label: "API key", type: "secret", required: true },
      ] },
    });
  }
});

test("a bad card keeps its refusal and valid setup; a bad setup still refuses a valid card's descriptor", () => {
  const entry = { id: "acme", label: "Acme", module: "a.mjs", credentialKeys: ["token"], feedback: false };
  const parsed = parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [{ ...entry,
    credentialCard: { title: "Connect", baseUrl: "http://api.acme.test" }, setup: {},
  }] }));
  assert.ok(parsed.ok);
  assert.equal(parsed.descriptors[0]!.credentialCard, undefined);
  assert.equal(parsed.descriptors[0]!.credentialCardRefusal, "adapters[0].credentialCard.baseUrl must be an https URL");
  assert.deepEqual(parsed.descriptors[0]!.setup, defaultMailProviderSetup({ credentialKeys: ["token"] }));
  assert.deepEqual(parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [{ ...entry,
    credentialCard: { title: "Connect", baseUrl: "https://api.acme.test" },
    setup: { fields: [{ key: "token", label: "Key", type: "text" }] },
  }] })), { ok: false, reason: "adapters[0].setup.fields[0]: the token field must be type secret" });
});
