/**
 * @file `parseAgentPluginManifest()` / `parseAgentPluginMcpConfig()` — the Agent Plugins v1.0.0
 * `plugin.json` / `mcp.json` grammar (agent-plugins.org/specification), verified against the live
 * spec rather than inferred from the one example manifest bundled in this repo
 * (`apps/admin/src/features/plugins/bundled/ui-ux-design/plugin.json`).
 *
 * Deliberately a SEPARATE, smaller validator from `src/features/plugin-runtime/manifest.ts`'s
 * `validateManifest()`. That file validates `.tovu-plugin`'s own tarball format — `integrity`
 * (per-file SHA-256), `sdkRange`, `tier`, an exactly-three-token capability vocabulary, a single
 * `content.entry.beforeSave` hook. This file validates the OPEN standard's `plugin.json`, which
 * shares none of those fields and defines no execution/trust/capability model at all — see this
 * feature's own header comment in `install.ts` for why the two formats cannot be unified.
 *
 * Spec facts this module encodes, quoted/paraphrased from agent-plugins.org/specification (verified
 * 2026-08-12, not carried forward from an earlier round's inference):
 * - `plugin.json`'s `name`: 1-64 chars, lowercase alphanumeric/hyphen/period only, must start and
 *   end alphanumeric, no `--` or `..` consecutive delimiters (§5.5). Valid: `my-plugin`,
 *   `acme.tools`, `lint3r`, `a`. Invalid: `My-Plugin`, `-start`, `has--double`.
 * - `plugin.json`'s `$schema` MUST equal `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`
 *   for this pinned version; `mcp.json`'s MUST equal
 *   `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`.
 * - Unknown top-level `plugin.json` fields produce warnings but do not block loading — this module
 *   returns them as `warnings`, never as a rejection reason.
 * - `mcp.json`'s top-level shape is `{ "$schema": ..., "mcpServers": { "<server-id>": {...} } }` —
 *   `mcpServers` MUST be an object whose member names identify servers.
 * - Each server entry MUST carry a `type` discriminator matching exactly one of three CLOSED
 *   variants (re-verified live against `agent-plugins.org/schemas/1.0.0/mcp.schema.json` and
 *   `/specification`, 2026-09-10 — superseding this file's earlier "not validated, no caller needs
 *   it" note, which is now false: `capability-projection.ts`'s MCP-server descriptors are no longer
 *   unconditionally `execute: { kind: "unavailable" }`, and launching a server needs its real
 *   transport config, not just its id):
 *     - `stdio`: requires `command` (non-empty string); optional `args` (string[]), `env`
 *       (string-valued object — MUST NOT set `PLUGIN_ROOT`/`PLUGIN_DATA`, which the spec reserves),
 *       `cwd` (plugin-relative path).
 *     - `streamable-http` / `sse`: requires `url` (non-empty string); optional `headers`
 *       (string-valued object).
 * - **The spec defines NO auth-related field on a server entry at all.** Verbatim from
 *   `/specification`: "Agent Plugins v1 defines no OAuth configuration or portable
 *   credential-reference fields. Authorization discovery, user interaction, and credential storage
 *   are client-managed." A plugin therefore cannot declare "this server needs OAuth" using any
 *   spec-defined field — Tovu is the client the spec defers that decision to. This module accepts
 *   one Tovu-specific, non-spec, purely-additive extension key, `tovuAuthMode: "oauth" | "none"`,
 *   on `streamable-http`/`sse` entries only, so a plugin author who KNOWS their server requires
 *   OAuth (Higgsfield's own `mcp.json` sets it) can say so; a strictly spec-conformant client
 *   ignores an unknown property on an object with no `additionalProperties: false` and loses
 *   nothing. Absent, it defaults to `"none"` wherever it is consulted
 *   (`capability-projection.ts`'s `resolveAgentPluginMcpAuthMode`). A malformed per-server entry
 *   (wrong/missing `type`, missing required field) does not fail the whole file — see
 *   `ParseAgentPluginMcpConfigResult`'s own doc for the fail-open contract this preserves.
 *
 * Architectural role:
 * Pure, no-I/O parsing over an already-`JSON.parse`d value — mirrors `plugin-runtime/manifest.ts`'s
 * own "receives a JS value, never a file path or raw bytes" contract. `install.ts` is the only
 * caller that reads the file and hands the parsed value here.
 */

