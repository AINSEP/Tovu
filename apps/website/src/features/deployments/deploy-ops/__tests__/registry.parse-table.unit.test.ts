import assert from "node:assert/strict";
import test from "node:test";

import { parseDeployOpsFile } from "../registry.js";

/**
 * @file Per-clause table tests for `parseDeployOpsFile` (Stryker lane L14: `registry.ts` 87 % with 34
 * survivors). Each guard clause of the module-path containment check, the id/host regexes and the
 * size limits gets its own case, so dropping any ONE clause or anchor fails a test.
 */

const ENTRY = { id: "example", label: "Example", module: "ops.mjs", hosts: ["api.example.com"] };
const parse = (platforms: unknown[]) => parseDeployOpsFile(JSON.stringify({ schemaVersion: 1, platforms }));
const reasonFor = (over: Record<string, unknown>) => {
  const r = parse([{ ...ENTRY, ...over }]);
  return r.ok ? "ok" : r.reason;
};

const MODULE_REFUSAL = "platforms[0].module must be a contained relative .mjs path";
const HOSTS_REFUSAL = "platforms[0].hosts must be a non-empty array of HTTPS hostnames";
const ID_REFUSAL = "platforms[0].id must be a lowercase hyphenated id";
const LABEL_REFUSAL = "platforms[0].label must be a non-empty string";

test("module path: each containment clause is required on its own", () => {
  const cases: Array<[unknown, string]> = [
    ["ops.mjs", "ok"],
    ["lib/ops.mjs", "ok"],
    ["ops.js", MODULE_REFUSAL],
    ["ops.mjs.bak", MODULE_REFUSAL],
    ["/abs/ops.mjs", MODULE_REFUSAL],
    ["lib\\ops.mjs", MODULE_REFUSAL],
    ["../ops.mjs", MODULE_REFUSAL],
    ["lib/../ops.mjs", MODULE_REFUSAL],
    ["./ops.mjs", MODULE_REFUSAL],
    ["lib//ops.mjs", MODULE_REFUSAL],
    ["lib/ops.mjs/", MODULE_REFUSAL],
    [".mjs", "ok"],
    [42, MODULE_REFUSAL],
    [null, MODULE_REFUSAL],
  ];
  for (const [module, expected] of cases) assert.equal(reasonFor({ module }), expected, JSON.stringify(module));
});

test("hosts: count 1..8, each a lowercase DNS name ≤ 253 chars with a ≥2-letter TLD, anchored both ends", () => {
  const label63 = "a".repeat(63);
  const host253 = `${label63}.${label63}.${label63}.${"b".repeat(58)}.io`;
  assert.equal(host253.length, 253);
  const cases: Array<[unknown, string]> = [
    [["a.io"], "ok"],
    [Array(8).fill("a.io"), "ok"],
    [Array(9).fill("a.io"), HOSTS_REFUSAL],
    [[], HOSTS_REFUSAL],
    ["a.io", HOSTS_REFUSAL],
    [[host253], "ok"],
    [[`a${host253}`], HOSTS_REFUSAL],
    [["api.example.com", 7], HOSTS_REFUSAL],
    [[7, "api.example.com"], HOSTS_REFUSAL],
    [["api.example.com", "API.example.com"], HOSTS_REFUSAL],
    [["localhost"], HOSTS_REFUSAL],
    [["a.i"], HOSTS_REFUSAL],
    [["a.i1"], HOSTS_REFUSAL],
    [["-a.io"], HOSTS_REFUSAL],
    [["a-.io"], HOSTS_REFUSAL],
    [["a-b.io"], "ok"],
    [["https://a.io"], HOSTS_REFUSAL],
    [["a.io/"], HOSTS_REFUSAL],
    [["a.io\n"], HOSTS_REFUSAL],
    [[" a.io"], HOSTS_REFUSAL],
    [["a.io:443"], HOSTS_REFUSAL],
  ];
  for (const [hosts, expected] of cases) assert.equal(reasonFor({ hosts }), expected, JSON.stringify(hosts));
});

test("id: lowercase hyphenated, ≤ 64 chars, anchored both ends", () => {
  const cases: Array<[unknown, string]> = [
    ["a", "ok"],
    ["a-b-1", "ok"],
    ["a".repeat(64), "ok"],
    ["a".repeat(65), ID_REFUSAL],
    ["", ID_REFUSAL],
    ["A", ID_REFUSAL],
    ["-a", ID_REFUSAL],
    ["a-", ID_REFUSAL],
    ["a--b", ID_REFUSAL],
    ["a_b", ID_REFUSAL],
    ["a\n", ID_REFUSAL],
    [" a", ID_REFUSAL],
    [7, ID_REFUSAL],
  ];
  for (const [id, expected] of cases) assert.equal(reasonFor({ id }), expected, JSON.stringify(id));
});

test("label: non-empty after trim, ≤ 100 chars, a string", () => {
  const cases: Array<[unknown, string]> = [
    ["x", "ok"],
    ["x".repeat(100), "ok"],
    ["x".repeat(101), LABEL_REFUSAL],
    ["", LABEL_REFUSAL],
    ["   ", LABEL_REFUSAL],
    [5, LABEL_REFUSAL],
  ];
  for (const [label, expected] of cases) assert.equal(reasonFor({ label }), expected, JSON.stringify(label));
});

test("top level: schemaVersion exactly 1, platforms an array of at most 32 objects; descriptors keep only known keys", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...ENTRY, id: `p${i}` }));
  const r32 = parse(many(32));
  assert.equal(r32.ok && r32.descriptors.length, 32);
  assert.deepEqual(parse(many(33)), { ok: false, reason: "platforms must be an array of at most 32 entries" });
  assert.deepEqual(parseDeployOpsFile(JSON.stringify({ schemaVersion: 1, platforms: {} })), { ok: false, reason: "platforms must be an array of at most 32 entries" });
  assert.deepEqual(parseDeployOpsFile(JSON.stringify({ schemaVersion: 1 })), { ok: false, reason: "platforms must be an array of at most 32 entries" });
  for (const raw of ["[]", "null", '"x"', JSON.stringify({ schemaVersion: "1", platforms: [] }), JSON.stringify({ schemaVersion: 2, platforms: [] })]) {
    assert.deepEqual(parseDeployOpsFile(raw), { ok: false, reason: "schemaVersion must be 1" }, raw);
  }
  assert.deepEqual(parseDeployOpsFile("{nope"), { ok: false, reason: "not valid JSON" });
  assert.deepEqual(parse([]), { ok: true, descriptors: [] });
  for (const entry of [null, [], "x"]) assert.deepEqual(parse([ENTRY, entry]), { ok: false, reason: "platforms[1] must be an object" });
  assert.deepEqual(parse([{ ...ENTRY, extra: "dropped" }]), { ok: true, descriptors: [ENTRY] });
});
