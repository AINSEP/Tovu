import type { Command } from "commander";
import { runStorageMoveCommand } from "./storage-move.js";
import { runStorageReportCli } from "./storage-report.js";
import {
  runStorageCapabilitiesCommand, runStorageCleanCli, runStorageCompactCommand,
  type StorageCompactOptions, type StorageCompactionBinding,
} from "./storage-maintenance.js";

/**
 * @file The `tovu storage` command group: `report`, `move`, `clean`, `capabilities`, and — only when the
 * ST-7b.T compaction binding is supplied — `compact`. Split out of `program.ts` so the group can grow
 * without pushing that file past the size limit.
 *
 * Why `compact` is registered from the binding rather than behind a flag: the desktop app reads
 * `storage capabilities --json` to decide which buttons to show and spawns `storage compact` itself. If the
 * command existed while its binding did not, a capability read and the command could disagree. Registering,
 * advertising and running all hang off the same object, so an unbound build has no `compact` at all.
 */

type Stdout = { write(chunk: string): unknown };

export interface StorageProgramRequired {
  program: Command;
  stdout: Stdout;
  /** Read by `report` only (the storage kind and its connection-string variable). */
  env: NodeJS.ProcessEnv;
  /** Where an action's exit code goes; the real program sets `process.exitCode`. */
  setExitCode: (code: number) => void;
}

/**
 * Registers the `storage` group on `program`.
 * @param optional.compaction the bound compactor; omitted (the default) means no `compact` command and no
 *   `compact` operation. The real program omits it until G1–G3 clear, so normal boot never compacts.
 * @complexity O(1).
 */
export function registerStorageCommands(
  { program, stdout, env, setExitCode }: StorageProgramRequired,
  { compaction }: { compaction?: StorageCompactionBinding } = {},
): void {
  const storage = program
    .command("storage")
    .description("see how much disk a site uses, or change where it keeps its data");
  storage
    .command("report")
    .description("show how much disk a website folder uses, by category; read-only, safe while the site runs")
    .argument("<dir>", "site directory")
    .option("--json", "print one JSON document")
    .action(async (dir: string, options: { json?: boolean }) => {
      await runStorageReportCli({ dir, stdout, env }, { json: options.json === true });
    });
  storage
    .command("move")
    .description("move a stopped PGlite site onto an empty Postgres database (the PGlite data dir is kept)")
    .argument("<dir>", "site directory")
    .requiredOption("--to <kind>", "the new storage: postgres")
    .option("--storage-env <name>", "read the connection string from this environment variable, and keep reading it there (default: asked for once and sealed in the site folder)")
    .action(async (dir: string, options: { to?: string; storageEnv?: string }) => {
      await runStorageMoveCommand({ dir, to: options.to, storageEnv: options.storageEnv });
    });
  storage
    .command("clean")
    .description("remove what a STOPPED website no longer needs (expired share copies); never migrates or boots it")
    .argument("<dir>", "site directory")
    .option("--dry-run", "only measure what would be removed; deletes nothing (the default)")
    .option("--apply", "really delete what the preview lists; without it, clean only previews")
    .option("--json", "print one JSON document")
    .action(async (dir: string, options: { dryRun?: boolean; apply?: boolean; json?: boolean }) => {
      // Preview unless the owner explicitly opts in; `--dry-run` always wins over `--apply`.
      const result = await runStorageCleanCli({ dir, stdout }, { dryRun: options.apply !== true || options.dryRun === true, json: options.json === true });
      setExitCode(result.exitCode);
    });
  storage
    .command("capabilities")
    .description("list the storage operations this build can run")
    .option("--json", "print one JSON document")
    .action((options: { json?: boolean }) => {
      // The same binding that registers `compact` below decides whether it is advertised.
      runStorageCapabilitiesCommand({ stdout, compactStoppedSite: compaction?.compact }, { json: options.json === true });
    });
  if (compaction) registerCompactCommand({ storage, stdout, setExitCode, compaction });
}

function registerCompactCommand(
  { storage, stdout, setExitCode, compaction }: Omit<StorageProgramRequired, "program" | "env"> & { storage: Command; compaction: StorageCompactionBinding },
): void {
  storage
    .command("compact")
    .description("reclaim free space in a STOPPED SQLite website; or finish (--resume) or decide (--resolve) a compaction that needs attention")
    .argument("<dir>", "site directory")
    .option("--resume", "finish or roll back an interrupted restore")
    .option("--resolve <action>", "restore-copy or keep-current, for a database that needs attention")
    .option("--database <name>", "with --resolve: content or chat")
    .option("--confirm <json>", "with --resolve: the marker the storage panel showed ({markerAt, recoveryCopyPath, mainIdentity})")
    .option("--json", "print one JSON document")
    .action(async (dir: string, options: StorageCompactOptions) => {
      setExitCode(await runStorageCompactCommand({ dir, binding: compaction, stdout }, options));
    });
}
