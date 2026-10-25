import assert from "node:assert/strict";
import test from "node:test";

import { CredentialInputError } from "@jini-ai/platform/secrets/credential-token";
import type { SecretCardForm } from "@jini-ai/ui/mcp-ui/secret-card";

import {
  applyPluginCredentialCard,
  buildPluginCredentialForm,
  findPluginCredentialCard,
  loadPluginCredentialCardsSafely,
  readPluginCredentialValues,
  type PluginCredentialCard,
} from "../plugin-credential-card.js";
import { CustomCredentialValidationError } from "../store.js";

/**
 * @file Direct unit tests for `plugin-credential-card.ts` (Stryker lane L14: 2.2 %, 133 no-coverage).
 * The security-relevant parts are pinned with negative tests: server-owned label/category/baseUrl
 * cannot be overridden by form values, dynamic origins must be HTTPS without userinfo, public
 * fields must be credential-free text, and card lookup never matches a similarly named card.
 */

const MAIL: PluginCredentialCard = {
  providerId: "mailer",
  label: "Mailer API",
  category: "mail",
  baseUrl: "https://api.mailer.example",
  title: "Connect Mailer",
};

function rejects(fn: () => unknown, cls: new (...a: never[]) => Error, message?: string): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof cls, `expected ${cls.name}, got ${String(err)}`);
    if (message !== undefined) assert.equal((err as Error).message, message);
    return true;
  });
}

test("buildPluginCredentialForm: minimal card → fixed copy, one secret token field, 'Saved as' label, frame size", () => {
  assert.deepEqual(buildPluginCredentialForm({ card: MAIL }), {
    title: "Connect Mailer",
    description: "The key is sealed on the server the moment you submit — the assistant never sees it.",
    details: [{ label: "Saved as", value: "Mailer API" }],
    submitLabel: "Save key",
    fields: [{ kind: "string", name: "token", label: "API key", hint: "Paste the key here. It is never shown to the assistant.", required: true, secret: true }],
    app: { appName: "tovu-plugin-credential-card", appVersion: "1" },
    preferredFrameSize: ["100%", "360px"],
  });
});

test("buildPluginCredentialForm: intro, help link (default and custom label), usedFor, key hint and public fields, in order", () => {
  const card: PluginCredentialCard = {
    ...MAIL, intro: "Paste your key.", helpUrl: "https://help.example/keys", keyHint: "Needs send access.",
    usedFor: ["sending mail", "bounces"], fields: [{ name: "username", label: "User", required: true }, { name: "region", label: "Region", hint: "eu" }],
  };
  const form = buildPluginCredentialForm({ card });
  assert.equal(form.description, "Paste your key. The key is sealed on the server the moment you submit — the assistant never sees it.");
  assert.deepEqual(form.details, [
    { label: "Get a key", value: "https://help.example/keys" },
    { label: "Used for", value: "sending mail; bounces" },
    { label: "Saved as", value: "Mailer API" },
  ]);
  assert.deepEqual(form.fields.map((f) => f.name), ["username", "region", "token"]);
  assert.deepEqual(form.fields[0], { kind: "string", name: "username", label: "User", required: true });
  assert.equal((form.fields[2] as { hint?: string }).hint, "Needs send access.");
  assert.deepEqual(buildPluginCredentialForm({ card: { ...card, helpLabel: "Find it" } }).details?.[0], { label: "Find it", value: "https://help.example/keys" });
});

test("buildPluginCredentialForm: an empty usedFor list adds no row; a non-api saveKind omits 'Saved as', an explicit 'api' keeps it", () => {
  assert.deepEqual(buildPluginCredentialForm({ card: { ...MAIL, usedFor: [] } }).details, [{ label: "Saved as", value: "Mailer API" }]);
  assert.deepEqual(buildPluginCredentialForm({ card: { ...MAIL, saveKind: "publish-host" } }).details, []);
  assert.deepEqual(buildPluginCredentialForm({ card: { ...MAIL, saveKind: "api" } }).details, [{ label: "Saved as", value: "Mailer API" }]);
});

const DOMAIN_FORM: SecretCardForm = {
  title: "Domain title",
  description: "Domain description.",
  details: [{ label: "Host", value: "h" }],
  submitLabel: "Connect",
  fields: [
    { kind: "string", name: "url", label: "URL" },
    { kind: "string", name: "token", label: "Token", hint: "domain hint", secret: true },
    { kind: "string", name: "token", label: "Not secret", hint: "kept" },
    { kind: "boolean", name: "token", label: "Not a string field", hint: "kept too", secret: true },
    { kind: "string", name: "password", label: "Another secret", hint: "kept as well", secret: true },
  ],
} as SecretCardForm;

test("applyPluginCredentialCard: no card returns the very same form object", () => {
  assert.equal(applyPluginCredentialCard({ form: DOMAIN_FORM }), DOMAIN_FORM);
});

