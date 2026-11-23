import assert from "node:assert/strict";
import test from "node:test";

import { printIntrospection } from "@jini-ai/cli/introspection";
import { Command } from "commander";

import { ValidationError } from "../../../platform/site-dir/index.js";
import { introspectProgram, TOVU_TOOL_PREFIX, toMcpTools } from "../../introspect.js";
import { createProgram } from "../../program.js";

/**
 * @file `tovu introspect [--format]` — unit tier. The formatter moved to `@jini-ai/cli/introspection`
 * `printIntrospection` (P13-C2); these tests bind it to Tovu's ports and prefix exactly as
 * `program.ts` does, and also drive the real `createProgram()` action. The live `Command`-tree
 * introspection itself is covered by `introspect.unit.test.ts`.
 */

const program = new Command("tovu").description("test program");
program.command("init").description("init a site").argument("<dir>", "target dir").option("--name <name>", "display name").action(() => undefined);
const manifest = introspectProgram(program);

function tovuPorts(out: string[]) {
  return {
    output: ({ message }: { message: string }) => { out.push(message); },
    invalid: ({ message }: { message: string }) => new ValidationError({ message }),
  };
}

test("defaults to the raw commander manifest as pretty JSON plus a newline", () => {
  const out: string[] = [];
  printIntrospection({ manifest, toolNamePrefix: TOVU_TOOL_PREFIX, ...tovuPorts(out) });
  assert.deepEqual(out, [`${JSON.stringify(manifest, null, 2)}\n`]);
});

test("--format mcp reshapes the manifest into MCP tool definitions with exact tovu_ names", () => {
  const out: string[] = [];
  printIntrospection({ manifest, format: "mcp", toolNamePrefix: TOVU_TOOL_PREFIX, ...tovuPorts(out) });
  const tools = JSON.parse(out.join("")) as Array<{ name: string }>;
  assert.deepEqual(tools, JSON.parse(JSON.stringify(toMcpTools(manifest))));
  assert.deepEqual(tools.map((tool) => tool.name), ["tovu_init"]);
});

test("an unknown --format is refused without printing", () => {
  const out: string[] = [];
  assert.throws(() => printIntrospection({ manifest, format: "yaml", toolNamePrefix: TOVU_TOOL_PREFIX, ...tovuPorts(out) }),
    { name: "ValidationError", message: '--format must be one of: commander, mcp (got "yaml")' });
  assert.deepEqual(out, []);
});

test("the real introspect action writes exact MCP tool names to stdout", async (t) => {
  const written: string[] = [];
  t.mock.method(process.stdout, "write", (chunk: string) => { written.push(chunk); return true; });
  await createProgram().parseAsync(["introspect", "--format", "mcp"], { from: "user" });
  t.mock.restoreAll();
  const names = (JSON.parse(written.join("")) as Array<{ name: string }>).map((tool) => tool.name);
  assert.ok(names.includes("tovu_init"), "init is exposed under the tovu_ prefix");
  assert.ok(names.includes("tovu_storage_move"), "nested commands are joined with underscores");
  assert.ok(names.every((name) => name.startsWith("tovu_")));
});

test("the real introspect action refuses an unknown --format with Tovu's ValidationError", async () => {
  await assert.rejects(createProgram().parseAsync(["introspect", "--format", "yaml"], { from: "user" }),
    (err: unknown) => err instanceof ValidationError && err.message === '--format must be one of: commander, mcp (got "yaml")');
});
