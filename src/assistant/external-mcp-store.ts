import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SealedSecret, SecretSealerPort } from "../webhooks/index.js";
import { FEDERATED_CONNECTION_DEFAULTS, type ResolvedFederatedConnection } from "./mcp-federation/config.js";
import { assertValidConnectionId } from "./mcp-federation/trust.js";

/**
 * @file The operator-editable roster of external MCP servers — what Settings → External MCP writes,
 * and what the agent daemon reads at boot to decide which third-party servers to federate.
 *
 * This is the SECOND config source for `mcp-federation/`. The first is `presets.ts`, whose
 * resolvers read `TOVU_<VENDOR>_MCP_*` environment variables; it stays exactly as it was. The two
 * differ in kind, which is why this is not written as a preset: a preset resolver is synchronous and
 * returns at most one connection, while this store is async (sealing is promise-based) and returns
 * N. `bootstrap.ts`'s `extraConnections` parameter is the seam that carries them.
 *
 * ## Secrets
 *
 * An MCP server's `env` block routinely carries live credentials, so it is sealed through ADR-058's
 * `SecretSealerPort` using the same keyring instance the Composio/BYOK/media-provider stores share
 * — `src/webhooks/ports.ts` states the rule this follows: keep secret material out of the
 * portable `content.db`.
 *
 * The block is sealed WHOLE rather than per-variable. Every read path wants all of it at once (it
 * becomes one child process's environment), so per-variable sealing would buy nothing and cost N
 * round-trips. Variable NAMES are stored separately in plaintext so the tab can show which
 * variables are set without unsealing anything.
 *
 * ## What this file does NOT do
 *
 * It does not decide whether a remote tool may be called. That is `mcp-federation/trust.ts`'s
 * default-deny admission tier, applied at connect time to whatever this store produced.
 * `allowedToolNames` is carried here and enforced there, on purpose: a config store that also
 * adjudicated trust would be two mechanisms with one owner.
 */

/** Only `stdio` is implemented — `mcp-federation/adapter.stdio.ts` is the sole transport. */
export const SUPPORTED_EXTERNAL_MCP_TRANSPORTS = ["stdio"] as const;
export type ExternalMcpTransport = (typeof SUPPORTED_EXTERNAL_MCP_TRANSPORTS)[number];

/** Raised when operator-supplied input cannot be stored. Carries `field` so a route can point the
 *  form at the offending input rather than rejecting the whole submission opaquely. */
export class ExternalMcpValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "ExternalMcpValidationError";
  }
}

/** Raised when sealing fails because no root key is configured — distinct from a validation error,
 *  because nothing the operator types can fix it. */
export class ExternalMcpSecretStoreUnconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalMcpSecretStoreUnconfiguredError";
  }
}

