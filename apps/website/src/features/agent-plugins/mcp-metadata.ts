/**
 * @file Historical manifest.ts rationale. Shared parsing now lives in Jini; this adapter preserves
 * the Tovu metadata contract from `parseAgentPluginManifest()` / `parseAgentPluginMcpConfig()` — the Agent Plugins v1.0.0
 * `plugin.json` / `mcp.json` grammar (agent-plugins.org/specification), verified against the live
 * spec rather than inferred from an example manifest.
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
 *   Tovu-specific metadata in `plugin.json`'s `extensions.tovu.mcpServers[serverId]`, keeping
 *   `mcp.json` transport entries closed per §7.2.1. Legacy auth and sign-in defaults in MCP
 *   entries remain readable for existing packages, but cannot supply operator read trust.
 *   `tovuAuthMode: "oauth" | "none"` selects client auth; absent defaults to "none".
 *   `tovuDefaultTools: { allow?, write?, read? }` names sign-in grants and reviewed read tools.
 *   `write` requires `allow` and must be its subset; `read` must be a subset when `allow` is
 *   present. A read-only declaration without `allow` leaves sign-in grants unchanged.
 *   Remote hints may veto a read declaration but never supply it. A third,
 *   `tovuTokenAuth: { helpUrl, probeUrl }`, offers a pasted access token as the sign-in fallback
 *   (`access-token-tool.ts`). A fourth, `tovuRenamedTools: { oldName: newName }`, carries saved tool
 *   selections across a vendor's tool rename (`apply-tool-renames.ts`). A malformed per-server entry
 *   (wrong/missing `type`, missing required field) does not fail the whole file — see
 *   `ParseAgentPluginMcpConfigResult`'s own doc for the fail-open contract this preserves.
 *
 * Architectural role:
 * Pure, no-I/O parsing over an already-`JSON.parse`d value — mirrors `plugin-runtime/manifest.ts`'s
 * own "receives a JS value, never a file path or raw bytes" contract. `install.ts` is the only
 * caller that reads the file and hands the parsed value here.
 */
/** Tovu metadata adapter for the deleted manifest.ts fork. Jini owns the pinned manifest and
 * transport grammar; Tovu retains the legacy wire names and the operator-read trust boundary.
 */
import { parseAgentPluginMcpConfig as parseMcpConfig } from "@jini-ai/agent-plugins/lifecycle";
import type { AgentPluginDefaultTools, AgentPluginTokenAuth, StdioMcpServerConfig } from "@jini-ai/agent-plugins/lifecycle";

export interface RemoteMcpServerConfig {
  readonly type: "streamable-http" | "sse";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly tovuAuthMode?: "oauth" | "none";
  readonly tovuDefaultTools?: AgentPluginDefaultTools;
  readonly tovuTokenAuth?: AgentPluginTokenAuth;
  readonly tovuRenamedTools?: Readonly<Record<string, string>>;
}
export type McpServerConfig = StdioMcpServerConfig | RemoteMcpServerConfig;
export interface AgentPluginMcpConfig {
  readonly serverIds: readonly string[];
  readonly servers: Readonly<Record<string, McpServerConfig>>;
}
export type ParseAgentPluginMcpConfigResult =
  | { readonly ok: true; readonly config: AgentPluginMcpConfig }
  | { readonly ok: false; readonly errors: readonly string[] };

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Legacy MCP entries still supply auth and sign-in grants, but cannot authorize operator reads.
 * Only plugin.json's extensions.tovu.mcpServers[serverId].tovuDefaultTools can declare read trust.
 * Do not validate here: Jini must exclude the server for every malformed list, URL or rename map.
 * @complexity O(n) in the bounded default-tools object.
 */
function readTovuServerMetadata({ server, value }: { readonly server: Readonly<Record<string, unknown>>; readonly value: Readonly<Record<string, unknown>> }) {
  const legacyDefaults = isObject(server.tovuDefaultTools)
    ? Object.fromEntries(Object.entries(server.tovuDefaultTools).filter(([key]) => key !== "read"))
    : server.tovuDefaultTools;
  return {
    authMode: value.tovuAuthMode ?? server.tovuAuthMode,
    defaultTools: value.tovuDefaultTools ?? legacyDefaults,
    tokenAuth: server.tovuTokenAuth,
    renamedTools: server.tovuRenamedTools,
  };
}

/** Translate host wire names around the shared parser, retaining all declared ids and only valid
 * transport configs. Null-prototype output prevents hostile server ids mutating object prototypes.
 * @complexity O(s + n) in servers and their bounded metadata lists.
 */
export function parseAgentPluginMcpConfig(
  { value }: { readonly value: unknown },
  optional: { readonly pluginManifest?: unknown } = {},
): ParseAgentPluginMcpConfigResult {
  const parsed = parseMcpConfig({ value, extensionNamespace: "tovu" }, { ...optional, readServerMetadata: readTovuServerMetadata });
  if (!parsed.ok) return parsed;
  const servers: Record<string, McpServerConfig> = Object.create(null);
  for (const [id, server] of Object.entries(parsed.config.servers)) {
    if (server.type === "stdio") { servers[id] = server; continue; }
    const { authMode, defaultTools, tokenAuth, renamedTools, ...transport } = server;
    servers[id] = {
      ...transport,
      ...(authMode !== undefined ? { tovuAuthMode: authMode } : {}),
      ...(defaultTools !== undefined ? { tovuDefaultTools: defaultTools } : {}),
      ...(tokenAuth !== undefined ? { tovuTokenAuth: tokenAuth } : {}),
      ...(renamedTools !== undefined ? { tovuRenamedTools: renamedTools } : {}),
    };
  }
  return { ok: true, config: { serverIds: parsed.config.serverIds, servers } };
}
