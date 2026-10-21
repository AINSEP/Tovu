import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { parseDeployTargetsFile } from "../registry.js";
import { loadBundledDeployTargets } from "./bundled-deploy-targets.fixture.js";

/**
 * @file The descriptor fields that let core stay vendor-free (deploy plan T7 slice a): per-target
 * publish config fields and the server-environment credential fallback, both DATA in the plugin's
 * `tovu-deploy-targets.json`, parsed and validated by the registry.
 */

const BUNDLED_AGENT_PLUGINS_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");

/** Every shipped hosting plugin's descriptor file, parsed and merged (each host is its own plugin). */
function parseShippedDescriptors(): ReturnType<typeof parseDeployTargetsFile> {
  const files = readdirSync(BUNDLED_AGENT_PLUGINS_ROOT).sort().map((dir) => path.join(BUNDLED_AGENT_PLUGINS_ROOT, dir, "tovu-deploy-targets.json")).filter((file) => existsSync(file));
  const parsed = files.map((file) => parseDeployTargetsFile(readFileSync(file, "utf8")));
  const failed = parsed.find((result) => !result.ok);
  return failed ?? { ok: true, descriptors: parsed.flatMap((result) => (result.ok ? result.descriptors : [])) };
}

function file(targets: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ schemaVersion: 1, targets });
}

const BASE = { id: "fixture-host", label: "Fixture", module: "targets/fixture.mjs" };

test("config fields and env fallback parse; absent ones default to none", () => {
  const parsed = parseDeployTargetsFile(
    file([
      { ...BASE, config: [{ name: "owner", label: "Owner", required: true, help: "who" }, { name: "branch", label: "Branch" }], env: { tokenVars: ["A_TOKEN", "B_TOKEN"], fields: { accountId: "A_ACCOUNT" } } },
      { ...BASE, id: "bare-host" },
    ]),
  );
  assert.deepEqual(parsed, {
    ok: true,
    descriptors: [
      { ...BASE, configFields: [{ name: "owner", label: "Owner", required: true, help: "who" }, { name: "branch", label: "Branch", required: false }], env: { tokenVars: ["A_TOKEN", "B_TOKEN"], fields: { accountId: "A_ACCOUNT" } } },
      { ...BASE, id: "bare-host", configFields: [] },
    ],
  });
});

test("a config field may carry a separate person-facing userHelp; a non-string one is refused", () => {
  const parsed = parseDeployTargetsFile(file([{ ...BASE, config: [{ name: "owner", label: "Owner", help: "agent hint", userHelp: "person hint" }] }]));
  assert.deepEqual(parsed, { ok: true, descriptors: [{ ...BASE, configFields: [{ name: "owner", label: "Owner", required: false, help: "agent hint", userHelp: "person hint" }] }] });
  assert.deepEqual(parseDeployTargetsFile(file([{ ...BASE, config: [{ name: "owner", label: "Owner", userHelp: 3 }] }])), {
    ok: false,
    reason: "targets[0].config[0].userHelp must be a string of at most 500 characters",
  });
});

test("the shipped github-pages owner field has person-facing help that does not address the agent", () => {
  const parsed = parseShippedDescriptors();
  assert.ok(parsed.ok);
  const owner = parsed.descriptors.find((descriptor) => descriptor.id === "github-pages")?.configFields.find((field) => field.name === "owner");
  assert.ok(owner?.userHelp);
  assert.doesNotMatch(owner.userHelp, /accountLabel|never guess/);
  assert.notEqual(owner.userHelp, owner.help);
});

test("a credential may carry a separate person-facing userHelp; a non-string one is refused", () => {
  const credential = { vendorId: "acme", help: "agent hint", userHelp: "person hint", fields: [{ name: "token", label: "Token", required: true, secret: true }] };
  const parsed = parseDeployTargetsFile(file([{ ...BASE, credential }]));
  assert.ok(parsed.ok);
  assert.equal(parsed.descriptors[0]?.credential?.userHelp, "person hint");
  assert.equal(parsed.descriptors[0]?.credential?.help, "agent hint");
  assert.deepEqual(parseDeployTargetsFile(file([{ ...BASE, credential: { ...credential, userHelp: 3 } }])), {
    ok: false,
    reason: "targets[0].credential.userHelp must be a string of at most 500 characters",
  });
});