/** The one plugin.json schema version this loader understands. A manifest declaring any other
 * value is rejected outright (C2 in the debate: "the standard is a Working Draft; the loader pins
 * v1 and must survive spec churn") rather than guessed at. */
const PLUGIN_SCHEMA_1_0_0 = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA_1_0_0 = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

/** §5.5's grammar as one regex: alnum runs separated by single `-`/`.` delimiters. This shape alone
 * guarantees start/end are alphanumeric (the regex can only start and end on `[a-z0-9]+`) AND that
 * no two delimiters are ever adjacent (a delimiter is always followed by at least one alnum char
 * before the next one can appear) — so "no leading/trailing hyphen" and "no consecutive delimiters"
 * fall out of one pattern rather than needing separate checks that could disagree. */
const NAME_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 64;

export interface AgentPluginManifest {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly author?: string;
  readonly license?: string;
  readonly keywords?: readonly string[];
}

export type ParseAgentPluginManifestResult =
  | { readonly ok: true; readonly manifest: AgentPluginManifest; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

const KNOWN_MANIFEST_KEYS = new Set(["$schema", "name", "version", "description", "author", "license", "keywords"]);

/** True for a non-null, non-array plain object — the "is this actually a JSON object" gate both
 * `parseAgentPluginManifest` and `parseAgentPluginMcpConfig` need before touching any field. */
function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `value` narrowed to a `string`, or `undefined` — every optional string field below coerces
 * through this one check instead of repeating its own `typeof ... === "string" ? ... : undefined`
 * ternary. */
function coerceOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** `value` narrowed to a `string[]` (non-string entries dropped), or `undefined` when `value`
 * itself isn't an array — `keywords`'s own coercion. */
function coerceStringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : undefined;
}

/**
 * Validates `plugin.json`'s `name` field per §5.5's grammar (see `NAME_PATTERN`'s own header for
 * what the one regex encodes). Returns the valid name, or the one error message to report — never
 * both, so the caller needs exactly one branch to consume this instead of the original's
 * required-then-format else-if chain.
 */
function resolveManifestName(raw: Readonly<Record<string, unknown>>): { name: string; error?: undefined } | { name?: undefined; error: string } {
  const name = coerceOptionalString(raw.name);
  if (name === undefined) return { error: "plugin.json 'name' is required and must be a string" };
  if (name.length === 0 || name.length > MAX_NAME_LENGTH || !NAME_PATTERN.test(name)) {
    return {
      error: `plugin.json 'name' ('${name}') must be 1-${MAX_NAME_LENGTH} lowercase alphanumeric/hyphen/period characters, start and end alphanumeric, with no consecutive delimiters`,
    };
  }
  return { name };
}

/**
 * Validates an already-`JSON.parse`d `plugin.json` value against the v1.0.0 grammar.
 *
 * @throws Nothing — every failure is reported via the returned `errors`, matching this codebase's
 * own convention for expected validation outcomes (`plugin-runtime/manifest.ts`,
 * `plugin-runtime/discovery.ts`).
 * @complexity O(1) — a fixed, small number of field checks.
 */
