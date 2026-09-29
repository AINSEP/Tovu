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
}

/**
 * @throws {ValidationError} `--to` is not `postgres`, `--storage-env` is not a set variable, or
 *   whatever `moveSiteStorage` refuses (not a PGlite site, site running, target not empty).
 */
export async function runStorageMoveCommand(input: RunStorageMoveCommandInput): Promise<MoveSiteStorageResult> {
  if (input.to !== "postgres") throw new ValidationError("storage move: --to must be postgres (the only target a PGlite site moves to)");
  const siteDir = resolveInstallDirTarget(input.dir);
  let connectionString: string;
  let secretRef: "site" | { env: string };
  if (input.storageEnv !== undefined) {
    if (!/^[A-Za-z_]\w*$/.test(input.storageEnv)) throw new ValidationError("storage move: --storage-env must be an environment variable name");
    const value = (input.env ?? process.env)[input.storageEnv]?.trim();
    if (!value) throw new ValidationError(`storage move: the environment variable ${input.storageEnv} is not set`);
    connectionString = value;
    secretRef = { env: input.storageEnv };
  } else {
    connectionString = (await (input.readConnectionString ?? readConnectionStringFromUser)()).trim();
    if (connectionString === "") throw new ValidationError("storage move: no connection string was given");
    secretRef = "site";
  }
  const result = await moveSiteStorage({ siteDir, connectionString, secretRef });
  const write = input.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const rows = result.tables.reduce((sum, t) => sum + t.rows, 0);
  write(`moved site at ${siteDir} to postgres: ${result.tables.length} tables, ${rows} rows`);
  write(`the PGlite data dir is kept at ${result.keptPgliteDir}; remove it yourself once the site checks out`);
  return result;
}
