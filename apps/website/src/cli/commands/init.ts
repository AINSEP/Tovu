import { createInterface } from "node:readline";
import { Writable } from "node:stream";

import { ValidationError } from "../../platform/site-dir/errors.js";
import { initSite } from "../../platform/site-dir/init-site.js";
import { readSiteDir } from "../../platform/site-dir/read-site-dir.js";
import type { SiteStorage } from "../../platform/site-dir/types.js";

/**
 * @file SPEC-003 C-001 (`CLI_INIT`) — wires a commander action's parsed arguments to
 * `site-dir/init-site.ts`'s `initSite`, and formats the `CLI_INIT` stdout contract.
 *
 * Architectural role:
 * `cli` layer. Formats stdout only — never maps errors to exit codes itself (that is
 * `cli/errors.ts`'s job; this function lets `initSite`'s typed errors propagate uncaught).
 */

export interface RunInitCommandInput {
  dir: string;
  name?: string;
  /** `--storage sqlite|pglite|postgres` (default sqlite). The only way a site is created on PGlite/Postgres. */
  storage?: string;
  /** `--storage-env NAME` (postgres only): the site reads its connection string from this variable. */
  storageEnv?: string;
  /** Postgres without `--storage-env`: where the connection string to seal comes from (default: a terminal prompt, else stdin). */
  readConnectionString?: () => Promise<string>;
}

const STORAGE_KINDS = ["sqlite", "pglite", "postgres"] as const;

/**
 * `--storage` + `--storage-env` to the site's storage choice.
 *
 * @throws {ValidationError} an unknown kind, or `--storage-env` without `--storage postgres`.
 */
export function parseInitStorage(storage: string | undefined, storageEnv: string | undefined): SiteStorage {
  const kind = storage ?? "sqlite";
  if (!(STORAGE_KINDS as readonly string[]).includes(kind)) {
    throw new ValidationError(`init: --storage must be one of ${STORAGE_KINDS.join(", ")}`);
  }
  if (kind !== "postgres") {
    if (storageEnv !== undefined) throw new ValidationError("init: --storage-env applies to --storage postgres only");
    return { kind } as SiteStorage;
  }
  if (storageEnv === undefined) return { kind, secretRef: "site" };
  if (!/^[A-Za-z_]\w*$/.test(storageEnv)) throw new ValidationError("init: --storage-env must be an environment variable name");
  return { kind, secretRef: { env: storageEnv } };
}

/**
 * The connection string to seal: asked for without echo on a terminal, else read from stdin
 * (`printf '%s' "$URL" | tovu init --storage postgres <dir>`). Shared with `tovu storage move`.
 */
export async function readConnectionStringFromUser(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0] ?? "";
  }
  process.stdout.write("Postgres connection string (not shown): ");
  const muted = new Writable({ write: (_chunk, _encoding, done) => done() });
  const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
  try {
    return await new Promise<string>((resolve) => rl.once("line", resolve));
  } finally {
    rl.close();
    process.stdout.write("\n");
  }
}

/**
 * Run `tovu init <dir> [--name]`: create the install dir, then print the api.spec.md §5 success
 * contract (`created site '<name>' at <dir>` + `next: tovu serve <dir>`).
 *
 * @throws whatever `initSite` throws (`ValidationError`, `InitDirNotEmptyError`,
 *   `InternalError`) — `cli/main.ts` maps these to the correct exit code.
 * @complexity O(1) beyond `initSite`'s own bounded cost.
 * @overallScore 100
 */
export async function runInitCommand(input: RunInitCommandInput): Promise<void> {
  const storage = parseInitStorage(input.storage, input.storageEnv);
  const sealed = storage.kind === "postgres" && storage.secretRef === "site";
  const connectionString = sealed ? (await (input.readConnectionString ?? readConnectionStringFromUser)()).trim() : undefined;
  const result = await initSite({ dir: input.dir, name: input.name, storage, connectionString });
  // Read the ACTUAL written config.json back (rather than re-deriving the name here) so the
  // printed name can never drift from what `initSite` really wrote to disk.
  const { config } = readSiteDir({ dir: result.dir });
  process.stdout.write(`created site '${config.name}' at ${result.dir}\n`);
  process.stdout.write(`next: tovu serve ${result.dir}\n`);
}
