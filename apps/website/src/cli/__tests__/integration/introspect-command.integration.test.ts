import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { childProcessCoverageEnv } from "#src/contracts/core/child-process-coverage-env";

/**
 * @file SPEC-003 (added 2026-07-29, `CLI_INTROSPECT`) — TDD certification, integration
 * (process-spawn) tier. Traces: REQ-08/REQ-09, api.spec.md's `CLI_INTROSPECT` contract.
 *
 * Invocation mirrors `init-command.integration.test.ts`'s convention: spawns through `tsx`'s
 * dev-mode transform directly, no prior `npm run build` required.
 */

const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");

/** See `export-command.integration.test.ts`'s identical constant for why this exists and why one
 * shared directory for the whole file is safe. */
const WORKER_COVERAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-introspect-worker-coverage-"));
after(() => fs.rmSync(WORKER_COVERAGE_DIR, { recursive: true, force: true }));

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI_MAIN, ...args], {
    encoding: "utf8",
    env: childProcessCoverageEnv(WORKER_COVERAGE_DIR),
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("tovu introspect: exits 0 and prints valid JSON describing init/serve/export — matches the live CLI, not a hand-maintained doc", () => {
  const result = runCli(["introspect"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);

  const manifest = JSON.parse(result.stdout);
  assert.equal(manifest.name, "tovu");
  const names = manifest.commands.map((c: { name: string }) => c.name);
  assert.deepEqual(
    names,
    // "theme generate-index" (`cli/commands/theme/generate-index.ts`) and "theme normalize-build"
    // (`cli/commands/theme/normalize-build.ts`) are real, registered subcommands (`cli/program.ts`),
    // each with their own integration test file -- added to `program.ts` after this list was
    // originally written and never reflected here. "deploy config" (`cli/commands/deploy-config.ts`)
    // is the same story, added later still.
    ["init", "serve", "export", "theme validate", "theme migrate", "theme generate-index", "theme normalize-build", "deploy config"],
    "introspect must list the real registered commands (nested subcommands flattened to their full invocation path), and exclude itself/help"
  );

  const serve = manifest.commands.find((c: { name: string }) => c.name === "serve");
  const flags = serve.options.map((o: { flags: string }) => o.flags);
  assert.ok(flags.some((f: string) => f.startsWith("--workspace")), "must reflect the real --workspace flag, not a stale copy");
});

test("tovu introspect --format mcp: exits 0 and prints valid MCP tool definitions", () => {
  const result = runCli(["introspect", "--format", "mcp"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);

  const tools = JSON.parse(result.stdout);
  assert.ok(Array.isArray(tools));
  const names = tools.map((t: { name: string }) => t.name);
  assert.deepEqual(names, [
    "tovu_init",
    "tovu_serve",
    "tovu_export",
    "tovu_theme_validate",
    "tovu_theme_migrate",
    "tovu_theme_generate-index",
    "tovu_theme_normalize-build",
    "tovu_deploy_config",
  ]);

  const serveTool = tools.find((t: { name: string }) => t.name === "tovu_serve");
  assert.equal(serveTool.inputSchema.type, "object");
  assert.ok(serveTool.inputSchema.required.includes("dir"));
  assert.ok("workspace" in serveTool.inputSchema.properties);
});

test("tovu introspect --format <bad>: rejected as VALIDATION (exit 2), not a silent fallback", () => {
  const result = runCli(["introspect", "--format", "yaml"]);
  assert.equal(result.status, 2, `stderr: ${result.stderr}`);
  assert.match(result.stderr, /^tovu: VALIDATION:/m);
});