/** One stored row. `sealedEnv` is null when the server needs no credentials, which is normal. */
export interface ExternalMcpServerRecord {
  workspaceId: UUID;
  serverId: string;
  label: string | null;
  transport: string;
  enabled: boolean;
  command: string | null;
  /** JSON array of argv strings, as stored. */
  args: string | null;
  /** JSON array of admissible remote tool names, as stored. */
  allowedToolNames: string | null;
  /** JSON array of env variable names, as stored. Plaintext by design. */
  envNames: string | null;
  sealedEnv: SealedSecret | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Workspace-scoped persistence (ADR-007 §1). Multi-row per workspace, so list/upsert/delete rather
 *  than the single-row find/upsert `ComposioConfigRepoPort` uses. */
export interface ExternalMcpServerRepoPort {
  listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpServerRecord[]>;
  findByServerId(input: { workspaceId: UUID; serverId: string }): Promise<ExternalMcpServerRecord | null>;
  upsert(record: ExternalMcpServerRecord): Promise<void>;
  deleteByServerId(input: { workspaceId: UUID; serverId: string }): Promise<boolean>;
}

/** The decrypted, validated domain shape. Only ever exists in memory. */
export interface ExternalMcpServerConfig {
  serverId: string;
  label: string;
  transport: ExternalMcpTransport;
  enabled: boolean;
  command: string;
  args: string[];
  allowedToolNames: string[];
  env: Record<string, string>;
}

/** The read model the admin tab renders — never carries env VALUES. */
export interface ExternalMcpServerView {
  serverId: string;
  label: string;
  transport: string;
  enabled: boolean;
  command: string;
  args: string[];
  allowedToolNames: string[];
  /** Variable names only. The tab masks values it never receives. */
  envNames: string[];
}

export interface ExternalMcpStoreDeps {
  repo: ExternalMcpServerRepoPort;
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
}

const MAX_SERVERS_PER_WORKSPACE = 32;
const MAX_ENV_VARS = 64;
const MAX_ARGS = 64;
const MAX_ALLOWED_TOOLS = 64;
/** Matches `trust.ts`'s own `REMOTE_TOOL_NAME_PATTERN`. Restated rather than imported because that
 *  constant is private to the trust tier; `__tests__/external-mcp-store.test.ts` asserts the two
 *  agree by round-tripping a name through `admitRemoteTools`. */
const REMOTE_TOOL_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
/** POSIX-ish environment variable name. Deliberately stricter than what a shell tolerates: a name
 *  outside this set is far more likely a mis-pasted line than an intentional variable. */
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Parses an operator's `KEY=VALUE`-per-line environment block into a map.
 *
 * Blank lines and `#` comments are skipped so an operator can annotate the block. Everything else
 * must parse: a line without `=` is rejected rather than ignored, because silently dropping what
 * looks like a credential is how a server ends up launching without the token the operator believes
 * they supplied. Only the FIRST `=` splits, so values may contain `=` (base64 padding, connection
 * strings).
 *
 * @param text - Raw textarea content.
 * @returns The parsed variables, in first-seen order.
 * @throws {ExternalMcpValidationError} On a malformed line, an invalid name, a duplicate, or more
 * than {@link MAX_ENV_VARS} variables.
 * @complexity O(n) in the number of lines.
 * @overallScore 100
 */
export function parseEnvBlock(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = text.split(/\r?\n/);

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new ExternalMcpValidationError(
        `line ${index + 1} of the environment block is not \`NAME=VALUE\`: ${JSON.stringify(rawLine.slice(0, 40))}`,
        "env",
      );
    }

    const name = line.slice(0, separator).trim();
    if (!ENV_NAME_PATTERN.test(name)) {
      throw new ExternalMcpValidationError(
        `'${name}' is not a valid environment variable name (letters, digits and underscore, not starting with a digit)`,
        "env",
      );
    }
    // Rejected rather than last-write-wins: two lines setting the same variable means the operator
    // believes both are in effect, and picking one silently is the failure mode this guards.
    if (Object.hasOwn(env, name)) {
      throw new ExternalMcpValidationError(`environment variable '${name}' is set more than once`, "env");
    }
    if (Object.keys(env).length >= MAX_ENV_VARS) {
      throw new ExternalMcpValidationError(`at most ${MAX_ENV_VARS} environment variables are supported`, "env");
    }
    env[name] = line.slice(separator + 1).trim();
  }

  return env;
}

/**
 * Splits an operator's space-separated argv string.
 *
 * No shell quoting is honoured, and that is deliberate rather than unfinished: supporting quotes
 * would invite the belief that this string is shell-interpreted, when the command is spawned
 * WITHOUT a shell (`adapter.stdio.ts` uses `spawn` with an argv array). An operator who needs a
 * literal space in one argument is better served by learning that than by a quoting scheme that
 * silently differs from their shell's.
 *
 * @complexity O(n) in the string length.
 * @overallScore 100
 */
export function parseArgs(raw: string): string[] {
  const args = raw.split(/\s+/).filter((part) => part.length > 0);
  if (args.length > MAX_ARGS) {
    throw new ExternalMcpValidationError(`at most ${MAX_ARGS} arguments are supported`, "args");
  }
  return args;
}

/**
 * Splits an operator's comma-separated allowlist of remote tool names.
 *
 * An empty result is a legitimate, meaningful value — it yields a server that contributes zero
 * tools — so it is returned rather than rejected. That is the safe direction and matches
 * `trust.ts` R2's default-deny posture.
 *
 * @throws {ExternalMcpValidationError} On a name the trust tier would refuse anyway, so the operator
 * learns at save time instead of discovering an unexplained absence after a restart.
 * @complexity O(n) in the number of names.
 * @overallScore 100
 */
export function parseAllowedToolNames(raw: string): string[] {
  const names = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (names.length > MAX_ALLOWED_TOOLS) {
    throw new ExternalMcpValidationError(`at most ${MAX_ALLOWED_TOOLS} allowed tools are supported`, "allowedToolNames");
  }
  for (const name of names) {
    if (!REMOTE_TOOL_NAME_PATTERN.test(name)) {
      throw new ExternalMcpValidationError(
        `'${name}' is not a valid MCP tool name, so the trust tier would refuse it on connect`,
        "allowedToolNames",
      );
    }
  }
  return [...new Set(names)];
}

