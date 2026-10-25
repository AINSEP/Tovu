import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPluginContributionLoader } from "@jini-ai/agent-plugins/lifecycle";
import { loadBundledLoginProviders, loadLoginProviders, parseLoginProviders } from "../providers.js";
import { provider } from "./fixtures.js";

const sourceRoot = fileURLToPath(new URL("../../../../../../content/agent-plugins/", import.meta.url));
const file = (value = provider) => JSON.stringify({ schemaVersion: 1, providers: [value] });

function installed(raw: string, pluginId = "google-login") {
  return createPluginContributionLoader({
    findPackages: async input => {
      assert.equal(input.requireActive, true, "login data must explicitly require activation");
      return [{ trusted: { pluginId, packageRoot: "/unused" } }];
    },
    readFile: async () => raw,
    importModule: async () => { throw new Error("data contributions must never execute plugin code"); },
  }).loadPluginContributions;
}

test("bundled preset admits the active, unchanged installed contribution", async () => {
  const pins = await loadBundledLoginProviders({ sourceRoot });
  const google = pins.find(pin => pin.id === "google");
  assert.ok(google);
  const loaded = await loadLoginProviders({ workspaceId: "ws", bundledProviders: pins, loadContributions: installed(file(google)) });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].issuer, "https://accounts.google.com");
});
test("a non-bundled plugin is ignored even if it copies the shipped provider", async () => {
  const pins = await loadBundledLoginProviders({ sourceRoot });
  assert.deepEqual(await loadLoginProviders({ workspaceId: "ws", bundledProviders: pins,
    loadContributions: installed(file(provider), "rogue") }), []);
});
for (const field of ["issuer", "jwksUri", "authorizationEndpoint", "tokenEndpoint"] as const) {
  test(`bundled id cannot replace pinned ${field}`, async () => {
    const pins = await loadBundledLoginProviders({ sourceRoot });
    assert.deepEqual(await loadLoginProviders({ workspaceId: "ws", bundledProviders: pins,
      loadContributions: installed(file({ ...provider, [field]: "https://attacker.example" })) }), []);
  });
}
test("disabled package contributes no provider", async () => {
  const loader = createPluginContributionLoader({ findPackages: async () => [], readFile: async () => file(), importModule: async () => ({ exported: null }) });
  assert.deepEqual(await loadLoginProviders({ workspaceId: "ws", bundledProviders: [provider], loadContributions: loader.loadPluginContributions }), []);
});
test("duplicate provider ids are refused in full", async () => {
  const pins = await loadBundledLoginProviders({ sourceRoot });
  const pin = pins.find(row => row.id === "google")!;
  assert.deepEqual(await loadLoginProviders({ workspaceId: "ws", bundledProviders: pins,
    loadContributions: installed(JSON.stringify({ schemaVersion: 1, providers: [pin, pin] })) }), []);
});
for (const invalid of [{ pkce: "plain" }, { signingAlgorithm: "HS256" }, { clientAuthentication: "none" },
  { scopes: ["openid", "email", "offline_access"] }, { jwksUri: "http://attacker.example" }]) {
  test(`invalid preset rejected: ${Object.keys(invalid)[0]}`, () => {
    assert.equal(parseLoginProviders({ raw: file({ ...provider, ...invalid } as typeof provider) }).ok, false);
  });
}

// --- F6 fix wave (L7 Stryker: 70 survivors; every validator only saw the happy path). One case per
// limit/anchor, each at its edge, asserting the fixed refusal reason. ---
const { pluginId: _pluginId, configurationVersion: _version, ...base } = provider;
const parse = (raw: string) => parseLoginProviders({ raw });
const one = (overrides: Record<string, unknown>) => parse(JSON.stringify({ schemaVersion: 1, providers: [{ ...base, ...overrides }] }));
const REFUSED = { ok: false, reason: "LOGIN_PROVIDER_INVALID" };

