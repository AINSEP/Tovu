import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { parseDeployTargetsFile } from "../registry.js";

/**
 * @file The descriptor fields that let core stay vendor-free (deploy plan T7 slice a): per-target
 * publish config fields and the server-environment credential fallback, both DATA in the plugin's
 * `tovu-deploy-targets.json`, parsed and validated by the registry.
 */

const REAL_DESCRIPTOR_PATH = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/deploy/tovu-deploy-targets.json");

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

test("a config field may not shadow a publish request's own keys", () => {
  for (const name of ["target", "projectName", "credentialId"]) {
    assert.deepEqual(parseDeployTargetsFile(file([{ ...BASE, config: [{ name, label: "X" }] }])), { ok: false, reason: `targets[0].config[0].name '${name}' is reserved` });
  }
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

test("the shipped deploy plugin declares the publish fields and env vars core used to hard-code", () => {
  const parsed = parseDeployTargetsFile(readFileSync(REAL_DESCRIPTOR_PATH, "utf8"));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  if (!parsed.ok) return;
  const byId = new Map(parsed.descriptors.map((descriptor) => [descriptor.id, descriptor]));
  const fields = (id: string) => byId.get(id)?.configFields.map((field) => `${field.name}${field.required ? "*" : ""}`);
  assert.deepEqual(fields("github-pages"), ["owner*", "repo*", "branch"]);
  assert.deepEqual(fields("vercel"), ["teamId"]);
  assert.deepEqual(fields("netlify"), []);
  assert.deepEqual(fields("cloudflare-pages"), []);
  assert.deepEqual(fields("s3-compatible"), []);
  assert.deepEqual(byId.get("github-pages")?.env, { tokenVars: ["GITHUB_TOKEN", "GH_TOKEN", "GITHUB_ACCESS_TOKEN"] });
  assert.deepEqual(byId.get("vercel")?.env, { tokenVars: ["VERCEL_TOKEN", "VERCEL_ACCESS_TOKEN"] });
  assert.deepEqual(byId.get("netlify")?.env, { tokenVars: ["NETLIFY_TOKEN", "NETLIFY_ACCESS_TOKEN", "NETLIFY_AUTH_TOKEN"] });
  assert.deepEqual(byId.get("cloudflare-pages")?.env, { tokenVars: ["CLOUDFLARE_TOKEN", "CLOUDFLARE_API_TOKEN"], fields: { accountId: "CLOUDFLARE_ACCOUNT_ID" } });
  assert.equal(byId.get("s3-compatible")?.env, undefined);
});
