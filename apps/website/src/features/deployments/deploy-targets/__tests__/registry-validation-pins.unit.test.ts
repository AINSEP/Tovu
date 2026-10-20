import assert from "node:assert/strict";
import test from "node:test";

import { parseDeployTargetsFile } from "../registry.js";

const BASE = { id: "fixture-host", label: "Fixture", module: "targets/fixture.mjs" };
const FIELD = { name: "token", label: "Token", required: true };
const CREDENTIAL = { vendorId: "fixture", fields: [FIELD] };

function parse(input: { target: unknown }, _options = {}) {
  return parseDeployTargetsFile(JSON.stringify({ schemaVersion: 1, targets: [input.target] }));
}

const descriptorCases: ReadonlyArray<readonly [unknown, string]> = [
  [null, "must be an object"],
  [[], "must be an object"],
  [{ ...BASE, id: 2 }, ".id must be a lowercase hyphenated id"],
  [{ ...BASE, id: "x".repeat(65) }, ".id must be a lowercase hyphenated id"],
  [{ ...BASE, id: "Bad_id" }, ".id must be a lowercase hyphenated id"],
  [{ ...BASE, label: " " }, ".label must be a non-empty string"],
  [{ ...BASE, label: 2 }, ".label must be a non-empty string"],
  [{ ...BASE, label: "x".repeat(101) }, ".label must be a non-empty string"],
  [{ ...BASE, module: 2 }, ".module must be a relative path ending in .mjs"],
  [{ ...BASE, module: "host.js" }, ".module must be a relative path ending in .mjs"],
  [{ ...BASE, module: "/host.mjs" }, ".module must be a relative path ending in .mjs"],
  [{ ...BASE, config: null }, ".config must be an array of at most 16 fields"],
  [{ ...BASE, env: null }, ".env must be an object"],
  [{ ...BASE, credential: null }, ".credential must be an object"],
  [{ ...BASE, projectName: null }, ".projectName.label must be a non-empty string"],
  [{ ...BASE, i18n: null }, ".i18n must map locales to translations"],
];
for (const [target, suffix] of descriptorCases) {
  const reason = `targets[0]${suffix.startsWith(".") ? "" : " "}${suffix}`;
  test(`descriptor refusal: ${reason} (${JSON.stringify(target)})`, () => {
    assert.deepEqual(parse({ target }), { ok: false, reason });
  });
}

const credentialCases: ReadonlyArray<readonly [Record<string, unknown>, string]> = [
  [{ vendorId: 3 }, "vendorId must be a lowercase hyphenated id"],
  [{ vendorId: "x".repeat(65) }, "vendorId must be a lowercase hyphenated id"],
  [{ vendorId: "Bad_id" }, "vendorId must be a lowercase hyphenated id"],
  [{ vendorLabel: " " }, "vendorLabel must be a non-empty string"],
  [{ yieldsAccountLabel: 1 }, "yieldsAccountLabel must be a boolean"],
  [{ help: 2 }, "help must be a string of at most 500 characters"],
  [{ help: "x".repeat(501) }, "help must be a string of at most 500 characters"],
  [{ userHelp: null }, "userHelp must be a string of at most 500 characters"],
  [{ userHelp: "x".repeat(501) }, "userHelp must be a string of at most 500 characters"],
  [{ tokenPageUrl: 2 }, "tokenPageUrl must be an https URL"],
  [{ tokenPageUrl: "https://example.test/" + "x".repeat(500) }, "tokenPageUrl must be an https URL"],
  [{ tokenPageUrl: "bad-url" }, "tokenPageUrl must be an https URL"],
  [{ tokenPageUrl: "http://example.test/" }, "tokenPageUrl must be an https URL"],
  [{ fields: null }, "fields must be an array of at most 16 fields"],
  [{ fields: [] }, "tokenField 'token' must name a required field"],
  [{ fields: Array.from({ length: 17 }, () => FIELD) }, "fields must be an array of at most 16 fields"],
  [{ tokenField: 2 }, "tokenField '2' must name a required field"],
  [{ tokenField: "absent" }, "tokenField 'absent' must name a required field"],
  [{ fields: [{ ...FIELD, required: false }] }, "tokenField 'token' must name a required field"],
];
for (const [patch, suffix] of credentialCases) {
  test(`credential refusal: ${suffix} (${JSON.stringify(patch)})`, () => {
    assert.deepEqual(parse({ target: { ...BASE, credential: { ...CREDENTIAL, ...patch } } }), {
      ok: false, reason: `targets[0].credential.${suffix}`,
    });
  });
}

const fieldCases: ReadonlyArray<readonly [unknown, string]> = [
  [null, " must be an object"],
  [[], " must be an object"],
  [{ ...FIELD, name: 2 }, ".name must be a camelCase identifier"],
  [{ ...FIELD, name: "Bad name" }, ".name must be a camelCase identifier"],
  [{ ...FIELD, name: "providerId" }, ".name 'providerId' is reserved"],
  [{ ...FIELD, label: " " }, ".label must be a non-empty string"],
  [{ ...FIELD, required: "yes" }, ".required must be a boolean"],
  [{ ...FIELD, secret: "yes" }, ".secret must be a boolean"],
  [{ ...FIELD, help: 3 }, ".help must be a string of at most 500 characters"],
  [{ ...FIELD, help: "x".repeat(501) }, ".help must be a string of at most 500 characters"],
  [{ ...FIELD, userHelp: 3 }, ".userHelp must be a string of at most 500 characters"],
  [{ ...FIELD, userHelp: "x".repeat(501) }, ".userHelp must be a string of at most 500 characters"],
];
for (const [field, suffix] of fieldCases) {
  test(`field refusal: ${suffix} (${JSON.stringify(field)})`, () => {
    assert.deepEqual(parse({ target: { ...BASE, credential: { ...CREDENTIAL, fields: [field] } } }), {
      ok: false, reason: `targets[0].credential.fields[0]${suffix}`,
    });
  });
}