export function parseAgentPluginManifest(value: unknown): ParseAgentPluginManifestResult {
  if (!isJsonObject(value)) return { ok: false, errors: ["plugin.json must be a JSON object"] };

  const raw = value;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (raw.$schema !== PLUGIN_SCHEMA_1_0_0) {
    errors.push(`plugin.json '$schema' must be '${PLUGIN_SCHEMA_1_0_0}', got '${String(raw.$schema)}'`);
  }

  const nameResult = resolveManifestName(raw);
  if (nameResult.error) errors.push(nameResult.error);

  for (const key of Object.keys(raw)) {
    if (!KNOWN_MANIFEST_KEYS.has(key)) warnings.push(`unrecognized plugin.json field '${key}' (ignored per spec)`);
  }

  if (errors.length > 0) return { ok: false, errors };

  const manifest: AgentPluginManifest = {
    name: nameResult.name as string,
    version: coerceOptionalString(raw.version),
    description: coerceOptionalString(raw.description),
    author: coerceOptionalString(raw.author),
    license: coerceOptionalString(raw.license),
    keywords: coerceStringArray(raw.keywords),
  };
  return { ok: true, manifest, warnings };
}

/** The three closed transport variants `mcp.schema.json` v1.0.0 defines. See this file's header for
 * the verified field shape of each. */
export const MCP_SERVER_TRANSPORTS = ["stdio", "streamable-http", "sse"] as const;
export type McpServerTransport = (typeof MCP_SERVER_TRANSPORTS)[number];

/** Reserved by the spec — a `stdio` server's `env` MUST NOT set either, since the client (Tovu)
 * owns them. Checked defensively; nothing upstream of this parser fills them in yet, so this is a
 * spec-conformance check today rather than one guarding a real collision. */
const RESERVED_STDIO_ENV_KEYS = ["PLUGIN_ROOT", "PLUGIN_DATA"];

export interface StdioMcpServerConfig {
  readonly type: "stdio";
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
}

/** `streamable-http` and `sse` share an identical field shape (`url` + optional `headers`); only
 * their `type` differs, and both are handled by the one remote branch below. */
export interface RemoteMcpServerConfig {
  readonly type: "streamable-http" | "sse";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** Tovu-specific extension, not part of the spec — see this file's header for why it exists and
   * what a strictly spec-conformant client does with it (ignores it). */
  readonly tovuAuthMode?: "oauth" | "none";
}

export type McpServerConfig = StdioMcpServerConfig | RemoteMcpServerConfig;

export interface AgentPluginMcpConfig {
  /** `mcpServers`' own member names, in declaration order — the identity a future admission record
   * pins to (`serverId` in the debate's own admission shape). Includes every declared key
   * regardless of whether that entry's transport shape validated — see {@link servers} for the
   * validated subset — so a discovery caller that only ever needed ids (`search_agent_plugin_local`)
   * sees no behavior change from before this module parsed transports at all. */
  readonly serverIds: readonly string[];
  /** Only the entries whose transport shape validated against one of the three closed variants.
   * A `serverId` present in {@link serverIds} but absent here declared an unrecognized `type` or was
   * missing a required field for the `type` it declared — fail-open per this file's header, not an
   * error for the whole `mcp.json`. */
  readonly servers: Readonly<Record<string, McpServerConfig>>;
}

export type ParseAgentPluginMcpConfigResult =
  | { readonly ok: true; readonly config: AgentPluginMcpConfig }
  | { readonly ok: false; readonly errors: readonly string[] };

/** `value` narrowed to an object whose own values are all strings, or `undefined` for anything
 *  else — the shared shape `env`/`headers` both need. */
function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return isJsonObject(value) && Object.values(value).every((entry) => typeof entry === "string");
}

/**
 * Validates one `type: "stdio"` server entry.
 *
 * @returns The parsed config, or `null` for any shape violation (missing/empty `command`, a
 * malformed `args`/`env`/`cwd`, or an `env` setting a reserved key) — the caller folds `null` into
 * "this one server is excluded from `servers`", never into a whole-file rejection.
 * @complexity O(k) in the entry's own field count.
 */
