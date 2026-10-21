import { ValidationError } from "../../platform/site-dir/errors.js";
import { resolveInstallDirTarget } from "../../platform/site-dir/resolve-install-dir-target.js";
import { moveSiteStorage, type MoveSiteStorageResult } from "#src/server/runtime/composition/move-site-storage";
import { readConnectionStringFromUser } from "./init.js";

/**
 * @file `tovu storage move <dir> --to postgres [--storage-env NAME]` (R1g): wires the command to
 * `moveSiteStorage` and prints what moved. Like `init --storage postgres`, the connection string is
 * never an argument (it would show in the process list): it comes from `--storage-env`'s variable
 * (and the site keeps reading it there), or is asked for once without echo / read from stdin and
 * sealed in the site folder.
 */

export interface RunStorageMoveCommandInput {
  dir: string;
  to?: string;
  storageEnv?: string;
  env?: NodeJS.ProcessEnv;
  /** Without `--storage-env`: where the connection string comes from (default: prompt, else stdin). */
  readConnectionString?: () => Promise<string>;
  write?: (line: string) => void;
  /** Injected for tests; defaults to the real PGlite → Postgres mover. */
  moveStorage?: typeof moveSiteStorage;
}

/** Default line writer: one stdout line per call. */
function writeLine(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** Where the target connection string comes from: `--storage-env`'s variable (kept as an env
 * reference) or, without it, the prompt/stdin reader (sealed in the site).
 * @throws {ValidationError} an invalid or unset `--storage-env`, or an empty prompted value. */
async function resolveMoveConnection(input: RunStorageMoveCommandInput): Promise<{ connectionString: string; secretRef: "site" | { env: string } }> {
  const { env = process.env, readConnectionString = readConnectionStringFromUser } = input;
  if (input.storageEnv === undefined) {
    const connectionString = (await readConnectionString()).trim();
    if (connectionString === "") throw new ValidationError("storage move: no connection string was given");
    return { connectionString, secretRef: "site" };
  }
  if (!/^[A-Za-z_]\w*$/.test(input.storageEnv)) throw new ValidationError("storage move: --storage-env must be an environment variable name");
  const value = env[input.storageEnv]?.trim();
  if (!value) throw new ValidationError(`storage move: the environment variable ${input.storageEnv} is not set`);
  return { connectionString: value, secretRef: { env: input.storageEnv } };
}

/**
 * @throws {ValidationError} `--to` is not `postgres`, `--storage-env` is not a set variable, or
 *   whatever `moveSiteStorage` refuses (not a PGlite site, site running, target not empty).
 */
export async function runStorageMoveCommand(input: RunStorageMoveCommandInput): Promise<MoveSiteStorageResult> {
  if (input.to !== "postgres") throw new ValidationError("storage move: --to must be postgres (the only target a PGlite site moves to)");
  const siteDir = resolveInstallDirTarget(input.dir);
  // Default ports are wired here, at the command's composition edge; tests inject their own.
  const { write = writeLine, moveStorage = moveSiteStorage } = input;
  const { connectionString, secretRef } = await resolveMoveConnection(input);
  const result = await moveStorage({ siteDir, connectionString, secretRef });
  const rows = result.tables.reduce((sum, t) => sum + t.rows, 0);
  write(`moved site at ${siteDir} to postgres: ${result.tables.length} tables, ${rows} rows`);
  write(`the PGlite data dir is kept at ${result.keptPgliteDir}; remove it yourself once the site checks out`);
  return result;
}
