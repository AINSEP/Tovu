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
 *   `mcpServers` MUST be an object whose member names identify servers. This module does not
 *   validate the per-transport (`stdio` / `streamable-http` / `sse`) field shape inside each server
 *   entry: nothing in this feature slice launches an MCP server yet (see `capability-projection.ts`
 *   — every MCP capability descriptor is `execute: { kind: "unavailable" }` by construction), so a
 *   transport-shape validator would be speculative generality with no caller to exercise it against.
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

/**
 * Validates an already-`JSON.parse`d `plugin.json` value against the v1.0.0 grammar.
 *
 * @throws Nothing — every failure is reported via the returned `errors`, matching this codebase's
 * own convention for expected validation outcomes (`plugin-runtime/manifest.ts`,
 * `plugin-runtime/discovery.ts`).
 * @complexity O(1) — a fixed, small number of field checks.
 */
export function parseAgentPluginManifest(value: unknown): ParseAgentPluginManifestResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: ["plugin.json must be a JSON object"] };
  }

  const raw = value as Readonly<Record<string, unknown>>;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (raw.$schema !== PLUGIN_SCHEMA_1_0_0) {
    errors.push(`plugin.json '$schema' must be '${PLUGIN_SCHEMA_1_0_0}', got '${String(raw.$schema)}'`);
  }

  const name = typeof raw.name === "string" ? raw.name : undefined;
  if (name === undefined) {
    errors.push("plugin.json 'name' is required and must be a string");
  } else if (name.length === 0 || name.length > MAX_NAME_LENGTH || !NAME_PATTERN.test(name)) {
    errors.push(
      `plugin.json 'name' ('${name}') must be 1-${MAX_NAME_LENGTH} lowercase alphanumeric/hyphen/period characters, ` +
        "start and end alphanumeric, with no consecutive delimiters",
    );
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_MANIFEST_KEYS.has(key)) warnings.push(`unrecognized plugin.json field '${key}' (ignored per spec)`);
  }

  if (errors.length > 0) return { ok: false, errors };

  const manifest: AgentPluginManifest = {
    name: name as string,
    version: typeof raw.version === "string" ? raw.version : undefined,
    description: typeof raw.description === "string" ? raw.description : undefined,
    author: typeof raw.author === "string" ? raw.author : undefined,
    license: typeof raw.license === "string" ? raw.license : undefined,
    keywords: Array.isArray(raw.keywords) ? raw.keywords.filter((k): k is string => typeof k === "string") : undefined,
  };
  return { ok: true, manifest, warnings };
}

export interface AgentPluginMcpConfig {
  /** `mcpServers`' own member names, in declaration order — the identity a future admission record
   * pins to (`serverId` in the debate's own admission shape). This module does not parse each
   * entry's transport fields; see this file's header for why. */
  readonly serverIds: readonly string[];
}

export type ParseAgentPluginMcpConfigResult =
  | { readonly ok: true; readonly config: AgentPluginMcpConfig }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Validates an already-`JSON.parse`d `mcp.json` value against the v1.0.0 top-level shape:
 * `{ "$schema": ..., "mcpServers": { "<server-id>": {...} } }`.
 *
 * @throws Nothing — see {@link parseAgentPluginManifest}.
 * @complexity O(s) in the number of declared servers.
 */
export function parseAgentPluginMcpConfig(value: unknown): ParseAgentPluginMcpConfigResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: ["mcp.json must be a JSON object"] };
  }

  const raw = value as Readonly<Record<string, unknown>>;
  const errors: string[] = [];

  if (raw.$schema !== MCP_SCHEMA_1_0_0) {
    errors.push(`mcp.json '$schema' must be '${MCP_SCHEMA_1_0_0}', got '${String(raw.$schema)}'`);
  }

  const mcpServers = raw.mcpServers;
  if (typeof mcpServers !== "object" || mcpServers === null || Array.isArray(mcpServers)) {
    errors.push("mcp.json 'mcpServers' is required and must be an object");
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, config: { serverIds: Object.keys(mcpServers as Record<string, unknown>) } };
}