function parseStdioServerConfig(raw: Readonly<Record<string, unknown>>): StdioMcpServerConfig | null {
  if (typeof raw.command !== "string" || raw.command.length === 0) return null;

  const { args, env, cwd } = raw;
  if (args !== undefined && !(Array.isArray(args) && args.every((entry): entry is string => typeof entry === "string"))) return null;
  if (env !== undefined && (!isStringRecord(env) || RESERVED_STDIO_ENV_KEYS.some((key) => Object.hasOwn(env, key)))) return null;
  if (cwd !== undefined && typeof cwd !== "string") return null;

  return {
    type: "stdio",
    command: raw.command,
    ...(args !== undefined ? { args: args as readonly string[] } : {}),
    ...(env !== undefined ? { env } : {}),
    ...(cwd !== undefined ? { cwd } : {}),
  };
}

/**
 * Validates one `type: "streamable-http"` or `type: "sse"` server entry — the two remote transports
 * share this one implementation because they share every field (see {@link RemoteMcpServerConfig}).
 *
 * @returns The parsed config, or `null` for any shape violation. Same fold-into-exclusion contract
 * as {@link parseStdioServerConfig}.
 * @complexity O(k) in the entry's own field count.
 */
function parseRemoteServerConfig(type: "streamable-http" | "sse", raw: Readonly<Record<string, unknown>>): RemoteMcpServerConfig | null {
  if (typeof raw.url !== "string" || raw.url.length === 0) return null;

  const { headers, tovuAuthMode } = raw;
  if (headers !== undefined && !isStringRecord(headers)) return null;
  if (tovuAuthMode !== undefined && tovuAuthMode !== "oauth" && tovuAuthMode !== "none") return null;

  return {
    type,
    url: raw.url,
    ...(headers !== undefined ? { headers } : {}),
    ...(tovuAuthMode !== undefined ? { tovuAuthMode } : {}),
  };
}

/** Dispatches one raw `mcpServers` entry to its transport's validator by `type`, or `null` for a
 *  non-object entry or a `type` outside {@link MCP_SERVER_TRANSPORTS}. */
function parseMcpServerConfig(value: unknown): McpServerConfig | null {
  if (!isJsonObject(value)) return null;
  if (value.type === "stdio") return parseStdioServerConfig(value);
  if (value.type === "streamable-http" || value.type === "sse") return parseRemoteServerConfig(value.type, value);
  return null;
}

/**
 * Validates an already-`JSON.parse`d `mcp.json` value against the v1.0.0 top-level shape:
 * `{ "$schema": ..., "mcpServers": { "<server-id>": {...} } }`, then validates each declared
 * server's own transport shape (see this file's header for the three variants).
 *
 * @throws Nothing — see {@link parseAgentPluginManifest}.
 * @complexity O(s) in the number of declared servers.
 */
export function parseAgentPluginMcpConfig(value: unknown): ParseAgentPluginMcpConfigResult {
  if (!isJsonObject(value)) return { ok: false, errors: ["mcp.json must be a JSON object"] };

  const raw = value;
  const errors: string[] = [];

  if (raw.$schema !== MCP_SCHEMA_1_0_0) {
    errors.push(`mcp.json '$schema' must be '${MCP_SCHEMA_1_0_0}', got '${String(raw.$schema)}'`);
  }

  const mcpServers = raw.mcpServers;
  if (typeof mcpServers !== "object" || mcpServers === null || Array.isArray(mcpServers)) {
    errors.push("mcp.json 'mcpServers' is required and must be an object");
  }

  if (errors.length > 0) return { ok: false, errors };

  const entries = Object.entries(mcpServers as Record<string, unknown>);
  const servers: Record<string, McpServerConfig> = {};
  for (const [serverId, rawServer] of entries) {
    const parsed = parseMcpServerConfig(rawServer);
    if (parsed) servers[serverId] = parsed;
  }

  return { ok: true, config: { serverIds: entries.map(([serverId]) => serverId), servers } };
}
