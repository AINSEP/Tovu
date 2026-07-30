import assert from "node:assert/strict";
import test from "node:test";

import { Command } from "commander";

import { introspectProgram, toMcpTools } from "../../introspect";

/**
 * @file SPEC-003 (added 2026-07-29, `CLI_INTROSPECT`) — unit tier for the pure introspection
 * functions, isolated from `commander`'s parsing/process-spawn concerns.
 */

function buildTestProgram(): Command {
  const program = new Command("tovu");
  program.description("test program");

  program
    .command("init")
    .description("init description")
    .argument("<dir>", "target dir")
    .option("--name <name>", "display name")
    .action(() => undefined);

  program
    .command("serve")
    .description("serve description")
    .argument("<dir>", "install dir")
    .option("--port <port>", "port", "3000")
    .option("--dry-run", "boolean switch, no value")
    .action(() => undefined);

  program.command("help").action(() => undefined);
  program.command("introspect").action(() => undefined);

  return program;
}

test("introspectProgram: reads real commands/arguments/options off the live Command tree", () => {
  const manifest = introspectProgram(buildTestProgram());

  assert.equal(manifest.name, "tovu");
  assert.equal(manifest.commands.length, 2, "meta commands (help, introspect) must be excluded");
  assert.deepEqual(
    manifest.commands.map((c) => c.name),
    ["init", "serve"]
  );

  const serve = manifest.commands.find((c) => c.name === "serve")!;
  assert.equal(serve.description, "serve description");
  assert.deepEqual(serve.arguments, [{ name: "dir", required: true, description: "install dir" }]);
  assert.equal(serve.options.length, 2);
  assert.deepEqual(serve.options[0], {
    flags: "--port <port>",
    attributeName: "port",
    description: "port",
    required: false,
    defaultValue: "3000",
    takesValue: true,
  });
  assert.equal(serve.options[1].takesValue, false, "a switch with no <value>/[value] must report takesValue: false");
});

test("toMcpTools: reshapes the manifest into MCP tool definitions, one per command, prefixed tovu_", () => {
  const manifest = introspectProgram(buildTestProgram());
  const tools = toMcpTools(manifest);

  assert.equal(tools.length, 2);
  const initTool = tools.find((t) => t.name === "tovu_init")!;
  assert.equal(initTool.description, "init description");
  assert.deepEqual(initTool.inputSchema, {
    type: "object",
    properties: {
      dir: { type: "string", description: "target dir" },
      name: { type: "string", description: "display name" },
    },
    required: ["dir"],
  });
});

test("toMcpTools: a boolean switch (--dry-run) is omitted from inputSchema properties — an agent has nothing to supply for it", () => {
  const manifest = introspectProgram(buildTestProgram());
  const tools = toMcpTools(manifest);
  const serveTool = tools.find((t) => t.name === "tovu_serve")!;

  assert.ok(!("dryRun" in serveTool.inputSchema.properties), "a valueless switch must not appear in the MCP inputSchema");
  assert.ok("port" in serveTool.inputSchema.properties);
});
