import { createInterface } from "node:readline";
import { Writable } from "node:stream";

import { ValidationError } from "../../platform/site-dir/errors.js";
import { initSite } from "../../platform/site-dir/init-site.js";
import { readSiteDir } from "../../platform/site-dir/read-site-dir.js";
import type { SiteStorage } from "../../platform/site-dir/types.js";
import { resolveNewSiteAdminPassword } from "../../platform/site-dir/new-site-owner.js";
import {
  readAllStdin,
  assertNewSiteAgentPluginTokensAccepted,
  defaultNewSiteAgentPluginTokenCheck,
  readNewSiteAgentPluginTokensFromStdin,
  storeNewSiteAgentPluginTokens,
  type NewSiteAgentPluginTokenCheck,
  type SealNewSiteAgentPluginTokens,
} from "./agent-plugin-tokens.js";

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
  /** Explicit password; defaults to tovu-dev. Never read from the parent environment. */
  adminPassword?: string;
  /** Desktop's private stdin envelope: { adminPassword, agentPluginTokens? }. */
  createInputStdin?: boolean;
  readCreateInput?: () => Promise<string>;
  name?: string;
  /** Explicit demo/journey fixture opt-in; normal installs contain no posts or pages. */
  withSampleContent?: boolean;
  /** `--storage sqlite|pglite|postgres` (default sqlite). The only way a site is created on PGlite/Postgres. */
  storage?: string;
  /** `--storage-env NAME` (postgres only): the site reads its connection string from this variable. */
  storageEnv?: string;
  /** Postgres without `--storage-env`: where the connection string to seal comes from (default: a terminal prompt, else stdin). */
  readConnectionString?: () => Promise<string>;
  /** `--agent-plugin-tokens-stdin`: read `{ [pluginId]: token }` JSON from stdin, check each token,
   *  and seal them into the new site for its first boot (`agent-plugin-tokens.ts`). */
  agentPluginTokensStdin?: boolean;
  /** Injected for tests. Default: all of stdin. */
  readAgentPluginTokens?: () => Promise<string>;
  /** Injected for tests. Default: the bundled plugins' probe over the guarded client. */
  checkAgentPluginToken?: NewSiteAgentPluginTokenCheck;
  /** Injected for tests. Default: `sealPendingAgentPluginTokensForNewSite`. */
  sealAgentPluginTokens?: SealNewSiteAgentPluginTokens;
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
export async function runInitCommand(input: RunInitCommandInput, _options: Record<string, never> = {}): Promise<void> {
  const storage = parseInitStorage(input.storage, input.storageEnv);
  const sealed = storage.kind === "postgres" && storage.secretRef === "site";
  if (sealed && (input.agentPluginTokensStdin || input.createInputStdin) && !input.readConnectionString) {
    const stdinFlag = input.createInputStdin ? "--create-input-stdin" : "--agent-plugin-tokens-stdin";
    throw new ValidationError(`init: ${stdinFlag} cannot share stdin with a Postgres connection string; use --storage-env`);
  }
  const createInput = await readCreateInput(input);
  const adminPassword = resolveNewSiteAdminPassword({ adminPassword: input.createInputStdin ? createInput.adminPassword : input.adminPassword });
  // Read and checked BEFORE the site is made: a rejected token creates nothing.
  const tokens = input.createInputStdin
    ? await readNewSiteAgentPluginTokensFromStdin(async () => JSON.stringify(createInput.agentPluginTokens ?? {}))
    : input.agentPluginTokensStdin ? await readNewSiteAgentPluginTokensFromStdin(input.readAgentPluginTokens) : {};
  if (Object.keys(tokens).length > 0) await assertNewSiteAgentPluginTokensAccepted(tokens, input.checkAgentPluginToken ?? defaultNewSiteAgentPluginTokenCheck());
  const connectionString = sealed ? (await (input.readConnectionString ?? readConnectionStringFromUser)()).trim() : undefined;
  const result = await initSite({ dir: input.dir, name: input.name, storage, connectionString, adminPassword }, { withSampleContent: input.withSampleContent });
  // Read the ACTUAL written config.json back (rather than re-deriving the name here) so the
  // printed name can never drift from what `initSite` really wrote to disk.
  const { config } = readSiteDir({ dir: result.dir });
  process.stdout.write(`created site '${config.name}' at ${result.dir}\n`);
  process.stdout.write(`next: tovu serve ${result.dir}\n`);
  await storeNewSiteAgentPluginTokens(result, tokens, input.sealAgentPluginTokens);
}

/** Read desktop's create credentials once, without putting a secret in argv, env, or diagnostics.
 * @throws {ValidationError} conflicting stdin consumers or malformed input. @complexity O(n) in stdin bytes.
 */
async function readCreateInput(input: RunInitCommandInput, _options: Record<string, never> = {}): Promise<{ adminPassword?: unknown; agentPluginTokens?: unknown }> {
  if (!input.createInputStdin) return {};
  if (input.adminPassword !== undefined || input.agentPluginTokensStdin) {
    throw new ValidationError("init: --create-input-stdin cannot be combined with --admin-password or --agent-plugin-tokens-stdin");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await (input.readCreateInput ?? readAllStdin)());
  } catch {
    throw new ValidationError("init: --create-input-stdin expects a JSON object on stdin");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("init: --create-input-stdin expects a JSON object on stdin");
  }
  const value = raw as Record<string, unknown>;
  return { adminPassword: value.adminPassword, agentPluginTokens: value.agentPluginTokens };
}
