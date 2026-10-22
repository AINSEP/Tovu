import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { findCandidateDestination } from "../connect.js";
import { parseDeployConfigsFile, readBundledDeployConfigDescriptors, readBundledDeployConfigCandidatePaths, readBundledDeployWorkflowFile } from "../../deployments/deploy-config-registry.js";

const entry = { id: "example-host", label: "Example host", module: "generator.mjs" };
function sources(t: TestContext, manifests: Record<string, unknown>): string {
  const sourceRoot = mkdtempSync(path.join(tmpdir(), "candidate-data-"));
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));
  for (const [id, manifest] of Object.entries(manifests)) {
    const dir = path.join(sourceRoot, id); mkdirSync(dir);
    writeFileSync(path.join(dir, "plugin.json"), "{}");
    // This file must never be imported by data discovery.
    writeFileSync(path.join(dir, "generator.mjs"), 'throw new Error("no preboot execution");');
    const file = path.join(dir, "tovu-deploy-configs.json");
    if (manifest === null) mkdirSync(file);
    else writeFileSync(file, typeof manifest === "string" ? manifest : JSON.stringify({ schemaVersion: 1, generators: manifest }));
  }
  return sourceRoot;
}

test("candidate declarations preserve order across packages, with the core app.json slot", async t => {
  const sourceRoot = sources(t, {
    "example-z": [{ ...entry, id: "example-z", candidatePaths: [{ path: "example-late.yml", order: 5 }, { path: "example-first.toml", order: 1 }], workflowFile: "example-deploy.yml" }],
    "example-a": [{ ...entry, candidatePaths: [{ path: "example-second.yaml", order: 2 }, { path: "example-first.toml", order: 3 }] }],
  });
  const candidatePaths = readBundledDeployConfigCandidatePaths({ sourceRoot });
  assert.deepEqual(candidatePaths, ["example-first.toml", "example-second.yaml", "app.json", "example-late.yml"]);
  assert.equal(readBundledDeployWorkflowFile({ sourceRoot }), "example-deploy.yml");
  const reads: string[] = [];
  assert.equal(await findCandidateDestination({ resolvePath: file => `/repo/${file}`, io: {
    read: async file => { reads.push(file); return file.endsWith("example-second.yaml") ? "TOVU_PUBLIC_URL: https://destination.example\n" : null; },
    write: async () => { throw new Error("read only"); },
  } }, { candidatePaths }), "https://destination.example");
  assert.deepEqual(reads, ["/repo/example-first.toml", "/repo/example-second.yaml"]);
});

test("escaping candidates are refused before resolution or IO, including injected paths", async t => {
  const invalid = ["../outside", "/outside", "C:/outside", "a/../outside", "a\\outside", "./outside", "a//b", "", "a".repeat(513), 7];
  for (const value of invalid) {
    const parsed = parseDeployConfigsFile(JSON.stringify({ schemaVersion: 1, generators: [{ ...entry, candidatePaths: [{ path: value, order: 1 }] }] }));
    assert.equal(parsed.ok, false, String(value));
  }
  const sourceRoot = sources(t, { "example-bad": [{ ...entry, candidatePaths: [{ path: "../outside", order: 1 }] }] });
  assert.deepEqual(readBundledDeployConfigCandidatePaths({ sourceRoot }), ["app.json"]);
  assert.equal(await findCandidateDestination({ resolvePath: () => { throw new Error("must not resolve"); }, io: { read: async () => { throw new Error("must not read"); }, write: async () => {} } }, { candidatePaths: invalid.filter((value): value is string => typeof value === "string") }), null);
});

test("data discovery drops unreadable, invalid and ambiguous generator ids without importing code", t => {
  const sourceRoot = sources(t, { "example-a": [entry], "example-b": [entry], "example-unreadable": null, "example-invalid": "{" });
  assert.deepEqual(readBundledDeployConfigDescriptors({ sourceRoot }), []);
  assert.equal(readBundledDeployWorkflowFile({ sourceRoot }), undefined);
  assert.deepEqual(readBundledDeployConfigCandidatePaths({ sourceRoot }), ["app.json"]);
});

test("absent hints stay optional; workflow conflicts never choose a package by order", t => {
  const sourceRoot = sources(t, { "example-a": [entry], "example-b": [{ ...entry, id: "example-b", workflowFile: "example-one.yml" }], "example-c": [{ ...entry, id: "example-c", workflowFile: "example-two.yaml" }] });
  assert.equal(readBundledDeployConfigDescriptors({ sourceRoot }).length, 3);
  assert.equal(readBundledDeployWorkflowFile({ sourceRoot }), undefined);
  for (const hints of [{ candidatePaths: {} }, { candidatePaths: [null] }, { candidatePaths: [{ path: "ok", order: "1" }] }, { workflowFile: "../bad.yml" }, { workflowFile: 7 }]) {
    assert.equal(parseDeployConfigsFile(JSON.stringify({ schemaVersion: 1, generators: [{ ...entry, ...hints }] })).ok, false);
  }
});

test("a declared candidate must have a finite order", () => {
  const raw = '{"schemaVersion":1,"generators":[{"id":"example-host","label":"Example","module":"g.mjs","candidatePaths":[{"path":"example.toml","order":1e999}]}]}';
  assert.equal(parseDeployConfigsFile(raw).ok, false);
});

test("a missing bundled root yields no hints instead of failing the composition root", () => {
  const sourceRoot = path.join(tmpdir(), "candidate-data-missing-root-never-created");
  assert.deepEqual(readBundledDeployConfigDescriptors({ sourceRoot }), []);
  assert.equal(readBundledDeployWorkflowFile({ sourceRoot }), undefined);
  assert.deepEqual(readBundledDeployConfigCandidatePaths({ sourceRoot }), ["app.json"]);
});