function toView(record: ExternalMcpServerRecord): ExternalMcpServerView {
  return {
    serverId: record.serverId,
    label: record.label ?? record.serverId,
    transport: record.transport,
    enabled: record.enabled,
    command: record.command ?? "",
    args: parseJsonArray(record.args),
    allowedToolNames: parseJsonArray(record.allowedToolNames),
    envNames: parseJsonArray(record.envNames),
  };
}

/**
 * Lists the workspace's servers for the admin tab. Never unseals — the tab has no use for env
 * values and must not be a route that decrypts them.
 *
 * @complexity O(n) in the stored server count.
 * @overallScore 100
 */
export async function listExternalMcpServerViews(
  deps: Pick<ExternalMcpStoreDeps, "repo">,
  workspaceId: UUID,
): Promise<ExternalMcpServerView[]> {
  const records = await deps.repo.listByWorkspaceId(workspaceId);
  return records.map(toView);
}

/**
 * Reads and decrypts every ENABLED server, for the daemon's boot-time federation pass.
 *
 * A row whose sealed env cannot be opened is SKIPPED rather than thrown on, and the reason is
 * returned in `failures`. This mirrors `bootstrap.ts`'s fail-open posture for the same reason: a
 * rotated root key or a corrupt row must not stop the daemon booting, and one unusable server must
 * not take out a second working one. Disabled rows never reach the sealer at all.
 *
 * @returns The usable configs plus a per-server accounting of what could not be read.
 * @complexity O(n) in the enabled server count, one unseal each.
 * @overallScore 100
 */