test("applyPluginCredentialCard: plugin title/intro/details/key hint applied; only the SECRET token field's hint changes", () => {
  const card: PluginCredentialCard = { ...MAIL, saveKind: "publish-host", intro: "Hi.", keyHint: "plugin hint", helpUrl: "https://h.example" };
  const out = applyPluginCredentialCard({ card, form: DOMAIN_FORM });
  assert.equal(out.title, "Connect Mailer");
  assert.equal(out.description, "Hi. Domain description.");
  assert.equal(out.submitLabel, "Connect");
  assert.deepEqual(out.details, [{ label: "Host", value: "h" }, { label: "Get a key", value: "https://h.example" }]);
  assert.deepEqual(out.fields.map((f) => (f as { hint?: string }).hint), [undefined, "plugin hint", "kept", "kept too", "kept as well"]);
});

test("applyPluginCredentialCard: no keyHint keeps the domain hint; no intro trims; no domain description uses the plugin's; no domain details", () => {
  const out = applyPluginCredentialCard({ card: MAIL, form: DOMAIN_FORM });
  assert.equal(out.description, "Domain description.");
  assert.equal((out.fields[1] as { hint?: string }).hint, "domain hint");
  const bare = applyPluginCredentialCard({ card: { ...MAIL, intro: "Intro." }, form: { ...DOMAIN_FORM, description: undefined, details: undefined } as SecretCardForm });
  assert.equal(bare.description, "Intro. The key is sealed on the server the moment you submit — the assistant never sees it.");
  assert.deepEqual(bare.details, [{ label: "Saved as", value: "Mailer API" }]);
});

test("readPluginCredentialValues: server-owned label/category/baseUrl win over submitted values; token read; no additionalHosts key when undeclared", () => {
  const out = readPluginCredentialValues({ card: MAIL, values: { token: "tkn", label: "evil", category: "evil", baseUrl: "https://evil.example" } });
  assert.deepEqual(out, { label: "Mailer API", category: "mail", baseUrl: "https://api.mailer.example", username: undefined, token: "tkn" });
  assert.equal("additionalHosts" in out, false);
});

test("readPluginCredentialValues: a STATIC card origin is server-owned and not re-validated (legacy http rows stay readable)", () => {
  const legacy = { ...MAIL, baseUrl: "http://legacy.mailer.example" };
  assert.equal(readPluginCredentialValues({ card: legacy, values: { token: "t" } }).baseUrl, "http://legacy.mailer.example");
});

test("readPluginCredentialValues: a non-string token reads as empty; declared additionalHosts are carried (even empty)", () => {
  assert.equal(readPluginCredentialValues({ card: MAIL, values: { token: 42 } }).token, "");
  assert.equal(readPluginCredentialValues({ card: MAIL, values: {} }).token, "");
  assert.deepEqual(readPluginCredentialValues({ card: { ...MAIL, additionalHosts: ["a.example", "b.example"] }, values: {} }).additionalHosts, ["a.example", "b.example"]);
  assert.deepEqual(readPluginCredentialValues({ card: { ...MAIL, additionalHosts: [] }, values: {} }).additionalHosts, []);
});

const DYNAMIC: PluginCredentialCard = { ...MAIL, baseUrl: "", fields: [{ name: "baseUrl", label: "Server", required: true }, { name: "username", label: "User" }] };

test("readPluginCredentialValues: a dynamic origin comes from the declared baseUrl field and must be HTTPS", () => {
  assert.deepEqual(readPluginCredentialValues({ card: DYNAMIC, values: { baseUrl: "https://mail.corp.example", username: "ops", token: "t" } }), {
    label: "Mailer API", category: "mail", baseUrl: "https://mail.corp.example", username: "ops", token: "t",
  });
});

test("readPluginCredentialValues: HTTPS guard — not a URL, http:, and userinfo are each refused with the exact message", () => {
  rejects(() => readPluginCredentialValues({ card: DYNAMIC, values: { baseUrl: "mail.corp.example" } }), CustomCredentialValidationError, "Server URL must use HTTPS");
  rejects(() => readPluginCredentialValues({ card: DYNAMIC, values: { baseUrl: "http://mail.corp.example" } }), CustomCredentialValidationError, "Server URL must use HTTPS without credentials");
  // userinfo is caught by the credential-free field check first (a URL with a username is a credential).
  rejects(() => readPluginCredentialValues({ card: DYNAMIC, values: { baseUrl: "https://u@mail.corp.example" } }), CredentialInputError);
});

test("readPluginCredentialValues: a dynamic card with NO baseUrl field still enforces HTTPS on the empty origin", () => {
  rejects(() => readPluginCredentialValues({ card: { ...MAIL, baseUrl: "" }, values: { token: "t" } }), CustomCredentialValidationError, "Server URL must use HTTPS");
});

