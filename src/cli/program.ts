import { Command } from "commander";

import { runExportCommand } from "./commands/export";
import { runInitCommand } from "./commands/init";
import { runIntrospectCommand } from "./commands/introspect";
import { runServeCommand } from "./commands/serve";
import { introspectProgram } from "./introspect";

/**
 * @file SPEC-003 — the single `commander` `Command` program: the one source of truth for the
 * `tovu` CLI's subcommands and options (ADR-PIPE-003 v1.1.0 Enforcement — no command may
 * hand-roll its own argv tokenization alongside this).
 *
 * Purpose:
 * Declares `init`/`serve` and their positional/option shape. Commander itself performs argv
 * tokenization and basic coercion (e.g. required-argument enforcement); all VALUE-level
 * validation (empty `--name`, out-of-range `--port`) is `site-dir`'s / the command modules' job,
 * not commander's, so validation error text and classes stay stable regardless of the parsing
 * library underneath.
 *
 * `configureOutput({ writeErr: () => {} })` suppresses commander's OWN default error/usage
 * writes to stderr — `cli/main.ts` is the sole writer of the `tovu: <CODE>: <message>` stderr
 * contract (errors.spec.md §1: "exactly one machine-parseable stderr line"); commander's help
 * output (`--help`, `helpInformation()`) still goes through `writeOut` (stdout), unaffected.
 *
 * Architectural role:
 * `cli` layer. Never imports Drizzle types directly (dependency-cruiser rule
 * `cli-no-direct-drizzle-imports`).
 */
export function createProgram(): Command {
  const program = new Command("tovu");
  program.description("Tovu — the website product you own. Manage local site install directories.");
  program.exitOverride();
  program.configureOutput({ writeErr: () => {} });

  program
    .command("init")
    .description("instantiate the starter template into a new install dir")
    .argument("<dir>", "target install directory")
    .option("--name <name>", "site display name (defaults to the directory's basename)")
    .action(async (dir: string, options: { name?: string }) => {
      await runInitCommand({ dir, name: options.name });
    });

  program
    .command("serve")
    .description("validate, migrate, and boot an install dir — serves site + admin")
    .argument("<dir>", "install directory to serve")
    .option("--port <port>", "port to listen on (default: config.json.port, then PORT env, then 3000)")
    .option("--workspace <id>", "workspace id to serve (default: the oldest workspace, if the install has more than one)")
    .action(async (dir: string, options: { port?: string; workspace?: string }) => {
      await runServeCommand({ dir, port: options.port, workspaceId: options.workspace });
    });

  program
    .command("export")
    .description("render the install dir's public site to a folder of static files (no admin, no browser)")
    .argument("<dir>", "install directory to export")
    .option("--out <dir>", "output directory (default: $TOVU_EXPORT_DIR, then <cwd>/infra/export)")
    .option("--workspace <id>", "workspace id to export (default: the oldest workspace, if the install has more than one)")
    .option("--clean", "remove the output directory's existing contents first, if any")
    .option("--base-path <path>", 'rewrite root-relative links/assets for a subpath deploy (e.g. "/my-repo" for a GitHub Pages project site) — omit for an apex-domain deploy')
    .action(async (dir: string, options: { out?: string; workspace?: string; clean?: boolean; basePath?: string }) => {
      await runExportCommand({ dir, out: options.out, workspaceId: options.workspace, clean: options.clean, basePath: options.basePath });
    });

  program
    .command("introspect")
    .description("output a machine-readable JSON description of this CLI's own commands and options (for programmatic/agent callers, e.g. Tovu-Runner)")
    .option("--format <format>", 'output format: "commander" (raw command/option shape) or "mcp" (MCP tool definitions)', "commander")
    .action(async (options: { format?: string }) => {
      await runIntrospectCommand({ manifest: introspectProgram(program), format: options.format });
    });

  return program;
}