for (const [label, overrides, accepted] of [
  ["one-letter id", { id: "a" }, true], ["64-char id", { id: `a${"b".repeat(63)}` }, true], ["65-char id", { id: `a${"b".repeat(64)}` }, false],
  ["id starting with a digit", { id: "1google" }, false], ["upper-case id", { id: "Google" }, false], ["id with underscore", { id: "goo_gle" }, false],
  ["id with trailing newline", { id: "google\n" }, false], ["id with leading junk", { id: " google" }, false],
  ["2048-char label", { label: "l".repeat(2048) }, true], ["2049-char label", { label: "l".repeat(2049) }, false],
  ["blank label", { label: "   " }, false], ["empty label", { label: "" }, false], ["numeric label", { label: 7 }, false],
  ["issuer with user:pass", { issuer: "https://u:p@accounts.example" }, false], ["issuer with only a user", { issuer: "https://u@accounts.example" }, false],
  ["issuer with only a password", { issuer: "https://:p@accounts.example" }, false], ["issuer with a fragment", { issuer: "https://accounts.example/#x" }, false],
  ["16 email domains", { authoritativeEmailDomains: Array.from({ length: 16 }, (_, i) => `d${i}.example`) }, true],
  ["17 email domains", { authoritativeEmailDomains: Array.from({ length: 17 }, (_, i) => `d${i}.example`) }, false],
  ["no email domains", { authoritativeEmailDomains: [] }, true], ["email domains as a string", { authoritativeEmailDomains: "gmail.com" }, false],
  ["upper-case domain", { authoritativeEmailDomains: ["Gmail.com"] }, false], ["domain without a TLD", { authoritativeEmailDomains: ["gmail"] }, false],
  ["one-letter TLD", { authoritativeEmailDomains: ["gmail.c"] }, false], ["hyphen-led label", { authoritativeEmailDomains: ["-gmail.com"] }, false],
  ["hyphen-ended label", { authoritativeEmailDomains: ["gmail-.com"] }, false], ["domain with trailing junk", { authoritativeEmailDomains: ["gmail.com x"] }, false],
  ["domain with leading junk", { authoritativeEmailDomains: ["x gmail.com"] }, false], ["non-string domain", { authoritativeEmailDomains: [1] }, false],
  ["a valid second domain after an invalid one", { authoritativeEmailDomains: ["bad domain", "gmail.com"] }, false],
  ["hosted-domain claim hd", { hostedDomainClaim: "hd" }, true], ["64-char claim", { hostedDomainClaim: `h${"d".repeat(63)}` }, true],
  ["65-char claim", { hostedDomainClaim: `h${"d".repeat(64)}` }, false], ["upper-case claim", { hostedDomainClaim: "Hd" }, false],
  ["digit-led claim", { hostedDomainClaim: "1hd" }, false], ["claim with trailing junk", { hostedDomainClaim: "hd-x" }, false],
  ["empty claim", { hostedDomainClaim: "" }, false],
  ["reordered scopes", { scopes: ["profile", "openid", "email"] }, true], ["two scopes", { scopes: ["openid", "email"] }, false],
  ["four scopes", { scopes: ["openid", "email", "profile", "openid"] }, false], ["duplicate scopes", { scopes: ["openid", "openid", "email"] }, false],
  ["scopes as a string", { scopes: "openid email profile" }, false],
] as const) {
  test(`provider preset validation: ${label} is ${accepted ? "accepted" : "refused"}`, () => {
    const parsed = one(overrides);
    if (accepted) assert.equal(parsed.ok, true, JSON.stringify(parsed));
    else assert.deepEqual(parsed, REFUSED);
  });
}

test("the preset file envelope: schema version, providers array, eight-provider and 32 KiB caps", () => {
  const providers = (count: number) => Array.from({ length: count }, (_, i) => ({ ...base, id: `p${i}` }));
  assert.equal(parse(JSON.stringify({ schemaVersion: 1, providers: providers(8) })).ok, true);
  assert.deepEqual(parse(JSON.stringify({ schemaVersion: 1, providers: providers(9) })), REFUSED);
  assert.deepEqual(parse(JSON.stringify({ schemaVersion: 2, providers: providers(1) })), REFUSED);
  assert.deepEqual(parse(JSON.stringify({ schemaVersion: 1, providers: { 0: base } })), REFUSED);
  for (const row of [null, [], "google"]) assert.deepEqual(parse(JSON.stringify({ schemaVersion: 1, providers: [row] })), REFUSED);
  const raw = JSON.stringify({ schemaVersion: 1, providers: [base] });
  assert.equal(parse(raw.padEnd(32768, " ")).ok, true);
  assert.deepEqual(parse(raw.padEnd(32769, " ")), REFUSED);
});

test("an accepted preset returns its email authority exactly: optional claim omitted, domains defaulted, multi-label and one-letter labels kept", () => {
  const { hostedDomainClaim: _claim, authoritativeEmailDomains: _domains, ...bare } = base;
  const parsed = parse(JSON.stringify({ schemaVersion: 1, providers: [bare] }));
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.descriptors[0], { ...bare, authoritativeEmailDomains: [] });
  assert.equal("hostedDomainClaim" in parsed.descriptors[0]!, false);
  const domains = ["mail.google.com", "a.co", "x-y.example.org"];
  const full = one({ authoritativeEmailDomains: domains, hostedDomainClaim: "hd_2" });
  assert.ok(full.ok);
  assert.deepEqual(full.descriptors[0], { ...base, authoritativeEmailDomains: domains, hostedDomainClaim: "hd_2" });
});
