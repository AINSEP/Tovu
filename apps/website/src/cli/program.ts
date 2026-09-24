import { Command } from "commander";

import { runAdoptCommand } from "./commands/adopt.js";
import { runDeployConfigCommand } from "./commands/deploy-config.js";
import { runExportCommand } from "./commands/export.js";
import { runInitCommand } from "./commands/init.js";
import { runIntrospectCommand } from "./commands/introspect.js";
import { runServeCommand } from "./commands/serve.js";
import { runThemeGenerateIndexCommand } from "./commands/theme/generate-index.js";
import { runThemeMigrateCommand } from "./commands/theme/migrate.js";
import { runThemeNormalizeBuildCommand } from "./commands/theme/normalize-build.js";
import { runThemeSyncOriginalsCommand } from "./commands/theme/sync-originals.js";
import { runThemeValidateCommand } from "./commands/theme/validate.js";
import { introspectProgram } from "./introspect.js";

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

  // Registered next to `init` deliberately: the two are the only ways a directory becomes servable,
  // and they are exact complements — `init` creates a site in an EMPTY folder, `adopt` takes an
  // EXISTING one that predates the marker convention. Keeping them adjacent in `--help` is what
  // makes the second discoverable to an operator who only knows the first.
  program
    .command("adopt")
    .description("give an existing site directory the marker files 'serve' requires — derived from its own database, which is never modified")
    .argument("<dir>", "existing site directory to adopt")
    .option("--name <name>", "site display name (defaults to the directory's basename)")
    .option("--dry-run", "print exactly what would be written, and write nothing")
    .action(async (dir: string, options: { name?: string; dryRun?: boolean }) => {
      await runAdoptCommand({ dir, name: options.name, dryRun: options.dryRun === true });
    });

  program
    .command("serve")
    .description(
      "validate, migrate, and boot an install dir — serves site + admin; listens on 127.0.0.1 unless TOVU_HOST is set (e.g. TOVU_HOST=0.0.0.0 for a server or container)"
    )
    .argument("<dir>", "install directory to serve")
    .option("--port <port>", "port to listen on (default: config.json.port, then PORT env, then 3000)")
    .option("--host <ip>", "IP address to listen on (default: TOVU_HOST env, then 127.0.0.1 — this computer only; use 0.0.0.0 for a server or container)")
    .option("--workspace <id>", "workspace id to serve (default: the oldest workspace, if the install has more than one)")
    // Opt-in and off by default, so an operator running `tovu serve` by hand never sees a secret in
    // their terminal. See `boot-session-token.ts` for what the token is and what it cannot do.
    .option("--emit-boot-token", "print a single-use loopback token on stdout that a launching process can exchange once for an admin session")
    .action(async (dir: string, options: { port?: string; host?: string; workspace?: string; emitBootToken?: boolean }) => {
      await runServeCommand({ dir, port: options.port, host: options.host, workspaceId: options.workspace, emitBootToken: options.emitBootToken === true });
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

  // Namespaced command group (2026-08-18, Milestone 2 of the theme v2 build) — a sibling `theme
  // migrate`/`theme package` are expected from later milestones, hence a real subcommand group
  // rather than a flat `theme-validate` command. `theme` itself has no `.action()`: invoked alone it
  // prints commander's own default usage for a group with subcommands, which is the right behavior
  // for a namespace that is not itself invocable.
  const themeProgram = program.command("theme").description("theme package authoring/validation commands");
  themeProgram
    .command("validate")
    .description("validate a theme package directory against the theme.json schema, package shape, and markup rules")
    .argument("<dir>", "theme package directory to validate")
    .option("--profile <profile>", "validation strictness: author (default), publish, or install", "author")
    .option("--json", "print the full machine-readable result instead of a human-readable summary")
    .action(async (dir: string, options: { profile?: string; json?: boolean }) => {
      await runThemeValidateCommand({ dir, profile: options.profile, json: options.json });
    });
  themeProgram
    .command("migrate")
    .description("migrate a v1 theme package directory to schema v2 in place (idempotent; keeps a v1 backup alongside on success)")
    .argument("<dir>", "theme package directory to migrate")
    .option("--dry-run", "stage the v2 output and verify it, but never touch the real theme directory")
    .option("--json", "print the full machine-readable result instead of a human-readable summary")
    .action(async (dir: string, options: { dryRun?: boolean; json?: boolean }) => {
      await runThemeMigrateCommand({ dir, dryRun: options.dryRun, json: options.json });
    });
  themeProgram
    .command("generate-index")
    .description("(re)generate a static-tier theme's portability-backup root index.html — real nav/footer partials spliced in, dynamic menu/post/content markers placeholdered")
    .argument("<dir>", "theme package directory to generate into")
    .option("--json", "print the full machine-readable result instead of a human-readable summary")
    .action(async (dir: string, options: { json?: boolean }) => {
      await runThemeGenerateIndexCommand({ dir, json: options.json });
    });
  themeProgram
    .command("sync-originals")
    .description(
      "(re)generate every shipped theme's '__original-themes__' entry from its live folder, filtered the same way a marketplace download is — removes the need to hand-maintain the 'reset to original' catalog"
    )
    .argument("<themesRoot>", "themes root directory (e.g. content/themes) — NOT a single theme's own folder")
    .option("--json", "print the full machine-readable result instead of a human-readable summary")
    .action(async (themesRoot: string, options: { json?: boolean }) => {
      await runThemeSyncOriginalsCommand({ themesRoot, json: options.json });
    });
  themeProgram
    .command("normalize-build")
    .description("normalize a code-tier framework's raw build output (e.g. `ng build`) in place into Tovu's static-asset-contract shape, ready for artifactHashes + publish")
    .argument("<dir>", "the build's flat output directory (e.g. Angular's dist/<project>/browser/) — mutated in place")
    .option("--primary-stylesheet <file>", "the build's global CSS entry point's output filename (e.g. \"styles.css\"), matching angular.json's styles entry point")
    .option("--pages <files>", "comma-separated top-level HTML page files to rewrite", "index.html")
    .option("--json", "print the full machine-readable result instead of a human-readable summary")
    .action(async (dir: string, options: { primaryStylesheet?: string; pages?: string; json?: boolean }) => {
      await runThemeNormalizeBuildCommand({ dir, primaryStylesheet: options.primaryStylesheet, pages: options.pages, json: options.json });
    });

  // Namespaced command group (mirrors `theme`'s own group above) — `deploy config` today, with room
  // for sibling `deploy` subcommands later without a flat-command rename.
  const deployProgram = program.command("deploy").description("deployment config generation commands");
  deployProgram
    .command("config")
    .description(
      "generate one platform's deploy config file from Tovu's single deployment descriptor (Dockerfile/fly.toml as source of truth) — prints to stdout, or writes to --out"
    )
    .option("--target <target>", "deploy platform: fly, render, or railway")
    .option("--region <region>", "platform region (required — no default region is assumed)")
    .option("--out <file>", "write the generated config to this file instead of stdout")
    .action(async (options: { target?: string; region?: string; out?: string }) => {
      await runDeployConfigCommand({ target: options.target, region: options.region, out: options.out });
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