const envCases: ReadonlyArray<readonly [unknown, string]> = [
  [null, " must be an object"],
  [{ tokenVars: "TOKEN" }, ".tokenVars must be a non-empty array of env var names"],
  [{ tokenVars: [] }, ".tokenVars must be a non-empty array of env var names"],
  [{ tokenVars: Array.from({ length: 17 }, () => "TOKEN") }, ".tokenVars must be a non-empty array of env var names"],
  [{ tokenVars: [2] }, ".tokenVars must be a non-empty array of env var names"],
  [{ tokenVars: ["lower"] }, ".tokenVars must be a non-empty array of env var names"],
  [{ tokenVars: ["TOKEN"], fields: null }, ".fields must map field names to env var names"],
  [{ tokenVars: ["TOKEN"], fields: [] }, ".fields must map field names to env var names"],
  [{ tokenVars: ["TOKEN"], fields: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`field${i}`, "TOKEN"])) }, ".fields must map field names to env var names"],
  [{ tokenVars: ["TOKEN"], fields: { "bad name": "TOKEN" } }, ".fields must map field names to env var names"],
  [{ tokenVars: ["TOKEN"], fields: { owner: "lower" } }, ".fields must map field names to env var names"],
];
for (const [env, suffix] of envCases) {
  test(`env refusal: ${suffix} (${JSON.stringify(env)})`, () => {
    assert.deepEqual(parse({ target: { ...BASE, env } }), { ok: false, reason: `targets[0].env${suffix}` });
  });
}

test("descriptor defaults omit optional keys and ignore unknown keys", () => {
  assert.deepEqual(parse({ target: { ...BASE, unknown: true } }), { ok: true, descriptors: [{ ...BASE, configFields: [] }] });
});

test("optional metadata retains empty and boundary-length help, and normalizes flags", () => {
  const config = [{ name: "owner", label: " Owner ", required: false, secret: false, help: "", userHelp: "x".repeat(500) }];
  const credential = { ...CREDENTIAL, vendorLabel: "Vendor", yieldsAccountLabel: true, help: "x".repeat(500), userHelp: "", tokenPageUrl: "https://example.test/", fields: [{ ...FIELD, secret: true, help: "", userHelp: "hint" }] };
  const env = { tokenVars: ["TOKEN", "TOKEN"], fields: { owner: "OWNER" } };
  const projectName = { label: "Release", help: "" };
  const i18n = { es: { Release: "Publicación" } };
  assert.deepEqual(parse({ target: { ...BASE, config, credential, env, projectName, i18n } }), {
    ok: true, descriptors: [{ ...BASE, configFields: [{ name: "owner", label: " Owner ", required: false, help: "", userHelp: "x".repeat(500) }], credential: { ...credential, tokenField: "token" }, env, projectName, i18n }],
  });
});

test("false account-label and secret flags are omitted; an explicit alternate token field is retained", () => {
  assert.deepEqual(parse({ target: { ...BASE, credential: { vendorId: "fixture", yieldsAccountLabel: false, tokenField: "key", fields: [{ name: "key", label: "Key", required: true, secret: false }] }, env: { tokenVars: ["TOKEN"] } } }), {
    ok: true, descriptors: [{ ...BASE, configFields: [], credential: { vendorId: "fixture", tokenField: "key", fields: [{ name: "key", label: "Key", required: true }] }, env: { tokenVars: ["TOKEN"] } }],
  });
  assert.deepEqual(parse({ target: { ...BASE, env: { tokenVars: ["TOKEN"], fields: {} } } }), {
    ok: true, descriptors: [{ ...BASE, configFields: [], env: { tokenVars: ["TOKEN"], fields: {} } }],
  });
});

test("validation keeps the first refusal across descriptor blocks and credential details", () => {
  const cases = [
    [{ config: null, env: null }, "config must be an array of at most 16 fields"],
    [{ env: null, credential: null }, "env must be an object"],
    [{ credential: null, projectName: null }, "credential must be an object"],
    [{ projectName: null, i18n: null }, "projectName.label must be a non-empty string"],
    [{ credential: { ...CREDENTIAL, help: 2, userHelp: 2, tokenPageUrl: 2 } }, "credential.help must be a string of at most 500 characters"],
    [{ credential: { ...CREDENTIAL, tokenPageUrl: 2, fields: null } }, "credential.tokenPageUrl must be an https URL"],
    [{ credential: { ...CREDENTIAL, fields: null, tokenField: 2 } }, "credential.fields must be an array of at most 16 fields"],
  ] as const;
  for (const [patch, suffix] of cases) {
    assert.deepEqual(parse({ target: { ...BASE, ...patch } }), { ok: false, reason: `targets[0].${suffix}` });
  }
});

test("credential token field need not be secret (reported, not fixed)", () => {
  assert.deepEqual(parse({ target: { ...BASE, credential: CREDENTIAL } }), {
    ok: true, descriptors: [{ ...BASE, configFields: [], credential: { ...CREDENTIAL, tokenField: "token" } }],
  });
});
