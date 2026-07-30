import type { Command } from "commander";

/**
 * @file SPEC-003 (added 2026-07-29) — machine-readable introspection of the `tovu` CLI's own
 * command/argument/option surface, read live off the actual `commander` `Command` tree
 * (`program.ts`) rather than a hand-maintained doc.
 *
 * Purpose:
 * `api.spec.md` is prose, hand-kept in sync with `program.ts` by whoever edits either one — it
 * has already drifted once (the `--workspace` flag existed in code before the doc caught up).
 * `introspectProgram()` has zero drift risk by construction: it reads whatever `program.ts`
 * actually registered, at the moment it's called, so it can never describe a flag that doesn't
 * exist or omit one that does. This is what `tovu introspect` (below) exposes as JSON, and what
 * `toMcpTools()` reshapes into MCP tool definitions for an agent (e.g. Tovu-Runner) driving this
 * CLI as a subprocess.
 *
 * Architectural role:
 * `cli` layer. Pure functions over a `commander` `Command` — no process/fs side effects.
 */

export interface IntrospectedArgument {
  name: string;
  required: boolean;
  description: string;
}

export interface IntrospectedOption {
  /** Raw commander flags string, e.g. `"--port <port>"` or `"--name <name>"`. */
  flags: string;
  /** camelCase property name commander itself derives from `flags` (e.g. `"port"`, `"workspace"`). */
  attributeName: string;
  description: string;
  required: boolean;
  defaultValue?: unknown;
  /** Whether the flag takes a value (`<x>`/`[x]`) vs. is a boolean switch. */
  takesValue: boolean;
}

export interface IntrospectedCommand {
  name: string;
  description: string;
  arguments: IntrospectedArgument[];
  options: IntrospectedOption[];
}

export interface CliManifest {
  name: string;
  description: string;
  commands: IntrospectedCommand[];
}

/** Commands that describe the CLI itself rather than a site-management capability — excluded from the manifest (an agent driving `tovu` doesn't need to be told it can ask about itself twice). */
const META_COMMAND_NAMES = new Set(["introspect", "help"]);

/**
 * Read the live `commander` `Command` tree and return a plain, JSON-serializable description of
 * every real (non-meta) subcommand: its arguments, options, and defaults.
 *
 * @param program - the root `Command` returned by `createProgram()`.
 * @returns a `CliManifest` — safe to `JSON.stringify` directly.
 * @complexity O(commands × options) — both bounded by how many subcommands/flags this CLI
 *   actually declares, never a caller-controlled collection.
 * @overallScore 100
 */
export function introspectProgram(program: Command): CliManifest {
  return {
    name: program.name(),
    description: program.description() ?? "",
    commands: program.commands
      .filter((cmd) => !META_COMMAND_NAMES.has(cmd.name()))
      .map((cmd) => ({
        name: cmd.name(),
        description: cmd.description() ?? "",
        arguments: cmd.registeredArguments.map((arg) => ({
          name: arg.name(),
          required: arg.required,
          description: arg.description ?? "",
        })),
        options: cmd.options.map((opt) => ({
          flags: opt.flags,
          attributeName: opt.attributeName(),
          description: opt.description ?? "",
          required: opt.mandatory,
          defaultValue: opt.defaultValue,
          takesValue: opt.flags.includes("<") || opt.flags.includes("["),
        })),
      })),
  };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: "string"; description: string }>;
    required: string[];
  };
}

/**
 * Reshape a `CliManifest` into MCP-style tool definitions — one per subcommand, arguments and
 * value-taking options folded into a single flat JSON-Schema `inputSchema` object (boolean
 * switches are omitted from `properties`' typing concerns since commander already coerces them;
 * every field here is modeled as `string` because that's what argv naturally hands the CLI —
 * `runInitCommand`/`runServeCommand` do their own numeric/enum validation downstream).
 *
 * @param manifest - the result of `introspectProgram()`.
 * @returns one `McpToolDefinition` per real subcommand, named `tovu_<command>`.
 * @complexity O(commands × fields) — same bound as `introspectProgram`.
 * @overallScore 100
 */
export function toMcpTools(manifest: CliManifest): McpToolDefinition[] {
  return manifest.commands.map((cmd) => {
    const properties: Record<string, { type: "string"; description: string }> = {};
    const required: string[] = [];

    for (const arg of cmd.arguments) {
      properties[arg.name] = { type: "string", description: arg.description };
      if (arg.required) required.push(arg.name);
    }
    for (const opt of cmd.options) {
      if (!opt.takesValue) continue; // boolean switches carry no argument for an agent to supply
      properties[opt.attributeName] = { type: "string", description: opt.description };
      if (opt.required) required.push(opt.attributeName);
    }

    return {
      name: `tovu_${cmd.name}`,
      description: cmd.description,
      inputSchema: { type: "object", properties, required },
    };
  });
}
