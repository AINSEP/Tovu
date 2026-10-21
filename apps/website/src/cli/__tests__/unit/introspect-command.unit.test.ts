import assert from "node:assert/strict";
import test from "node:test";

import { runIntrospectCommand } from "../../commands/introspect.js";
import { Command } from "commander";

import { introspectProgram, toMcpTools } from "../../introspect.js";

/**
 * @file `tovu introspect [--format]` — unit tier for the formatter over an already-built manifest.
 * The live `Command`-tree introspection itself is covered by `introspect.unit.test.ts`.
 */

const program = new Command("tovu").description("test program");
program.command("init").description("init a site").argument("<dir>", "target dir").option("--name <name>", "display name").action(() => undefined);
const manifest = introspectProgram(program);

test("defaults to the raw commander manifest as pretty JSON plus a newline", async () => {
  const out: string[] = [];
  await runIntrospectCommand({ manifest }, { output: (message) => out.push(message) });
  assert.deepEqual(out, [`${JSON.stringify(manifest, null, 2)}\n`]);
});

test("--format mcp reshapes the manifest into MCP tool definitions", async () => {
  const out: string[] = [];
  await runIntrospectCommand({ manifest, format: "mcp" }, { output: (message) => out.push(message) });
  const tools = JSON.parse(out.join("")) as Array<{ name: string }>;
  assert.deepEqual(tools, JSON.parse(JSON.stringify(toMcpTools(manifest))));
  assert.ok(tools.some((tool) => tool.name.includes("init")), "the init command becomes a tool");
});

test("an unknown --format is refused without printing", async () => {
  const out: string[] = [];
  await assert.rejects(runIntrospectCommand({ manifest, format: "yaml" }, { output: (message) => out.push(message) }),
    { name: "ValidationError", message: '--format must be one of: commander, mcp (got "yaml")' });
  assert.deepEqual(out, []);
});

test("without an injected output it writes to stdout", async (t) => {
  const written: string[] = [];
  t.mock.method(process.stdout, "write", (chunk: string) => { written.push(chunk); return true; });
  await runIntrospectCommand({ manifest, format: "commander" });
  t.mock.restoreAll();
  assert.deepEqual(written, [`${JSON.stringify(manifest, null, 2)}\n`]);
});