test("readPluginCredentialValues: an HTTPS origin with userinfo is refused (credential-free check runs before the HTTPS guard)", () => {
  // assertHttpsInput's own userinfo clause is defence in depth: a dynamic origin only ever comes from a
  // declared field, and every declared field passes assertCredentialFreeField first, which already
  // refuses any URL with a username or password. Pinned here so neither guard can be dropped silently.
  for (const baseUrl of ["https://:pw@mail.corp.example", "https://user:pw@mail.corp.example", "https://user@mail.corp.example"]) {
    rejects(() => readPluginCredentialValues({ card: DYNAMIC, values: { baseUrl } }), CredentialInputError);
  }
});

test("readPluginCredentialValues: required public field — missing, non-string and blank are refused as '<name> is required'", () => {
  for (const baseUrl of [undefined, 7, "", "   "]) {
    rejects(() => readPluginCredentialValues({ card: DYNAMIC, values: { baseUrl } }), CustomCredentialValidationError, "baseUrl is required");
  }
});

test("readPluginCredentialValues: optional public field — absent is undefined, non-string is '<name> must be text', secret-shaped is refused", () => {
  const card: PluginCredentialCard = { ...MAIL, fields: [{ name: "username", label: "User" }] };
  assert.equal(readPluginCredentialValues({ card, values: {} }).username, undefined);
  rejects(() => readPluginCredentialValues({ card, values: { username: 5 } }), CustomCredentialValidationError, "username must be text");
  rejects(() => readPluginCredentialValues({ card, values: { username: null } }), CustomCredentialValidationError, "username must be text");
  rejects(() => readPluginCredentialValues({ card, values: { username: `ghp_${"a".repeat(36)}` } }), CredentialInputError);
  assert.equal(readPluginCredentialValues({ card, values: { username: "ops" } }).username, "ops");
});

const CARDS: readonly PluginCredentialCard[] = [
  { ...MAIL, label: "Mailer API" },
  { ...MAIL, label: "Other API", saveKind: "api" },
  { ...MAIL, providerId: "hostco", label: "Host", saveKind: "publish-host" },
  { ...MAIL, providerId: "gitco", label: "Git", saveKind: "source-control", saveTarget: "github" },
];

test("findPluginCredentialCard: api matches by exact label (missing saveKind counts as api); other kinds by saveTarget ?? providerId", async () => {
  const loadCards = async () => CARDS;
  const find = (saveKind: PluginCredentialCard["saveKind"], target: string) => findPluginCredentialCard({ loadCards, workspaceId: "ws", saveKind, target });
  assert.equal(await find("api", "Mailer API"), CARDS[0]);
  assert.equal(await find("api", "Other API"), CARDS[1]);
  assert.equal(await find("api", "Host"), undefined, "a non-api card never answers an api lookup by label");
  assert.equal(await find("api", "mailer api"), undefined, "label match is exact");
  assert.equal(await find("publish-host", "hostco"), CARDS[2]);
  assert.equal(await find("publish-host", "gitco"), undefined, "provider id of another kind does not match");
  assert.equal(await find("source-control", "github"), CARDS[3]);
  assert.equal(await find("source-control", "gitco"), undefined, "an explicit saveTarget replaces the provider id");
  assert.equal(await find("oauth", "mailer"), undefined, "an api card (no saveKind) never answers a non-api lookup");
});

test("loadPluginCredentialCardsSafely: passes the workspace id, defaults to [] without a loader, and swallows a failure with a FIXED warning", async () => {
  const seen: string[] = [];
  assert.deepEqual(await loadPluginCredentialCardsSafely({ workspaceId: "ws-9", loadCards: async (ws) => (seen.push(ws), CARDS) }), CARDS);
  assert.deepEqual(seen, ["ws-9"]);
  const warnings: string[] = [];
  assert.deepEqual(await loadPluginCredentialCardsSafely({ workspaceId: "ws" }, { warn: (m) => warnings.push(m) }), []);
  assert.deepEqual(warnings, [], "no loader is not a failure: nothing is warned");
  const out = await loadPluginCredentialCardsSafely(
    { workspaceId: "ws", loadCards: async () => { throw new Error("/secret/path/plugin.json: token=abc"); } },
    { warn: (m) => warnings.push(m) },
  );
  assert.deepEqual(out, []);
  assert.deepEqual(warnings, ["[plugin-credential-cards] Optional card lookup failed; using the default credential form."]);
});

test("loadPluginCredentialCardsSafely: without an injected warn it falls back to console.warn", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  assert.deepEqual(await loadPluginCredentialCardsSafely({ workspaceId: "ws", loadCards: async () => { throw new Error("x"); } }), []);
  assert.equal(warn.mock.callCount(), 1);
});

test("findPluginCredentialCard: a throwing loader resolves to undefined (optional display data never blocks)", async (t) => {
  t.mock.method(console, "warn", () => {});
  assert.equal(await findPluginCredentialCard({ workspaceId: "ws", saveKind: "api", target: "Mailer API", loadCards: async () => { throw new Error("x"); } }), undefined);
});
