import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const adminRequire = createRequire(new URL("../../../apps/admin/package.json", import.meta.url));
const { loadConfigFromFile } = await import(adminRequire.resolve("vite"));

async function coverageThresholds(args: string[]) {
  const savedArgv = process.argv;
  process.argv = [...savedArgv.slice(0, 2), "run", "--coverage", ...args];
  try {
    const loaded = await loadConfigFromFile({ command: "serve", mode: "test" }, fileURLToPath(new URL("../../../apps/admin/vitest.config.ts", import.meta.url)));
    assert.ok(loaded, "the shipped Vitest config loads");
    return (loaded.config as { test?: { coverage?: { thresholds?: unknown } } }).test?.coverage?.thresholds;
  } finally {
    process.argv = savedArgv;
  }
}

test("the full admin coverage suite keeps every policy floor", async () => {
  assert.deepEqual(await coverageThresholds([]), { statements: 98, branches: 98, functions: 98, lines: 98 });
});

test("scoped admin coverage reports do not apply full-suite policy floors", async t => {
  for (const args of [
    ["src/lib/__tests__/format-timestamp.unit.test.ts"],
    ["--testNamePattern", "renders a date"],
    ["--changed", "HEAD~1"],
    ["--related", "src/lib/format-timestamp.ts"],
    ["--shard", "1/2"],
    ["--exclude", "**/slow.test.ts"],
    ["--project", "one"],
    ["--dir", "src/lib"],
    ["--coverage.include", "src/lib/format-timestamp.ts"],
  ]) {
    await t.test(args.join(" "), async () => assert.equal(await coverageThresholds(args), undefined));
  }
});