export async function readEnabledExternalMcpConfigs(
  deps: Pick<ExternalMcpStoreDeps, "repo" | "sealer">,
  workspaceId: UUID,
): Promise<{ configs: ExternalMcpServerConfig[]; failures: { serverId: string; reason: string }[] }> {
  const records = await deps.repo.listByWorkspaceId(workspaceId);
  const configs: ExternalMcpServerConfig[] = [];
  const failures: { serverId: string; reason: string }[] = [];

  for (const record of records) {
    if (!record.enabled) continue;
    if (record.transport !== "stdio" || !record.command) {
      failures.push({ serverId: record.serverId, reason: `unsupported transport '${record.transport}' or missing command` });
      continue;
    }
    let env: Record<string, string> = {};
    if (record.sealedEnv !== null) {
      try {
        const opened = await deps.sealer.open({ sealed: record.sealedEnv });
        const parsed: unknown = JSON.parse(opened);
        env = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
      } catch (err) {
        failures.push({
          serverId: record.serverId,
          reason: `stored credentials could not be decrypted: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }
    }
    configs.push({
      serverId: record.serverId,
      label: record.label ?? record.serverId,
      transport: "stdio",
      enabled: true,
      command: record.command,
      args: parseJsonArray(record.args),
      allowedToolNames: parseJsonArray(record.allowedToolNames),
      env,
    });
  }

  return { configs, failures };
}

/**
 * Maps stored configs onto the shape `mcp-federation/bootstrap.ts` consumes.
 *
 * Timeouts and caps come from core's shared `FEDERATED_CONNECTION_DEFAULTS` rather than being
 * stored per server: they are policy about how much a third party may cost this process, which is
 * Tovu's call and not an operator preference. `allowedToolNames` is the one field that IS the
 * operator's, and it is passed through untouched for `trust.ts` to enforce.
 *
 * @complexity O(n) in the config count.
 * @overallScore 100
 */
export function toResolvedFederatedConnections(
  configs: readonly ExternalMcpServerConfig[],
): ResolvedFederatedConnection[] {
  return configs.map((config) => ({
    config: {
      connectionId: config.serverId,
      label: config.label,
      allowedToolNames: config.allowedToolNames,
      connectTimeoutMs: FEDERATED_CONNECTION_DEFAULTS.connectTimeoutMs,
      callTimeoutMs: FEDERATED_CONNECTION_DEFAULTS.callTimeoutMs,
      maxResultBytes: FEDERATED_CONNECTION_DEFAULTS.maxResultBytes,
      maxTools: FEDERATED_CONNECTION_DEFAULTS.maxTools,
    },
    launch: {
      command: config.command,
      args: config.args,
      // The child's environment REPLACES the daemon's rather than extending it, matching the
      // Supabase preset. `PATH`/`HOME`/`TMPDIR` are added by the launcher, not here; anything else
      // a server needs is an explicit, written-down grant in its own env block.
      env: config.env,
    },
  }));
}

export interface SaveExternalMcpServerInput {
  workspaceId: UUID;
  serverId: string;
  label?: string;
  transport: string;
  enabled: boolean;
  command: string;
  /** Raw operator input, space-separated. */
  args: string;
  /** Raw operator input, comma-separated remote tool names. */
  allowedToolNames: string;
  /** Raw operator input, `KEY=VALUE` per line. `undefined` leaves an existing block untouched. */
  env?: string;
}

/**
 * Validates and persists one server, sealing its env block.
 *
 * `env: undefined` preserves whatever is already stored, which is what lets the tab patch `enabled`
 * or `label` without the operator re-typing credentials the UI never sent them. `env: ""` is the
 * distinct, explicit "clear the credentials" instruction — the same unset-vs-empty distinction
 * `mcp-federation/config.ts` draws for allowlists, and for the same reason.
 *
 * @throws {ExternalMcpValidationError} On any invalid operator input.
 * @throws {ExternalMcpSecretStoreUnconfiguredError} When no root key is available to seal under.
 * @complexity O(n) in the size of the env block.
 * @overallScore 100
 */
export async function saveExternalMcpServer(
  deps: ExternalMcpStoreDeps,
  input: SaveExternalMcpServerInput,
): Promise<ExternalMcpServerView> {
  const serverId = input.serverId.trim().toLowerCase();
  try {
    // Reuses the trust tier's own assertion rather than restating the pattern: this id becomes part
    // of every federated tool id, and two copies of that rule could drift.
    assertValidConnectionId(serverId);
  } catch (err) {
    throw new ExternalMcpValidationError(err instanceof Error ? err.message : String(err), "id");
  }

  if (!SUPPORTED_EXTERNAL_MCP_TRANSPORTS.includes(input.transport as ExternalMcpTransport)) {
    throw new ExternalMcpValidationError(
      `transport '${input.transport}' is not supported — only ${SUPPORTED_EXTERNAL_MCP_TRANSPORTS.join(", ")} is implemented`,
      "transport",
    );
  }

  const command = input.command.trim();
  if (command === "") {
    throw new ExternalMcpValidationError("a stdio server needs a command to launch", "command");
  }

  const args = parseArgs(input.args);
  const allowedToolNames = parseAllowedToolNames(input.allowedToolNames);

  const existing = await deps.repo.findByServerId({ workspaceId: input.workspaceId, serverId });
  if (!existing) {
    const count = (await deps.repo.listByWorkspaceId(input.workspaceId)).length;
    if (count >= MAX_SERVERS_PER_WORKSPACE) {
      throw new ExternalMcpValidationError(
        `this workspace already has the maximum of ${MAX_SERVERS_PER_WORKSPACE} external MCP servers`,
        "id",
      );
    }
  }

  let sealedEnv: SealedSecret | null = existing?.sealedEnv ?? null;
  let envNames: string[] = parseJsonArray(existing?.envNames ?? null);

  if (input.env !== undefined) {
    const env = parseEnvBlock(input.env);
    envNames = Object.keys(env);
    if (envNames.length === 0) {
      sealedEnv = null;
    } else {
      try {
        sealedEnv = await deps.sealer.seal({
          plaintext: JSON.stringify(env),
          key: await deps.keyring.activeKey(),
        });
      } catch (err) {
        throw new ExternalMcpSecretStoreUnconfiguredError(
          `external MCP credential secret store is unconfigured: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  const now = deps.clock.nowIso();
  const record: ExternalMcpServerRecord = {
    workspaceId: input.workspaceId,
    serverId,
    label: input.label?.trim() || null,
    transport: input.transport,
    enabled: input.enabled,
    command,
    args: JSON.stringify(args),
    allowedToolNames: JSON.stringify(allowedToolNames),
    envNames: JSON.stringify(envNames),
    sealedEnv,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await deps.repo.upsert(record);
  return toView(record);
}

/**
 * Removes one server. Returns whether a row was actually deleted, so a route can answer 404 rather
 * than reporting success for an id that never existed.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export async function deleteExternalMcpServer(
  deps: Pick<ExternalMcpStoreDeps, "repo">,
  input: { workspaceId: UUID; serverId: string },
): Promise<boolean> {
  return deps.repo.deleteByServerId(input);
}
