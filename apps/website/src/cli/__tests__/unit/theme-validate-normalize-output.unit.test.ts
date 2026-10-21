import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { runThemeNormalizeBuildCommand } from "../../commands/theme/normalize-build.js";
import { runThemeValidateCommand } from "../../commands/theme/validate.js";
import type { NormalizeBuildOutputResult, ValidateThemePackageResult } from "#src/features/theme/index";

/**
 * @file `tovu theme validate` / `tovu theme normalize-build` — the printed report and exit code for
 * every result shape, with the theme services replaced by fakes. The real services run against owned
 * theme directories in `theme-command-gaps.unit.test.ts` and the integration tier.
 */

const dir = path.join(path.sep, "themes", "acme");

async function validate(result: ValidateThemePackageResult, input: { profile?: string; json?: boolean } = {}) {
  const out: string[] = []; const codes: number[] = []; const calls: unknown[] = [];
  await runThemeValidateCommand({ dir, ...input }, {
    validate: (required) => { calls.push(required); return result; },
    output: (message) => out.push(message), setExitCode: (code) => codes.push(code),
  });
  return { out: out.join(""), codes, calls };
}

test("validate defaults to the author profile and prints VALID with no finding sections", async () => {
  const { out, codes, calls } = await validate({ valid: true, schemaVersion: 2, errors: [], warnings: [] });
  assert.deepEqual(calls, [{ themeDir: dir, id: "acme", profile: "author" }]);
  assert.equal(out, "theme 'acme' (schema v2, profile: author): VALID\n");
  assert.deepEqual(codes, []);
});

test("validate lists errors and warnings, with a path only when the finding has one, and exits 1 when invalid", async () => {
  const { out, codes } = await validate({ valid: false, schemaVersion: 1,
    errors: [{ ruleId: "manifest.id", message: "id mismatch", path: "theme.json", severity: "error" }],
    warnings: [{ ruleId: "assets.size", message: "large image", severity: "warning" }] }, { profile: "publish" });
  assert.equal(out, [
    "theme 'acme' (schema v1, profile: publish): INVALID",
    "errors (1):", "  [manifest.id] (theme.json) id mismatch",
    "warnings (1):", "  [assets.size] large image",
  ].join("\n") + "\n");
  assert.deepEqual(codes, [1]);
});

test("validate --json prints the raw result; an unknown profile is refused before validating", async () => {
  const result: ValidateThemePackageResult = { valid: true, schemaVersion: 2, errors: [], warnings: [] };
  assert.deepEqual(JSON.parse((await validate(result, { json: true, profile: "install" })).out), result);
  const calls: unknown[] = [];
  await assert.rejects(runThemeValidateCommand({ dir, profile: "strict" }, { validate: (required) => { calls.push(required); return result; } }),
    { name: "ValidationError", message: '--profile must be one of: author, publish, install (got "strict")' });
  assert.deepEqual(calls, []);
});

function normalized(discarded: string[]): NormalizeBuildOutputResult {
  return { plan: { relocations: [{ from: "app.css", to: "assets/app.css" }] },
    rewrittenPageFiles: ["index.html"], discardedFiles: discarded };
}

test("normalize-build defaults --pages to index.html and summarises moves, rewrites and discards", async () => {
  const out: string[] = []; const calls: unknown[] = [];
  await runThemeNormalizeBuildCommand({ dir, primaryStylesheet: "app.css" }, {
    normalize: (required) => { calls.push(required); return normalized([".vite", "manifest.json"]); }, output: (message) => out.push(message) });
  assert.deepEqual(calls, [{ outputDir: dir, pageFileNames: ["index.html"], primaryStylesheetFile: "app.css" }]);
  assert.equal(out.join(""), [
    "normalized 1 asset file(s), rewrote 1 page file(s)", "  moved app.css -> assets/app.css", "  rewrote index.html",
    "discarded 2 framework artifact(s): .vite, manifest.json",
  ].join("\n") + "\n");
});

test("normalize-build trims the --pages list, omits an empty discard line, and --json prints the raw result", async () => {
  const out: string[] = []; const calls: Array<{ pageFileNames: readonly string[] }> = [];
  await runThemeNormalizeBuildCommand({ dir, primaryStylesheet: "app.css", pages: " index.html , ,about.html" }, {
    normalize: (required) => { calls.push(required); return normalized([]); }, output: (message) => out.push(message) });
  assert.deepEqual(calls[0]!.pageFileNames, ["index.html", "about.html"]);
  assert.doesNotMatch(out.join(""), /discarded/);
  const json: string[] = [];
  await runThemeNormalizeBuildCommand({ dir, primaryStylesheet: "app.css", json: true }, { normalize: () => normalized([]), output: (message) => json.push(message) });
  assert.deepEqual(JSON.parse(json.join("")), normalized([]));
});

test("normalize-build refuses a missing stylesheet or an empty page list before touching the folder", async () => {
  const calls: unknown[] = [];
  const normalize = (required: unknown) => { calls.push(required); return normalized([]); };
  await assert.rejects(runThemeNormalizeBuildCommand({ dir }, { normalize }), { name: "ValidationError", message: /--primary-stylesheet is required/ });
  await assert.rejects(runThemeNormalizeBuildCommand({ dir, primaryStylesheet: "app.css", pages: " , " }, { normalize }),
    { name: "ValidationError", message: "--pages must name at least one HTML file (got an empty list)" });
  assert.deepEqual(calls, []);
});

test("normalize-build writes its summary to stdout by default", async (t) => {
  const written: string[] = [];
  t.mock.method(process.stdout, "write", (chunk: string) => { written.push(chunk); return true; });
  await runThemeNormalizeBuildCommand({ dir, primaryStylesheet: "app.css" }, { normalize: () => normalized([]) });
  t.mock.restoreAll();
  assert.deepEqual(written, ["normalized 1 asset file(s), rewrote 1 page file(s)\n  moved app.css -> assets/app.css\n  rewrote index.html\n"]);
});
