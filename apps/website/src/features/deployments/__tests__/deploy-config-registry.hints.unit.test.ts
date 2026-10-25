import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "../../agent-plugins/__tests__/fixtures/force-remove.js";
import {
  DEPLOY_CONFIGS_FILENAME,
  isContainedDeployConfigPath,
  parseDeployConfigsFile,
  readBundledDeployConfigCandidatePaths,
  readBundledDeployWorkflowFile,
  readBundledDeployWorkflowFiles,
} from "../deploy-config-registry.js";

/**
 * @file The bundled deploy-config HINT readers (Stryker lane L14: `deploy-config-registry.ts` 71.5 %,
 * 30 no-coverage — lines 222-232, 256-257 never ran): candidate-path ordering and de-duplication with
 * the neutral `app.json`, the single-workflow rule ("ambiguity never guesses"), and the contained
 * repo-relative path check every hint must pass.
 */

async function withRoot(plugins: Record<string, Record<string, unknown>[] | string>, fn: (root: string) => Promise<void> | void): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-deploy-hints-"));
  try {
    for (const [id, generators] of Object.entries(plugins)) {
      await mkdir(path.join(root, id), { recursive: true });
      await writeFile(path.join(root, id, "plugin.json"), JSON.stringify({ name: id, version: "1.0.0" }));
      await writeFile(path.join(root, id, DEPLOY_CONFIGS_FILENAME),
        typeof generators === "string" ? generators : JSON.stringify({ schemaVersion: 1, generators }));
    }
    await fn(root);
  } finally { await forceRemove(root); }
}

const gen = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: id, module: `${id}.mjs`, ...extra });

test("candidate paths: sorted by order across plugins, app.json appended at order 4, duplicates kept once (first wins)", async () => {
  await withRoot({
    alpha: [gen("a", { candidatePaths: [{ path: "fly.toml", order: 1 }, { path: "app.json", order: 0 }] })],
    beta: [gen("b", { candidatePaths: [{ path: "render.yaml", order: 5 }, { path: "fly.toml", order: 9 }] })],
  }, (root) => {
    assert.deepEqual(readBundledDeployConfigCandidatePaths({ sourceRoot: root }), ["app.json", "fly.toml", "render.yaml"]);
  });
});

test("candidate paths: no declarations still offers the neutral app.json; a missing root yields only app.json", async () => {
  await withRoot({ alpha: [gen("a")] }, (root) => {
    assert.deepEqual(readBundledDeployConfigCandidatePaths({ sourceRoot: root }), ["app.json"]);
  });
  assert.deepEqual(readBundledDeployConfigCandidatePaths({ sourceRoot: path.join(tmpdir(), "definitely-missing-root-f8") }), ["app.json"]);
});

test("workflow file: exactly one distinct declared workflow is returned; none or two distinct ones is undefined (never guessed)", async () => {
  await withRoot({ alpha: [gen("a", { workflowFile: "deploy.yml" })], beta: [gen("b", { workflowFile: "deploy.yml" })] }, (root) => {
    assert.equal(readBundledDeployWorkflowFile({ sourceRoot: root }), "deploy.yml");
    assert.deepEqual(readBundledDeployWorkflowFiles({ sourceRoot: root }), ["deploy.yml"]);
  });
  await withRoot({ alpha: [gen("a", { workflowFile: "one.yml" })], beta: [gen("b", { workflowFile: "two.yaml" })] }, (root) => {
    assert.equal(readBundledDeployWorkflowFile({ sourceRoot: root }), undefined);
    assert.deepEqual(readBundledDeployWorkflowFiles({ sourceRoot: root }), ["one.yml", "two.yaml"]);
  });
  await withRoot({ alpha: [gen("a")] }, (root) => {
    assert.equal(readBundledDeployWorkflowFile({ sourceRoot: root }), undefined);
    assert.deepEqual(readBundledDeployWorkflowFiles({ sourceRoot: root }), []);
  });
});

test("hints from an invalid manifest or a duplicated generator id are ignored", async () => {
  await withRoot({
    alpha: [gen("dup", { workflowFile: "a.yml", candidatePaths: [{ path: "a.toml", order: 1 }] })],
    beta: [gen("dup", { workflowFile: "b.yml" })],
    gamma: "{",
  }, (root) => {
    assert.equal(readBundledDeployWorkflowFile({ sourceRoot: root }), undefined);
    assert.deepEqual(readBundledDeployWorkflowFiles({ sourceRoot: root }), []);
    assert.deepEqual(readBundledDeployConfigCandidatePaths({ sourceRoot: root }), ["app.json"]);
  });
});

test("isContainedDeployConfigPath: repo-relative, safe characters, ≤ 512, no '.'/'..'/empty segment", () => {
  const cases: Array<[unknown, boolean]> = [
    ["app.json", true], [".github/workflows/deploy.yml", true], ["a".repeat(512), true],
    ["a".repeat(513), false], ["", false], ["/etc/passwd", false], ["../x", false], ["a/../b", false], ["./a", false],
    ["a//b", false], ["a/", false], ["a\\b", false], ["C:x", false], ["a b", false], ["a\n", false], [5, false], [null, false],
  ];
  for (const [value, ok] of cases) assert.equal(isContainedDeployConfigPath({ value }), ok, JSON.stringify(value));
});

test("parse: candidatePaths and workflowFile shapes are validated with exact reasons", () => {
  const reason = (extra: Record<string, unknown>) => {
    const r = parseDeployConfigsFile(JSON.stringify({ schemaVersion: 1, generators: [gen("a", extra)] }));
    return r.ok ? r.descriptors : r.reason;
  };
  const CP = "generators[0].candidatePaths must contain repo-relative paths and finite orders";
  const WF = "generators[0].workflowFile must be a workflow filename";
  for (const candidatePaths of ["x", [{ path: "../x", order: 1 }], [{ path: "a", order: Infinity }], [{ path: "a", order: "1" }], [null], [["a", 1]]]) {
    assert.equal(reason({ candidatePaths }), CP, JSON.stringify(candidatePaths));
  }
  for (const workflowFile of [5, "deploy", "deploy.yml.bak", "dir/deploy.yml", ".yml", "a b.yml"]) {
    assert.equal(reason({ workflowFile }), WF, JSON.stringify(workflowFile));
  }
  assert.deepEqual(reason({ workflowFile: "deploy.yaml", candidatePaths: [{ path: "fly.toml", order: 0.5 }] }), [
    { id: "a", label: "a", module: "a.mjs", candidatePaths: [{ path: "fly.toml", order: 0.5 }], workflowFile: "deploy.yaml" },
  ]);
});
