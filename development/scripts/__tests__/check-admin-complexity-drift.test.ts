import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { ESLint } from "eslint";
import { diffAgainstBaseline, type Violation } from "../check-src-complexity-drift.js";

const root = path.resolve(import.meta.dirname, "../../..");
const scanner = new ESLint({ cwd: root, overrideConfigFile: path.join(root, "development/scripts/complexity-eslint.config.mjs") });
const editor = new ESLint({ cwd: root, overrideConfigFile: path.join(root, "eslint.config.mjs") });

// A file-level allowance previously hid other functions in an already grandfathered file.
const known: Violation = {
  file: "apps/admin/src/lib/assistant-transport.ts", function: "translateRunAgentPayload#1",
  line: 20, rule: "complexity", value: 13,
};

test("admin ratchet catches another function and a worse known function", () => {
  const additional = { ...known, function: "buildLocalCliContextRef#1", value: 18 };
  const worse = { ...known, value: 14 };
  const result = diffAgainstBaseline([known], [additional, worse]);
  assert.deepEqual(result.added, [additional]);
  assert.deepEqual(result.worsened, [{ baseline: known, current: worse }]);
});

test("editor and scanner agree on both admin and non-admin error thresholds", async () => {
  for (const [file, threshold] of [
    ["apps/admin/src/features/seo/Seo.tsx", 9],
    ["apps/website/src/platform/db/migrations/runner.ts", 10],
    ["apps/desktop/src/main.js", 10],
    ["packages/contracts/src/index.ts", 10],
    ["content/agent-plugins/example/src/index.mjs", 10],
  ] as const) {
    for (const lint of [scanner, editor]) {
      const config = await lint.calculateConfigForFile(file);
      assert.deepEqual(config?.rules?.complexity, [2, threshold]);
      assert.deepEqual(config?.rules?.["sonarjs/cognitive-complexity"], [2, threshold]);
    }
  }
});

test("scanner excludes pinned migrations and test or generated artifacts, not the migration runner", async () => {
  for (const file of [
    "apps/website/src/platform/db/migrations/0041_owner_passkeys.ts",
    "apps/website/src/features/webmcp/generated/annotated-actions-script.ts",
    "apps/admin/src/features/seo/Seo.test.tsx",
    "apps/admin/src/features/seo/Seo.stories.tsx",
  ]) assert.equal(await scanner.isPathIgnored(file), true, file);
  assert.equal(await scanner.isPathIgnored("apps/website/src/platform/db/migrations/runner.ts"), false);
  assert.equal(await scanner.isPathIgnored("apps/website/src/platform/db/migrations/0042_new_step.ts"), false);
});