test("the shipped S3 credential and Public URL speak to the person, not in the agent's voice", () => {
  const parsed = parseShippedDescriptors();
  assert.ok(parsed.ok);
  const credential = parsed.descriptors.find((descriptor) => descriptor.id === "s3-compatible")?.credential;
  const publicUrl = credential?.fields.find((field) => field.name === "publicUrl");
  assert.ok(credential?.userHelp && publicUrl?.userHelp);
  assert.notEqual(credential.userHelp, credential.help);
  assert.notEqual(publicUrl.userHelp, publicUrl.help);
  for (const text of [credential.userHelp, publicUrl.userHelp]) assert.doesNotMatch(text, /\bask me\b|\bme to\b/i);
});

test("the shipped Cloudflare credential help and Account ID help do not point to different places", () => {
  const parsed = parseShippedDescriptors();
  assert.ok(parsed.ok);
  const credential = parsed.descriptors.find((descriptor) => descriptor.id === "cloudflare-pages")?.credential;
  const accountId = credential?.fields.find((field) => field.name === "accountId");
  assert.doesNotMatch(credential?.help ?? "", /sidebar|home page/);
  assert.match(accountId?.help ?? "", /dash\.cloudflare\.com\//);
  assert.ok(credential?.help && accountId?.help);
  assert.match(credential.help, /your Cloudflare account ID/);
  assert.equal(accountId.help, "Cloudflare dashboard: the long ID in the address bar, right after dash.cloudflare.com/.");
});

test("a config field may not shadow a publish request's own keys", () => {
  for (const name of ["target", "projectName", "credentialId"]) {
    assert.deepEqual(parseDeployTargetsFile(file([{ ...BASE, config: [{ name, label: "X" }] }])), { ok: false, reason: `targets[0].config[0].name '${name}' is reserved` });
  }
});

test("a config field is never secret: the agent passes config in the clear, so a secret belongs on the credential", () => {
  assert.deepEqual(parseDeployTargetsFile(file([{ ...BASE, config: [{ name: "apiKey", label: "Key", secret: true }] }])), {
    ok: false,
    reason: "targets[0].config[0] is marked secret; config is passed in the clear, so declare it under credential.fields",
  });
});

test("malformed config fields and env blocks are refused with the exact reason", () => {
  const cases: ReadonlyArray<[unknown, unknown, string]> = [
    [{ name: "has space", label: "X" }, undefined, "targets[0].config[0].name must be a camelCase identifier"],
    [{ name: "owner", label: "" }, undefined, "targets[0].config[0].label must be a non-empty string"],
    [{ name: "owner", label: "X", required: "yes" }, undefined, "targets[0].config[0].required must be a boolean"],
    [undefined, { tokenVars: [] }, "targets[0].env.tokenVars must be a non-empty array of env var names"],
    [undefined, { tokenVars: ["lower"] }, "targets[0].env.tokenVars must be a non-empty array of env var names"],
    [undefined, { tokenVars: ["A_TOKEN"], fields: { accountId: "bad name" } }, "targets[0].env.fields must map field names to env var names"],
  ];
  for (const [field, env, reason] of cases) {
    const target = { ...BASE, ...(field !== undefined ? { config: [field] } : {}), ...(env !== undefined ? { env } : {}) };
    assert.deepEqual(parseDeployTargetsFile(file([target])), { ok: false, reason });
  }
  assert.deepEqual(parseDeployTargetsFile(file([{ ...BASE, config: [{ name: "a", label: "A" }, { name: "a", label: "B" }] }])), {
    ok: false,
    reason: "targets[0].config[1].name 'a' is declared twice",
  });
});

test("the shipped hosting plugins declare the publish fields and env vars core used to hard-code", () => {
  const parsed = parseShippedDescriptors();
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  if (!parsed.ok) return;
  const byId = new Map(parsed.descriptors.map((descriptor) => [descriptor.id, descriptor]));
  const fields = (id: string) => byId.get(id)?.configFields.map((field) => `${field.name}${field.required ? "*" : ""}`);
  assert.deepEqual(fields("github-pages"), ["owner*", "repo*", "branch"]);
  assert.deepEqual(fields("vercel"), ["teamId"]);
  assert.deepEqual(fields("netlify"), []);
  assert.deepEqual(fields("cloudflare-pages"), ["customDomain", "zoneId", "resourceName"]);
  assert.deepEqual(fields("cloudflare-workers"), ["customDomain", "zoneId", "resourceName", "assetPlan"]);
  assert.deepEqual(fields("s3-compatible"), []);
  assert.deepEqual(byId.get("github-pages")?.env, { tokenVars: ["GITHUB_TOKEN", "GH_TOKEN", "GITHUB_ACCESS_TOKEN"] });
  assert.deepEqual(byId.get("vercel")?.env, { tokenVars: ["VERCEL_TOKEN", "VERCEL_ACCESS_TOKEN"] });
  assert.deepEqual(byId.get("netlify")?.env, { tokenVars: ["NETLIFY_TOKEN", "NETLIFY_ACCESS_TOKEN", "NETLIFY_AUTH_TOKEN"] });
  assert.deepEqual(byId.get("cloudflare-pages")?.env, { tokenVars: ["CLOUDFLARE_TOKEN", "CLOUDFLARE_API_TOKEN"], fields: { accountId: "CLOUDFLARE_ACCOUNT_ID" } });
  assert.equal(byId.get("s3-compatible")?.env, undefined);
});

test("a credential block parses: vendor, declared fields, and which field is the token (default 'token')", () => {
  const parsed = parseDeployTargetsFile(
    file([
      { ...BASE, credential: { vendorId: "fixture", fields: [{ name: "token", label: "Token", required: true, secret: true }, { name: "siteId", label: "Site" }] } },
      { ...BASE, id: "pair-host", credential: { vendorId: "pair", tokenField: "secretKey", fields: [{ name: "keyId", label: "Key id", required: true }, { name: "secretKey", label: "Secret", required: true, secret: true }] } },
    ]),
  );
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  if (!parsed.ok) return;
  assert.deepEqual(parsed.descriptors[0]?.credential, {
    vendorId: "fixture",
    tokenField: "token",
    fields: [{ name: "token", label: "Token", required: true, secret: true }, { name: "siteId", label: "Site", required: false }],
  });
  assert.equal(parsed.descriptors[1]?.credential?.tokenField, "secretKey");
});

test("malformed credential blocks are refused with the exact reason", () => {
  const cases: ReadonlyArray<[unknown, string]> = [
    [{ fields: [] }, "targets[0].credential.vendorId must be a lowercase hyphenated id"],
    [{ vendorId: "v", fields: [{ name: "token", label: "T" }] }, "targets[0].credential.tokenField 'token' must name a required field"],
    [{ vendorId: "v", tokenField: "key", fields: [{ name: "token", label: "T", required: true }] }, "targets[0].credential.tokenField 'key' must name a required field"],
    [{ vendorId: "v", fields: [{ name: "providerId", label: "T", required: true }] }, "targets[0].credential.fields[0].name 'providerId' is reserved"],
    [{ vendorId: "v", fields: [{ name: "token", label: "T", required: true, secret: "yes" }] }, "targets[0].credential.fields[0].secret must be a boolean"],
    [{ vendorId: "v", vendorLabel: " ", fields: [{ name: "token", label: "T", required: true }] }, "targets[0].credential.vendorLabel must be a non-empty string"],
    [{ vendorId: "v", yieldsAccountLabel: "yes", fields: [{ name: "token", label: "T", required: true }] }, "targets[0].credential.yieldsAccountLabel must be a boolean"],
  ];
  for (const [credential, reason] of cases) {
    assert.deepEqual(parseDeployTargetsFile(file([{ ...BASE, credential }])), { ok: false, reason });
  }
});

test("credential token links must be HTTPS and project-name copy rejects malformed labels and help", () => {
  const credential = { vendorId: "fixture", fields: [{ name: "token", label: "Token", required: true }] };
  for (const tokenPageUrl of ["not a URL", "http://tokens.example.test", "javascript:alert(1)", 7]) {
    assert.deepEqual(parseDeployTargetsFile(file([{ ...BASE, credential: { ...credential, tokenPageUrl } }])), { ok: false, reason: "targets[0].credential.tokenPageUrl must be an https URL" });
  }
  const valid = parseDeployTargetsFile(file([{ ...BASE, credential: { ...credential, tokenPageUrl: "https://tokens.example.test/create" } }]));
  assert.ok(valid.ok);
  assert.equal(valid.descriptors[0]?.credential?.tokenPageUrl, "https://tokens.example.test/create");
  for (const projectName of [null, { label: " " }, { label: 3 }]) {
    assert.deepEqual(parseDeployTargetsFile(file([{ ...BASE, projectName }])), { ok: false, reason: "targets[0].projectName.label must be a non-empty string" });
  }
  for (const help of [3, "x".repeat(501)]) {
    assert.deepEqual(parseDeployTargetsFile(file([{ ...BASE, projectName: { label: "Release", help } }])), { ok: false, reason: "targets[0].projectName.help must be a string of at most 500 characters" });
  }
  assert.deepEqual(parseDeployTargetsFile(file([{ ...BASE, projectName: { label: "Release", help: "Commit description" } }])), { ok: true, descriptors: [{ ...BASE, configFields: [], projectName: { label: "Release", help: "Commit description" } }] });
});

test("the shipped hosting plugins name each credential check's vendor and which hosts return an account label", async () => {
  const registry = await loadBundledDeployTargets();
  const check = (id: string) => {
    const spec = registry.get(id)?.descriptor.credential;
    return [spec?.vendorLabel, spec?.yieldsAccountLabel === true];
  };
  assert.deepEqual(check("github-pages"), ["GitHub", true]);
  assert.deepEqual(check("vercel"), [undefined, true]);
  assert.deepEqual(check("netlify"), [undefined, false]);
  assert.deepEqual(check("cloudflare-pages"), ["Cloudflare", false]);
  assert.deepEqual(check("s3-compatible"), ["the storage provider", false]);
});

test("the shipped hosting plugins declare the credential fields and vendors core used to hard-code", () => {
  const parsed = parseShippedDescriptors();
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  if (!parsed.ok) return;
  const byId = new Map(parsed.descriptors.map((descriptor) => [descriptor.id, descriptor]));
  const credential = (id: string) => {
    const spec = byId.get(id)?.credential;
    return spec && { vendorId: spec.vendorId, tokenField: spec.tokenField, fields: spec.fields.map((field) => `${field.name}${field.required ? "*" : ""}${field.secret ? "!" : ""}`) };
  };
  assert.deepEqual(credential("github-pages"), { vendorId: "github", tokenField: "token", fields: ["token*!"] });
  assert.deepEqual(credential("vercel"), { vendorId: "vercel", tokenField: "token", fields: ["token*!"] });
  assert.deepEqual(credential("netlify"), { vendorId: "netlify", tokenField: "token", fields: ["token*!"] });
  assert.deepEqual(credential("cloudflare-pages"), { vendorId: "cloudflare", tokenField: "token", fields: ["token*!", "accountId*", "zoneId"] });
  assert.deepEqual(credential("s3-compatible"), {
    vendorId: "s3-compatible",
    tokenField: "secretAccessKey",
    fields: ["endpoint", "region*", "bucket*", "accessKeyId*", "secretAccessKey*!", "publicUrl*"],
  });
});

test("the targets file refuses invalid JSON, a missing targets array and duplicate ids; projectName copy may omit help", () => {
  assert.deepEqual(parseDeployTargetsFile("{"), { ok: false, reason: "not valid JSON" });
  assert.deepEqual(parseDeployTargetsFile(JSON.stringify({ schemaVersion: 1 })), { ok: false, reason: "targets must be an array" });
  assert.deepEqual(parseDeployTargetsFile(file([BASE, BASE])), { ok: false, reason: `targets[1].id '${BASE.id}' is declared twice` });
  assert.deepEqual(parseDeployTargetsFile(file([{ ...BASE, projectName: { label: "Release" } }])), { ok: true, descriptors: [{ ...BASE, configFields: [], projectName: { label: "Release" } }] });
});

test("a source directory's targets load through loadDeployTargetRegistryFromSource, with a non-object module refused", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const pathModule = await import("node:path");
  const { loadDeployTargetRegistryFromSource } = await import("../registry.js");
  const root = await mkdtemp(pathModule.join(tmpdir(), "tovu-targets-source-"));
  try {
    await mkdir(pathModule.join(root, "targets"));
    await writeFile(pathModule.join(root, "tovu-deploy-targets.json"), file([{ ...BASE, module: "targets/ok.mjs" }, { ...BASE, id: "other-host", module: "targets/bad.mjs" }]));
    await writeFile(pathModule.join(root, "targets", "ok.mjs"), "export default { create() { return {}; } };\n");
    await writeFile(pathModule.join(root, "targets", "bad.mjs"), "export default 7;\n");
    const registry = await loadDeployTargetRegistryFromSource({ pluginId: "source-plugin", packageRoot: root }, {});
    assert.deepEqual(registry.list().map(target => target.descriptor.id), [BASE.id]);
    assert.equal(registry.refusals.length, 1);
    assert.match(registry.refusals[0]!, /other-host/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
