import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { runThemeMigrateCommand } from "../../commands/theme/migrate.js";
import type { MigrateThemeResult } from "#src/features/theme/migration/migrate-theme";

/**
 * @file `tovu theme migrate` — the operator-facing summary for every migration outcome, with the
 * migrator replaced by a fake returning each result shape. Real migrations against owned theme
 * directories are covered by `theme-command-gaps.unit.test.ts` and the integration tier.
 */

const dir = path.join(path.sep, "themes", "acme");

async function run(result: MigrateThemeResult, input: { dryRun?: boolean; json?: boolean } = {}) {
  const out: string[] = [];
  const codes: number[] = [];
  const calls: unknown[] = [];
  await runThemeMigrateCommand({ dir, ...input }, {
    migrate: (required, optional) => { calls.push({ required, optional }); return result; },
    output: (message) => out.push(message), setExitCode: (code) => codes.push(code),
  });
  return { out: out.join(""), codes, calls };
}

test("passes the theme folder and its basename id, and forwards --dry-run", async () => {
  const { calls } = await run({ themeId: "acme", status: "already-migrated" }, { dryRun: true });
  assert.deepEqual(calls, [{ required: { themeDir: dir, id: "acme" }, optional: { dryRun: true } }]);
});

test("successful outcomes print one line and leave the exit code alone", async () => {
  assert.deepEqual(await run({ themeId: "acme", status: "already-migrated" }), { out: "theme 'acme': already schema v2, nothing to do\n", codes: [], calls: [{ required: { themeDir: dir, id: "acme" }, optional: { dryRun: undefined } }] });
  assert.equal((await run({ themeId: "acme", status: "staged-dry-run", outputDir: "/tmp/stage" })).out,
    "theme 'acme': dry run OK — staged v2 output at /tmp/stage, real theme directory untouched\n");
  assert.equal((await run({ themeId: "acme", status: "migrated", outputDir: dir, backupDir: "/themes/acme.v1" })).out,
    "theme 'acme': migrated to schema v2 in place — v1 backup kept at /themes/acme.v1\n");
});

test("a failure lists its reason, validator and load errors, the staged output, and exits 1", async () => {
  const { out, codes } = await run({
    themeId: "acme", status: "failed", reason: "validator rejected the output",
    validation: { errors: [{ ruleId: "manifest.tier", message: "unknown tier" }] } as unknown as MigrateThemeResult["validation"],
    loadErrors: ["render/pages/index.html: unclosed tag"], outputDir: "/tmp/stage",
  });
  assert.equal(out, [
    "theme 'acme': migration FAILED — validator rejected the output",
    "  [validator:manifest.tier] unknown tier",
    "  [loadTheme] render/pages/index.html: unclosed tag",
    "staged output left for inspection at /tmp/stage",
  ].join("\n") + "\n");
  assert.deepEqual(codes, [1]);
});

test("a bare failure points at the errors below instead of inventing a reason", async () => {
  const { out, codes } = await run({ themeId: "acme", status: "failed" });
  assert.equal(out, "theme 'acme': migration FAILED — see validation/load errors below\n");
  assert.deepEqual(codes, [1]);
});

test("--json prints the raw result, failures included, and still exits 1 on failure", async () => {
  const result: MigrateThemeResult = { themeId: "acme", status: "failed", reason: "boom" };
  const { out, codes } = await run(result, { json: true });
  assert.deepEqual(JSON.parse(out), result);
  assert.deepEqual(codes, [1]);
});
