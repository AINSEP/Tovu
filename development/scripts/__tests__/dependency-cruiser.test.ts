import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

test("declared theme leaves retain private-file and upward value-import boundaries", (t) => {
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "boundary-entries-")));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  fs.writeFileSync(path.join(scratch, "package.json"), '{"type":"module"}');
  fs.writeFileSync(path.join(scratch, "tsconfig.json"), '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext"}}');
  fs.copyFileSync(path.join(REPO_ROOT, ".dependency-cruiser.mjs"), path.join(scratch, ".dependency-cruiser.mjs"));
  fs.mkdirSync(path.join(scratch, "development/boundaries"), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, "development/boundaries/feature-ranks.json"), path.join(scratch, "development/boundaries/feature-ranks.json"));
  const src = path.join(scratch, "apps/website/src");
  for (const [file, source] of Object.entries({
    "features/theme/theme-page-eligibility.ts": "export const value = 1;\n",
    "features/theme/private.ts": "export const value = 2;\n",
    "features/media/upward.ts": 'import { value } from "../theme/theme-page-eligibility.js";\nexport const result = value;\n',
    "server/consumer.ts": 'import { value as approved } from "../features/theme/theme-page-eligibility.js";\nimport { value as privateValue } from "../features/theme/private.js";\nexport const values = [approved, privateValue];\n',
  })) {
    const filePath = path.join(src, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, source);
  }

  const result = spawnSync(process.execPath, [
    path.join(REPO_ROOT, "node_modules/dependency-cruiser/bin/dependency-cruise.mjs"),
    "--config", ".dependency-cruiser.mjs", "--output-type", "json", "apps/website/src",
  ], { cwd: scratch, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.error, undefined, `dependency-cruiser must start and finish: ${result.stderr}`);
  assert.equal(result.signal, null, "dependency-cruiser must finish without a process signal");
  const report = JSON.parse(result.stdout);
  assert.deepEqual(
    report.summary.violations.map((violation: { rule: { name: string; severity: string }; from: string; to: string }) =>
      [violation.rule.name, violation.rule.severity, violation.from, violation.to]).sort(),
    [
      ["feature-rank:2", "error", "apps/website/src/features/media/upward.ts", "apps/website/src/features/theme/theme-page-eligibility.ts"],
      ["no-deep-imports:features/theme", "error", "apps/website/src/server/consumer.ts", "apps/website/src/features/theme/private.ts"],
    ],
    "the declared leaf must be public while private files and upward value imports remain errors",
  );
});

test("deep-import rules exempt tests and current composition, retaining other production boundaries", (t) => {
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "boundary-scope-")));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  fs.writeFileSync(path.join(scratch, "package.json"), '{"type":"module"}');
  fs.writeFileSync(path.join(scratch, "tsconfig.json"), '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext"}}');
  fs.copyFileSync(path.join(REPO_ROOT, ".dependency-cruiser.mjs"), path.join(scratch, ".dependency-cruiser.mjs"));
  const src = path.join(scratch, "apps/website/src");
  const modules = ["platform/site-dir", "features/post", "features/theme", "features/media", "features/deployments"];
  for (const mod of modules) {
    fs.mkdirSync(path.join(src, mod), { recursive: true });
    fs.writeFileSync(path.join(src, mod, "internal.ts"), "export const value = 1;\n");
    fs.writeFileSync(path.join(src, mod, "index.ts"), 'export { value } from "./internal.js";\n');
  }
  const exempt = [
    "features/consumer/__tests__/fixture.ts",
    "features/consumer/consumer.unit.test.ts",
    "features/consumer/consumer.spec.ts",
    "platform/db/sqlite/consumer.test.ts",
    "server/runtime/composition/app.ts",
    "server/runtime/composition/deps.ts",
    "server/runtime/composition/modules/content.ts",
    "server/runtime/composition/site-path-resolvers.ts",
    "cli/commands/serve.ts",
    "cli/commands/adopt.ts",
    "index.ts",
  ];
  const guarded = [
    "features/consumer/production.ts",
    "features/consumer/test-helpers.ts",
    "server/inbound/public-http/handler.ts",
    "server/runtime/lifecycle/worker.ts",
    "server/runtime/composition-extra/helper.ts",
    "cli/commands/other.ts",
  ];
  for (const caller of [...exempt, ...guarded]) {
    const callerPath = path.join(src, caller);
    fs.mkdirSync(path.dirname(callerPath), { recursive: true });
    const imports = modules.map((mod) => {
      let relative = path.relative(path.dirname(callerPath), path.join(src, mod, "internal.js")).split(path.sep).join("/");
      if (!relative.startsWith(".")) relative = `./${relative}`;
      return `import ${JSON.stringify(relative)};`;
    });
    fs.writeFileSync(callerPath, imports.join("\n"));
  }

  const result = spawnSync(process.execPath, [
    path.join(REPO_ROOT, "node_modules/dependency-cruiser/bin/dependency-cruise.mjs"),
    "--config", ".dependency-cruiser.mjs", "--output-type", "json", "apps/website/src",
  ], { cwd: scratch, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, `dependency-cruiser failed before producing its graph: ${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.ok(report.modules.length > 0, "the fixture must produce a real dependency graph");
  for (const mod of modules) {
    const violations = report.summary.violations.filter(
      (violation: { rule: { name: string } }) => violation.rule.name === `no-deep-imports:${mod}`,
    );
    assert.deepEqual(
      violations.map((violation: { from: string }) => violation.from).sort(),
      guarded.map((caller) => `apps/website/src/${caller}`).sort(),
      `${mod}: only production files outside composition may be flagged`,
    );
  }
  assert.equal(report.summary.violations.some(
    (violation: { rule: { name: string }; from: string }) =>
      violation.rule.name.startsWith("no-deep-value-imports-from-db-sqlite:") && violation.from.endsWith("consumer.test.ts"),
  ), false, "colocated adapter tests must also be exempt from the companion rules");
});
